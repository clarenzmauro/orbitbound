import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getGameOrThrow } from "./lib/gameHelpers";
import { FACTION_DEFS, BUILDING_DEFS, TECH_DEFS } from "./lib/constants";
import type { FactionId } from "./lib/constants";
import { addResources } from "./lib/resources";
import type { ResourcePool } from "./lib/resources";
import { coordToIndex } from "./lib/grid";

/**
 * Game Lifecycle:
 * 1. generateWorld (world.ts) - Creates game in "lobby" status
 * 2. joinGame (players.ts) - Adds players to lobby
 * 3. startGame - Transitions to "active", applies faction bonuses
 * 4. [gameplay] - Turns, combat, building, etc.
 * 5. checkVictory - Called after actions to detect win conditions
 */

const MIN_PLAYERS = 1; // Allow single-player for testing
const MAX_PLAYERS = 8;

export const startGame = mutation({
  args: {
    gameId: v.id("games"),
    hostPlayerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const game = await getGameOrThrow(ctx, args.gameId);

    if (game.status !== "lobby") {
      throw new Error("Game has already started");
    }

    if (game.playerOrder.length < MIN_PLAYERS) {
      throw new Error(`Need at least ${MIN_PLAYERS} player(s) to start`);
    }
    if (game.playerOrder.length > MAX_PLAYERS) {
      throw new Error(`Maximum ${MAX_PLAYERS} players allowed`);
    }

    // Verify host is in the game
    if (!game.playerOrder.includes(args.hostPlayerId)) {
      throw new Error("Only a player in the game can start it");
    }

    // Apply faction starting bonuses to all players
    for (const playerId of game.playerOrder) {
      const player = await ctx.db.get(playerId);
      if (!player) continue;

      const faction = player.faction as FactionId;
      const factionDef = FACTION_DEFS[faction];

      if (factionDef?.startingBonus) {
        const updatedResources = addResources(player.resources, factionDef.startingBonus);
        await ctx.db.patch(playerId, { resources: updatedResources });
      }

      // Grant starting tech (Planetary Survival)
      if (!player.techUnlocked.includes("planetary_survival")) {
        await ctx.db.patch(playerId, {
          techUnlocked: [...player.techUnlocked, "planetary_survival"],
        });
      }
    }

    // Randomize turn order (or keep join order)
    const shuffledOrder = [...game.playerOrder];
    for (let i = shuffledOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledOrder[i], shuffledOrder[j]] = [shuffledOrder[j], shuffledOrder[i]];
    }

    await ctx.db.patch(game._id, {
      status: "active",
      turn: 1,
      activePlayerIndex: 0,
      playerOrder: shuffledOrder,
    });

    // Check if first player is AI
    const firstPlayerId = shuffledOrder[0];
    if (firstPlayerId) {
      const firstPlayer = await ctx.db.get(firstPlayerId);
      if (firstPlayer?.isAI) {
        // Schedule AI turn after a short delay
        await ctx.scheduler.runAfter(500, internal.ai.actions.runAITurn, {
          gameId: args.gameId,
          playerId: firstPlayerId,
        });
      }
    }

    return {
      status: "active",
      firstPlayer: shuffledOrder[0],
    };
  },
});

export const checkVictory = mutation({
  args: {
    gameId: v.id("games"),
  },
  handler: async (ctx, args) => {
    const game = await getGameOrThrow(ctx, args.gameId);

    if (game.status !== "active") {
      return { winner: null, reason: null };
    }

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    const alivePlayers = players.filter((p) => p.isAlive);

    // Victory Condition 1: Last player standing
    if (alivePlayers.length === 1) {
      const winner = alivePlayers[0];
      await ctx.db.patch(game._id, { status: "ended" });
      return {
        winner: winner._id,
        reason: "domination",
        message: `${winner.faction} achieved Domination Victory!`,
      };
    }

    // Victory Condition 2: All players eliminated (draw)
    if (alivePlayers.length === 0) {
      await ctx.db.patch(game._id, { status: "ended" });
      return {
        winner: null,
        reason: "draw",
        message: "All factions were eliminated. Draw!",
      };
    }

    // Victory Condition 3: The Ark Project (check for completed Silo + tech)
    for (const player of alivePlayers) {
      if (player.techUnlocked.includes("the_ark_project")) {
        const silos = await ctx.db
          .query("buildings")
          .withIndex("by_player", (q) => q.eq("playerId", player._id))
          .filter((q) => q.eq(q.field("type"), "silo"))
          .collect();

        if (silos.length > 0) {
          await ctx.db.patch(game._id, { status: "ended" });
          return {
            winner: player._id,
            reason: "ascension",
            message: `${player.faction} launched The Ark! Ascension Victory!`,
          };
        }
      }
    }

    return { winner: null, reason: null };
  },
});

export const getGameSummary = query({
  args: {
    gameId: v.id("games"),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) {
      throw new Error("Game not found");
    }

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    const playerSummaries = await Promise.all(
      players.map(async (player) => {
        const [units, buildings] = await Promise.all([
          ctx.db
            .query("units")
            .withIndex("by_player", (q) => q.eq("playerId", player._id))
            .collect(),
          ctx.db
            .query("buildings")
            .withIndex("by_player", (q) => q.eq("playerId", player._id))
            .collect(),
        ]);

        const factionDef = FACTION_DEFS[player.faction as FactionId];

        return {
          playerId: player._id,
          faction: player.faction,
          factionName: factionDef?.name ?? player.faction,
          isAlive: player.isAlive,
          resources: player.resources,
          unitCount: units.length,
          buildingCount: buildings.length,
          techCount: player.techUnlocked.length,
        };
      })
    );

    const activePlayer = game.playerOrder[game.activePlayerIndex];

    return {
      gameId: game._id,
      status: game.status,
      turn: game.turn,
      activePlayerId: activePlayer,
      width: game.width,
      height: game.height,
      players: playerSummaries,
    };
  },
});

export const listOpenGames = query({
  args: {},
  handler: async (ctx) => {
    const lobbies = await ctx.db
      .query("games")
      .withIndex("by_status", (q) => q.eq("status", "lobby"))
      .collect();

    return Promise.all(
      lobbies.map(async (game) => {
        const playerCount = game.playerOrder.length;
        return {
          gameId: game._id,
          playerCount,
          maxPlayers: MAX_PLAYERS,
          width: game.width,
          height: game.height,
          createdAt: game.createdAt,
        };
      })
    );
  },
});

export const forfeit = mutation({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) {
      throw new Error("Player not found");
    }

    if (!player.isAlive) {
      throw new Error("Player already eliminated");
    }

    // Delete all player's units
    const units = await ctx.db
      .query("units")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();

    for (const unit of units) {
      await ctx.db.delete(unit._id);
    }

    // Delete all player's buildings
    const buildings = await ctx.db
      .query("buildings")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();

    const game = await getGameOrThrow(ctx, player.gameId);
    const mapCopy = [...game.map];

    for (const building of buildings) {
      await ctx.db.delete(building._id);
      const idx = coordToIndex(game.width, building.x, building.y);
      mapCopy[idx] = {
        ...mapCopy[idx],
        buildingId: undefined,
        type: "surface",
      };
    }

    // Clear units from map
    for (const unit of units) {
      const idx = coordToIndex(game.width, unit.x, unit.y);
      mapCopy[idx] = {
        ...mapCopy[idx],
        unitId: undefined,
      };
    }

    await ctx.db.patch(game._id, { map: mapCopy });
    await ctx.db.patch(player._id, { isAlive: false });

    return { forfeited: true };
  },
});

