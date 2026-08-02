import express from 'express'
import cors from 'cors'
import fs from 'fs'
import http from 'http'
import path from 'path'
import crypto from 'crypto'
import { Server } from 'socket.io'
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
    origin === 'http://localhost:5173' ||
    origin === 'http://127.0.0.1:5173'
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

function getSessionSigningSecret() {
  return String(
    process.env.APP_SESSION_SECRET ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    '',
  )
}

function encodeSignedToken(payload) {
  const secret = getSessionSigningSecret()
  if (!secret) throw new Error('APP_SESSION_SECRET is required for authentication.')
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto
    .createHmac('sha256', `bloxy-session:${secret}`)
    .update(encodedPayload)
    .digest('base64url')
  return `${encodedPayload}.${signature}`
}

function decodeSignedToken(token, expectedKind) {
  const secret = getSessionSigningSecret()
  const [encodedPayload, providedSignature] = String(token || '').split('.')
  if (!secret || !encodedPayload || !providedSignature) return null

  const expectedSignature = crypto
    .createHmac('sha256', `bloxy-session:${secret}`)
    .update(encodedPayload)
    .digest()
  let providedBuffer
  try {
    providedBuffer = Buffer.from(providedSignature, 'base64url')
  } catch {
    return null
  }
  if (
    providedBuffer.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedSignature)
  ) {
    return null
  }

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
    socket.emit('wallet:updated', { profileId })
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
  if (address === '::1') return '127.0.0.1'
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

  // Coinflip real-time events: broadcast created/updated coinflips
  socket.on('coinflip:create', (payload) => {
    try {
      if (!payload || !payload.room) return
      io.emit('coinflip:created', payload.room)
    } catch (err) {
      console.warn('[socket] coinflip:create handler error', err)
    }
  })

  socket.on('coinflip:update', (payload) => {
    try {
      if (!payload || !payload.room) return
      io.emit('coinflip:updated', payload.room)
    } catch (err) {
      console.warn('[socket] coinflip:update handler error', err)
    }
  })

  // Mines real-time events
  socket.on('mines:reveal', async (payload, acknowledge) => {
    try {
      const { supabaseUrl, supabaseKey } = getSupabaseAdminConfig()
      if (!supabaseUrl || !supabaseKey) {
        if (typeof acknowledge === 'function') acknowledge({ ok: false, error: 'supabase config missing' })
        return
      }

      const profileId = String(socket.data.identity?.profileId)
      const gameId = String(payload.game_id || '')
      const position = Number(payload.position)

      if (gameId === '' || isNaN(position) || position < 0 || position > 24) {
        if (typeof acknowledge === 'function') acknowledge({ ok: false, error: 'Invalid game or position.' })
        return
      }

      // Optimistic: Fetch game and calculate result
      const gameRes = await fetch(`${supabaseUrl}/rest/v1/mines_games?id=eq.${encodeURIComponent(gameId)}&select=*`, {
        headers: getSupabaseAdminHeaders(supabaseKey),
        signal: AbortSignal.timeout(2_000),
      })

      if (!gameRes.ok) {
        if (typeof acknowledge === 'function') acknowledge({ ok: false, error: 'Game not found.' })
        return
      }

      const gameData = await gameRes.json()
      const game = Array.isArray(gameData) ? gameData[0] : gameData

      if (!game || game.profile_id !== profileId) {
        if (typeof acknowledge === 'function') acknowledge({ ok: false, error: 'You can only reveal your own games.' })
        return
      }

      if (game.game_state !== 'active') {
        if (typeof acknowledge === 'function') acknowledge({ ok: false, error: 'Game is not active.' })
        return
      }

      if (game.revealed_positions.includes(position)) {
        if (typeof acknowledge === 'function') acknowledge({ ok: false, error: 'Position already revealed.' })
        return
      }

      const minePositions = Array.isArray(game.mine_positions) ? game.mine_positions : []
      const newRevealedPositions = [...game.revealed_positions, position]
      const isMine = minePositions.includes(position)

      let updateData = {
        revealed_positions: newRevealedPositions,
      }

      if (isMine) {
        updateData.game_state = 'exploded'
        updateData.multiplier = 0
        updateData.current_value = 0
      } else {
        const revealedCount = newRevealedPositions.length
        const multiplier = getMinesMultiplier(revealedCount, 25, game.mines_count)
        const currentValue = Math.round(game.wager_value * multiplier)
        
        updateData.multiplier = multiplier
        updateData.current_value = currentValue
      }

      // Create optimistic game object for immediate response
      const optimisticGame = { ...game, ...updateData }
      const publicGame = serializeMinesGame(optimisticGame)
      
      // Respond immediately with optimistic result
      if (typeof acknowledge === 'function') acknowledge({ ok: true, game: publicGame, is_mine: isMine })
      
      // Update database in background
      fetch(`${supabaseUrl}/rest/v1/mines_games?id=eq.${encodeURIComponent(gameId)}&select=*`, {
        method: 'PATCH',
        headers: getSupabaseAdminHeaders(supabaseKey, { 
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        }),
        body: JSON.stringify(updateData),
        signal: AbortSignal.timeout(2_000),
      }).then(updateRes => {
        if (updateRes.ok) {
          updateRes.json().then(updatedGameData => {
            const updatedGame = Array.isArray(updatedGameData) ? updatedGameData[0] : updatedGameData
            const finalPublicGame = serializeMinesGame(updatedGame)
            io.emit('mines:updated', finalPublicGame)
            if (updatedGame?.game_state === 'exploded') {
              void emitProfileUpdates([profileId])
            }
          })
        }
      }).catch(err => {
        console.error('[socket] mines:reveal background update error', err)
      })
    } catch (err) {
      console.error('[socket] mines:reveal error', err)
      if (typeof acknowledge === 'function') acknowledge({ ok: false, error: String(err) })
    }
  })

  socket.on('mines:cashout', async (payload, acknowledge) => {
    try {
      const { supabaseUrl, supabaseKey } = getSupabaseAdminConfig()
      if (!supabaseUrl || !supabaseKey) {
        if (typeof acknowledge === 'function') acknowledge({ ok: false, error: 'supabase config missing' })
        return
      }

      const profileId = String(socket.data.identity?.profileId)
      const gameId = String(payload.game_id || '')

      if (gameId === '') {
        if (typeof acknowledge === 'function') acknowledge({ ok: false, error: 'Invalid game ID.' })
        return
      }

      const gameRes = await fetch(`${supabaseUrl}/rest/v1/mines_games?id=eq.${encodeURIComponent(gameId)}&select=*`, {
        headers: getSupabaseAdminHeaders(supabaseKey),
        signal: AbortSignal.timeout(2_000),
      })

      if (!gameRes.ok) {
        if (typeof acknowledge === 'function') acknowledge({ ok: false, error: 'Game not found.' })
        return
      }

      const gameData = await gameRes.json()
      const game = Array.isArray(gameData) ? gameData[0] : gameData

      if (!game || game.profile_id !== profileId) {
        if (typeof acknowledge === 'function') acknowledge({ ok: false, error: 'You can only cash out your own games.' })
        return
      }

      if (game.game_state !== 'active') {
        if (typeof acknowledge === 'function') acknowledge({ ok: false, error: 'Game is not active.' })
        return
      }

      if (game.revealed_positions.length === 0) {
        if (typeof acknowledge === 'function') acknowledge({ ok: false, error: 'Reveal at least one position before cashing out.' })
        return
      }

      const winnings = game.current_value

      // Create optimistic game object for immediate response
      const optimisticGame = { 
        ...game, 
        game_state: 'cashed_out',
        cashed_out_at: new Date().toISOString()
      }
      const publicGame = serializeMinesGame(optimisticGame)
      
      // Respond immediately with optimistic result
      if (typeof acknowledge === 'function') acknowledge({ ok: true, game: publicGame, winnings })
      
      // Update database in background
      fetch(`${supabaseUrl}/rest/v1/mines_games?id=eq.${encodeURIComponent(gameId)}&select=*`, {
        method: 'PATCH',
        headers: getSupabaseAdminHeaders(supabaseKey, { 
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        }),
        body: JSON.stringify({
          game_state: 'cashed_out',
          cashed_out_at: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(2_000),
      }).then(async updateRes => {
        if (updateRes.ok) {
          const updatedGameData = await updateRes.json()
          const profile = await loadProfileById(profileId)
          
          if (profile) {
            await adminRest(`user_profiles?id=eq.${encodeURIComponent(profileId)}&balance=eq.${profile.balance}`, {
              method: 'PATCH',
              body: { balance: Number(profile.balance) + winnings },
            })
          }

          const updatedGame = Array.isArray(updatedGameData) ? updatedGameData[0] : updatedGameData
          const finalPublicGame = serializeMinesGame(updatedGame)
          io.emit('mines:updated', finalPublicGame)
          void emitProfileUpdates([profileId])
        }
      }).catch(err => {
        console.error('[socket] mines:cashout background update error', err)
      })
    } catch (err) {
      console.error('[socket] mines:cashout error', err)
      if (typeof acknowledge === 'function') acknowledge({ ok: false, error: String(err) })
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
    const profileResponse = await fetch(`https://users.roblox.com/v1/users/${encodeURIComponent(challenge.robloxId)}`, {
      signal: AbortSignal.timeout(10_000),
    })
    const robloxProfile = await profileResponse.json()
    const description = String(robloxProfile?.description || '')
    if (!profileResponse.ok || !description.toLowerCase().includes(String(challenge.phrase).toLowerCase())) {
      res.status(403).json({ ok: false, error: 'The verification phrase was not found in your Roblox profile description.' })
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

app.get('/api/auth/me', requireAuthenticatedUser, async (req, res) => {
  try {
    const profile = await loadProfileById(req.identity.profileId)
    if (!profile) {
      res.status(404).json({ ok: false, error: 'Your user profile could not be found.' })
      return
    }
    res.json({
      ok: true,
      user: {
        ...profile,
        id: req.identity.subject,
        profile_id: profile.id,
        roblox_id: profile.roblox_id || req.identity.robloxId || null,
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
  const secret = process.env.COINFLIP_SEED_SECRET || supabaseKey
  return crypto.createHash('sha256').update(String(secret)).digest()
}

function getCaseOpenSeedEncryptionKey() {
  const secret = String(process.env.CASE_OPEN_SEED_SECRET || '').trim()
  if (!secret) throw new Error('CASE_OPEN_SEED_SECRET is required for case fairness.')
  return crypto.createHash('sha256').update(secret).digest()
}

function encryptCaseServerSeed(serverSeed) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getCaseOpenSeedEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(serverSeed, 'utf8'), cipher.final()])
  return `${iv.toString('hex')}.${cipher.getAuthTag().toString('hex')}.${encrypted.toString('hex')}`
}

function decryptCaseServerSeed(encryptedSeed) {
  const [ivHex, tagHex, encryptedHex] = String(encryptedSeed || '').split('.')
  if (!ivHex || !tagHex || !encryptedHex) throw new Error('invalid encrypted case server seed')
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getCaseOpenSeedEncryptionKey(),
    Buffer.from(ivHex, 'hex'),
  )
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]).toString('utf8')
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

function encryptCoinflipServerSeed(serverSeed, supabaseKey) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getCoinflipSeedEncryptionKey(supabaseKey), iv)
  const encrypted = Buffer.concat([cipher.update(serverSeed, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}.${tag.toString('hex')}.${encrypted.toString('hex')}`
}

function decryptCoinflipServerSeed(encryptedSeed, supabaseKey) {
  const [ivHex, tagHex, encryptedHex] = String(encryptedSeed || '').split('.')
  if (!ivHex || !tagHex || !encryptedHex) throw new Error('invalid encrypted coinflip server seed')

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getCoinflipSeedEncryptionKey(supabaseKey),
    Buffer.from(ivHex, 'hex'),
  )
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]).toString('utf8')
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

app.post('/api/coinflip/create', express.json({ limit: '24kb' }), requireAuthenticatedUser, async (req, res) => {
  const { supabaseUrl, supabaseKey } = getSupabaseAdminConfig()
  if (!supabaseUrl || !supabaseKey) {
    res.status(500).json({ ok: false, error: 'supabase config missing' })
    return
  }

  const payload = req.body || {}
  const creator_uuid = String(req.identity.profileId)
  const creator_username = String(payload.creator_username || '')
  const creator_side = String(payload.creator_side || '').trim().toLowerCase() === 'tails'
    ? 'tails'
    : 'heads'
  const assigned_opponent_side = creator_side === 'heads' ? 'tails' : 'heads'
  const creator_avatar_url = payload.creator_avatar_url || payload.creator_avatar || null

  try {
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

    const createdRoom = Array.isArray(data) ? data[0] : data
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

      io.emit('coinflip:updated', updatedRoom)
      res.json({ ok: true, data: updatedRoom })
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
  const opponent_username = String(payload.opponent_username || '')
  const opponent_avatar_url = payload.opponent_avatar_url || payload.opponent_avatar || null

  if (!roomId) {
    res.status(400).json({ ok: false, error: 'roomId is required' })
    return
  }

  try {
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
    io.emit('coinflip:updated', updatedRoom || { id: roomId })
    res.json({ ok: true, data: updatedRoom })
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

function generateMinePositions(totalPositions, minesCount, serverSeed, clientSeed, nonce, gameId) {
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

function getMinesSeedEncryptionKey(supabaseKey) {
  const secret = String(process.env.MINES_SEED_SECRET || process.env.COINFLIP_SEED_SECRET || supabaseKey || '').trim()
  if (!secret) throw new Error('MINES_SEED_SECRET is required for Mines fairness.')
  return crypto.createHash('sha256').update(`mines:${secret}`).digest()
}

function decryptMinesServerSeedWithKey(encryptedSeed, encryptionKey) {
  const [ivHex, tagHex, encryptedHex] = String(encryptedSeed || '').split('.')
  if (!ivHex || !tagHex || !encryptedHex) throw new Error('invalid encrypted mines server seed')
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]).toString('utf8')
}

function encryptMinesServerSeed(serverSeed, supabaseKey) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getMinesSeedEncryptionKey(supabaseKey), iv)
  const encrypted = Buffer.concat([cipher.update(serverSeed, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}.${tag.toString('hex')}.${encrypted.toString('hex')}`
}

function decryptMinesServerSeed(encryptedSeed, supabaseKey) {
  try {
    return decryptMinesServerSeedWithKey(encryptedSeed, getMinesSeedEncryptionKey(supabaseKey))
  } catch (error) {
    // Games created before the dedicated Mines key used the Coinflip-derived key.
    return decryptMinesServerSeedWithKey(encryptedSeed, getCoinflipSeedEncryptionKey(supabaseKey))
  }
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
      const expectedMines = generateMinePositions(
        candidate * candidate,
        Number(game?.mines_count) || 3,
        serverSeed,
        game?.client_seed,
        game?.nonce,
        game?.id,
      )

      if (
        expectedMines.length === actualMines.length &&
        expectedMines.every((position, index) => position === actualMines[index])
      ) {
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
  const { supabaseUrl, supabaseKey } = getSupabaseAdminConfig()
  if (!supabaseUrl || !supabaseKey) {
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

  let balanceBeforeWager = null
  let balanceAfterWager = null
  let gameCreated = false

  try {
    const activeGames = await adminRest(
      `mines_games?profile_id=eq.${encodeURIComponent(profileId)}&game_state=eq.active&select=id&limit=1`,
    )
    if (Array.isArray(activeGames) && activeGames.length > 0) {
      return res.status(409).json({
        ok: false,
        error: 'You already have an active Mines game.',
      })
    }

    // Check user balance
    const profile = await loadProfileById(profileId)
    if (!profile) {
      return res.status(404).json({ ok: false, error: 'Profile not found.' })
    }

    balanceBeforeWager = Number(profile.balance || 0)
    if (balanceBeforeWager < wagerValue) {
      return res.status(400).json({ ok: false, error: 'Insufficient balance.' })
    }

    // Deduct wager from balance
    balanceAfterWager = balanceBeforeWager - wagerValue
    await adminRest(`user_profiles?id=eq.${encodeURIComponent(profileId)}&balance=eq.${profile.balance}`, {
      method: 'PATCH',
      body: { balance: balanceAfterWager },
    })

    // Commit this game to the player's active Mines fairness seed and consume
    // one nonce before storing the board.
    const gameId = crypto.randomUUID()
    const fairnessState = await ensureMinesFairnessState(profileId, supabaseKey)
    const serverSeed = validateMinesFairnessState(fairnessState, supabaseKey)
    const clientSeed = String(fairnessState.client_seed)
    const nonce = Number(fairnessState.nonce || 0)
    if (!Number.isSafeInteger(nonce) || nonce < 0) throw new Error('Mines fairness nonce is invalid.')

    await callRainRpc('claim_mines_fairness_nonce', {
      p_profile_id: profileId,
      p_expected_seed_id: fairnessState.seed_id,
      p_expected_server_seed_hash: fairnessState.server_seed_hash,
      p_expected_nonce: nonce,
    })

    const minePositions = generateMinePositions(totalPositions, minesCount, serverSeed, clientSeed, nonce, gameId)

    const gameData = {
      id: gameId,
      profile_id: profileId,
      username: profile.username,
      avatar_url: profile.avatar_url,
      wager_value: wagerValue,
      mines_count: minesCount,
      revealed_positions: [],
      mine_positions: minePositions,
      game_state: 'active',
      multiplier: 1.0,
      current_value: 0,
      server_seed_encrypted: encryptMinesServerSeed(serverSeed, supabaseKey),
      server_seed_hash: fairnessState.server_seed_hash,
      fairness_seed_id: fairnessState.seed_id,
      client_seed: clientSeed,
      nonce,
      grid_size: gridSize,
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/mines_games?select=*`, {
      method: 'POST',
      headers: getSupabaseAdminHeaders(supabaseKey, {
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      }),
      body: JSON.stringify(gameData),
      signal: AbortSignal.timeout(10_000),
    })
    const responseText = await response.text()

    if (!response.ok) {
      console.warn('[api/mines/create] failed to create game', response.status, responseText)
      throw new Error(`Failed to create mines game: ${responseText}`)
    }
    gameCreated = true

    let createdGame
    try {
      createdGame = responseText ? JSON.parse(responseText) : null
    } catch (parseError) {
      console.error('[api/mines/create] failed to parse response:', responseText)
      throw new Error(`Failed to parse mines game response: ${parseError.message}`)
    }
    
    const storedGame = Array.isArray(createdGame) ? createdGame[0] : createdGame
    const returnGame = storedGame ? { ...storedGame, grid_size: gridSize } : storedGame

    // Emit real-time update
    const publicGame = serializeMinesGame(returnGame)
    io.emit('mines:created', publicGame)

    res.json({ ok: true, game: publicGame })
  } catch (err) {
    if (!gameCreated && balanceBeforeWager != null && balanceAfterWager != null) {
      try {
        await adminRest(`user_profiles?id=eq.${encodeURIComponent(profileId)}&balance=eq.${balanceAfterWager}`, {
          method: 'PATCH',
          body: { balance: balanceBeforeWager },
        })
      } catch (refundError) {
        console.error('[api/mines/create] failed to restore wager after create error', refundError)
      }
    }
    console.error('[api/mines/create] error', err)
    res.status(500).json({ ok: false, error: String(err) })
  }
})

// Reveal a position in mines game
app.post('/api/mines/reveal', express.json({ limit: '24kb' }), requireAuthenticatedUser, async (req, res) => {
  const { supabaseUrl, supabaseKey } = getSupabaseAdminConfig()
  if (!supabaseUrl || !supabaseKey) {
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
    const gameRes = await fetch(`${supabaseUrl}/rest/v1/mines_games?id=eq.${encodeURIComponent(gameId)}&select=*`, {
      headers: getSupabaseAdminHeaders(supabaseKey),
      signal: AbortSignal.timeout(10_000),
    })

    if (!gameRes.ok) {
      const txt = await gameRes.text()
      console.warn('[api/mines/reveal] failed to fetch game', gameRes.status, txt)
      return res.status(404).json({ ok: false, error: 'Game not found.' })
    }

    const gameData = await gameRes.json()
    const game = Array.isArray(gameData) ? gameData[0] : gameData

    if (!game || game.profile_id !== profileId) {
      return res.status(403).json({ ok: false, error: 'You can only reveal your own games.' })
    }

    if (game.game_state !== 'active') {
      return res.status(400).json({ ok: false, error: 'Game is not active.' })
    }

    const gridSize = resolveMinesGridSize(game, supabaseKey)
    const totalPositions = gridSize * gridSize
    if (position >= totalPositions) {
      return res.status(400).json({ ok: false, error: 'Invalid game or position.' })
    }

    if (game.revealed_positions.includes(position)) {
      return res.status(400).json({ ok: false, error: 'Position already revealed.' })
    }

    const minePositions = Array.isArray(game.mine_positions) ? game.mine_positions : []
    const newRevealedPositions = [...game.revealed_positions, position]
    const isMine = minePositions.includes(position)

    let updateData = {
      revealed_positions: newRevealedPositions,
    }

    if (isMine) {
      updateData.game_state = 'exploded'
      updateData.multiplier = 0
      updateData.current_value = 0
    } else {
      const revealedCount = newRevealedPositions.length
      const multiplier = getMinesMultiplier(revealedCount, totalPositions, game.mines_count)
      const currentValue = Math.round(game.wager_value * multiplier)
      
      updateData.multiplier = multiplier
      updateData.current_value = currentValue
    }

    const updateRes = await fetch(`${supabaseUrl}/rest/v1/mines_games?id=eq.${encodeURIComponent(gameId)}&select=*`, {
      method: 'PATCH',
      headers: getSupabaseAdminHeaders(supabaseKey, { 
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }),
      body: JSON.stringify(updateData),
      signal: AbortSignal.timeout(10_000),
    })

    const responseText = await updateRes.text()

    if (!updateRes.ok) {
      console.warn('[api/mines/reveal] failed to update game', updateRes.status, responseText)
      throw new Error(`Failed to update mines game: ${responseText}`)
    }

    let updatedGameData
    try {
      updatedGameData = responseText ? JSON.parse(responseText) : null
    } catch (parseError) {
      console.error('[api/mines/reveal] failed to parse response:', responseText)
      throw new Error(`Failed to parse mines game response: ${parseError.message}`)
    }
    
    const updatedGame = Array.isArray(updatedGameData) ? updatedGameData[0] : updatedGameData

    // If exploded, refund nothing (already lost wager)
    // If not exploded, user can continue or cash out

    const publicGame = serializeMinesGame({ ...updatedGame, grid_size: gridSize })
    io.emit('mines:updated', publicGame)
    if (updatedGame?.game_state === 'exploded') {
      void emitProfileUpdates([profileId])
    }

    res.json({ ok: true, game: publicGame, is_mine: isMine })
  } catch (err) {
    console.error('[api/mines/reveal] error', err)
    res.status(500).json({ ok: false, error: String(err) })
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

startServer(PORT)
