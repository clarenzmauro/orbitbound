import { Doc, Id } from "../_generated/dataModel";
import { Direction } from "./constants";
import { TERRAIN_DEFS } from "./constants";

interface Point {
  x: number;
  y: number;
}

// Convert (x, y) to array index
const coordToIndex = (width: number, x: number, y: number) => y * width + x;

// Get valid neighbors
const getNeighbors = (
  x: number,
  y: number,
  width: number,
  height: number,
  map: Doc<"games">["map"],
  canFly: boolean = false
): Point[] => {
  const neighbors: Point[] = [];
  const directions = [
    { x: 0, y: -1 }, // Up
    { x: 0, y: 1 },  // Down
    { x: -1, y: 0 }, // Left
    { x: 1, y: 0 },  // Right
  ];

  for (const dir of directions) {
    let nx = x + dir.x;
    let ny = y + dir.y;

    // Wrap X
    nx = (nx + width) % width;

    // Clamp Y
    if (ny < 0 || ny >= height) continue;

    const idx = coordToIndex(width, nx, ny);
    const tile = map[idx];
    const terrain = TERRAIN_DEFS[tile.type];

    // Check passability
    if (!terrain) continue;
    
    // If unit can't fly, check normal passability
    if (!canFly) {
      if (!terrain.passable) continue;
      // Also avoid units/buildings obstructing? 
      // For now, auto-explore might ignore other units for simplicity in pathfinding
      // but actual movement will fail if blocked.
      // Better to assume empty for exploration plan.
    }

    neighbors.push({ x: nx, y: ny });
  }

  return neighbors;
};

// BFS to find nearest target
export const findNearestFog = (
  startX: number,
  startY: number,
  map: Doc<"games">["map"],
  width: number,
  height: number,
  playerId: Id<"players">,
  canFly: boolean = false
): Direction | null => {
  // Queue: [x, y]
  const queue: Point[] = [{ x: startX, y: startY }];
  
  // Track visited to avoid cycles
  const visited = new Set<string>();
  visited.add(`${startX},${startY}`);

  // Track parents to reconstruct path: key "x,y" -> value { x, y, dir }
  const parents = new Map<string, { x: number; y: number; dir: Direction }>();

  // Max search depth to prevent infinite loops on fully explored map
  let steps = 0;
  const MAX_STEPS = 500; // Search limit

  while (queue.length > 0 && steps < MAX_STEPS) {
    const current = queue.shift()!;
    steps++;

    const idx = coordToIndex(width, current.x, current.y);
    const tile = map[idx];

    // Check if this tile is fog (target found!)
    // Note: We check target logic HERE. 
    // Is it fog? (not visible to player)
    const isVisible = tile.visibility.includes(playerId);
    
    // However, if we are at start, we obviously are visible.
    // Also, usually we want to move TO a tile that reveals fog. 
    // Exploring *into* fog means stepping onto a tile we can't see?
    // Actually, in this game visibility is tile-based. 
    // So moving to a tile visible to us might reveal adjacent fog.
    // But simplest heuristic: Move to a tile we haven't seen yet.
    if (!isVisible && (current.x !== startX || current.y !== startY)) {
      // Reconstruct path to get the first step
      let curr = current;
      let pathStart: Direction | null = null;
      
      while (true) {
        const key = `${curr.x},${curr.y}`;
        const parentInfo = parents.get(key);
        
        if (!parentInfo) break; // Should happen at start node
        
        // If parent is the start node, then 'parentInfo.dir' is the first move
        if (parentInfo.x === startX && parentInfo.y === startY) {
          pathStart = parentInfo.dir;
          break;
        }
        
        curr = { x: parentInfo.x, y: parentInfo.y };
      }
      return pathStart;
    }

    // Explore neighbors
    const neighbors = getNeighbors(current.x, current.y, width, height, map, canFly);
    
    for (const neighbor of neighbors) {
      const nKey = `${neighbor.x},${neighbor.y}`;
      if (!visited.has(nKey)) {
        visited.add(nKey);
        queue.push(neighbor);
        
        // Determine direction from current to neighbor
        let dir: Direction = "U"; // default
        // Handle wrapping for X
        const diffX = neighbor.x - current.x;
        const diffY = neighbor.y - current.y;
        
        // Normal checks
        if (diffY === -1) dir = "U";
        else if (diffY === 1) dir = "D";
        else if (diffX === 1 || diffX < -1) dir = "R"; // Right or Wrapped Left->Right
        else if (diffX === -1 || diffX > 1) dir = "L"; // Left or Wrapped Right->Left

        parents.set(nKey, { x: current.x, y: current.y, dir });
      }
    }
  }

  return null;
};
