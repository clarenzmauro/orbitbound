/**
 * AI Player Actions
 * 
 * Main decision-making logic for AI players. Uses a priority-based system
 * to make decisions each turn.
 */

import { v } from "convex/values";
import { internalAction, internalMutation } from "../_generated/server";
import { internal, api } from "../_generated/api";
import { AI_TURN_DELAY_MS, AI_WEIGHTS } from "./constants";
import {
  analyzeGameState,
  findMoveToward,
  findEnemiesInRange,
  directionToCommand,
  chooseBuildingToBuild,
  chooseUnitToSpawn,
} from "./helpers";

/**
 * Main AI turn execution - called when it's an AI player's turn
 */
export const runAITurn = internalAction({
  args: {
    gameId: v.id("games"),
    playerId: v.id("players"),
  },
  handler: async (ctx, { gameId, playerId }) => {
    // Small delay to make AI turns feel more natural
    await new Promise((resolve) => setTimeout(resolve, AI_TURN_DELAY_MS));

    // Get current game state
    const game = await ctx.runQuery(internal.ai.queries.getGameForAI, { gameId });
    if (!game || game.status !== "active") return;

    const player = await ctx.runQuery(internal.ai.queries.getPlayerForAI, { playerId });
    if (!player || !player.isAlive || !player.isAI) return;

    // Check if it's still this AI's turn
    const currentPlayerId = game.playerOrder[game.activePlayerIndex];
    if (currentPlayerId !== playerId) return;

    const difficulty = player.aiDifficulty ?? "medium";
    const weights = AI_WEIGHTS[difficulty];

    // Get all units and buildings
    const allUnits = await ctx.runQuery(internal.ai.queries.getUnitsForAI, { gameId });
    const allBuildings = await ctx.runQuery(internal.ai.queries.getBuildingsForAI, { gameId });

    const myUnits = allUnits.filter((u) => u.playerId === playerId);
    const myBuildings = allBuildings.filter((b) => b.playerId === playerId);

    // Analyze the game state
    const analysis = analyzeGameState(game, player, myUnits, myBuildings, allUnits, allBuildings);

    console.log(`[AI] ${player.aiName} - Cities: ${analysis.cityCount}, Army: ${analysis.armyStrength}, Visible enemies: ${analysis.visibleEnemyUnits.length}`);

    try {
      // ─────────────────────────────────────────────────────────────────────
      // Priority 1: Found cities with settlers
      // ─────────────────────────────────────────────────────────────────────
      for (const settler of analysis.settlers) {
        if (settler.movesLeft <= 0) continue;

        const shouldFound = analysis.cityCount === 0 || 
          (analysis.expansionOpportunities.some(
            (e) => Math.abs(e.x - settler.x) + Math.abs(e.y - settler.y) <= 2
          ) && Math.random() > weights.randomness);

        if (shouldFound) {
          try {
            await ctx.runMutation(api.units.foundCity, { unitId: settler._id, playerId });
            console.log(`[AI] ${player.aiName} founded a city!`);
            continue;
          } catch {
            // Not a valid spot, try moving instead
          }
        }

        // Move settler toward expansion opportunity
        if (analysis.expansionOpportunities.length > 0) {
          const target = analysis.expansionOpportunities[0];
          const move = findMoveToward(settler, target.x, target.y, game, allUnits, allBuildings);
          if (move) {
            try {
              await ctx.runMutation(api.units.move, {
                unitId: settler._id,
                playerId,
                direction: directionToCommand(move.dx, move.dy),
              });
            } catch {
              // Move failed
            }
          }
        }
      }

      // ─────────────────────────────────────────────────────────────────────
      // Priority 2: Attack enemies in range
      // ─────────────────────────────────────────────────────────────────────
      for (const unit of analysis.combatUnits) {
        if (unit.movesLeft <= 0) continue;

        const targets = findEnemiesInRange(
          unit, game, analysis.visibleEnemyUnits, analysis.visibleEnemyBuildings
        );

        if (targets.length > 0) {
          const target = targets[0];
          try {
            await ctx.runMutation(api.combat.attack, {
              attackerUnitId: unit._id,
              playerId,
              targetX: target.target.x,
              targetY: target.target.y,
            });
            console.log(`[AI] ${player.aiName} attacked at (${target.target.x}, ${target.target.y})`);
          } catch {
            // Attack failed
          }
        }
      }

      // ─────────────────────────────────────────────────────────────────────
      // Priority 3: Move combat units toward enemies or explore
      // ─────────────────────────────────────────────────────────────────────
      const updatedUnits = await ctx.runQuery(internal.ai.queries.getUnitsForAI, { gameId });
      const updatedCombatUnits = updatedUnits.filter(
        (u) => u.playerId === playerId && u.type !== "settler" && u.type !== "worker"
      );

      for (const unit of updatedCombatUnits) {
        if (unit.movesLeft <= 0) continue;

        let target: { x: number; y: number } | null = null;

        if (analysis.visibleEnemyUnits.length > 0) {
          target = { x: analysis.visibleEnemyUnits[0].x, y: analysis.visibleEnemyUnits[0].y };
        } else if (analysis.visibleEnemyBuildings.length > 0) {
          target = { x: analysis.visibleEnemyBuildings[0].x, y: analysis.visibleEnemyBuildings[0].y };
        } else if (Math.random() > 0.3) {
          // Random exploration
          const dirs = ["L", "R", "U", "D"] as const;
          const randomDir = dirs[Math.floor(Math.random() * dirs.length)];
          try {
            await ctx.runMutation(api.units.move, { unitId: unit._id, playerId, direction: randomDir });
          } catch {
            // Move failed
          }
          continue;
        }

        if (target) {
          const move = findMoveToward(unit, target.x, target.y, game, updatedUnits, allBuildings);
          if (move) {
            try {
              await ctx.runMutation(api.units.move, {
                unitId: unit._id,
                playerId,
                direction: directionToCommand(move.dx, move.dy),
              });
            } catch {
              // Move failed
            }
          }
        }
      }

      // ─────────────────────────────────────────────────────────────────────
      // Priority 4: Build structures from cities (only if affordable)
      // ─────────────────────────────────────────────────────────────────────
      // Re-fetch player to get updated resources
      const updatedPlayer = await ctx.runQuery(internal.ai.queries.getPlayerForAI, { playerId });
      if (updatedPlayer) {
        const myCities = myBuildings.filter((b) => b.type === "city");
        
        for (const city of myCities) {
          const buildable = await ctx.runQuery(api.buildings.getBuildableBuildings, {
            playerId,
            cityId: city._id,
          });

          // Filter to only affordable buildings with tech unlocked
          const affordableBuildings = buildable.filter((b) => b.canAfford && b.techUnlocked);

          if (affordableBuildings.length > 0 && Math.random() > weights.randomness) {
            const toBuild = chooseBuildingToBuild(
              analysis,
              updatedPlayer,
              affordableBuildings.map((b) => b.type)
            );

            if (toBuild) {
              // Find valid adjacent tile
              const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
              for (const [dx, dy] of dirs) {
                const nx = (city.x + dx + game.width) % game.width;
                const ny = Math.max(0, Math.min(game.height - 1, city.y + dy));
                const idx = ny * game.width + nx;
                const tile = game.map[idx];

                if (tile && !tile.buildingId && !tile.unitId && 
                    tile.type !== "bedrock" && tile.type !== "water" && tile.type !== "sky") {
                  try {
                    await ctx.runMutation(api.buildings.placeBuilding, {
                      playerId,
                      cityId: city._id,
                      buildingType: toBuild,
                      targetX: nx,
                      targetY: ny,
                    });
                    console.log(`[AI] ${player.aiName} built a ${toBuild}`);
                    break;
                  } catch {
                    // Build failed, try next spot
                  }
                }
              }
            }
          }
        }
      }

      // ─────────────────────────────────────────────────────────────────────
      // Priority 5: Spawn units (only if affordable and tech unlocked)
      // ─────────────────────────────────────────────────────────────────────
      const latestPlayer = await ctx.runQuery(internal.ai.queries.getPlayerForAI, { playerId });
      if (latestPlayer) {
        const productionBuildings = myBuildings.filter(
          (b) => b.type === "city" || b.type === "barracks" || b.type === "factory"
        );

        for (const building of productionBuildings) {
          const spawnable = await ctx.runQuery(api.buildings.getSpawnableUnits, {
            playerId,
            buildingId: building._id,
          });

          // Filter to only affordable units with tech unlocked
          const affordableUnits = spawnable.filter((u) => u.canAfford && u.techUnlocked);

          if (affordableUnits.length > 0 && Math.random() > weights.randomness * 0.5) {
            const toSpawn = chooseUnitToSpawn(
              analysis,
              latestPlayer,
              affordableUnits.map((u) => ({
                unitType: u.type,
                cost: {
                  biomass: u.cost?.biomass ?? 0,
                  ore: u.cost?.ore ?? 0,
                  flux: u.cost?.flux ?? 0,
                },
              }))
            );

            if (toSpawn) {
              try {
                await ctx.runMutation(api.units.spawnUnit, {
                  playerId,
                  buildingId: building._id,
                  unitType: toSpawn,
                });
                console.log(`[AI] ${player.aiName} spawned a ${toSpawn}`);
              } catch {
                // Spawn failed
              }
            }
          }
        }
      }

      // ─────────────────────────────────────────────────────────────────────
      // Priority 6: Research tech (only if not already researched)
      // ─────────────────────────────────────────────────────────────────────
      const finalPlayer = await ctx.runQuery(internal.ai.queries.getPlayerForAI, { playerId });
      if (finalPlayer && finalPlayer.resources.flux >= 10) {
        const availableTech = await ctx.runQuery(api.tech.getAvailableTech, { playerId });
        
        // Filter to only researchable tech (not already researched, can afford, has prereqs)
        const researchableTech = availableTech.filter(
          (t) => t.canResearch && !t.alreadyResearched && finalPlayer.resources.flux >= t.cost
        );

        if (researchableTech.length > 0) {
          // Pick the cheapest
          const cheapest = researchableTech.sort((a, b) => a.cost - b.cost)[0];
          try {
            await ctx.runMutation(api.tech.researchTech, { playerId, techId: cheapest.techId });
            console.log(`[AI] ${player.aiName} researched ${cheapest.name}`);
          } catch {
            // Research failed
          }
        }
      }

    } catch (error) {
      console.error(`[AI] Error during AI turn:`, error);
    }

    // ─────────────────────────────────────────────────────────────────────
    // End turn
    // ─────────────────────────────────────────────────────────────────────
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await ctx.runMutation(api.economy.endTurn, { gameId, playerId });
      console.log(`[AI] ${player.aiName} ended turn`);
    } catch (error) {
      console.error(`[AI] Failed to end turn:`, error);
    }
  },
});

/**
 * Schedule an AI turn to run (used internally)
 */
export const scheduleAITurn = internalMutation({
  args: {
    gameId: v.id("games"),
    playerId: v.id("players"),
  },
  handler: async (ctx, { gameId, playerId }) => {
    await ctx.scheduler.runAfter(100, internal.ai.actions.runAITurn, { gameId, playerId });
  },
});
