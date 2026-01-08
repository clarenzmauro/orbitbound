"use client";

import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { FlaskConical, X, Zap, CircleDot, Lock, Check, HelpCircle } from "lucide-react";
import { TECH_DEFS } from "@orbitbound/backend/convex/lib/constants";
import type { TechDef } from "@orbitbound/backend/convex/lib/constants";
import type { Id } from "@orbitbound/backend/convex/_generated/dataModel";

interface TechNode {
    techId: string;
    def: TechDef;
    alreadyResearched: boolean;
    canResearch: boolean;
}

interface TechTreeModalProps {
    techTree: {
        techId: string;
        alreadyResearched: boolean;
        canResearch: boolean;
        cost: number;
        description: string;
        name: string;
        prerequisites: string[];
        tier: number;
        unlocks: string[];
    }[];
    playerResources: { flux: number };
    onClose: () => void;
    onResearch: (techId: string) => void;
    isLoading: boolean;
}

// Fixed dimensions for the tree visualization
const NODE_WIDTH = 220;
const NODE_HEIGHT = 140;
const X_SPACING = 300; // Horizontal space between tiers
const Y_SPACING = 160; // Vertical space between nodes in the same tier

// Define preferred vertical order to minimize line crossings
const PREFERRED_ORDER = [
    // Tier 1
    "logistics",        // Top (leads to Deep Core)
    "militarization",   // Bottom (leads to Ballistics)

    // Tier 2
    "deep_core",        // Top
    "heat_shield",      // Middle (requires Deep Core)
    "ballistics",       // Bottom

    // Tier 3
    "orbital_mechanics", // Top (requires Deep Core)
    "flight",            // Bottom (requires Ballistics)

    // Tier 4
    "the_ark_project"
];

export function TechTreeModal({ techTree, playerResources, onClose, onResearch, isLoading }: TechTreeModalProps) {

    // Organize techs by tier
    const tiers = useMemo(() => {
        const tierMap = new Map<number, typeof techTree>();
        techTree.forEach((tech) => {
            const tier = tech.tier;
            if (!tierMap.has(tier)) {
                tierMap.set(tier, []);
            }
            tierMap.get(tier)?.push(tech);
        });

        // Sort nodes within each tier
        tierMap.forEach((techs) => {
            techs.sort((a, b) => {
                const indexA = PREFERRED_ORDER.indexOf(a.techId);
                const indexB = PREFERRED_ORDER.indexOf(b.techId);
                // If not in preferred list, push to end
                return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
            });
        });

        return Array.from(tierMap.entries()).sort((a, b) => a[0] - b[0]);
    }, [techTree]);

    // Calculate actual coordinates for each node
    const nodePositions = useMemo(() => {
        const positions = new Map<string, { x: number; y: number }>();

        tiers.forEach(([tier, techs]) => {
            const x = 50 + tier * X_SPACING;
            techs.forEach((tech, index) => {
                // Center vertically based on number of items
                const yOffset = (techs.length - 1) * Y_SPACING / 2;
                const y = 300 + (index * Y_SPACING) - yOffset;
                positions.set(tech.techId, { x, y });
            });
        });

        return positions;
    }, [tiers]);

    // Generate SVG paths for connections
    const connections = useMemo(() => {
        const paths: React.ReactNode[] = [];

        techTree.forEach((tech) => {
            const startNode = nodePositions.get(tech.techId);
            if (!startNode) return;

            tech.prerequisites.forEach((prereqId) => {
                const endNode = nodePositions.get(prereqId);
                if (!endNode) return;

                // Draw curve from prereq (right side) to current tech (left side)
                const startX = endNode.x + NODE_WIDTH;
                const startY = endNode.y + NODE_HEIGHT / 2;
                const endX = startNode.x;
                const endY = startNode.y + NODE_HEIGHT / 2;

                const controlPointX1 = startX + (endX - startX) / 2;
                const controlPointX2 = endX - (endX - startX) / 2;

                const isResearched = tech.alreadyResearched;
                const isAvailable = tech.canResearch;

                paths.push(
                    <path
                        key={`${prereqId}-${tech.techId}`}
                        d={`M ${startX} ${startY} C ${controlPointX1} ${startY}, ${controlPointX2} ${endY}, ${endX} ${endY}`}
                        fill="none"
                        stroke={isResearched ? "#10b981" : isAvailable ? "#a855f7" : "#334155"}
                        strokeWidth={2}
                        className="transition-colors duration-500"
                        strokeDasharray={isAvailable && !isResearched ? "5,5" : "none"}
                    />
                );
            });
        });

        return paths;
    }, [techTree, nodePositions]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200">
            <div className="relative w-full max-w-[95vw] h-[90vh] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900 z-10">
                    <div className="flex items-center gap-4">
                        <div className="bg-purple-900/30 p-2 rounded-lg border border-purple-500/30">
                            <FlaskConical className="w-6 h-6 text-purple-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white font-mono">Research Lab</h2>
                            <p className="text-xs text-slate-400 flex items-center gap-2">
                                Current Flux: <span className="text-purple-400 font-bold flex items-center gap-1">
                                    <Zap className="w-3 h-3 fill-current" /> {playerResources.flux}
                                </span>
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-4 text-xs font-mono mr-4 bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-700">
                            <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>Researched</span>
                            <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]"></div>Available</span>
                            <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-slate-600"></div>Locked</span>
                        </div>
                        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-slate-800">
                            <X className="w-5 h-5 text-slate-400" />
                        </Button>
                    </div>
                </div>

                {/* Canvas Area */}
                <div className="flex-1 overflow-auto relative bg-[url('/grid.svg')] bg-repeat opacity-100 cursor-grab active:cursor-grabbing">
                    <div className="min-w-[1200px] min-h-[600px] p-8 relative" style={{ height: "100%" }}>

                        {/* Background SVG Layer for connections */}
                        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
                            {connections}
                        </svg>

                        {/* Nodes */}
                        {techTree.map((tech) => {
                            const pos = nodePositions.get(tech.techId);
                            if (!pos) return null;

                            const isResearched = tech.alreadyResearched;
                            const isAvailable = tech.canResearch;
                            const isLocked = !isResearched && !isAvailable;
                            const canAfford = playerResources.flux >= tech.cost;

                            return (
                                <div
                                    key={tech.techId}
                                    className={`absolute p-4 rounded-xl border transition-all duration-300 flex flex-col justify-between group
                    ${isResearched
                                            ? "bg-emerald-950/40 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                                            : isAvailable
                                                ? "bg-slate-900 border-purple-500/50 hover:border-purple-400 hover:shadow-[0_0_20px_rgba(168,85,247,0.2)] hover:-translate-y-1 cursor-pointer"
                                                : "bg-slate-900/50 border-slate-800 opacity-60 grayscale filter"
                                        }
                  `}
                                    style={{
                                        left: pos.x,
                                        top: pos.y,
                                        width: NODE_WIDTH,
                                        height: NODE_HEIGHT,
                                    }}
                                    onClick={() => isAvailable && !isLoading && onResearch(tech.techId)}
                                >
                                    {/* Status Indicator */}
                                    <div className="flex justify-between items-start mb-2">
                                        <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border 
                       ${isResearched ? "bg-emerald-900/30 text-emerald-400 border-emerald-500/30" :
                                                isAvailable ? "bg-purple-900/30 text-purple-400 border-purple-500/30" : "bg-slate-800 text-slate-500 border-slate-700"}`}
                                        >
                                            Tier {tech.tier}
                                        </span>
                                        {isResearched ? <Check className="w-4 h-4 text-emerald-500" /> : isAvailable ? null : <Lock className="w-4 h-4 text-slate-600" />}
                                    </div>

                                    {/* Title & Cost */}
                                    <div>
                                        <h3 className={`font-bold font-mono text-sm mb-1 ${isResearched ? "text-emerald-100" : isAvailable ? "text-purple-100" : "text-slate-400"}`}>
                                            {tech.name}
                                        </h3>
                                        {!isResearched && (
                                            <div className={`text-xs font-bold flex items-center gap-1 ${canAfford ? "text-purple-400" : "text-red-400"}`}>
                                                <Zap className="w-3 h-3 fill-current" />
                                                {tech.cost} Flux
                                            </div>
                                        )}
                                    </div>

                                    {/* Description & Unlocks */}
                                    <div className="mt-3 pt-3 border-t border-white/5">
                                        {tech.unlocks.length > 0 ? (
                                            <div className="text-[10px] text-slate-400 flex flex-wrap gap-1">
                                                <span className="text-slate-500">Unlocks:</span>
                                                {tech.unlocks.map(u => (
                                                    <span key={u} className="text-blue-300 bg-blue-900/20 px-1 rounded">{u}</span>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-[10px] text-slate-500 italic line-clamp-2">{tech.description}</p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
