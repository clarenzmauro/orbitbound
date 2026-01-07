import type { Doc, Id } from "../_generated/dataModel";
import { DEFAULT_VISION_RADIUS } from "./constants";
import { clampY, coordToIndex, wrapX } from "./grid";

type GameDoc = Doc<"games">;
type TileDoc = GameDoc["map"][number];

export const revealAround = (
  game: GameDoc,
  map: TileDoc[],
  playerId: Id<"players">,
  x: number,
  y: number,
  radius = DEFAULT_VISION_RADIUS,
) => {
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const ny = clampY(y + dy, game.height);
      const nx = wrapX(x + dx, game.width);
      const idx = coordToIndex(game.width, nx, ny);
      const tile = map[idx];
      if (!tile.visibility.some((id) => id === playerId)) {
        map[idx] = {
          ...tile,
          visibility: [...tile.visibility, playerId],
        };
      }
    }
  }
};

