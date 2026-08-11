import express from 'express'
import cors from 'cors'
import fs from 'fs'
import http from 'http'
import path from 'path'
import crypto from 'crypto'
import { Server } from 'socket.io'
import { Betnex, createCallbackResponse, verifyCallback } from '@betnex/sdk'
import { registerRollGame } from './rollGame.js'

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ''))
}

const app = express()
for (const method of ['get', 'post', 'patch', 'delete']) {
  const registerRoute = app[method].bind(app)
  app[method] = (routePath, ...handlers) => registerRoute(
    routePath,
    ...handlers.map((handler) => (
      handler?.constructor?.name === 'AsyncFunction'
        ? (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
        : handler
    )),
  )
}
const server = http.createServer(app)
const isAllowedOrigin = (origin) => {
  if (!origin) return true
  const configuredOrigins = String(process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  return configuredOrigins.includes(origin) ||
    origin === 'http://bloxdice.com' ||
    origin === 'https://bloxdice.com' ||
    origin === 'https://bloxybattles-main.onrender.com' ||
    origin === 'http://localhost:5173'
}
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
    credentials: true,
  },
  maxHttpBufferSize: 64 * 1024,
})

function loadEnvFile(fileName = '.env', override = false) {
  const envPath = path.resolve(process.cwd(), fileName)
  if (!fs.existsSync(envPath)) return

  const content = fs.readFileSync(envPath, 'utf8')
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const normalizedLine = line.startsWith('export ') ? line.slice(7) : line
    const separatorIndex = normalizedLine.indexOf('=')
    if (separatorIndex === -1) continue

    const key = normalizedLine.slice(0, separatorIndex).trim()
    let value = normalizedLine.slice(separatorIndex + 1).trim()

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    if (override || !process.env[key]) {
      process.env[key] = value
    }
  }
}

loadEnvFile()
loadEnvFile('.env.local', true)

app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false)

const corsOptions = {
  origin(origin, callback) {
    callback(null, isAllowedOrigin(origin))
  },
  credentials: true,
}
app.use(cors(corsOptions))
app.options('*', cors(corsOptions))
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  next()
})

const FEED = [
  {
    id: '1',
    user: 'deanzapper2022',
    game: 'Mines',
    amount: 11111,
    multiplier: 8.59,
    win: 95443,
    avatar: 'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-CD1D1A7071137D011815CEDDB70AC5FA-Png/420/420/AvatarHeadshot/Png/noFilter',
    createdAt: new Date(Date.now() - 10 * 1000).toISOString(),
  },
  {
    id: '2',
    user: 'MexicanTravis_Scott',
    game: 'Upgrader',
    amount: 20000,
    multiplier: 3.0,
    win: 60000,
    avatar: 'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-4A2AEBC1024BCF622CAA069C82B06E7F-Png/420/420/AvatarHeadshot/Png/noFilter',
    createdAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  },
  {
    id: '3',
    user: 'larpsky3',
    game: 'Case Battles',
    amount: 212582,
    multiplier: 4.53,
    win: 962469,
    avatar: 'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-D517857E5CC51E2FF93E63E20241169E-Png/420/420/AvatarHeadshot/Png/noFilter',
    createdAt: new Date(Date.now() - 13 * 60 * 1000).toISOString(),
  },
]

const BETNEX_CATALOG_CACHE_MS = 5 * 60 * 1000
const BETNEX_CURRENCY = 'USD'
const BETNEX_PROVIDERS = [
  { id: 'PRAGMATICLIVE', currencyId: 'PPLIVE', label: 'Pragmatic Play', categories: ['Blackjack', 'Baccarat'] },
  { id: 'EVOLUTIONLIVE', currencyId: 'EVOLIVEROW', label: 'Evolution', categories: ['Blackjack', 'Baccarat'] },
  { id: 'HACKSAW', currencyId: 'HACKSAWLATAM', label: 'Hacksaw Gaming', categories: ['Slots'] },
  { id: 'BGAMING', currencyId: 'BG', label: 'BGaming', categories: ['Slots'] },
  { id: 'PRAGMATICSLOTS', currencyId: 'PP', label: 'Pragmatic Play', categories: ['Slots'] },
]
const BETNEX_FEATURED_GAMES = {
  PRAGMATICLIVE: {
    Blackjack: [
      'ONE Blackjack',
      'Bet Behind Pro Blackjack',
      'ONE Blackjack 2',
      'BlackjackX 1',
      'BlackjackX 2',
    ],
    Baccarat: [
      'Squeeze Baccarat',
      'Mega Baccarat',
      'Baccarat 3',
      'Baccarat 8',
      'Speed Baccarat 11',
      'Privé Lounge Baccarat 1',
      'Privé Lounge Baccarat 2',
    ],
  },
  EVOLUTIONLIVE: {
    Blackjack: [
      'Infinite Blackjack',
      'Lightning Blackjack',
      'Power Blackjack',
      'Blackjack Party',
      'Infinite Free Bet Blackjack',
    ],
    Baccarat: [
      'Baccarat Squeeze',
      'Lightning Baccarat',
      'Super Speed Baccarat',
      'Insurance Baccarat',
      'Always 9 Baccarat',
    ],
  },
  HACKSAW: {
    Slots: [
      'Bash Bros',
      'Donut Division',
      'Eye of Medusa',
      'Fruit Duel',
      'Mighty Masks',
      'Phoenix DuelReels',
      'Rusty & Curly',
      'Superstar Sevens',
      'Tiger Legends',
      'Zeus Ze Zecond',
    ],
  },
  BGAMING: {
    Slots: [
      'Arrow Slot',
      'Clucking Hell',
      'Disco Party',
      'Merge Up 2',
      'Always Up!',
      'Wild Tiger 2',
      'Soccermania',
      'Sugar Merge Up',
      'Wild Clusters',
      'Wild Wick',
    ],
  },
  PRAGMATICSLOTS: {
    Slots: [
      'Bigger Bass Bonanza',
      'Dino Drop',
      'Eye of Spartacus',
      'Fire Hot 100',
      'Fire Hot 20',
      'Fury of Odin Megaways',
      'Ice Mints',
      'Jelly Candy',
      'Olympus Wins',
      'Sweet Rush Bonanza',
    ],
  },
}
const BETNEX_LOCAL_SLOT_IMAGES = {
  BGAMING: {
    'Arrow Slot': '/bgaming/thumb=ArrowSlot_v2 1.png',
    'Clucking Hell': '/bgaming/thumb=CluckingHell_v2 1.png',
    'Disco Party': '/bgaming/thumb=DiscoPart_v2 1.png',
    'Merge Up 2': '/bgaming/thumb=MergeUp2_v2 1.png',
    'Always Up!': '/bgaming/thumb=Pair_005 (AlwaysUp!) 1.png',
    'Wild Tiger 2': '/bgaming/thumb=Pair_041 (WildTiger2) 1.png',
    Soccermania: '/bgaming/thumb=Soccermania_v2 1.png',
    'Sugar Merge Up': '/bgaming/thumb=SugarMergeUp_v2 1.png',
    'Wild Clusters': '/bgaming/thumb=WildClusters_v2 1.png',
    'Wild Wick': '/bgaming/thumb=WildWick_v2 1.png',
  },
  HACKSAW: {
    'Bash Bros': '/hacksaw/thumb=bash-bros 1.png',
    'Donut Division': '/hacksaw/thumb=donut-division 1.png',
    'Eye of Medusa': '/hacksaw/thumb=eye-of-medusa 1.png',
    'Fruit Duel': '/hacksaw/thumb=fruit-duel 1.png',
    'Mighty Masks': '/hacksaw/thumb=mighty-masks 1.png',
    'Phoenix DuelReels': '/hacksaw/thumb=phoenix-duelreels 1.png',
    'Rusty & Curly': '/hacksaw/thumb=rusty-curly 1.png',
    'Superstar Sevens': '/hacksaw/thumb=superstar-sevens 1.png',
    'Tiger Legends': '/hacksaw/thumb=tiger-legends 1.png',
    'Zeus Ze Zecond': '/hacksaw/thumb=zeus-ze-zecond 1.png',
  },
  PRAGMATICSLOTS: {
    'Bigger Bass Bonanza': '/pragmatic/thumb=Bigger Bass Bonanza 1.png',
    'Dino Drop': '/pragmatic/thumb=Dino Drop 1.png',
    'Eye of Spartacus': '/pragmatic/thumb=Eye of Spartacus 1.png',
    'Fire Hot 100': '/pragmatic/thumb=Fire Hot 100 Jackpot Play 1.png',
    'Fire Hot 20': '/pragmatic/thumb=Fire Hot 20 Jackpot Play 1.png',
    'Fury of Odin Megaways': '/pragmatic/thumb=Fury of Odin Megaways 1.png',
    'Ice Mints': '/pragmatic/thumb=Ice Mints 1.png',
    'Jelly Candy': '/pragmatic/thumb=Jelly Candy 1.png',
    'Olympus Wins': '/pragmatic/thumb=Olympus Win Super Scatter 1.png',
    'Sweet Rush Bonanza': '/pragmatic/thumb=Sweet Rush Bonanza 1.png',
  },
}
let betnexClient = null
let betnexCatalogCache = { expiresAt: 0, games: null }
let betnexCatalogRequest = null

function getBetnexClient() {
  const apiKey = String(process.env.BETNEX_API_KEY || '').trim()
  if (!apiKey) {
    const error = new Error('Live Casino is not configured yet.')
    error.status = 503
    throw error
  }

  if (!betnexClient) {
    // Betnex prints a large promotional banner from its constructor even when
    // debug mode is disabled. Suppress only that synchronous constructor log;
    // real request/callback errors continue through this server's normal logs.
    const originalConsoleLog = console.log
    try {
      console.log = () => {}
      betnexClient = new Betnex(apiKey, {
        timeout: 20_000,
        retries: 2,
        debug: false,
      })
    } finally {
      console.log = originalConsoleLog
    }
  }
  return betnexClient
}

function getBetnexCoinsPerUsd() {
  const value = Number(process.env.BETNEX_COINS_PER_USD)
  if (!Number.isSafeInteger(value) || value <= 0 || value % 100 !== 0) {
    const error = new Error('BETNEX_COINS_PER_USD must be a positive whole number divisible by 100.')
    error.status = 503
    throw error
  }
  return value
}

function coinsToBetnexUsd(coins, coinsPerUsd) {
  const safeCoins = Number(coins)
  if (!Number.isSafeInteger(safeCoins) || safeCoins < 0) {
    throw new Error('The player coin balance cannot be represented safely for Live Casino.')
  }
  // Betnex games operate in conventional currency precision. Keep any coins
  // below one cent in Supabase; callbacks can never consume that remainder.
  return Math.floor((safeCoins * 100) / coinsPerUsd) / 100
}

function getBetnexMemberAccount(profileId) {
  // Betnex requires the username to identify the same player across every
  // launch. Keep it opaque, deterministic, alphanumeric, and within 32 chars.
  const digest = crypto.createHash('sha256').update(String(profileId)).digest('hex')
  return `bb${digest.slice(0, 30)}`
}

function getBetnexLaunchUrl(response) {
  const value = response?.payload?.game_launch_url ||
    response?.game_launch_url ||
    response?.payload?.url ||
    response?.url
  try {
    const url = new URL(String(value || ''))
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : ''
  } catch {
    return ''
  }
}

function getFrontendOrigin(req) {
  const configuredOrigin = String(process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map((entry) => entry.trim())
    .find(Boolean)
  if (configuredOrigin) {
    try {
      return new URL(configuredOrigin).origin
    } catch {
      // Fall back to the verified request host below.
    }
  }
  return `${isSecureRequest(req) ? 'https' : 'http'}://${req.get('host')}`
}

function getBetnexGames(response) {
  if (Array.isArray(response)) return response
  if (Array.isArray(response?.games)) return response.games
  if (Array.isArray(response?.payload?.games)) return response.payload.games
  if (Array.isArray(response?.payload)) return response.payload
  if (Array.isArray(response?.data?.games)) return response.data.games
  if (Array.isArray(response?.data)) return response.data
  return []
}

async function getBetnexCurrencyGames(providerCode, currency = BETNEX_CURRENCY) {
  const apiKey = String(process.env.BETNEX_API_KEY || '').trim()
  if (!apiKey) throw new Error('Live Casino is not configured yet.')
  const baseUrl = String(
    process.env.BETNEX_API_BASE_URL || 'http://livecasinoapi.betnex.co:8011/casino',
  ).replace(/\/+$/, '')
  const url = new URL(`${baseUrl}/filtergames`)
  url.searchParams.set('providercode', providerCode)
  url.searchParams.set('currency', currency)

  const response = await fetch(url, {
    headers: {
      'x-betnex-key': apiKey,
      Accept: 'application/json',
      'User-Agent': 'BloxyBattlesServer/1.0',
    },
    signal: AbortSignal.timeout(25_000),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data) {
    const error = new Error(data?.message || data?.msg || 'Unable to load the USD-compatible game catalog.')
    error.status = response.status
    throw error
  }
  return data
}

function getBetnexGameCategory(game, provider) {
  const name = String(game?.name || '')
  if (provider.categories.includes('Blackjack') && /blackjack/i.test(name)) return 'Blackjack'
  if (provider.categories.includes('Baccarat') && /baccarat/i.test(name)) return 'Baccarat'

  if (provider.id === 'HACKSAW' || provider.id === 'PRAGMATICSLOTS') return 'Slots'
  if (provider.id === 'BGAMING' && /slot/i.test(String(game?.type || game?.game_type || ''))) return 'Slots'
  return null
}

function normalizeBetnexGame(game, provider, index) {
  const category = getBetnexGameCategory(game, provider)
  if (!category) return null

  const id = String(game?.id || game?.game_uid || game?.uid || '')
  const name = String(game?.name || game?.game_name || '').trim()
  const image = String(game?.img || game?.image || game?.image_url || game?.thumbnail || '').trim()
  if (!id || !name || !image) return null

  return {
    id,
    name,
    image,
    category,
    provider: provider.label,
    providerId: provider.id,
    order: index,
  }
}

function selectFeaturedBetnexGames(games, provider) {
  const featuredByCategory = BETNEX_FEATURED_GAMES[provider.id] || {}

  return provider.categories.flatMap((category) => {
    const featuredNames = featuredByCategory[category] || []
    const categoryLimit = category === 'Slots' ? featuredNames.length : 5
    const categoryGames = games.filter((game) => game.category === category)
    const gameByName = new Map(categoryGames.map((game) => [game.name.toLowerCase(), game]))
    const localImages = BETNEX_LOCAL_SLOT_IMAGES[provider.id] || {}
    const selected = featuredNames
      .map((name, index) => {
        const catalogGame = gameByName.get(name.toLowerCase())
        const localImage = localImages[name]
        if (catalogGame) {
          return {
            ...catalogGame,
            ...(localImage ? { image: localImage } : {}),
            launchAvailable: true,
          }
        }
        if (category !== 'Slots' || !localImage) return null
        return {
          id: `local-${provider.id.toLowerCase()}-${index}`,
          name,
          image: localImage,
          category,
          provider: provider.label,
          providerId: provider.id,
          order: index,
          launchAvailable: false,
        }
      })
      .filter(Boolean)
      .slice(0, categoryLimit)

    if (category !== 'Slots' && selected.length < categoryLimit) {
      const selectedIds = new Set(selected.map((game) => game.id))
      for (const game of categoryGames) {
        if (selected.length >= categoryLimit) break
        if (selectedIds.has(game.id) || /first person/i.test(game.name)) continue
        selected.push({ ...game, launchAvailable: true })
        selectedIds.add(game.id)
      }
    }

    return selected.slice(0, categoryLimit)
  })
}

async function loadBetnexCatalog() {
  if (Array.isArray(betnexCatalogCache.games) && betnexCatalogCache.expiresAt > Date.now()) {
    return betnexCatalogCache.games
  }
  if (betnexCatalogRequest) return betnexCatalogRequest

  betnexCatalogRequest = (async () => {
    const api = getBetnexClient()
    const responses = await Promise.allSettled(
      BETNEX_PROVIDERS.map(async (provider) => {
        const [catalogResponse, currencyResponse] = await Promise.all([
          api.getGames(provider.id),
          getBetnexCurrencyGames(provider.currencyId),
        ])
        return { provider, catalogResponse, currencyResponse }
      }),
    )

    const games = responses.flatMap((result) => {
      if (result.status !== 'fulfilled') {
        console.warn('[live-casino] provider catalog failed', result.reason?.message || result.reason)
        return []
      }
      const { provider, catalogResponse, currencyResponse } = result.value
      const catalogGames = getBetnexGames(catalogResponse)
      const catalogByName = new Map(catalogGames.map((game) => [
        String(game?.name || game?.game_name || '').trim().toLowerCase(),
        game,
      ]))
      const localImages = BETNEX_LOCAL_SLOT_IMAGES[provider.id] || {}
      const normalizedGames = getBetnexGames(currencyResponse)
        .filter((game) => Number(game?.status ?? 1) === 1)
        .map((game, index) => {
          const name = String(game?.game_name || game?.name || '').trim()
          const catalogGame = catalogByName.get(name.toLowerCase()) || {}
          return normalizeBetnexGame({
            ...catalogGame,
            ...game,
            id: game?.game_uid || game?.id,
            name,
            img: localImages[name] || catalogGame?.img || catalogGame?.image || catalogGame?.image_url,
          }, provider, index)
        })
        .filter(Boolean)
      return selectFeaturedBetnexGames(normalizedGames, provider)
    })

    if (games.length === 0) {
      const error = new Error('Live Casino games are temporarily unavailable.')
      error.status = 502
      throw error
    }

    betnexCatalogCache = {
      expiresAt: Date.now() + BETNEX_CATALOG_CACHE_MS,
      games,
    }
    return games
  })().finally(() => {
    betnexCatalogRequest = null
  })

  return betnexCatalogRequest
}

const RAIN_DURATION_SECONDS = 30 * 60
const RAIN_JOIN_WINDOW_SECONDS = 5 * 60
const INITIAL_RAIN_POOL = 10000
const RAIN_TIP_CHAT_THRESHOLD = 10000
const USER_COIN_TIP_CHAT_THRESHOLD = 10000
const USER_ITEM_TIP_CHAT_THRESHOLD = 100000
const RECAPTCHA_TEST_SECRET_KEY = '6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe'
let activeRainId = null
let rainSeconds = RAIN_DURATION_SECONDS
let rainPool = INITIAL_RAIN_POOL
let rainUserCount = 0
let rainEndsAt = null
let rainDiscordMessageId = null
let lastUpdatedAt = Date.now()
let isSettlingRain = false
let isPersistingRain = false
let isRainPersistQueued = false
let lastRainPersistAttemptAt = 0
const rainJoinAttempts = new Map()

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY

  return { supabaseUrl, supabaseKey }
}

function getSupabaseAdminConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

  return { supabaseUrl, supabaseKey }
}

function getSupabaseAdminHeaders(supabaseKey, additionalHeaders = {}) {
  return {
    apikey: supabaseKey,
    ...(!String(supabaseKey).startsWith('sb_secret_')
      ? { Authorization: `Bearer ${supabaseKey}` }
      : {}),
    ...additionalHeaders,
  }
}

const SESSION_COOKIE_NAME = 'bloxy_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30
const CHALLENGE_TTL_SECONDS = 15 * 60

function uniqueSecrets(values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
}

function getSessionSigningSecrets() {
  return uniqueSecrets([
    process.env.JWT_SECRET,
    process.env.APP_SESSION_SECRET,
    process.env.SUPABASE_SECRET_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ])
}

function getSessionSigningSecret() {
  return String(process.env.JWT_SECRET || '').trim()
}

function deriveGameSeedEncryptionKey(game, secret) {
  return crypto
    .createHash('sha256')
    .update(`bloxy:${game}:seed-encryption:v1:${secret}`)
    .digest()
}

function getJwtGameSeedEncryptionKey(game) {
  const secret = String(process.env.JWT_SECRET || '').trim()
  return secret ? deriveGameSeedEncryptionKey(game, secret) : null
}

function uniqueEncryptionKeys(keys) {
  const seen = new Set()
  return keys.filter((key) => {
    if (!Buffer.isBuffer(key)) return false
    const fingerprint = key.toString('hex')
    if (seen.has(fingerprint)) return false
    seen.add(fingerprint)
    return true
  })
}

function decryptAesGcmWithKeys(encryptedSeed, keys, invalidMessage, decryptMessage) {
  const [ivHex, tagHex, encryptedHex] = String(encryptedSeed || '').split('.')
  if (!ivHex || !tagHex || !encryptedHex) throw new Error(invalidMessage)

  for (const key of uniqueEncryptionKeys(keys)) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
      return Buffer.concat([
        decipher.update(Buffer.from(encryptedHex, 'hex')),
        decipher.final(),
      ]).toString('utf8')
    } catch {
      // Try legacy keys so games created before the JWT_SECRET migration remain readable.
    }
  }

  throw new Error(decryptMessage)
}

function encodeSignedToken(payload) {
  const secret = getSessionSigningSecret()
  if (!secret) throw new Error('JWT_SECRET is required for authentication.')
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto
    .createHmac('sha256', `bloxy-session:${secret}`)
    .update(encodedPayload)
    .digest('base64url')
  return `${encodedPayload}.${signature}`
}

function decodeSignedToken(token, expectedKind) {
  const [encodedPayload, providedSignature] = String(token || '').split('.')
  const secrets = getSessionSigningSecrets()
  if (!secrets.length || !encodedPayload || !providedSignature) return null

  let providedBuffer
  try {
    providedBuffer = Buffer.from(providedSignature, 'base64url')
  } catch {
    return null
  }
  const hasValidSignature = secrets.some((secret) => {
    const expectedSignature = crypto
      .createHmac('sha256', `bloxy-session:${secret}`)
      .update(encodedPayload)
      .digest()
    return providedBuffer.length === expectedSignature.length &&
      crypto.timingSafeEqual(providedBuffer, expectedSignature)
  })
  if (!hasValidSignature) return null

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
    if (payload?.kind !== expectedKind || Number(payload?.exp || 0) <= Date.now()) return null
    return payload
  } catch {
    return null
  }
}

function parseCookies(cookieHeader) {
  const cookies = {}
  for (const part of String(cookieHeader || '').split(';')) {
    const separatorIndex = part.indexOf('=')
    if (separatorIndex <= 0) continue
    const name = part.slice(0, separatorIndex).trim()
    const value = part.slice(separatorIndex + 1).trim()
    try {
      cookies[name] = decodeURIComponent(value)
    } catch {
      cookies[name] = value
    }
  }
  return cookies
}

function isSecureRequest(req) {
  const forwardedProtocol = String(req?.headers?.['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
  return Boolean(req?.secure) || forwardedProtocol === 'https' || process.env.NODE_ENV === 'production'
}

function setSessionCookie(res, identity, req) {
  const token = encodeSignedToken({
    kind: 'session',
    profileId: identity.profileId,
    subject: identity.subject,
    robloxId: identity.robloxId || null,
    sessionId: identity.sessionId,
    exp: Date.now() + SESSION_TTL_SECONDS * 1000,
  })
  const secure = isSecureRequest(req) ? '; Secure' : ''
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`,
  )
}

function clearSessionCookie(res, req) {
  const secure = isSecureRequest(req) ? '; Secure' : ''
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
  )
}

function resolveStorageProfileId(value) {
  const rawValue = String(value || '')
  if (isUuidLike(rawValue)) return rawValue

  const bytes = Buffer.from(crypto.createHash('sha1').update(rawValue).digest())
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

async function adminRest(pathname, { method = 'GET', body, headers = {} } = {}) {
  const { supabaseUrl, supabaseKey } = getSupabaseAdminConfig()
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase admin configuration is missing.')
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${pathname}`, {
    method,
    headers: getSupabaseAdminHeaders(supabaseKey, {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    }),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  })
  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || text || `Database request failed (${response.status}).`)
    error.status = response.status
    error.code = data?.code
    throw error
  }
  return data
}

function isMissingDatabaseColumn(error, columnName) {
  const code = String(error?.code || '')
  const message = String(error?.message || '')
  return (code === '42703' || code === 'PGRST204') &&
    message.toLowerCase().includes(String(columnName).toLowerCase())
}

async function loadProfileById(profileId) {
  const rows = await adminRest(
    `user_profiles?select=*&id=eq.${encodeURIComponent(String(profileId))}&limit=1`,
  )
  return Array.isArray(rows) ? rows[0] || null : rows
}

async function emitProfileUpdates(profileIds) {
  const uniqueProfileIds = [...new Set(
    profileIds.map((profileId) => String(profileId || '').trim()).filter(Boolean),
  )]

  try {
    const profiles = await Promise.all(uniqueProfileIds.map((profileId) => loadProfileById(profileId)))
    const profilesById = new Map(
      profiles.filter(Boolean).map((profile) => [String(profile.id), profile]),
    )

    for (const socket of io.sockets.sockets.values()) {
      const profileId = String(socket.data.identity?.profileId || '')
      const profile = profilesById.get(profileId)
      if (!profile) continue
      socket.data.profile = profile
      socket.emit('profile:updated', profile)
    }
  } catch (error) {
    console.warn('[profile] failed to emit realtime profile updates', error)
  }
}

async function emitWalletRefreshes(profileIds) {
  const uniqueProfileIds = [...new Set(
    profileIds.map((profileId) => String(profileId || '').trim()).filter(Boolean),
  )]
  if (uniqueProfileIds.length === 0) return

  await emitProfileUpdates(uniqueProfileIds)
  const profileIdSet = new Set(uniqueProfileIds)
  for (const socket of io.sockets.sockets.values()) {
    const profileId = String(socket.data.identity?.profileId || '')
    if (!profileIdSet.has(profileId)) continue
    
    // Fetch the current balance for this profile
    const profile = await loadProfileById(profileId)
    if (profile) {
      socket.emit('wallet:updated', { profileId, balance: Number(profile.balance || 0) })
    }
  }
}

async function getAuthenticatedIdentityFromHeaders(headers) {
  const cookies = parseCookies(headers?.cookie)
  const sessionPayload = decodeSignedToken(cookies[SESSION_COOKIE_NAME], 'session')
  if (sessionPayload?.profileId && sessionPayload?.sessionId) {
    try {
      const sessions = await adminRest(
        `user_sessions?select=id&user_id=eq.${encodeURIComponent(sessionPayload.profileId)}&id=eq.${encodeURIComponent(sessionPayload.sessionId)}&limit=1`,
      )
      if (Array.isArray(sessions) && sessions.length > 0) {
        return {
          profileId: String(sessionPayload.profileId),
          subject: String(sessionPayload.subject || sessionPayload.profileId),
          robloxId: sessionPayload.robloxId ? String(sessionPayload.robloxId) : null,
          sessionId: String(sessionPayload.sessionId),
        }
      }
    } catch {
      return null
    }
  }

  return null
}

async function requireAuthenticatedUser(req, res, next) {
  try {
    const identity = await getAuthenticatedIdentityFromHeaders(req.headers)
    if (!identity?.profileId) {
      res.status(401).json({ ok: false, error: 'Please sign in to continue.' })
      return
    }
    req.identity = identity
    if (isUnsafeHttpMethod(req.method)) {
      const profileKey = String(identity.profileId)
      const blockedUntil = temporaryProfileBlocks.get(profileKey) || 0
      if (blockedUntil > Date.now()) {
        res.setHeader('Retry-After', String(Math.ceil((blockedUntil - Date.now()) / 1000)))
        res.status(429).json({ ok: false, error: 'This account is temporarily rate limited.' })
        return
      }
      if (isRateLimited(extremeProfileMutationWindows, profileKey, 600, 60_000)) {
        temporaryProfileBlocks.set(profileKey, Date.now() + 10 * 60_000)
        void recordSecurityEvent(req, 'extreme_profile_request_flood', 'high', { profile_id: profileKey })
        res.setHeader('Retry-After', '600')
        res.status(429).json({ ok: false, error: 'This account is temporarily rate limited.' })
        return
      }
      if (isRateLimited(profileMutationWindows, profileKey, 120, 60_000)) {
        res.setHeader('Retry-After', '60')
        res.status(429).json({ ok: false, error: 'Too many requests. Please wait a moment.' })
        return
      }
    }
    next()
  } catch (error) {
    console.warn('[auth] authentication check failed', error)
    res.status(401).json({ ok: false, error: 'Your session is invalid or expired.' })
  }
}

const TIMEZONE_LOCATION_LABELS = {
  'Australia/Brisbane': 'Brisbane, Australia',
  'Australia/Sydney': 'Sydney, Australia',
  'Australia/Melbourne': 'Melbourne, Australia',
  'Australia/Perth': 'Perth, Australia',
  'Australia/Adelaide': 'Adelaide, Australia',
  'America/New_York': 'New York, United States',
  'America/Los_Angeles': 'Los Angeles, United States',
  'America/Chicago': 'Chicago, United States',
  'America/Denver': 'Denver, United States',
  'Europe/London': 'London, United Kingdom',
  'Europe/Paris': 'Paris, France',
  'Europe/Berlin': 'Berlin, Germany',
  'Europe/Madrid': 'Madrid, Spain',
  'Europe/Rome': 'Rome, Italy',
  'Asia/Singapore': 'Singapore, Singapore',
  'Asia/Tokyo': 'Tokyo, Japan',
  'Asia/Bangkok': 'Bangkok, Thailand',
  'Asia/Kolkata': 'Mumbai, India',
  'Asia/Dubai': 'Dubai, United Arab Emirates',
  UTC: 'UTC',
}

function getClientLocation(req) {
  const timeZone = String(req.headers['x-client-timezone'] || '').trim().slice(0, 100)
  if (!timeZone) return null

  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format()
  } catch {
    return null
  }

  return TIMEZONE_LOCATION_LABELS[timeZone] ||
    timeZone.replace(/_/g, ' ').replace('/', ', ')
}

function getRequestMetadata(req) {
  return {
    ip_address: getRequestIp(req) || null,
    user_agent: String(req.headers['user-agent'] || '').slice(0, 500) || null,
    location: getClientLocation(req),
  }
}

async function createServerSession(identity, req) {
  const sessionId = crypto.randomUUID()
  const now = new Date().toISOString()
  const metadata = getRequestMetadata(req)
  await adminRest(`user_sessions?user_id=eq.${encodeURIComponent(identity.profileId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: { is_current: false, current: false, updated_at: now },
  })
  await adminRest('user_sessions', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: [{
      id: sessionId,
      user_id: identity.profileId,
      ip_address: metadata.ip_address,
      ip_addresses: metadata.ip_address ? [metadata.ip_address] : [],
      user_agent: metadata.user_agent,
      location: metadata.location,
      created_at: now,
      updated_at: now,
      first_login_at: now,
      last_seen_at: now,
      last_active_at: now,
      is_current: true,
      current: true,
    }],
  })
  return { ...identity, sessionId }
}

function getRequestIp(req) {
  const address = String(req.ip || req.socket?.remoteAddress || '').trim()
  if (address.toLowerCase().startsWith('::ffff:')) return address.slice(7)
  if (address === '::1') return 'localhost'
  return address
}

function isRainJoinRateLimited(ipAddress) {
  const key = ipAddress || 'unknown'
  const now = Date.now()
  const windowStart = now - 60_000
  const recentAttempts = (rainJoinAttempts.get(key) || []).filter((timestamp) => timestamp > windowStart)
  recentAttempts.push(now)
  rainJoinAttempts.set(key, recentAttempts)

  if (rainJoinAttempts.size > 2_000) {
    for (const [storedKey, attempts] of rainJoinAttempts.entries()) {
      if (!attempts.some((timestamp) => timestamp > windowStart)) rainJoinAttempts.delete(storedKey)
    }
  }

  return recentAttempts.length > 10
}

async function verifyCaptchaToken(token, ipAddress) {
  const isTestMode = process.env.RECAPTCHA_TEST_MODE === 'true'
  const secret = isTestMode
    ? RECAPTCHA_TEST_SECRET_KEY
    : process.env.RECAPTCHA_SECRET_KEY || ''
  const normalizedToken = typeof token === 'string' ? token.trim() : ''

  if (!secret) {
    return { ok: false, status: 503, error: 'reCAPTCHA is not configured on the server.' }
  }

  if (!normalizedToken) {
    return { ok: false, status: 400, error: 'Complete the security check before continuing.' }
  }

  if (normalizedToken.length > 16_384) {
    return { ok: false, status: 400, error: 'The security check response is invalid. Please try again.' }
  }

  try {
    const verificationBody = new URLSearchParams({
      secret,
      response: normalizedToken,
    })
    if (ipAddress) verificationBody.set('remoteip', ipAddress)

    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: verificationBody,
      signal: AbortSignal.timeout(8_000),
    })
    const result = await response.json()
    const expectedHostname = String(process.env.RECAPTCHA_EXPECTED_HOSTNAME || '').trim().toLowerCase()
    const hostnameMatches = isTestMode ||
      !expectedHostname ||
      String(result.hostname || '').toLowerCase() === expectedHostname

    if (!response.ok || !result.success || !hostnameMatches) {
      return { ok: false, status: 403, error: 'Security verification failed. Please try again.' }
    }

    return { ok: true }
  } catch {
    return { ok: false, status: 503, error: 'Security verification is temporarily unavailable.' }
  }
}

async function callRainRpc(functionName, payload) {
  const { supabaseUrl, supabaseKey } = getSupabaseAdminConfig()
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required for secure server operations.')
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: getSupabaseAdminHeaders(supabaseKey, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(payload),
  })
  const text = await response.text()
  let result = null
  try {
    result = text ? JSON.parse(text) : null
  } catch {
    result = null
  }

  if (!response.ok) {
    throw new Error(result?.message || result?.error || text || `Rain database operation failed (${response.status}).`)
  }

  return result
}

function isMissingRainRpcSignature(error, functionName) {
  const message = String(error?.message || '')
  return message.includes(`function public.${functionName}(`) &&
    /schema cache|could not find the function/i.test(message)
}

function formatDiscordValue(value) {
  const numericValue = Number(value ?? 0)
  if (!Number.isFinite(numericValue)) return '0'
  return numericValue.toLocaleString('en-US')
}

function getRainWebhookUrl() {
  return String(process.env.DISCORD_RAIN_WEBHOOK_URL || '').trim()
}

function buildRainWebhookPayload({
  rainId,
  poolAmount,
  userCount,
  endsAt,
  status = 'active',
  paidUsers = 0,
}) {
  const normalizedStatus = status === 'settled' ? 'settled' : 'active'
  const endTimestamp = Math.floor(new Date(endsAt || Date.now()).getTime() / 1000)
  const isActive = normalizedStatus === 'active'

  return {
    username: 'BloxyBattle',
    embeds: [
      {
        title: 'Rain Started!',
        url: 'https://bloxybattle.com',
        color: 0x6b63ff,
        thumbnail: {
          url: 'https://cdn.discordapp.com/attachments/1531824379003015171/1532237696909443152/download_4.png?ex=6a6c1f0e&is=6a6acd8e&hm=4cb1070eada6453acc95978694fe6e6e4e8a54e167669ee1f3ea79b84d45c64c&',
        },
        fields: [
          {
            name: 'Rain Amount',
            value: `<:bobux:1532234087740211240> ${formatDiscordValue(poolAmount)}`,
            inline: true,
          },
          {
            name: 'Participants',
            value: formatDiscordValue(isActive ? userCount : paidUsers),
            inline: true,
          },
          {
            name: isActive ? 'Rain Ends' : 'Rain Ended',
            value: `<t:${endTimestamp}:R>`,
            inline: false,
          },
        ],
        footer: {
          text: `ID: ${rainId || 'unknown'}`,
        },
        timestamp: new Date().toISOString(),
      },
    ],
  }
}

async function saveRainDiscordMessageId(rainId, messageId) {
  const { supabaseUrl, supabaseKey } = getSupabaseAdminConfig()
  if (!supabaseUrl || !supabaseKey || !rainId || !messageId) return

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/rain_state?rain_uuid=eq.${encodeURIComponent(rainId)}`,
      {
        method: 'PATCH',
        headers: getSupabaseAdminHeaders(supabaseKey, {
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ discord_message_id: messageId }),
      },
    )
    if (!response.ok) {
      await response.text()
    }
  } catch {}
}

async function updateRainDiscordMessage({
  messageId,
  rainId,
  poolAmount,
  userCount,
  endsAt,
  status,
  paidUsers,
}) {
  const webhookUrl = getRainWebhookUrl()
  if (!webhookUrl || !messageId) return false

  try {
    const response = await fetch(
      `${webhookUrl.split('?')[0]}/messages/${encodeURIComponent(messageId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRainWebhookPayload({
          rainId,
          poolAmount,
          userCount,
          endsAt,
          status,
          paidUsers,
        })),
      },
    )
    if (!response.ok) {
      await response.text()
      return false
    }
    return true
  } catch {
    return false
  }
}

async function syncActiveRainDiscordLog() {
  const webhookUrl = getRainWebhookUrl()
  if (!webhookUrl || !activeRainId) return

  if (rainDiscordMessageId) {
    const updated = await updateRainDiscordMessage({
      messageId: rainDiscordMessageId,
      rainId: activeRainId,
      poolAmount: rainPool,
      userCount: rainUserCount,
      endsAt: rainEndsAt,
      status: 'active',
    })
    if (updated) return
    rainDiscordMessageId = null
  }

  try {
    const separator = webhookUrl.includes('?') ? '&' : '?'
    const response = await fetch(`${webhookUrl}${separator}wait=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRainWebhookPayload({
        rainId: activeRainId,
        poolAmount: rainPool,
        userCount: rainUserCount,
        endsAt: rainEndsAt,
        status: 'active',
      })),
    })
    const text = await response.text()
    const message = text ? JSON.parse(text) : null
    if (!response.ok || !message?.id) {
      return
    }

    rainDiscordMessageId = String(message.id)
    await saveRainDiscordMessageId(activeRainId, rainDiscordMessageId)
  } catch {}
}

async function sendLoginWebhook(payload) {
  const webhookUrl = process.env.DISCORD_LOGIN_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || ''
  if (!webhookUrl) return { ok: false, skipped: true, reason: 'missing_webhook_url' }

  const discordAccountValue = payload.discord_linked
    ? payload.discord_mention || (payload.discord_user_id ? `<@${payload.discord_user_id}>` : payload.discord_username || 'Linked')
    : 'Not Linked!'
  const formattedTotalValue = formatDiscordValue(payload.total_value)

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'BloxyBattle',
        embeds: [
          {
            title: '',
            color: 0x6b63ff,
            thumbnail: {
              url: payload.avatar_headshot_url || payload.avatar_url || 'https://www.roblox.com/favicon.ico',
            },
            fields: [
              {
                name: 'Roblox Account',
                value: payload.username || 'Unknown',
                inline: true,
              },
              {
                name: 'Discord Account',
                value: discordAccountValue,
                inline: true,
              },
              {
                name: 'Total Value',
                value: `<:bobux:1532234087740211240> ${formattedTotalValue}`,
                inline: false,
              },
            ],
            footer: {
              text: 'BloxyBattle Team Members Only!',
            },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('[login-webhook] failed to send embed', response.status, text)
      return { ok: false, error: text }
    }

    return { ok: true }
  } catch (error) {
    console.error('[login-webhook] failed to send embed', error)
    return { ok: false, error: String(error) }
  }
}

async function sendChatWebhook(payload) {
  const webhookUrl = process.env.DISCORD_CHAT_WEBHOOK_URL || process.env.DISCORD_LOGIN_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || ''
  if (!webhookUrl) return { ok: false, skipped: true, reason: 'missing_webhook_url' }

  const messageText = String(payload.message || payload.text || payload.content || '').trim() || 'No message content'
  const avatarThumbnailUrl = payload.avatar_headshot_url || payload.avatar_url || payload.avatar || payload.thumbnail_url || 'https://www.roblox.com/favicon.ico'
  const discordAccountValue = payload.discord_linked
    ? payload.discord_mention || (payload.discord_user_id ? `<@${payload.discord_user_id}>` : payload.discord_username || 'Linked')
    : 'Not Linked!'

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'BloxyBattle',
        embeds: [
          {
            title: '',
            color: 0x6b63ff,
            thumbnail: {
              url: avatarThumbnailUrl,
            },
            fields: [
              {
                name: 'Roblox Account',
                value: payload.username || 'Unknown',
                inline: true,
              },
              {
                name: 'Discord Account',
                value: discordAccountValue,
                inline: true,
              },
              {
                name: 'Message',
                value: messageText,
                inline: false,
              },
            ],
            footer: {
              text: 'BloxyBattle.com Team Members Only!',
            },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('[chat-webhook] failed to send embed', response.status, text)
      return { ok: false, error: text }
    }

    return { ok: true }
  } catch (error) {
    console.error('[chat-webhook] failed to send embed', error)
    return { ok: false, error: String(error) }
  }
}

async function persistRainState({ force = false } = {}) {
  const { supabaseUrl, supabaseKey } = getSupabaseAdminConfig()
  if (!supabaseUrl || !supabaseKey) {
    return
  }
  if (!activeRainId) return
  const now = Date.now()
  if (isPersistingRain) {
    if (force) isRainPersistQueued = true
    return
  }
  if (!force && now - lastRainPersistAttemptAt < 15_000) return

  isPersistingRain = true
  lastRainPersistAttemptAt = now
  const stateSnapshot = {
    rainId: activeRainId,
    countdownSeconds: rainSeconds,
    poolAmount: rainPool,
    endsAt: rainEndsAt,
    updatedAt: new Date().toISOString(),
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/rain_state?rain_uuid=eq.${encodeURIComponent(stateSnapshot.rainId)}&status=eq.active`,
      {
      method: 'PATCH',
      headers: getSupabaseAdminHeaders(supabaseKey, {
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({
        countdown_seconds: stateSnapshot.countdownSeconds,
        pool_amount: stateSnapshot.poolAmount,
        ends_at: stateSnapshot.endsAt,
        last_updated_at: stateSnapshot.updatedAt,
      }),
      signal: AbortSignal.timeout(20_000),
    })

    if (!response.ok) {
      await response.text()
    }
  } catch {
    // Transient persistence failures are retried by the rain timer.
  } finally {
    isPersistingRain = false
    if (isRainPersistQueued) {
      isRainPersistQueued = false
      setTimeout(() => void persistRainState({ force: true }), 250)
    }
  }
}

async function loadRainState() {
  const { supabaseUrl, supabaseKey } = getSupabaseConfig()
  if (!supabaseUrl || !supabaseKey) return null

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rain_state?status=eq.active&order=created_at.desc&limit=1`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    return Array.isArray(data) ? data[0] : data
  } catch {
    return null
  }
}

async function createInitialRainState() {
  const { supabaseUrl, supabaseKey } = getSupabaseAdminConfig()
  if (!supabaseUrl || !supabaseKey) {
    return null
  }

  const rainUuid = crypto.randomUUID()
  const startedAt = new Date()
  const endsAt = new Date(startedAt.getTime() + RAIN_DURATION_SECONDS * 1000)
  const payload = {
    id: rainUuid,
    rain_uuid: rainUuid,
    status: 'active',
    countdown_seconds: RAIN_DURATION_SECONDS,
    pool_amount: INITIAL_RAIN_POOL,
    users: [],
    created_at: startedAt.toISOString(),
    started_at: startedAt.toISOString(),
    ends_at: endsAt.toISOString(),
    last_updated_at: startedAt.toISOString(),
  }

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rain_state`, {
      method: 'POST',
      headers: getSupabaseAdminHeaders(supabaseKey, {
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      }),
      body: JSON.stringify([payload]),
    })
    const text = await response.text()
    if (!response.ok) {
      return null
    }
    const data = text ? JSON.parse(text) : []
    return Array.isArray(data) ? data[0] : data
  } catch {
    return null
  }
}

async function persistRainEvent(eventType, username, amount, profileId, rainId = activeRainId) {
  const { supabaseUrl, supabaseKey } = getSupabaseAdminConfig()
  if (!supabaseUrl || !supabaseKey) {
    return
  }

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rain_events?on_conflict=id`, {
      method: 'POST',
      headers: getSupabaseAdminHeaders(supabaseKey, {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      }),
      body: JSON.stringify([{
        id: crypto.randomUUID(),
        username: username || 'Guest',
        amount,
        event_type: eventType,
        profile_id: profileId ? String(profileId) : null,
        rain_uuid: isUuidLike(rainId) ? rainId : null,
      }]),
    })

    if (!response.ok) {
      await response.text()
    }
  } catch {}
}

async function settleRainPool() {
  if (isSettlingRain) return false
  const { supabaseUrl, supabaseKey } = getSupabaseAdminConfig()
  if (!supabaseUrl || !supabaseKey) {
    return false
  }
  isSettlingRain = true

  try {
    const settledRainSnapshot = {
      messageId: rainDiscordMessageId,
      rainId: activeRainId,
      poolAmount: rainPool,
      userCount: rainUserCount,
      endsAt: rainEndsAt || new Date().toISOString(),
    }
    const result = await callRainRpc('settle_rain', {
      p_state_id: activeRainId,
      p_next_pool: INITIAL_RAIN_POOL,
      p_next_countdown: RAIN_DURATION_SECONDS,
    })

    if (!result?.next_rain_uuid) {
      throw new Error('Rain settlement did not return the next rain UUID. Apply the rain history migration.')
    }

    await updateRainDiscordMessage({
      ...settledRainSnapshot,
      status: 'settled',
      paidUsers: Number(result.paid_users || 0),
    })

    activeRainId = String(result.next_rain_uuid)
    rainSeconds = RAIN_DURATION_SECONDS
    rainPool = INITIAL_RAIN_POOL
    rainUserCount = 0
    rainEndsAt = result.next_ends_at ||
      new Date(Date.now() + RAIN_DURATION_SECONDS * 1000).toISOString()
    rainDiscordMessageId = null
    lastUpdatedAt = Date.now()
    await syncActiveRainDiscordLog()
    emitRainCountdown()
    emitRainPool()
    io.emit('rain:settled', result || {})
    return true
  } catch {
    return false
  } finally {
    isSettlingRain = false
  }
}

async function initializeRainState() {
  const storedState = await loadRainState() || await createInitialRainState()

  if (!storedState) {
    rainSeconds = 0
    return
  }

  activeRainId = String(storedState.rain_uuid || storedState.id || '')
  rainUserCount = Array.isArray(storedState.users) ? storedState.users.length : 0
  const storedEndsAt = storedState.ends_at ? new Date(storedState.ends_at).getTime() : Number.NaN
  const storedStartedAt = storedState.started_at ? new Date(storedState.started_at).getTime() : Number.NaN
  const maximumEndsAt = Number.isFinite(storedStartedAt)
    ? storedStartedAt + RAIN_DURATION_SECONDS * 1000
    : Date.now() + RAIN_DURATION_SECONDS * 1000
  rainEndsAt = new Date(
    Number.isFinite(storedEndsAt)
      ? Math.min(storedEndsAt, maximumEndsAt)
      : maximumEndsAt,
  ).toISOString()
  rainDiscordMessageId = storedState.discord_message_id
    ? String(storedState.discord_message_id)
    : null

  if (storedState?.countdown_seconds != null) {
    rainSeconds = Number(storedState.countdown_seconds) || RAIN_DURATION_SECONDS
  }

  if (storedState?.pool_amount != null) {
    rainPool = Number(storedState.pool_amount) || INITIAL_RAIN_POOL
  }

  if (rainEndsAt) {
    rainSeconds = Math.max(0, Math.ceil((new Date(rainEndsAt).getTime() - Date.now()) / 1000))
  } else {
    const storedUpdatedAt = storedState?.last_updated_at
      ? new Date(storedState.last_updated_at).getTime()
      : Date.now()
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - storedUpdatedAt) / 1000))
    rainSeconds = Math.max(0, rainSeconds - elapsedSeconds)
    rainEndsAt = new Date(Date.now() + rainSeconds * 1000).toISOString()
  }

  if (rainSeconds <= 0) {
    rainSeconds = 0
    await settleRainPool()
  }

  lastUpdatedAt = Date.now()
  if (rainSeconds > 0) {
    await persistRainState({ force: true })
    await syncActiveRainDiscordLog()
  }
}

function emitOnlineCount() {
  const uniqueVisitors = new Set()

  for (const socket of io.of('/').sockets.values()) {
    const accountId = String(socket.data?.accountId || '').trim()
    uniqueVisitors.add(accountId ? `account:${accountId}` : `socket:${socket.id}`)
  }

  const count = uniqueVisitors.size
  io.emit('online:count', count)
}

function emitRainCountdown() {
  io.emit('rain:countdown', rainSeconds)
}

function emitRainPool() {
  io.emit('rain:pool', rainPool)
}

function emitUserTipChat({
  tipId,
  tipType,
  senderUsername,
  recipientUsername,
  amount,
  itemCount = 0,
}) {
  const outgoing = {
    id: `user-tip-${tipId || crypto.randomUUID()}`,
    type: 'tip',
    tip_type: tipType,
    tip_context: 'user',
    time: new Date().toISOString(),
    name: senderUsername || 'user',
    sender_name: senderUsername || 'user',
    recipient_name: recipientUsername || 'user',
    amount: Number(amount || 0),
    item_count: Number(itemCount || 0),
  }

  io.emit('chat:message', outgoing)
}

async function processRainTip({ profileId, username, amount }) {
  const normalizedProfileId = String(profileId || '').trim()
  const normalizedAmount = Number(amount)
  if (!normalizedProfileId) throw new Error('Sign in before tipping the rain.')
  if (!Number.isSafeInteger(normalizedAmount) || normalizedAmount <= 0 || normalizedAmount > 2_147_483_647) {
    throw new Error('Enter a valid whole-number tip amount.')
  }
  if (!activeRainId) throw new Error('The active rain could not be found.')

  const targetRainId = activeRainId
  const result = await callRainRpc('tip_rain', {
    p_state_id: targetRainId,
    p_profile_id: normalizedProfileId,
    p_amount: normalizedAmount,
  })

  if (String(activeRainId) === String(result?.rain_uuid || targetRainId)) {
    rainPool = Number(result?.pool_amount ?? rainPool)
    emitRainPool()
    void syncActiveRainDiscordLog()
  }

  if (normalizedAmount >= RAIN_TIP_CHAT_THRESHOLD) {
    const resolvedUsername = result?.username || username || 'Guest'
    const outgoing = {
      id: `rain-tip-${Date.now()}-${crypto.randomUUID()}`,
      type: 'tip',
      time: new Date().toISOString(),
      name: resolvedUsername,
      amount: normalizedAmount,
    }
    void sendChatWebhook({
      username: resolvedUsername,
      message: `${resolvedUsername} tipped ${normalizedAmount} into the rain!`,
    })
    io.emit('chat:message', outgoing)
  }

  return result
}

function startRainTimer() {
  setInterval(async () => {
    rainSeconds = rainEndsAt
      ? Math.max(0, Math.ceil((new Date(rainEndsAt).getTime() - Date.now()) / 1000))
      : Math.max(0, rainSeconds - 1)

    if (rainSeconds <= 0) {
      emitRainCountdown()
      await settleRainPool()
      return
    }

    lastUpdatedAt = Date.now()
    void persistRainState()
    emitRainCountdown()
  }, 1000)
}

await initializeRainState()
startRainTimer()
io.use(async (socket, next) => {
  try {
    const identity = await getAuthenticatedIdentityFromHeaders(socket.handshake.headers)
    socket.data.identity = identity || null
    socket.data.profile = identity?.profileId ? await loadProfileById(identity.profileId) : null
    next()
  } catch (error) {
    console.warn('[socket] authentication lookup failed', error)
    socket.data.identity = null
    socket.data.profile = null
    next()
  }
})

const chatServerInstanceId = crypto.randomUUID()

io.on('connection', (socket) => {
  const socketEventTimes = []
  socket.use((packet, next) => {
    const now = Date.now()
    while (socketEventTimes.length > 0 && socketEventTimes[0] <= now - 60_000) {
      socketEventTimes.shift()
    }
    socketEventTimes.push(now)
    if (socketEventTimes.length > 600) {
      socket.disconnect(true)
      return
    }
    if (socketEventTimes.length > 240) {
      next(new Error('Too many realtime requests. Please wait a moment.'))
      return
    }
    next()
  })
  const chatSession = { id: chatServerInstanceId }
  socket.emit('chat:session', chatSession)
  socket.on('chat:session:get', (acknowledge) => {
    if (typeof acknowledge === 'function') acknowledge(chatSession)
  })
  emitRainCountdown()
  emitRainPool()

  const unidentifiedPresenceTimer = setTimeout(() => {
    emitOnlineCount()
  }, 250)

  socket.on('online:identify', (payload) => {
    clearTimeout(unidentifiedPresenceTimer)
    socket.data.accountId = socket.data.identity?.profileId || null
    emitOnlineCount()
  })

  socket.on('chat:message', (message, acknowledge) => {
    if (!message || typeof message !== 'object') {
      if (typeof acknowledge === 'function') acknowledge({ ok: false, error: 'Invalid chat message.' })
      return
    }
    if (!socket.data.identity?.profileId) {
      if (typeof acknowledge === 'function') {
        acknowledge({ ok: false, error: 'Please sign in to use chat.' })
      }
      return
    }
    const clientMessageId = /^[a-zA-Z0-9:_-]{1,100}$/.test(String(message.id || ''))
      ? String(message.id)
      : null
    const messageOwner = socket.data.identity?.profileId || `socket:${socket.id}`
    const receiptKey = clientMessageId ? `${messageOwner}:${clientMessageId}` : null
    const previousReceipt = receiptKey ? chatMessageReceipts.get(receiptKey) : null
    if (previousReceipt) {
      if (typeof acknowledge === 'function') acknowledge({ ok: true, message: previousReceipt.message })
      return
    }
    const now = Date.now()
    if (chatMessageReceipts.size > 2_000) {
      for (const [key, receipt] of chatMessageReceipts.entries()) {
        if (receipt.createdAt < now - 5 * 60_000) chatMessageReceipts.delete(key)
      }
      while (chatMessageReceipts.size > 2_000) {
        chatMessageReceipts.delete(chatMessageReceipts.keys().next().value)
      }
    }
    const messageText = String(message.text || message.message || message.content || '').trim().slice(0, 500)
    if (!messageText) {
      if (typeof acknowledge === 'function') acknowledge({ ok: false, error: 'Message cannot be empty.' })
      return
    }
    const recentMessages = getRecentChatMessages(socket.data.identity.profileId, now)
    if (recentMessages.length >= 3) {
      if (typeof acknowledge === 'function') {
        acknowledge({
          ok: false,
          error: 'Your sending messages too quickly!',
        })
      }
      return
    }
    chatMessageWindows.set(socket.data.identity.profileId, [...recentMessages, now])
    const profile = socket.data.profile
    const outgoing = {
      id: `msg-${Date.now()}-${crypto.randomUUID()}`,
      time: new Date().toISOString(),
      type: 'message',
      text: messageText,
      name: profile?.username || 'Guest',
      username: profile?.username || 'Guest',
      role: profile?.role || 'user',
      level: Number(profile?.level ?? 1),
      profile_id: profile?.id || null,
      roblox_id: profile?.roblox_id || socket.data.identity?.robloxId || null,
      avatar: profile?.avatar_headshot_url || profile?.avatar_url || null,
      avatar_url: profile?.avatar_url || null,
      avatar_headshot_url: profile?.avatar_headshot_url || profile?.avatar_url || null,
      played: Number(profile?.played || 0),
      won: Number(profile?.won || 0),
      lost: Number(profile?.lost || 0),
      client_message_id: clientMessageId,
      reply: message.reply && typeof message.reply === 'object'
        ? {
            name: String(message.reply.name || '').slice(0, 100),
            time: String(message.reply.time || '').slice(0, 30),
            text: String(message.reply.text || '').slice(0, 300),
          }
        : undefined,
    }
    if (socket.data.identity?.profileId) {
      void sendChatWebhook({
        username: profile?.username || 'Guest',
        avatar_url: profile?.avatar_url || profile?.avatar_headshot_url || null,
        avatar_headshot_url: profile?.avatar_headshot_url || profile?.avatar_url || null,
        discord_linked: Boolean(profile?.discord_linked),
        discord_mention: profile?.discord_mention || null,
        discord_username: profile?.discord_username || null,
        discord_user_id: profile?.discord_user_id || null,
        message: messageText,
      })
    }
    if (receiptKey) {
      chatMessageReceipts.set(receiptKey, { createdAt: now, message: outgoing })
    }
    socket.broadcast.emit('chat:message', outgoing)
    if (typeof acknowledge === 'function') acknowledge({ ok: true, message: outgoing })
  })

  socket.on('rain:tip', async (payload, acknowledge) => {
    if (!payload || typeof payload !== 'object') return
    if (!socket.data.identity?.profileId) {
      if (typeof acknowledge === 'function') acknowledge({ ok: false, error: 'Please sign in to tip the rain.' })
      return
    }
    try {
      const result = await processRainTip({
        profileId: socket.data.identity.profileId,
        username: socket.data.profile?.username,
        amount: Number(payload.amount),
      })
      if (typeof acknowledge === 'function') acknowledge({ ok: true, ...result })
    } catch (error) {
      if (typeof acknowledge === 'function') {
        acknowledge({ ok: false, error: error?.message || 'Unable to tip the rain.' })
      }
    }
  })

  socket.on('disconnect', () => {
    clearTimeout(unidentifiedPresenceTimer)
    emitOnlineCount()
  })
})

const ROBLOX_PHRASE_WORDS = [
  'relic', 'foam', 'tracker', 'brave', 'rose', 'moss', 'monk', 'neat', 'swimmer',
  'fox', 'legend', 'apple', 'moon', 'crystal', 'wolf', 'shadow', 'neon', 'blaze',
]
const authAttempts = new Map()
const chatMessageReceipts = new Map()
const chatMessageWindows = new Map()
const apiRequestWindows = new Map()
const extremeApiRequestWindows = new Map()
const ipMutationWindows = new Map()
const extremeIpMutationWindows = new Map()
const profileMutationWindows = new Map()
const extremeProfileMutationWindows = new Map()
const temporaryIpBlocks = new Map()
const temporaryProfileBlocks = new Map()

function getRecentChatMessages(profileId, now) {
  const recentMessages = (chatMessageWindows.get(profileId) || []).filter(
    (timestamp) => timestamp > now - 10_000,
  )
  chatMessageWindows.set(profileId, recentMessages)

  if (chatMessageWindows.size > 5_000) {
    for (const [storedProfileId, timestamps] of chatMessageWindows.entries()) {
      if (!timestamps.some((timestamp) => timestamp > now - 10_000)) {
        chatMessageWindows.delete(storedProfileId)
      }
    }
  }
  return recentMessages
}

function isRateLimited(store, key, limit, windowMs) {
  const now = Date.now()
  const cutoff = now - windowMs
  const attempts = (store.get(key) || []).filter((timestamp) => timestamp > cutoff)
  attempts.push(now)
  store.set(key, attempts)
  if (store.size > 5_000) {
    for (const [storedKey, timestamps] of store.entries()) {
      if (!timestamps.some((timestamp) => timestamp > cutoff)) store.delete(storedKey)
    }
  }
  return attempts.length > limit
}

function generateRobloxPhrase() {
  const words = [...ROBLOX_PHRASE_WORDS]
  for (let index = words.length - 1; index > 0; index -= 1) {
    const randomIndex = crypto.randomInt(index + 1)
    ;[words[index], words[randomIndex]] = [words[randomIndex], words[index]]
  }
  return words.slice(0, 10).join(' ')
}

function isUnsafeHttpMethod(method) {
  return !['GET', 'HEAD', 'OPTIONS'].includes(String(method || '').toUpperCase())
}

async function recordSecurityEvent(req, eventType, severity, metadata = {}) {
  try {
    await adminRest('security_events', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: [{
        profile_id: req.identity?.profileId || metadata.profile_id || null,
        ip_address: getRequestIp(req) || null,
        event_type: eventType,
        severity,
        route: String(req.originalUrl || req.url || '').slice(0, 300),
        user_agent: String(req.headers['user-agent'] || '').slice(0, 500) || null,
        metadata,
      }],
    })
  } catch (error) {
    console.warn('[security] failed to record event', error?.message || error)
  }
}

// This protects application capacity and wallet endpoints from a single source.
// Ordinary bursts receive 429 only. A sustained, extreme flood gets a temporary
// block and an audit event; it never permanently bans a user automatically.
app.use('/api', (req, res, next) => {
  const ipAddress = getRequestIp(req) || 'unknown'
  const blockedUntil = temporaryIpBlocks.get(ipAddress) || 0
  if (blockedUntil > Date.now()) {
    res.setHeader('Retry-After', String(Math.ceil((blockedUntil - Date.now()) / 1000)))
    res.status(429).json({ ok: false, error: 'This network is temporarily rate limited.' })
    return
  }

  if (isRateLimited(extremeApiRequestWindows, ipAddress, 3_000, 60_000)) {
    temporaryIpBlocks.set(ipAddress, Date.now() + 10 * 60_000)
    void recordSecurityEvent(req, 'extreme_api_request_flood', 'high')
    res.setHeader('Retry-After', '600')
    res.status(429).json({ ok: false, error: 'This network is temporarily rate limited.' })
    return
  }
  if (isRateLimited(apiRequestWindows, ipAddress, 600, 60_000)) {
    res.setHeader('Retry-After', '60')
    res.status(429).json({ ok: false, error: 'Too many requests. Please wait a moment.' })
    return
  }

  if (!isUnsafeHttpMethod(req.method) || req.path === '/betnex/callback') {
    next()
    return
  }

  const origin = String(req.headers.origin || '').trim()
  if (origin && !isAllowedOrigin(origin)) {
    void recordSecurityEvent(req, 'rejected_cross_origin_mutation', 'medium', { origin: origin.slice(0, 300) })
    res.status(403).json({ ok: false, error: 'Request origin is not allowed.' })
    return
  }

  if (isRateLimited(extremeIpMutationWindows, ipAddress, 600, 60_000)) {
    temporaryIpBlocks.set(ipAddress, Date.now() + 10 * 60_000)
    void recordSecurityEvent(req, 'extreme_ip_request_flood', 'high')
    res.setHeader('Retry-After', '600')
    res.status(429).json({ ok: false, error: 'This network is temporarily rate limited.' })
    return
  }

  if (isRateLimited(ipMutationWindows, ipAddress, 180, 60_000)) {
    res.setHeader('Retry-After', '60')
    res.status(429).json({ ok: false, error: 'Too many requests. Please wait a moment.' })
    return
  }

  next()
})

function normalizeRobloxProfileText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

async function fetchRobloxProfileForVerification(robloxId, phrase) {
  const normalizedPhrase = normalizeRobloxProfileText(phrase)
  let lastResponse = null
  let lastProfile = null
  let phraseFound = false

  // Roblox profile-description changes can take a few seconds to reach its API.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    lastResponse = await fetch(
      `https://users.roblox.com/v1/users/${encodeURIComponent(robloxId)}`,
      {
        headers: { 'Cache-Control': 'no-cache' },
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      },
    )
    lastProfile = await lastResponse.json().catch(() => null)

    if (!lastResponse.ok) break
    phraseFound = normalizeRobloxProfileText(lastProfile?.description).includes(normalizedPhrase)

    // Some Roblox accounts show their About text on the public profile while the
    // users API returns an empty description. Check the same public page users see.
    if (!phraseFound) {
      const publicProfileResponse = await fetch(
        `https://www.roblox.com/users/${encodeURIComponent(robloxId)}/profile`,
        {
          headers: {
            'Cache-Control': 'no-cache',
            'User-Agent': 'Mozilla/5.0 (compatible; BloxyBattlesVerification/1.0)',
          },
          cache: 'no-store',
          signal: AbortSignal.timeout(10_000),
        },
      )
      const publicProfileHtml = publicProfileResponse.ok
        ? await publicProfileResponse.text()
        : ''
      phraseFound = normalizeRobloxProfileText(publicProfileHtml).includes(normalizedPhrase)
    }

    if (phraseFound) break
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1_500))
  }

  return { response: lastResponse, profile: lastProfile, phraseFound }
}

async function upsertVerifiedProfile({ subject, robloxId, username, avatarUrl, avatarHeadshotUrl }) {
  const profileId = resolveStorageProfileId(subject)
  const existingProfile = await loadProfileById(profileId)
  const safeFields = {
    username: String(username || 'user').slice(0, 100),
    avatar_url: avatarUrl ? String(avatarUrl).slice(0, 2_000) : null,
    avatar_headshot_url: avatarHeadshotUrl ? String(avatarHeadshotUrl).slice(0, 2_000) : null,
    updated_at: new Date().toISOString(),
  }

  if (existingProfile) {
    await adminRest(`user_profiles?id=eq.${encodeURIComponent(profileId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: safeFields,
    })
  } else {
    const insertPayload = {
      id: profileId,
      ...safeFields,
      balance: 0,
      level: 1,
      xp: 0,
      role: 'user',
      played: 0,
      won: 0,
      lost: 0,
    }
    if (robloxId) insertPayload.roblox_id = String(robloxId)

    try {
      await adminRest('user_profiles?on_conflict=id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: [insertPayload],
      })
    } catch (error) {
      if (!isMissingDatabaseColumn(error, 'roblox_id')) throw error
      delete insertPayload.roblox_id
      await adminRest('user_profiles?on_conflict=id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: [insertPayload],
      })
    }
  }

  return loadProfileById(profileId)
}

app.post('/api/auth/roblox/challenge', express.json({ limit: '8kb' }), async (req, res) => {
  const ipAddress = getRequestIp(req) || 'unknown'
  if (isRateLimited(authAttempts, `challenge:${ipAddress}`, 10, 60_000)) {
    res.status(429).json({ ok: false, error: 'Too many verification attempts. Please wait a moment.' })
    return
  }

  const username = String(req.body?.username || '').trim()
  if (!username || username.length > 50) {
    res.status(400).json({ ok: false, error: 'Enter a valid Roblox username.' })
    return
  }

  try {
    const userResponse = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: true }),
      signal: AbortSignal.timeout(10_000),
    })
    const userPayload = await userResponse.json()
    const robloxUser = userPayload?.data?.[0]
    if (!userResponse.ok || !robloxUser?.id) {
      res.status(404).json({ ok: false, error: 'Roblox user not found. Check spelling.' })
      return
    }

    const phrase = generateRobloxPhrase()
    const [avatarResponse, headshotResponse] = await Promise.all([
      fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${encodeURIComponent(robloxUser.id)}&size=420x420&format=Png&isCircular=false`),
      fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${encodeURIComponent(robloxUser.id)}&size=420x420&format=Png&isCircular=false`),
    ])
    const [avatarPayload, headshotPayload] = await Promise.all([
      avatarResponse.ok ? avatarResponse.json() : null,
      headshotResponse.ok ? headshotResponse.json() : null,
    ])
    const avatarUrl = avatarPayload?.data?.[0]?.imageUrl || null
    const headshotUrl = headshotPayload?.data?.[0]?.imageUrl || avatarUrl
    const challengeToken = encodeSignedToken({
      kind: 'roblox-challenge',
      robloxId: String(robloxUser.id),
      username: String(robloxUser.name || username),
      phrase,
      avatarUrl,
      headshotUrl,
      exp: Date.now() + CHALLENGE_TTL_SECONDS * 1000,
    })

    res.json({
      ok: true,
      challenge_token: challengeToken,
      phrase,
      expires_in: CHALLENGE_TTL_SECONDS,
      user: {
        id: robloxUser.id,
        username: robloxUser.name || username,
        displayName: robloxUser.displayName || robloxUser.name || username,
        avatarUrl,
        headshotUrl,
      },
    })
  } catch (error) {
    console.error('[auth/roblox/challenge] failed', error)
    res.status(502).json({ ok: false, error: 'Failed to contact Roblox. Please try again.' })
  }
})

app.post('/api/auth/roblox/verify', express.json({ limit: '8kb' }), async (req, res) => {
  const ipAddress = getRequestIp(req) || 'unknown'
  if (isRateLimited(authAttempts, `verify:${ipAddress}`, 10, 60_000)) {
    res.status(429).json({ ok: false, error: 'Too many verification attempts. Please wait a moment.' })
    return
  }

  const challenge = decodeSignedToken(req.body?.challenge_token, 'roblox-challenge')
  if (!challenge?.robloxId || !challenge?.phrase) {
    res.status(400).json({ ok: false, error: 'The verification phrase expired. Please start again.' })
    return
  }

  try {
    const { response: profileResponse, profile: robloxProfile, phraseFound } =
      await fetchRobloxProfileForVerification(challenge.robloxId, challenge.phrase)
    if (!profileResponse?.ok) {
      res.status(502).json({ ok: false, error: 'Roblox did not return your profile. Please try again shortly.' })
      return
    }
    if (!phraseFound) {
      res.status(403).json({
        ok: false,
        error: 'The current phrase is not visible in your public Roblox About description yet. Save it, wait a moment, then try again.',
      })
      return
    }

    const subject = `roblox:${challenge.robloxId}`
    const profile = await upsertVerifiedProfile({
      subject,
      robloxId: challenge.robloxId,
      username: robloxProfile?.name || challenge.username,
      avatarUrl: challenge.avatarUrl || null,
      avatarHeadshotUrl: challenge.headshotUrl || challenge.avatarUrl || null,
    })
    const identity = await createServerSession({
      profileId: profile.id,
      subject,
      robloxId: challenge.robloxId,
    }, req)
    setSessionCookie(res, identity, req)
    res.json({ ok: true, user: { ...profile, id: subject, profile_id: profile.id, roblox_id: String(challenge.robloxId) } })
  } catch (error) {
    console.error('[auth/roblox/verify] failed', error)
    res.status(500).json({ ok: false, error: 'Failed to verify your Roblox profile.' })
  }
})

app.get('/api/auth/me', async (req, res) => {
  try {
    const identity = await getAuthenticatedIdentityFromHeaders(req.headers)
    res.setHeader('Cache-Control', 'no-store')
    if (!identity) {
      res.json({ ok: true, user: null })
      return
    }

    const profile = await loadProfileById(identity.profileId)
    if (!profile) {
      res.status(404).json({ ok: false, error: 'Your user profile could not be found.' })
      return
    }
    res.json({
      ok: true,
      user: {
        ...profile,
        id: identity.subject,
        profile_id: profile.id,
        roblox_id: profile.roblox_id || identity.robloxId || null,
      },
    })
  } catch (error) {
    console.error('[auth/me] failed', error)
    res.status(500).json({ ok: false, error: 'Unable to load your profile.' })
  }
})

app.delete('/api/auth/session', requireAuthenticatedUser, async (req, res) => {
  try {
    if (req.identity.sessionId) {
      await adminRest(
        `user_sessions?id=eq.${encodeURIComponent(req.identity.sessionId)}&user_id=eq.${encodeURIComponent(req.identity.profileId)}`,
        { method: 'DELETE' },
      )
    }
  } catch (error) {
    console.warn('[auth/session] failed to delete session', error)
  }
  clearSessionCookie(res, req)
  res.json({ ok: true })
})

app.get('/api/profile', requireAuthenticatedUser, async (req, res) => {
  const profile = await loadProfileById(req.identity.profileId)
  res.json({ ok: true, profile })
})

app.patch('/api/profile/ignored-users', express.json({ limit: '8kb' }), requireAuthenticatedUser, async (req, res) => {
  const ignoredUsers = Array.isArray(req.body?.ignored_users)
    ? [...new Set(req.body.ignored_users.map((value) => String(value).trim()).filter(isUuidLike))].slice(0, 500)
    : []
  await adminRest(`user_profiles?id=eq.${encodeURIComponent(req.identity.profileId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: { ignored_users: ignoredUsers, updated_at: new Date().toISOString() },
  })
  res.json({ ok: true, ignored_users: ignoredUsers })
})

app.get('/api/public-profiles', async (req, res) => {
  const ids = String(req.query.ids || '')
    .split(',')
    .map((value) => value.trim())
    .filter(isUuidLike)
    .slice(0, 50)
  const username = String(req.query.username || '').trim().slice(0, 100)
  let filter = ''
  if (ids.length) filter = `&id=in.(${ids.join(',')})`
  else if (username) filter = `&username=eq.${encodeURIComponent(username)}`
  else {
    res.status(400).json({ ok: false, error: 'A profile ID or username is required.' })
    return
  }
  const rows = await adminRest(
    `user_profiles?select=id,username,avatar_url,avatar_headshot_url,roblox_id,role,level,played,won,lost,summer_tickets${filter}&limit=50`,
  ).catch(async (error) => {
    if (!isMissingDatabaseColumn(error, 'roblox_id')) throw error
    return adminRest(
      `user_profiles?select=id,username,avatar_url,avatar_headshot_url,role,level,played,won,lost,summer_tickets${filter}&limit=50`,
    )
  })
  res.json({ ok: true, profiles: Array.isArray(rows) ? rows : [] })
})

app.get('/api/leaderboard', async (req, res) => {
  try {
    const sort = ['played', 'profit', 'least-profit'].includes(String(req.query.sort))
      ? String(req.query.sort)
      : 'played'
    const profiles = await adminRest(
      'user_profiles?select=id,username,avatar_url,avatar_headshot_url,role,level,played,won,lost&limit=1000',
    )
    const leaders = (Array.isArray(profiles) ? profiles : [])
      .map((profile) => {
        const played = Number(profile.played) || 0
        const profit = (Number(profile.won) || 0) - (Number(profile.lost) || 0)
        return { ...profile, stat: sort === 'played' ? played : profit }
      })
      .filter((profile) => profile.username && (sort === 'played' ? profile.stat > 0 : true))
      .sort((left, right) => sort === 'least-profit' ? left.stat - right.stat : right.stat - left.stat)
      .slice(0, 10)

    res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=30')
    res.json({ ok: true, leaders })
  } catch (error) {
    console.error('[leaderboard] failed', error)
    res.status(500).json({ ok: false, error: 'Unable to load the leaderboard.' })
  }
})

app.get('/api/inventory', requireAuthenticatedUser, async (req, res) => {
  const rows = await adminRest(
    `inventory_items?select=*&user_id=eq.${encodeURIComponent(req.identity.profileId)}&order=created_at.desc`,
  )
  res.json({ ok: true, items: Array.isArray(rows) ? rows : [] })
})

app.get('/api/withdrawals', requireAuthenticatedUser, async (req, res) => {
  const rows = await adminRest(
    `withdraws?select=*&user_id=eq.${encodeURIComponent(req.identity.profileId)}&canceled=eq.false&order=withdrawed_at.desc`,
  )
  res.json({ ok: true, withdrawals: Array.isArray(rows) ? rows : [] })
})

app.post('/api/withdrawals', express.json({ limit: '16kb' }), requireAuthenticatedUser, async (req, res) => {
  const itemIds = Array.isArray(req.body?.item_ids)
    ? [...new Set(req.body.item_ids.map(String).filter(isUuidLike))].slice(0, 100)
    : []
  if (!itemIds.length) {
    res.status(400).json({ ok: false, error: 'Select at least one item to withdraw.' })
    return
  }
  const profile = await loadProfileById(req.identity.profileId)
  const result = await callRainRpc('create_item_withdrawals', {
    p_owner_ids: [req.identity.profileId],
    p_user_name: profile?.username || 'user',
    p_item_uuids: itemIds,
  })
  res.json({ ok: true, data: result })
})

app.post('/api/withdrawals/cancel', express.json({ limit: '16kb' }), requireAuthenticatedUser, async (req, res) => {
  const withdrawalIds = Array.isArray(req.body?.withdrawal_ids)
    ? [...new Set(req.body.withdrawal_ids.map(String).filter(isUuidLike))].slice(0, 100)
    : []
  if (!withdrawalIds.length) {
    res.status(400).json({ ok: false, error: 'Select at least one withdrawal to cancel.' })
    return
  }
  const result = await callRainRpc('cancel_item_withdrawals', {
    p_profile_id: req.identity.profileId,
    p_withdrawal_uuids: withdrawalIds,
  })
  res.json({ ok: true, data: result })
})

app.post('/api/tips/coins', express.json({ limit: '16kb' }), requireAuthenticatedUser, async (req, res) => {
  const recipientId = String(req.body?.recipient_profile_id || '').trim()
  const amount = Number(req.body?.amount)
  if (!isUuidLike(recipientId) || !Number.isSafeInteger(amount) || amount <= 0) {
    res.status(400).json({ ok: false, error: 'Enter a valid recipient and coin amount.' })
    return
  }
  const [sender, recipient] = await Promise.all([
    loadProfileById(req.identity.profileId),
    loadProfileById(recipientId),
  ])
  const showInChat =
    Boolean(req.body?.show_in_chat) &&
    amount >= USER_COIN_TIP_CHAT_THRESHOLD
  const result = await callRainRpc('send_coin_tip', {
    p_sender_profile_id: req.identity.profileId,
    p_recipient_profile_id: recipientId,
    p_sender_roblox_id: sender?.roblox_id || req.identity.robloxId || '',
    p_recipient_roblox_id: recipient?.roblox_id || '',
    p_sender_username: sender?.username || 'user',
    p_recipient_username: recipient?.username || 'user',
    p_coin_amount: amount,
    p_show_in_chat: showInChat,
  })
  if (showInChat) {
    emitUserTipChat({
      tipId: result,
      tipType: 'coins',
      senderUsername: sender?.username,
      recipientUsername: recipient?.username,
      amount,
    })
  }
  await emitWalletRefreshes([req.identity.profileId, recipientId])
  const updatedSender = await loadProfileById(req.identity.profileId)
  res.json({ ok: true, tip_id: result, balance: Number(updatedSender?.balance || 0) })
})

app.post('/api/tips/items', express.json({ limit: '16kb' }), requireAuthenticatedUser, async (req, res) => {
  const recipientId = String(req.body?.recipient_profile_id || '').trim()
  const itemIds = Array.isArray(req.body?.item_ids)
    ? [...new Set(req.body.item_ids.map(String).filter(isUuidLike))].slice(0, 100)
    : []
  if (!isUuidLike(recipientId) || !itemIds.length) {
    res.status(400).json({ ok: false, error: 'Select a valid recipient and at least one item.' })
    return
  }
  const [sender, recipient] = await Promise.all([
    loadProfileById(req.identity.profileId),
    loadProfileById(recipientId),
  ])
  const result = await callRainRpc('send_item_tip', {
    p_sender_profile_id: req.identity.profileId,
    p_sender_owner_ids: [req.identity.profileId],
    p_recipient_profile_id: recipientId,
    p_sender_roblox_id: sender?.roblox_id || req.identity.robloxId || '',
    p_recipient_roblox_id: recipient?.roblox_id || '',
    p_sender_username: sender?.username || 'user',
    p_recipient_username: recipient?.username || 'user',
    p_item_uuids: itemIds,
    p_show_in_chat: false,
  })

  try {
    const tipRows = await adminRest(
      `tips?select=id,item_total_value,item_count&id=eq.${encodeURIComponent(String(result))}&limit=1`,
    )
    const tip = Array.isArray(tipRows) ? tipRows[0] : tipRows
    const totalValue = Number(tip?.item_total_value || 0)

    if (totalValue >= USER_ITEM_TIP_CHAT_THRESHOLD) {
      await adminRest(
        `tips?id=eq.${encodeURIComponent(String(result))}`,
        {
          method: 'PATCH',
          body: { show_in_chat: true },
        },
      )
      emitUserTipChat({
        tipId: result,
        tipType: 'items',
        senderUsername: sender?.username,
        recipientUsername: recipient?.username,
        amount: totalValue,
        itemCount: tip?.item_count,
      })
    }
  } catch (error) {
    console.warn('[api/tips/items] failed to publish tip notification', error)
  }

  await emitWalletRefreshes([req.identity.profileId, recipientId])
  res.json({ ok: true, tip_id: result })
})

app.post('/api/exchange', express.json({ limit: '16kb' }), requireAuthenticatedUser, async (req, res) => {
  const mode = req.body?.mode === 'coins_to_items' ? 'coins_to_items' : 'items_to_coins'
  const itemIds = Array.isArray(req.body?.item_ids)
    ? [...new Set(req.body.item_ids.map(String).filter(isUuidLike))].slice(0, 100)
    : []
  if (!itemIds.length) {
    res.status(400).json({ ok: false, error: 'Select at least one item to exchange.' })
    return
  }
  const result = await callRainRpc('exchange_items_atomic', {
    p_profile_id: req.identity.profileId,
    p_mode: mode,
    p_item_uuids: itemIds,
  })
  res.json({ ok: true, ...result })
})

app.post('/api/giveaways', express.json({ limit: '24kb' }), requireAuthenticatedUser, async (req, res) => {
  const itemIds = Array.isArray(req.body?.item_ids)
    ? [...new Set(req.body.item_ids.map(String).filter(isUuidLike))].slice(0, 100)
    : []
  const durationMinutes = Math.max(1, Math.min(30, Math.round(Number(req.body?.duration_minutes) || 15)))
  const levelRequirement = Math.max(0, Math.min(200, Math.round(Number(req.body?.level_requirement) || 0)))
  if (!itemIds.length) {
    res.status(400).json({ ok: false, error: 'Select at least one giveaway item.' })
    return
  }
  const result = await callRainRpc('create_giveaway_atomic', {
    p_profile_id: req.identity.profileId,
    p_item_uuids: itemIds,
    p_duration_minutes: durationMinutes,
    p_level_requirement: levelRequirement,
  })
  res.json({ ok: true, giveaway: result })
})

app.get('/api/summer-event', async (req, res) => {
  const eventId = 'summer_event_main'
  let events = await adminRest(`summer_event?select=*&id=eq.${eventId}&limit=1`)
  let event = Array.isArray(events) ? events[0] || null : events
  if (!event) {
    const endsAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString()
    const inserted = await adminRest('summer_event?select=*', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: [{ id: eventId, total_tickets: 0, ends_at: endsAt }],
    })
    event = Array.isArray(inserted) ? inserted[0] || null : inserted
  }
  if (!event?.ends_at) {
    const endsAt = new Date(
      new Date(event?.created_at || Date.now()).getTime() + 10 * 24 * 60 * 60 * 1000,
    ).toISOString()
    await adminRest(`summer_event?id=eq.${eventId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: { ends_at: endsAt },
    })
    event = { ...event, ends_at: endsAt }
  }
  const ticketRows = await adminRest('user_profiles?select=summer_tickets')
  const leaderboard = await adminRest(
    'user_profiles?select=id,username,avatar_url,avatar_headshot_url,summer_tickets&summer_tickets=gt.0&order=summer_tickets.desc&limit=10',
  )
  const totalTickets = Array.isArray(ticketRows)
    ? ticketRows.reduce((sum, row) => sum + Number(row.summer_tickets || 0), 0)
    : Number(event?.total_tickets || 0)
  res.json({ ok: true, event: { ...event, total_tickets: totalTickets }, leaderboard: leaderboard || [] })
})

app.get('/api/sessions', requireAuthenticatedUser, async (req, res) => {
  const currentLocation = getClientLocation(req)
  if (currentLocation && req.identity.sessionId) {
    await adminRest(
      `user_sessions?id=eq.${encodeURIComponent(req.identity.sessionId)}&user_id=eq.${encodeURIComponent(req.identity.profileId)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: { location: currentLocation, updated_at: new Date().toISOString() },
      },
    )
  }
  const sessions = await adminRest(
    `user_sessions?select=*&user_id=eq.${encodeURIComponent(req.identity.profileId)}&order=updated_at.desc`,
  )
  const normalizedSessions = Array.isArray(sessions)
    ? sessions.map((session) => ({
        ...session,
        is_current: session.id === req.identity.sessionId,
        current: session.id === req.identity.sessionId,
      }))
    : []
  res.json({ ok: true, sessions: normalizedSessions })
})

app.delete('/api/sessions/:sessionId', requireAuthenticatedUser, async (req, res) => {
  const sessionId = String(req.params.sessionId || '').trim()
  await adminRest(
    `user_sessions?id=eq.${encodeURIComponent(sessionId)}&user_id=eq.${encodeURIComponent(req.identity.profileId)}`,
    { method: 'DELETE' },
  )
  if (sessionId === req.identity.sessionId) clearSessionCookie(res)
  res.json({ ok: true })
})

app.post('/api/sessions/logout-others', requireAuthenticatedUser, async (req, res) => {
  const keepFilter = req.identity.sessionId ? `&id=neq.${encodeURIComponent(req.identity.sessionId)}` : ''
  await adminRest(
    `user_sessions?user_id=eq.${encodeURIComponent(req.identity.profileId)}${keepFilter}`,
    { method: 'DELETE' },
  )
  res.json({ ok: true })
})

app.post('/api/auth/login-webhook', requireAuthenticatedUser, express.json({ limit: '8kb' }), async (req, res) => {
  const profile = await loadProfileById(req.identity.profileId)
  if (!profile) {
    res.status(404).json({ ok: false, error: 'Profile not found.' })
    return
  }
  const inventory = await adminRest(
    `inventory_items?select=value&user_id=eq.${encodeURIComponent(req.identity.profileId)}`,
  )
  const totalValue = Number(profile.balance || 0) +
    (Array.isArray(inventory) ? inventory.reduce((sum, item) => sum + Number(item.value || 0), 0) : 0)
  const result = await sendLoginWebhook({
    username: profile.username || 'Unknown',
    avatar_url: profile.avatar_url || profile.avatar_headshot_url || null,
    avatar_headshot_url: profile.avatar_headshot_url || profile.avatar_url || null,
    discord_linked: Boolean(profile.discord_linked),
    discord_mention: profile.discord_mention || null,
    discord_username: profile.discord_username || null,
    discord_user_id: profile.discord_user_id || null,
    total_value: totalValue,
  })

  res.json(result)
})

app.post('/api/rain/join', express.json({ limit: '24kb' }), requireAuthenticatedUser, async (req, res) => {
  const ipAddress = getRequestIp(req)
  if (isRainJoinRateLimited(ipAddress)) {
    res.status(429).json({ ok: false, error: 'Too many join attempts. Please wait a moment.' })
    return
  }

  if (rainSeconds <= 0 || rainSeconds > RAIN_JOIN_WINDOW_SECONDS) {
    res.status(409).json({ ok: false, error: 'The rain is not accepting entries right now.' })
    return
  }

  const profileId = req.identity.profileId

  const verification = await verifyCaptchaToken(req.body?.captcha_token, ipAddress)
  if (!verification.ok) {
    res.status(verification.status).json({ ok: false, error: verification.error })
    return
  }

  try {
    const baseJoinPayload = {
      p_state_id: activeRainId,
      p_profile_id: profileId,
      p_join_window_seconds: RAIN_JOIN_WINDOW_SECONDS,
    }
    let result

    try {
      result = await callRainRpc('join_rain', {
        ...baseJoinPayload,
        p_roblox_id: req.identity.robloxId || null,
      })
    } catch (error) {
      if (!isMissingRainRpcSignature(error, 'join_rain')) throw error
      result = await callRainRpc('join_rain', baseJoinPayload)
    }

    const participant = result?.participant

    if (result?.joined && participant) {
      rainUserCount += 1
      void syncActiveRainDiscordLog()
    }

    res.json({
      ok: true,
      joined: Boolean(result?.joined),
      already_joined: Boolean(result?.already_joined),
      participant: participant || null,
    })
  } catch (error) {
    const message = error?.message || 'Unable to join the rain.'
    const status = /not accepting|signed in|profile could not/i.test(message) ? 409 : 500
    res.status(status).json({ ok: false, error: message })
  }
})

app.post('/api/rain/tip', express.json({ limit: '8kb' }), requireAuthenticatedUser, async (req, res) => {
  try {
    const result = await processRainTip({
      profileId: req.identity.profileId,
      username: null,
      amount: Number(req.body?.amount),
    })
    res.json({ ok: true, ...result })
  } catch (error) {
    const message = error?.message || 'Unable to tip the rain.'
    const expectedError = /balance|funds|amount|signed in|profile|active rain/i.test(message)
    res.status(expectedError ? 400 : 500).json({ ok: false, error: message })
  }
})

app.post('/api/promocode/redeem', express.json({ limit: '24kb' }), requireAuthenticatedUser, async (req, res) => {
  const ipAddress = getRequestIp(req)
  const profileId = req.identity.profileId
  const code = String(req.body?.code || '').trim()

  if (!code) {
    res.status(400).json({ ok: false, error: 'Enter a promocode first.' })
    return
  }

  const verification = await verifyCaptchaToken(req.body?.captcha_token, ipAddress)
  if (!verification.ok) {
    res.status(verification.status).json({ ok: false, error: verification.error })
    return
  }

  try {
    const result = await callRainRpc('redeem_promocode', {
      p_code: code.toUpperCase(),
      p_profile_id: profileId,
    })
    res.json({ ok: true, ...result })
  } catch (error) {
    const message = error?.message || 'Failed to redeem code.'
    const expectedError = /promocode|code|level|profile|sign in|redeemed|remaining uses|reward item/i.test(message)
    if (expectedError) {
      console.warn(`[api/promocode/redeem] ${message}`)
    } else {
      console.error('[api/promocode/redeem] error', error)
    }
    res.status(expectedError ? 400 : 500).json({ ok: false, error: message })
  }
})

function getCoinflipSeedEncryptionKey(supabaseKey) {
  const jwtKey = getJwtGameSeedEncryptionKey('coinflip')
  if (jwtKey) return jwtKey
  throw new Error('JWT_SECRET is required for Coinflip fairness.')
}

function getCoinflipSeedDecryptionKeys(supabaseKey) {
  return uniqueEncryptionKeys([
    getJwtGameSeedEncryptionKey('coinflip'),
    ...uniqueSecrets([process.env.COINFLIP_SEED_SECRET, supabaseKey])
      .map((secret) => crypto.createHash('sha256').update(secret).digest()),
  ])
}

function getCaseOpenSeedEncryptionKey() {
  const jwtKey = getJwtGameSeedEncryptionKey('cases')
  if (jwtKey) return jwtKey
  throw new Error('JWT_SECRET is required for case fairness.')
}

function getCaseOpenSeedDecryptionKeys() {
  return uniqueEncryptionKeys([
    getJwtGameSeedEncryptionKey('cases'),
    ...uniqueSecrets([process.env.CASE_OPEN_SEED_SECRET])
      .map((secret) => crypto.createHash('sha256').update(secret).digest()),
  ])
}

function encryptCaseServerSeed(serverSeed) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getCaseOpenSeedEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(serverSeed, 'utf8'), cipher.final()])
  return `${iv.toString('hex')}.${cipher.getAuthTag().toString('hex')}.${encrypted.toString('hex')}`
}

function decryptCaseServerSeed(encryptedSeed) {
  return decryptAesGcmWithKeys(
    encryptedSeed,
    getCaseOpenSeedDecryptionKeys(),
    'invalid encrypted case server seed',
    'Unable to decrypt the case server seed. Keep the previous CASE_OPEN_SEED_SECRET during migration.',
  )
}

function createCaseFairnessSeed() {
  const serverSeed = crypto.randomBytes(32).toString('hex')
  return {
    seedId: crypto.randomUUID(),
    serverSeed,
    serverSeedHash: crypto.createHash('sha256').update(serverSeed).digest('hex'),
    serverSeedEncrypted: encryptCaseServerSeed(serverSeed),
  }
}

function createCaseClientSeed() {
  return crypto.randomBytes(9).toString('base64url').toUpperCase().slice(0, 12)
}

function getCaseRoll(serverSeed, clientSeed, nonce, caseId) {
  const digest = crypto
    .createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}:${caseId}`)
    .digest('hex')
  const fraction = Number.parseInt(digest.slice(0, 13), 16) / 0x10000000000000
  return Math.min(99_999, Math.floor(fraction * 100_000))
}

const CASE_BATTLE_PLAYER_OPTIONS = new Map([
  ['ffa-2', 2],
  ['ffa-3', 3],
  ['ffa-4', 4],
  ['team-4', 4],
  ['team-6', 6],
  ['team-6-2v2v2', 6],
])
const CASE_BATTLE_MODES = new Set(['normal', 'terminal', 'wild'])

function getCaseBattleTeamCount(playerOption) {
  return String(playerOption) === 'team-6-2v2v2' ? 3 : 2
}

function normalizeCaseBattleModes(value) {
  const requested = Array.isArray(value) ? value : String(value || 'normal').split('_')
  const modes = [...new Set(requested.map((mode) => String(mode || '').trim().toLowerCase()).filter(Boolean))]
  if (modes.length < 1 || modes.length > 3 || modes.some((mode) => !CASE_BATTLE_MODES.has(mode))) {
    throw new Error('Select valid Case Battle modes.')
  }
  if (modes.includes('normal') && modes.length !== 1) {
    throw new Error('This Case Battle mode cannot be combined with another mode.')
  }
  return modes
}

function getCaseBattleAvatar(profile) {
  return String(profile?.avatar_headshot_url || profile?.avatar_url || '').trim() || null
}

function stampCaseBattleServerTime(battle) {
  return battle ? { ...battle, server_now: new Date().toISOString() } : battle
}

async function enrichCaseBattleProfiles(value) {
  const battles = (Array.isArray(value) ? value : [value]).filter(Boolean)
  const serverNow = new Date().toISOString()
  const profileIds = [...new Set(battles.flatMap((battle) => (
    (Array.isArray(battle?.players) ? battle.players : [])
      .filter((player) => player?.profile_type !== 'bot')
      .map((player) => String(player?.profile_id || '').trim())
      .filter(isUuidLike)
  )))]
  if (!profileIds.length) {
    const stampedBattles = battles.map((battle) => ({ ...battle, server_now: serverNow }))
    return Array.isArray(value) ? stampedBattles : stampedBattles[0] || null
  }

  const chunks = []
  for (let index = 0; index < profileIds.length; index += 50) chunks.push(profileIds.slice(index, index + 50))
  const profileGroups = await Promise.all(chunks.map((ids) => adminRest(
    `user_profiles?select=id,username,avatar_url,avatar_headshot_url,role,level,played,won,lost&id=in.(${ids.join(',')})`,
  )))
  const profilesById = new Map(profileGroups.flat().map((profile) => [String(profile.id), profile]))
  const enriched = battles.map((battle) => ({
    ...battle,
    server_now: serverNow,
    players: (Array.isArray(battle.players) ? battle.players : []).map((player) => {
      if (player?.profile_type === 'bot') return player
      const profile = profilesById.get(String(player?.profile_id || ''))
      if (!profile) return player
      return {
        ...player,
        username: profile.username || player.username,
        avatar_url: profile.avatar_url || player.avatar_url || null,
        avatar_headshot_url: profile.avatar_headshot_url || profile.avatar_url || player.avatar_headshot_url || player.avatar_url || null,
        role: profile.role || null,
        level: Number(profile.level) || 1,
        played: Number(profile.played) || 0,
        won: Number(profile.won) || 0,
        lost: Number(profile.lost) || 0,
      }
    }),
  }))
  return Array.isArray(value) ? enriched : enriched[0] || null
}

function getCaseBattleSeedEncryptionKey() {
  const jwtKey = getJwtGameSeedEncryptionKey('case-battles')
  if (jwtKey) return jwtKey
  throw new Error('JWT_SECRET is required for Case Battle fairness.')
}

function getCaseBattleSeedDecryptionKeys() {
  const { supabaseKey } = getSupabaseAdminConfig()
  return uniqueEncryptionKeys([
    getJwtGameSeedEncryptionKey('case-battles'),
    ...uniqueSecrets([process.env.CASE_BATTLE_SEED_SECRET, process.env.CASE_OPEN_SEED_SECRET, supabaseKey])
      .map((secret) => crypto.createHash('sha256').update(secret).digest()),
  ])
}

function encryptCaseBattleServerSeed(serverSeed) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getCaseBattleSeedEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(serverSeed, 'utf8'), cipher.final()])
  return `${iv.toString('hex')}.${cipher.getAuthTag().toString('hex')}.${encrypted.toString('hex')}`
}

function decryptCaseBattleServerSeed(encryptedSeed) {
  return decryptAesGcmWithKeys(
    encryptedSeed,
    getCaseBattleSeedDecryptionKeys(),
    'Invalid Case Battle server seed.',
    'Unable to decrypt the Case Battle server seed. Keep the previous game secret during migration.',
  )
}

const CASE_BATTLE_ANIMATION_BASE_MS = 3_000
const CASE_BATTLE_ROUND_MS = 6_250
const CASE_BATTLE_FAST_ROUND_MS = 1_990
const CASE_BATTLE_START_BUFFER_MS = 1_000
const caseBattleSettlementTimers = new Map()

function caseBattleRandomFraction(serverSeed, clientSeed, nonce, battleId, roundIndex, slotIndex, purpose = 'item') {
  const digest = crypto.createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}:${battleId}:${roundIndex}:${slotIndex}:${purpose}`)
    .digest('hex')
  return Number.parseInt(digest.slice(0, 13), 16) / 0x10000000000000
}

function pickCaseBattleItem(caseRow, fraction) {
  const items = Array.isArray(caseRow?.items) ? caseRow.items : []
  if (!items.length) throw new Error(`Case ${caseRow?.name || ''} has no configured drops.`)
  const weights = items.map((item) => Math.max(0, Number(item?.chance || 0)))
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let cursor = fraction * (total > 0 ? total : items.length)
  let selected = items[items.length - 1]
  for (let index = 0; index < items.length; index += 1) {
    cursor -= total > 0 ? weights[index] : 1
    if (cursor <= 0) { selected = items[index]; break }
  }
  return {
    item_id: selected.item_id || selected.id || null,
    name: String(selected.name || 'Unknown Item'),
    image_url: String(selected.image_url || selected.image || ''),
    value: Math.max(0, Math.round(Number(selected.value || 0))),
    chance: Number(selected.chance || 0),
  }
}

function resolveCaseBattleOutcome(battle, serverSeed) {
  const players = Array.isArray(battle.players) ? battle.players : []
  const cases = Array.isArray(battle.cases) ? battle.cases : []
  const results = players.map((_, slotIndex) => cases.map((caseRow, roundIndex) => pickCaseBattleItem(
    caseRow,
    caseBattleRandomFraction(serverSeed, battle.client_seed, battle.nonce, battle.id, roundIndex, slotIndex),
  )))
  const totals = results.map((items) => items.reduce((sum, item) => sum + Number(item.value || 0), 0))
  const modes = Array.isArray(battle.modes) ? battle.modes : ['normal']
  const wild = modes.includes('wild')
  const terminal = modes.includes('terminal')
  const totalPot = totals.reduce((sum, value) => sum + value, 0)
  let winnerIndexes = []

  if (String(battle.player_option).startsWith('group-') || modes.includes('group')) {
    winnerIndexes = players.map((_, index) => index)
  } else if (modes.includes('coinflip')) {
    winnerIndexes = [Math.min(players.length - 1, Math.floor(caseBattleRandomFraction(serverSeed, battle.client_seed, battle.nonce, battle.id, 0, 0, 'winner') * players.length))]
  } else if (modes.includes('jackpot')) {
    const weightTotal = totals.reduce((sum, value) => sum + Math.max(0, value), 0)
    let cursor = caseBattleRandomFraction(serverSeed, battle.client_seed, battle.nonce, battle.id, 0, 0, 'winner') * (weightTotal || players.length)
    let winnerIndex = players.length - 1
    for (let index = 0; index < players.length; index += 1) {
      cursor -= weightTotal ? Math.max(0, totals[index]) : 1
      if (cursor <= 0) { winnerIndex = index; break }
    }
    winnerIndexes = [winnerIndex]
  } else if (String(battle.player_option).startsWith('team-')) {
    const score = (index) => terminal ? Number(results[index]?.at(-1)?.value || 0) : totals[index]
    const teamCount = getCaseBattleTeamCount(battle.player_option)
    const teamSize = players.length / teamCount
    const teamTotals = Array.from({ length: teamCount }, (_, teamIndex) => (
      players
        .slice(teamIndex * teamSize, (teamIndex + 1) * teamSize)
        .reduce((sum, _, index) => sum + score(teamIndex * teamSize + index), 0)
    ))
    const winningValue = wild ? Math.min(...teamTotals) : Math.max(...teamTotals)
    const winningTeams = teamTotals
      .map((value, index) => value === winningValue ? index : -1)
      .filter((index) => index >= 0)
    winnerIndexes = winningTeams.flatMap((teamIndex) => (
      Array.from({ length: teamSize }, (_, index) => teamIndex * teamSize + index)
    ))
  } else {
    const scores = terminal ? results.map((items) => Number(items.at(-1)?.value || 0)) : totals
    const winningValue = wild ? Math.min(...scores) : Math.max(...scores)
    winnerIndexes = scores.map((value, index) => value === winningValue ? index : -1).filter((index) => index >= 0)
  }

  const winnerProfiles = winnerIndexes.map((index) => players[index]).filter(Boolean)
  const baseShare = winnerProfiles.length ? Math.floor(totalPot / winnerProfiles.length) : 0
  let remainder = totalPot - baseShare * winnerProfiles.length
  const payouts = winnerProfiles.map((player) => ({
    profile_id: String(player.profile_id),
    amount: baseShare + (remainder-- > 0 ? 1 : 0),
  }))
  return { results, winnerIndexes, winnerProfiles, payouts, totalPot }
}

async function settleCaseBattle(battleId) {
  caseBattleSettlementTimers.delete(String(battleId))
  const rows = await adminRest(`case_battle_games?select=*&id=eq.${encodeURIComponent(battleId)}&limit=1`)
  const battle = Array.isArray(rows) ? rows[0] : rows
  if (!battle || battle.status !== 'active') return battle
  const secretRows = await adminRest(`case_battle_fairness_secrets?select=server_seed_encrypted&battle_id=eq.${encodeURIComponent(battleId)}&limit=1`)
  const secret = Array.isArray(secretRows) ? secretRows[0] : secretRows
  const serverSeed = decryptCaseBattleServerSeed(secret?.server_seed_encrypted)
  if (crypto.createHash('sha256').update(serverSeed).digest('hex') !== battle.server_seed_hash) {
    throw new Error('Case Battle seed commitment is invalid.')
  }
  const result = await callRainRpc('settle_case_battle_game', { p_battle_id: battleId, p_server_seed: serverSeed })
  const resolved = result?.battle
  if (resolved) io.emit('case-battle:updated', resolved)
  const profileIds = (result?.settlements || []).map((entry) => String(entry.profile_id))
  void emitWalletRefreshes(profileIds)
  return resolved
}

function scheduleCaseBattleSettlement(battle, retryAttempt = 0) {
  const battleId = String(battle?.id || '')
  if (!battleId || battle.status !== 'active' || !battle.settle_at) return
  const existing = caseBattleSettlementTimers.get(battleId)
  if (existing) clearTimeout(existing)
  const delay = Math.max(0, new Date(battle.settle_at).getTime() - Date.now())
  const timer = setTimeout(() => void settleCaseBattle(battleId).catch((error) => {
    console.error('[case-battles] settlement error', error)
    // The Node and database clocks can differ slightly, and transient REST/RPC
    // failures must not leave a paid battle permanently active and unpaid.
    if (retryAttempt >= 29) return
    scheduleCaseBattleSettlement({
      id: battleId,
      status: 'active',
      settle_at: new Date(Date.now() + 1_000).toISOString(),
    }, retryAttempt + 1)
  }), delay)
  caseBattleSettlementTimers.set(battleId, timer)
}

async function startCaseBattle(battle) {
  if (!battle || !['waiting', 'ready'].includes(battle.status) || Number(battle.player_count) < Number(battle.max_players)) return battle
  const secretRows = await adminRest(`case_battle_fairness_secrets?select=server_seed_encrypted&battle_id=eq.${encodeURIComponent(battle.id)}&limit=1`)
  const secret = Array.isArray(secretRows) ? secretRows[0] : secretRows
  const serverSeed = decryptCaseBattleServerSeed(secret?.server_seed_encrypted)
  const outcome = resolveCaseBattleOutcome(battle, serverSeed)
  // Give the active-row update and realtime delivery time to reach every
  // viewer before the shared countdown begins. This is especially important
  // for fast-spin battles where one remote database round trip can otherwise
  // consume most of the first round.
  const startedAt = new Date(Date.now() + CASE_BATTLE_START_BUFFER_MS)
  const roundDuration = battle.gold_spin ? CASE_BATTLE_FAST_ROUND_MS : CASE_BATTLE_ROUND_MS
  const settleAt = new Date(startedAt.getTime() + CASE_BATTLE_ANIMATION_BASE_MS + Number(battle.case_count) * roundDuration)
  const updatedRows = await adminRest(`case_battle_games?id=eq.${encodeURIComponent(battle.id)}&status=in.(waiting,ready)`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: {
      status: 'active', results: outcome.results,
      winner_profile_id: outcome.winnerProfiles[0]?.profile_id || null,
      winner_profile_ids: outcome.winnerProfiles.map((player) => String(player.profile_id)),
      payouts: outcome.payouts, payout_value: outcome.totalPot,
      started_at: startedAt.toISOString(), settle_at: settleAt.toISOString(), updated_at: startedAt.toISOString(),
    },
  })
  const updated = Array.isArray(updatedRows) ? updatedRows[0] : updatedRows
  if (updated) {
    io.emit('case-battle:updated', updated)
    scheduleCaseBattleSettlement(updated)
  }
  return updated || battle
}

async function initializeCaseBattles() {
  try {
    const rows = await adminRest('case_battle_games?select=*&status=in.(ready,active)&order=created_at.asc')
    for (const battle of Array.isArray(rows) ? rows : []) {
      if (battle.status === 'active') scheduleCaseBattleSettlement(battle)
      else if (Number(battle.player_count) >= Number(battle.max_players)) await startCaseBattle(battle)
    }
  } catch (error) {
    console.warn('[case-battles] initialisation skipped', error?.message || error)
  }
}

app.get('/api/case-battles', async (_req, res) => {
  try {
    const rows = await adminRest(
      'case_battle_games?select=*&status=in.(waiting,ready,active,resolved)&order=created_at.desc&limit=50',
    )
    const battles = await enrichCaseBattleProfiles(Array.isArray(rows) ? rows : [])
    res.json({ ok: true, battles })
  } catch (error) {
    console.error('[api/case-battles] list error', error)
    res.status(500).json({ ok: false, error: error?.message || 'Unable to load Case Battles.' })
  }
})

app.get('/api/case-battles/:battleId', async (req, res) => {
  const battleId = String(req.params?.battleId || '').trim()
  if (!isUuidLike(battleId)) {
    res.status(400).json({ ok: false, error: 'The Case Battle ID is invalid.' })
    return
  }
  try {
    const rows = await adminRest(
      `case_battle_games?select=*&id=eq.${encodeURIComponent(battleId)}&limit=1`,
    )
    const battle = Array.isArray(rows) ? rows[0] || null : rows
    if (!battle) {
      res.status(404).json({ ok: false, error: 'This Case Battle could not be found.' })
      return
    }
    res.json({ ok: true, battle: await enrichCaseBattleProfiles(battle) })
  } catch (error) {
    console.error('[api/case-battles] view error', error)
    res.status(500).json({ ok: false, error: error?.message || 'Unable to load this Case Battle.' })
  }
})

app.post('/api/case-battles', express.json({ limit: '64kb' }), requireAuthenticatedUser, async (req, res) => {
  const requestId = String(req.body?.request_id || '').trim()
  const playerOption = String(req.body?.player_option || '').trim()
  const caseIds = Array.isArray(req.body?.case_ids) ? req.body.case_ids.map((id) => String(id || '').trim()) : []
  const fastSpin = req.body?.fast_spin === true
  const maxPlayers = CASE_BATTLE_PLAYER_OPTIONS.get(playerOption)

  if (!isUuidLike(requestId) || !maxPlayers || caseIds.length < 1 || caseIds.length > 25 || caseIds.some((id) => !isUuidLike(id))) {
    res.status(400).json({ ok: false, error: 'Select between 1 and 25 valid cases and a valid player layout.' })
    return
  }

  try {
    const modes = normalizeCaseBattleModes(req.body?.modes ?? req.body?.mode)
    const profileId = String(req.identity.profileId)
    const existingRows = await adminRest(
      `case_battle_games?select=*&idempotency_key=eq.${encodeURIComponent(requestId)}&creator_profile_id=eq.${encodeURIComponent(profileId)}&limit=1`,
    )
    const existingBattle = Array.isArray(existingRows) ? existingRows[0] || null : existingRows
    if (existingBattle) {
      res.json({ ok: true, battle: existingBattle, replayed: true })
      return
    }

    const uniqueCaseIds = [...new Set(caseIds)]
    const caseRows = await adminRest(
      `cases?select=uuid,name,price,image_url,items,community,active&uuid=in.(${uniqueCaseIds.join(',')})&active=eq.true`,
    )
    const casesById = new Map((Array.isArray(caseRows) ? caseRows : []).map((row) => [String(row.uuid), row]))
    const caseSnapshots = caseIds.map((caseId) => casesById.get(caseId))
    if (caseSnapshots.some((caseRow) => !caseRow)) {
      res.status(400).json({ ok: false, error: 'One or more selected cases are no longer available.' })
      return
    }

    const profile = await loadProfileById(profileId)
    if (!profile) {
      res.status(404).json({ ok: false, error: 'Your profile could not be found.' })
      return
    }

    const createdAt = new Date().toISOString()
    const serverSeed = crypto.randomBytes(32).toString('hex')
    const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex')
    const normalizedCases = caseSnapshots.map((caseRow) => ({
      uuid: caseRow.uuid,
      name: caseRow.name,
      price: Number(caseRow.price || 0),
      image_url: String(caseRow.image_url || '').trim(),
      items: Array.isArray(caseRow.items) ? caseRow.items : [],
      community: Boolean(caseRow.community),
    }))
    const creator = {
      slot_index: 0,
      profile_type: 'user',
      profile_id: profileId,
      username: String(profile.username || 'user'),
      avatar_url: String(profile.avatar_url || '').trim() || null,
      avatar_headshot_url: String(profile.avatar_headshot_url || '').trim() || null,
      role: profile.role || null,
      level: Number(profile.level) || 1,
      played: Number(profile.played) || 0,
      won: Number(profile.won) || 0,
      lost: Number(profile.lost) || 0,
      joined_at: createdAt,
    }
    const result = await callRainRpc('create_case_battle_game', {
      p_idempotency_key: requestId,
      p_profile_id: profileId,
      p_player_option: playerOption,
      p_max_players: maxPlayers,
      p_modes: modes,
      p_cases: normalizedCases,
      p_cost_per_player: normalizedCases.reduce((sum, caseRow) => sum + Number(caseRow.price || 0), 0),
      p_creator: creator,
      p_server_seed_hash: serverSeedHash,
      p_server_seed_encrypted: encryptCaseBattleServerSeed(serverSeed),
      p_client_seed: createCaseClientSeed(),
    })
    let battle = result?.battle || null
    if (!battle) throw new Error('The Case Battle was not returned after creation.')
    if (Boolean(battle.gold_spin) !== fastSpin) {
      const updatedRows = await adminRest(`case_battle_games?id=eq.${encodeURIComponent(battle.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: { gold_spin: fastSpin },
      })
      battle = Array.isArray(updatedRows) ? updatedRows[0] || battle : updatedRows || battle
    }
    io.emit('case-battle:created', battle)
    void emitWalletRefreshes([profileId])
    res.status(result?.replayed ? 200 : 201).json({ ok: true, battle: stampCaseBattleServerTime(battle), balance: result?.balance, replayed: Boolean(result?.replayed) })
  } catch (error) {
    const message = error?.message || 'Unable to create this Case Battle.'
    const expected = /select|case|mode|profile|available|balance|cost/i.test(message)
    console.warn('[api/case-battles] create error', message)
    res.status(expected ? 400 : 500).json({ ok: false, error: message })
  }
})

app.post('/api/case-battles/:battleId/call-bot', express.json({ limit: '8kb' }), requireAuthenticatedUser, async (req, res) => {
  const battleId = String(req.params?.battleId || '').trim()
  if (!isUuidLike(battleId)) {
    res.status(400).json({ ok: false, error: 'The Case Battle ID is invalid.' })
    return
  }

  try {
    const rows = await adminRest(`case_battle_games?select=*&id=eq.${encodeURIComponent(battleId)}&limit=1`)
    const battle = Array.isArray(rows) ? rows[0] || null : rows
    if (!battle) {
      res.status(404).json({ ok: false, error: 'This Case Battle could not be found.' })
      return
    }
    if (String(battle.creator_profile_id) !== String(req.identity.profileId)) {
      res.status(403).json({ ok: false, error: 'Only the battle creator can call a bot.' })
      return
    }
    if (battle.status !== 'waiting' || Number(battle.player_count) >= Number(battle.max_players)) {
      res.status(409).json({ ok: false, error: 'This Case Battle is no longer waiting for a bot.' })
      return
    }

    const players = Array.isArray(battle.players) ? battle.players : []
    const usedBotIds = new Set(players.filter((player) => player?.profile_type === 'bot').map((player) => String(player.profile_id)))
    const botRows = await adminRest('bot_profiles?select=*&order=username.asc')
    const availableBots = (Array.isArray(botRows) ? botRows : []).filter((bot) => !usedBotIds.has(String(bot.id)))
    if (!availableBots.length) {
      res.status(409).json({ ok: false, error: 'No bot profile is currently available.' })
      return
    }

    const requestedSlot = Number(req.body?.slot_index)
    const occupiedSlots = new Set(players.map((player) => Number(player?.slot_index)))
    const firstOpenSlot = Array.from({ length: Number(battle.max_players) }, (_, index) => index)
      .find((index) => !occupiedSlots.has(index))
    const slotIndex = Number.isInteger(requestedSlot) && requestedSlot > 0 && requestedSlot < Number(battle.max_players) && !occupiedSlots.has(requestedSlot)
      ? requestedSlot
      : firstOpenSlot
    if (!Number.isInteger(slotIndex)) {
      res.status(409).json({ ok: false, error: 'This Case Battle has no open player slot.' })
      return
    }

    const requestedBotId = String(req.body?.bot_profile_id || '').trim()
    const bot = (requestedBotId
      ? availableBots.find((candidate) => String(candidate.id) === requestedBotId)
      : null) || availableBots[Math.floor(Math.random() * availableBots.length)]
    const updatedPlayers = players.concat({
      slot_index: slotIndex,
      profile_type: 'bot',
      profile_id: String(bot.id),
      username: String(bot.username || 'Bot'),
      avatar_url: String(bot.avatar_url || '').trim() || null,
      avatar_headshot_url: String(bot.avatar_headshot_url || '').trim() || null,
      joined_at: new Date().toISOString(),
    })
    const nextCount = updatedPlayers.length
    const updatedRows = await adminRest(
      `case_battle_games?id=eq.${encodeURIComponent(battleId)}&status=eq.waiting&player_count=eq.${Number(battle.player_count)}`,
      {
        method: 'PATCH',
        body: {
          players: updatedPlayers,
          player_count: nextCount,
          status: nextCount >= Number(battle.max_players) ? 'ready' : 'waiting',
          updated_at: new Date().toISOString(),
        },
        headers: { Prefer: 'return=representation' },
      },
    )
    const updatedBattle = Array.isArray(updatedRows) ? updatedRows[0] || null : updatedRows
    if (!updatedBattle) {
      res.status(409).json({ ok: false, error: 'The Case Battle changed while the bot was joining.' })
      return
    }
    const responseBattle = nextCount >= Number(battle.max_players)
      ? await startCaseBattle(updatedBattle)
      : updatedBattle
    if (responseBattle === updatedBattle) io.emit('case-battle:updated', updatedBattle)
    res.json({ ok: true, battle: stampCaseBattleServerTime(responseBattle) })
  } catch (error) {
    const message = error?.message || 'Unable to call a bot.'
    console.warn('[api/case-battles] call bot error', message)
    res.status(/creator/i.test(message) ? 403 : /waiting|open|available|changed/i.test(message) ? 409 : 500).json({ ok: false, error: message })
  }
})

app.post('/api/case-battles/:battleId/join', express.json({ limit: '8kb' }), requireAuthenticatedUser, async (req, res) => {
  const battleId = String(req.params?.battleId || '').trim()
  const slotIndex = Number(req.body?.slot_index)
  if (!isUuidLike(battleId) || !Number.isInteger(slotIndex) || slotIndex < 1 || slotIndex > 5) {
    res.status(400).json({ ok: false, error: 'The Case Battle or player slot is invalid.' })
    return
  }

  try {
    const profileId = String(req.identity.profileId)
    const profile = await loadProfileById(profileId)
    if (!profile) {
      res.status(404).json({ ok: false, error: 'Your profile could not be found.' })
      return
    }
    const result = await callRainRpc('join_case_battle_game', {
      p_battle_id: battleId,
      p_profile_id: profileId,
      p_slot_index: slotIndex,
      p_player: {
        username: String(profile.username || 'Player'),
        avatar_url: String(profile.avatar_url || '').trim() || null,
        avatar_headshot_url: String(profile.avatar_headshot_url || '').trim() || null,
        role: profile.role || null,
        level: Number(profile.level) || 1,
        played: Number(profile.played) || 0,
        won: Number(profile.won) || 0,
        lost: Number(profile.lost) || 0,
      },
    })
    const joinedBattle = result?.battle || null
    if (!joinedBattle) throw new Error('The joined Case Battle was not returned.')
    const responseBattle = Number(joinedBattle.player_count) >= Number(joinedBattle.max_players)
      ? await startCaseBattle(joinedBattle)
      : joinedBattle
    if (responseBattle === joinedBattle) io.emit('case-battle:updated', joinedBattle)
    void emitWalletRefreshes([profileId])
    res.json({ ok: true, battle: stampCaseBattleServerTime(responseBattle), balance: result?.balance })
  } catch (error) {
    const missingJoinFunction = /join_case_battle_game.*schema cache|schema cache.*join_case_battle_game/i.test(error?.message || '')
    const message = missingJoinFunction
      ? 'Case Battle joining is not installed in Supabase yet. Run migration 20260810015000_add_case_battle_player_join.sql.'
      : error?.message || 'Unable to join this Case Battle.'
    console.warn('[api/case-battles] join error', message)
    const expected = /accepting|full|slot|already joined|balance|profile|not found/i.test(message)
    res.status(expected ? 409 : 500).json({ ok: false, error: message })
  }
})

app.post('/api/case-battles/:battleId/cancel', express.json({ limit: '8kb' }), requireAuthenticatedUser, async (req, res) => {
  const battleId = String(req.params?.battleId || '').trim()
  if (!isUuidLike(battleId)) {
    res.status(400).json({ ok: false, error: 'The Case Battle ID is invalid.' })
    return
  }
  try {
    const rows = await adminRest(`case_battle_games?select=id,creator_profile_id,status,player_count&id=eq.${encodeURIComponent(battleId)}&limit=1`)
    const currentBattle = Array.isArray(rows) ? rows[0] || null : rows
    if (
      !currentBattle
      || String(currentBattle.creator_profile_id) !== String(req.identity.profileId)
      || currentBattle.status !== 'waiting'
      || Number(currentBattle.player_count) !== 1
    ) {
      res.status(409).json({ ok: false, error: 'A Case Battle cannot be cancelled after another player or bot has joined.' })
      return
    }
    const result = await callRainRpc('cancel_case_battle_game', {
      p_battle_id: battleId,
      p_profile_id: String(req.identity.profileId),
    })
    const battle = result?.battle || null
    if (!battle) {
      res.status(409).json({ ok: false, error: 'This Case Battle cannot be cancelled.' })
      return
    }
    io.emit('case-battle:updated', battle)
    void emitWalletRefreshes([req.identity.profileId])
    res.json({ ok: true, battle: stampCaseBattleServerTime(battle), balance: result?.balance })
  } catch (error) {
    console.warn('[api/case-battles] cancel error', error?.message || error)
    const message = error?.message || 'Unable to cancel this Case Battle.'
    const expected = /cannot be cancelled|player|bot|joined|creator/i.test(message)
    res.status(expected ? 409 : 500).json({ ok: false, error: message })
  }
})

async function ensureCaseFairnessState(profileId) {
  const seed = createCaseFairnessSeed()
  return callRainRpc('ensure_case_fairness_state', {
    p_profile_id: profileId,
    p_seed_id: seed.seedId,
    p_server_seed_hash: seed.serverSeedHash,
    p_server_seed_encrypted: seed.serverSeedEncrypted,
    p_client_seed: createCaseClientSeed(),
  })
}

function validateCaseFairnessState(state) {
  const serverSeed = decryptCaseServerSeed(state?.server_seed_encrypted)
  const expectedHash = crypto.createHash('sha256').update(serverSeed).digest('hex')
  if (expectedHash !== state?.server_seed_hash) {
    throw new Error('Case fairness seed commitment is invalid.')
  }
  return serverSeed
}

app.get('/api/cases/fairness', requireAuthenticatedUser, async (req, res) => {
  try {
    const state = await ensureCaseFairnessState(req.identity.profileId)
    validateCaseFairnessState(state)
    res.json({
      ok: true,
      fairness: {
        seed_id: state.seed_id,
        server_seed_hash: state.server_seed_hash,
        client_seed: state.client_seed,
        nonce: Number(state.nonce || 0),
      },
    })
  } catch (error) {
    console.error('[api/cases/fairness] error', error)
    res.status(500).json({ ok: false, error: error?.message || 'Unable to load case fairness.' })
  }
})

app.post('/api/cases/fairness/rotate', express.json({ limit: '8kb' }), requireAuthenticatedUser, async (req, res) => {
  const clientSeed = String(req.body?.client_seed || '').trim()
  if (!clientSeed || clientSeed.length > 128) {
    res.status(400).json({ ok: false, error: 'Client seed must contain between 1 and 128 characters.' })
    return
  }

  try {
    const currentState = await ensureCaseFairnessState(req.identity.profileId)
    const previousServerSeed = validateCaseFairnessState(currentState)
    const nextSeed = createCaseFairnessSeed()
    const result = await callRainRpc('rotate_case_fairness_state', {
      p_profile_id: req.identity.profileId,
      p_expected_seed_id: currentState.seed_id,
      p_expected_server_seed_hash: currentState.server_seed_hash,
      p_expected_nonce: Number(currentState.nonce || 0),
      p_previous_server_seed: previousServerSeed,
      p_new_seed_id: nextSeed.seedId,
      p_new_server_seed_hash: nextSeed.serverSeedHash,
      p_new_server_seed_encrypted: nextSeed.serverSeedEncrypted,
      p_new_client_seed: clientSeed,
    })
    res.json({ ok: true, fairness: result })
  } catch (error) {
    const message = error?.message || 'Unable to change case seed.'
    const conflict = /fairness state changed/i.test(message)
    console.warn('[api/cases/fairness/rotate] error', message)
    res.status(conflict ? 409 : 500).json({ ok: false, error: message })
  }
})

app.post('/api/cases/open', express.json({ limit: '8kb' }), requireAuthenticatedUser, async (req, res) => {
  const caseId = String(req.body?.case_id || '').trim()
  const batchId = String(req.body?.request_id || '').trim()
  const quantity = Number(req.body?.quantity)
  if (!isUuidLike(caseId) || !isUuidLike(batchId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 4) {
    res.status(400).json({ ok: false, error: 'Select a valid case and quantity between 1 and 4.' })
    return
  }

  try {
    const state = await ensureCaseFairnessState(req.identity.profileId)
    const serverSeed = validateCaseFairnessState(state)
    const nonce = Number(state.nonce || 0)
    if (!Number.isSafeInteger(nonce) || nonce < 0) throw new Error('Case fairness nonce is invalid.')

    const rolls = Array.from(
      { length: quantity },
      (_, index) => getCaseRoll(serverSeed, state.client_seed, nonce + index, caseId),
    )
    const result = await callRainRpc('complete_case_opening', {
      p_profile_id: req.identity.profileId,
      p_case_id: caseId,
      p_batch_id: batchId,
      p_expected_seed_id: state.seed_id,
      p_expected_server_seed_hash: state.server_seed_hash,
      p_expected_nonce: nonce,
      p_client_seed: state.client_seed,
      p_rolls: rolls,
    })

    let updatedStats = null
    try {
      const updatedProfile = await loadProfileById(req.identity.profileId)
      if (updatedProfile) {
        updatedStats = {
          id: updatedProfile.id,
          played: Number(updatedProfile.played || 0),
          won: Number(updatedProfile.won || 0),
          lost: Number(updatedProfile.lost || 0),
        }
      }
    } catch (profileError) {
      console.warn('[api/cases/open] profile stats refresh failed', profileError?.message || profileError)
    }
    void emitProfileUpdates([req.identity.profileId])

    res.json({
      ok: true,
      ...result,
      stats: updatedStats,
      fairness: {
        seed_id: state.seed_id,
        server_seed_hash: state.server_seed_hash,
        client_seed: state.client_seed,
        nonce: Number(result?.nonce ?? nonce + quantity),
      },
    })
  } catch (error) {
    const message = error?.message || 'Unable to open this case.'
    const expected = /insufficient balance|unavailable|configured|fairness state changed|client seed|case roll|request id/i.test(message)
    console.warn('[api/cases/open] error', message)
    res.status(/fairness state changed/i.test(message) ? 409 : expected ? 400 : 500).json({ ok: false, error: message })
  }
})

function getUpgraderSeedEncryptionKey() {
  const jwtKey = getJwtGameSeedEncryptionKey('upgrader')
  if (jwtKey) return jwtKey
  throw new Error('JWT_SECRET is required for Upgrader fairness.')
}

function getUpgraderSeedDecryptionKeys() {
  return uniqueEncryptionKeys([
    getJwtGameSeedEncryptionKey('upgrader'),
    ...uniqueSecrets([process.env.UPGRADER_SEED_SECRET, process.env.CASE_OPEN_SEED_SECRET])
      .map((secret) => crypto.createHash('sha256').update(secret).digest()),
  ])
}

function encryptUpgraderServerSeed(serverSeed) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getUpgraderSeedEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(serverSeed, 'utf8'), cipher.final()])
  return `${iv.toString('hex')}.${cipher.getAuthTag().toString('hex')}.${encrypted.toString('hex')}`
}

function decryptUpgraderServerSeed(encryptedSeed) {
  return decryptAesGcmWithKeys(
    encryptedSeed,
    getUpgraderSeedDecryptionKeys(),
    'Invalid encrypted Upgrader server seed.',
    'Unable to decrypt the Upgrader server seed. Keep the previous game secret during migration.',
  )
}

function createUpgraderFairnessSeed() {
  const serverSeed = crypto.randomBytes(32).toString('hex')
  return {
    seedId: crypto.randomUUID(),
    serverSeed,
    serverSeedHash: crypto.createHash('sha256').update(serverSeed).digest('hex'),
    serverSeedEncrypted: encryptUpgraderServerSeed(serverSeed),
  }
}

function createUpgraderClientSeed() {
  return crypto.randomBytes(9).toString('base64url').toUpperCase().slice(0, 12)
}

function getUpgraderRoll(serverSeed, clientSeed, nonce, requestId) {
  const digest = crypto
    .createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}:${requestId}`)
    .digest('hex')
  const fraction = Number.parseInt(digest.slice(0, 13), 16) / 0x10000000000000
  return Number((fraction * 100).toFixed(8))
}

async function ensureUpgraderFairnessState(profileId) {
  const seed = createUpgraderFairnessSeed()
  return callRainRpc('ensure_upgrader_fairness_state', {
    p_profile_id: profileId,
    p_seed_id: seed.seedId,
    p_server_seed_hash: seed.serverSeedHash,
    p_server_seed_encrypted: seed.serverSeedEncrypted,
    p_client_seed: createUpgraderClientSeed(),
  })
}

function validateUpgraderFairnessState(state) {
  const serverSeed = decryptUpgraderServerSeed(state?.server_seed_encrypted)
  const expectedHash = crypto.createHash('sha256').update(serverSeed).digest('hex')
  if (expectedHash !== state?.server_seed_hash) {
    throw new Error('Upgrader fairness seed commitment is invalid.')
  }
  return serverSeed
}

app.get('/api/upgrader/fairness', requireAuthenticatedUser, async (req, res) => {
  try {
    const state = await ensureUpgraderFairnessState(req.identity.profileId)
    validateUpgraderFairnessState(state)
    const historyRows = await adminRest(
      `upgrader_games?select=server_seed_hash,server_seed,client_seed,nonce,roll,created_at&profile_id=eq.${encodeURIComponent(req.identity.profileId)}&order=created_at.desc&limit=1`,
    )
    const previous = Array.isArray(historyRows) ? historyRows[0] || null : historyRows
    res.json({
      ok: true,
      fairness: {
        seed_id: state.seed_id,
        server_seed_hash: state.server_seed_hash,
        client_seed: state.client_seed,
        nonce: Number(state.nonce || 0),
        previous_server_seed: previous?.server_seed || null,
        previous_server_seed_hash: previous?.server_seed_hash || null,
        previous_client_seed: previous?.client_seed || null,
        previous_nonce: previous?.nonce === null || previous?.nonce === undefined
          ? null
          : Number(previous.nonce),
        previous_roll: previous?.roll === null || previous?.roll === undefined
          ? null
          : Number(previous.roll),
      },
    })
  } catch (error) {
    console.error('[api/upgrader/fairness] error', error)
    res.status(500).json({ ok: false, error: error?.message || 'Unable to load Upgrader fairness.' })
  }
})

app.post('/api/upgrader/fairness/rotate', express.json({ limit: '8kb' }), requireAuthenticatedUser, async (req, res) => {
  const clientSeed = String(req.body?.client_seed || '').trim()
  if (!clientSeed || clientSeed.length > 128) {
    res.status(400).json({ ok: false, error: 'Client seed must contain between 1 and 128 characters.' })
    return
  }
  try {
    const currentState = await ensureUpgraderFairnessState(req.identity.profileId)
    const previousServerSeed = validateUpgraderFairnessState(currentState)
    const nextSeed = createUpgraderFairnessSeed()
    const fairness = await callRainRpc('rotate_upgrader_fairness_state', {
      p_profile_id: req.identity.profileId,
      p_expected_seed_id: currentState.seed_id,
      p_expected_server_seed_hash: currentState.server_seed_hash,
      p_expected_nonce: Number(currentState.nonce || 0),
      p_previous_server_seed: previousServerSeed,
      p_new_seed_id: nextSeed.seedId,
      p_new_server_seed_hash: nextSeed.serverSeedHash,
      p_new_server_seed_encrypted: nextSeed.serverSeedEncrypted,
      p_new_client_seed: clientSeed,
    })
    res.json({ ok: true, fairness })
  } catch (error) {
    const message = error?.message || 'Unable to change Upgrader seed.'
    res.status(/fairness state changed/i.test(message) ? 409 : 500).json({ ok: false, error: message })
  }
})

app.post('/api/upgrader/play', express.json({ limit: '24kb' }), requireAuthenticatedUser, async (req, res) => {
  const requestId = String(req.body?.request_id || '').trim()
  const wagerMode = String(req.body?.wager_mode || '').trim()
  const rollMode = String(req.body?.roll_mode || '').trim()
  const coinWager = Number(req.body?.coin_wager || 0)
  const wagerInventoryUuids = Array.isArray(req.body?.wager_inventory_uuids)
    ? req.body.wager_inventory_uuids.map(String)
    : []
  const targetStockUuids = Array.isArray(req.body?.target_stock_uuids)
    ? req.body.target_stock_uuids.map(String)
    : []
  const zoneStartDegrees = Number(req.body?.zone_start_degrees)

  const validUuidArray = (values, max) => values.length <= max && values.every(isUuidLike)
  if (!isUuidLike(requestId)
    || !['coins', 'items'].includes(wagerMode)
    || !['under', 'over'].includes(rollMode)
    || !Number.isSafeInteger(coinWager) || coinWager < 0 || coinWager > 10_000_000
    || !validUuidArray(wagerInventoryUuids, 100)
    || targetStockUuids.length < 1 || !validUuidArray(targetStockUuids, 25)
    || !Number.isFinite(zoneStartDegrees) || zoneStartDegrees < 0 || zoneStartDegrees >= 360) {
    res.status(400).json({ ok: false, error: 'Invalid Upgrader selection.' })
    return
  }
  if ((wagerMode === 'coins' && (coinWager < 1 || wagerInventoryUuids.length > 0))
    || (wagerMode === 'items' && (coinWager !== 0 || wagerInventoryUuids.length < 1))) {
    res.status(400).json({ ok: false, error: 'Invalid Upgrader wager.' })
    return
  }

  try {
    const state = await ensureUpgraderFairnessState(req.identity.profileId)
    const serverSeed = validateUpgraderFairnessState(state)
    const nonce = Number(state.nonce || 0)
    if (!Number.isSafeInteger(nonce) || nonce < 0) throw new Error('Upgrader fairness nonce is invalid.')
    const nextSeed = createUpgraderFairnessSeed()
    const roll = getUpgraderRoll(serverSeed, state.client_seed, nonce, requestId)

    const result = await callRainRpc('complete_upgrader_game', {
      p_profile_id: req.identity.profileId,
      p_request_id: requestId,
      p_wager_mode: wagerMode,
      p_roll_mode: rollMode,
      p_coin_wager: coinWager,
      p_wager_inventory_uuids: wagerInventoryUuids,
      p_target_stock_uuids: targetStockUuids,
      p_zone_start_degrees: zoneStartDegrees,
      p_expected_seed_id: state.seed_id,
      p_expected_server_seed_hash: state.server_seed_hash,
      p_expected_nonce: nonce,
      p_client_seed: state.client_seed,
      p_server_seed: serverSeed,
      p_roll: roll,
      p_next_seed_id: nextSeed.seedId,
      p_next_server_seed_hash: nextSeed.serverSeedHash,
      p_next_server_seed_encrypted: nextSeed.serverSeedEncrypted,
    })

    let profile = null
    try {
      profile = await loadProfileById(req.identity.profileId)
    } catch (profileError) {
      console.warn('[api/upgrader/play] profile refresh failed', profileError?.message || profileError)
    }
    void emitProfileUpdates([req.identity.profileId])
    res.json({
      ok: true,
      ...result,
      profile,
      fairness: {
        seed_id: nextSeed.seedId,
        server_seed_hash: nextSeed.serverSeedHash,
        client_seed: state.client_seed,
        nonce: 0,
        previous_server_seed: serverSeed,
        previous_server_seed_hash: state.server_seed_hash,
        previous_client_seed: state.client_seed,
        previous_nonce: nonce,
      },
    })
  } catch (error) {
    const message = error?.message || 'Unable to complete this upgrade.'
    const expected = /balance|available|invalid|select|chance|wager|target|fairness state changed|client seed/i.test(message)
    console.warn('[api/upgrader/play] error', message)
    res.status(/fairness state changed/i.test(message) ? 409 : expected ? 400 : 500).json({ ok: false, error: message })
  }
})

function encryptCoinflipServerSeed(serverSeed, supabaseKey) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getCoinflipSeedEncryptionKey(supabaseKey), iv)
  const encrypted = Buffer.concat([cipher.update(serverSeed, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}.${tag.toString('hex')}.${encrypted.toString('hex')}`
}

function decryptCoinflipServerSeed(encryptedSeed, supabaseKey) {
  return decryptAesGcmWithKeys(
    encryptedSeed,
    getCoinflipSeedDecryptionKeys(supabaseKey),
    'invalid encrypted coinflip server seed',
    'Unable to decrypt the Coinflip server seed. Keep the previous COINFLIP_SEED_SECRET during migration.',
  )
}

function resolveCoinflip(serverSeed, clientSeed, nonce, gameId, opponentUuid) {
  const message = `${clientSeed}:${nonce}:${gameId}:${opponentUuid}`
  const digest = crypto.createHmac('sha256', serverSeed).update(message).digest('hex')
  const roll = Number.parseInt(digest.slice(0, 13), 16) / 0x10000000000000
  return {
    roll,
    result: roll < 0.5 ? 'heads' : 'tails',
  }
}

function getCoinflipItemIds(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(String).filter(isUuidLike))].slice(0, 100)
}

function getCoinflipWagerValue(items) {
  if (!Array.isArray(items)) return 0
  return items.reduce((total, item) => {
    const value = Number(item?.value)
    return total + (Number.isSafeInteger(value) && value > 0 ? value : 0)
  }, 0)
}

function serializeCoinflipGame(game) {
  if (!game || typeof game !== 'object') return game
  const { server_seed_encrypted, ...publicGame } = game
  if (!publicGame.result) delete publicGame.server_seed
  return publicGame
}

app.post('/api/coinflip/create', express.json({ limit: '24kb' }), requireAuthenticatedUser, async (req, res) => {
  const { supabaseUrl, supabaseKey } = getSupabaseAdminConfig()
  if (!supabaseUrl || !supabaseKey) {
    res.status(500).json({ ok: false, error: 'supabase config missing' })
    return
  }

  const payload = req.body || {}
  const creator_uuid = String(req.identity.profileId)
  const creator_side = String(payload.creator_side || '').trim().toLowerCase() === 'tails'
    ? 'tails'
    : 'heads'
  const assigned_opponent_side = creator_side === 'heads' ? 'tails' : 'heads'

  try {
    const creatorProfile = await loadProfileById(creator_uuid)
    if (!creatorProfile) return res.status(404).json({ ok: false, error: 'Profile not found.' })
    const creator_username = String(creatorProfile.username || 'Player')
    const creator_avatar_url = creatorProfile.avatar_headshot_url || creatorProfile.avatar_url || null
    const gameId = crypto.randomUUID()
    const serverSeed = crypto.randomBytes(32).toString('hex')
    const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex')
    const clientSeed = crypto.randomBytes(16).toString('hex')
    const requestedItemIds = Array.isArray(payload.item_ids) ? payload.item_ids : []
    const itemIds = getCoinflipItemIds(requestedItemIds)
    if (itemIds.length === 0 || itemIds.length !== requestedItemIds.length) {
      return res.status(400).json({ ok: false, error: 'Select one or more valid, unique items.' })
    }
    let verifiedCreatorItems = []

    // If item ids provided, ensure they exist and belong to the creator to prevent dupes
    if (itemIds.length > 0) {
      try {
        const checkUrl = `${supabaseUrl}/rest/v1/inventory_items?select=*&user_id=eq.${encodeURIComponent(creator_uuid)}&id=in.(${itemIds.join(',')})`
        const checkRes = await fetch(checkUrl, { headers: getSupabaseAdminHeaders(supabaseKey) })
        if (!checkRes.ok) {
          const txt = await checkRes.text()
          console.warn('[api/coinflip/create] inventory check failed', checkRes.status, txt)
          return res.status(500).json({ ok: false, error: 'failed to verify inventory items' })
        }
        const foundTxt = await checkRes.text()
        let found = null
        try { found = JSON.parse(foundTxt || '[]') } catch { found = [] }
        if (!Array.isArray(found) || found.length !== itemIds.length) {
          return res.status(409).json({ ok: false, error: 'some inventory items are missing or no longer owned' })
        }
        verifiedCreatorItems = found
      } catch (err) {
        console.warn('[api/coinflip/create] inventory check error', err)
        return res.status(500).json({ ok: false, error: 'failed to verify inventory items' })
      }
    }

    if (getCoinflipWagerValue(verifiedCreatorItems) <= 0) {
      return res.status(400).json({ ok: false, error: 'Coinflip items must have a positive value.' })
    }

    const insertPayload = [{
      id: gameId,
      creator_uuid,
      creator_username,
      creator_side,
      creator_items: verifiedCreatorItems,
      creator_avatar_url,
      opponent_uuid: null,
      opponent_username: null,
      opponent_side: assigned_opponent_side,
      opponent_items: null,
      server_seed_hash: serverSeedHash,
      server_seed_encrypted: encryptCoinflipServerSeed(serverSeed, supabaseKey),
      server_seed: null,
      client_seed: clientSeed,
      nonce: 0,
      canceled: false,
    }]

    const response = await fetch(`${supabaseUrl}/rest/v1/coinflip_games?select=*`, {
      method: 'POST',
      headers: getSupabaseAdminHeaders(supabaseKey, {
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      }),
      body: JSON.stringify(insertPayload),
    })

    const text = await response.text()
    if (!response.ok) {
      res.status(response.status).json({ ok: false, status: response.status, error: text })
      return
    }

    let data = null
    try {
      data = JSON.parse(text || 'null')
    } catch {
      data = null
    }

    const createdRoom = serializeCoinflipGame(Array.isArray(data) ? data[0] : data)
    io.emit('coinflip:created', createdRoom)
    res.json({ ok: true, data: createdRoom })
    return
  } catch (err) {
    console.error('[api/coinflip/create] error', err)
    res.status(500).json({ ok: false, error: String(err) })
  }
})

app.post(
  '/api/coinflip/cancel',
  express.json({ limit: '8kb' }),
  requireAuthenticatedUser,
  async (req, res) => {
    const roomId = String(req.body?.roomId || req.body?.id || '').trim()
    if (!roomId) {
      res.status(400).json({ ok: false, error: 'roomId is required' })
      return
    }

    try {
      const updatedRows = await adminRest(
        `coinflip_games?id=eq.${encodeURIComponent(roomId)}&creator_uuid=eq.${encodeURIComponent(req.identity.profileId)}&opponent_uuid=is.null&canceled=eq.false&select=*`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: { canceled: true },
        },
      )
      const updatedRoom = Array.isArray(updatedRows) ? updatedRows[0] : updatedRows
      if (!updatedRoom) {
        res.status(409).json({
          ok: false,
          error: 'Only the creator can cancel an open coinflip.',
        })
        return
      }

      const publicRoom = serializeCoinflipGame(updatedRoom)
      io.emit('coinflip:updated', publicRoom)
      res.json({ ok: true, data: publicRoom })
    } catch (error) {
      console.error('[api/coinflip/cancel] error', error)
      res.status(500).json({ ok: false, error: error?.message || 'Unable to cancel coinflip.' })
    }
  },
)

// Join a coinflip: update the game with opponent data and delete opponent inventory items
app.post('/api/coinflip/join', express.json({ limit: '24kb' }), requireAuthenticatedUser, async (req, res) => {
  const { supabaseUrl, supabaseKey } = getSupabaseAdminConfig()
  if (!supabaseUrl || !supabaseKey) {
    res.status(500).json({ ok: false, error: 'supabase config missing' })
    return
  }

  const payload = req.body || {}
  const roomId = payload.roomId || payload.id || null
  const opponent_uuid = String(req.identity.profileId)

  if (!roomId) {
    res.status(400).json({ ok: false, error: 'roomId is required' })
    return
  }

  try {
    const opponentProfile = await loadProfileById(opponent_uuid)
    if (!opponentProfile) return res.status(404).json({ ok: false, error: 'Profile not found.' })
    const opponent_username = String(opponentProfile.username || 'Player')
    const opponent_avatar_url = opponentProfile.avatar_headshot_url || opponentProfile.avatar_url || null
    let assignedOpponentSide = 'heads'
    let roomObj = null

    // Fetch room to ensure it exists and is joinable
    try {
      const roomRes = await fetch(`${supabaseUrl}/rest/v1/coinflip_games?id=eq.${encodeURIComponent(roomId)}`, {
        headers: getSupabaseAdminHeaders(supabaseKey),
      })
      if (!roomRes.ok) {
        const txt = await roomRes.text()
        console.warn('[api/coinflip/join] failed to fetch room', roomRes.status, txt)
        return res.status(500).json({ ok: false, error: 'failed to fetch room' })
      }
      const roomTxt = await roomRes.text()
      let roomData = null
      try { roomData = JSON.parse(roomTxt || '[]') } catch { roomData = [] }
      roomObj = Array.isArray(roomData) ? roomData[0] : roomData
      if (!roomObj) return res.status(404).json({ ok: false, error: 'room not found' })
      if (roomObj.canceled) return res.status(400).json({ ok: false, error: 'room canceled' })
      if (roomObj.opponent_uuid) return res.status(400).json({ ok: false, error: 'room already has an opponent' })
      if (roomObj.creator_uuid === opponent_uuid) return res.status(400).json({ ok: false, error: 'creator cannot join their own room' })
      const creatorSide = String(roomObj.creator_side || '').trim().toLowerCase() === 'tails'
        ? 'tails'
        : 'heads'
      assignedOpponentSide =
        roomObj.opponent_side === 'heads' || roomObj.opponent_side === 'tails'
          ? roomObj.opponent_side
          : creatorSide === 'heads' ? 'tails' : 'heads'
    } catch (err) {
      console.warn('[api/coinflip/join] room fetch error', err)
      return res.status(500).json({ ok: false, error: 'failed to validate room' })
    }

    const requestedItemIds = Array.isArray(payload.item_ids) ? payload.item_ids : []
    const itemIds = getCoinflipItemIds(requestedItemIds)
    if (itemIds.length === 0 || itemIds.length !== requestedItemIds.length) {
      return res.status(400).json({ ok: false, error: 'Select one or more valid, unique items.' })
    }
    let verifiedOpponentItems = []
    // Verify opponent owns the items
    if (itemIds.length > 0) {
      try {
        const checkUrl = `${supabaseUrl}/rest/v1/inventory_items?select=*&user_id=eq.${encodeURIComponent(opponent_uuid)}&id=in.(${itemIds.join(',')})`
        const checkRes = await fetch(checkUrl, { headers: getSupabaseAdminHeaders(supabaseKey) })
        if (!checkRes.ok) {
          const txt = await checkRes.text()
          console.warn('[api/coinflip/join] inventory check failed', checkRes.status, txt)
          return res.status(500).json({ ok: false, error: 'failed to verify opponent inventory items' })
        }
        const foundTxt = await checkRes.text()
        let found = null
        try { found = JSON.parse(foundTxt || '[]') } catch { found = [] }
        if (!Array.isArray(found) || found.length !== itemIds.length) {
          return res.status(409).json({ ok: false, error: 'some opponent inventory items are missing or no longer owned' })
        }
        verifiedOpponentItems = found
      } catch (err) {
        console.warn('[api/coinflip/join] inventory check error', err)
        return res.status(500).json({ ok: false, error: 'failed to verify opponent inventory items' })
      }
    }

    const creatorWagerValue = getCoinflipWagerValue(roomObj.creator_items)
    const opponentWagerValue = getCoinflipWagerValue(verifiedOpponentItems)
    if (creatorWagerValue <= 0 || opponentWagerValue <= 0) {
      return res.status(409).json({ ok: false, error: 'Both coinflip wagers must have a positive value.' })
    }
    if (opponentWagerValue * 10 < creatorWagerValue * 9 || opponentWagerValue * 10 > creatorWagerValue * 11) {
      return res.status(400).json({ ok: false, error: 'Your wager must be within 10% of the creator wager.' })
    }

    // Legacy open games migrated before encrypted commitments use the already
    // committed plaintext seed. Newly-created games always take the encrypted path.
    const serverSeed = roomObj.server_seed_encrypted
      ? decryptCoinflipServerSeed(roomObj.server_seed_encrypted, supabaseKey)
      : String(roomObj.server_seed || '')
    if (!serverSeed) {
      return res.status(409).json({ ok: false, error: 'coinflip has no server seed commitment' })
    }
    const expectedSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex')
    if (expectedSeedHash !== roomObj.server_seed_hash) {
      return res.status(500).json({ ok: false, error: 'coinflip seed commitment is invalid' })
    }

    const nonce = Number.isSafeInteger(Number(roomObj.nonce)) ? Number(roomObj.nonce) : 0
    const { roll, result } = resolveCoinflip(
      serverSeed,
      roomObj.client_seed,
      nonce,
      roomId,
      opponent_uuid,
    )
    const creatorWon = result === roomObj.creator_side
    const winner_uuid = creatorWon ? roomObj.creator_uuid : opponent_uuid
    const winner_username = creatorWon ? roomObj.creator_username : opponent_username

    const updatePayload = {
      opponent_uuid: opponent_uuid || null,
      opponent_username: opponent_username || null,
      opponent_side: assignedOpponentSide,
      opponent_items: verifiedOpponentItems.length > 0 ? verifiedOpponentItems : null,
      opponent_avatar_url: opponent_avatar_url || null,
      result,
      winner_uuid,
      winner_username,
      server_seed: serverSeed,
      result_roll: roll,
      resolved_at: new Date().toISOString(),
    }

    // The null-opponent/result filters make the seat claim atomic if two users join at once.
    const updateUrl = `${supabaseUrl}/rest/v1/coinflip_games?id=eq.${encodeURIComponent(roomId)}&opponent_uuid=is.null&result=is.null&canceled=eq.false`
    const response = await fetch(updateUrl, {
      method: 'PATCH',
      headers: getSupabaseAdminHeaders(supabaseKey, {
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      }),
      body: JSON.stringify(updatePayload),
    })

    const text = await response.text()
    if (!response.ok) {
      res.status(response.status).json({ ok: false, status: response.status, error: text })
      return
    }

    let updated = null
    try { updated = JSON.parse(text || 'null') } catch { updated = null }
    const updatedRoom = Array.isArray(updated) ? updated[0] : updated
    if (!updatedRoom) {
      return res.status(409).json({ ok: false, error: 'room was already joined' })
    }

    await emitProfileUpdates([roomObj.creator_uuid, opponent_uuid])
    const publicRoom = serializeCoinflipGame(updatedRoom)
    io.emit('coinflip:updated', publicRoom || { id: roomId })
    res.json({ ok: true, data: publicRoom })
    return
  } catch (err) {
    console.error('[api/coinflip/join] error', err)
    res.status(500).json({ ok: false, error: String(err) })
  }
})

// Mines game functions
const MIN_MINES_WAGER = 5_000
const MAX_MINES_WAGER = 10_000_000

function getMinesMultiplier(revealedCount, totalPositions, minesCount) {
  const safePositions = totalPositions - minesCount
  if (revealedCount === 0) return 1.0
  
  let multiplier = 1.0
  for (let i = 0; i < revealedCount; i++) {
    const remainingSafe = safePositions - i
    const remainingTotal = totalPositions - i
    multiplier *= remainingTotal / remainingSafe
  }
  
  // Apply house edge (3%)
  multiplier *= 0.97
  
  return Math.round(multiplier * 100) / 100
}

function generateLegacyMinePositions(totalPositions, minesCount, serverSeed, clientSeed, nonce, gameId) {
  const message = `${clientSeed}:${nonce}:${gameId}`
  const digest = crypto.createHmac('sha256', serverSeed).update(message).digest('hex')
  
  const positions = []
  const available = Array.from({ length: totalPositions }, (_, i) => i)
  
  for (let i = 0; i < minesCount && available.length > 0; i++) {
    const hashIndex = (i * 2) % digest.length
    const hashValue = Number.parseInt(digest.slice(hashIndex, hashIndex + 2), 16)
    const randomIndex = hashValue % available.length
    positions.push(available.splice(randomIndex, 1)[0])
  }
  
  return positions.sort((a, b) => a - b)
}

function generateMinePositions(totalPositions, minesCount, serverSeed, clientSeed, nonce, gameId) {
  const positions = []
  const available = Array.from({ length: totalPositions }, (_, index) => index)

  for (let mineIndex = 0; mineIndex < minesCount && available.length > 0; mineIndex += 1) {
    const unbiasedLimit = Math.floor(0x100000000 / available.length) * available.length
    let attempt = 0
    let candidate

    do {
      candidate = crypto
        .createHmac('sha256', serverSeed)
        .update(`${clientSeed}:${nonce}:${gameId}:mine:${mineIndex}:${attempt}`)
        .digest()
        .readUInt32BE(0)
      attempt += 1
    } while (candidate >= unbiasedLimit)

    positions.push(available.splice(candidate % available.length, 1)[0])
  }

  return positions.sort((a, b) => a - b)
}

function getMinesSeedEncryptionKey(supabaseKey) {
  const jwtKey = getJwtGameSeedEncryptionKey('mines')
  if (jwtKey) return jwtKey
  throw new Error('JWT_SECRET is required for Mines fairness.')
}

function getMinesSeedDecryptionKeys(supabaseKey) {
  const minesLegacySecrets = uniqueSecrets([
    process.env.MINES_SEED_SECRET,
    process.env.COINFLIP_SEED_SECRET,
    supabaseKey,
  ])
  const coinflipLegacySecrets = uniqueSecrets([process.env.COINFLIP_SEED_SECRET, supabaseKey])
  return uniqueEncryptionKeys([
    getJwtGameSeedEncryptionKey('mines'),
    ...minesLegacySecrets.map((secret) => crypto.createHash('sha256').update(`mines:${secret}`).digest()),
    ...coinflipLegacySecrets.map((secret) => crypto.createHash('sha256').update(secret).digest()),
  ])
}

function encryptMinesServerSeed(serverSeed, supabaseKey) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getMinesSeedEncryptionKey(supabaseKey), iv)
  const encrypted = Buffer.concat([cipher.update(serverSeed, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}.${tag.toString('hex')}.${encrypted.toString('hex')}`
}

function decryptMinesServerSeed(encryptedSeed, supabaseKey) {
  return decryptAesGcmWithKeys(
    encryptedSeed,
    getMinesSeedDecryptionKeys(supabaseKey),
    'invalid encrypted mines server seed',
    'Unable to decrypt the Mines server seed. Keep the previous game secrets during migration.',
  )
}

function createMinesFairnessSeed(supabaseKey) {
  const serverSeed = crypto.randomBytes(32).toString('hex')
  return {
    seedId: crypto.randomUUID(),
    serverSeed,
    serverSeedHash: crypto.createHash('sha256').update(serverSeed).digest('hex'),
    serverSeedEncrypted: encryptMinesServerSeed(serverSeed, supabaseKey),
  }
}

function createMinesClientSeed() {
  return crypto.randomBytes(9).toString('base64url').toUpperCase().slice(0, 12)
}

async function ensureMinesFairnessState(profileId, supabaseKey) {
  const seed = createMinesFairnessSeed(supabaseKey)
  return callRainRpc('ensure_mines_fairness_state', {
    p_profile_id: profileId,
    p_seed_id: seed.seedId,
    p_server_seed_hash: seed.serverSeedHash,
    p_server_seed_encrypted: seed.serverSeedEncrypted,
    p_client_seed: createMinesClientSeed(),
  })
}

function validateMinesFairnessState(state, supabaseKey) {
  const serverSeed = decryptMinesServerSeed(state?.server_seed_encrypted, supabaseKey)
  const expectedHash = crypto.createHash('sha256').update(serverSeed).digest('hex')
  if (expectedHash !== state?.server_seed_hash) {
    throw new Error('Mines fairness seed commitment is invalid.')
  }
  return serverSeed
}

function serializeMinesGame(game) {
  if (!game || typeof game !== 'object') return game

  const { server_seed_encrypted, ...publicGame } = game
  if (publicGame.game_state === 'active') {
    delete publicGame.mine_positions
  }

  return publicGame
}

function resolveMinesGridSize(game, supabaseKey) {
  const encodedGridSize = Number(String(game?.client_seed || '').match(/:g([5-8])$/)?.[1])
  if ([5, 6, 7, 8].includes(encodedGridSize)) return encodedGridSize

  const storedGridSize = Number(game?.grid_size)
  if ([5, 6, 7, 8].includes(storedGridSize)) return storedGridSize

  try {
    const serverSeed = decryptMinesServerSeed(game?.server_seed_encrypted, supabaseKey)
    const actualMines = (Array.isArray(game?.mine_positions) ? game.mine_positions : [])
      .map(Number)
      .sort((a, b) => a - b)

    for (const candidate of [5, 6, 7, 8]) {
      const generationArgs = [
        candidate * candidate,
        Number(game?.mines_count) || 3,
        serverSeed,
        game?.client_seed,
        game?.nonce,
        game?.id,
      ]
      const expectedBoards = [
        generateMinePositions(...generationArgs),
        generateLegacyMinePositions(...generationArgs),
      ]

      if (expectedBoards.some((expectedMines) =>
        expectedMines.length === actualMines.length &&
        expectedMines.every((position, index) => position === actualMines[index])
      )) {
        return candidate
      }
    }
  } catch (error) {
    console.warn('[api/mines] failed to infer legacy grid size', error?.message || error)
  }

  return 5
}

app.get('/api/mines/fairness', requireAuthenticatedUser, async (req, res) => {
  const { supabaseKey } = getSupabaseAdminConfig()
  if (!supabaseKey) {
    res.status(500).json({ ok: false, error: 'Supabase configuration is missing.' })
    return
  }

  try {
    const state = await ensureMinesFairnessState(req.identity.profileId, supabaseKey)
    validateMinesFairnessState(state, supabaseKey)
    res.json({
      ok: true,
      fairness: {
        seed_id: state.seed_id,
        server_seed_hash: state.server_seed_hash,
        client_seed: state.client_seed,
        nonce: Number(state.nonce || 0),
      },
    })
  } catch (error) {
    console.error('[api/mines/fairness] error', error)
    res.status(500).json({ ok: false, error: error?.message || 'Unable to load Mines fairness.' })
  }
})

app.post('/api/mines/fairness/rotate', express.json({ limit: '8kb' }), requireAuthenticatedUser, async (req, res) => {
  const clientSeed = String(req.body?.client_seed || '').trim()
  if (!clientSeed || clientSeed.length > 128) {
    res.status(400).json({ ok: false, error: 'Client seed must contain between 1 and 128 characters.' })
    return
  }

  const { supabaseKey } = getSupabaseAdminConfig()
  if (!supabaseKey) {
    res.status(500).json({ ok: false, error: 'Supabase configuration is missing.' })
    return
  }

  try {
    const activeGames = await adminRest(
      `mines_games?profile_id=eq.${encodeURIComponent(req.identity.profileId)}&game_state=eq.active&select=id&limit=1`,
    )
    if (Array.isArray(activeGames) && activeGames.length > 0) {
      res.status(409).json({ ok: false, error: "You can't change the seed while a Mines game is active." })
      return
    }

    const currentState = await ensureMinesFairnessState(req.identity.profileId, supabaseKey)
    const previousServerSeed = validateMinesFairnessState(currentState, supabaseKey)
    const nextSeed = createMinesFairnessSeed(supabaseKey)
    const result = await callRainRpc('rotate_mines_fairness_state', {
      p_profile_id: req.identity.profileId,
      p_expected_seed_id: currentState.seed_id,
      p_expected_server_seed_hash: currentState.server_seed_hash,
      p_expected_nonce: Number(currentState.nonce || 0),
      p_previous_server_seed: previousServerSeed,
      p_new_seed_id: nextSeed.seedId,
      p_new_server_seed_hash: nextSeed.serverSeedHash,
      p_new_server_seed_encrypted: nextSeed.serverSeedEncrypted,
      p_new_client_seed: clientSeed,
    })
    res.json({ ok: true, fairness: result })
  } catch (error) {
    const message = error?.message || 'Unable to change Mines fairness seed.'
    const expected = /seed|fairness|active|client/i.test(message)
    if (!expected) console.error('[api/mines/fairness/rotate] error', error)
    res.status(/active|changed/i.test(message) ? 409 : expected ? 400 : 500).json({ ok: false, error: message })
  }
})

// Restore the signed-in player's unfinished game after a refresh or route change.
app.get('/api/mines/state', requireAuthenticatedUser, async (req, res) => {
  res.set('Cache-Control', 'no-store')
  const { supabaseKey } = getSupabaseAdminConfig()
  if (!supabaseKey) {
    res.status(500).json({ ok: false, error: 'supabase config missing' })
    return
  }

  const profileId = String(req.identity.profileId)

  try {
    const games = await adminRest(
      `mines_games?profile_id=eq.${encodeURIComponent(profileId)}&game_state=eq.active&order=created_at.desc&limit=1&select=*`,
    )
    const activeGame = Array.isArray(games) ? games[0] : null

    if (!activeGame) {
      res.json({ ok: true, game: null })
      return
    }

    const gridSize = resolveMinesGridSize(activeGame, supabaseKey)
    res.json({
      ok: true,
      game: serializeMinesGame({ ...activeGame, grid_size: gridSize }),
    })
  } catch (err) {
    console.error('[api/mines/state] error', err)
    res.status(500).json({ ok: false, error: 'Unable to restore Mines game.' })
  }
})

// Create a new mines game
app.post('/api/mines/create', express.json({ limit: '24kb' }), requireAuthenticatedUser, async (req, res) => {
  const { supabaseKey } = getSupabaseAdminConfig()
  if (!supabaseKey) {
    res.status(500).json({ ok: false, error: 'supabase config missing' })
    return
  }

  const payload = req.body || {}
  const profileId = String(req.identity.profileId)
  const wagerValue = Number(payload.wager_value) || 0
  const requestedGridSize = Number(payload.grid_size)
  const gridSize = [5, 6, 7, 8].includes(requestedGridSize) ? requestedGridSize : 5
  const totalPositions = gridSize * gridSize
  const minesCount = Math.min(Math.max(Number(payload.mines_count) || 3, 1), totalPositions - 1)

  if (
    !Number.isSafeInteger(wagerValue)
    || wagerValue < MIN_MINES_WAGER
    || wagerValue > MAX_MINES_WAGER
  ) {
    return res.status(400).json({
      ok: false,
      error: 'Wager must be between 5,000 and 10,000,000 coins.',
    })
  }

  try {
    const gameId = crypto.randomUUID()
    const fairnessState = await ensureMinesFairnessState(profileId, supabaseKey)
    const serverSeed = validateMinesFairnessState(fairnessState, supabaseKey)
    const clientSeed = String(fairnessState.client_seed)
    const nonce = Number(fairnessState.nonce || 0)
    if (!Number.isSafeInteger(nonce) || nonce < 0) throw new Error('Mines fairness nonce is invalid.')

    const minePositions = generateMinePositions(totalPositions, minesCount, serverSeed, clientSeed, nonce, gameId)
    const result = await callRainRpc('create_mines_game_secure', {
      p_profile_id: profileId,
      p_game_id: gameId,
      p_wager_value: wagerValue,
      p_mines_count: minesCount,
      p_grid_size: gridSize,
      p_mine_positions: minePositions,
      p_server_seed_encrypted: encryptMinesServerSeed(serverSeed, supabaseKey),
      p_server_seed_hash: fairnessState.server_seed_hash,
      p_fairness_seed_id: fairnessState.seed_id,
      p_client_seed: clientSeed,
      p_nonce: nonce,
    })
    const storedGame = result?.game
    if (!storedGame?.id) throw new Error('Mines game transaction returned no game.')
    const returnGame = storedGame ? { ...storedGame, grid_size: gridSize } : storedGame

    // Emit real-time update
    const publicGame = serializeMinesGame(returnGame)
    io.emit('mines:created', publicGame)
    void emitProfileUpdates([profileId])

    res.json({ ok: true, game: publicGame, balance: Number(result.balance || 0) })
  } catch (err) {
    const message = err?.message || 'Unable to create Mines game.'
    const expected = /active Mines|Insufficient balance|fairness state changed|invalid Mines/i.test(message)
    if (!expected) console.error('[api/mines/create] error', err)
    res.status(/active Mines|fairness state changed/i.test(message) ? 409 : expected ? 400 : 500)
      .json({ ok: false, error: message })
  }
})

// Reveal a position in mines game
app.post('/api/mines/reveal', express.json({ limit: '24kb' }), requireAuthenticatedUser, async (req, res) => {
  const { supabaseKey } = getSupabaseAdminConfig()
  if (!supabaseKey) {
    res.status(500).json({ ok: false, error: 'supabase config missing' })
    return
  }

  const payload = req.body || {}
  const profileId = String(req.identity.profileId)
  const gameId = String(payload.game_id || '')
  const position = Number(payload.position)

  if (gameId === '' || !Number.isInteger(position) || position < 0 || position > 63) {
    return res.status(400).json({ ok: false, error: 'Invalid game or position.' })
  }

  try {
    const result = await callRainRpc('reveal_mines_position_secure', {
      p_profile_id: profileId,
      p_game_id: gameId,
      p_position: position,
    })
    const updatedGame = result?.game
    if (!updatedGame?.id) throw new Error('Mines reveal transaction returned no game.')
    const gridSize = resolveMinesGridSize(updatedGame, supabaseKey)
    const publicGame = serializeMinesGame({ ...updatedGame, grid_size: gridSize })
    io.emit('mines:updated', publicGame)
    if (updatedGame?.game_state === 'exploded') {
      void emitProfileUpdates([profileId])
    }

    res.json({ ok: true, game: publicGame, is_mine: Boolean(result.is_mine) })
  } catch (err) {
    const message = err?.message || 'Unable to reveal this Mines position.'
    const expected = /not found|own games|not active|invalid game or position/i.test(message)
    if (!expected) console.error('[api/mines/reveal] error', err)
    res.status(/not found/i.test(message) ? 404 : /own games/i.test(message) ? 403 : expected ? 400 : 500)
      .json({ ok: false, error: message })
  }
})

// Cash out from mines game
app.post('/api/mines/cashout', express.json({ limit: '24kb' }), requireAuthenticatedUser, async (req, res) => {
  const { supabaseKey } = getSupabaseAdminConfig()
  if (!supabaseKey) {
    res.status(500).json({ ok: false, error: 'supabase config missing' })
    return
  }

  const payload = req.body || {}
  const profileId = String(req.identity.profileId)
  const gameId = String(payload.game_id || '')

  if (gameId === '') {
    return res.status(400).json({ ok: false, error: 'Invalid game ID.' })
  }

  try {
    const result = await callRainRpc('cashout_mines_game', {
      p_profile_id: profileId,
      p_game_id: gameId,
    })
    const updatedGame = result?.game
    if (!updatedGame?.id) throw new Error('Mines cash-out did not return the completed game.')
    const gridSize = resolveMinesGridSize(updatedGame, supabaseKey)
    const publicGame = serializeMinesGame({ ...updatedGame, grid_size: gridSize })
    io.emit('mines:updated', publicGame)
    void emitProfileUpdates([profileId])

    res.json({
      ok: true,
      game: publicGame,
      winnings: Number(result.winnings || 0),
      balance: Number(result.balance || 0),
      stats: result.stats || null,
    })
  } catch (err) {
    console.error('[api/mines/cashout] error', err)
    const message = err?.message || 'Unable to cash out this Mines game.'
    const expected = /not found|own games|not active|reveal at least|profile/i.test(message)
    res.status(/not found/i.test(message) ? 404 : /own games/i.test(message) ? 403 : expected ? 400 : 500)
      .json({ ok: false, error: message })
  }
})

// Persisted, server-authoritative Roll game backend.
const rollGame = registerRollGame({
  app,
  io,
  requireAuthenticatedUser,
  jsonParser: express.json({ limit: '24kb' }),
  adminRest,
  getSupabaseAdminConfig,
  emitProfileUpdates,
})

app.get('/api/games/feed', (req, res) => {
  const limit = Number(req.query.limit) || 40
  res.json({ feed: FEED.slice(0, limit) })
})

app.get('/api/live-casino/games', async (req, res) => {
  try {
    const games = await loadBetnexCatalog()
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=240')
    res.json({ ok: true, games })
  } catch (error) {
    if (error.status === 503) {
      res.status(503).json({ ok: false, error: 'Live Casino is not configured yet.' })
    } else {
      console.error('Failed to load Betnex catalog:', error)
      res.status(500).json({ ok: false, error: 'Failed to load games catalog.' })
    }
  }
})

async function handleBetnexWalletCallback(req, res) {
  try {
    const apiKey = String(process.env.BETNEX_API_KEY || '').trim()
    if (!apiKey) throw new Error('Live Casino callback is not configured.')
    const callback = verifyCallback(req.body, apiKey)
    const betUsd = Number(callback.bet_amount)
    const winUsd = Number(callback.win_amount)
    if (!Number.isFinite(betUsd) || !Number.isFinite(winUsd)) {
      throw new Error('Invalid callback amounts.')
    }

    // Some providers request the authoritative wallet balance when the game
    // boots by sending a zero-value callback. It is a balance read, not a
    // wager, so do not send it through the transaction RPC (which correctly
    // rejects empty game transactions).
    if (betUsd === 0 && winUsd === 0) {
      const memberAccount = callback.member_account.trim()
      const sessions = await adminRest(
        `live_casino_sessions?select=profile_id,coins_per_usd&member_account=eq.${encodeURIComponent(memberAccount)}&limit=1`,
      )
      const session = Array.isArray(sessions) ? sessions[0] : sessions
      if (!session?.profile_id || !session?.coins_per_usd) {
        throw new Error('Live Casino session not found.')
      }
      const profile = await loadProfileById(session.profile_id)
      if (!profile) throw new Error('Live Casino profile not found.')
      const balanceUsd = coinsToBetnexUsd(Number(profile.balance || 0), Number(session.coins_per_usd))
      res.setHeader('Cache-Control', 'no-store')
      res.json(createCallbackResponse({
        success: true,
        handle: true,
        money: balanceUsd,
        msg: 'Balance synchronized successfully',
      }))
      return
    }

    const result = await adminRest('rpc/process_live_casino_callback', {
      method: 'POST',
      body: {
        p_member_account: callback.member_account.trim(),
        p_serial_number: callback.serial_number.trim(),
        p_game_uid: callback.game_uid.trim(),
        p_game_round: callback.game_round.trim(),
        p_game_name: callback.game_name.trim(),
        p_game_provider: callback.game_provider.trim(),
        p_currency_code: callback.currency_code.trim(),
        p_bet_usd: betUsd,
        p_win_usd: winUsd,
        p_provider_data: callback.data ?? null,
      },
    })

    res.setHeader('Cache-Control', 'no-store')
    res.json(createCallbackResponse({
      success: true,
      handle: true,
      money: Number(result?.balance_usd || 0),
      msg: result?.duplicate ? 'Duplicate callback ignored' : 'Callback processed successfully',
    }))
    if (result?.profile_id) void emitWalletRefreshes([result.profile_id])
  } catch (error) {
    const expected = /callback|session|profile|currency|balance|amount|serial|configured|represent/i.test(
      String(error?.message || ''),
    )
    if (!expected) console.error('[live-casino] callback failed', error)
    res.json(createCallbackResponse({
      success: false,
      handle: false,
      money: 0,
      msg: 'Unable to process wallet callback.',
    }))
  }
}

const betnexCallbackJson = express.json({ limit: '64kb' })

// Support the current dashboard URL plus the documented SDK callback paths.
app.post('/v1/wallet/callback', betnexCallbackJson, handleBetnexWalletCallback)
app.post('/callback/:callbackId', betnexCallbackJson, handleBetnexWalletCallback)
app.post('/api/betnex/callback', betnexCallbackJson, handleBetnexWalletCallback)

app.post(
  '/api/live-casino/launch',
  express.json({ limit: '12kb' }),
  requireAuthenticatedUser,
  async (req, res) => {
    const profileId = String(req.identity.profileId)
    const gameId = String(req.body?.gameId || '').trim()
    const providerId = String(req.body?.providerId || '').trim().toUpperCase()
    if (!gameId || !providerId) {
      res.status(400).json({ ok: false, error: 'Select a valid Live Casino game.' })
      return
    }
    if (isRateLimited(authAttempts, `casino-launch:${profileId}`, 8, 60_000)) {
      res.status(429).json({ ok: false, error: 'Too many game launches. Please wait a moment.' })
      return
    }

    const games = await loadBetnexCatalog()
    const game = games.find((entry) => (
      entry.launchAvailable !== false &&
      String(entry.id) === gameId &&
      String(entry.providerId).toUpperCase() === providerId
    ))
    if (!game) {
      res.status(404).json({ ok: false, error: 'This game cannot currently be launched through Betnex.' })
      return
    }

    const profile = await loadProfileById(profileId)
    if (!profile) {
      res.status(404).json({ ok: false, error: 'Your profile could not be found.' })
      return
    }

    let coinsPerUsd
    try {
      coinsPerUsd = getBetnexCoinsPerUsd()
    } catch (error) {
      res.status(503).json({ ok: false, error: error.message })
      return
    }
    const launchBalanceCoins = Number(profile.balance || 0)
    const launchBalanceUsd = coinsToBetnexUsd(launchBalanceCoins, coinsPerUsd)
    const memberAccount = getBetnexMemberAccount(profileId)
    const existingSessions = await adminRest(
      `live_casino_sessions?select=id&member_account=eq.${encodeURIComponent(memberAccount)}&limit=1`,
    )
    const existingSession = Array.isArray(existingSessions) ? existingSessions[0] : existingSessions
    const sessionId = existingSession?.id || crypto.randomUUID()
    const platform = /android|iphone|ipad|ipod|mobile/i.test(String(req.headers['user-agent'] || '')) ? 2 : 1
    const homeUrl = `${getFrontendOrigin(req)}/live-casino`

    const sessionBody = {
      profile_id: profileId,
      member_account: memberAccount,
      game_uid: game.id,
      game_name: game.name,
      game_provider: game.providerId,
      coins_per_usd: coinsPerUsd,
      launch_balance_coins: launchBalanceCoins,
      launch_balance_usd: launchBalanceUsd,
      status: 'launching',
      launched_at: new Date().toISOString(),
      last_callback_at: null,
      closed_at: null,
      failure_reason: null,
    }
    await adminRest(existingSession
      ? `live_casino_sessions?id=eq.${encodeURIComponent(sessionId)}`
      : 'live_casino_sessions', {
      method: existingSession ? 'PATCH' : 'POST',
      headers: { Prefer: 'return=minimal' },
      body: existingSession ? sessionBody : { id: sessionId, ...sessionBody },
    })

    try {
      const launch = await getBetnexClient().launchGame({
        username: memberAccount,
        gameId: game.id,
        money: launchBalanceUsd,
        platform,
        currency: 'USD',
        home_url: homeUrl,
        lang: 'en',
      })
      const launchUrl = getBetnexLaunchUrl(launch)
      if (!launchUrl) throw new Error('Betnex did not return a valid game URL.')

      await adminRest(`live_casino_sessions?id=eq.${encodeURIComponent(sessionId)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: { status: 'active' },
      })

      res.setHeader('Cache-Control', 'no-store')
      const responseData = {
        ok: true,
        launchUrl,
        sessionId,
        launchBalanceCoins: launchBalanceCoins,
        launchBalanceUsd: launchBalanceUsd,
        coinsPerUsd,
      }
      res.json(responseData)
    } catch (error) {
      await adminRest(`live_casino_sessions?id=eq.${encodeURIComponent(sessionId)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: {
          status: 'failed',
          failure_reason: String(error?.message || 'Launch failed').slice(0, 500),
          closed_at: new Date().toISOString(),
        },
      }).catch(() => {})
      const status = Number(error?.status)
      res.status(status >= 400 && status < 500 ? status : 502).json({
        ok: false,
        error: 'Unable to launch this Live Casino game right now.',
      })
    }
  },
)

app.post(
  '/api/live-casino/sessions/:sessionId/close',
  requireAuthenticatedUser,
  async (req, res) => {
    const sessionId = String(req.params.sessionId || '').trim()
    if (!isUuidLike(sessionId)) {
      res.status(400).json({ ok: false, error: 'Invalid Live Casino session.' })
      return
    }

    await adminRest(
      `live_casino_sessions?id=eq.${encodeURIComponent(sessionId)}&profile_id=eq.${encodeURIComponent(req.identity.profileId)}&status=in.(launching,active)`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: { status: 'closed', closed_at: new Date().toISOString() },
      },
    )
    const profile = await loadProfileById(req.identity.profileId)
    await emitWalletRefreshes([req.identity.profileId])
    res.setHeader('Cache-Control', 'no-store')
    res.json({ ok: true, balance: Number(profile?.balance || 0) })
  },
)

app.get('/api/health', (req, res) => {
  res.json({ ok: true })
})

const frontendDistPath = path.resolve(process.cwd(), 'dist')
const frontendIndexPath = path.join(frontendDistPath, 'index.html')

if (fs.existsSync(frontendIndexPath)) {
  app.use(express.static(frontendDistPath))
  app.get('*', (req, res, next) => {
    if (req.path === '/api' || req.path.startsWith('/api/')) {
      next()
      return
    }
    res.sendFile(frontendIndexPath)
  })
} else {
  app.get('/', (req, res) => {
    res.send('Socket server is running. Start Vite for the frontend or build the production client.')
  })
}

app.use((error, req, res, next) => {
  console.error(`[server] ${req.method} ${req.path} failed`, error)
  if (res.headersSent) {
    next(error)
    return
  }

  const status = Number(error?.status)
  const safeStatus = status >= 400 && status < 500 ? status : 500
  res.status(safeStatus).json({
    ok: false,
    error: safeStatus === 500 ? 'Internal server error' : String(error?.message || 'Request failed'),
  })
})

const PORT = Number(process.env.PORT || 4000)
const MAX_PORT_ATTEMPTS = 10

function startServer(port, attempt = 1) {
  server.listen(port, () => {
    console.log(`Server listening on port ${port}`)
  })

  server.on('error', (error) => {
    if (error && error.code === 'EADDRINUSE' && attempt < MAX_PORT_ATTEMPTS) {
      console.warn(`[server] Port ${port} busy, trying ${port + 1}`)
      server.removeAllListeners('error')
      startServer(port + 1, attempt + 1)
      return
    }

    console.error('[server] failed to start', error)
    process.exit(1)
  })
}

try {
  await rollGame.initialize()
} catch (error) {
  console.error('[roll] initialisation failed; the state route will retry', error)
}

await initializeCaseBattles()

startServer(PORT)
