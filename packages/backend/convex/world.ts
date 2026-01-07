import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { BEDROCK_ROWS, MIN_HEIGHT, MIN_WIDTH, SKY_ROWS, SURFACE_ROWS } from "./lib/constants";

type GameDoc = Doc<"games">;
type TileDoc = GameDoc["map"][number];

export const generateWorld = mutation({
  args: {
    width: v.number(),
    height: v.number(),
    seed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.width < MIN_WIDTH) {
      throw new Error(`World width must be >= ${MIN_WIDTH} tiles`);
    }
    if (args.height < MIN_HEIGHT) {
      throw new Error(`World height must be >= ${MIN_HEIGHT} tiles`);
    }

    const seed = args.seed ?? Date.now();
    const rng = mulberry32(seed);
    const map = buildMap(args.width, args.height, rng);

    const gameId = await ctx.db.insert("games", {
      status: "lobby",
      turn: 0,
      activePlayerIndex: 0,
      width: args.width,
      height: args.height,
      seed,
      map,
      playerOrder: [],
      createdAt: Date.now(),
    });

    return gameId;
  },
});

export const getGameState = query({
  args: {
    gameId: v.id("games"),
    playerId: v.optional(v.id("players")),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) {
      throw new Error("Game not found");
    }

    const [players, units, buildings] = await Promise.all([
      ctx.db
        .query("players")
        .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
        .collect(),
      ctx.db
        .query("units")
        .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
        .collect(),
      ctx.db
        .query("buildings")
        .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
        .collect(),
    ]);

    const filteredMap =
      args.playerId !== undefined
        ? filterMapForPlayer(game.map, args.playerId)
        : game.map;

    return {
      game: {
        ...game,
        map: filteredMap,
      },
      players,
      units,
      buildings,
    };
  },
});

const buildMap = (width: number, height: number, rng: () => number) => {
  const map: TileDoc[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const type = resolveTileType(x, y, height);
      const resource = determineResource(type, rng);
      const tile: TileDoc = {
        type,
        visibility: [],
      };
      if (resource) {
        tile.resource = resource;
      }
      if (type === "sky" && rng() < 0.02) {
        tile.type = "cloud";
      }
      if (type === "surface" && rng() < 0.05) {
        tile.type = "water";
      }
      map.push(tile);
    }
  }

  return map;
};

const resolveTileType = (x: number, y: number, height: number) => {
  if (y < SKY_ROWS) {
    return "sky";
  }
  if (y < SKY_ROWS + SURFACE_ROWS) {
    return "surface";
  }
  if (y >= height - BEDROCK_ROWS) {
    return "bedrock";
  }

  const depth = y - (SKY_ROWS + SURFACE_ROWS);
  if (depth < 4) {
    return "dirt";
  }
  if (depth < 10) {
    return "stone";
  }
  return "deepstone";
};

const determineResource = (type: string, rng: () => number) => {
  if (type === "dirt") {
    if (rng() < 0.1) {
      return "biomass";
    }
    if (rng() < 0.03) {
      return "water";
    }
  }
  if (type === "stone" || type === "deepstone") {
    if (rng() < 0.12) {
      return "ore";
    }
    if (rng() < 0.04) {
      return "flux";
    }
  }
  return undefined;
};

const filterMapForPlayer = (map: TileDoc[], playerId: Id<"players">) =>
  map.map((tile) => {
    // If the current player has revealed this tile, show it as-is
    if (tile.visibility.some((id) => id === playerId)) {
      return tile;
    }
    // Otherwise, return fog (don't leak info about other players' visibility)
    return {
      type: "fog" as const,
      visibility: [] as Id<"players">[],
    };
  });

const mulberry32 = (seed: number) => {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let m = Math.imul(t ^ (t >>> 15), t | 1);
    m ^= m + Math.imul(m ^ (m >>> 7), m | 61);
    return ((m ^ (m >>> 14)) >>> 0) / 4294967296;
  };
};

