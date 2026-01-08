import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { STARTING_RESOURCES, UNIT_DEFS, SKY_ROWS, FACTIONS } from "./lib/constants";
import { coordToIndex } from "./lib/grid";
import { getGameOrThrow } from "./lib/gameHelpers";
import { revealAround } from "./lib/vision";
import { AI_NAMES } from "./ai/constants";

export const joinGame = mutation({
  args: {
    gameId: v.id("games"),
    faction: v.string(),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const game = await getGameOrThrow(ctx, args.gameId);
    if (game.status !== "lobby") {
      throw new Error("Game is no longer accepting players");
    }

    const existingPlayers = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    if (
      args.userId &&
      existingPlayers.some((player) => player.userId && player.userId === args.userId)
    ) {
      throw new Error("User already joined this game");
    }

    const playerOrder = existingPlayers.length;

    const playerId = await ctx.db.insert("players", {
      gameId: args.gameId,
      userId: args.userId,
      faction: args.faction,
      resources: { ...STARTING_RESOURCES },
      techUnlocked: [],
      isAlive: true,
      order: playerOrder,
    });

    const nextMap = await spawnSettler(ctx, game, playerId);

    await ctx.db.patch(game._id, {
      map: nextMap,
      playerOrder: [...game.playerOrder, playerId],
    });

    return playerId;
  },
});

export const listPlayers = query({
  args: {
    gameId: v.id("games"),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
  },
});

const spawnSettler = async (ctx: MutationCtx, game: Doc<"games">, playerId: Id<"players">) => {
  const { hp, maxMoves, vision } = UNIT_DEFS.settler;
  const mapCopy = [...game.map];

  const spawn = findSpawnTile(game, mapCopy);
  if (!spawn) {
    throw new Error("No available spawn tiles");
  }

  const unitId = await ctx.db.insert("units", {
    gameId: game._id,
    playerId,
    type: "settler",
    x: spawn.x,
    y: spawn.y,
    hp,
    movesLeft: maxMoves,
    maxMoves,
  });

  const spawnIndex = coordToIndex(game.width, spawn.x, spawn.y);
  const currentVisibility = mapCopy[spawnIndex].visibility;
  const alreadyVisible = currentVisibility.some((id) => id === playerId);
  mapCopy[spawnIndex] = {
    ...mapCopy[spawnIndex],
    unitId,
    visibility: alreadyVisible ? currentVisibility : [...currentVisibility, playerId],
  };

  revealAround(game, mapCopy, playerId, spawn.x, spawn.y, vision);

  return mapCopy;
};

const findSpawnTile = (game: Doc<"games">, map: Doc<"games">["map"]) => {
  const preferredY = SKY_ROWS;
  
  // Collect all valid spawn tiles first
  const validSpawns: { x: number; y: number }[] = [];
  
  for (let x = 0; x < game.width; x++) {
    const idx = coordToIndex(game.width, x, preferredY);
    const tile = map[idx];
    if (
      (tile.type === "surface" || tile.type === "dirt") &&
      tile.unitId === undefined &&
      tile.buildingId === undefined
    ) {
      validSpawns.push({ x, y: preferredY });
    }
  }
  
  // Return a random valid spawn tile
  if (validSpawns.length === 0) return undefined;
  const randomIndex = Math.floor(Math.random() * validSpawns.length);
  return validSpawns[randomIndex];
};

/**
 * Add an AI player to a game lobby
 */
export const addAIPlayer = mutation({
  args: {
    gameId: v.id("games"),
    difficulty: v.union(v.literal("easy"), v.literal("medium"), v.literal("hard")),
  },
  handler: async (ctx, args) => {
    const game = await getGameOrThrow(ctx, args.gameId);
    if (game.status !== "lobby") {
      throw new Error("Game is no longer accepting players");
    }

    const existingPlayers = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    // Limit max players
    if (existingPlayers.length >= 4) {
      throw new Error("Maximum players reached");
    }

    // Pick a random faction that's not already taken
    const takenFactions = new Set(existingPlayers.map((p) => p.faction));
    const availableFactions = FACTIONS.filter((f) => !takenFactions.has(f));
    const faction = availableFactions[Math.floor(Math.random() * availableFactions.length)] || "terran_corp";

    // Pick a random AI name that's not already used
    const takenNames = new Set(existingPlayers.filter((p) => p.aiName).map((p) => p.aiName));
    const availableNames = AI_NAMES.filter((n) => !takenNames.has(n));
    const aiName = availableNames[Math.floor(Math.random() * availableNames.length)] || `AI-${existingPlayers.length}`;

    const playerOrder = existingPlayers.length;

    const playerId = await ctx.db.insert("players", {
      gameId: args.gameId,
      userId: undefined, // AI players don't have user IDs
      faction,
      resources: { ...STARTING_RESOURCES },
      techUnlocked: [],
      isAlive: true,
      order: playerOrder,
      isAI: true,
      aiDifficulty: args.difficulty,
      aiName,
    });

    const nextMap = await spawnSettler(ctx, game, playerId);

    await ctx.db.patch(game._id, {
      map: nextMap,
      playerOrder: [...game.playerOrder, playerId],
    });

    return playerId;
  },
});

/**
 * Remove an AI player from a game lobby
 */
export const removeAIPlayer = mutation({
  args: {
    gameId: v.id("games"),
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const game = await getGameOrThrow(ctx, args.gameId);
    if (game.status !== "lobby") {
      throw new Error("Can only remove AI players from lobby");
    }

    const player = await ctx.db.get(args.playerId);
    if (!player || player.gameId !== args.gameId) {
      throw new Error("Player not found in this game");
    }
    if (!player.isAI) {
      throw new Error("Can only remove AI players");
    }

    // Remove player's units
    const units = await ctx.db
      .query("units")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();
    
    const mapCopy = [...game.map];
    for (const unit of units) {
      const idx = coordToIndex(game.width, unit.x, unit.y);
      mapCopy[idx] = { ...mapCopy[idx], unitId: undefined };
      await ctx.db.delete(unit._id);
    }

    // Remove from player order
    const newPlayerOrder = game.playerOrder.filter((id) => id !== args.playerId);

    await ctx.db.patch(game._id, {
      map: mapCopy,
      playerOrder: newPlayerOrder,
    });

    // Delete the player
    await ctx.db.delete(args.playerId);
  },
});

