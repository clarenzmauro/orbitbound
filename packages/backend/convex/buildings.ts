import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { BUILDING_DEFS, TECH_DEFS, UNIT_DEFS } from "./lib/constants";
import type { FactionId } from "./lib/constants";
import { assertPlayerTurn, getGameOrThrow, getPlayerOrThrow } from "./lib/gameHelpers";
import { coordToIndex, isAdjacent, wrapX, clampY } from "./lib/grid";
import { subtractCost } from "./lib/resources";
import { revealAround } from "./lib/vision";

export const placeBuilding = mutation({
  args: {
    playerId: v.id("players"),
    cityId: v.id("buildings"),
    buildingType: v.string(),
    targetX: v.number(),
    targetY: v.number(),
  },
  handler: async (ctx, args) => {
    const buildingDef = BUILDING_DEFS[args.buildingType];
    if (!buildingDef) {
      throw new Error("Unknown building type");
    }

    const city = await ctx.db.get(args.cityId);
    if (!city || city.type !== "city") {
      throw new Error("City not found");
    }

    if (city.playerId !== args.playerId) {
      throw new Error("You do not control this city");
    }

    const game = await getGameOrThrow(ctx, city.gameId);
    assertPlayerTurn(game, args.playerId);
    const player = await getPlayerOrThrow(ctx, args.playerId);

    // Check tech requirements
    if (buildingDef.requiredTech && !player.techUnlocked.includes(buildingDef.requiredTech)) {
      const techDef = TECH_DEFS[buildingDef.requiredTech];
      throw new Error(`Requires ${techDef?.name ?? buildingDef.requiredTech} technology`);
    }

    const targetX = wrapX(args.targetX, game.width);
    const targetY = clampY(args.targetY, game.height);

    // Get all player's buildings to check adjacency
    const playerBuildings = await ctx.db
      .query("buildings")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();

    // Check if target is adjacent to ANY of the player's buildings (allows expansion)
    const isAdjacentToOwned = playerBuildings.some((b) =>
      isAdjacent(game.width, b.x, b.y, targetX, targetY)
    );

    if (!isAdjacentToOwned) {
      throw new Error("Target tile must be adjacent to one of your buildings");
    }

    const targetIdx = coordToIndex(game.width, targetX, targetY);
    const tile = game.map[targetIdx];

    if (tile.unitId || tile.buildingId) {
      throw new Error("Tile is occupied");
    }
    if (tile.type === "water" || tile.type === "bedrock") {
      throw new Error("Cannot build here");
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

    const updatedResources = subtractCost(player.resources, buildingDef.cost);

    const buildingId = await ctx.db.insert("buildings", {
      gameId: game._id,
      playerId: player._id,
      type: args.buildingType,
      x: targetX,
      y: targetY,
      hp: buildingDef.hp,
    });

    const mapCopy = [...game.map];
    mapCopy[targetIdx] = {
      ...mapCopy[targetIdx],
      type: args.buildingType,
      buildingId,
      resource: undefined,
    };

    if (buildingDef.providesVision) {
      revealAround(game, mapCopy, player._id, targetX, targetY, buildingDef.providesVision);
    }

    await Promise.all([
      ctx.db.patch(player._id, { resources: updatedResources }),
      ctx.db.patch(game._id, { map: mapCopy }),
    ]);

    return buildingId;
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

