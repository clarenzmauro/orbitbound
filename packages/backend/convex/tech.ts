import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { TECH_DEFS, FACTION_DEFS } from "./lib/constants";
import type { FactionId } from "./lib/constants";
import { assertPlayerTurn, getGameOrThrow, getPlayerOrThrow } from "./lib/gameHelpers";
import { subtractCost } from "./lib/resources";

/**
 * Tech Tree System per Phase 5 of plan:
 * - Tier 0 (Start): Planetary Survival (free)
 * - Tier 1 (25 Flux): Logistics, Militarization
 * - Tier 2 (50 Flux): Deep Core, Ballistics
 * - Tier 3 (100 Flux): Flight, Orbital Mechanics
 * - Tier 4 (200 Flux): The Ark Project (Victory)
 */

export const researchTech = mutation({
  args: {
    playerId: v.id("players"),
    techId: v.string(),
  },
  handler: async (ctx, args) => {
    const player = await getPlayerOrThrow(ctx, args.playerId);
    const game = await getGameOrThrow(ctx, player.gameId);
    assertPlayerTurn(game, player._id);

    const techDef = TECH_DEFS[args.techId];
    if (!techDef) {
      throw new Error("Unknown technology");
    }

    // Check if already researched
    if (player.techUnlocked.includes(args.techId)) {
      throw new Error("Technology already researched");
    }

    // Check prerequisites
    for (const prereq of techDef.prerequisites) {
      if (!player.techUnlocked.includes(prereq)) {
        const prereqDef = TECH_DEFS[prereq];
        throw new Error(`Requires ${prereqDef?.name ?? prereq} first`);
      }
    }

    // Calculate cost (Cyber Synapse gets 10% discount)
    let fluxCost = techDef.cost;
    const faction = player.faction as FactionId;
    if (FACTION_DEFS[faction]?.trait === "networked") {
      fluxCost = Math.floor(fluxCost * 0.9);
    }

    // Check affordability
    const updatedResources = subtractCost(player.resources, { flux: fluxCost });

    // Apply research
    await ctx.db.patch(player._id, {
      resources: updatedResources,
      techUnlocked: [...player.techUnlocked, args.techId],
    });

    return {
      techId: args.techId,
      fluxSpent: fluxCost,
      unlocks: techDef.unlocks,
    };
  },
});

export const getAvailableTech = query({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) {
      throw new Error("Player not found");
    }

    const faction = player.faction as FactionId;
    const hasDiscount = FACTION_DEFS[faction]?.trait === "networked";

    const available: Array<{
      techId: string;
      name: string;
      tier: number;
      cost: number;
      prerequisites: string[];
      unlocks: string[];
      description: string;
      canResearch: boolean;
      alreadyResearched: boolean;
    }> = [];

    for (const [techId, techDef] of Object.entries(TECH_DEFS)) {
      const alreadyResearched = player.techUnlocked.includes(techId);
      const prereqsMet = techDef.prerequisites.every((p) => player.techUnlocked.includes(p));
      let cost = techDef.cost;
      if (hasDiscount) {
        cost = Math.floor(cost * 0.9);
      }

      available.push({
        techId,
        name: techDef.name,
        tier: techDef.tier,
        cost,
        prerequisites: techDef.prerequisites,
        unlocks: techDef.unlocks,
        description: techDef.description,
        canResearch: !alreadyResearched && prereqsMet && player.resources.flux >= cost,
        alreadyResearched,
      });
    }

    return available.sort((a, b) => a.tier - b.tier);
  },
});

export const canUnlock = query({
  args: {
    playerId: v.id("players"),
    itemId: v.string(), // Unit or building type
  },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) {
      return false;
    }

    // Find which tech unlocks this item
    for (const techDef of Object.values(TECH_DEFS)) {
      if (techDef.unlocks.includes(args.itemId)) {
        // Check if player has this tech
        const techId = Object.entries(TECH_DEFS).find(([, def]) => def === techDef)?.[0];
        if (techId && player.techUnlocked.includes(techId)) {
          return true;
        }
        return false;
      }
    }

    // Item not gated by any tech (e.g., basic units)
    return true;
  },
});

