// Internal queries for AI decision making

import { v } from "convex/values";
import { internalQuery } from "../_generated/server";

export const getGameForAI = internalQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    return await ctx.db.get(gameId);
  },
});

export const getPlayerForAI = internalQuery({
  args: { playerId: v.id("players") },
  handler: async (ctx, { playerId }) => {
    return await ctx.db.get(playerId);
  },
});

export const getUnitsForAI = internalQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    return await ctx.db
      .query("units")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();
  },
});

export const getBuildingsForAI = internalQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    return await ctx.db
      .query("buildings")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();
  },
});

export const getPlayersForAI = internalQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    return await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();
  },
});

