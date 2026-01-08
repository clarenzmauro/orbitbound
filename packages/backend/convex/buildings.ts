import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { BUILDING_DEFS, TECH_DEFS, UNIT_DEFS } from "./lib/constants";
import type { FactionId } from "./lib/constants";
import { assertPlayerTurn, getGameOrThrow, getPlayerOrThrow } from "./lib/gameHelpers";
import { coordToIndex, isAdjacent, wrapX, clampY } from "./lib/grid";
import { subtractCost } from "./lib/resources";
import { revealAround } from "./lib/vision";

/**
 * Start construction on a tile.
 * Worker must be on the tile to begin construction.
 */
export const placeBuilding = mutation({
  args: {
    playerId: v.id("players"),
    workerId: v.id("units"),
    buildingType: v.string(),
    targetX: v.number(),
    targetY: v.number(),
  },
  handler: async (ctx, args) => {
    const buildingDef = BUILDING_DEFS[args.buildingType];
    if (!buildingDef) {
      throw new Error("Unknown building type");
    }

    // Check that city (founded by settler) is instant, all others require workers
    if (args.buildingType !== "city") {
      const worker = await ctx.db.get(args.workerId);
      if (!worker) {
        throw new Error("Worker not found");
      }

      if (worker.playerId !== args.playerId) {
        throw new Error("You do not control this worker");
      }

      if (worker.type !== "worker") {
        throw new Error("Only Workers can build structures");
      }

      if (!worker.buildsLeft || worker.buildsLeft <= 0) {
        throw new Error("Worker has no builds left. Spawn a new Worker from a City.");
      }

      const game = await getGameOrThrow(ctx, worker.gameId);
      assertPlayerTurn(game, args.playerId);
      const player = await getPlayerOrThrow(ctx, args.playerId);

      // Worker must be on the target tile
      const targetX = wrapX(args.targetX, game.width);
      const targetY = clampY(args.targetY, game.height);

      if (worker.x !== targetX || worker.y !== targetY) {
        throw new Error("Worker must be on tile to start construction");
      }

      const targetIdx = coordToIndex(game.width, targetX, targetY);
      const tile = game.map[targetIdx];

      if (tile.unitId !== worker._id) {
        throw new Error("Worker must be alone on tile");
      }

      if (tile.buildingId) {
        throw new Error("Tile already has a building");
      }

      if (tile.type === "water" || tile.type === "bedrock") {
        throw new Error("Cannot build here");
      }

      // Check tech requirements
      if (buildingDef.requiredTech && !player.techUnlocked.includes(buildingDef.requiredTech)) {
        const techDef = TECH_DEFS[buildingDef.requiredTech];
        throw new Error(`Requires ${techDef?.name ?? buildingDef.requiredTech} technology`);
      }

      // Check terrain requirements
      if (buildingDef.terrainRequired && !buildingDef.terrainRequired.includes(tile.type)) {
        throw new Error(
          `${buildingDef.name} can only be built on: ${buildingDef.terrainRequired.join(", ")}`
        );
      }

      // Check resource requirements (e.g., Mine must be on ore deposit)
      if (buildingDef.requiresResource && tile.resource !== buildingDef.requiresResource) {
        throw new Error(
          `${buildingDef.name} must be built on a ${buildingDef.requiresResource} deposit`
        );
      }

      // Check if can afford
      const updatedResources = subtractCost(player.resources, buildingDef.cost);

      // Start construction
      const turnsToComplete = buildingDef.turnsToComplete ?? 1;

      const buildingId = await ctx.db.insert("buildings", {
        gameId: game._id,
        playerId: player._id,
        type: args.buildingType,
        x: targetX,
        y: targetY,
        hp: 0, // Start with 0 HP during construction
        buildProgress: 0,
        turnsToComplete,
        workerId: worker._id,
        isConstructing: true,
      });

      const mapCopy = [...game.map];
      mapCopy[targetIdx] = {
        ...mapCopy[targetIdx],
        type: "construction",
        buildingId,
      };

      // Use up one build from worker
      await Promise.all([
        ctx.db.patch(player._id, { resources: updatedResources }),
        ctx.db.patch(game._id, { map: mapCopy }),
        ctx.db.patch(worker._id, { movesLeft: 0, buildsLeft: worker.buildsLeft - 1 }),
      ]);

      return buildingId;
    }

    // City is founded by settler, handled separately in foundCity mutation
    throw new Error("Cities are founded by Settlers, not Workers");
  },
});

/**
 * Continue construction on a building.
 * Worker must be on same tile as the building under construction.
 */
export const continueBuilding = mutation({
  args: {
    playerId: v.id("players"),
    workerId: v.id("units"),
  },
  handler: async (ctx, args) => {
    const worker = await ctx.db.get(args.workerId);
    if (!worker) {
      throw new Error("Worker not found");
    }

    if (worker.playerId !== args.playerId) {
      throw new Error("You do not control this worker");
    }

    if (worker.type !== "worker") {
      throw new Error("Only Workers can continue construction");
    }

    const game = await getGameOrThrow(ctx, worker.gameId);
    assertPlayerTurn(game, args.playerId);

    // Find building on worker's tile
    const idx = coordToIndex(game.width, worker.x, worker.y);
    const tile = game.map[idx];

    if (!tile.buildingId) {
      throw new Error("No building on this tile");
    }

    const building = await ctx.db.get(tile.buildingId);
    if (!building) {
      throw new Error("Building not found");
    }

    if (!building.isConstructing) {
      throw new Error("This building is already complete");
    }

    if (building.workerId !== worker._id) {
      throw new Error("Only the worker who started construction can continue it");
    }

    const buildingDef = BUILDING_DEFS[building.type];
    if (!buildingDef) {
      throw new Error("Unknown building type");
    }

    // Increment progress
    const newProgress = (building.buildProgress ?? 0) + 1;
    const isComplete = newProgress >= (building.turnsToComplete ?? 1);

    if (isComplete) {
      // Building complete!
      const mapCopy = [...game.map];

      // Delete building with isConstructing flag and replace with final version
      await ctx.db.delete(building._id);

      const completedBuildingId = await ctx.db.insert("buildings", {
        gameId: game._id,
        playerId: building.playerId,
        type: building.type,
        x: building.x,
        y: building.y,
        hp: buildingDef.hp,
      });

      mapCopy[idx] = {
        ...mapCopy[idx],
        type: building.type,
        buildingId: completedBuildingId,
      };

      if (buildingDef.providesVision) {
        revealAround(game, mapCopy, args.playerId, building.x, building.y, buildingDef.providesVision);
      }

      await Promise.all([
        ctx.db.patch(game._id, { map: mapCopy }),
        ctx.db.patch(worker._id, { movesLeft: 0 }),
      ]);

      return { complete: true, buildingId: completedBuildingId };
    } else {
      // Still building
      await ctx.db.patch(building._id, {
        buildProgress: newProgress,
      });

      // Worker uses their action
      await ctx.db.patch(worker._id, { movesLeft: 0 });

      return { complete: false, progress: newProgress, total: building.turnsToComplete };
    }
  },
});

export const getBuildableBuildings = query({
  args: {
    playerId: v.id("players"),
    cityId: v.id("buildings"),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) {
      throw new Error("Player not found");
    }

    const city = await ctx.db.get(args.cityId);
    if (!city || city.type !== "city") {
      throw new Error("City not found");
    }

    const game = await ctx.db.get(city.gameId);
    if (!game) {
      throw new Error("Game not found");
    }

    const buildable: Array<{
      type: string;
      name: string;
      cost: typeof BUILDING_DEFS[string]["cost"];
      canAfford: boolean;
      techUnlocked: boolean;
      terrainRequired: string[] | undefined;
      turnsToComplete: number;
    }> = [];

    for (const [type, def] of Object.entries(BUILDING_DEFS)) {
      // Skip city (founded by settler)
      if (type === "city") continue;

      const techUnlocked = !def.requiredTech || player.techUnlocked.includes(def.requiredTech);
      const canAfford =
        (def.cost.biomass ?? 0) <= player.resources.biomass &&
        (def.cost.ore ?? 0) <= player.resources.ore &&
        (def.cost.flux ?? 0) <= player.resources.flux;

      buildable.push({
        type,
        name: def.name,
        cost: def.cost,
        canAfford,
        techUnlocked,
        terrainRequired: def.terrainRequired,
        turnsToComplete: def.turnsToComplete ?? 1,
      });
    }

    return buildable;
  },
});

/**
 * Get buildable buildings for a Worker unit.
 * Unlike getBuildableBuildings, this doesn't require a city reference.
 */
export const getWorkerBuildableBuildings = query({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) {
      throw new Error("Player not found");
    }

    const buildable: Array<{
      type: string;
      name: string;
      cost: typeof BUILDING_DEFS[string]["cost"];
      canAfford: boolean;
      techUnlocked: boolean;
      terrainRequired: string[] | undefined;
      turnsToComplete: number;
    }> = [];

    for (const [type, def] of Object.entries(BUILDING_DEFS)) {
      // Skip city (founded by settler) and barracks (requires building from city)
      if (type === "city") continue;

      const techUnlocked = !def.requiredTech || player.techUnlocked.includes(def.requiredTech);
      const canAfford =
        (def.cost.biomass ?? 0) <= player.resources.biomass &&
        (def.cost.ore ?? 0) <= player.resources.ore &&
        (def.cost.flux ?? 0) <= player.resources.flux;

      buildable.push({
        type,
        name: def.name,
        cost: def.cost,
        canAfford,
        techUnlocked,
        terrainRequired: def.terrainRequired,
        turnsToComplete: def.turnsToComplete ?? 1,
      });
    }

    return buildable;
  },
});

export const getSpawnableUnits = query({
  args: {
    playerId: v.id("players"),
    buildingId: v.id("buildings"),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) {
      throw new Error("Player not found");
    }

    const building = await ctx.db.get(args.buildingId);
    if (!building) {
      throw new Error("Building not found");
    }

    if (building.isConstructing) {
      return []; // Cannot spawn from buildings under construction
    }

    const buildingDef = BUILDING_DEFS[building.type];
    if (!buildingDef || !buildingDef.canSpawnUnits) {
      return [];
    }

    const spawnable: Array<{
      type: string;
      name: string;
      cost: typeof UNIT_DEFS[string]["cost"];
      canAfford: boolean;
      techUnlocked: boolean;
      stats: { hp: number; atk: number; def: number; range: number; maxMoves: number };
    }> = [];

    const allowedUnits = buildingDef.spawnableUnits ?? Object.keys(UNIT_DEFS);

    for (const unitType of allowedUnits) {
      const unitDef = UNIT_DEFS[unitType];
      if (!unitDef) continue;

      const techUnlocked = !unitDef.requiredTech || player.techUnlocked.includes(unitDef.requiredTech);
      const canAfford =
        (unitDef.cost.biomass ?? 0) <= player.resources.biomass &&
        (unitDef.cost.ore ?? 0) <= player.resources.ore &&
        (unitDef.cost.flux ?? 0) <= player.resources.flux;

      spawnable.push({
        type: unitType,
        name: unitDef.name,
        cost: unitDef.cost,
        canAfford,
        techUnlocked,
        stats: {
          hp: unitDef.hp,
          atk: unitDef.atk,
          def: unitDef.def,
          range: unitDef.range,
          maxMoves: unitDef.maxMoves,
        },
      });
    }

    return spawnable;
  },
});
