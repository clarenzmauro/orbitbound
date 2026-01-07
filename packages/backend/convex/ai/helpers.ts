/**
 * AI Helper Functions
 * 
 * Utility functions for AI decision making, pathfinding, and game analysis.
 */

import type { Doc } from "../_generated/dataModel";
import { wrapX, manhattanDistance } from "../lib/grid";
import { UNIT_DEFS, TERRAIN_DEFS } from "../lib/constants";

type Game = Doc<"games">;
type Unit = Doc<"units">;
type Building = Doc<"buildings">;
type Player = Doc<"players">;

export interface GameAnalysis {
  // Economic metrics
  totalIncome: { biomass: number; ore: number; flux: number };
  cityCount: number;
  
  // Military metrics
  armyStrength: number;
  combatUnits: Unit[];
  settlers: Unit[];
  
  // Map awareness
  visibleEnemyUnits: Unit[];
  visibleEnemyBuildings: Building[];
  nearestEnemyDistance: number;
  
  // Strategic info
  expansionOpportunities: { x: number; y: number }[];
  resourceTiles: { x: number; y: number; resource: string }[];
}

/**
 * Analyze the game state from an AI player's perspective
 */
export function analyzeGameState(
  game: Game,
  player: Player,
  myUnits: Unit[],
  myBuildings: Building[],
  allUnits: Unit[],
  allBuildings: Building[]
): GameAnalysis {
  // Calculate income
  let biomassIncome = 0, oreIncome = 0, fluxIncome = 0;
  let cityCount = 0;
  
  for (const building of myBuildings) {
    if (building.type === "city") {
      biomassIncome += 2;
      oreIncome += 2;
      cityCount++;
    }
    if (building.type === "farm") biomassIncome += 2;
    if (building.type === "mine") oreIncome += 2;
    if (building.type === "solar_array") fluxIncome += 1;
  }

  // Categorize units
  const combatUnits = myUnits.filter(u => 
    u.type !== "settler" && u.type !== "worker"
  );
  const settlers = myUnits.filter(u => u.type === "settler");
  
  // Calculate army strength (simple HP-based)
  const armyStrength = combatUnits.reduce((sum, u) => {
    const unitDef = UNIT_DEFS[u.type];
    return sum + (unitDef?.atk ?? 0) + (unitDef?.def ?? 0) + u.hp;
  }, 0);

  // Find visible enemy units and buildings
  const enemyUnits = allUnits.filter(u => u.playerId !== player._id);
  const enemyBuildings = allBuildings.filter(b => b.playerId !== player._id);
  
  // Filter to only visible enemies (in revealed tiles)
  const visibleEnemyUnits = enemyUnits.filter(u => {
    const idx = u.y * game.width + u.x;
    const tile = game.map[idx];
    return tile?.visibility.includes(player._id);
  });
  
  const visibleEnemyBuildings = enemyBuildings.filter(b => {
    const idx = b.y * game.width + b.x;
    const tile = game.map[idx];
    return tile?.visibility.includes(player._id);
  });

  // Find nearest enemy
  let nearestEnemyDistance = Infinity;
  const myPositions = [...myUnits, ...myBuildings];
  
  for (const mine of myPositions) {
    for (const enemy of [...visibleEnemyUnits, ...visibleEnemyBuildings]) {
      const dist = manhattanDistance(game.width, mine.x, mine.y, enemy.x, enemy.y);
      nearestEnemyDistance = Math.min(nearestEnemyDistance, dist);
    }
  }

  // Find expansion opportunities (good spots for new cities)
  const expansionOpportunities: { x: number; y: number }[] = [];
  const occupiedTiles = new Set<string>();
  
  for (const b of allBuildings) {
    occupiedTiles.add(`${b.x}-${b.y}`);
  }

  // Look for surface tiles far from existing cities
  for (let i = 0; i < game.map.length; i++) {
    const tile = game.map[i];
    const x = i % game.width;
    const y = Math.floor(i / game.width);
    
    if (tile.type === "surface" && 
        tile.visibility.includes(player._id) &&
        !occupiedTiles.has(`${x}-${y}`)) {
      
      // Check if far enough from existing cities
      let farEnough = true;
      for (const b of myBuildings) {
        if (b.type === "city") {
          const dist = manhattanDistance(game.width, x, y, b.x, b.y);
          if (dist < 5) {
            farEnough = false;
            break;
          }
        }
      }
      
      if (farEnough) {
        expansionOpportunities.push({ x, y });
      }
    }
  }

  // Find resource tiles near cities
  const resourceTiles: { x: number; y: number; resource: string }[] = [];
  
  for (const building of myBuildings) {
    if (building.type === "city") {
      // Check adjacent tiles for resources
      const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dx, dy] of directions) {
        const nx = wrapX(building.x + dx, game.width);
        const ny = Math.max(0, Math.min(game.height - 1, building.y + dy));
        const idx = ny * game.width + nx;
        const tile = game.map[idx];
        
        if (tile?.resource && !tile.buildingId) {
          resourceTiles.push({ x: nx, y: ny, resource: tile.resource });
        }
      }
    }
  }

  return {
    totalIncome: { biomass: biomassIncome, ore: oreIncome, flux: fluxIncome },
    cityCount,
    armyStrength,
    combatUnits,
    settlers,
    visibleEnemyUnits,
    visibleEnemyBuildings,
    nearestEnemyDistance,
    expansionOpportunities,
    resourceTiles,
  };
}

/**
 * Find path toward a target (simple greedy approach)
 */
export function findMoveToward(
  unit: Unit,
  targetX: number,
  targetY: number,
  game: Game,
  allUnits: Unit[],
  allBuildings: Building[]
): { dx: number; dy: number } | null {
  const directions = [
    { dx: -1, dy: 0 }, // left
    { dx: 1, dy: 0 },  // right
    { dx: 0, dy: -1 }, // up
    { dx: 0, dy: 1 },  // down
  ];

  // Create set of occupied tiles
  const occupied = new Set<string>();
  for (const u of allUnits) {
    if (u._id !== unit._id) {
      occupied.add(`${u.x}-${u.y}`);
    }
  }

  let bestDir: { dx: number; dy: number } | null = null;
  let bestDist = manhattanDistance(game.width, unit.x, unit.y, targetX, targetY);

  for (const dir of directions) {
    const nx = wrapX(unit.x + dir.dx, game.width);
    const ny = Math.max(0, Math.min(game.height - 1, unit.y + dir.dy));
    
    // Skip if occupied
    if (occupied.has(`${nx}-${ny}`)) continue;
    
    // Check terrain
    const idx = ny * game.width + nx;
    const tile = game.map[idx];
    
    if (!tile || tile.type === "bedrock" || tile.type === "fog") continue;
    
    const terrain = TERRAIN_DEFS[tile.type];
    if (!terrain?.passable) continue;
    
    // Check if unit can move on this terrain
    const unitDef = UNIT_DEFS[unit.type];
    if (tile.type === "sky" && !unitDef?.abilities?.includes("flight")) continue;
    
    const dist = manhattanDistance(game.width, nx, ny, targetX, targetY);
    if (dist < bestDist) {
      bestDist = dist;
      bestDir = dir;
    }
  }

  return bestDir;
}

/**
 * Find enemies in attack range
 */
export function findEnemiesInRange(
  unit: Unit,
  game: Game,
  enemyUnits: Unit[],
  enemyBuildings: Building[]
): Array<{ type: "unit" | "building"; target: Unit | Building; distance: number }> {
  const unitDef = UNIT_DEFS[unit.type];
  const range = unitDef?.range ?? 1;
  
  const targets: Array<{ type: "unit" | "building"; target: Unit | Building; distance: number }> = [];

  for (const enemy of enemyUnits) {
    const dist = manhattanDistance(game.width, unit.x, unit.y, enemy.x, enemy.y);
    if (dist <= range && dist > 0) {
      targets.push({ type: "unit", target: enemy, distance: dist });
    }
  }

  for (const enemy of enemyBuildings) {
    const dist = manhattanDistance(game.width, unit.x, unit.y, enemy.x, enemy.y);
    if (dist <= range && dist > 0) {
      targets.push({ type: "building", target: enemy, distance: dist });
    }
  }

  // Sort by distance (prefer closer targets)
  targets.sort((a, b) => a.distance - b.distance);

  return targets;
}

/**
 * Convert direction delta to mutation format
 */
export function directionToCommand(dx: number, dy: number): "L" | "R" | "U" | "D" {
  if (dx < 0) return "L";
  if (dx > 0) return "R";
  if (dy < 0) return "U";
  return "D";
}

/**
 * Determine which building to place based on needs
 */
export function chooseBuildingToBuild(
  analysis: GameAnalysis,
  player: Player,
  availableBuildings: string[]
): string | null {
  const { totalIncome, resourceTiles } = analysis;
  
  // Priority: Mine on ore > Farm > Solar Array
  if (availableBuildings.includes("mine") && 
      resourceTiles.some(r => r.resource === "ore")) {
    return "mine";
  }
  
  if (availableBuildings.includes("farm") && totalIncome.biomass < 6) {
    return "farm";
  }
  
  if (availableBuildings.includes("solar_array") && totalIncome.flux < 2) {
    return "solar_array";
  }
  
  // Build barracks if we have income but no military production
  if (availableBuildings.includes("barracks") && 
      totalIncome.biomass >= 4 && 
      totalIncome.ore >= 4) {
    return "barracks";
  }
  
  // Fallback to farm for biomass
  if (availableBuildings.includes("farm")) {
    return "farm";
  }
  
  return null;
}

/**
 * Choose which unit to spawn based on needs
 */
export function chooseUnitToSpawn(
  analysis: GameAnalysis,
  player: Player,
  availableUnits: Array<{ unitType: string; cost: { biomass: number; ore: number; flux: number } }>
): string | null {
  const { combatUnits, settlers, cityCount, visibleEnemyUnits, nearestEnemyDistance } = analysis;
  const resources = player.resources;
  
  // If no settlers and we need to expand, prioritize settler
  if (settlers.length === 0 && cityCount < 3) {
    const settler = availableUnits.find(u => u.unitType === "settler");
    if (settler && canAfford(resources, settler.cost)) {
      return "settler";
    }
  }
  
  // If enemies are close, prioritize combat units
  if (nearestEnemyDistance < 5 || visibleEnemyUnits.length > combatUnits.length) {
    // Prefer marine (cheap combat unit)
    const marine = availableUnits.find(u => u.unitType === "marine");
    if (marine && canAfford(resources, marine.cost)) {
      return "marine";
    }
    
    // Tank if we can afford it
    const tank = availableUnits.find(u => u.unitType === "tank");
    if (tank && canAfford(resources, tank.cost)) {
      return "tank";
    }
  }
  
  // Default: build military for defense
  const marine = availableUnits.find(u => u.unitType === "marine");
  if (marine && canAfford(resources, marine.cost)) {
    return "marine";
  }
  
  // Worker for building
  const worker = availableUnits.find(u => u.unitType === "worker");
  if (worker && canAfford(resources, worker.cost)) {
    return "worker";
  }
  
  return null;
}

function canAfford(
  resources: { biomass: number; ore: number; flux: number },
  cost: { biomass: number; ore: number; flux: number }
): boolean {
  return resources.biomass >= cost.biomass &&
         resources.ore >= cost.ore &&
         resources.flux >= cost.flux;
}

