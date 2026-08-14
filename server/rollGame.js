import crypto from 'crypto'

const REEL_ITEM_COUNT = 60
const RESULT_INDEX_MIN = 0
const RESULT_INDEX_MAX = REEL_ITEM_COUNT - 1
const COUNTDOWN_MS = 13_000
const ROLL_DURATION_MS = 5_000
const RESULT_HOLD_MS = 3_000
const MIN_ROLL_WAGER = 5_000
const MAX_ROLL_WAGER = 10_000_000
const MIN_ROLL_MULTIPLIER = 1.01
const MAX_ROLL_MULTIPLIER = 100
const ROLL_RETURN = 0.95
const ITEM_CATALOG_CACHE_MS = 10 * 60 * 1000
const MAX_ROLL_ITEM_VALUE = 2_000_000_000
const ITEM_GROUP_TARGETS = Object.freeze({ huge: 57, titanic: 2, gargantuan: 1 })

function normalizedRollItemValue(item) {
  const value = Number(item?.value)
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

function isEligibleRollItem(item) {
  const value = normalizedRollItemValue(item)
  return Boolean(
    item?.id
    && item?.name
    && item?.image_url
    && value > 0
    && value < MAX_ROLL_ITEM_VALUE,
  )
}

function itemGroup(item) {
  const name = String(item?.name || '')
  if (/\bgargantuan\b/i.test(name)) return 'gargantuan'
  if (/\btitanic\b/i.test(name)) return 'titanic'
  if (/\bhuge\b/i.test(name)) return 'huge'
  return 'other'
}

function itemValueTier(item) {
  const value = Number(item?.value || 0)
  if (value >= 50_000_000) return 'gold'
  if (value >= 10_000_000) return 'red'
  if (value >= 750_000) return 'pink'
  return 'blue'
}

function selectAcrossValues(items, count) {
  const sorted = [...items].sort((a, b) => Number(a.value || 0) - Number(b.value || 0))
  if (sorted.length <= count) return sorted

  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index * sorted.length) / count)
    const end = Math.max(start + 1, Math.floor(((index + 1) * sorted.length) / count))
    return sorted[crypto.randomInt(start, Math.min(end, sorted.length))]
  })
}

function shuffle(items) {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1)
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled
}

function buildReelItems(catalog) {
  const eligible = catalog.filter(isEligibleRollItem)
  const grouped = { huge: [], titanic: [], gargantuan: [], other: [] }
  eligible.forEach((item) => grouped[itemGroup(item)].push(item))

  const selected = []
  const selectedIds = new Set()
  for (const [group, target] of Object.entries(ITEM_GROUP_TARGETS)) {
    const candidates = selectAcrossValues(grouped[group], Math.min(target, grouped[group].length))
    for (const item of candidates) {
      if (selectedIds.has(item.id)) continue
      selectedIds.add(item.id)
      selected.push(item)
    }
  }

  if (selected.length < REEL_ITEM_COUNT) {
    const hugeFill = grouped.huge.filter((item) => !selectedIds.has(item.id))
    for (const item of selectAcrossValues(hugeFill, REEL_ITEM_COUNT - selected.length)) {
      selectedIds.add(item.id)
      selected.push(item)
    }
  }

  if (selected.length !== REEL_ITEM_COUNT) {
    throw new Error('The item catalogue cannot produce a complete 57 Huge, 2 Titanic, 1 Gargantuan Roll reel.')
  }

  return shuffle(selected).map((item) => ({
    id: item.id,
    name: item.name,
    value: normalizedRollItemValue(item),
    image_url: item.image_url,
    type: item.type || null,
  }))
}

function rotateReelItems(previousItems, catalog) {
  if (
    !Array.isArray(previousItems)
    || previousItems.length !== REEL_ITEM_COUNT
    || previousItems.some((item) => !isEligibleRollItem(item))
  ) {
    return buildReelItems(catalog)
  }

  const nextItems = previousItems.map((item) => ({ ...item, value: normalizedRollItemValue(item) }))
  const previousIds = new Set(nextItems.map((item) => String(item.id)))
  const selectedIds = new Set(nextItems.map((item) => String(item.id)))
  const indices = shuffle(Array.from({ length: REEL_ITEM_COUNT }, (_, index) => index))
  const replacementCount = crypto.randomInt(5, 8)

  for (const index of indices.slice(0, replacementCount)) {
    const currentItem = nextItems[index]
    const sameGroupAndTier = catalog.filter((candidate) =>
      itemGroup(candidate) === itemGroup(currentItem) &&
      itemValueTier(candidate) === itemValueTier(currentItem) &&
      isEligibleRollItem(candidate) &&
      !previousIds.has(String(candidate.id)) &&
      !selectedIds.has(String(candidate.id)),
    )
    const sameGroup = catalog.filter((candidate) =>
      itemGroup(candidate) === itemGroup(currentItem) &&
      isEligibleRollItem(candidate) &&
      !previousIds.has(String(candidate.id)) &&
      !selectedIds.has(String(candidate.id)),
    )
    const candidates = sameGroupAndTier.length > 0 ? sameGroupAndTier : sameGroup
    if (candidates.length === 0) continue

    const replacement = candidates[crypto.randomInt(candidates.length)]
    selectedIds.delete(String(currentItem.id))
    selectedIds.add(String(replacement.id))
    nextItems[index] = {
      id: replacement.id,
      name: replacement.name,
      value: normalizedRollItemValue(replacement),
      image_url: replacement.image_url,
      type: replacement.type || null,
    }
  }

  return nextItems
}

function rollMultiplier(serverSeed, clientSeed, nonce, index) {
  const digest = crypto
    .createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}:${index}`)
    .digest()
  const random52Bits = digest.readUIntBE(0, 6) * 16 + (digest[6] >> 4)
  const unit = random52Bits / 0x10000000000000
  const multiplier = Math.floor((ROLL_RETURN / Math.max(1 - unit, Number.EPSILON)) * 100) / 100
  return Math.max(1, Math.min(100, multiplier))
}

function generateMultipliers(serverSeed, clientSeed, nonce) {
  return Array.from(
    { length: REEL_ITEM_COUNT },
    (_, index) => rollMultiplier(serverSeed, clientSeed, nonce, index),
  )
}

function alignMultipliersToItemValues(items, generatedMultipliers) {
  const itemIndicesByValue = items
    .map((item, index) => ({ index, value: Number(item?.value || 0), id: String(item?.id || '') }))
    .sort((a, b) => a.value - b.value || a.id.localeCompare(b.id))
  const multipliersByValue = [...generatedMultipliers].sort((a, b) => a - b)
  const aligned = Array(generatedMultipliers.length)
  itemIndicesByValue.forEach((item, rank) => {
    aligned[item.index] = multipliersByValue[rank]
  })
  return aligned
}

function generateResultIndex(serverSeed, clientSeed, nonce) {
  const resultRange = RESULT_INDEX_MAX - RESULT_INDEX_MIN + 1
  const unbiasedLimit = Math.floor(0x100000000 / resultRange) * resultRange

  for (let attempt = 0; ; attempt += 1) {
    const digest = crypto
      .createHmac('sha256', serverSeed)
      .update(`${clientSeed}:${nonce}:result-index:${attempt}`)
      .digest()
    const candidate = digest.readUInt32BE(0)
    if (candidate < unbiasedLimit) {
      return RESULT_INDEX_MIN + (candidate % resultRange)
    }
  }
}

function normalizeBet(row, headshotUrl = null) {
  const resolvedAvatarUrl = headshotUrl || row.avatar_headshot_url || row.avatar_url_snapshot || null
  return {
    id: row.id,
    round_id: row.round_id,
    profile_id: String(row.profile_id),
    username: row.username_snapshot || 'Unknown',
    avatar_url: resolvedAvatarUrl,
    avatar_headshot_url: resolvedAvatarUrl,
    bet_amount: Number(row.wager_amount || 0),
    amount: Number(row.wager_amount || 0),
    chosen_multiplier: Number(row.target_multiplier || 0),
    multiplier: Number(row.target_multiplier || 0),
    potential_win: Number(row.potential_payout || 0),
    actual_win: Number(row.payout_amount || 0),
    won: row.outcome === 'won',
    outcome: row.outcome || 'pending',
    created_at: row.placed_at,
  }
}

export function registerRollGame({
  app,
  io,
  requireAuthenticatedUser,
  jsonParser,
  adminRest,
  getSupabaseAdminConfig,
  emitProfileUpdates,
}) {
  const state = {
    currentRound: null,
    bets: [],
    history: [],
    lifecyclePromise: null,
    createRoundPromise: null,
    countdownTimer: null,
    settlementTimer: null,
    nextRoundTimer: null,
    catalog: [],
    catalogExpiresAt: 0,
    previousReelItems: [],
    initialized: false,
  }

  function clearTimers() {
    if (state.countdownTimer) clearTimeout(state.countdownTimer)
    if (state.settlementTimer) clearTimeout(state.settlementTimer)
    if (state.nextRoundTimer) clearTimeout(state.nextRoundTimer)
    state.countdownTimer = null
    state.settlementTimer = null
    state.nextRoundTimer = null
  }

  function deriveSeedKey(secret) {
    return crypto.createHash('sha256').update(`roll:${secret}`).digest()
  }

  function seedSecrets() {
    const { supabaseKey } = getSupabaseAdminConfig()
    return [
      process.env.JWT_SECRET,
      process.env.ROLL_SEED_SECRET,
      process.env.COINFLIP_SEED_SECRET,
      supabaseKey,
    ]
      .map((secret) => String(secret || ''))
      .filter((secret, index, secrets) => secret && secrets.indexOf(secret) === index)
  }

  function seedKey() {
    const secret = String(process.env.JWT_SECRET || '').trim()
    if (!secret) throw new Error('JWT_SECRET is required for Roll fairness.')
    return deriveSeedKey(secret)
  }

  function encryptSeed(seed) {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', seedKey(), iv)
    const encrypted = Buffer.concat([cipher.update(seed, 'utf8'), cipher.final()])
    return `${iv.toString('hex')}.${cipher.getAuthTag().toString('hex')}.${encrypted.toString('hex')}`
  }

  function decryptSeed(encryptedSeed) {
    const [ivHex, tagHex, encryptedHex] = String(encryptedSeed || '').split('.')
    if (!ivHex || !tagHex || !encryptedHex) throw new Error('Invalid encrypted Roll server seed.')
    const secrets = seedSecrets()
    if (secrets.length === 0) throw new Error('JWT_SECRET is required for Roll fairness.')

    for (const secret of secrets) {
      try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', deriveSeedKey(secret), Buffer.from(ivHex, 'hex'))
        decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
        return Buffer.concat([
          decipher.update(Buffer.from(encryptedHex, 'hex')),
          decipher.final(),
        ]).toString('utf8')
      } catch {
        // Existing active rounds may have been encrypted before ROLL_SEED_SECRET
        // was configured. Try the historical fallback keys without exposing them.
      }
    }

    throw new Error(
      'Unable to decrypt the active Roll round. Keep the previous game secrets configured until that round settles.',
    )
  }

  async function callRpc(functionName, payload) {
    const { supabaseUrl, supabaseKey } = getSupabaseAdminConfig()
    if (!supabaseUrl || !supabaseKey) throw new Error('Supabase admin configuration is missing.')
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        ...(!String(supabaseKey).startsWith('sb_secret_') ? { Authorization: `Bearer ${supabaseKey}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    })
    const text = await response.text()
    let result = null
    try {
      result = text ? JSON.parse(text) : null
    } catch {
      result = null
    }
    if (!response.ok) {
      const error = new Error(result?.message || result?.error || text || `Roll database operation failed (${response.status}).`)
      error.status = response.status
      throw error
    }
    return result
  }

  async function loadCatalog() {
    if (state.catalogExpiresAt > Date.now() && state.catalog.length > 0) return state.catalog
    const catalog = []
    const pageSize = 1000
    for (let offset = 0; ; offset += pageSize) {
      const page = await adminRest(
        `items?select=id,name,value,image_url,type&value=gt.0&value=lt.${MAX_ROLL_ITEM_VALUE}&image_url=not.is.null&order=value.asc,id.asc&limit=${pageSize}&offset=${offset}`,
      )
      const rows = Array.isArray(page) ? page : []
      catalog.push(...rows.filter(isEligibleRollItem))
      if (rows.length < pageSize) break
    }
    state.catalog = catalog
    state.catalogExpiresAt = Date.now() + ITEM_CATALOG_CACHE_MS
    return catalog
  }

  async function loadBets(roundId) {
    const rows = await adminRest(
      `roll_bets?select=*&round_id=eq.${encodeURIComponent(roundId)}&order=placed_at.asc`,
    )
    const bets = Array.isArray(rows) ? rows : []
    const profileIds = [...new Set(bets.map((row) => String(row.profile_id || '')).filter(Boolean))]
    const profiles = await Promise.all(profileIds.map(async (profileId) => {
      const result = await adminRest(
        `user_profiles?select=id,avatar_headshot_url,avatar_url&id=eq.${encodeURIComponent(profileId)}&limit=1`,
      )
      const profile = Array.isArray(result) ? result[0] : result
      return [profileId, profile?.avatar_headshot_url || profile?.avatar_url || null]
    }))
    const headshotsByProfileId = new Map(profiles)
    return bets.map((row) => normalizeBet(row, headshotsByProfileId.get(String(row.profile_id))))
  }

  async function loadHistory() {
    const rows = await adminRest(
      'roll_rounds?select=id,result_multiplier,settled_at,reel_items&status=eq.settled&result_multiplier=not.is.null&order=settled_at.desc&limit=10',
    )
    const latestReel = Array.isArray(rows) ? rows[0]?.reel_items : null
    if (
      Array.isArray(latestReel)
      && latestReel.length === REEL_ITEM_COUNT
      && latestReel.every(isEligibleRollItem)
    ) {
      state.previousReelItems = latestReel
    }
    state.history = (Array.isArray(rows) ? rows : []).map((row) => ({
      id: row.id,
      result: Number(row.result_multiplier),
      settled_at: row.settled_at,
    }))
  }

  function timeRemaining(round = state.currentRound) {
    if (!round) return 0
    if (round.status === 'countdown') {
      return Math.max(0, new Date(round.bettingClosesAt).getTime() - Date.now())
    }
    if (round.status === 'rolling') {
      return Math.max(0, new Date(round.rollingStartedAt).getTime() + ROLL_DURATION_MS - Date.now())
    }
    return 0
  }

  function publicRound(round = state.currentRound) {
    if (!round) return null
    const resultVisible = round.status !== 'countdown'
    return {
      id: round.id,
      game_state: round.status === 'settled' ? 'ended' : round.status,
      status: round.status,
      created_at: round.createdAt,
      betting_closes_at: round.bettingClosesAt,
      started_at: round.rollingStartedAt,
      ended_at: round.settledAt,
      result_multiplier: resultVisible ? round.resultMultiplier : 0,
      result_index: resultVisible ? round.resultIndex : null,
      server_seed_hash: round.serverSeedHash,
      revealed_server_seed: round.status === 'settled' ? round.serverSeed : null,
      client_seed: round.clientSeed,
      nonce: round.nonce,
      time_remaining: timeRemaining(round),
    }
  }

  function statePayload() {
    const round = state.currentRound
    return {
      round: publicRound(round),
      bets: state.bets,
      items: round?.items || [],
      multipliers: round?.multipliers || [],
      history: state.history,
      last_result: state.history[0]?.result ?? null,
    }
  }

  async function loadActiveRound() {
    const rows = await adminRest(
      'roll_rounds?select=*&status=in.(countdown,rolling)&order=created_at.desc&limit=1',
    )
    return Array.isArray(rows) ? rows[0] || null : rows || null
  }

  async function createRound() {
    if (state.createRoundPromise) return state.createRoundPromise

    const operation = createRoundInternal()
    state.createRoundPromise = operation
    try {
      return await operation
    } finally {
      if (state.createRoundPromise === operation) state.createRoundPromise = null
    }
  }

  async function createRoundInternal() {
    clearTimers()
    const catalog = await loadCatalog()
    const previousItems = state.currentRound?.items?.length === REEL_ITEM_COUNT
      ? state.currentRound.items
      : state.previousReelItems
    const items = rotateReelItems(previousItems, catalog)
    const serverSeed = crypto.randomBytes(32).toString('hex')
    const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex')
    const clientSeed = crypto.randomBytes(16).toString('hex')
    const nonce = Date.now()
    const generatedMultipliers = generateMultipliers(serverSeed, clientSeed, nonce)
    const multipliers = alignMultipliersToItemValues(items, generatedMultipliers)
    const resultIndex = generateResultIndex(serverSeed, clientSeed, nonce)
    const now = new Date()
    const closesAt = new Date(now.getTime() + COUNTDOWN_MS)
    const roundId = crypto.randomUUID()

    let inserted
    try {
      inserted = await adminRest('roll_rounds', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: {
          id: roundId,
          server_seed_encrypted: encryptSeed(serverSeed),
          server_seed_hash: serverSeedHash,
          client_seed: clientSeed,
          nonce,
          result_multiplier: null,
          reel_items: items,
          reel_multipliers: multipliers,
          result_index: resultIndex,
          status: 'countdown',
          betting_opened_at: now.toISOString(),
          betting_closes_at: closesAt.toISOString(),
          created_at: now.toISOString(),
        },
      })
    } catch (error) {
      const activeRoundConflict = error?.code === '23505'
        && /roll_rounds_one_active_uidx/i.test(String(error?.message || ''))
      if (!activeRoundConflict) throw error

      const activeRound = await loadActiveRound()
      if (!activeRound) throw error
      await hydrateRound(activeRound)
      io.emit('roll:state', statePayload())
      return state.currentRound
    }
    const row = Array.isArray(inserted) ? inserted[0] : inserted
    if (!row?.id) throw new Error('Supabase did not create the Roll round.')

    state.currentRound = {
      id: row.id,
      status: 'countdown',
      serverSeed,
      serverSeedHash,
      clientSeed,
      nonce,
      multipliers,
      resultIndex,
      resultMultiplier: multipliers[resultIndex],
      items,
      createdAt: row.created_at || now.toISOString(),
      bettingClosesAt: row.betting_closes_at || closesAt.toISOString(),
      rollingStartedAt: null,
      settledAt: null,
    }
    state.previousReelItems = items
    state.bets = []
    scheduleCountdown()
    io.emit('roll:new_round', statePayload())
    return state.currentRound
  }

  function scheduleCountdown() {
    if (state.countdownTimer) clearTimeout(state.countdownTimer)
    const delay = timeRemaining()
    state.countdownTimer = setTimeout(() => void startRolling().catch(logLifecycleError), delay)
  }

  function scheduleSettlement() {
    if (state.settlementTimer) clearTimeout(state.settlementTimer)
    const delay = timeRemaining()
    state.settlementTimer = setTimeout(() => void settleRound().catch(logLifecycleError), delay)
  }

  function logLifecycleError(error) {
    console.error('[roll] lifecycle error', error)
    state.lifecyclePromise = null
    if (state.nextRoundTimer) clearTimeout(state.nextRoundTimer)
    state.nextRoundTimer = setTimeout(() => {
      const retry = !state.currentRound || state.currentRound.status === 'settled'
        ? createRound()
        : state.currentRound.status === 'countdown'
          ? startRolling()
          : settleRound()
      void retry.catch(logLifecycleError)
    }, 2_000)
  }

  async function startRolling() {
    const round = state.currentRound
    if (!round || round.status !== 'countdown') return
    const startedAt = new Date()
    const rows = await adminRest(
      `roll_rounds?id=eq.${encodeURIComponent(round.id)}&status=eq.countdown`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: { status: 'rolling', rolling_started_at: startedAt.toISOString() },
      },
    )
    const updated = Array.isArray(rows) ? rows[0] : rows
    if (!updated?.id) {
      const currentRows = await adminRest(
        `roll_rounds?id=eq.${encodeURIComponent(round.id)}&select=*&limit=1`,
      )
      const current = Array.isArray(currentRows) ? currentRows[0] : currentRows
      if (current?.id && current.status !== round.status) {
        await hydrateRound(current)
        io.emit('roll:state', statePayload())
      }
      return
    }
    round.status = 'rolling'
    round.rollingStartedAt = updated.rolling_started_at || startedAt.toISOString()
    io.emit('roll:rolling', {
      round: publicRound(round),
      multipliers: round.multipliers,
      items: round.items,
      roll_duration_ms: timeRemaining(round),
    })
    scheduleSettlement()
  }

  async function settleRound() {
    const round = state.currentRound
    if (!round || round.status !== 'rolling') return
    const winningItem = round.items[round.resultIndex]
    // Older active rounds may contain a now-blacklisted catalogue item. The
    // multiplier and winner remain committed and settle normally, but omit the
    // invalid display metadata so the round cannot remain stuck on that item.
    const winningItemEligible = isEligibleRollItem(winningItem)
    const result = await callRpc('settle_roll_round', {
      p_round_id: round.id,
      p_result_multiplier: round.resultMultiplier,
      p_result_index: round.resultIndex,
      p_winning_item_id: winningItemEligible ? winningItem.id : null,
      p_winning_item_name: winningItemEligible ? winningItem.name : null,
      p_winning_item_value: winningItemEligible ? normalizedRollItemValue(winningItem) : null,
      p_revealed_server_seed: round.serverSeed,
    })

    round.status = 'settled'
    round.settledAt = new Date().toISOString()
    const settlements = Array.isArray(result?.settlements) ? result.settlements : []
    const settlementByBetId = new Map(settlements.map((entry) => [String(entry.id), entry]))
    state.bets = state.bets.map((bet) => {
      const settlement = settlementByBetId.get(String(bet.id))
      if (!settlement) return bet
      const updatedBet = {
        ...bet,
        outcome: settlement.outcome,
        won: settlement.outcome === 'won',
        actual_win: Number(settlement.payout_amount || 0),
      }
      io.emit('roll:bet_result', { bet: updatedBet, result: round.resultMultiplier })
      io.emit('wallet:updated', {
        profileId: String(settlement.profile_id),
        balance: Number(settlement.balance || 0),
      })
      return updatedBet
    })

    state.history = [
      { id: round.id, result: round.resultMultiplier, settled_at: round.settledAt },
      ...state.history.filter((entry) => entry.id !== round.id),
    ].slice(0, 10)
    io.emit('roll:ended', {
      round: publicRound(round),
      result: round.resultMultiplier,
      history: state.history,
    })
    void emitProfileUpdates(settlements.map((entry) => String(entry.profile_id)))
    state.nextRoundTimer = setTimeout(() => void createRound().catch(logLifecycleError), RESULT_HOLD_MS)
  }

  async function hydrateRound(row) {
    clearTimers()
    const serverSeed = decryptSeed(row.server_seed_encrypted)
    const multipliers = Array.isArray(row.reel_multipliers) ? row.reel_multipliers.map(Number) : []
    const items = Array.isArray(row.reel_items) ? row.reel_items : []
    if (multipliers.length !== REEL_ITEM_COUNT || items.length !== REEL_ITEM_COUNT) {
      throw new Error(`Persisted Roll round ${row.id} has an invalid reel.`)
    }
    const storedResultIndex = row.result_index === null || row.result_index === undefined
      ? 40
      : Number(row.result_index)
    const resultIndex = Number.isInteger(storedResultIndex) && storedResultIndex >= 0 && storedResultIndex < REEL_ITEM_COUNT
      ? storedResultIndex
      : 40
    state.currentRound = {
      id: row.id,
      status: row.status,
      serverSeed,
      serverSeedHash: row.server_seed_hash,
      clientSeed: row.client_seed,
      nonce: Number(row.nonce),
      multipliers,
      resultIndex,
      resultMultiplier: multipliers[resultIndex],
      items,
      createdAt: row.created_at,
      bettingClosesAt: row.betting_closes_at,
      rollingStartedAt: row.rolling_started_at,
      settledAt: row.settled_at,
    }
    state.previousReelItems = items
    state.bets = await loadBets(row.id)

    if (row.status === 'countdown') {
      if (timeRemaining() <= 0) await startRolling()
      else scheduleCountdown()
    } else if (row.status === 'rolling') {
      if (timeRemaining() <= 0) await settleRound()
      else scheduleSettlement()
    } else if (row.status === 'settled') {
      const settledAt = new Date(row.settled_at || Date.now()).getTime()
      const delay = Math.max(0, settledAt + RESULT_HOLD_MS - Date.now())
      state.nextRoundTimer = setTimeout(() => void createRound().catch(logLifecycleError), delay)
    }
  }

  async function initialize() {
    if (state.lifecyclePromise) return state.lifecyclePromise
    state.lifecyclePromise = (async () => {
      await loadHistory()
      const activeRound = await loadActiveRound()
      if (activeRound) await hydrateRound(activeRound)
      else await createRound()
      state.initialized = true
      return state.currentRound
    })().finally(() => {
      state.lifecyclePromise = null
    })
    return state.lifecyclePromise
  }

  async function ensureRound() {
    if (state.currentRound) return state.currentRound
    return initialize()
  }

  app.get('/api/roll/state', async (_req, res) => {
    await ensureRound()
    res.json({ ok: true, ...statePayload() })
  })

  app.post('/api/roll/bet', jsonParser, requireAuthenticatedUser, async (req, res) => {
    const requestReceivedAt = new Date()
    const roundId = String(req.body?.round_id || '')
    const wagerAmount = Math.floor(Number(req.body?.bet_amount || 0))
    const targetMultiplier = Number(req.body?.chosen_multiplier || 0)
    await ensureRound()

    if (!Number.isSafeInteger(wagerAmount) || wagerAmount < MIN_ROLL_WAGER || wagerAmount > MAX_ROLL_WAGER) {
      res.status(400).json({ ok: false, error: 'Play amount must be between 5,000 and 10,000,000 coins.' })
      return
    }
    if (
      !Number.isFinite(targetMultiplier)
      || targetMultiplier < MIN_ROLL_MULTIPLIER
      || targetMultiplier > MAX_ROLL_MULTIPLIER
    ) {
      res.status(400).json({ ok: false, error: 'Multiplier must be between 1.01x and 100x.' })
      return
    }

    if (!state.currentRound || roundId !== state.currentRound.id) {
      res.status(409).json({ ok: false, error: 'That Roll round has ended. Please play the current round.' })
      return
    }
    if (state.currentRound.status !== 'countdown' || timeRemaining(state.currentRound) <= 0) {
      res.status(409).json({ ok: false, error: 'Betting has closed for this Roll round.' })
      return
    }

    try {
      const betPayload = {
        p_profile_id: String(req.identity.profileId),
        p_round_id: roundId,
        p_wager_amount: wagerAmount,
        p_target_multiplier: targetMultiplier,
      }
      let result
      try {
        result = await callRpc('place_roll_bet', {
          ...betPayload,
          p_request_received_at: requestReceivedAt.toISOString(),
        })
      } catch (error) {
        const missingUpdatedSignature = /place_roll_bet|schema cache|p_request_received_at|PGRST202/i.test(
          String(error?.message || ''),
        )
        if (!missingUpdatedSignature) throw error
        result = await callRpc('place_roll_bet', betPayload)
      }
      const profiles = await adminRest(
        `user_profiles?select=avatar_headshot_url,avatar_url&id=eq.${encodeURIComponent(req.identity.profileId)}&limit=1`,
      )
      const profile = Array.isArray(profiles) ? profiles[0] : profiles
      const bet = normalizeBet(result.bet, profile?.avatar_headshot_url || profile?.avatar_url || null)
      if (!state.bets.some((entry) => entry.id === bet.id)) state.bets.push(bet)
      io.emit('roll:bet', bet)
      io.emit('wallet:updated', {
        profileId: String(req.identity.profileId),
        balance: Number(result.balance),
      })
      void emitProfileUpdates([String(req.identity.profileId)])
      res.json({ ok: true, bet, balance: Number(result.balance) })
    } catch (error) {
      const message = String(error?.message || 'Failed to place Roll play.')
      const expected = /amount|multiplier|balance|profile|already|accepting|closed|round/i.test(message)
      if (!expected) console.error('[api/roll/bet] error', error)
      res.status(expected ? 400 : 500).json({ ok: false, error: message })
    }
  })

  io.on('connection', (socket) => {
    void ensureRound()
      .then(() => socket.emit('roll:state', statePayload()))
      .catch((error) => console.warn('[roll] socket state failed', error))
  })

  return { initialize }
}
