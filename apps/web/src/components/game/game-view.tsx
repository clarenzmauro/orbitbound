"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import type { GameState, Player, Unit, Tile, Building, Direction } from "@/types/game";
import { WorldStrip } from "./world-strip";
import { ResourceBar } from "./resource-bar";
import { GameNotifications, useGameNotifications } from "./game-notifications";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft, ChevronRight, Crosshair, Home, ArrowRight, Loader2,
  Swords, Shield, Factory, Wheat, Pickaxe, Sun, Rocket, X, Zap,
  FlaskConical, Users, Building2, Target, Info, Keyboard, TrendingUp,
  Heart, Move, Eye, CircleDot, HelpCircle, Bot, Hammer
} from "lucide-react";
import { useGameActions, useTechTree, useSpawnableUnits, useBuildableBuildings, useWorkerBuildableBuildings } from "@/lib/game-hooks";
import type { Id } from "@orbitbound/backend/convex/_generated/dataModel";

interface GameViewProps {
  game: GameState;
  player: Player;
  units: Unit[];
  buildings: Building[];
  allPlayers: Player[];
}

const VIEWPORT_WIDTH = 26;

// Unit definitions for display
const UNIT_INFO: Record<string, { desc: string; biomass?: number; ore?: number; flux?: number }> = {
  settler: { desc: "Founds cities. Your starting unit.", },
  worker: { desc: "Builds improvements on tiles.", biomass: 5 },
  marine: { desc: "Basic infantry. Can entrench for +2 DEF.", biomass: 10, ore: 5 },
  rover: { desc: "Fast scout with extended vision.", ore: 10 },
  tank: { desc: "Heavy armor. Crushes enemy buildings.", ore: 25 },
  arty: { desc: "Long range siege. Range 4, Arc Fire.", ore: 30, flux: 10 },
  gunship: { desc: "Air unit. Ignores terrain costs.", ore: 40, flux: 20 },
};

// Unit combat stats matching plan.md specifications
const UNIT_STATS: Record<string, { atk: number; def: number; range: number; vision: number }> = {
  settler: { atk: 0, def: 0, range: 1, vision: 3 },
  worker: { atk: 0, def: 0, range: 1, vision: 2 },
  marine: { atk: 5, def: 3, range: 1, vision: 2 },
  rover: { atk: 2, def: 1, range: 1, vision: 4 },
  tank: { atk: 8, def: 6, range: 1, vision: 2 },
  arty: { atk: 12, def: 1, range: 4, vision: 3 },
  gunship: { atk: 10, def: 2, range: 1, vision: 4 },
};

const BUILDING_INFO: Record<string, { desc: string; income?: string; biomass?: number; ore?: number; flux?: number }> = {
  city: { desc: "Your headquarters. Spawns units and builds structures.", income: "+2 Biomass, +2 Ore" },
  farm: { desc: "Agricultural production on surface/dirt.", income: "+2 Biomass", ore: 10 },
  mine: { desc: "Extract ore from deposits.", income: "+2 Ore", biomass: 10 },
  solar_array: { desc: "Generate flux energy.", income: "+1 Flux", ore: 15 },
  bunker: { desc: "Defensive structure. +5 DEF to units.", ore: 20 },
  barracks: { desc: "Train infantry units.", ore: 15 },
  factory: { desc: "Produce heavy vehicles.", ore: 30 },
  skyport: { desc: "Launch air units.", ore: 40, flux: 20 },
  silo: { desc: "End-game structure. Launch The Ark!", ore: 100, flux: 50 },
};

export function GameView({ game, player, units, buildings, allPlayers }: GameViewProps) {
  const [cameraX, setCameraX] = useState(0);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasInitializedCamera, setHasInitializedCamera] = useState(false);

  // UI State
  const [showTechTree, setShowTechTree] = useState(false);
  const [showSpawnMenu, setShowSpawnMenu] = useState(false);
  const [showBuildMenu, setShowBuildMenu] = useState(false);
  const [attackMode, setAttackMode] = useState(false);
  const [buildingPlacementMode, setBuildingPlacementMode] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const actions = useGameActions();
  const techTree = useTechTree(player._id as Id<"players">);
  const { notifications, dismissNotification, notify } = useGameNotifications();

  // Get selected tile info
  const selectedTile = useMemo(() => {
    if (!selectedTileId) return null;
    return game.map.find((t) => t.id === selectedTileId || t.id === selectedTileId.replace("-ghost", ""));
  }, [selectedTileId, game.map]);

  // Get unit on selected tile
  const selectedUnit = useMemo(() => {
    if (!selectedTile?.unitId) return null;
    return units.find((u) => u._id === selectedTile.unitId);
  }, [selectedTile, units]);

  // Get building on selected tile
  const selectedBuilding = useMemo(() => {
    if (!selectedTile?.buildingId) return null;
    return buildings.find((b) => b._id === selectedTile.buildingId);
  }, [selectedTile, buildings]);

  // Check if the building belongs to current player
  const isMyBuilding = selectedBuilding?.playerId === player._id;

  // Get spawnable units for selected building
  const spawnableUnits = useSpawnableUnits(
    player._id as Id<"players">,
    isMyBuilding && selectedBuilding ? selectedBuilding._id as Id<"buildings"> : undefined
  );

  // Get buildable buildings from city
  const buildableBuildings = useBuildableBuildings(
    player._id as Id<"players">,
    isMyBuilding && selectedBuilding?.type === "city" ? selectedBuilding._id as Id<"buildings"> : undefined
  );

  // Get buildable buildings for Workers (no city needed)
  const workerBuildableBuildings = useWorkerBuildableBuildings(
    player._id as Id<"players">
  );

  // Check if it's the current player's turn
  const isMyTurn = useMemo(() => {
    const activePlayerId = game.playerOrder[game.activePlayerIndex];
    return activePlayerId === player._id;
  }, [game.activePlayerIndex, game.playerOrder, player._id]);

  // Check if selected unit belongs to current player
  const isMyUnit = selectedUnit?.playerId === player._id;

  // Calculate player's income
  const playerIncome = useMemo(() => {
    const playerBuildings = buildings.filter(b => b.playerId === player._id);
    let biomass = 0, ore = 0, flux = 0;

    for (const b of playerBuildings) {
      if (b.type === "city") { biomass += 2; ore += 2; }
      if (b.type === "farm") { biomass += 2; }
      if (b.type === "mine") { ore += 2; }
      if (b.type === "solar_array") { flux += 1; }
    }

    return { biomass, ore, flux };
  }, [buildings, player._id]);

  // Helper to get tile at (x, y)
  const getTile = useCallback(
    (x: number, y: number) => {
      const index = y * game.width + x;
      return game.map[index];
    },
    [game]
  );

  // Get valid movement tiles for selected unit
  const validMoveTiles = useMemo(() => {
    if (!selectedUnit || !isMyUnit || !isMyTurn || selectedUnit.movesLeft <= 0) return new Set<string>();

    const tiles = new Set<string>();
    const directions = [
      { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
      { dx: 0, dy: -1 }, { dx: 0, dy: 1 }
    ];

    for (const { dx, dy } of directions) {
      const nx = (selectedUnit.x + dx + game.width) % game.width;
      const ny = Math.max(0, Math.min(game.height - 1, selectedUnit.y + dy));
      const tile = getTile(nx, ny);
      if (tile && tile.type !== "bedrock" && tile.type !== "fog" && !tile.unitId) {
        tiles.add(`${nx}-${ny}`);
      }
    }

    return tiles;
  }, [selectedUnit, isMyUnit, isMyTurn, game.width, game.height, getTile]);

  // Get valid attack tiles
  const validAttackTiles = useMemo(() => {
    if (!selectedUnit || !isMyUnit || !isMyTurn || !attackMode) return new Set<string>();

    const tiles = new Set<string>();
    const range = selectedUnit.type === "arty" ? 4 : 1;

    for (let dx = -range; dx <= range; dx++) {
      for (let dy = -range; dy <= range; dy++) {
        if (dx === 0 && dy === 0) continue;
        if (Math.abs(dx) + Math.abs(dy) > range) continue;

        const nx = (selectedUnit.x + dx + game.width) % game.width;
        const ny = Math.max(0, Math.min(game.height - 1, selectedUnit.y + dy));
        const tile = getTile(nx, ny);

        if (tile) {
          // Check for enemy units or buildings
          const enemyUnit = units.find(u => u.x === nx && u.y === ny && u.playerId !== player._id);
          const enemyBuilding = buildings.find(b => b.x === nx && b.y === ny && b.playerId !== player._id);

          if (enemyUnit || enemyBuilding) {
            tiles.add(`${nx}-${ny}`);
          }
        }
      }
    }

    return tiles;
  }, [selectedUnit, isMyUnit, isMyTurn, attackMode, game.width, game.height, getTile, units, buildings, player._id]);

  // Get valid build tiles (adjacent to ANY of player's buildings)
  const validBuildTiles = useMemo(() => {
    if (!buildingPlacementMode) return new Set<string>();

    const tiles = new Set<string>();
    const directions = [
      { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
      { dx: 0, dy: -1 }, { dx: 0, dy: 1 }
    ];

    // Get all player's buildings
    const myBuildings = buildings.filter(b => b.playerId === player._id);

    // Check tiles adjacent to each of player's buildings
    for (const building of myBuildings) {
      for (const { dx, dy } of directions) {
        const nx = (building.x + dx + game.width) % game.width;
        const ny = Math.max(0, Math.min(game.height - 1, building.y + dy));
        const tile = getTile(nx, ny);

        if (tile && !tile.unitId && !tile.buildingId &&
          tile.type !== "bedrock" && tile.type !== "water" && tile.type !== "fog") {
          tiles.add(`${nx}-${ny}`);
        }
      }
    }

    return tiles;
  }, [buildingPlacementMode, buildings, player._id, game.width, game.height, getTile]);

  // Center camera on player's first unit when game loads
  useEffect(() => {
    if (hasInitializedCamera) return;

    const playerUnit = units.find((u) => u.playerId === player._id);
    const playerBuilding = buildings.find((b) => b.playerId === player._id);

    const target = playerUnit || playerBuilding;
    if (target) {
      const centerOffset = Math.floor(VIEWPORT_WIDTH / 2);
      const newCameraX = (target.x - centerOffset + game.width) % game.width;
      setCameraX(newCameraX);
      setHasInitializedCamera(true);
    }
  }, [units, buildings, player._id, game.width, hasInitializedCamera]);

  // Generate visible columns based on cameraX
  const visibleColumns: Tile[][] = useMemo(() => {
    const columns: Tile[][] = [];
    for (let i = 0; i < VIEWPORT_WIDTH; i++) {
      const x = (cameraX + i) % game.width;
      const column: Tile[] = [];
      for (let y = 0; y < game.height; y++) {
        const tile = getTile(x, y);
        if (tile) {
          const isGhost = cameraX + i >= game.width;
          column.push({
            ...tile,
            id: isGhost ? `${tile.id}-ghost` : tile.id,
          });
        }
      }
      columns.push(column);
    }
    return columns;
  }, [cameraX, game.width, game.height, getTile]);

  // Camera Controls
  const moveCamera = useCallback(
    (direction: "left" | "right") => {
      setCameraX((prev) => {
        if (direction === "left") {
          return (prev - 1 + game.width) % game.width;
        } else {
          return (prev + 1) % game.width;
        }
      });
    },
    [game.width]
  );

  // Keyboard Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if unit can be controlled with WASD
      const canControlUnit = selectedUnit && isMyUnit && isMyTurn && selectedUnit.movesLeft > 0 && !isLoading;

      // Unit movement with WASD when unit selected (takes priority over camera)
      if (canControlUnit) {
        if (e.key === "w" || e.key === "W") { handleMoveUnit("U"); return; }
        if (e.key === "a" || e.key === "A") { handleMoveUnit("L"); return; }
        if (e.key === "s" || e.key === "S") { handleMoveUnit("D"); return; }
        if (e.key === "d" || e.key === "D") { handleMoveUnit("R"); return; }
      }

      // Camera movement (Arrow keys always work, A/D only when no unit selected)
      if (e.key === "ArrowLeft") moveCamera("left");
      if (e.key === "ArrowRight") moveCamera("right");
      if (!canControlUnit) {
        if (e.key === "a" || e.key === "A") moveCamera("left");
        if (e.key === "d" || e.key === "D") moveCamera("right");
      }

      // Cancel actions
      if (e.key === "Escape") {
        setSelectedTileId(null);
        setAttackMode(false);
        setBuildingPlacementMode(null);
        setShowTechTree(false);
        setShowSpawnMenu(false);
        setShowBuildMenu(false);
        setShowHelp(false);
      }

      // Quick actions
      if (e.key === "t" || e.key === "T") setShowTechTree(prev => !prev);
      if (e.key === "?" || e.key === "h") setShowHelp(prev => !prev);
      if (e.key === "e" || e.key === "E") {
        if (isMyTurn && !isLoading) handleEndTurn();
      }
      // Center camera on selected unit/building
      if (e.key === "c" || e.key === "C") {
        const target = selectedUnit || (selectedBuilding && isMyBuilding ? selectedBuilding : null);
        if (target) {
          const centerOffset = Math.floor(VIEWPORT_WIDTH / 2);
          setCameraX((target.x - centerOffset + game.width) % game.width);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [moveCamera, selectedUnit, isMyUnit, isMyTurn, isLoading, selectedBuilding, isMyBuilding, game.width]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Game Actions
  // ─────────────────────────────────────────────────────────────────────────────

  const handleMoveUnit = async (direction: Direction) => {
    if (!selectedUnit || !isMyTurn || !isMyUnit) return;

    setIsLoading(true);
    try {
      await actions.moveUnit(
        selectedUnit._id as Id<"units">,
        player._id as Id<"players">,
        direction
      );
      // No notification for movement - too spammy
    } catch (error) {
      notify.error("Move Failed", error instanceof Error ? error.message : "Cannot move there");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFoundCity = async () => {
    if (!selectedUnit || selectedUnit.type !== "settler" || !isMyTurn || !isMyUnit) return;

    setIsLoading(true);
    try {
      await actions.foundCity(
        selectedUnit._id as Id<"units">,
        player._id as Id<"players">
      );
      notify.building("City Founded", "Your settlement is established!");
      setSelectedTileId(null);
    } catch (error) {
      notify.error("Foundation Failed", error instanceof Error ? error.message : "Cannot found city here");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEndTurn = async () => {
    if (!isMyTurn) return;

    setIsLoading(true);
    try {
      await actions.endTurn(
        game._id as Id<"games">,
        player._id as Id<"players">
      );
      notify.info("Turn Ended", "Waiting for next player...");
    } catch (error) {
      notify.error("Error", error instanceof Error ? error.message : "Failed to end turn");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSpawnUnit = async (unitType: string) => {
    if (!selectedBuilding || !isMyTurn || !isMyBuilding) return;

    setIsLoading(true);
    try {
      await actions.spawnUnit(
        player._id as Id<"players">,
        selectedBuilding._id as Id<"buildings">,
        unitType
      );
      notify.unit("Unit Deployed", `${unitType.charAt(0).toUpperCase() + unitType.slice(1)} ready for orders`);
      setShowSpawnMenu(false);
    } catch (error) {
      notify.error("Spawn Failed", error instanceof Error ? error.message : "Cannot spawn unit");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlaceBuilding = async (buildingType: string) => {
    if (!selectedUnit || selectedUnit.type !== "worker" || !isMyTurn || !isMyUnit) return;

    setIsLoading(true);
    try {
      await actions.placeBuilding(
        player._id as Id<"players">,
        selectedUnit._id as Id<"units">,
        buildingType,
        selectedUnit.x,
        selectedUnit.y
      );
      notify.building("Construction Started", `Building ${buildingType.replace("_", " ")} — Worker will continue next turn`);
      setShowBuildMenu(false);
    } catch (error) {
      notify.error("Build Failed", error instanceof Error ? error.message : "Cannot build here");
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinueBuilding = async () => {
    if (!selectedUnit || selectedUnit.type !== "worker" || !isMyTurn || !isMyUnit) return;

    setIsLoading(true);
    try {
      const result = await actions.continueBuilding(
        player._id as Id<"players">,
        selectedUnit._id as Id<"units">
      );
      if (result.complete) {
        notify.building("Construction Complete", "Building is now operational!");
      } else {
        notify.info("Building Progress", `Progress: ${result.progress}/${result.total} turns`);
      }
    } catch (error) {
      notify.error("Continue Failed", error instanceof Error ? error.message : "Cannot continue building");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCollectResource = async () => {
    if (!selectedUnit || !selectedTile?.resource || !isMyTurn || !isMyUnit) return;

    setIsLoading(true);
    try {
      await actions.collectResource(
        player._id as Id<"players">,
        selectedTile.x,
        selectedTile.y
      );
      const resourceName = selectedTile.resource.charAt(0).toUpperCase() + selectedTile.resource.slice(1);
      notify.success("Resource Collected", `+2 ${resourceName} harvested!`);
    } catch (error) {
      notify.error("Harvest Failed", error instanceof Error ? error.message : "Cannot collect resource");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEntrench = async () => {
    if (!selectedUnit || selectedUnit.type !== "marine" || !isMyTurn || !isMyUnit) return;

    setIsLoading(true);
    try {
      const newState = !selectedUnit.entrenched;
      await actions.toggleEntrench(
        selectedUnit._id as Id<"units">,
        player._id as Id<"players">,
        newState
      );
      if (newState) {
        notify.unit("Entrenched!", "Marine gains +2 DEF until moved");
      } else {
        notify.unit("Entrenchment Broken", "Marine is ready to move");
      }
    } catch (error) {
      notify.error("Entrench Failed", error instanceof Error ? error.message : "Cannot change entrench state");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAttack = async (tile: Tile) => {
    if (!selectedUnit || !attackMode || !isMyTurn || !isMyUnit) return;

    setIsLoading(true);
    try {
      await actions.attack(
        selectedUnit._id as Id<"units">,
        player._id as Id<"players">,
        tile.x,
        tile.y
      );
      notify.combat("Attack!", "Engaging hostile target");
      setAttackMode(false);
    } catch (error) {
      notify.error("Attack Failed", error instanceof Error ? error.message : "Cannot attack target");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResearchTech = async (techId: string) => {
    setIsLoading(true);
    try {
      await actions.researchTech(
        player._id as Id<"players">,
        techId
      );
      notify.tech("Research Complete", "New technology unlocked!");
    } catch (error) {
      notify.error("Research Failed", error instanceof Error ? error.message : "Cannot research");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTileClick = (tile: Tile) => {
    if (attackMode && selectedUnit) {
      if (validAttackTiles.has(`${tile.x}-${tile.y}`)) {
        handleAttack(tile);
      } else {
        notify.error("Invalid Target", "Select an enemy within range");
      }
      return;
    }

    setSelectedTileId(tile.id);
    setShowSpawnMenu(false);
    setShowBuildMenu(false);
  };

  // Calculate highlighted tiles for WorldStrip
  const highlightedTiles = useMemo(() => {
    const highlights = new Map<string, "move" | "attack" | "build">();

    if (attackMode) {
      validAttackTiles.forEach(id => highlights.set(id, "attack"));
    } else if (buildingPlacementMode) {
      validBuildTiles.forEach(id => highlights.set(id, "build"));
    } else if (selectedUnit && isMyUnit && isMyTurn) {
      validMoveTiles.forEach(id => highlights.set(id, "move"));
    }

    return highlights;
  }, [attackMode, buildingPlacementMode, validAttackTiles, validBuildTiles, validMoveTiles, selectedUnit, isMyUnit, isMyTurn]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-hidden relative selection:bg-emerald-500/30">

      {/* Game Notifications */}
      <GameNotifications notifications={notifications} onDismiss={dismissNotification} />

      {/* Background Atmosphere & Parallax */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black" />

        <div
          className="absolute inset-0 opacity-40 transition-transform duration-500 ease-out will-change-transform"
          style={{
            backgroundImage: 'radial-gradient(white 1.5px, transparent 1.5px)',
            backgroundSize: '100px 100px',
            transform: `translateX(-${cameraX * 2}px)`
          }}
        />

        <div
          className="absolute inset-0 opacity-30 transition-transform duration-500 ease-out will-change-transform"
          style={{
            backgroundImage: 'radial-gradient(white 1px, transparent 1px)',
            backgroundSize: '50px 50px',
            backgroundPosition: '25px 25px',
            transform: `translateX(-${cameraX * 5}px)`
          }}
        />

        <div className="absolute top-10 right-20 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl" />
        <div className="absolute top-[-50px] left-1/3 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
      </div>

      {/* HUD */}
      <ResourceBar
        resources={player.resources}
        turn={game.turn}
        isMyTurn={isMyTurn}
        onTechClick={() => setShowTechTree(true)}
        onHelpClick={() => setShowHelp(true)}
        income={playerIncome}
        cameraPosition={{ x: cameraX, width: game.width }}
      />

      {/* Mode Indicator */}
      {(attackMode || buildingPlacementMode) && (
        <div className={`fixed top-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg font-mono text-sm flex items-center gap-2 animate-pulse ${attackMode ? "bg-red-900/90 text-red-100 border border-red-500/50" : "bg-amber-900/90 text-amber-100 border border-amber-500/50"
          }`}>
          {attackMode && <><Target className="w-4 h-4" /> Click on a <span className="text-red-300 font-bold">red highlighted</span> enemy to attack</>}
          {buildingPlacementMode && <><Building2 className="w-4 h-4" /> Click on a <span className="text-amber-300 font-bold">yellow highlighted</span> tile to build {buildingPlacementMode}</>}
          <Button size="sm" variant="ghost" className="ml-2 h-6 px-2 text-white/70 hover:text-white" onClick={() => { setAttackMode(false); setBuildingPlacementMode(null); }}>
            <X className="w-3 h-3 mr-1" /> Cancel
          </Button>
        </div>
      )}



      {/* Main Game Area */}
      <div className="relative z-10 flex h-screen items-center justify-center overflow-hidden">
        {/* Navigation Overlays */}
        <div className="fixed inset-y-0 left-0 w-32 bg-gradient-to-r from-black/80 via-black/20 to-transparent pointer-events-none z-30" />
        <div className="fixed inset-y-0 right-0 w-32 bg-gradient-to-l from-black/80 via-black/20 to-transparent pointer-events-none z-30" />

        <Button
          variant="ghost"
          size="icon"
          className="fixed left-8 z-40 h-12 w-12 rounded-full bg-slate-800/20 border border-white/5 text-white hover:bg-emerald-500/20 hover:text-emerald-400 hover:scale-110 hover:border-emerald-500/50 transition-all backdrop-blur-md shadow-lg group"
          onClick={() => moveCamera("left")}
          title="Pan Left (A or ←)"
        >
          <ChevronLeft className="h-6 w-6 group-hover:-translate-x-1 transition-transform" />
        </Button>

        {/* The World Strip Container */}
        <div className="relative w-full flex justify-center">
          <WorldStrip
            columns={visibleColumns}
            units={units}
            buildings={buildings}
            onTileClick={handleTileClick}
            selectedTileId={selectedTileId}
            highlightedTiles={highlightedTiles}
            currentPlayerId={player._id}
          />
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="fixed right-8 z-40 h-12 w-12 rounded-full bg-slate-800/20 border border-white/5 text-white hover:bg-emerald-500/20 hover:text-emerald-400 hover:scale-110 hover:border-emerald-500/50 transition-all backdrop-blur-md shadow-lg group"
          onClick={() => moveCamera("right")}
          title="Pan Right (D or →)"
        >
          <ChevronRight className="h-6 w-6 group-hover:translate-x-1 transition-transform" />
        </Button>
      </div>

      {/* End Turn Button */}
      {isMyTurn && (
        <Button
          className="fixed bottom-8 right-8 z-50 bg-emerald-600 hover:bg-emerald-500 text-white font-mono uppercase tracking-wide shadow-lg shadow-emerald-900/50"
          onClick={handleEndTurn}
          disabled={isLoading}
          title="End Turn (E)"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ArrowRight className="w-4 h-4 mr-2" />}
          End Turn
          <span className="ml-2 text-xs opacity-70 bg-black/20 px-1.5 py-0.5 rounded">E</span>
        </Button>
      )}

      {/* Waiting for turn indicator */}
      {!isMyTurn && (
        <div className="fixed bottom-8 right-8 z-50 bg-slate-800/80 text-slate-400 px-4 py-2 rounded-lg font-mono text-sm border border-slate-700">
          {(() => {
            const activePlayerId = game.playerOrder[game.activePlayerIndex];
            const activePlayer = allPlayers.find(p => p._id === activePlayerId);
            if (activePlayer?.isAI) {
              return (
                <>
                  <Bot className="w-4 h-4 inline mr-2 text-purple-400" />
                  <span className="text-purple-300">{activePlayer.aiName}</span> is thinking...
                </>
              );
            }
            return (
              <>
                <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                Waiting for other players...
              </>
            );
          })()}
        </div>
      )}

      {/* Selected Tile Context Menu - Bottom Left */}
      {selectedTileId && selectedTile && !attackMode && !buildingPlacementMode && (
        <div className="fixed left-4 bottom-4 w-[320px] bg-slate-900/98 backdrop-blur-xl border border-slate-700 p-4 rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] z-50 animate-in slide-in-from-bottom-4 ring-1 ring-white/10 max-h-[70vh] overflow-y-auto">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-bold text-lg text-emerald-400 flex items-center gap-2 font-mono">
                <Crosshair className="w-4 h-4" />
                {selectedUnit ? selectedUnit.type.toUpperCase() :
                  selectedBuilding ? selectedBuilding.type.toUpperCase().replace("_", " ") :
                    selectedTile.type.toUpperCase()}
              </h3>
              <p className="text-xs text-slate-500 font-mono mt-1">
                📍 [{selectedTile.x}, {selectedTile.y}]
                {selectedTile.resource && <span className="ml-2 text-purple-400">💎 {selectedTile.resource}</span>}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 rounded-full hover:bg-white/10 text-slate-400 hover:text-white"
              onClick={() => setSelectedTileId(null)}
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Unit Actions */}
          {selectedUnit && isMyUnit && isMyTurn && (
            <div className="space-y-3">
              {/* Unit Description */}
              <p className="text-xs text-slate-400 italic bg-slate-800/30 p-2 rounded">
                {UNIT_INFO[selectedUnit.type]?.desc || "A unit under your command."}
              </p>

              {/* Movement Controls */}
              {selectedUnit.movesLeft > 0 ? (
                <div>
                  <p className="text-xs text-slate-500 font-mono mb-2 flex items-center gap-1">
                    <Move className="w-3 h-3" /> MOVE (or use W/A/S/D)
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    <Button size="sm" variant="secondary" className="text-xs font-mono uppercase bg-slate-800 hover:bg-emerald-900/50 hover:text-emerald-300 border border-slate-700" onClick={() => handleMoveUnit("L")} disabled={isLoading}>← Left</Button>
                    <Button size="sm" variant="secondary" className="text-xs font-mono uppercase bg-slate-800 hover:bg-emerald-900/50 hover:text-emerald-300 border border-slate-700" onClick={() => handleMoveUnit("U")} disabled={isLoading}>↑ Up</Button>
                    <Button size="sm" variant="secondary" className="text-xs font-mono uppercase bg-slate-800 hover:bg-emerald-900/50 hover:text-emerald-300 border border-slate-700" onClick={() => handleMoveUnit("D")} disabled={isLoading}>↓ Down</Button>
                    <Button size="sm" variant="secondary" className="text-xs font-mono uppercase bg-slate-800 hover:bg-emerald-900/50 hover:text-emerald-300 border border-slate-700" onClick={() => handleMoveUnit("R")} disabled={isLoading}>→ Right</Button>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-amber-400/90 font-mono flex items-center gap-2 bg-amber-900/20 p-2 rounded border border-amber-500/20">
                  <Move className="w-4 h-4" />
                  <span>No moves remaining this turn</span>
                </div>
              )}

              {/* Combat Unit Actions */}
              {selectedUnit.type !== "settler" && selectedUnit.type !== "worker" && selectedUnit.movesLeft > 0 && (
                <Button
                  size="sm"
                  className="w-full text-xs font-mono uppercase bg-red-900/50 text-red-200 hover:bg-red-800 border border-red-500/30"
                  onClick={() => setAttackMode(true)}
                  disabled={isLoading}
                >
                  <Swords className="w-4 h-4 mr-2" />
                  Attack Enemy
                </Button>
              )}

              {/* Settler Actions */}
              {selectedUnit.type === "settler" && (
                <Button
                  size="sm"
                  className="w-full text-xs font-mono uppercase bg-emerald-900/50 text-emerald-200 hover:bg-emerald-800 border border-emerald-500/30"
                  onClick={handleFoundCity}
                  disabled={isLoading}
                >
                  <Home className="w-4 h-4 mr-2" />
                  Found City Here
                </Button>
              )}

              {/* Worker Actions */}
              {selectedUnit.type === "worker" && selectedUnit.movesLeft > 0 && (
                <div className="space-y-2">
                  {/* Check if Worker is on a construction site they're building */}
                  {selectedBuilding?.isConstructing && selectedBuilding?.workerId === selectedUnit._id ? (
                    <Button
                      size="sm"
                      className="w-full text-xs font-mono uppercase bg-amber-900/50 text-amber-200 hover:bg-amber-800 border border-amber-500/30"
                      onClick={handleContinueBuilding}
                      disabled={isLoading}
                    >
                      <Hammer className="w-4 h-4 mr-2" />
                      Continue Building ({selectedBuilding.buildProgress ?? 0}/{selectedBuilding.turnsToComplete ?? 1})
                    </Button>
                  ) : !selectedBuilding && !selectedTile?.buildingId && selectedTile?.type !== "water" && selectedTile?.type !== "bedrock" ? (
                    <>
                      <Button
                        size="sm"
                        className="w-full text-xs font-mono uppercase bg-amber-900/50 text-amber-200 hover:bg-amber-800 border border-amber-500/30"
                        onClick={() => setShowBuildMenu(!showBuildMenu)}
                        disabled={isLoading || (selectedUnit.buildsLeft ?? 0) <= 0}
                      >
                        <Building2 className="w-4 h-4 mr-2" />
                        {showBuildMenu ? "Hide Buildings" : "Build Here"}
                      </Button>

                      {/* Worker Build Menu */}
                      {showBuildMenu && workerBuildableBuildings.length > 0 && (
                        <div className="bg-slate-800/80 rounded-lg p-3 space-y-2 border border-slate-700/50">
                          <p className="text-xs text-slate-400 font-mono flex items-center gap-1">
                            <Building2 className="w-3 h-3" /> Select building to construct:
                          </p>
                          {workerBuildableBuildings.map((building) => (
                            <Button
                              key={building.buildingType}
                              size="sm"
                              variant="ghost"
                              className={`w-full justify-between text-xs font-mono p-2 h-auto ${building.canAfford ? "hover:bg-amber-900/30" : "opacity-50 cursor-not-allowed"
                                }`}
                              onClick={() => building.canAfford && handlePlaceBuilding(building.buildingType)}
                              disabled={isLoading || !building.canAfford}
                            >
                              <div className="text-left">
                                <span className={building.canAfford ? "text-white" : "text-slate-500"}>
                                  {building.buildingType.toUpperCase().replace("_", " ")}
                                </span>
                                <p className="text-[10px] text-slate-500 font-normal">
                                  {BUILDING_INFO[building.buildingType]?.desc?.slice(0, 40)}...
                                </p>
                              </div>
                              <span className={`text-xs ${building.canAfford ? "text-emerald-400" : "text-red-400"}`}>
                                {BUILDING_INFO[building.buildingType]?.biomass && `${BUILDING_INFO[building.buildingType].biomass}🌿 `}
                                {BUILDING_INFO[building.buildingType]?.ore && `${BUILDING_INFO[building.buildingType].ore}⚙️ `}
                                {BUILDING_INFO[building.buildingType]?.flux && `${BUILDING_INFO[building.buildingType].flux}⚡`}
                              </span>
                            </Button>
                          ))}
                        </div>
                      )}

                      {/* Worker Build Menu - Empty State */}
                      {showBuildMenu && workerBuildableBuildings.length === 0 && (
                        <div className="bg-slate-800/80 rounded-lg p-3 border border-slate-700/50 text-center">
                          <p className="text-xs text-slate-400">No buildings available to construct.</p>
                          <p className="text-[10px] text-slate-500 mt-1">Research tech to unlock more options.</p>
                        </div>
                      )}
                    </>
                  ) : null}

                  {/* Collect Resource Button - Worker on resource tile */}
                  {selectedTile?.resource && !selectedBuilding && (
                    <Button
                      size="sm"
                      className="w-full text-xs font-mono uppercase bg-emerald-900/50 text-emerald-200 hover:bg-emerald-800 border border-emerald-500/30"
                      onClick={handleCollectResource}
                      disabled={isLoading}
                    >
                      <Pickaxe className="w-4 h-4 mr-2" />
                      Harvest {selectedTile.resource.charAt(0).toUpperCase() + selectedTile.resource.slice(1)}
                    </Button>
                  )}

                  {/* Worker builds remaining indicator */}
                  <div className="text-xs text-amber-400/80 font-mono flex items-center gap-1 bg-amber-900/20 p-2 rounded border border-amber-500/20">
                    <Hammer className="w-3 h-3" />
                    Builds remaining: <span className="font-bold">{selectedUnit.buildsLeft ?? 0}</span>/3
                  </div>
                </div>
              )}

              {/* Marine Entrench Action */}
              {selectedUnit.type === "marine" && isMyTurn && (
                <Button
                  size="sm"
                  className={`w-full text-xs font-mono uppercase border ${selectedUnit.entrenched
                    ? "bg-cyan-900/50 text-cyan-200 hover:bg-cyan-800 border-cyan-500/30"
                    : "bg-slate-800/50 text-slate-300 hover:bg-slate-700 border-slate-500/30"
                    }`}
                  onClick={handleEntrench}
                  disabled={isLoading || (selectedUnit.movesLeft > 0 && !selectedUnit.entrenched)}
                  title={selectedUnit.movesLeft > 0 && !selectedUnit.entrenched ? "Must use all moves first" : ""}
                >
                  <Shield className="w-4 h-4 mr-2" />
                  {selectedUnit.entrenched ? "Break Entrenchment" : "Entrench (+2 DEF)"}
                </Button>
              )}

              {/* Unit Stats */}
              <div className="grid grid-cols-4 gap-2 text-xs font-mono bg-slate-800/50 rounded-lg p-2 border border-slate-700/50">
                <div className="flex items-center gap-1" title="Health Points">
                  <Heart className="w-3 h-3 text-red-400" />
                  <span className="text-white">{selectedUnit.hp}</span>
                </div>
                <div className="flex items-center gap-1" title="Moves Remaining">
                  <Move className="w-3 h-3 text-blue-400" />
                  <span className="text-white">{selectedUnit.movesLeft}/{selectedUnit.maxMoves}</span>
                </div>
                <div className="flex items-center gap-1" title="Attack Power">
                  <Swords className="w-3 h-3 text-orange-400" />
                  <span className="text-white">{UNIT_STATS[selectedUnit.type]?.atk ?? 0}</span>
                </div>
                <div className="flex items-center gap-1" title="Defense">
                  <Shield className="w-3 h-3 text-cyan-400" />
                  <span className="text-white">{UNIT_STATS[selectedUnit.type]?.def ?? 0}</span>
                </div>
              </div>

              {/* Artillery Range Indicator */}
              {selectedUnit.type === "arty" && (
                <div className="text-xs text-purple-300/90 font-mono flex items-center gap-2 bg-purple-900/30 p-2 rounded border border-purple-500/30">
                  <Target className="w-3 h-3" />
                  <span><strong>Arc Fire:</strong> Range 4 — Can hit over obstacles</span>
                </div>
              )}
            </div>
          )}

          {/* Building Actions */}
          {selectedBuilding && isMyBuilding && isMyTurn && (
            <div className="space-y-3">
              {/* Building Description */}
              <p className="text-xs text-slate-400 italic bg-slate-800/30 p-2 rounded">
                {BUILDING_INFO[selectedBuilding.type]?.desc || "A structure under your control."}
                {BUILDING_INFO[selectedBuilding.type]?.income && (
                  <span className="block mt-1 text-emerald-400 not-italic">
                    <TrendingUp className="w-3 h-3 inline mr-1" />
                    Income: {BUILDING_INFO[selectedBuilding.type]?.income}
                  </span>
                )}
              </p>

              {/* Spawn Units Button */}
              {(selectedBuilding.type === "city" || selectedBuilding.type === "factory" || selectedBuilding.type === "barracks" || selectedBuilding.type === "skyport") && (
                <Button
                  size="sm"
                  className="w-full text-xs font-mono uppercase bg-blue-900/50 text-blue-200 hover:bg-blue-800 border border-blue-500/30"
                  onClick={() => setShowSpawnMenu(!showSpawnMenu)}
                >
                  <Users className="w-4 h-4 mr-2" />
                  {showSpawnMenu ? "Hide Units" : "Train Units"}
                </Button>
              )}

              {/* Spawn Menu */}
              {showSpawnMenu && spawnableUnits.length > 0 && (
                <div className="bg-slate-800/80 rounded-lg p-3 space-y-2 border border-slate-700/50">
                  <p className="text-xs text-slate-400 font-mono flex items-center gap-1">
                    <Users className="w-3 h-3" /> Available Units:
                  </p>
                  {spawnableUnits.map((unit) => (
                    <Button
                      key={unit.unitType}
                      size="sm"
                      variant="ghost"
                      className={`w-full justify-between text-xs font-mono p-2 h-auto ${unit.canAfford ? "hover:bg-blue-900/30" : "opacity-50 cursor-not-allowed"
                        }`}
                      onClick={() => unit.canAfford && handleSpawnUnit(unit.unitType)}
                      disabled={isLoading || !unit.canAfford}
                    >
                      <div className="text-left">
                        <span className={unit.canAfford ? "text-white" : "text-slate-500"}>
                          {unit.unitType.toUpperCase()}
                        </span>
                        <p className="text-[10px] text-slate-500 font-normal">
                          {UNIT_INFO[unit.unitType]?.desc?.slice(0, 40)}...
                        </p>
                      </div>
                      <span className={`text-xs ${unit.canAfford ? "text-emerald-400" : "text-red-400"}`}>
                        {UNIT_INFO[unit.unitType]?.biomass && `${UNIT_INFO[unit.unitType].biomass}🌿 `}
                        {UNIT_INFO[unit.unitType]?.ore && `${UNIT_INFO[unit.unitType].ore}⚙️ `}
                        {UNIT_INFO[unit.unitType]?.flux && `${UNIT_INFO[unit.unitType].flux}⚡`}
                      </span>
                    </Button>
                  ))}
                </div>
              )}

              {/* Spawn Menu - Empty State */}
              {showSpawnMenu && spawnableUnits.length === 0 && (
                <div className="bg-slate-800/80 rounded-lg p-3 border border-slate-700/50 text-center">
                  <p className="text-xs text-slate-400">No units available to train.</p>
                  <p className="text-[10px] text-slate-500 mt-1">Research tech or check resources.</p>
                </div>
              )}



              {/* Building Info */}
              <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-slate-800/50 rounded-lg p-2 border border-slate-700/50">
                <div>Type: <span className="text-white">{selectedBuilding.type.replace("_", " ")}</span></div>
                <div className="flex items-center gap-1">
                  <Heart className="w-3 h-3 text-red-400" />
                  <span className="text-white">{selectedBuilding.hp}</span>
                </div>
                {selectedBuilding.isConstructing && (
                  <div className="col-span-2 flex items-center gap-1 text-amber-400">
                    <Hammer className="w-3 h-3" />
                    <span>Building: {selectedBuilding.buildProgress ?? 0}/{selectedBuilding.turnsToComplete ?? 1} turns</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Enemy Unit Info */}
          {selectedUnit && !isMyUnit && (
            <div className="text-xs font-mono bg-red-900/20 rounded-lg p-3 border border-red-500/30">
              <p className="text-red-300 font-bold mb-2 flex items-center gap-1">
                <Target className="w-3 h-3" /> Enemy Unit
              </p>
              <p className="text-slate-400 text-[10px] mb-2 italic">
                {UNIT_INFO[selectedUnit.type]?.desc}
              </p>
              <div className="grid grid-cols-4 gap-2 text-slate-400">
                <div>Type: <span className="text-white">{selectedUnit.type}</span></div>
                <div className="flex items-center gap-1">
                  <Heart className="w-3 h-3 text-red-400" />
                  <span className="text-white">{selectedUnit.hp}</span>
                </div>
                <div className="flex items-center gap-1" title="Attack">
                  <Swords className="w-3 h-3 text-orange-400" />
                  <span className="text-white">{UNIT_STATS[selectedUnit.type]?.atk ?? 0}</span>
                </div>
                <div className="flex items-center gap-1" title="Defense">
                  <Shield className="w-3 h-3 text-cyan-400" />
                  <span className="text-white">{UNIT_STATS[selectedUnit.type]?.def ?? 0}</span>
                </div>
              </div>
            </div>
          )}

          {/* Enemy Building Info */}
          {selectedBuilding && !isMyBuilding && (
            <div className="text-xs font-mono bg-red-900/20 rounded-lg p-3 border border-red-500/30">
              <p className="text-red-300 font-bold mb-2 flex items-center gap-1">
                <Target className="w-3 h-3" /> Enemy Building
              </p>
              <div className="grid grid-cols-2 gap-2 text-slate-400">
                <div>Type: <span className="text-white">{selectedBuilding.type.replace("_", " ")}</span></div>
                <div className="flex items-center gap-1">
                  <Heart className="w-3 h-3 text-red-400" />
                  <span className="text-white">{selectedBuilding.hp}</span>
                </div>
              </div>
            </div>
          )}

          {/* Not My Turn Warning */}
          {!isMyTurn && (selectedUnit && isMyUnit || selectedBuilding && isMyBuilding) && (
            <div className="text-xs font-mono text-amber-400 text-center py-2 bg-amber-900/20 rounded-lg border border-amber-500/30">
              ⏳ Wait for your turn to take actions
            </div>
          )}

          {/* Decor Elements */}
          <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-emerald-500/50 rounded-tl-lg" />
          <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-emerald-500/50 rounded-tr-lg" />
          <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-emerald-500/50 rounded-bl-lg" />
          <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-emerald-500/50 rounded-br-lg" />
        </div>
      )}

      {/* Tech Tree Panel */}
      {showTechTree && (
        <div className="fixed inset-y-0 right-0 w-[420px] bg-slate-900/98 backdrop-blur-xl border-l border-slate-700 z-50 overflow-y-auto animate-in slide-in-from-right">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-purple-400 font-mono flex items-center gap-2">
                <FlaskConical className="w-5 h-5" />
                Technology Tree
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowTechTree(false)} title="Close (Esc)">
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-3 mb-4 border border-slate-700/50">
              <p className="text-xs text-slate-400">
                Research technologies using <span className="text-purple-400 font-bold">Flux ⚡</span> to unlock new units, buildings, and abilities.
              </p>
              <p className="text-xs text-purple-400 mt-1">
                Your Flux: <span className="font-bold">{player.resources.flux}</span>
              </p>
            </div>

            <div className="space-y-2">
              {techTree.map((tech) => (
                <div
                  key={tech.techId}
                  className={`p-3 rounded-lg border transition-all ${tech.alreadyResearched
                    ? "bg-emerald-900/30 border-emerald-500/50"
                    : tech.canResearch && !isLoading
                      ? "bg-slate-800/50 border-purple-500/30 hover:border-purple-500 cursor-pointer hover:bg-purple-900/20"
                      : "bg-slate-800/30 border-slate-700/50 opacity-60"
                    }`}
                  onClick={() => tech.canResearch && !tech.alreadyResearched && !isLoading && handleResearchTech(tech.techId)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-bold">{tech.name}</span>
                    {tech.alreadyResearched ? (
                      <span className="text-xs text-emerald-400 flex items-center gap-1">✓ Researched</span>
                    ) : (
                      <span className={`text-xs flex items-center gap-1 ${tech.canResearch ? "text-purple-400" : "text-slate-500"
                        }`}>
                        <Zap className="w-3 h-3" />
                        {tech.cost}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{tech.description}</p>
                  {tech.unlocks.length > 0 && (
                    <p className="text-xs text-blue-400 mt-1 flex items-center gap-1">
                      <CircleDot className="w-3 h-3" />
                      Unlocks: {tech.unlocks.join(", ")}
                    </p>
                  )}
                  {tech.prerequisites.length > 0 && !tech.alreadyResearched && (
                    <p className="text-xs text-amber-400/70 mt-1">
                      Requires: {tech.prerequisites.join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Help Panel - Centered Landscape */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-8" onClick={() => setShowHelp(false)}>
          <div
            className="bg-slate-900 border border-slate-700 rounded-xl p-8 max-w-5xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-8 sticky top-0 bg-slate-900 z-10 py-2 border-b border-slate-800">
              <h2 className="text-3xl font-bold text-emerald-400 font-mono flex items-center gap-3">
                <HelpCircle className="w-8 h-8" />
                Commander's Manual: Orbitbound
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowHelp(false)} className="hover:bg-slate-800">
                <X className="w-6 h-6" />
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-sm">

              {/* Column 1: Getting Started & Resources */}
              <div className="space-y-6">
                {/* Mission Objectives */}
                <section className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/50">
                  <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <Rocket className="w-5 h-5 text-emerald-500" /> Getting Started
                  </h3>
                  <div className="space-y-3 text-slate-300 text-xs leading-relaxed">
                    <p>
                      You command a colony on a <span className="text-cyan-400 font-bold">cylindrical world</span> - the map wraps horizontally!
                      Start by founding a city with your Lander, then expand your empire.
                    </p>
                    <div className="bg-slate-900/50 p-3 rounded-lg space-y-2">
                      <p className="font-bold text-white text-sm">Quick Start Guide:</p>
                      <ol className="list-decimal list-inside space-y-1 text-slate-400">
                        <li>Select your <span className="text-blue-400">Lander</span> and click <span className="text-emerald-400">"Found City"</span></li>
                        <li>From your city, train <span className="text-amber-400">Workers</span> to build economy</li>
                        <li>Build <span className="text-emerald-400">Farms</span> and <span className="text-slate-300">Mines</span> for income</li>
                        <li>Train <span className="text-red-400">Marines</span> to defend your territory</li>
                        <li>Research tech with <span className="text-purple-400">Flux</span> to unlock advanced units</li>
                      </ol>
                    </div>
                    <div className="bg-emerald-900/20 border border-emerald-500/30 p-3 rounded-lg">
                      <p className="font-bold text-emerald-400 mb-2">🏆 Victory Conditions:</p>
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <Swords className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                          <div>
                            <span className="text-red-400 font-bold">Domination:</span>
                            <span className="text-slate-400"> Destroy all enemy cities and eliminate all opponents.</span>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <Rocket className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                          <div>
                            <span className="text-purple-400 font-bold">Ascension:</span>
                            <span className="text-slate-400"> Research "The Ark Project" (Tier 4) and build the Silo to escape the world.</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Resources */}
                <section className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/50">
                  <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-amber-400" /> Resources
                  </h3>
                  <div className="space-y-3">
                    <div className="bg-emerald-900/20 p-3 rounded-lg border border-emerald-500/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Wheat className="w-6 h-6 text-emerald-400" />
                        <span className="font-bold text-emerald-400 text-sm">Biomass</span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        <span className="text-emerald-300 font-bold">Organic matter</span> used to sustain living units.
                        Required to train Workers, Marines, and Settlers.
                      </p>
                      <div className="mt-2 text-[10px] text-slate-400 bg-slate-900/50 p-2 rounded">
                        <span className="text-white">Sources:</span> Cities (+2/turn), Farms (+2/turn), Biomass deposits (one-time harvest)
                      </div>
                    </div>

                    <div className="bg-slate-700/20 p-3 rounded-lg border border-slate-500/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Pickaxe className="w-6 h-6 text-slate-300" />
                        <span className="font-bold text-slate-300 text-sm">Ore</span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        <span className="text-slate-200 font-bold">Raw minerals</span> for construction and manufacturing.
                        Required for all buildings and mechanical units (Rovers, Tanks, Artillery).
                      </p>
                      <div className="mt-2 text-[10px] text-slate-400 bg-slate-900/50 p-2 rounded">
                        <span className="text-white">Sources:</span> Cities (+2/turn), Mines (+2/turn, must be on Ore deposit)
                      </div>
                    </div>

                    <div className="bg-purple-900/20 p-3 rounded-lg border border-purple-500/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Zap className="w-6 h-6 text-purple-400" />
                        <span className="font-bold text-purple-400 text-sm">Flux</span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        <span className="text-purple-300 font-bold">High-energy plasma</span> used exclusively for technology research.
                        The key to unlocking advanced units and The Ark Project.
                      </p>
                      <div className="mt-2 text-[10px] text-slate-400 bg-slate-900/50 p-2 rounded">
                        <span className="text-white">Sources:</span> Solar Arrays (+1/turn), Flux deposits (rare, one-time)
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              {/* Column 2: Units & Buildings */}
              <div className="space-y-6">
                {/* Units */}
                <section className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/50">
                  <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-400" /> Units
                  </h3>
                  <div className="space-y-2">
                    {[
                      {
                        name: "Lander (Settler)",
                        cost: "Starting unit",
                        desc: "Your initial colonization unit. Can found ONE city on any surface tile. Consumed when city is founded. Cannot attack or defend - protect it!",
                        icon: Home,
                        color: "text-blue-400",
                        stats: "HP: 10 | Moves: 2 | No combat"
                      },
                      {
                        name: "Worker",
                        cost: "5 Biomass",
                        desc: "Essential for economy. Can build structures adjacent to your buildings: Farms (on surface), Mines (on ore), Solar Arrays (anywhere). Non-combatant - keep them safe!",
                        icon: Pickaxe,
                        color: "text-amber-400",
                        stats: "HP: 8 | Moves: 2 | No combat"
                      },
                      {
                        name: "Marine",
                        cost: "10 Biomass, 5 Ore",
                        desc: "Standard infantry. Good for defense and early aggression. ENTRENCH ability: If you don't move on your turn, gain +2 DEF next turn. Stack Marines for flanking bonuses!",
                        icon: Shield,
                        color: "text-emerald-400",
                        stats: "HP: 15 | Moves: 2 | ATK: 4 | DEF: 3"
                      },
                      {
                        name: "Rover",
                        cost: "10 Ore",
                        desc: "Fast scout vehicle. Excellent vision range for finding enemies and resources. High mobility but fragile in combat. Use to harass enemy Workers or scout unexplored areas.",
                        icon: Eye,
                        color: "text-cyan-400",
                        stats: "HP: 10 | Moves: 4 | ATK: 2 | DEF: 1 | Vision: 4"
                      },
                      {
                        name: "Tank",
                        cost: "25 Ore (requires Militarization tech)",
                        desc: "Heavy armored unit. Dominates in direct combat with high HP and attack. CRUSH ability: Destroys enemy buildings when moving onto them. Expensive but powerful.",
                        icon: Crosshair,
                        color: "text-red-400",
                        stats: "HP: 30 | Moves: 2 | ATK: 8 | DEF: 5"
                      },
                      {
                        name: "Artillery",
                        cost: "30 Ore, 10 Flux (requires Siege tech)",
                        desc: "Long-range siege unit. ARC FIRE: Can attack from 4 tiles away, over obstacles and units. Weak in close combat - protect with Marines. Essential for breaking fortified positions.",
                        icon: Target,
                        color: "text-purple-400",
                        stats: "HP: 12 | Moves: 1 | ATK: 6 | DEF: 1 | Range: 4"
                      },
                    ].map((u) => (
                      <div key={u.name} className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/30">
                        <div className="flex items-center gap-2 mb-1">
                          <u.icon className={`w-5 h-5 ${u.color}`} />
                          <span className="font-bold text-white text-xs">{u.name}</span>
                        </div>
                        <p className="text-[10px] text-amber-400/80 mb-1">{u.cost}</p>
                        <p className="text-[10px] text-slate-400 leading-relaxed mb-2">{u.desc}</p>
                        <p className="text-[9px] text-slate-500 font-mono bg-slate-800/50 px-2 py-1 rounded">{u.stats}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              {/* Column 3: Buildings, Combat & Controls */}
              <div className="space-y-6">
                {/* Buildings */}
                <section className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/50">
                  <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-amber-400" /> Buildings
                  </h3>
                  <div className="space-y-2">
                    {[
                      { name: "City", desc: "Your HQ. Spawns units, provides +2 Biomass and +2 Ore per turn. Lose all cities = elimination.", cost: "Founded by Lander", color: "text-amber-400" },
                      { name: "Farm", desc: "Agricultural facility. Generates +2 Biomass per turn. Must be built on Surface or Dirt tiles.", cost: "10 Ore", color: "text-emerald-400" },
                      { name: "Mine", desc: "Ore extraction facility. Generates +2 Ore per turn. MUST be built on an Ore deposit tile.", cost: "10 Biomass", color: "text-slate-300" },
                      { name: "Solar Array", desc: "Energy collector. Generates +1 Flux per turn. Critical for tech research. Build on any valid tile.", cost: "15 Ore", color: "text-purple-400" },
                      { name: "Barracks", desc: "Infantry training. Allows spawning Marines without needing a City. Useful for forward bases.", cost: "15 Ore", color: "text-red-400" },
                      { name: "Factory", desc: "Vehicle production. Required to spawn Tanks. Unlocked with Militarization tech.", cost: "30 Ore", color: "text-zinc-400" },
                      { name: "Bunker", desc: "Defensive structure. Units inside get +5 DEF. Doesn't produce anything but crucial for defense.", cost: "20 Ore", color: "text-stone-400" },
                    ].map((b) => (
                      <div key={b.name} className="flex gap-2 bg-slate-900/30 p-2 rounded border border-slate-700/30">
                        <div className="shrink-0">
                          <div className={`w-2 h-full rounded-full ${b.color.replace("text-", "bg-")}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`font-bold text-xs ${b.color}`}>{b.name}</span>
                            <span className="text-[9px] text-amber-400/70">{b.cost}</span>
                          </div>
                          <p className="text-[10px] text-slate-400 leading-relaxed">{b.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Combat */}
                <section className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/50">
                  <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <Swords className="w-5 h-5 text-red-400" /> Combat
                  </h3>
                  <div className="space-y-3 text-xs">
                    <div className="bg-red-900/20 p-2 rounded border border-red-500/20">
                      <p className="font-bold text-red-400 mb-1">Damage Formula:</p>
                      <p className="text-slate-300 font-mono">Damage = Attacker ATK - Defender DEF</p>
                      <p className="text-slate-400 text-[10px]">Minimum 1 damage is always dealt.</p>
                    </div>
                    <div className="bg-orange-900/20 p-2 rounded border border-orange-500/20">
                      <p className="font-bold text-orange-400 mb-1">Counter-Attack:</p>
                      <p className="text-slate-400 text-[10px]">If the defender survives and is in range, they deal damage back to the attacker.</p>
                    </div>
                    <div className="bg-emerald-900/20 p-2 rounded border border-emerald-500/20">
                      <p className="font-bold text-emerald-400 mb-1">Flanking Bonus (+2 ATK):</p>
                      <p className="text-slate-400 text-[10px]">Gain +2 ATK for each friendly unit adjacent to your target. Surround enemies for massive damage!</p>
                    </div>
                  </div>
                </section>

                {/* Controls */}
                <section className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/50">
                  <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <Keyboard className="w-5 h-5 text-cyan-400" /> Controls
                  </h3>
                  <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
                    <div className="bg-slate-900/50 p-2 rounded"><span className="text-cyan-400">WASD</span> <span className="text-slate-500">Move unit</span></div>
                    <div className="bg-slate-900/50 p-2 rounded"><span className="text-cyan-400">Arrows</span> <span className="text-slate-500">Pan camera</span></div>
                    <div className="bg-slate-900/50 p-2 rounded"><span className="text-cyan-400">E</span> <span className="text-slate-500">End turn</span></div>
                    <div className="bg-slate-900/50 p-2 rounded"><span className="text-cyan-400">T</span> <span className="text-slate-500">Tech tree</span></div>
                    <div className="bg-slate-900/50 p-2 rounded"><span className="text-cyan-400">H / ?</span> <span className="text-slate-500">This help</span></div>
                    <div className="bg-slate-900/50 p-2 rounded"><span className="text-cyan-400">Esc</span> <span className="text-slate-500">Cancel/Close</span></div>
                  </div>
                </section>

                {/* Factions */}
                <section className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/50">
                  <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <Bot className="w-5 h-5 text-purple-400" /> Factions
                  </h3>
                  <div className="space-y-2 text-[10px]">
                    <div className="bg-blue-900/20 p-2 rounded border border-blue-500/20">
                      <span className="font-bold text-blue-400">United Terran:</span>
                      <span className="text-slate-400"> Industrial bonus. Mines produce +1 Ore. Start with extra Ore.</span>
                    </div>
                    <div className="bg-emerald-900/20 p-2 rounded border border-emerald-500/20">
                      <span className="font-bold text-emerald-400">Xeno Hive:</span>
                      <span className="text-slate-400"> Regeneration. Units heal +2 HP/turn on biomass. Start with extra Biomass.</span>
                    </div>
                    <div className="bg-purple-900/20 p-2 rounded border border-purple-500/20">
                      <span className="font-bold text-purple-400">Cyber Synapse:</span>
                      <span className="text-slate-400"> Tech discount. Research costs 10% less. Start with extra Flux.</span>
                    </div>
                  </div>
                </section>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-800 flex justify-between items-center">
              <div className="flex gap-4">
                <div className="flex items-center gap-1 text-[10px] text-slate-500"><CircleDot className="w-3 h-3" /> Cylindrical World (Loops)</div>
                <div className="flex items-center gap-1 text-[10px] text-slate-500"><Sun className="w-3 h-3 text-amber-500" /> Turn-Based Logic</div>
              </div>
              <Button onClick={() => setShowHelp(false)} className="bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs uppercase tracking-widest px-8">
                Acknowledge & Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
