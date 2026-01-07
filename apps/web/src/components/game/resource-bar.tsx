import React from "react";
import type { PlayerResources } from "@/types/game";
import { Leaf, Hammer, Zap, FlaskConical, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";

interface ResourceBarProps {
  resources: PlayerResources;
  turn: number;
  isMyTurn?: boolean;
  onTechClick?: () => void;
  income?: { biomass: number; ore: number; flux: number };
}

export function ResourceBar({ resources, turn, isMyTurn, onTechClick, income }: ResourceBarProps) {
  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      {/* Main HUD Container */}
      <div className="mx-auto max-w-4xl mt-4">
        <div className="relative flex items-center justify-between bg-slate-950/80 backdrop-blur-md border border-slate-800 rounded-full px-6 py-3 shadow-[0_0_20px_rgba(0,0,0,0.5)] ring-1 ring-white/10">
            
            {/* Resources Group */}
            <div className="flex items-center gap-6">
                <ResourceItem
                  icon={Leaf}
                  value={resources.biomass}
                  income={income?.biomass}
                  label="Biomass"
                  color="text-emerald-400"
                  glowColor="shadow-emerald-500/20"
                />
                <div className="h-8 w-px bg-slate-800" />
                <ResourceItem
                  icon={Hammer}
                  value={resources.ore}
                  income={income?.ore}
                  label="Ore"
                  color="text-slate-300"
                  glowColor="shadow-slate-500/20"
                />
                <div className="h-8 w-px bg-slate-800" />
                <ResourceItem
                  icon={Zap}
                  value={resources.flux}
                  income={income?.flux}
                  label="Flux"
                  color="text-purple-400"
                  glowColor="shadow-purple-500/20"
                />
            </div>

            {/* Turn Counter / Status */}
            <div className="flex items-center gap-4">
                 {isMyTurn !== undefined && (
                   <div className={cn(
                     "px-3 py-1 rounded-full text-xs font-mono uppercase tracking-wide border",
                     isMyTurn 
                       ? "bg-emerald-900/50 text-emerald-400 border-emerald-500/30 animate-pulse" 
                       : "bg-slate-800/50 text-slate-400 border-slate-700/30"
                   )}>
                     {isMyTurn ? "Your Turn" : "Waiting..."}
                   </div>
                 )}
                 <div className="flex flex-col items-end">
                    <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Turn</span>
                    <span className="font-mono text-xl font-bold text-white leading-none">{turn}</span>
                 </div>
                 <Button 
                    variant="outline" 
                    size="icon" 
                    className="rounded-full border-purple-700/50 bg-purple-900/30 hover:bg-purple-800/50 text-purple-300 hover:text-purple-200"
                    onClick={onTechClick}
                    title="Tech Tree (T)"
                 >
                    <FlaskConical className="h-4 w-4" />
                 </Button>
            </div>
        </div>
      </div>
    </div>
  );
}

function ResourceItem({
  icon: Icon,
  value,
  income,
  label,
  color,
  glowColor
}: {
  icon: React.ElementType;
  value: number;
  income?: number;
  label: string;
  color: string;
  glowColor: string;
}) {
  return (
    <div className="flex items-center gap-3 group cursor-help" title={`${label}: ${value}${income ? ` (+${income}/turn)` : ''}`}>
      <div className={cn("p-2 rounded-full bg-slate-900 ring-1 ring-white/5 transition-all group-hover:ring-white/20", glowColor, "shadow-[0_0_15px_rgba(0,0,0,0)] group-hover:shadow-[0_0_15px_var(--tw-shadow-color)]")}>
         <Icon className={cn("h-4 w-4 transition-transform group-hover:scale-110", color)} />
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{label}</span>
        <div className="flex items-center gap-1">
          <span className={cn("font-mono text-lg font-bold leading-none", color)}>{value}</span>
          {income !== undefined && income > 0 && (
            <span className="text-[10px] text-emerald-400/80 font-mono flex items-center">
              <TrendingUp className="w-2.5 h-2.5 mr-0.5" />
              +{income}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
