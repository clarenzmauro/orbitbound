// ─────────────────────────────────────────────────────────────────────────────
// Shared Types for Orbitbound Frontend
// These match the Convex backend schema exactly
// ─────────────────────────────────────────────────────────────────────────────

// Tile types matching backend TERRAIN_DEFS
export type TileType =
  | "sky"
  | "cloud"
  | "surface"
  | "grass"
  | "sand"
  | "dirt"
  | "stone"
  | "cavern"
  | "deepstone"
  | "crystal"
  | "bedrock"
  | "water"
  | "magma"
  | "city"
  | "fog"
  | "ruins"
  | "farm"
  | "mine"
  | "solar_array"
  | "bunker"
  | "factory"
  | "skyport"
  | "silo"
  | "barracks"
  | "construction";

// Resource types matching backend RESOURCE_KEYS
export type ResourceType = "biomass" | "ore" | "flux";

// Faction IDs matching backend FACTIONS
export type FactionId = "united_terran" | "xeno_hive" | "cyber_synapse";

// Unit types matching backend UNIT_DEFS
export type UnitType =
  | "settler"
  | "rover"
  | "worker"
  | "marine"
  | "tank"
  | "arty"
  | "gunship";

// Building types matching backend BUILDING_DEFS
export type BuildingType =
  | "city"
  | "farm"
  | "mine"
  | "solar_array"
  | "bunker"
  | "factory"
  | "skyport"
  | "silo"
  | "barracks";

// ─────────────────────────────────────────────────────────────────────────────
// Core Game Interfaces
// ─────────────────────────────────────────────────────────────────────────────

export interface Tile {
  id: string; // Virtual ID for React keying (e.g., "x-y" or "x-y-ghost")
  x: number;
  y: number;
  type: TileType;
  resource?: ResourceType;
  buildingId?: string;
  unitId?: string;
  visibility: string[]; // Player IDs who can see this tile
}

export interface PlayerResources {
  biomass: number;
  ore: number;
  flux: number;
}

export interface GameState {
  _id: string;
  status: "lobby" | "active" | "ended";
  turn: number;
  activePlayerIndex: number;
  width: number;
  height: number;
  seed: number;
  map: Tile[];
  playerOrder: string[];
  createdAt: number;
}

export interface Player {
  _id: string;
  gameId: string;
  userId?: string;
  faction: FactionId;
  resources: PlayerResources;
  techUnlocked: string[];
  isAlive: boolean;
  order: number;
  // AI player fields
  isAI?: boolean;
  aiDifficulty?: "easy" | "medium" | "hard";
  aiName?: string;
}

export interface Unit {
  _id: string;
  gameId: string;
  playerId: string;
  type: UnitType;
  x: number;
  y: number;
  hp: number;
  movesLeft: number;
  maxMoves: number;
  entrenched?: boolean; // Marine entrench ability
  buildsLeft?: number; // Worker building uses remaining
  autoExplore?: boolean; // Rover auto-explore mode
}

export interface Building {
  _id: string;
  gameId: string;
  playerId: string;
  type: BuildingType;
  x: number;
  y: number;
  hp: number;
  isConstructing?: boolean; // True if building is under construction
  buildProgress?: number; // Current construction progress
  turnsToComplete?: number; // Total turns needed
  workerId?: string; // Worker currently building this
}

// ─────────────────────────────────────────────────────────────────────────────
// API Response Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GameStateResponse {
  game: GameState;
  players: Player[];
  units: Unit[];
  buildings: Building[];
}

export interface GameSummary {
  gameId: string;
  status: "lobby" | "active" | "ended";
  turn: number;
  activePlayerId: string | undefined;
  width: number;
  height: number;
  players: PlayerSummary[];
}

export interface PlayerSummary {
  playerId: string;
  faction: string;
  factionName: string;
  isAlive: boolean;
  resources: PlayerResources;
  unitCount: number;
  buildingCount: number;
  techCount: number;
}

export interface TechInfo {
  techId: string;
  name: string;
  tier: number;
  cost: number;
  prerequisites: string[];
  unlocks: string[];
  description: string;
  canResearch: boolean;
  alreadyResearched: boolean;
}

export interface UnitActions {
  canMove: boolean;
  canAttack: boolean;
  canFoundCity: boolean;
  abilities: string[];
  stats: {
    hp: number;
    maxHp: number;
    movesLeft: number;
    maxMoves: number;
    atk: number;
    def: number;
    range: number;
    vision: number;
  };
}

export interface CombatResult {
  attackerDamageDealt: number;
  defenderDamageDealt: number;
  attackerDied: boolean;
  defenderDied: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Direction type for movement
// ─────────────────────────────────────────────────────────────────────────────
export type Direction = "L" | "R" | "U" | "D";
