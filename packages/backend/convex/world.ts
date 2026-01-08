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
      const type = resolveTileType(x, y, height, rng);
      const resource = determineResource(type, rng);
      const tile: TileDoc = {
        type,
        visibility: [],
      };
      if (resource) {
        tile.resource = resource;
      }
      // Add clouds in sky
      if (type === "sky" && rng() < 0.02) {
        tile.type = "cloud";
      }
      // Add water bodies on surface-level tiles
      if ((type === "surface" || type === "grass" || type === "sand") && rng() < 0.05) {
        tile.type = "water";
        // Remove resource if water overrides it
        tile.resource = undefined;
      }
      // Add ruins - rare, surface/underground only
      if ((type === "surface" || type === "grass" || type === "sand" || type === "dirt" || type === "cavern") && tile.type !== "water" && rng() < 0.015) {
        tile.type = "ruins";
        // Ruins might override resource, or exist alongside?
        // Let's say ruins override natural resources for simplicity
        tile.resource = undefined;
      }
      map.push(tile);
    }
  }

  return map;
};

const resolveTileType = (x: number, y: number, height: number, rng: () => number) => {
  // Sky layer (top 8 rows)
  if (y < SKY_ROWS) {
    return "sky";
  }
  
  // Surface layer (1 row)
  if (y < SKY_ROWS + SURFACE_ROWS) {
    // Mix of surface, grass, and occasional sand
    const r = rng();
    if (r < 0.5) return "grass";
    if (r < 0.85) return "surface";
    return "sand";
  }
  
  // Bedrock layer (bottom row)
  if (y >= height - BEDROCK_ROWS) {
    return "bedrock";
  }
  
  // Magma layer (just above bedrock for large worlds)
  if (y >= height - BEDROCK_ROWS - 2 && height >= 24) {
    if (rng() < 0.4) return "magma";
    return "deepstone";
  }
  
  const depth = y - (SKY_ROWS + SURFACE_ROWS);
  
  // Shallow layer (rows 0-3): dirt with occasional sand
  if (depth < 4) {
    if (rng() < 0.15) return "sand";
    return "dirt";
  }
  
  // Mid layer (rows 4-7): transition zone with caverns
  if (depth < 8) {
    const r = rng();
    if (r < 0.15) return "cavern";
    if (r < 0.3) return "dirt";
    return "stone";
  }
  
  // Deep layer (rows 8-12): stone with crystal veins
  if (depth < 13) {
    const r = rng();
    if (r < 0.08) return "crystal";
    if (r < 0.15) return "cavern";
    return "stone";
  }
  
  // Very deep layer: deepstone dominant with rare crystals
  const r = rng();
  if (r < 0.12) return "crystal";
  if (r < 0.2) return "cavern";
  return "deepstone";
};

const determineResource = (type: string, rng: () => number) => {
  // Grass tiles - good for biomass
  if (type === "grass") {
    if (rng() < 0.25) {
      return "biomass";
    }
  }
  
  // Surface tiles - occasional biomass
  if (type === "surface") {
    if (rng() < 0.15) {
      return "biomass";
    }
    if (rng() < 0.05) {
      return "water";
    }
  }
  
  // Sand tiles - occasional ore deposits
  if (type === "sand") {
    if (rng() < 0.10) {
      return "ore";
    }
  }
  
  // Dirt tiles - good for biomass, some water
  if (type === "dirt") {
    if (rng() < 0.20) {
      return "biomass";
    }
    if (rng() < 0.08) {
      return "water";
    }
  }
  
  // Stone tiles - ore and rare flux
  if (type === "stone") {
    if (rng() < 0.25) {
      return "ore";
    }
    if (rng() < 0.06) {
      return "flux";
    }
  }
  
  // Crystal tiles - high flux yield
  if (type === "crystal") {
    if (rng() < 0.60) {
      return "flux";
    }
    if (rng() < 0.20) {
      return "ore";
    }
  }
  
  // Cavern tiles - mixed resources
  if (type === "cavern") {
    if (rng() < 0.25) {
      return "ore";
    }
    if (rng() < 0.15) {
      return "flux";
    }
  }
  
  // Deep stone - rich ore and better flux
  if (type === "deepstone") {
    if (rng() < 0.30) {
      return "ore";
    }
    if (rng() < 0.12) {
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

