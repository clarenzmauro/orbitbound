import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export const getUserGames = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;
    
    const players = await ctx.db
      .query("players")
      .withIndex("by_user_game", (q) => q.eq("userId", userId))
      .collect();

    const gameIds = [...new Set(players.map(p => p.gameId))];
    
    const games = await Promise.all(
      gameIds.map(gameId => ctx.db.get(gameId))
    );

    const activeGames = [];
    const completedGames = [];

    for (const game of games) {
      if (!game) continue;
      
      const player = players.find(p => p.gameId === game._id);
      
      const gameInfo = {
        gameId: game._id,
        playerId: player?._id,
        status: game.status as "lobby" | "active" | "ended",
        turn: game.turn,
        width: game.width,
        height: game.height,
        faction: player?.faction,
        createdAt: game.createdAt,
        playerOrder: game.playerOrder,
      };

      if (game.status === "active") {
        activeGames.push(gameInfo);
      } else if (game.status === "ended") {
        completedGames.push(gameInfo);
      } else {
        activeGames.push(gameInfo);
      }
    }

    activeGames.sort((a, b) => b.createdAt - a.createdAt);
    completedGames.sort((a, b) => b.createdAt - a.createdAt);

    return {
      activeGames,
      completedGames,
      totalGames: players.length,
    };
  },
});
