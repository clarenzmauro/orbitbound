import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { BUILDING_DEFS, UNIT_DEFS, TERRAIN_DEFS, TECH_DEFS, RUIN_REWARDS } from "./lib/constants";
import { clampY, coordToIndex, wrapX } from "./lib/grid";
import { getGameOrThrow, getPlayerOrThrow, assertPlayerTurn } from "./lib/gameHelpers";
import { revealAround } from "./lib/vision";
import { subtractCost, addResources } from "./lib/resources";
import type { ResourceKey } from "./lib/constants";

const DIRECTIONS = ["L", "R", "U", "D"] as const;
type Direction = (typeof DIRECTIONS)[number];

/**
 * Movement with terrain costs per Phase 5:
 * - Sky: Air units only
 * - Surface/Dirt/City: Cost 1
 * - Stone/Deepstone: Cost 2
 * - Bedrock: Impassable
 * - Water: Cost 2
 */
export const move = mutation({
  args: {
    unitId: v.id("units"),
    playerId: v.id("players"),
    direction: v.union(
      v.literal("L"),
      v.literal("R"),
      v.literal("U"),
      v.literal("D"),
    ),
  },
  handler: async (ctx, args) => {
    const unit = await ctx.db.get(args.unitId);
    if (!unit) {
      throw new Error("Unit not found");
    }

    if (unit.playerId !== args.playerId) {
      throw new Error("You do not control this unit");
    }

    const game = await getGameOrThrow(ctx, unit.gameId);
    assertPlayerTurn(game, args.playerId);

    const unitDef = UNIT_DEFS[unit.type];
    if (!unitDef) {
      throw new Error("Unknown unit type");
    }

    if (unit.movesLeft <= 0) {
      throw new Error("Unit has no moves left");
    }

    // Solar Flare grounds air units
    if (game.activeWeather?.type === "solar_flare" && unitDef.canFly) {
       throw new Error("Air units are grounded during a Solar Flare!");
    }

    const { dx, dy } = directionToDelta(args.direction);
    const targetX = wrapX(unit.x + dx, game.width);
    const targetY = clampY(unit.y + dy, game.height);

    const fromIdx = coordToIndex(game.width, unit.x, unit.y);
    const toIdx = coordToIndex(game.width, targetX, targetY);

    if (fromIdx === toIdx) {
      throw new Error("Cannot move out of bounds");
    }

    const targetTile = game.map[toIdx];
    const terrainDef = TERRAIN_DEFS[targetTile.type] ?? TERRAIN_DEFS.surface;

    // Check passability
    if (!terrainDef.passable) {
      throw new Error(`Cannot enter ${targetTile.type}`);
    }

    // Check air-only tiles (sky, cloud)
    if (terrainDef.airOnly && !unitDef.canFly) {
      throw new Error("Only air units can enter sky tiles");
    }

    // Check tile occupation
    if (targetTile.unitId && targetTile.unitId !== unit._id) {
      throw new Error("Tile is occupied");
    }

    // Calculate movement cost (flying units ignore terrain cost)
    const moveCost = unitDef.canFly ? 1 : terrainDef.moveCost;
    if (unit.movesLeft < moveCost) {
      throw new Error(`Not enough moves (need ${moveCost}, have ${unit.movesLeft})`);
    }

    // Check hazards (magma)
    if (terrainDef.hazard) {
      const player = await getPlayerOrThrow(ctx, args.playerId);
      if (!player.techUnlocked.includes("heat_shield")) {
        throw new Error("Hazardous terrain! Research Heat Shield technology to cross Magma.");
      }
    }

    const updatedMap = [...game.map];
    updatedMap[fromIdx] = {
      ...updatedMap[fromIdx],
      unitId: undefined,
    };

    let rewardMessage: string | undefined;

    // Check for Ruins
    if (targetTile.type === "ruins") {
      // Logic to claim ruin reward
      const roll = Math.random() * 100; // 0-100
      let cumulativeWeight = 0;
      let selectedReward = RUIN_REWARDS[0]; // Default fallback

      for (const reward of RUIN_REWARDS) {
        cumulativeWeight += reward.weight;
        if (roll < cumulativeWeight) {
          selectedReward = reward;
          break;
        }
      }

      rewardMessage = selectedReward.message;
      const player = await getPlayerOrThrow(ctx, args.playerId);

      // Apply Reward
      if (selectedReward.type === "resource" && selectedReward.resource) {
        const newResources = addResources(player.resources, selectedReward.resource);
        await ctx.db.patch(player._id, { resources: newResources });
      } else if (selectedReward.type === "unit" && selectedReward.unitType) {
        // Spawn free unit at target tile
        // Since unit is moving there, spawn it at OLD tile (fromIdx) if empty?
        // Or adjacent?
        // Let's spawn it at the RUIN location (targetTile) if we can stack? No, no stacking.
        // Spawn at the OLD location (fromIdx) since the moving unit vacates it!
        // Wait, fromIdx is vacated. Perfect.
        
        const spawnUnitDef = UNIT_DEFS[selectedReward.unitType];
        if (spawnUnitDef) {
           await ctx.db.insert("units", {
            gameId: game._id,
            playerId: player._id,
            type: selectedReward.unitType,
            x: unit.x, // Spawn at start location
            y: unit.y,
            hp: spawnUnitDef.hp,
            movesLeft: 0, // Freshly spawned units have no moves? Or full? Let's say 0 to prevent chain moves.
            maxMoves: spawnUnitDef.maxMoves,
            buildsLeft: spawnUnitDef.buildsLeft,
          });
          
          updatedMap[fromIdx] = {
             ...updatedMap[fromIdx],
             // We need to fetch the ID of the new unit? But insert returns ID.
             // We can't update map here because we don't have the ID yet in this flow easily?
             // Ah, `ctx.db.insert` returns ID.
             // But map update for `fromIdx` is already set to `unitId: undefined` above.
             // We need to re-set it.
          };
          // ... actually let's correct this.
          // Better logic: Spawn it at `fromIdx`.
          // We need the ID.
        }
      } else if (selectedReward.type === "map" && selectedReward.visionRadius) {
         revealAround(game, updatedMap, args.playerId, targetX, targetY, selectedReward.visionRadius);
      } else if (selectedReward.type === "tech" && selectedReward.techPoints) {
          // Grant flux equivalent to tech points?
          // For now, simplify: just give Flux resource for "tech" reward in this implementation,
          // or unlock a random cheap tech?
          // Let's just give Flux.
          const newResources = addResources(player.resources, { flux: 30 }); // 30 Flux flat
          await ctx.db.patch(player._id, { resources: newResources });
          rewardMessage += " (+30 Flux)";
      }

      // If unit reward, we need to handle the spawn properly.
      if (selectedReward.type === "unit" && selectedReward.unitType) {
         const spawnUnitDef = UNIT_DEFS[selectedReward.unitType];
         if (spawnUnitDef) {
             const newUnitId = await ctx.db.insert("units", {
              gameId: game._id,
              playerId: player._id,
              type: selectedReward.unitType,
              x: unit.x,
              y: unit.y,
              hp: spawnUnitDef.hp,
              movesLeft: 0,
              maxMoves: spawnUnitDef.maxMoves,
              buildsLeft: spawnUnitDef.buildsLeft,
            });
            // Update fromIdx tile to show new unit
            updatedMap[fromIdx] = {
              ...updatedMap[fromIdx],
              unitId: newUnitId,
            };
         }
      }

      // Convert Ruin to Surface or Rubble
      updatedMap[toIdx] = {
        ...updatedMap[toIdx],
        type: "surface", // Ruin cleared
      };
    }

    // Tank Crush ability: destroy enemy buildings on move
    let crushedBuilding = false;
    if (unitDef.abilities?.includes("crush") && targetTile.buildingId) {
      const building = await ctx.db.get(targetTile.buildingId);
      if (building && building.playerId !== args.playerId) {
        // Destroy enemy building
        await ctx.db.delete(targetTile.buildingId);
        updatedMap[toIdx] = {
          ...updatedMap[toIdx],
          buildingId: undefined,
          type: "surface", // Revert to base terrain
          unitId: unit._id,
        };
        crushedBuilding = true;
      }
    }

    if (!crushedBuilding) {
      updatedMap[toIdx] = {
        ...updatedMap[toIdx],
        unitId: unit._id,
      };
    }

    if (unitDef.vision !== undefined) {
      revealAround(game, updatedMap, args.playerId, targetX, targetY, unitDef.vision);
    }

    await ctx.db.patch(game._id, { map: updatedMap });
    await ctx.db.patch(unit._id, {
      x: targetX,
      y: targetY,
      movesLeft: unit.movesLeft - moveCost,
      entrenched: undefined, // Clear entrenched status when moving
    });

    return { x: targetX, y: targetY, moveCost, crushedBuilding, rewardMessage };
  },
});

export const foundCity = mutation({
  args: {
    unitId: v.id("units"),
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const unit = await ctx.db.get(args.unitId);
    if (!unit) {
      throw new Error("Unit not found");
    }
    if (unit.playerId !== args.playerId) {
      throw new Error("You do not control this unit");
    }
    if (unit.type !== "settler") {
      throw new Error("Only settlers can found cities");
    }

    const game = await getGameOrThrow(ctx, unit.gameId);
    assertPlayerTurn(game, args.playerId);
    const player = await getPlayerOrThrow(ctx, args.playerId);

    const buildDef = BUILDING_DEFS.city;
    if (!buildDef) {
      throw new Error("City definition missing");
    }

    const tileIndex = coordToIndex(game.width, unit.x, unit.y);
    const tile = game.map[tileIndex];
    if (tile.type === "water" || tile.type === "bedrock") {
      throw new Error("Cannot found a city here");
    }
    if (tile.buildingId) {
      throw new Error("Tile already has a building");
    }

    const updatedResources = subtractCost(player.resources, buildDef.cost);

    const buildingId = await ctx.db.insert("buildings", {
      gameId: game._id,
      playerId: player._id,
      type: "city",
      x: unit.x,
      y: unit.y,
      hp: buildDef.hp,
    });

    const mapCopy = [...game.map];
    mapCopy[tileIndex] = {
      ...mapCopy[tileIndex],
      type: "city",
      buildingId,
      unitId: undefined,
      resource: undefined,
    };
    if (buildDef.providesVision) {
      revealAround(game, mapCopy, player._id, unit.x, unit.y, buildDef.providesVision);
    }

    await Promise.all([
      ctx.db.patch(game._id, { map: mapCopy }),
      ctx.db.patch(player._id, { resources: updatedResources }),
      ctx.db.delete(unit._id),
    ]);
  },
});

export const spawnUnit = mutation({
  args: {
    playerId: v.id("players"),
    buildingId: v.id("buildings"),
    unitType: v.string(),
  },
  handler: async (ctx, args) => {
    const unitDef = UNIT_DEFS[args.unitType];
    if (!unitDef) {
      throw new Error("Unknown unit type");
    }

    const building = await ctx.db.get(args.buildingId);
    if (!building) {
      throw new Error("Building not found");
    }
    if (building.playerId !== args.playerId) {
      throw new Error("Cannot spawn from another player's building");
    }

    const buildingDef = BUILDING_DEFS[building.type];
    if (!buildingDef) {
      throw new Error("Unknown building type");
    }

    // Check if building can spawn units
    if (!buildingDef.canSpawnUnits) {
      throw new Error("This building cannot spawn units");
    }

    // Check if building can spawn this specific unit type
    if (buildingDef.spawnableUnits && !buildingDef.spawnableUnits.includes(args.unitType)) {
      throw new Error(`${buildingDef.name} cannot spawn ${unitDef.name}`);
    }

    const game = await getGameOrThrow(ctx, building.gameId);
    assertPlayerTurn(game, args.playerId);
    const player = await getPlayerOrThrow(ctx, args.playerId);

    // Check tech requirements
    if (unitDef.requiredTech && !player.techUnlocked.includes(unitDef.requiredTech)) {
      const techDef = TECH_DEFS[unitDef.requiredTech];
      throw new Error(`Requires ${techDef?.name ?? unitDef.requiredTech} technology`);
    }

    const updatedResources = subtractCost(player.resources, unitDef.cost);

    const spawnLocation = findSpawnTile(game, building, game.map, unitDef.canFly);
    if (!spawnLocation) {
      throw new Error("No adjacent tile available for spawning");
    }

    const unitId = await ctx.db.insert("units", {
      gameId: game._id,
      playerId: player._id,
      type: args.unitType,
      x: spawnLocation.x,
      y: spawnLocation.y,
      hp: unitDef.hp,
      movesLeft: unitDef.maxMoves,
      maxMoves: unitDef.maxMoves,
      buildsLeft: unitDef.buildsLeft,
    });

    const mapCopy = [...game.map];
    const spawnIdx = coordToIndex(game.width, spawnLocation.x, spawnLocation.y);
    mapCopy[spawnIdx] = {
      ...mapCopy[spawnIdx],
      unitId,
    };
    if (unitDef.vision) {
      revealAround(game, mapCopy, player._id, spawnLocation.x, spawnLocation.y, unitDef.vision);
    }

    await Promise.all([
      ctx.db.patch(player._id, { resources: updatedResources }),
      ctx.db.patch(game._id, { map: mapCopy }),
    ]);

    return unitId;
  },
});

export const toggleEntrench = mutation({
  args: {
    unitId: v.id("units"),
    playerId: v.id("players"),
    entrench: v.boolean(),
  },
  handler: async (ctx, args) => {
    const unit = await ctx.db.get(args.unitId);
    if (!unit) {
      throw new Error("Unit not found");
    }

    if (unit.playerId !== args.playerId) {
      throw new Error("You do not control this unit");
    }

    const game = await getGameOrThrow(ctx, unit.gameId);
    assertPlayerTurn(game, args.playerId);

    if (unit.type !== "marine") {
      throw new Error("Only Marines can entrench");
    }

    if (args.entrench && unit.movesLeft > 0) {
      throw new Error("Must use all movement points to entrench (move until 0 moves left)");
    }

    await ctx.db.patch(unit._id, {
      entrenched: args.entrench,
    });

    return { entrenched: args.entrench };
  },
});

export const toggleAutoExplore = mutation({
  args: {
    unitId: v.id("units"),
    playerId: v.id("players"),
    enable: v.boolean(),
  },
  handler: async (ctx, args) => {
    const unit = await ctx.db.get(args.unitId);
    if (!unit) {
      throw new Error("Unit not found");
    }

    if (unit.playerId !== args.playerId) {
      throw new Error("You do not control this unit");
    }

    if (unit.type !== "rover") {
      throw new Error("Only Rovers can auto-explore");
    }

    await ctx.db.patch(unit._id, {
      autoExplore: args.enable,
    });

    return { autoExplore: args.enable };
  },
});

export const getUnitActions = query({
  args: {
    unitId: v.id("units"),
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const unit = await ctx.db.get(args.unitId);
    if (!unit) {
      throw new Error("Unit not found");
    }

    const unitDef = UNIT_DEFS[unit.type];
    if (!unitDef) {
      return { canMove: false, canAttack: false, canFoundCity: false, abilities: [] };
    }

    const isOwner = unit.playerId === args.playerId;
    const game = await ctx.db.get(unit.gameId);
    const isMyTurn = game?.playerOrder[game.activePlayerIndex] === args.playerId;

    const canEntrench = isOwner && isMyTurn && unit.type === "marine" && unit.movesLeft === 0;

    return {
      canMove: isOwner && isMyTurn && unit.movesLeft > 0,
      canAttack: isOwner && isMyTurn && unit.movesLeft > 0 && unitDef.atk > 0,
      canFoundCity: isOwner && isMyTurn && unit.type === "settler",
      canEntrench: unit.type === "marine",
      isEntrenched: unit.entrenched ?? false,
      canAutoExplore: unit.type === "rover",
      isAutoExploring: unit.autoExplore ?? false,
      abilities: unitDef.abilities ?? [],
      stats: {
        hp: unit.hp,
        maxHp: unitDef.hp,
        movesLeft: unit.movesLeft,
        maxMoves: unitDef.maxMoves,
        atk: unitDef.atk,
        def: unitDef.def,
        range: unitDef.range,
        vision: unitDef.vision,
      },
    };
  },
});

export const directionToDelta = (direction: Direction) => {
  switch (direction) {
    case "L":
      return { dx: -1, dy: 0 };
    case "R":
      return { dx: 1, dy: 0 };
    case "U":
      return { dx: 0, dy: -1 };
    case "D":
      return { dx: 0, dy: 1 };
    default:
      return { dx: 0, dy: 0 };
  }
};

const findSpawnTile = (
  game: Doc<"games">,
  building: Doc<"buildings">,
  map: Doc<"games">["map"],
  canFly?: boolean,
) => {
  const candidates = [
    { x: building.x + 1, y: building.y },
    { x: building.x - 1, y: building.y },
    { x: building.x, y: building.y + 1 },
    { x: building.x, y: building.y - 1 },
  ];

  // For air units, also check sky tiles above
  if (canFly) {
    candidates.unshift({ x: building.x, y: building.y - 1 }); // Prefer sky
  }

  for (const candidate of candidates) {
    const wrappedX = wrapX(candidate.x, game.width);
    const clampedY = clampY(candidate.y, game.height);
    const idx = coordToIndex(game.width, wrappedX, clampedY);
    const tile = map[idx];
    const terrainDef = TERRAIN_DEFS[tile.type] ?? TERRAIN_DEFS.surface;

    // Skip occupied tiles
    if (tile.unitId !== undefined) continue;

    // Skip impassable terrain
    if (!terrainDef.passable) continue;

    // Ground units can't spawn in sky
    if (terrainDef.airOnly && !canFly) continue;

    return { x: wrappedX, y: clampedY };
  }
  return undefined;
};

