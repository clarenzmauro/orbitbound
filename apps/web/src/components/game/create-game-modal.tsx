"use client";

import { useState } from "react";
import { X, Map, Cpu, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { FactionId } from "@/types/game";

interface CreateGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (width: number, height: number, seed?: number, aiDifficulty?: "easy" | "medium" | "hard") => void;
  isCreating: boolean;
  selectedFaction: FactionId;
  onFactionChange: (faction: FactionId) => void;
}

const WORLD_SIZES = [
  { name: "Small", width: 32, height: 16, description: "Quick games (1-2 players)" },
  { name: "Medium", width: 48, height: 24, description: "Standard games (2-4 players)" },
  { name: "Large", width: 64, height: 32, description: "Epic battles (4-8 players)" },
];

export function CreateGameModal({ isOpen, onClose, onCreate, isCreating, selectedFaction, onFactionChange }: CreateGameModalProps) {
  const [selectedSize, setSelectedSize] = useState(1);
  const [seed, setSeed] = useState("");
  const [aiDifficulty, setAIDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [autoAddAI, setAutoAddAI] = useState(true);

  if (!isOpen) return null;

  const handleCreate = () => {
    const size = WORLD_SIZES[selectedSize];
    const seedNumber = seed ? parseInt(seed, 10) : undefined;
    const difficulty = autoAddAI ? aiDifficulty : undefined;
    onCreate(size.width, size.height, seedNumber, difficulty);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in fade-in slide-in-from-bottom-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white font-mono">Create Game</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-6">
          <div>
            <Label className="text-sm font-mono text-slate-400 uppercase mb-3 block">World Size</Label>
            <div className="grid grid-cols-3 gap-2">
              {WORLD_SIZES.map((size, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedSize(index)}
                  className={`p-3 rounded-lg border-2 transition-all ${selectedSize === index
                      ? "border-emerald-500 bg-emerald-900/20 text-emerald-400"
                      : "border-slate-700 hover:border-slate-600 text-slate-300"
                    }`}
                >
                  <div className="font-mono text-lg font-bold">{size.name}</div>
                  <div className="text-xs text-slate-400">{size.width}×{size.height}</div>
                  <div className="text-[10px] text-slate-500 mt-1">{size.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-sm font-mono text-slate-400 uppercase mb-3 block">Map Seed (Optional)</Label>
            <div className="relative">
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                placeholder="Random if empty"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent font-mono"
              />
              <Map className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            </div>
          </div>

          <div>
            <Label className="text-sm font-mono text-slate-400 uppercase mb-3 block">Faction</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["united_terran", "xeno_hive", "cyber_synapse"] as FactionId[]).map((faction) => (
                <button
                  key={faction}
                  onClick={() => onFactionChange(faction)}
                  className={`p-3 rounded-lg border-2 transition-all text-xs font-mono uppercase ${selectedFaction === faction
                      ? "border-emerald-500 bg-emerald-900/20 text-emerald-400"
                      : "border-slate-700 hover:border-slate-600 text-slate-300"
                    }`}
                >
                  {faction.replace("_", " ").slice(0, 8)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-sm font-mono text-slate-400 uppercase mb-3 block flex items-center gap-2">
              <Cpu className="w-4 h-4" />
              Quick Setup
            </Label>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="autoAddAI"
                  checked={autoAddAI}
                  onChange={(e) => setAutoAddAI(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500"
                />
                <label htmlFor="autoAddAI" className="text-sm text-slate-300">
                  Add 1 AI opponent
                </label>
              </div>

              {autoAddAI && (
                <div className="grid grid-cols-3 gap-2 ml-7">
                  {(["easy", "medium", "hard"] as const).map((difficulty) => (
                    <button
                      key={difficulty}
                      onClick={() => setAIDifficulty(difficulty)}
                      className={`p-2 rounded-lg border-2 transition-all text-xs font-mono uppercase ${aiDifficulty === difficulty
                          ? "border-emerald-500 bg-emerald-900/20 text-emerald-400"
                          : "border-slate-700 hover:border-slate-600 text-slate-300"
                        }`}
                    >
                      {difficulty}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <Button
            onClick={handleCreate}
            disabled={isCreating}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-mono uppercase"
          >
            {isCreating ? "Creating..." : "Create Game"}
          </Button>
        </div>
      </div>
    </div>
  );
}
