export const MAX_LEVEL = 200
export const LEVEL_XP_GROWTH_RATE = 1.04
export const LEVEL_ONE_XP_REQUIREMENT = 104419726.87628177

export function getXpThresholdForLevel(level) {
  const safeLevel = Math.max(1, Math.min(MAX_LEVEL - 1, Math.floor(Number(level) || 1)))
  return Math.round(LEVEL_ONE_XP_REQUIREMENT * (LEVEL_XP_GROWTH_RATE ** (safeLevel - 1)))
}

export function getLevelProgress(level, xp, maxLevel = MAX_LEVEL) {
  const safeMaxLevel = Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(maxLevel) || MAX_LEVEL)))
  const safeLevel = Math.max(1, Math.min(safeMaxLevel, Math.floor(Number(level) || 1)))
  const safeXp = Math.max(0, Math.floor(Number(xp) || 0))
  const required = getXpThresholdForLevel(safeLevel)

  if (safeLevel >= safeMaxLevel) {
    return { current: required, required, percent: 100, isMaxLevel: true }
  }

  return {
    current: Math.min(safeXp, required),
    required,
    percent: required > 0 ? Math.min(100, (safeXp / required) * 100) : 0,
    isMaxLevel: false,
  }
}
