export const MAX_LEVEL = 200
const LEVEL_XP_GROWTH_RATE = 1.04
const LEVEL_ONE_XP_REQUIREMENT = 100000

export function getXpThresholdForLevel(level) {
  const safeLevel = Math.max(1, Math.min(MAX_LEVEL - 1, Math.floor(Number(level) || 1)))
  return Math.round(LEVEL_ONE_XP_REQUIREMENT * (LEVEL_XP_GROWTH_RATE ** (safeLevel - 1)))
}
