"use client";

import { useState } from "react";
import { useUser, UserButton, SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@orbitbound/backend/convex/_generated/api";
import { GameView } from "@/components/game/game-view";
import { CreateGameModal } from "@/components/game/create-game-modal";
import { useGameState, useLobbyActions, useAIActions } from "@/lib/game-hooks";
import { Button } from "@/components/ui/button";
import type { Id } from "@orbitbound/backend/convex/_generated/dataModel";
import {
  Loader2, Rocket, Users, Play, Plus, Bot, X, Cpu,
  Clock, Map as MapIcon, LogOut, History
} from "lucide-react";
import { toast } from "sonner";
import type { FactionId } from "@/types/game";

export default function Home() {
  const { user, isLoaded: userLoaded } = useUser();
  const [gameId, setGameId] = useState<Id<"games"> | null>(null);
  const [playerId, setPlayerId] = useState<Id<"players"> | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [selectedFaction, setSelectedFaction] = useState<FactionId>("united_terran");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { createGame, joinGame, startGame, openGames } = useLobbyActions();
  const { addAIPlayer, removeAIPlayer } = useAIActions();
  const gameState = useGameState(gameId ?? undefined, playerId ?? undefined);
  const userGames = useQuery(api.userGames.getUserGames);
  const [isAddingAI, setIsAddingAI] = useState(false);

  const handleCreateGame = async (width: number, height: number, seed?: number, aiDifficulty?: "easy" | "medium" | "hard") => {
    setIsCreating(true);
    setShowCreateModal(false);
    try {
      const newGameId = await createGame(width, height, seed);
      setGameId(newGameId);
      toast.success("World generated! Now joining...");

      const newPlayerId = await joinGame(newGameId, selectedFaction, user?.id);
      setPlayerId(newPlayerId);
      toast.success("Joined the game!");

      if (aiDifficulty) {
        await addAIPlayer(newGameId, aiDifficulty);
        toast.success(`Added ${aiDifficulty} AI opponent!`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create game");
    } finally {
      setIsCreating(false);
    }
  };

  const handleQuickPlay = async () => {
    setIsCreating(true);
    try {
      const newGameId = await createGame(48, 24);
      setGameId(newGameId);
      const newPlayerId = await joinGame(newGameId, selectedFaction, user?.id);
      setPlayerId(newPlayerId);

      await addAIPlayer(newGameId, "medium");
      await startGame(newGameId, newPlayerId);

      toast.success("Quick game started!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start game");
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

  const handleExitGame = async () => {
    if (!confirm("Are you sure you want to leave this game? Your progress will be saved.")) return;
    setGameId(null);
    setPlayerId(null);
    toast.success("Returned to lobby");
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

  if (!userLoaded) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </main>
    );
  }

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
      <main className="min-h-screen bg-slate-950 relative">
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

  if (gameState && gameState.game.status === "lobby") {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-700 p-8 rounded-2xl shadow-2xl max-w-lg w-full mx-4 relative">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExitGame}
            className="absolute top-4 right-4 h-8 w-8 p-0 text-slate-400 hover:text-red-400 hover:bg-red-900/30"
          >
            <X className="w-4 h-4" />
          </Button>

          <div className="text-center mb-8">
            <Rocket className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-white font-mono">ORBITBOUND</h1>
            <p className="text-slate-400 text-sm mt-2">Lobby - Waiting for players</p>
          </div>

          <div className="space-y-4 mb-6">
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
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase ${p.aiDifficulty === "easy" ? "bg-green-900/50 text-green-400" :
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

            <div className="bg-slate-800/50 rounded-lg p-4">
              <h3 className="text-sm font-mono text-slate-400 uppercase mb-2">World</h3>
              <div className="text-white font-mono text-sm flex items-center gap-2">
                <MapIcon className="w-3 h-3" />
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

  return (
    <main className="min-h-screen bg-slate-950 pt-8">
      {/* Floating Auth Element */}
      <div className="fixed top-6 right-6 z-50">
        <SignedOut>
          <SignInButton mode="modal">
            <button className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/60 backdrop-blur-md border border-slate-700/50 text-slate-300 hover:text-white hover:bg-slate-700/60 hover:border-slate-600/50 transition-all text-sm font-medium shadow-lg">
              Sign In
            </button>
          </SignInButton>
        </SignedOut>
        <SignedIn>
          <UserButton afterSignOutUrl="/" />
        </SignedIn>
      </div>

      <CreateGameModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateGame}
        isCreating={isCreating}
        selectedFaction={selectedFaction}
        onFactionChange={setSelectedFaction}
      />

      <div className="container mx-auto px-4">

        <section className="max-w-2xl mx-auto mb-12">
          <div className="text-center mb-8">
            <Rocket className="w-20 h-20 text-emerald-500 mx-auto mb-6 animate-bounce" />
            <h1 className="text-5xl font-bold text-white font-mono tracking-tight mb-2">ORBITBOUND</h1>
            <p className="text-slate-400 text-lg">Turn-Based 4X Strategy on a Cylinder World</p>
          </div>

          <div className="space-y-3">
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-mono uppercase"
              onClick={handleQuickPlay}
              disabled={isCreating}
            >
              {isCreating ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              Quick Play (vs AI)
            </Button>
            <Button
              className="w-full border-emerald-500/30 text-emerald-400 hover:bg-emerald-900/30 font-mono uppercase"
              onClick={() => setShowCreateModal(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Custom Game
            </Button>
          </div>
        </section>

        {openGames.length > 0 && (
          <section className="max-w-2xl mx-auto mb-12">
            <h3 className="text-xl font-mono text-white font-bold mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-400" />
              Open Games
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {openGames.map((game) => (
                <Button
                  key={game.gameId}
                  variant="outline"
                  onClick={() => handleJoinGame(game.gameId as Id<"games">)}
                  disabled={isJoining}
                  className="flex items-center justify-between w-full bg-slate-900/50 border border-slate-700 rounded-lg p-4 hover:border-emerald-500/50 hover:bg-slate-800/50 transition-all h-auto py-4"
                >
                  <div className="text-left">
                    <div className="text-white font-mono text-sm">
                      {game.width}×{game.height}
                    </div>
                    <div className="text-slate-400 text-xs">
                      {game.playerCount}/{game.maxPlayers} players
                    </div>
                  </div>
                  {isJoining ? <Loader2 className="w-3 h-3 animate-spin" /> : <Users className="w-3 h-3 ml-2" />}
                </Button>
              ))}
            </div>
          </section>
        )}

        {userGames?.activeGames && userGames.activeGames.length > 0 && (
          <section className="max-w-2xl mx-auto mb-12">
            <h3 className="text-xl font-mono text-white font-bold mb-4 flex items-center gap-2">
              <Play className="w-5 h-5 text-emerald-500" />
              Continue Playing
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {userGames.activeGames.map((game) => (
                <Button
                  key={game.gameId}
                  variant="outline"
                  onClick={() => {
                    if (game.status === "lobby") {
                      handleJoinGame(game.gameId as Id<"games">);
                    } else {
                      setGameId(game.gameId as Id<"games">);
                      setPlayerId(game.playerId as Id<"players">);
                    }
                  }}
                  disabled={isJoining}
                  className="flex items-center justify-between w-full bg-slate-900/50 border border-slate-700 rounded-lg p-4 hover:border-emerald-500/50 hover:bg-slate-800/50 transition-all h-auto py-4"
                >
                  <div className="text-left">
                    <div className="text-white font-mono text-sm">
                      {game.width}×{game.height}
                    </div>
                    <div className="text-slate-400 text-xs">
                      Turn {game.turn}
                    </div>
                  </div>
                  {isJoining ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 ml-2" />}
                </Button>
              ))}
            </div>
          </section>
        )}

        {userGames?.completedGames && userGames.completedGames.length > 0 && (
          <section className="max-w-2xl mx-auto mb-12">
            <h2 className="text-xl font-mono text-white font-bold mb-4 flex items-center gap-2">
              <History className="w-5 h-5 text-amber-400" />
              Recent Games
            </h2>
            <div className="space-y-2">
              {userGames.completedGames.slice(0, 5).map((game) => (
                <div
                  key={game.gameId}
                  className="bg-slate-900/30 border border-slate-800 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-white font-mono text-sm">
                      {game.width}×{game.height}
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded font-mono uppercase bg-slate-700 text-slate-300">
                      {game.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-2 flex items-center gap-4">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Turn {game.turn}
                    </span>
                    <span className="font-mono text-emerald-400">
                      {game.faction?.replace("_", " ").toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="text-center py-8">
          <p className="text-slate-500 text-xs font-mono">
            {user ? `Logged in as ${user.firstName || user.username || user.emailAddresses[0]?.emailAddress}` : "Sign in to save your games"}
          </p>
        </footer>
      </div>
    </main>
  );
}
