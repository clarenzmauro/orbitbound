import React from "react";
import type { Tile as TileType, Unit, UnitType, Building, BuildingType } from "@/types/game";
import { cn } from "@/lib/utils";
import { Mountain, Hexagon, Zap, Rocket, Bot, Pickaxe, Shield, Plane, Target, Home, Factory, Wheat, Sun, Warehouse, Hammer } from "lucide-react";

// Unit max HP values from backend constants
const UNIT_MAX_HP: Record<UnitType, number> = {
  settler: 10,
  rover: 10,
  worker: 5,
  marine: 15,
  tank: 40,
  arty: 20,
  gunship: 30,
};

// Building glow color lookup
const getBuildingGlowColor = (type: BuildingType): string => {
  switch (type) {
    case "city": return "bg-amber-400";
    case "farm": return "bg-green-400";
    case "mine": return "bg-stone-400";
    case "factory": return "bg-zinc-400";
    case "barracks": return "bg-red-400";
    case "solar_array": return "bg-blue-400";
    case "skyport": return "bg-cyan-400";
    case "silo": return "bg-purple-400";
    case "bunker": return "bg-stone-500";
    default: return "bg-slate-400";
  }
};

interface TileProps {
  tile: TileType;
  unit?: Unit;
  building?: Building;
  isSelected: boolean;
  onClick: () => void;
  width?: number;
  height?: number;
  highlightType?: "move" | "attack" | "build";
  isOwned?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tile Style Configurations
// ─────────────────────────────────────────────────────────────────────────────

const getTileStyles = (type: TileType["type"]) => {
  switch (type) {
    // Sky tiles
    case "sky":
    case "cloud":
      return "bg-transparent";

    // Surface tiles
    case "surface":
    case "dirt":
      return "bg-gradient-to-b from-[#4ade80] to-[#166534] shadow-[inset_0_2px_4px_rgba(255,255,255,0.1)] border-t-[3px] border-emerald-400/50";

    // Underground tiles
    case "stone":
      return "bg-[#57534e] shadow-[inset_2px_2px_10px_rgba(0,0,0,0.3)] border-b-2 border-r-2 border-[#44403c]";
    case "deepstone":
      return "bg-[#3f3d3a] shadow-[inset_2px_2px_15px_rgba(0,0,0,0.5)] border-b-2 border-r-2 border-[#2d2b29]";
    case "bedrock":
      return "bg-slate-950 shadow-[inset_0_0_20px_black]";

    // Water/Hazard
    case "water":
      return "bg-blue-500/40 backdrop-blur-md border-t border-blue-400/30 shadow-[inset_0_0_15px_rgba(0,50,200,0.2)]";
    case "magma":
      return "bg-gradient-to-b from-orange-600 to-red-900 shadow-[inset_0_0_20px_rgba(255,100,0,0.5)] animate-pulse";

    // Buildings (when tile type changes to building)
    case "city":
      return "bg-gradient-to-b from-slate-600 to-slate-800 border-2 border-slate-500";
    case "farm":
      return "bg-gradient-to-b from-amber-500 to-amber-700 border border-amber-400/50";
    case "mine":
      return "bg-gradient-to-b from-stone-500 to-stone-700 border border-stone-400/50";
    case "factory":
      return "bg-gradient-to-b from-zinc-600 to-zinc-800 border border-zinc-500/50";
    case "barracks":
      return "bg-gradient-to-b from-red-800 to-red-950 border border-red-700/50";
    case "bunker":
      return "bg-gradient-to-b from-stone-700 to-stone-900 border-2 border-stone-600";
    case "solar_array":
      return "bg-gradient-to-b from-blue-400 to-blue-600 border border-blue-300/50";
    case "skyport":
      return "bg-gradient-to-b from-cyan-600 to-cyan-800 border border-cyan-500/50";
    case "silo":
      return "bg-gradient-to-b from-purple-600 to-purple-900 border-2 border-purple-500";

    // Construction site
    case "construction":
      return "bg-gradient-to-b from-amber-800 to-amber-950 border-2 border-amber-600 animate-pulse";

    // Special
    case "ruins":
      return "bg-gradient-to-b from-amber-900 to-stone-800 border border-amber-700/30";
    case "fog":
      return "bg-black";

    default:
      return "bg-gray-800";
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Texture Overlays
// ─────────────────────────────────────────────────────────────────────────────

const getTextureOverlay = (type: TileType["type"]) => {
  switch (type) {
    case "dirt":
    case "surface":
      return (
        <div
          className="absolute inset-0 opacity-20 mix-blend-overlay pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle at 50% 50%, rgba(0,0,0,0.4) 1px, transparent 1px), 
                              radial-gradient(circle at 10% 20%, rgba(255,255,255,0.2) 1px, transparent 1px)`,
            backgroundSize: '8px 8px'
          }}
        />
      );
    case "stone":
    case "deepstone":
      return (
        <div
          className="absolute inset-0 opacity-30 mix-blend-multiply pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(45deg, transparent 48%, rgba(0,0,0,0.5) 50%, transparent 52%),
                              linear-gradient(-45deg, transparent 48%, rgba(0,0,0,0.5) 50%, transparent 52%)`,
            backgroundSize: '32px 32px'
          }}
        />
      );
    case "bedrock":
      return (
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: 'repeating-linear-gradient(45deg, #000 0px, #000 5px, #1e293b 5px, #1e293b 10px)'
          }}
        />
      );
    default:
      return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Unit Icons
// ─────────────────────────────────────────────────────────────────────────────

const UnitIcon = ({ type }: { type: UnitType }) => {
  switch (type) {
    case "settler":
      return <Rocket className="w-4 h-4 text-white drop-shadow-md" fill="white" />;
    case "rover":
      return <Target className="w-4 h-4 text-white drop-shadow-md" />;
    case "worker":
      return <Pickaxe className="w-4 h-4 text-white drop-shadow-md" />;
    case "marine":
      return <Shield className="w-4 h-4 text-white drop-shadow-md" />;
    case "tank":
      return <Bot className="w-4 h-4 text-white drop-shadow-md" />;
    case "arty":
      return <Target className="w-4 h-4 text-white drop-shadow-md" />;
    case "gunship":
      return <Plane className="w-4 h-4 text-white drop-shadow-md" />;
    default:
      return <Bot className="w-4 h-4 text-white drop-shadow-md" />;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Tile Component
// ─────────────────────────────────────────────────────────────────────────────

export function Tile({ tile, unit, building, isSelected, onClick, width = 64, height = 64, highlightType, isOwned }: TileProps) {
  const isVisible = tile.visibility.length > 0;

  // Fog of war - tile not visible
  if (!isVisible || tile.type === "fog") {
    return (
      <div
        style={{ width, height }}
        className="relative flex items-center justify-center bg-black border border-slate-900 overflow-hidden"
      >
        <div className="absolute inset-0 opacity-10 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] mix-blend-overlay" />
        <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,#00ff0005_2px,#00ff0005_4px)]" />
      </div>
    );
  }

  // Sky tiles with atmospheric gradient
  if (tile.type === "sky" || tile.type === "cloud") {
    const opacity = Math.max(0, (tile.y + 1) * 0.05);
    return (
      <div
        style={{ width, height }}
        className={cn(
          "relative flex items-center justify-center border border-white/5 box-border",
          highlightType === "move" && "ring-2 ring-emerald-400/70 bg-emerald-500/20",
          highlightType === "attack" && "ring-2 ring-red-400/70 bg-red-500/20 cursor-crosshair",
          highlightType === "build" && "ring-2 ring-amber-400/70 bg-amber-500/20"
        )}
        onClick={onClick}
      >
        <div className="absolute inset-0 bg-blue-500 blur-xl" style={{ opacity }} />
        {tile.type === "cloud" && (
          <div className="absolute w-12 h-4 bg-white/10 rounded-full blur-md" />
        )}
        {/* Air units can appear here */}
        {unit && (
          <UnitOverlay unit={unit} isOwned={isOwned} />
        )}
        {/* Highlight indicator */}
        {highlightType && <HighlightIndicator type={highlightType} />}
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      style={{ width, height }}
      className={cn(
        "relative flex items-center justify-center box-border transition-all duration-200 group overflow-hidden cursor-pointer",
        getTileStyles(tile.type),
        "hover:brightness-110 hover:z-20",
        isSelected && "z-30 scale-105 ring-2 ring-emerald-400",
        highlightType === "move" && "ring-2 ring-emerald-400/70 bg-emerald-500/20 z-10",
        highlightType === "attack" && "ring-2 ring-red-500 bg-red-500/30 z-10 cursor-crosshair animate-pulse",
        highlightType === "build" && "ring-2 ring-amber-400/70 bg-amber-500/20 z-10"
      )}
    >
      {/* Base Texture */}
      {getTextureOverlay(tile.type)}

      {/* Resource Overlay (only show if no building) */}
      {tile.resource && !building && (
        <ResourceOverlay resource={tile.resource} />
      )}

      {/* Building Overlay */}
      {building && (
        <BuildingOverlay building={building} isOwned={isOwned} />
      )}

      {/* Unit Overlay */}
      {unit && (
        <UnitOverlay unit={unit} isOwned={isOwned} />
      )}

      {/* Selection Hologram Effect */}
      {isSelected && (
        <SelectionOverlay />
      )}

      {/* Highlight indicator */}
      {highlightType && <HighlightIndicator type={highlightType} />}

      {/* Grid lines (Subtle) */}
      <div className="absolute inset-0 ring-1 ring-inset ring-black/10 pointer-events-none" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ResourceOverlay({ resource }: { resource: TileType["resource"] }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="relative group-hover:-translate-y-1 transition-transform duration-300">
        {/* Glow */}
        <div className={cn(
          "absolute inset-0 blur-lg opacity-40 rounded-full scale-150 animate-pulse",
          resource === "ore" && "bg-blue-300",
          resource === "biomass" && "bg-emerald-400",
          resource === "flux" && "bg-purple-500"
        )} />

        {resource === "ore" && <Mountain className="w-6 h-6 text-slate-200 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]" strokeWidth={2} />}
        {resource === "biomass" && <Hexagon className="w-6 h-6 text-emerald-100 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] fill-emerald-500/40" strokeWidth={2} />}
        {resource === "flux" && <Zap className="w-6 h-6 text-purple-200 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] animate-[pulse_3s_ease-in-out_infinite]" strokeWidth={2} />}
      </div>
    </div>
  );
}

function BuildingOverlay({ building, isOwned }: { building: Building; isOwned?: boolean }) {
  const isUnderConstruction = building.isConstructing;
  const progress = building.buildProgress ?? 0;
  const total = building.turnsToComplete ?? 1;
  const progressPercent = Math.min((progress / total) * 100, 100);

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      <div className="relative">
        {/* Ownership ring */}
        <div className={cn(
          "absolute inset-0 rounded-lg scale-150",
          isOwned ? "ring-2 ring-blue-400/50" : "ring-2 ring-red-400/50",
          isUnderConstruction && "animate-pulse ring-amber-400/50"
        )} />

        {/* Building Glow */}
        <div className={cn(
          "absolute inset-0 blur-md opacity-50 rounded-lg scale-125",
          isUnderConstruction ? "bg-amber-500" : getBuildingGlowColor(building.type)
        )} />

        {/* Building Icon (or construction icon) */}
        {isUnderConstruction ? (
          <Hammer className="w-7 h-7 text-amber-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] animate-bounce" />
        ) : (
          <BuildingIcon type={building.type} />
        )}
      </div>

      {/* Construction Progress Bar */}
      {isUnderConstruction && (
        <div className="absolute bottom-1 w-10 h-1.5 bg-black/80 rounded-full overflow-hidden border border-amber-500/30">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
    </div>
  );
}

function BuildingIcon({ type }: { type: BuildingType }) {
  const iconClass = "w-7 h-7 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]";

  switch (type) {
    case "city":
      return <Home className={cn(iconClass, "text-amber-200")} fill="rgba(251, 191, 36, 0.4)" />;
    case "farm":
      return <Wheat className={cn(iconClass, "text-green-200")} />;
    case "mine":
      return <Pickaxe className={cn(iconClass, "text-stone-200")} />;
    case "factory":
      return <Factory className={cn(iconClass, "text-zinc-200")} />;
    case "barracks":
      return <Shield className={cn(iconClass, "text-red-200")} />;
    case "solar_array":
      return <Sun className={cn(iconClass, "text-blue-200")} />;
    case "skyport":
      return <Plane className={cn(iconClass, "text-cyan-200")} />;
    case "silo":
      return <Rocket className={cn(iconClass, "text-purple-200")} />;
    case "bunker":
      return <Warehouse className={cn(iconClass, "text-stone-300")} />;
    default:
      return <Home className={cn(iconClass, "text-gray-300")} />;
  }
}

function UnitOverlay({ unit, isOwned }: { unit: Unit; isOwned?: boolean }) {
  return (
    <div className="absolute z-20 flex flex-col items-center justify-center w-full h-full pointer-events-none">
      <div className={cn(
        "relative p-1.5 rounded-full shadow-[0_4px_10px_rgba(0,0,0,0.5)] border border-white/20 transition-transform duration-300",
        isOwned
          ? "bg-gradient-to-br from-blue-500 to-blue-700 ring-2 ring-blue-400/50"
          : "bg-gradient-to-br from-red-500 to-red-700 ring-2 ring-red-400/50"
      )}>
        <UnitIcon type={unit.type} />

        {/* Engine Glow for Settler */}
        {unit.type === "settler" && (
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-2 h-4 bg-orange-400 blur-sm rounded-full opacity-80 animate-pulse" />
        )}

        {/* Entrench indicator for Marine */}
        {unit.type === "marine" && unit.entrenched && (
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
        )}
      </div>

      {/* Health Bar */}
      <div className="absolute bottom-1 w-8 h-1 bg-black/80 rounded-full overflow-hidden border border-white/10 mt-1">
        <div
          className={cn(
            "h-full transition-all duration-300",
            unit.hp > UNIT_MAX_HP[unit.type] * 0.5 ? "bg-emerald-500" :
              unit.hp > UNIT_MAX_HP[unit.type] * 0.25 ? "bg-amber-500" : "bg-red-500"
          )}
          style={{ width: `${Math.min((unit.hp / UNIT_MAX_HP[unit.type]) * 100, 100)}%` }}
        />
      </div>

      {/* Moves left indicator */}
      {unit.movesLeft > 0 && isOwned && (
        <div className="absolute top-0 right-0 w-3 h-3 bg-emerald-500 rounded-full text-[8px] flex items-center justify-center font-bold border border-white/20">
          {unit.movesLeft}
        </div>
      )}
    </div>
  );
}

function HighlightIndicator({ type }: { type: "move" | "attack" | "build" }) {
  return (
    <div className={cn(
      "absolute inset-0 pointer-events-none flex items-center justify-center",
      type === "move" && "bg-emerald-400/10",
      type === "attack" && "bg-red-400/20",
      type === "build" && "bg-amber-400/10"
    )}>
      <div className={cn(
        "w-3 h-3 rounded-full animate-ping",
        type === "move" && "bg-emerald-400/60",
        type === "attack" && "bg-red-400/60",
        type === "build" && "bg-amber-400/60"
      )} />
    </div>
  );
}

function SelectionOverlay() {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Animated Scanline */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-400/20 to-transparent h-[200%] w-full animate-[scan_2s_linear_infinite] opacity-50" />

      {/* Corner Brackets */}
      <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.8)]" />
      <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.8)]" />
      <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.8)]" />
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.8)]" />

      {/* Full Border Glow */}
      <div className="absolute inset-0 ring-1 ring-inset ring-emerald-400/30" />
    </div>
  );
}
