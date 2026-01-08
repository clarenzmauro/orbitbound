"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@orbitbound/backend/convex/_generated/api";
import type { Id } from "@orbitbound/backend/convex/_generated/dataModel";
import { useCallback, useMemo } from "react";
import type { Tile, GameState, Player, Unit, Building, Direction } from "@/types/game";

// ─────────────────────────────────────────────────────────────────────────────
// Game State Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useGameState(gameId: Id<"games"> | undefined, playerId: Id<"players"> | undefined) {
  const rawGameState = useQuery(
    api.world.getGameState,
    gameId && playerId ? { gameId, playerId } : "skip"
  );

  // Transform the raw Convex data into our frontend types
  const gameState = useMemo(() => {
    if (!rawGameState) return null;

    const { game, players, units, buildings } = rawGameState;

    // Transform map tiles to include x, y coordinates and virtual IDs
    const transformedMap: Tile[] = game.map.map((tile, index) => {
      const x = index % game.width;
      const y = Math.floor(index / game.width);
      return {
        id: `${x}-${y}`,
        x,
        y,
        type: tile.type as Tile["type"],
        resource: tile.resource as Tile["resource"],
        buildingId: tile.buildingId,
        unitId: tile.unitId,
        visibility: tile.visibility as string[],
      };
    });

    const transformedGame: GameState = {
      _id: game._id,
      status: game.status as GameState["status"],
      turn: game.turn,
      activePlayerIndex: game.activePlayerIndex,
      width: game.width,
      height: game.height,
      seed: game.seed,
      map: transformedMap,
      playerOrder: game.playerOrder as string[],
      createdAt: game.createdAt,
    };

    return {
      game: transformedGame,
      players: players as Player[],
      units: units as Unit[],
      buildings: buildings as Building[],
    };
  }, [rawGameState]);

  return gameState;
}

// ─────────────────────────────────────────────────────────────────────────────
// Game Actions Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useGameActions() {
  const moveUnit = useMutation(api.units.move);
  const foundCity = useMutation(api.units.foundCity);
  const spawnUnit = useMutation(api.units.spawnUnit);
  const attack = useMutation(api.combat.attack);
  const placeBuilding = useMutation(api.buildings.placeBuilding);
  const continueBuilding = useMutation(api.buildings.continueBuilding);
  const collectResource = useMutation(api.economy.collectResource);
  const endTurn = useMutation(api.economy.endTurn);
  const researchTech = useMutation(api.tech.researchTech);
  const toggleEntrench = useMutation(api.units.toggleEntrench);

  return {
    moveUnit: useCallback(
      (unitId: Id<"units">, playerId: Id<"players">, direction: Direction) =>
        moveUnit({ unitId, playerId, direction }),
      [moveUnit]
    ),
    foundCity: useCallback(
      (unitId: Id<"units">, playerId: Id<"players">) =>
        foundCity({ unitId, playerId }),
      [foundCity]
    ),
    spawnUnit: useCallback(
      (playerId: Id<"players">, buildingId: Id<"buildings">, unitType: string) =>
        spawnUnit({ playerId, buildingId, unitType }),
      [spawnUnit]
    ),
    attack: useCallback(
      (attackerUnitId: Id<"units">, playerId: Id<"players">, targetX: number, targetY: number) =>
        attack({ attackerUnitId, playerId, targetX, targetY }),
      [attack]
    ),
    placeBuilding: useCallback(
      (
        playerId: Id<"players">,
        workerId: Id<"units">,
        buildingType: string,
        targetX: number,
        targetY: number
      ) => placeBuilding({ playerId, workerId, buildingType, targetX, targetY }),
      [placeBuilding]
    ),
    continueBuilding: useCallback(
      (playerId: Id<"players">, workerId: Id<"units">) =>
        continueBuilding({ playerId, workerId }),
      [continueBuilding]
    ),
    collectResource: useCallback(
      (playerId: Id<"players">, x: number, y: number) =>
        collectResource({ playerId, x, y }),
      [collectResource]
    ),
    endTurn: useCallback(
      (gameId: Id<"games">, playerId: Id<"players">) =>
        endTurn({ gameId, playerId }),
      [endTurn]
    ),
    researchTech: useCallback(
      (playerId: Id<"players">, techId: string) =>
        researchTech({ playerId, techId }),
      [researchTech]
    ),
    toggleEntrench: useCallback(
      (unitId: Id<"units">, playerId: Id<"players">, entrench: boolean) =>
        toggleEntrench({ unitId, playerId, entrench }),
      [toggleEntrench]
    ),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lobby Actions Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useLobbyActions() {
  const generateWorld = useMutation(api.world.generateWorld);
  const joinGame = useMutation(api.players.joinGame);
  const startGame = useMutation(api.game.startGame);
  const listOpenGames = useQuery(api.game.listOpenGames);

  return {
    createGame: useCallback(
      (width: number, height: number, seed?: number) =>
        generateWorld({ width, height, seed }),
      [generateWorld]
    ),
    joinGame: useCallback(
      (gameId: Id<"games">, faction: string, userId?: string) =>
        joinGame({ gameId, faction, userId }),
      [joinGame]
    ),
    startGame: useCallback(
      (gameId: Id<"games">, hostPlayerId: Id<"players">) =>
        startGame({ gameId, hostPlayerId }),
      [startGame]
    ),
    openGames: listOpenGames ?? [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tech Tree Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useTechTree(playerId: Id<"players"> | undefined) {
  const techTree = useQuery(
    api.tech.getAvailableTech,
    playerId ? { playerId } : "skip"
  );

  return techTree ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Unit Actions Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useUnitActions(unitId: Id<"units"> | undefined, playerId: Id<"players"> | undefined) {
  const actions = useQuery(
    api.units.getUnitActions,
    unitId && playerId ? { unitId, playerId } : "skip"
  );

  return actions;
}

// ─────────────────────────────────────────────────────────────────────────────
// Building Info Hooks
// ─────────────────────────────────────────────────────────────────────────────

export function useBuildableBuildings(playerId: Id<"players"> | undefined, cityId: Id<"buildings"> | undefined) {
  const buildings = useQuery(
    api.buildings.getBuildableBuildings,
    playerId && cityId ? { playerId, cityId } : "skip"
  );

  // Transform to frontend format
  return useMemo(() => {
    if (!buildings) return [];
    return buildings
      .filter(b => b.techUnlocked)
      .map(b => ({
        buildingType: b.type,
        name: b.name,
        cost: b.cost,
        canAfford: b.canAfford,
        terrainRequired: b.terrainRequired,
      }));
  }, [buildings]);
}

/**
 * Get buildings a Worker can construct (no city required)
 */
export function useWorkerBuildableBuildings(playerId: Id<"players"> | undefined) {
  const buildings = useQuery(
    api.buildings.getWorkerBuildableBuildings,
    playerId ? { playerId } : "skip"
  );

  return useMemo(() => {
    if (!buildings) return [];
    return buildings
      .filter(b => b.techUnlocked)
      .map(b => ({
        buildingType: b.type,
        name: b.name,
        cost: b.cost,
        canAfford: b.canAfford,
        terrainRequired: b.terrainRequired,
        turnsToComplete: b.turnsToComplete,
      }));
  }, [buildings]);
}

export function useSpawnableUnits(playerId: Id<"players"> | undefined, buildingId: Id<"buildings"> | undefined) {
  const units = useQuery(
    api.buildings.getSpawnableUnits,
    playerId && buildingId ? { playerId, buildingId } : "skip"
  );

  // Transform to frontend format
  return useMemo(() => {
    if (!units) return [];
    return units
      // .filter(u => u.techUnlocked) // Filter removed for debugging
      .map(u => ({
        unitType: u.type,
        name: u.name,
        cost: u.cost,
        canAfford: u.canAfford,
        techUnlocked: u.techUnlocked,
        stats: u.stats,
      }));
  }, [units]);
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Player Hooks
// ─────────────────────────────────────────────────────────────────────────────

export function useAIActions() {
  const addAIMutation = useMutation(api.players.addAIPlayer);
  const removeAIMutation = useMutation(api.players.removeAIPlayer);

  const addAIPlayer = useCallback(
    async (gameId: Id<"games">, difficulty: "easy" | "medium" | "hard") => {
      return await addAIMutation({ gameId, difficulty });
    },
    [addAIMutation]
  );

  const removeAIPlayer = useCallback(
    async (gameId: Id<"games">, playerId: Id<"players">) => {
      return await removeAIMutation({ gameId, playerId });
    },
    [removeAIMutation]
  );

  return { addAIPlayer, removeAIPlayer };
}

