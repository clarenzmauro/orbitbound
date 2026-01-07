import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { coordToIndex, wrapX, clampY } from "./grid";

type Ctx = QueryCtx | MutationCtx;

export const getGameOrThrow = async (ctx: Ctx, gameId: Id<"games">) => {
  const game = await ctx.db.get(gameId);
  if (!game) {
    throw new Error("Game not found");
  }
  return game;
};

export const getPlayerOrThrow = async (ctx: Ctx, playerId: Id<"players">) => {
  const player = await ctx.db.get(playerId);
  if (!player) {
    throw new Error("Player not found");
  }
  return player;
};

export const assertPlayerTurn = (game: Doc<"games">, playerId: Id<"players">) => {
  const activePlayerId = game.playerOrder[game.activePlayerIndex];
  if (!activePlayerId || activePlayerId !== playerId) {
    throw new Error("It is not your turn");
  }
};

export const getTileIndex = (game: Doc<"games">, x: number, y: number) => {
  const safeX = wrapX(x, game.width);
  const safeY = clampY(y, game.height);
  return coordToIndex(game.width, safeX, safeY);
};

export const withUpdatedMap = (
  game: Doc<"games">,
  mutator: (nextMap: Doc<"games">["map"]) => void,
) => {
  const nextMap = [...game.map];
  mutator(nextMap);
  return nextMap;
};

