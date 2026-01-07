import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { assertPlayerTurn, getGameOrThrow, getPlayerOrThrow } from "./lib/gameHelpers";
import { clampY, coordToIndex, wrapX } from "./lib/grid";
import { addResources } from "./lib/resources";
import type { ResourcePool } from "./lib/resources";
import {
  BUILDING_DEFS,
  RESOURCE_YIELDS,
  FACTION_DEFS,
  COMBAT,
  UNIT_DEFS,
} from "./lib/constants";
import type { ResourceKey, FactionId } from "./lib/constants";

export const collectResource = mutation({
  args: {
    playerId: v.id("players"),
    x: v.number(),
    y: v.number(),
  },
  handler: async (ctx, args) => {
    const player = await getPlayerOrThrow(ctx, args.playerId);
    const game = await getGameOrThrow(ctx, player.gameId);
    assertPlayerTurn(game, player._id);

    const targetX = wrapX(args.x, game.width);
    const targetY = clampY(args.y, game.height);
    const idx = coordToIndex(game.width, targetX, targetY);
    const tile = game.map[idx];

    if (!tile.resource) {
      throw new Error("No resource on this tile");
    }

    const yieldInfo = RESOURCE_YIELDS[tile.resource];
    if (!yieldInfo) {
      throw new Error("Resource cannot be harvested");
    }

    const updatedResources = addResources(player.resources, {
      [yieldInfo.resource]: yieldInfo.amount,
    });

    const mapCopy = [...game.map];
    mapCopy[idx] = {
      ...mapCopy[idx],
      resource: undefined,
    };

    await Promise.all([
      ctx.db.patch(player._id, { resources: updatedResources }),
      ctx.db.patch(game._id, { map: mapCopy }),
    ]);
  },
});

export const endTurn = mutation({
  args: {
    gameId: v.id("games"),
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const game = await getGameOrThrow(ctx, args.gameId);
    assertPlayerTurn(game, args.playerId);

    if (game.playerOrder.length === 0) {
      throw new Error("No players in game");
    }

    const nextIndex = (game.activePlayerIndex + 1) % game.playerOrder.length;
    const nextPlayerId = game.playerOrder[nextIndex];
    if (!nextPlayerId) {
      throw new Error("Next player not found");
    }

    const nextPlayer = await getPlayerOrThrow(ctx, nextPlayerId);

    // Skip eliminated players
    if (!nextPlayer.isAlive) {
      // Find next alive player
      let searchIndex = nextIndex;
      let foundAlive = false;
      for (let i = 0; i < game.playerOrder.length; i++) {
        searchIndex = (nextIndex + i) % game.playerOrder.length;
        const checkPlayer = await ctx.db.get(game.playerOrder[searchIndex]!);
        if (checkPlayer?.isAlive) {
          foundAlive = true;
          break;
        }
      }
      
      if (!foundAlive) {
        throw new Error("No alive players remaining");
      }
      
      // Update to found player
      const alivePlayerId = game.playerOrder[searchIndex]!;
      const alivePlayer = await getPlayerOrThrow(ctx, alivePlayerId);
      
      const income = await calculateIncome(ctx, alivePlayer);
      const updatedResources = addResources(alivePlayer.resources, income);
      await applyFactionTurnEffects(ctx, game, alivePlayer);

      await Promise.all([
        ctx.db.patch(alivePlayerId, { resources: updatedResources }),
        resetPlayerUnits(ctx, alivePlayerId),
        ctx.db.patch(game._id, {
          activePlayerIndex: searchIndex,
          turn: searchIndex <= game.activePlayerIndex ? game.turn + 1 : game.turn,
          status: "active",
        }),
      ]);

      // If next player is AI, schedule their turn
      if (alivePlayer.isAI) {
        await ctx.scheduler.runAfter(100, internal.ai.actions.runAITurn, {
          gameId: args.gameId,
          playerId: alivePlayerId,
        });
      }

      return {
        activePlayerIndex: searchIndex,
        income,
        isAITurn: alivePlayer.isAI,
      };
    }

    // Calculate income with faction bonuses
    const income = await calculateIncome(ctx, nextPlayer);
    const updatedResources = addResources(nextPlayer.resources, income);

    // Apply faction turn-start effects
    await applyFactionTurnEffects(ctx, game, nextPlayer);

    await Promise.all([
      ctx.db.patch(nextPlayerId, { resources: updatedResources }),
      resetPlayerUnits(ctx, nextPlayerId),
      ctx.db.patch(game._id, {
        activePlayerIndex: nextIndex,
        turn: nextIndex === 0 ? game.turn + 1 : game.turn,
        status: "active",
      }),
    ]);

    // If next player is AI, schedule their turn
    if (nextPlayer.isAI) {
      await ctx.scheduler.runAfter(100, internal.ai.actions.runAITurn, {
        gameId: args.gameId,
        playerId: nextPlayerId,
      });
    }

    return {
      activePlayerIndex: nextIndex,
      income,
      isAITurn: nextPlayer.isAI,
    };
  },
});

/**
 * Calculate income with faction bonuses:
 * - United Terran: Mines produce +1 Ore per turn
 */
const calculateIncome = async (
  ctx: MutationCtx,
  player: Doc<"players">
): Promise<ResourcePool> => {
  const buildings = await ctx.db
    .query("buildings")
    .withIndex("by_player", (q) => q.eq("playerId", player._id))
    .collect();

  const total: ResourcePool = {
    biomass: 0,
    ore: 0,
    flux: 0,
  };

  const faction = player.faction as FactionId;
  const factionDef = FACTION_DEFS[faction];

  for (const building of buildings) {
    const def = BUILDING_DEFS[building.type];
    if (!def) continue;
    for (const key of Object.keys(def.income) as ResourceKey[]) {
      let value = def.income[key] ?? 0;

      // United Terran bonus: Mines produce +1 Ore
      if (
        factionDef?.trait === "deep_core_mining" &&
        building.type === "mine" &&
        key === "ore"
      ) {
        value += 1;
      }

      total[key] += value;
    }
  }

  return total;
};

/**
 * Apply faction-specific turn effects:
 * - Xeno Hive: Units heal +2 HP/turn when on Biomass tiles
 */
const applyFactionTurnEffects = async (
  ctx: MutationCtx,
  game: Doc<"games">,
  player: Doc<"players">
) => {
  const faction = player.faction as FactionId;
  const factionDef = FACTION_DEFS[faction];

  if (factionDef?.trait === "regeneration") {
    // Xeno Hive: Heal units on biomass resource tiles
    const units = await ctx.db
      .query("units")
      .withIndex("by_player", (q) => q.eq("playerId", player._id))
      .collect();

    for (const unit of units) {
      const idx = coordToIndex(game.width, unit.x, unit.y);
      const tile = game.map[idx];

      // Check if tile has biomass resource OR is adjacent to a farm
      const hasBiomass = tile.resource === "biomass" || tile.type === "farm";

      if (hasBiomass) {
        const unitDef = UNIT_DEFS[unit.type];
        const maxHp = unitDef?.hp ?? unit.hp;
        const newHp = Math.min(unit.hp + COMBAT.REGEN_HP_PER_TURN, maxHp);

        if (newHp > unit.hp) {
          await ctx.db.patch(unit._id, { hp: newHp });
        }
      }
    }
  }
};

const resetPlayerUnits = async (ctx: MutationCtx, playerId: Id<"players">) => {
  const units = await ctx.db
    .query("units")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .collect();
  await Promise.all(
    units.map((unit) => {
      // Marines become entrenched if they didn't use all their moves (i.e., stayed still)
      const becomeEntrenched =
        unit.type === "marine" && unit.movesLeft === unit.maxMoves;

      return ctx.db.patch(unit._id, {
        movesLeft: unit.maxMoves,
        entrenched: becomeEntrenched ? true : undefined,
      });
    })
  );
};

