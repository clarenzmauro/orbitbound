import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  games: defineTable({
    status: v.string(), // lobby | active | ended
    turn: v.number(),
    activePlayerIndex: v.number(),
    width: v.number(),
    height: v.number(),
    seed: v.number(),
    map: v.array(
      v.object({
        type: v.string(), // dirt, stone, bedrock, sky, water, city, etc.
        resource: v.optional(v.string()),
        buildingId: v.optional(v.id("buildings")),
        unitId: v.optional(v.id("units")),
        visibility: v.array(v.id("players")),
      }),
    ),
    playerOrder: v.array(v.id("players")),
    createdAt: v.number(),
  }).index("by_status", ["status"]),

  players: defineTable({
    gameId: v.id("games"),
    userId: v.optional(v.string()), // Clerk ID, optional for bots
    faction: v.string(),
    resources: v.object({
      biomass: v.number(),
      ore: v.number(),
      flux: v.number(),
    }),
    techUnlocked: v.array(v.string()),
    isAlive: v.boolean(),
    order: v.number(),
    // AI player fields
    isAI: v.optional(v.boolean()),
    aiDifficulty: v.optional(v.union(
      v.literal("easy"),
      v.literal("medium"),
      v.literal("hard")
    )),
    aiName: v.optional(v.string()), // Display name for AI player
  })
    .index("by_game", ["gameId"])
    .index("by_user_game", ["userId", "gameId"]),

  units: defineTable({
    gameId: v.id("games"),
    playerId: v.id("players"),
    type: v.string(), // scout, miner, tank, etc.
    x: v.number(),
    y: v.number(),
    hp: v.number(),
    movesLeft: v.number(),
    maxMoves: v.number(),
    entrenched: v.optional(v.boolean()), // Marine entrench ability
  })
    .index("by_game", ["gameId"])
    .index("by_player", ["playerId"]),

  buildings: defineTable({
    gameId: v.id("games"),
    playerId: v.id("players"),
    type: v.string(), // city, farm, barracks, etc.
    x: v.number(),
    y: v.number(),
    hp: v.number(),
  })
    .index("by_game", ["gameId"])
    .index("by_player", ["playerId"]),
});
