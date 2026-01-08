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
  TERRAIN_DEFS,
  WEATHER_DEFS,
} from "./lib/constants";
import type { ResourceKey, FactionId, WeatherType } from "./lib/constants";

import { findNearestFog } from "./lib/pathfinding";
import { revealAround } from "./lib/vision";
import { directionToDelta } from "./units";

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

    // ─── Auto-Explore Logic ──────────────────────────────────────────────
    // Process auto-exploring units for the current player before ending turn
    const units = await ctx.db
      .query("units")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();

    let mapUpdated = false;
    const mapCopy = [...game.map];
    const unitsToPatch = [];

    for (const unit of units) {
      if (unit.autoExplore && unit.movesLeft > 0) {
        const unitDef = UNIT_DEFS[unit.type];
        if (!unitDef) continue;
        
        let moves = unit.movesLeft;
        let currentX = unit.x;
        let currentY = unit.y;
        
        // Try to use all moves to explore
        while (moves > 0) {
          // Find direction to nearest fog
          const nextDir = findNearestFog(
            currentX,
            currentY,
            mapCopy,
            game.width,
            game.height,
            args.playerId,
            unitDef.canFly
          );

          if (!nextDir) break; // No reachable fog or path found

          const { dx, dy } = directionToDelta(nextDir);
          const nextX = wrapX(currentX + dx, game.width);
          const nextY = clampY(currentY + dy, game.height);

          const fromIdx = coordToIndex(game.width, currentX, currentY);
          const toIdx = coordToIndex(game.width, nextX, nextY);
          
          const targetTile = mapCopy[toIdx];
          const terrainDef = TERRAIN_DEFS[targetTile.type] ?? TERRAIN_DEFS.surface;
          const moveCost = unitDef.canFly ? 1 : terrainDef.moveCost;

          // Check if we can afford the move
          if (moves < moveCost) break;

          // Check occupation (simple check against map state)
          // Note: Does not account for other units moving in this loop unless we update mapCopy unitIds
          if (targetTile.unitId && targetTile.unitId !== unit._id) break;

          // Execute move locally
          mapCopy[fromIdx] = { ...mapCopy[fromIdx], unitId: undefined };
          mapCopy[toIdx] = { ...mapCopy[toIdx], unitId: unit._id };
          
          currentX = nextX;
          currentY = nextY;
          moves -= moveCost;
          mapUpdated = true;

          // Reveal vision
          if (unitDef.vision) {
            revealAround({ ...game, map: mapCopy }, mapCopy, args.playerId, currentX, currentY, unitDef.vision);
          }
        }

        // If unit moved, queue update
        if (currentX !== unit.x || currentY !== unit.y) {
          unitsToPatch.push(
            ctx.db.patch(unit._id, {
              x: currentX,
              y: currentY,
              movesLeft: 0, // Consumed moves for turn (or set to 'moves' but we reset them after anyway)
            })
          );
        }
      }
    }

    // Apply map updates if any exploration happened
    if (mapUpdated) {
      await ctx.db.patch(game._id, { map: mapCopy });
      await Promise.all(unitsToPatch);
    }
    // ─────────────────────────────────────────────────────────────────────

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

    // ─────────────────────────────────────────────────────────────────────
    // Weather Cycle
    // ─────────────────────────────────────────────────────────────────────
    // Only process weather when the round ends (i.e., back to Player 0)
    if (nextIndex === 0) {
      if (game.activeWeather) {
        // Decrease duration
        const nextDuration = game.activeWeather.turnsRemaining - 1;
        if (nextDuration <= 0) {
          // Weather clears
           await ctx.db.patch(game._id, { activeWeather: undefined });
        } else {
           await ctx.db.patch(game._id, { activeWeather: { ...game.activeWeather, turnsRemaining: nextDuration } });
        }
      } else {
        // Chance to start new weather (20% after turn 5)
        if (game.turn >= 5 && Math.random() < 0.2) {
          const weatherTypes = Object.keys(WEATHER_DEFS) as WeatherType[];
          const type = weatherTypes[Math.floor(Math.random() * weatherTypes.length)];
          const def = WEATHER_DEFS[type];
          if (!def) throw new Error("Weather def not found"); // Should not happen
          
          const duration = Math.floor(Math.random() * (def.duration[1] - def.duration[0] + 1)) + def.duration[0];
          
          await ctx.db.patch(game._id, {
            activeWeather: { type, turnsRemaining: duration }
          });
        }
      }

      // ─────────────────────────────────────────────────────────────────────
      // Weather Effects (Acid Rain Damage)
      // ─────────────────────────────────────────────────────────────────────
      if (game.activeWeather?.type === "acid_rain") {
        const allUnits = await ctx.db.query("units").collect();
        const damagePromises = [];
        
        for (const u of allUnits) {
          const tileIdx = coordToIndex(game.width, u.x, u.y);
          const tile = game.map[tileIdx];
          
          // Units safe in cities/bunkers
          if (tile.buildingId) {
             const building = await ctx.db.get(tile.buildingId);
             if (building && (building.type === "city" || building.type === "bunker")) continue;
          }
          
          // Apply Damage
          damagePromises.push(ctx.db.patch(u._id, { hp: Math.max(1, u.hp - 2) }));
        }
        await Promise.all(damagePromises);
      }
    }
    // ─────────────────────────────────────────────────────────────────────


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

    if (building.isConstructing) continue;

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

  // Weather Modifier: Solar Flare
  const game = await ctx.db.get(player.gameId);
  if (game?.activeWeather?.type === "solar_flare") {
    total.flux = Math.floor(total.flux * 1.5);
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

