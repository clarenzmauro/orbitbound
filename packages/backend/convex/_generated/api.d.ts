/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai_actions from "../ai/actions.js";
import type * as ai_constants from "../ai/constants.js";
import type * as ai_helpers from "../ai/helpers.js";
import type * as ai_queries from "../ai/queries.js";
import type * as buildings from "../buildings.js";
import type * as combat from "../combat.js";
import type * as economy from "../economy.js";
import type * as game from "../game.js";
import type * as healthCheck from "../healthCheck.js";
import type * as lib_constants from "../lib/constants.js";
import type * as lib_gameHelpers from "../lib/gameHelpers.js";
import type * as lib_grid from "../lib/grid.js";
import type * as lib_resources from "../lib/resources.js";
import type * as lib_vision from "../lib/vision.js";
import type * as players from "../players.js";
import type * as privateData from "../privateData.js";
import type * as tech from "../tech.js";
import type * as units from "../units.js";
import type * as world from "../world.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "ai/actions": typeof ai_actions;
  "ai/constants": typeof ai_constants;
  "ai/helpers": typeof ai_helpers;
  "ai/queries": typeof ai_queries;
  buildings: typeof buildings;
  combat: typeof combat;
  economy: typeof economy;
  game: typeof game;
  healthCheck: typeof healthCheck;
  "lib/constants": typeof lib_constants;
  "lib/gameHelpers": typeof lib_gameHelpers;
  "lib/grid": typeof lib_grid;
  "lib/resources": typeof lib_resources;
  "lib/vision": typeof lib_vision;
  players: typeof players;
  privateData: typeof privateData;
  tech: typeof tech;
  units: typeof units;
  world: typeof world;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
