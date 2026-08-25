const COINFLIP_GAME_MODES = Object.freeze(['mm2', 'adm', 'ps99'])

export function normalizeCoinflipGameMode(value, fallback = null) {
  const mode = String(value || '').trim().toLowerCase()
  return COINFLIP_GAME_MODES.includes(mode) ? mode : fallback
}

function getInventoryItemGame(item, fallback = null) {
  const type = String(item?.type || item?.game || item?.item_type || item?.game_mode || '').trim().toLowerCase()
  if (type.includes('murder') || type.includes('mm2')) return 'mm2'
  if (type.includes('adopt') || type === 'adm') return 'adm'
  if (type.includes('pet sim') || type.includes('ps99')) return 'ps99'
  return fallback
}

export function getCoinflipRoomGame(room, fallback = 'ps99') {
  const explicitMode = normalizeCoinflipGameMode(room?.game_mode)
  if (explicitMode) return explicitMode

  const items = [
    ...(Array.isArray(room?.creator_items) ? room.creator_items : []),
    ...(Array.isArray(room?.opponent_items) ? room.opponent_items : []),
  ]
  for (const item of items) {
    const itemGame = getInventoryItemGame(item)
    if (itemGame) return itemGame
  }

  return fallback
}

export function inventoryItemMatchesGame(item, gameMode) {
  const normalizedMode = normalizeCoinflipGameMode(gameMode)
  return !normalizedMode || getInventoryItemGame(item) === normalizedMode
}
