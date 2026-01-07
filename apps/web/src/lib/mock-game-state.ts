import type { GameState, Player, Unit, Tile, FactionId } from "../types/game";

const WIDTH = 32;
const HEIGHT = 16; // 4 sky, 1 surface, 11 underground

const generateMap = (): Tile[] => {
  const map: Tile[] = [];
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      let type: Tile["type"] = "sky";
      if (y === 4) type = "surface"; // Surface
      else if (y > 4 && y < 10) type = "stone";
      else if (y >= 10) type = "bedrock";

      // Random resources
      let resource: Tile["resource"] = undefined;
      if (type === "stone" && Math.random() > 0.9) resource = "ore";
      if (type === "surface" && Math.random() > 0.8) resource = "biomass";
      
      map.push({
        id: `${x}-${y}`,
        x,
        y,
        type,
        resource,
        visibility: ["player1"], // Visible to player 1 for now
      });
    }
  }
  return map;
};

export const MOCK_GAME: GameState = {
  _id: "game1",
  status: "active",
  turn: 1,
  activePlayerIndex: 0,
  width: WIDTH,
  height: HEIGHT,
  seed: 12345,
  map: generateMap(),
  playerOrder: ["player1"],
  createdAt: Date.now(),
};

export const MOCK_PLAYER: Player = {
  _id: "player1",
  gameId: "game1",
  userId: "user_test",
  faction: "united_terran" as FactionId,
  resources: {
    biomass: 50,
    ore: 20,
    flux: 5,
  },
  techUnlocked: ["planetary_survival"],
  isAlive: true,
  order: 0,
};

export const MOCK_UNITS: Unit[] = [
  {
    _id: "unit1",
    gameId: "game1",
    playerId: "player1",
    type: "settler",
    x: 5,
    y: 4, // Surface level
    hp: 10,
    movesLeft: 2,
    maxMoves: 2,
  },
];
