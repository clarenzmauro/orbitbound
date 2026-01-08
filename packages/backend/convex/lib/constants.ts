// ─────────────────────────────────────────────────────────────────────────────
// World Constants
// ─────────────────────────────────────────────────────────────────────────────
export const SKY_ROWS = 8;
export const SURFACE_ROWS = 1;
export const BEDROCK_ROWS = 1;
export const DEFAULT_VISION_RADIUS = 2;

export const MIN_WIDTH = 16;
export const MIN_HEIGHT = SKY_ROWS + SURFACE_ROWS + BEDROCK_ROWS + 4;

// ─────────────────────────────────────────────────────────────────────────────
// Resources
// ─────────────────────────────────────────────────────────────────────────────
export const RESOURCE_KEYS = ["biomass", "ore", "flux"] as const;
export type ResourceKey = (typeof RESOURCE_KEYS)[number];
export type Cost = Partial<Record<ResourceKey, number>>;

export const STARTING_RESOURCES: Record<ResourceKey, number> = {
  biomass: 10,
  ore: 10,
  flux: 5,
};

export const RESOURCE_YIELDS: Record<string, { resource: ResourceKey; amount: number }> = {
  biomass: { resource: "biomass", amount: 2 },
  ore: { resource: "ore", amount: 2 },
  flux: { resource: "flux", amount: 1 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Factions (per Phase 5 of plan)
// ─────────────────────────────────────────────────────────────────────────────
export const FACTIONS = ["united_terran", "xeno_hive", "cyber_synapse"] as const;
export type FactionId = (typeof FACTIONS)[number];

export const FACTION_DEFS: Record<
  FactionId,
  {
    name: string;
    description: string;
    startingBonus: Partial<Record<ResourceKey, number>>;
    trait: string;
  }
> = {
  united_terran: {
    name: "United Terran",
    description: "Industrial / Balanced",
    startingBonus: { ore: 20 },
    trait: "deep_core_mining", // Mines produce +1 Ore per turn
  },
  xeno_hive: {
    name: "Xeno Hive",
    description: "Biological / Swarm",
    startingBonus: { biomass: 20 },
    trait: "regeneration", // Units heal +2 HP/turn on Biomass tiles
  },
  cyber_synapse: {
    name: "Cyber Synapse",
    description: "Tech / Turtle",
    startingBonus: { flux: 10 },
    trait: "networked", // Tech research costs 10% less Flux
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Terrain (per Phase 5 of plan)
// ─────────────────────────────────────────────────────────────────────────────
export const TERRAIN_DEFS: Record<
  string,
  {
    moveCost: number;
    passable: boolean;
    airOnly?: boolean;
    hazard?: boolean;
  }
> = {
  sky: { moveCost: 1, passable: true, airOnly: true },
  cloud: { moveCost: 1, passable: true, airOnly: true },
  surface: { moveCost: 1, passable: true },
  grass: { moveCost: 1, passable: true },
  sand: { moveCost: 1, passable: true },
  dirt: { moveCost: 1, passable: true },
  stone: { moveCost: 2, passable: true },
  deepstone: { moveCost: 2, passable: true },
  crystal: { moveCost: 2, passable: true },
  cavern: { moveCost: 1, passable: true },
  bedrock: { moveCost: Infinity, passable: false },
  water: { moveCost: 2, passable: true },
  magma: { moveCost: 1, passable: true, hazard: true },
  city: { moveCost: 1, passable: true },
  fog: { moveCost: 1, passable: false },
  ruins: { moveCost: 1, passable: true },
};

// ─────────────────────────────────────────────────────────────────────────────
// Units (per Phase 5 of plan - Full Roster)
// ─────────────────────────────────────────────────────────────────────────────
export type UnitCategory = "civilian" | "infantry" | "armored" | "siege" | "air" | "scout";

export interface UnitDef {
  name: string;
  category: UnitCategory;
  hp: number;
  maxMoves: number;
  atk: number;
  def: number;
  range: number;
  vision: number;
  cost: Cost;
  canFly?: boolean;
  abilities?: string[];
  requiredTech?: string;
  buildsLeft?: number; // For Workers: number of buildings they can construct
}

export const UNIT_DEFS: Record<string, UnitDef> = {
  // Starter unit - spawns with player
  settler: {
    name: "Lander",
    category: "civilian",
    hp: 10,
    maxMoves: 2,
    atk: 0,
    def: 0,
    range: 1,
    vision: 3,
    cost: {},
    abilities: ["deploy_city"],
  },
  // Scout - fast recon
  rover: {
    name: "Rover",
    category: "scout",
    hp: 10,
    maxMoves: 4,
    atk: 2,
    def: 1,
    range: 1,
    vision: 4,
    cost: { ore: 10 },
    abilities: ["radar"],
    requiredTech: "logistics",
  },
  // Worker - builds improvements
  worker: {
    name: "Worker",
    category: "civilian",
    hp: 5,
    maxMoves: 2,
    atk: 0,
    def: 0,
    range: 1,
    vision: 2,
    cost: { biomass: 5 },
    abilities: ["build"],
    buildsLeft: 3, // Can build 3 buildings before being consumed
  },
  // Marine - basic infantry
  marine: {
    name: "Marine",
    category: "infantry",
    hp: 15,
    maxMoves: 2,
    atk: 5,
    def: 3,
    range: 1,
    vision: 2,
    cost: { biomass: 10, ore: 5 },
    abilities: ["entrench"],
    requiredTech: "militarization",
  },
  // Tank - armored
  tank: {
    name: "Tank",
    category: "armored",
    hp: 40,
    maxMoves: 2,
    atk: 8,
    def: 6,
    range: 1,
    vision: 2,
    cost: { ore: 25 },
    abilities: ["crush"],
    requiredTech: "ballistics",
  },
  // Artillery - siege
  arty: {
    name: "Artillery",
    category: "siege",
    hp: 20,
    maxMoves: 1,
    atk: 12,
    def: 1,
    range: 4,
    vision: 3,
    cost: { ore: 30, flux: 10 },
    abilities: ["arc_fire"],
    requiredTech: "ballistics",
  },
  // Gunship - air unit
  gunship: {
    name: "Gunship",
    category: "air",
    hp: 30,
    maxMoves: 5,
    atk: 10,
    def: 2,
    range: 1,
    vision: 4,
    cost: { ore: 40, flux: 20 },
    canFly: true,
    requiredTech: "flight",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Buildings (per Phase 5 of plan - Full Roster)
// ─────────────────────────────────────────────────────────────────────────────
export interface BuildingDef {
  name: string;
  hp: number;
  income: Cost;
  cost: Cost;
  providesVision?: number;
  canSpawnUnits?: boolean;
  spawnableUnits?: string[];
  terrainRequired?: string[];
  requiredTech?: string;
  defenseBonus?: number;
  requiresResource?: string; // e.g., Mine requires "ore" resource on tile
  turnsToComplete?: number; // Turns needed to build (0 for instant)
}

export const BUILDING_DEFS: Record<string, BuildingDef> = {
  city: {
    name: "City",
    hp: 20,
    income: { biomass: 2, ore: 2 },
    cost: {}, // Founded by Lander (instant)
    providesVision: 3,
    canSpawnUnits: true,
    spawnableUnits: ["worker"],
    turnsToComplete: 0, // Instant
  },
  barracks: {
    name: "Barracks",
    hp: 15,
    income: {},
    cost: { ore: 15 },
    canSpawnUnits: true,
    spawnableUnits: ["marine", "rover"],
    requiredTech: "militarization",
    turnsToComplete: 1, // 1 turn
  },
  farm: {
    name: "Farm",
    hp: 8,
    income: { biomass: 2 },
    cost: { ore: 10 },
    terrainRequired: ["surface", "dirt"],
    turnsToComplete: 1, // 1 turn
  },
  mine: {
    name: "Mine",
    hp: 10,
    income: { ore: 2 },
    cost: { biomass: 10 },
    terrainRequired: ["dirt", "stone", "deepstone"],
    requiresResource: "ore", // Mine must be on ore deposit
    turnsToComplete: 2, // 2 turns (underground work)
  },
  solar_array: {
    name: "Solar Array",
    hp: 8,
    income: { flux: 1 },
    cost: { ore: 15 },
    terrainRequired: ["surface"],
    turnsToComplete: 2, // 2 turns (solar installation)
  },
  bunker: {
    name: "Bunker",
    hp: 30,
    income: {},
    cost: { ore: 20 },
    defenseBonus: 5,
    turnsToComplete: 3, // 3 turns (heavy fortification)
  },
  factory: {
    name: "Factory",
    hp: 25,
    income: {},
    cost: { ore: 30 },
    canSpawnUnits: true,
    spawnableUnits: ["tank", "arty"],
    requiredTech: "ballistics",
    turnsToComplete: 3, // 3 turns (complex machinery)
  },
  skyport: {
    name: "Skyport",
    hp: 20,
    income: {},
    cost: { ore: 40, flux: 20 },
    canSpawnUnits: true,
    spawnableUnits: ["gunship"],
    requiredTech: "flight",
    turnsToComplete: 4, // 4 turns (aerospace construction)
  },
  silo: {
    name: "Silo",
    hp: 50,
    income: {},
    cost: { ore: 100, flux: 50 },
    terrainRequired: ["surface"],
    requiredTech: "orbital_mechanics",
    turnsToComplete: 5, // 5 turns (end-game structure)
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Tech Tree (per Phase 5 of plan)
// ─────────────────────────────────────────────────────────────────────────────
export interface TechDef {
  name: string;
  tier: number;
  cost: number; // Flux cost
  prerequisites: string[];
  unlocks: string[]; // Units or buildings unlocked
  description: string;
}

export const TECH_DEFS: Record<string, TechDef> = {
  // Tier 0 - Starting tech (free)
  planetary_survival: {
    name: "Planetary Survival",
    tier: 0,
    cost: 0,
    prerequisites: [],
    unlocks: ["farm", "mine", "worker"],
    description: "Basic survival skills. Unlocks Farms and Mines.",
  },

  // Tier 1 - 25 Flux
  logistics: {
    name: "Logistics",
    tier: 1,
    cost: 25,
    prerequisites: ["planetary_survival"],
    unlocks: ["rover"],
    description: "Fast recon units. Unlocks Rover.",
  },
  militarization: {
    name: "Militarization",
    tier: 1,
    cost: 25,
    prerequisites: ["planetary_survival"],
    unlocks: ["marine", "barracks"],
    description: "Basic infantry. Unlocks Marine, Barracks.",
  },

  // Tier 2 - 50 Flux
  deep_core: {
    name: "Deep Core",
    tier: 2,
    cost: 50,
    prerequisites: ["logistics"],
    unlocks: [],
    description: "Can mine Bedrock for Rare Earths.",
  },
  heat_shield: {
    name: "Heat Shield",
    tier: 3,
    cost: 100,
    prerequisites: ["deep_core"],
    unlocks: [],
    description: "Allows units to cross Magma tiles safely.",
  },
  ballistics: {
    name: "Ballistics",
    tier: 2,
    cost: 50,
    prerequisites: ["militarization"],
    unlocks: ["tank", "arty", "factory"],
    description: "Heavy weaponry. Unlocks Tank, Artillery, Factory.",
  },

  // Tier 3 - 100 Flux
  flight: {
    name: "Flight",
    tier: 3,
    cost: 100,
    prerequisites: ["ballistics"],
    unlocks: ["gunship", "skyport"],
    description: "Airborne units. Unlocks Gunship, Skyport.",
  },
  orbital_mechanics: {
    name: "Orbital Mechanics",
    tier: 3,
    cost: 100,
    prerequisites: ["deep_core"],
    unlocks: ["silo"],
    description: "Space tech. Unlocks Silo, Satellite Vision.",
  },

  // Tier 4 - 200 Flux (Victory Condition)
  the_ark_project: {
    name: "The Ark Project",
    tier: 4,
    cost: 200,
    prerequisites: ["orbital_mechanics", "flight"],
    unlocks: [],
    description: "Build The Ark to escape the planet. Victory condition.",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Combat Constants
// ─────────────────────────────────────────────────────────────────────────────
export const COMBAT = {
  MIN_DAMAGE: 1, // Minimum damage even if Def > Atk
  FLANKING_BONUS: 2, // +2 Atk when flanking
  ENTRENCH_BONUS: 2, // +2 Def for entrenched Marine
  REGEN_HP_PER_TURN: 2, // Xeno Hive regeneration
};

export const DIRECTIONS = ["L", "R", "U", "D"] as const;
export type Direction = (typeof DIRECTIONS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Ruins Rewards
// ─────────────────────────────────────────────────────────────────────────────
export type RuinRewardType = "resource" | "tech" | "unit" | "map";

export const RUIN_REWARDS: {
  weight: number;
  type: RuinRewardType;
  // Payload definition depends on type
  resource?: Partial<Record<ResourceKey, number>>;
  techPoints?: number; // Free research progress or random tech
  unitType?: string;
  visionRadius?: number;
  message: string;
}[] = [
  // Rare: Full Map Reveal or Tech
  { weight: 10, type: "map", visionRadius: 10, message: "Downloaded high-res satellite data! (Map Reveal)" },
  { weight: 5, type: "tech", techPoints: 50, message: "Recovered intact research logs! (+50 Flux)" }
];

// ─────────────────────────────────────────────────────────────────────────────
// Weather Events
// ─────────────────────────────────────────────────────────────────────────────
export type WeatherType = "dust_storm" | "solar_flare" | "acid_rain" | "clear_skies";

export interface WeatherDef {
  name: string;
  description: string;
  duration: [number, number]; // Min, Max turns
  effectDesc: string;
}

export const WEATHER_DEFS: Record<WeatherType, WeatherDef> = {
  dust_storm: {
    name: "Dust Storm",
    description: "Visibility reduced by thick dust clouds.",
    duration: [2, 3],
    effectDesc: "-1 Vision Range for all units.",
  },
  solar_flare: {
    name: "Solar Flare",
    description: "High radiation levels detected.",
    duration: [1, 2],
    effectDesc: "+50% Flux Income. Air units grounded.",
  },
  acid_rain: {
    name: "Acid Rain",
    description: "Corrosive rain damaging exposed equipment.",
    duration: [2, 3],
    effectDesc: "-2 HP/turn to units outside cities/bunkers.",
  },
  clear_skies: {
    name: "Clear Skies",
    description: "Optimal atmospheric conditions.",
    duration: [2, 4],
    effectDesc: "+1 Vision Range for all units.",
  },
};


