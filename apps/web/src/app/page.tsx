"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { GameView } from "@/components/game/game-view";
import { useGameState, useLobbyActions, useAIActions } from "@/lib/game-hooks";
import { Button } from "@/components/ui/button";
import type { Id } from "@orbitbound/backend/convex/_generated/dataModel";
import { Loader2, Rocket, Users, Play, Plus, Bot, X, Cpu } from "lucide-react";
import { toast } from "sonner";
import type { FactionId } from "@/types/game";

export default function Home() {
  const { user, isLoaded: userLoaded } = useUser();
  const [gameId, setGameId] = useState<Id<"games"> | null>(null);
  const [playerId, setPlayerId] = useState<Id<"players"> | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [selectedFaction, setSelectedFaction] = useState<FactionId>("united_terran");

  const { createGame, joinGame, startGame, openGames } = useLobbyActions();
  const { addAIPlayer, removeAIPlayer } = useAIActions();
  const gameState = useGameState(gameId ?? undefined, playerId ?? undefined);
  const [isAddingAI, setIsAddingAI] = useState(false);

  // ─────────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const handleCreateGame = async () => {
    setIsCreating(true);
    try {
      const newGameId = await createGame(48, 24); // 48 wide, 24 tall
      setGameId(newGameId);
      toast.success("World generated! Now joining...");
      
      // Auto-join the game
      const newPlayerId = await joinGame(newGameId, selectedFaction, user?.id);
      setPlayerId(newPlayerId);
      toast.success("Joined the game!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create game");
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinGame = async (targetGameId: Id<"games">) => {
    setIsJoining(true);
    try {
      const newPlayerId = await joinGame(targetGameId, selectedFaction, user?.id);
      setGameId(targetGameId);
      setPlayerId(newPlayerId);
      toast.success("Joined the game!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to join game");
    } finally {
      setIsJoining(false);
    }
  };

  const handleStartGame = async () => {
    if (!gameId || !playerId) return;
    try {
      await startGame(gameId, playerId);
      toast.success("Game started!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start game");
    }
  };

  const handleAddAI = async (difficulty: "easy" | "medium" | "hard") => {
    if (!gameId) return;
    setIsAddingAI(true);
    try {
      await addAIPlayer(gameId, difficulty);
      toast.success(`Added ${difficulty} AI opponent!`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add AI");
    } finally {
      setIsAddingAI(false);
    }
  };

  const handleRemoveAI = async (aiPlayerId: Id<"players">) => {
    if (!gameId) return;
    try {
      await removeAIPlayer(gameId, aiPlayerId);
      toast.success("Removed AI player");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove AI");
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render States
  // ─────────────────────────────────────────────────────────────────────────────

  // Loading user
  if (!userLoaded) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </main>
    );
  }

  // Game is active - render game view
  if (gameState && gameState.game.status === "active") {
    const currentPlayer = gameState.players.find((p) => p._id === playerId);
    if (!currentPlayer) {
      return (
        <main className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
          Player not found
        </main>
      );
    }

    return (
      <main className="min-h-screen bg-slate-950">
        <GameView
          game={gameState.game}
          player={currentPlayer}
          units={gameState.units}
          buildings={gameState.buildings}
          allPlayers={gameState.players}
        />
      </main>
    );
  }

  // In lobby - show lobby UI
  if (gameState && gameState.game.status === "lobby") {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-700 p-8 rounded-2xl shadow-2xl max-w-lg w-full mx-4">
          <div className="text-center mb-8">
            <Rocket className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-white font-mono">ORBITBOUND</h1>
            <p className="text-slate-400 text-sm mt-2">Lobby - Waiting for players</p>
          </div>

          <div className="space-y-4 mb-6">
            {/* Players List */}
            <div className="bg-slate-800/50 rounded-lg p-4">
              <h3 className="text-sm font-mono text-slate-400 uppercase mb-2">Players ({gameState.players.length}/8)</h3>
              {gameState.players.map((p) => (
                <div key={p._id} className="flex items-center justify-between py-2 border-b border-slate-700 last:border-0">
                  <div className="flex items-center gap-2">
                    {p.isAI ? (
                      <Bot className="w-4 h-4 text-purple-400" />
                    ) : (
                      <Users className="w-4 h-4 text-blue-400" />
                    )}
                    <span className="text-white font-mono">
                      {p.isAI ? p.aiName : p.faction.replace("_", " ")}
                    </span>
                    {p.isAI && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase ${
                        p.aiDifficulty === "easy" ? "bg-green-900/50 text-green-400" :
                        p.aiDifficulty === "medium" ? "bg-amber-900/50 text-amber-400" :
                        "bg-red-900/50 text-red-400"
                      }`}>
                        {p.aiDifficulty}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${p._id === playerId ? "text-blue-400" : "text-emerald-400"}`}>
                      {p._id === playerId ? "You" : p.isAI ? p.faction.slice(0, 6) : "Ready"}
                    </span>
                    {p.isAI && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-slate-400 hover:text-red-400 hover:bg-red-900/30"
                        onClick={() => handleRemoveAI(p._id as Id<"players">)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Add AI Players */}
            {gameState.players.length < 8 && (
              <div className="bg-slate-800/50 rounded-lg p-4">
                <h3 className="text-sm font-mono text-slate-400 uppercase mb-3 flex items-center gap-2">
                  <Cpu className="w-4 h-4" />
                  Add AI Opponent
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-green-700/50 text-green-400 hover:bg-green-900/30 font-mono text-xs"
                    onClick={() => handleAddAI("easy")}
                    disabled={isAddingAI}
                  >
                    {isAddingAI ? <Loader2 className="w-3 h-3 animate-spin" /> : "Easy"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-700/50 text-amber-400 hover:bg-amber-900/30 font-mono text-xs"
                    onClick={() => handleAddAI("medium")}
                    disabled={isAddingAI}
                  >
                    {isAddingAI ? <Loader2 className="w-3 h-3 animate-spin" /> : "Medium"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-700/50 text-red-400 hover:bg-red-900/30 font-mono text-xs"
                    onClick={() => handleAddAI("hard")}
                    disabled={isAddingAI}
                  >
                    {isAddingAI ? <Loader2 className="w-3 h-3 animate-spin" /> : "Hard"}
                  </Button>
                </div>
              </div>
            )}

            {/* World Info */}
            <div className="bg-slate-800/50 rounded-lg p-4">
              <h3 className="text-sm font-mono text-slate-400 uppercase mb-2">World</h3>
              <div className="text-white font-mono text-sm">
                {gameState.game.width} × {gameState.game.height} tiles
              </div>
            </div>
          </div>

          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-mono uppercase"
            onClick={handleStartGame}
            disabled={gameState.players.length < 2}
          >
            <Play className="w-4 h-4 mr-2" />
            Start Game ({gameState.players.length} players)
          </Button>
          
          {gameState.players.length < 2 && (
            <p className="text-center text-amber-400/70 text-xs mt-2 font-mono">
              Add at least one AI opponent to start
            </p>
          )}
        </div>
      </main>
    );
  }

  // No game - show main menu
  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-700 p-8 rounded-2xl shadow-2xl max-w-md w-full mx-4">
        <div className="text-center mb-8">
          <Rocket className="w-16 h-16 text-emerald-500 mx-auto mb-4 animate-bounce" />
          <h1 className="text-4xl font-bold text-white font-mono tracking-tight">ORBITBOUND</h1>
          <p className="text-slate-400 text-sm mt-2">Turn-Based 4X Strategy on a Cylinder World</p>
        </div>

        {/* Faction Selection */}
        <div className="mb-6">
          <label className="block text-sm font-mono text-slate-400 uppercase mb-2">Select Faction</label>
          <div className="grid grid-cols-3 gap-2">
            {(["united_terran", "xeno_hive", "cyber_synapse"] as FactionId[]).map((faction) => (
              <Button
                key={faction}
                variant={selectedFaction === faction ? "default" : "outline"}
                className={`text-xs font-mono ${
                  selectedFaction === faction 
                    ? "bg-emerald-600 hover:bg-emerald-500" 
                    : "border-slate-700 hover:bg-slate-800"
                }`}
                onClick={() => setSelectedFaction(faction)}
              >
                {faction.replace("_", " ").toUpperCase().slice(0, 8)}
              </Button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-mono uppercase tracking-wide"
            onClick={handleCreateGame}
            disabled={isCreating}
          >
            {isCreating ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Plus className="w-4 h-4 mr-2" />
            )}
            Create New Game
          </Button>

          {openGames.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-mono text-slate-400 uppercase mb-3">Open Games</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {openGames.map((game) => (
                  <div
                    key={game.gameId}
                    className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3"
                  >
                    <div>
                      <div className="text-white font-mono text-sm">
                        {game.width}×{game.height}
                      </div>
                      <div className="text-slate-400 text-xs">
                        {game.playerCount}/{game.maxPlayers} players
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-900/30"
                      onClick={() => handleJoinGame(game.gameId as Id<"games">)}
                      disabled={isJoining}
                    >
                      <Users className="w-3 h-3 mr-1" />
                      Join
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-slate-500 text-xs mt-8 font-mono">
          {user ? `Logged in as ${user.firstName}` : "Playing as Guest"}
        </p>
      </div>
    </main>
  );
}
