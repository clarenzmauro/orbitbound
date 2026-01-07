/**
 * AI Constants and Configuration
 */

// Names pool for AI players
export const AI_NAMES = [
  "NEXUS-7",
  "CORTEX",
  "AXIOM",
  "PULSE",
  "CIPHER",
  "VECTOR",
  "PRISM",
  "ZENITH",
  "ECHO",
  "NOVA",
];

// Delay before AI starts taking actions (milliseconds)
export const AI_TURN_DELAY_MS = 1500;

// Decision weights by difficulty level
// Higher randomness = more mistakes, lower = optimal play
export const AI_WEIGHTS = {
  easy: {
    expansion: 0.3,
    economy: 0.4,
    military: 0.2,
    tech: 0.1,
    randomness: 0.5,
  },
  medium: {
    expansion: 0.25,
    economy: 0.35,
    military: 0.3,
    tech: 0.1,
    randomness: 0.2,
  },
  hard: {
    expansion: 0.2,
    economy: 0.25,
    military: 0.4,
    tech: 0.15,
    randomness: 0.05,
  },
} as const;
