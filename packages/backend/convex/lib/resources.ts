import { RESOURCE_KEYS } from "./constants";
import type { ResourceKey } from "./constants";

export type ResourcePool = Record<ResourceKey, number>;

export const cloneResources = (resources: ResourcePool): ResourcePool => {
  const next: ResourcePool = {
    biomass: resources.biomass,
    ore: resources.ore,
    flux: resources.flux,
  };
  return next;
};

export const addResources = (base: ResourcePool, delta: Partial<ResourcePool>) => {
  const next = cloneResources(base);
  for (const key of RESOURCE_KEYS) {
    if (delta[key] !== undefined) {
      next[key] += delta[key]!;
    }
  }
  return next;
};

export const canAfford = (resources: ResourcePool, cost: Partial<ResourcePool>) => {
  for (const key of RESOURCE_KEYS) {
    const value = cost[key] ?? 0;
    if (resources[key] < value) {
      return false;
    }
  }
  return true;
};

export const subtractCost = (resources: ResourcePool, cost: Partial<ResourcePool>) => {
  if (!canAfford(resources, cost)) {
    throw new Error("Insufficient resources");
  }
  const next = cloneResources(resources);
  for (const key of RESOURCE_KEYS) {
    const value = cost[key] ?? 0;
    next[key] -= value;
  }
  return next;
};

