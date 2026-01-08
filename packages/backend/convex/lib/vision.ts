import type { Doc, Id } from "../_generated/dataModel";
import { DEFAULT_VISION_RADIUS, WEATHER_DEFS, WeatherType } from "./constants";
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
  activeWeather?: { type: string; turnsRemaining: number },
) => {
  // Apply weather modifiers to radius
  let modifiedRadius = radius;
  if (activeWeather) {
    if (activeWeather.type === "dust_storm") {
      modifiedRadius = Math.max(1, radius - 1); // Minimum 1
    } else if (activeWeather.type === "clear_skies") {
        modifiedRadius = radius + 1;
    }
  }

  for (let dy = -modifiedRadius; dy <= modifiedRadius; dy += 1) {
    for (let dx = -modifiedRadius; dx <= modifiedRadius; dx += 1) {
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

