import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { COMBAT, UNIT_DEFS, BUILDING_DEFS, TERRAIN_DEFS } from "./lib/constants";
import { coordToIndex, manhattanDistance, wrapX, clampY } from "./lib/grid";
import { assertPlayerTurn, getGameOrThrow, getPlayerOrThrow } from "./lib/gameHelpers";

/**
 * Combat System per Phase 5 of plan:
 * - Formula: Damage = Attacker.Atk - Defender.Def (min 1)
 * - Counter-Attack: If defender survives, they deal Defender.Atk back
 * - Range: Most units Range 1, Artillery Range 4
 * - Flanking: +2 Atk when attacking from opposite sides
 * - Entrench: Marine gets +2 Def if entrenched (didn't move last turn)
 */

export const attack = mutation({
  args: {
    attackerUnitId: v.id("units"),
    playerId: v.id("players"),
    targetX: v.number(),
    targetY: v.number(),
  },
  handler: async (ctx, args) => {
    const attacker = await ctx.db.get(args.attackerUnitId);
    if (!attacker) {
      throw new Error("Attacker unit not found");
    }
    if (attacker.playerId !== args.playerId) {
      throw new Error("You do not control this unit");
    }

    const game = await getGameOrThrow(ctx, attacker.gameId);
    assertPlayerTurn(game, args.playerId);

    if (attacker.movesLeft <= 0) {
      throw new Error("Unit has no actions left this turn");
    }

    const attackerDef = UNIT_DEFS[attacker.type];
    if (!attackerDef || attackerDef.atk === 0) {
      throw new Error("This unit cannot attack");
    }

    const targetX = wrapX(args.targetX, game.width);
    const targetY = clampY(args.targetY, game.height);

    // Check range
    const distance = manhattanDistance(game.width, attacker.x, attacker.y, targetX, targetY);
    if (distance > attackerDef.range) {
      throw new Error(`Target out of range (max ${attackerDef.range}, distance ${distance})`);
    }
    if (distance === 0) {
      throw new Error("Cannot attack your own tile");
    }

    const targetIdx = coordToIndex(game.width, targetX, targetY);
    const targetTile = game.map[targetIdx];

    // Determine target (unit or building)
    let defenderUnit: Doc<"units"> | null = null;
    let defenderBuilding: Doc<"buildings"> | null = null;

    if (targetTile.unitId) {
      defenderUnit = await ctx.db.get(targetTile.unitId);
      if (defenderUnit && defenderUnit.playerId === args.playerId) {
        throw new Error("Cannot attack your own unit");
      }
    } else if (targetTile.buildingId) {
      defenderBuilding = await ctx.db.get(targetTile.buildingId);
      if (defenderBuilding && defenderBuilding.playerId === args.playerId) {
        throw new Error("Cannot attack your own building");
      }
    }

    if (!defenderUnit && !defenderBuilding) {
      throw new Error("No valid target at that location");
    }

    const result = {
      attackerDamageDealt: 0,
      defenderDamageDealt: 0,
      attackerDied: false,
      defenderDied: false,
    };

    const mapCopy = [...game.map];

    if (defenderUnit) {
      // Unit vs Unit combat
      const defenderDef = UNIT_DEFS[defenderUnit.type];
      const terrainDef = TERRAIN_DEFS[targetTile.type];
      const buildingOnTile = targetTile.buildingId
        ? await ctx.db.get(targetTile.buildingId)
        : null;
      const buildingDef = buildingOnTile ? BUILDING_DEFS[buildingOnTile.type] : null;

      // Calculate defender's effective defense (terrain + building + entrench bonuses)
      let effectiveDef = defenderDef?.def ?? 0;
      if (buildingDef?.defenseBonus) {
        effectiveDef += buildingDef.defenseBonus;
      }
      // Entrench bonus: Marine gets +2 Def if entrenched
      if (defenderUnit.type === "marine" && defenderUnit.entrenched) {
        effectiveDef += COMBAT.ENTRENCH_BONUS;
      }

      // Calculate attacker's effective attack (with flanking bonus)
      let effectiveAtk = attackerDef.atk;
      const isFlanking = await checkFlanking(ctx, game, defenderUnit, args.playerId);
      if (isFlanking) {
        effectiveAtk += COMBAT.FLANKING_BONUS;
      }

      // Calculate damage (attacker -> defender)
      const rawDamage = effectiveAtk - effectiveDef;
      const damage = Math.max(rawDamage, COMBAT.MIN_DAMAGE);
      result.attackerDamageDealt = damage;

      const newDefenderHp = defenderUnit.hp - damage;

      if (newDefenderHp <= 0) {
        // Defender dies
        result.defenderDied = true;
        await ctx.db.delete(defenderUnit._id);
        mapCopy[targetIdx] = {
          ...mapCopy[targetIdx],
          unitId: undefined,
        };
      } else {
        // Defender survives, counter-attack if in range
        await ctx.db.patch(defenderUnit._id, { hp: newDefenderHp });

        const defenderRange = defenderDef?.range ?? 1;
        if (distance <= defenderRange && defenderDef && defenderDef.atk > 0) {
          // Counter-attack
          const counterDamage = Math.max(defenderDef.atk - (attackerDef.def ?? 0), COMBAT.MIN_DAMAGE);
          result.defenderDamageDealt = counterDamage;

          const newAttackerHp = attacker.hp - counterDamage;
          if (newAttackerHp <= 0) {
            // Attacker dies from counter
            result.attackerDied = true;
            await ctx.db.delete(attacker._id);
            const attackerIdx = coordToIndex(game.width, attacker.x, attacker.y);
            mapCopy[attackerIdx] = {
              ...mapCopy[attackerIdx],
              unitId: undefined,
            };
          } else {
            await ctx.db.patch(attacker._id, { hp: newAttackerHp, movesLeft: 0 });
          }
        } else {
          // No counter-attack, just use up attacker's action
          await ctx.db.patch(attacker._id, { movesLeft: 0 });
        }
      }
    } else if (defenderBuilding) {
      // Unit vs Building combat (no counter-attack from buildings)
      const buildingDef = BUILDING_DEFS[defenderBuilding.type];
      const damage = Math.max(attackerDef.atk, COMBAT.MIN_DAMAGE);
      result.attackerDamageDealt = damage;

      const newBuildingHp = defenderBuilding.hp - damage;

      if (newBuildingHp <= 0) {
        // Building destroyed
        result.defenderDied = true;
        await ctx.db.delete(defenderBuilding._id);
        mapCopy[targetIdx] = {
          ...mapCopy[targetIdx],
          buildingId: undefined,
          type: "surface", // Revert to base terrain
        };
      } else {
        await ctx.db.patch(defenderBuilding._id, { hp: newBuildingHp });
      }

      // Use up attacker's action
      if (!result.attackerDied) {
        await ctx.db.patch(attacker._id, { movesLeft: 0 });
      }
    }

    // Update map
    await ctx.db.patch(game._id, { map: mapCopy });

    // Check for player elimination
    await checkPlayerElimination(ctx, game._id);

    return result;
  },
});

/**
 * Check if the attacker is flanking the defender.
 * Flanking occurs when there's a friendly unit on the opposite side of the defender.
 */
async function checkFlanking(
  ctx: MutationCtx,
  game: Doc<"games">,
  defender: Doc<"units">,
  attackerPlayerId: Id<"players">
): Promise<boolean> {
  // Get all friendly units of the attacker
  const friendlyUnits = await ctx.db
    .query("units")
    .withIndex("by_player", (q) => q.eq("playerId", attackerPlayerId))
    .collect();

  // Check for units on opposite sides (horizontal flanking on cylinder)
  const leftX = wrapX(defender.x - 1, game.width);
  const rightX = wrapX(defender.x + 1, game.width);

  const hasUnitOnLeft = friendlyUnits.some((u) => u.x === leftX && u.y === defender.y);
  const hasUnitOnRight = friendlyUnits.some((u) => u.x === rightX && u.y === defender.y);

  // Flanking if friendly units on both sides
  if (hasUnitOnLeft && hasUnitOnRight) {
    return true;
  }

  // Also check vertical flanking
  const upY = clampY(defender.y - 1, game.height);
  const downY = clampY(defender.y + 1, game.height);

  const hasUnitAbove = friendlyUnits.some((u) => u.x === defender.x && u.y === upY);
  const hasUnitBelow = friendlyUnits.some((u) => u.x === defender.x && u.y === downY);

  if (hasUnitAbove && hasUnitBelow) {
    return true;
  }

  return false;
}

/**
 * Check if any player has been eliminated (no units AND no buildings)
 */
async function checkPlayerElimination(ctx: MutationCtx, gameId: Id<"games">) {
  const players = await ctx.db
    .query("players")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .collect();

  for (const player of players) {
    if (!player.isAlive) continue;

    const [units, buildings] = await Promise.all([
      ctx.db
        .query("units")
        .withIndex("by_player", (q) => q.eq("playerId", player._id))
        .first(),
      ctx.db
        .query("buildings")
        .withIndex("by_player", (q) => q.eq("playerId", player._id))
        .first(),
    ]);

    if (!units && !buildings) {
      // Player eliminated
      await ctx.db.patch(player._id, { isAlive: false });
    }
  }
}

