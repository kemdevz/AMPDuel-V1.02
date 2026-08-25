import express from 'express'
import cors from 'cors'
import fs from 'fs'
import http from 'http'
import path from 'path'
import crypto from 'crypto'
import { Server } from 'socket.io'

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
    origin === 'http://localhost:5173' ||
    origin === 'https://ampflip-back-o9jr.onrender.com' || // Add your Render URL
    origin.startsWith('https://') // Allow all HTTPS for development
}
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
    credentials: true,
  },
  maxHttpBufferSize: 64 * 1024,
  pingInterval: 10_000,
  pingTimeout: 10_000,
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
const USER_COIN_TIP_CHAT_THRESHOLD = 10000
const USER_ITEM_TIP_CHAT_THRESHOLD = 100000
const RECAPTCHA_TEST_SECRET_KEY = '6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe'

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

function isLocalDevelopmentRequest(req) {
  if (process.env.RENDER === 'true') return false

  const rawHostname = String(req?.hostname || req?.headers?.host || '').trim().toLowerCase()
  const closingBracketIndex = rawHostname.indexOf(']')
  const hostname = rawHostname.startsWith('[') && closingBracketIndex > 0
    ? rawHostname.slice(1, closingBracketIndex)
    : rawHostname.replace(/:\d+$/, '')

  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

function isSecureRequest(req) {
  if (isLocalDevelopmentRequest(req)) return false
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

async function verifyHcaptchaToken(token, ipAddress, req) {
  const isLocalRequest = isLocalDevelopmentRequest(req)
  const isDevelopmentRuntime = process.env.RENDER !== 'true' && process.env.NODE_ENV !== 'production'
  const isTestMode = isLocalRequest || isDevelopmentRuntime || process.env.HCAPTCHA_TEST_MODE === 'true'
  const secret = isTestMode
    ? '0x0000000000000000000000000000000000000000'
    : String(process.env.HCAPTCHA_SECRET_KEY || '').trim()
  const expectedSitekey = isTestMode
    ? '10000000-ffff-ffff-ffff-000000000001'
    : String(process.env.HCAPTCHA_SITE_KEY || process.env.VITE_HCAPTCHA_SITE_KEY || '').trim()
  const normalizedToken = typeof token === 'string' ? token.trim() : ''

  if (!secret) return { ok: false, status: 503, error: 'hCaptcha is not configured on the server.' }
  if (!normalizedToken) return { ok: false, status: 400, error: 'Complete the security check before continuing.' }
  if (normalizedToken.length > 16_384) {
    return { ok: false, status: 400, error: 'The security check response is invalid. Please try again.' }
  }

  // hCaptcha's localhost widget uses its documented test key. Once that
  // widget has supplied a non-empty token, keep local development independent
  // from the external verification endpoint. Production always continues
  // through server-side verification with the configured secret.
  if (isLocalRequest || isDevelopmentRuntime) return { ok: true }

  try {
    const verificationBody = new URLSearchParams({ secret, response: normalizedToken })
    if (!isTestMode && ipAddress && ipAddress !== 'unknown') verificationBody.set('remoteip', ipAddress)
    if (expectedSitekey) verificationBody.set('sitekey', expectedSitekey)

    const response = await fetch('https://api.hcaptcha.com/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: verificationBody,
      signal: AbortSignal.timeout(8_000),
    })
    const result = await response.json().catch(() => null)
    if (!response.ok || !result?.success) {
      return { ok: false, status: 403, error: 'Security verification failed. Please try again.' }
    }

    return { ok: true }
  } catch {
    return { ok: false, status: 503, error: 'Security verification is temporarily unavailable.' }
  }
}

app.get('/api/public-config', (req, res) => {
  const isTestMode = isLocalDevelopmentRequest(req) || process.env.NODE_ENV !== 'production' || process.env.HCAPTCHA_TEST_MODE === 'true'
  const hcaptchaSiteKey = isTestMode
    ? '10000000-ffff-ffff-ffff-000000000001'
    : String(process.env.HCAPTCHA_SITE_KEY || process.env.VITE_HCAPTCHA_SITE_KEY || '').trim()

  res.setHeader('Cache-Control', 'no-store')
  res.json({ hcaptcha_site_key: hcaptchaSiteKey })
})

async function callDatabaseRpc(functionName, payload) {
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
    throw new Error(result?.message || result?.error || text || `Database operation failed (${response.status}).`)
  }

  return result
}

function formatDiscordValue(value) {
  const numericValue = Number(value ?? 0)
  if (!Number.isFinite(numericValue)) return '0'
  return numericValue.toLocaleString('en-US')
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

function getOnlineCount() {
  const uniqueVisitors = new Set()

  for (const socket of io.of('/').sockets.values()) {
    if (!socket.connected) continue
    const accountId = String(socket.data?.accountId || '').trim()
    uniqueVisitors.add(accountId ? `account:${accountId}` : `socket:${socket.id}`)
  }

  return uniqueVisitors.size
}

function emitOnlineCount() {
  const count = getOnlineCount()
  io.emit('online:count', count)
  return count
}

const chatServerInstanceId = crypto.randomUUID()

io.on('connection', (socket) => {
  socket.data.accountId = socket.data.identity?.profileId || null
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
  emitOnlineCount()

  socket.on('online:count:get', (acknowledge) => {
    const count = getOnlineCount()
    if (typeof acknowledge === 'function') acknowledge(count)
    else socket.emit('online:count', count)
  })

  socket.on('online:identify', () => {
    socket.data.accountId = socket.data.identity?.profileId || null
    emitOnlineCount()
  })

  socket.on('chat:message', async (message, acknowledge) => {
    if (!await isSiteServiceEnabled('chat')) {
      if (typeof acknowledge === 'function') acknowledge({ ok: false, error: 'Chat is currently paused.' })
      return
    }
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
    const messageText = String(message.text || message.message || message.content || '').trim().slice(0, 100)
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


  socket.on('disconnect', () => {
    // Recount on the next turn, after Socket.IO removes this socket from the
    // namespace collection, so the departing visitor cannot remain counted.
    setTimeout(emitOnlineCount, 0)
  })
})

// Periodically reconcile presence in case a browser or mobile connection
// disappears without completing a graceful disconnect handshake.
setInterval(emitOnlineCount, 5_000)

const ROBLOX_PHRASE_WORDS = [
  'relic', 'foam', 'tracker', 'brave', 'rose', 'moss', 'monk', 'neat', 'swimmer',
  'fox', 'legend', 'apple', 'moon', 'crystal', 'wolf', 'shadow', 'neon', 'blaze',
]
const ROBLOX_PHRASE_WORD_COUNT = 6
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
  return words.slice(0, ROBLOX_PHRASE_WORD_COUNT).join(' ')
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
            'User-Agent': 'Mozilla/5.0 (compatible; AMPDuelVerification/1.02)',
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

  const captchaVerification = await verifyHcaptchaToken(req.body?.captcha_token, ipAddress, req)
  if (!captchaVerification.ok) {
    res.status(captchaVerification.status || 403).json({
      ok: false,
      error: captchaVerification.error || 'Complete the security check before continuing.',
    })
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
    if (profile.is_banned) {
      res.status(403).json({ ok: false, error: 'This account has been banned.' })
      return
    }
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
    if (profile.is_banned) {
      clearSessionCookie(res, req)
      res.status(403).json({ ok: false, error: 'This account has been banned.' })
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

async function requireAdminProfile(req, res) {
  const profile = await loadProfileById(req.identity.profileId)
  const role = String(profile?.role || '').trim().toLowerCase()
  if (!profile || !['admin', 'owner'].includes(role)) {
    res.status(403).json({ ok: false, error: 'Admin access is required.' })
    return null
  }
  return profile
}

const SITE_SERVICE_KEYS = ['coinflip', 'chat']
const DEFAULT_SITE_SERVICES = Object.fromEntries(SITE_SERVICE_KEYS.map((key) => [key, true]))
let siteServiceSettingsCache = { ...DEFAULT_SITE_SERVICES }
let siteServiceSettingsExpiresAt = 0
let siteServiceSettingsWarningShown = false
let adminGeneralSnapshotCache = null
let adminGeneralSnapshotExpiresAt = 0

function invalidateAdminGeneralSnapshot(changeType = 'activity') {
  adminGeneralSnapshotCache = null
  adminGeneralSnapshotExpiresAt = 0
  io.emit('admin:general:changed', { type: changeType, changed_at: new Date().toISOString() })
}

async function loadSiteServiceSettings({ force = false, tolerateMissing = true } = {}) {
  if (!force && siteServiceSettingsExpiresAt > Date.now()) return siteServiceSettingsCache

  try {
    const rows = await adminRest('site_service_settings?select=service_key,enabled')
    const next = { ...DEFAULT_SITE_SERVICES }
    for (const row of Array.isArray(rows) ? rows : []) {
      const key = String(row?.service_key || '')
      if (SITE_SERVICE_KEYS.includes(key)) next[key] = Boolean(row.enabled)
    }
    siteServiceSettingsCache = next
    siteServiceSettingsExpiresAt = Date.now() + 5_000
    siteServiceSettingsWarningShown = false
    return next
  } catch (error) {
    const missingTable = error?.code === '42P01' || /site_service_settings.*does not exist/i.test(error?.message || '')
    if (!tolerateMissing || !missingTable) throw error
    if (!siteServiceSettingsWarningShown) {
      console.warn('[services] settings table is missing; all services remain enabled until its migration is applied.')
      siteServiceSettingsWarningShown = true
    }
    return { ...DEFAULT_SITE_SERVICES }
  }
}

async function isSiteServiceEnabled(serviceKey) {
  const settings = await loadSiteServiceSettings()
  return settings[serviceKey] !== false
}

async function loadAllAdminRows(pathname, pageSize = 1000) {
  const rows = []
  const separator = pathname.includes('?') ? '&' : '?'
  for (let offset = 0; ; offset += pageSize) {
    const page = await adminRest(`${pathname}${separator}limit=${pageSize}&offset=${offset}`)
    const pageRows = Array.isArray(page) ? page : []
    rows.push(...pageRows)
    if (pageRows.length < pageSize) return rows
  }
}

function normalizeAdminActivityItem(item = {}) {
  return {
    id: item.id || item.item_uuid || item.item_id || crypto.randomUUID(),
    item_id: item.item_id || null,
    name: String(item.name || item.item_name || 'Unknown item'),
    value: Math.max(0, Number(item.value) || 0),
    image_url: item.image_url || item.image || null,
    type: item.type || item.item_type || null,
  }
}

app.get('/api/admin/general', requireAuthenticatedUser, async (req, res) => {
  try {
    if (!await requireAdminProfile(req, res)) return
    if (adminGeneralSnapshotCache && adminGeneralSnapshotExpiresAt > Date.now()) {
      res.setHeader('Cache-Control', 'private, no-cache')
      res.json(adminGeneralSnapshotCache)
      return
    }

    const [profiles, taxStock, deposits, withdrawals, services] = await Promise.all([
      loadAllAdminRows('user_profiles?select=id,username,avatar_url,avatar_headshot_url,played,won,lost'),
      loadAllAdminRows('tax_stock?select=value'),
      adminRest('deposits?select=id,profile_id,username,items,total_value,deposited_at&order=deposited_at.desc&limit=100'),
      adminRest('withdraws?select=*&canceled=eq.false&order=withdrawed_at.desc&limit=250'),
      loadSiteServiceSettings({ force: true }),
    ])

    const profileById = new Map(profiles.map((profile) => [String(profile.id), profile]))
    const depositActivity = (Array.isArray(deposits) ? deposits : []).map((deposit) => {
      const profile = profileById.get(String(deposit.profile_id || '')) || {}
      return {
        id: `deposit:${deposit.id}`,
        type: 'Deposit',
        date: deposit.deposited_at,
        amount: Math.max(0, Number(deposit.total_value) || 0),
        items: (Array.isArray(deposit.items) ? deposit.items : []).map(normalizeAdminActivityItem),
        player: {
          id: deposit.profile_id || null,
          name: deposit.username || profile.username || 'Unknown user',
          avatar: profile.avatar_headshot_url || profile.avatar_url || null,
        },
      }
    })

    const withdrawalGroups = new Map()
    for (const withdrawal of Array.isArray(withdrawals) ? withdrawals : []) {
      const userId = String(withdrawal.user_id || '')
      const groupKey = String(withdrawal.external_trade_id || '').trim()
        || `${userId}:${String(withdrawal.withdrawed_at || withdrawal.id)}`
      const profile = profileById.get(userId) || {}
      const current = withdrawalGroups.get(groupKey) || {
        id: `withdraw:${groupKey}`,
        type: 'Withdraw',
        date: withdrawal.completed_at || withdrawal.withdrawed_at,
        amount: 0,
        items: [],
        player: {
          id: withdrawal.user_id || null,
          name: withdrawal.user_name || profile.username || 'Unknown user',
          avatar: profile.avatar_headshot_url || profile.avatar_url || null,
        },
      }
      const item = normalizeAdminActivityItem(withdrawal)
      current.amount -= item.value
      current.items.push(item)
      const currentDate = new Date(current.date || 0).getTime()
      const nextDate = new Date(withdrawal.completed_at || withdrawal.withdrawed_at || 0).getTime()
      if (nextDate > currentDate) current.date = withdrawal.completed_at || withdrawal.withdrawed_at
      withdrawalGroups.set(groupKey, current)
    }

    const activity = [...depositActivity, ...withdrawalGroups.values()]
      .sort((left, right) => new Date(right.date || 0).getTime() - new Date(left.date || 0).getTime())
      .slice(0, 100)

    const sumValues = (rows) => rows.reduce((sum, row) => sum + Math.max(0, Number(row.value) || 0), 0)
    const wagered = profiles.reduce((sum, profile) => sum + Math.max(0, Number(profile.played) || 0), 0)
    const profit = profiles.reduce((sum, profile) => (
      sum + (Number(profile.lost) || 0) - (Number(profile.won) || 0)
    ), 0)

    const responsePayload = {
      ok: true,
      stats: {
        users: profiles.length,
        wagered,
        stock: sumValues(taxStock),
        profit,
      },
      activity,
      services,
    }
    adminGeneralSnapshotCache = responsePayload
    adminGeneralSnapshotExpiresAt = Date.now() + 10_000
    res.setHeader('Cache-Control', 'private, no-cache')
    res.json(responsePayload)
  } catch (error) {
    console.error('[admin/general] failed', error)
    res.status(error?.status || 500).json({ ok: false, error: error?.message || 'Unable to load the admin overview.' })
  }
})

app.patch('/api/admin/services/:serviceKey', express.json({ limit: '2kb' }), requireAuthenticatedUser, async (req, res) => {
  try {
    const profile = await requireAdminProfile(req, res)
    if (!profile) return
    const serviceKey = String(req.params.serviceKey || '').trim().toLowerCase()
    if (!SITE_SERVICE_KEYS.includes(serviceKey) || typeof req.body?.enabled !== 'boolean') {
      res.status(400).json({ ok: false, error: 'Select a valid service setting.' })
      return
    }

    const rows = await adminRest('site_service_settings?on_conflict=service_key&select=service_key,enabled', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: [{
        service_key: serviceKey,
        enabled: req.body.enabled,
        updated_by: String(profile.id),
        updated_at: new Date().toISOString(),
      }],
    })
    const setting = Array.isArray(rows) ? rows[0] : rows
    siteServiceSettingsCache = { ...siteServiceSettingsCache, [serviceKey]: Boolean(setting?.enabled) }
    siteServiceSettingsExpiresAt = Date.now() + 5_000
    if (adminGeneralSnapshotCache) {
      adminGeneralSnapshotCache = {
        ...adminGeneralSnapshotCache,
        services: { ...adminGeneralSnapshotCache.services, [serviceKey]: Boolean(setting?.enabled) },
      }
    }
    io.emit('services:updated', siteServiceSettingsCache)
    res.json({ ok: true, service_key: serviceKey, enabled: Boolean(setting?.enabled) })
  } catch (error) {
    console.error('[admin/services] failed', error)
    const missingTable = error?.code === '42P01' || /site_service_settings.*does not exist/i.test(error?.message || '')
    res.status(missingTable ? 503 : error?.status || 500).json({
      ok: false,
      error: missingTable
        ? 'Run the consolidated Supabase bootstrap migration first.'
        : error?.message || 'Unable to update the service.',
    })
  }
})

function normalizeAdminPlayer(profile = {}) {
  return {
    id: String(profile.id || ''),
    username: String(profile.username || 'Unknown player'),
    roblox_id: profile.roblox_id ? String(profile.roblox_id) : null,
    avatar_url: profile.avatar_url || null,
    avatar_headshot_url: profile.avatar_headshot_url || profile.avatar_url || null,
    role: String(profile.role || 'player'),
    level: Math.max(1, Number(profile.level) || 1),
    coin_balance: Math.max(0, Number(profile.balance) || 0),
    wagered: Math.max(0, Number(profile.played) || 0),
    won: Math.max(0, Number(profile.won) || 0),
    lost: Math.max(0, Number(profile.lost) || 0),
    created_at: profile.created_at || null,
    is_banned: Boolean(profile.is_banned),
  }
}

async function loadAdminPlayerRows() {
  return loadAllAdminRows('user_profiles?select=*&order=username.asc')
}

app.get('/api/admin/players', requireAuthenticatedUser, async (req, res) => {
  try {
    if (!await requireAdminProfile(req, res)) return
    const query = String(req.query.q || '').trim().toLowerCase().slice(0, 100)
    const profiles = await loadAdminPlayerRows()
    const matchedPlayers = profiles
      .map(normalizeAdminPlayer)
      .filter((player) => !query || `${player.username} ${player.id} ${player.roblox_id || ''}`.toLowerCase().includes(query))
      .slice(0, 75)
    const playerIds = matchedPlayers.map((player) => player.id).filter(Boolean)
    const inventory = playerIds.length
      ? await loadAllAdminRows(`inventory_items?select=user_id,value&user_id=in.(${playerIds.map(encodeURIComponent).join(',')})`)
      : []
    const itemBalanceByPlayer = new Map()
    for (const item of inventory) {
      const ownerId = String(item.user_id || '')
      itemBalanceByPlayer.set(ownerId, (itemBalanceByPlayer.get(ownerId) || 0) + Math.max(0, Number(item.value) || 0))
    }
    const players = matchedPlayers.map((player) => ({
      ...player,
      item_balance: itemBalanceByPlayer.get(player.id) || 0,
    }))
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ ok: true, players })
  } catch (error) {
    console.error('[admin/players] failed', error)
    res.status(error?.status || 500).json({ ok: false, error: error?.message || 'Unable to search players.' })
  }
})

app.get('/api/admin/players/:profileId/inventory', requireAuthenticatedUser, async (req, res) => {
  try {
    if (!await requireAdminProfile(req, res)) return
    const profileId = String(req.params.profileId || '').trim()
    if (!profileId || profileId.length > 200) {
      res.status(400).json({ ok: false, error: 'Select a valid player.' })
      return
    }
    const rows = await adminRest(
      `inventory_items?select=*&user_id=eq.${encodeURIComponent(profileId)}&order=created_at.desc`,
    )
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ ok: true, items: Array.isArray(rows) ? rows : [] })
  } catch (error) {
    console.error('[admin/players/inventory] failed', error)
    res.status(error?.status || 500).json({ ok: false, error: error?.message || 'Unable to load the player inventory.' })
  }
})

app.patch('/api/admin/players/:profileId/ban', express.json({ limit: '2kb' }), requireAuthenticatedUser, async (req, res) => {
  try {
    const adminProfile = await requireAdminProfile(req, res)
    if (!adminProfile) return
    const profileId = String(req.params.profileId || '').trim()
    const banned = req.body?.banned
    if (!profileId || profileId.length > 200 || typeof banned !== 'boolean') {
      res.status(400).json({ ok: false, error: 'Select a valid player and ban state.' })
      return
    }
    if (profileId === String(adminProfile.id)) {
      res.status(400).json({ ok: false, error: 'You cannot ban your own account.' })
      return
    }
    await adminRest(`user_profiles?id=eq.${encodeURIComponent(profileId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: {
        is_banned: banned,
        banned_at: banned ? new Date().toISOString() : null,
        banned_by: banned ? String(adminProfile.id) : null,
        updated_at: new Date().toISOString(),
      },
    })
    if (banned) {
      await adminRest(`user_sessions?user_id=eq.${encodeURIComponent(profileId)}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      })
      for (const socket of io.sockets.sockets.values()) {
        if (String(socket.data.identity?.profileId || '') === profileId) socket.disconnect(true)
      }
    }
    res.json({ ok: true, profile_id: profileId, is_banned: banned })
  } catch (error) {
    console.error('[admin/player/ban] failed', error)
    const missingColumn = isMissingDatabaseColumn(error, 'is_banned')
    res.status(missingColumn ? 503 : error?.status || 500).json({
      ok: false,
      error: missingColumn
        ? 'Run the consolidated Supabase bootstrap migration first.'
        : error?.message || 'Unable to update the player ban.',
    })
  }
})

function serviceKeyForApiMutation(req) {
  if (!isUnsafeHttpMethod(req.method)) return null
  const route = String(req.originalUrl || '').split('?')[0]
  if (/^\/api\/coinflip\/(?:create|join)$/.test(route)) return 'coinflip'
  return null
}

app.use('/api', async (req, res, next) => {
  const serviceKey = serviceKeyForApiMutation(req)
  if (!serviceKey || await isSiteServiceEnabled(serviceKey)) {
    next()
    return
  }
  res.status(503).json({ ok: false, error: 'This service is currently paused.' })
})

function isAdminInventoryCatalogItemAllowed(item) {
  const name = String(item?.name || '')
  const isEligiblePet = /\b(?:huge|titanic|gargantuan)\b/i.test(name)
  const isGemPackage = /\bgems?\b/i.test(name)
  return Number(item?.value) > 0
    && (isEligiblePet || isGemPackage)
    && !/\b(?:booth|enchant|hoverboard|egg)\s*$/i.test(name)
}

app.get('/api/admin/items', requireAuthenticatedUser, async (req, res) => {
  try {
    if (!await requireAdminProfile(req, res)) return

    const pageSize = 1000
    const items = []
    for (let offset = 0; ; offset += pageSize) {
      const page = await adminRest(
        `items?select=id,name,value,image_url,type&order=value.desc,id.asc&limit=${pageSize}&offset=${offset}`,
      )
      const rows = Array.isArray(page) ? page : []
      items.push(...rows)
      if (rows.length < pageSize) break
    }

    res.setHeader('Cache-Control', 'no-store')
    res.json({ ok: true, items: items.filter(isAdminInventoryCatalogItemAllowed) })
  } catch (error) {
    console.error('[admin/items] failed to load items', error)
    res.status(error?.status || 500).json({ ok: false, error: error?.message || 'Unable to load the item database.' })
  }
})

app.post('/api/admin/items/add-to-inventory', express.json({ limit: '16kb' }), requireAuthenticatedUser, async (req, res) => {
  try {
    const profile = await requireAdminProfile(req, res)
    if (!profile) return

    const selections = Array.isArray(req.body?.items) ? req.body.items.map((selection) => ({
      itemId: String(selection?.item_id || '').trim(),
      quantity: Number(selection?.quantity),
    })) : []
    const itemIds = selections.map((selection) => selection.itemId)
    const totalQuantity = selections.reduce((total, selection) => total + selection.quantity, 0)
    if (
      !selections.length
      || selections.length > 100
      || new Set(itemIds).size !== itemIds.length
      || selections.some((selection) => !isUuidLike(selection.itemId) || !Number.isInteger(selection.quantity) || selection.quantity < 1 || selection.quantity > 100)
      || totalQuantity > 500
    ) {
      res.status(400).json({ ok: false, error: 'Select valid quantities of up to 100 per item and 500 items per add.' })
      return
    }

    const catalogItems = await adminRest(
      `items?select=id,name,value,image_url,type&id=in.(${itemIds.join(',')})`,
    )
    if (!Array.isArray(catalogItems) || catalogItems.length !== itemIds.length) {
      res.status(409).json({ ok: false, error: 'One or more selected catalog items are no longer available.' })
      return
    }
    if (catalogItems.some((item) => !isAdminInventoryCatalogItemAllowed(item))) {
      res.status(400).json({ ok: false, error: 'One or more selected items are not eligible inventory pets.' })
      return
    }

    const itemsById = new Map(catalogItems.map((item) => [String(item.id), item]))
    const inventoryRows = selections.flatMap(({ itemId, quantity }) => {
      const item = itemsById.get(itemId)
      return Array.from({ length: quantity }, () => ({
          item_id: item.id,
          user_id: String(profile.id),
          name: String(item.name || 'Unknown item'),
          value: Math.max(0, Number(item.value) || 0),
          image_url: item.image_url || null,
          type: item.type || null,
        }))
    })

    await adminRest('inventory_items', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: inventoryRows,
    })
    void emitWalletRefreshes([profile.id])
    res.status(201).json({
      ok: true,
      added_count: inventoryRows.length,
    })
  } catch (error) {
    console.error('[admin/items/add-to-inventory] failed', error)
    res.status(error?.status || 500).json({ ok: false, error: error?.message || 'Unable to add the selected items to your inventory.' })
  }
})

function historyItemValue(items) {
  return (Array.isArray(items) ? items : []).reduce((sum, item) => (
    sum + Math.max(0, Number(item?.value) || 0)
  ), 0)
}

app.get('/api/profile/game-history', requireAuthenticatedUser, async (req, res) => {
  const profileId = String(req.identity.profileId)
  const encodedProfileId = encodeURIComponent(profileId)
  try {
    const coinflipRows = await adminRest(
      `coinflip_games?select=*&or=(creator_uuid.eq.${encodedProfileId},opponent_uuid.eq.${encodedProfileId})&order=created_at.desc&limit=250`,
    )
    const history = []
    for (const game of Array.isArray(coinflipRows) ? coinflipRows : []) {
      if (!game.result && !game.canceled) continue
      const creator = String(game.creator_uuid || '') === profileId
      const wager = historyItemValue(creator ? game.creator_items : game.opponent_items)
      const won = String(game.winner_uuid || '') === profileId
      const grossPot = historyItemValue(game.creator_items) + historyItemValue(game.opponent_items)
      const payout = won ? Math.max(0, Number(game.net_payout_value) || grossPot) : 0
      history.push({
        id: `coinflip:${game.id}`,
        game: 'Coinflip',
        filter: 'coinflip',
        status: game.canceled ? 'CANCELLED' : won ? 'WON' : 'LOST',
        amount: Math.max(0, Math.round(wager)),
        profit: game.canceled ? 0 : Math.round(payout - wager),
        date: game.resolved_at || game.created_at || null,
      })
    }
    history.sort((left, right) => new Date(right.date || 0).getTime() - new Date(left.date || 0).getTime())
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ ok: true, history })
  } catch (error) {
    console.error('[profile/game-history] failed', error)
    res.status(500).json({ ok: false, error: 'Unable to load game history.' })
  }
})

app.get('/api/profile/transaction-history', requireAuthenticatedUser, async (req, res) => {
  const profileId = String(req.identity.profileId)
  const encodedProfileId = encodeURIComponent(profileId)
  try {
    const [depositRows, withdrawalRows] = await Promise.all([
      adminRest(`deposits?select=id,total_value,deposited_at&profile_id=eq.${encodedProfileId}&order=deposited_at.desc&limit=125`),
      adminRest(`withdraws?select=id,value,canceled,withdrawed_at,completed_at&user_id=eq.${encodedProfileId}&order=withdrawed_at.desc&limit=125`),
    ])
    const history = []
    for (const row of Array.isArray(depositRows) ? depositRows : []) {
      const amount = Math.abs(Math.round(Number(row.total_value) || 0))
      if (amount) history.push({ id: `deposit:${row.id}`, filter: 'deposit', type: 'Deposit', balance: 'Items', amount, date: row.deposited_at || null })
    }
    for (const row of Array.isArray(withdrawalRows) ? withdrawalRows : []) {
      const amount = Math.abs(Math.round(Number(row.value) || 0))
      if (!amount) continue
      const cancelled = Boolean(row.canceled)
      history.push({
        id: `withdrawal:${row.id}`,
        filter: cancelled ? 'cancelled-withdrawal' : 'withdrawal',
        type: cancelled ? 'Cancelled Withdrawal' : 'Withdrawal',
        balance: 'Items',
        amount: (cancelled ? 1 : -1) * amount,
        date: row.completed_at || row.withdrawed_at || null,
      })
    }
    history.sort((left, right) => new Date(right.date || 0).getTime() - new Date(left.date || 0).getTime())
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ ok: true, history: history.slice(0, 250) })
  } catch (error) {
    console.error('[profile/transaction-history] failed', error)
    res.status(500).json({ ok: false, error: 'Unable to load transaction history.' })
  }
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
  const robloxId = String(req.query.roblox_id || '').trim()

  if (robloxId) {
    if (!/^\d{1,20}$/.test(robloxId)) {
      res.status(400).json({ ok: false, error: 'A valid Roblox user ID is required.' })
      return
    }

    const resolvedProfile = await loadPs99ProfileByRobloxId(robloxId)
    if (!resolvedProfile?.id) {
      res.json({ ok: true, profiles: [] })
      return
    }

    const rows = await adminRest(
      `user_profiles?select=id,username,avatar_url,avatar_headshot_url,roblox_id,role,level,played,won,lost&id=eq.${encodeURIComponent(resolvedProfile.id)}&limit=1`,
    ).catch(async (error) => {
      if (!isMissingDatabaseColumn(error, 'roblox_id')) throw error
      return adminRest(
        `user_profiles?select=id,username,avatar_url,avatar_headshot_url,role,level,played,won,lost&id=eq.${encodeURIComponent(resolvedProfile.id)}&limit=1`,
      )
    })
    res.json({
      ok: true,
      profiles: (Array.isArray(rows) ? rows : []).map((profile) => ({
        ...profile,
        roblox_id: profile.roblox_id || robloxId,
      })),
    })
    return
  }

  let filter = ''
  if (ids.length) filter = `&id=in.(${ids.join(',')})`
  else if (username) filter = `&username=eq.${encodeURIComponent(username)}`
  else {
    res.status(400).json({ ok: false, error: 'A profile ID or username is required.' })
    return
  }
  const rows = await adminRest(
    `user_profiles?select=id,username,avatar_url,avatar_headshot_url,roblox_id,role,level,played,won,lost${filter}&limit=50`,
  ).catch(async (error) => {
    if (!isMissingDatabaseColumn(error, 'roblox_id')) throw error
    return adminRest(
      `user_profiles?select=id,username,avatar_url,avatar_headshot_url,role,level,played,won,lost${filter}&limit=50`,
    )
  })
  res.json({ ok: true, profiles: Array.isArray(rows) ? rows : [] })
})

app.get('/api/public-profile-stats', async (req, res) => {
  const profileId = String(req.query.id || '').trim()
  if (!isUuidLike(profileId)) {
    res.status(400).json({ ok: false, error: 'A valid profile ID is required.' })
    return
  }

  const emptyStats = () => ({ totalBet: 0, totalProfit: 0, totalWon: 0, totalLost: 0 })
  const stats = {
    all: emptyStats(),
    mm2: emptyStats(),
    adm: emptyStats(),
    ps99: emptyStats(),
  }

  const detectGame = (game) => {
    const item = [
      ...(Array.isArray(game?.creator_items) ? game.creator_items : []),
      ...(Array.isArray(game?.opponent_items) ? game.opponent_items : []),
    ][0]
    const type = String(item?.type || item?.game || item?.item_type || game?.item_type || '').toLowerCase()
    if (type.includes('murder') || type.includes('mm2')) return 'mm2'
    if (type.includes('adopt') || type === 'adm') return 'adm'
    return 'ps99'
  }

  try {
    const encodedProfileId = encodeURIComponent(profileId)
    const games = await adminRest(
      `coinflip_games?select=*&or=(creator_uuid.eq.${encodedProfileId},opponent_uuid.eq.${encodedProfileId})&canceled=eq.false&result=not.is.null&order=resolved_at.desc&limit=1000`,
    )

    for (const game of Array.isArray(games) ? games : []) {
      const creator = String(game?.creator_uuid || '') === profileId
      const wager = getCoinflipWagerValue(creator ? game?.creator_items : game?.opponent_items)
      const won = String(game?.winner_uuid || '') === profileId
      const grossPot = getCoinflipWagerValue(game?.creator_items) + getCoinflipWagerValue(game?.opponent_items)
      const payout = won ? Math.max(0, Number(game?.net_payout_value) || grossPot) : 0
      const profit = payout - wager
      const gameKey = detectGame(game)

      for (const key of ['all', gameKey]) {
        stats[key].totalBet += wager
        stats[key].totalProfit += profit
        if (won) stats[key].totalWon += payout
        else stats[key].totalLost += wager
      }
    }

    for (const value of Object.values(stats)) {
      value.totalBet = Math.round(value.totalBet)
      value.totalProfit = Math.round(value.totalProfit)
      value.totalWon = Math.round(value.totalWon)
      value.totalLost = Math.round(value.totalLost)
    }

    res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=30')
    res.json({ ok: true, stats })
  } catch (error) {
    console.error('[public-profile-stats] failed', error)
    res.status(500).json({ ok: false, error: 'Unable to load profile stats.' })
  }
})

app.get('/api/leaderboard', async (req, res) => {
  try {
    const sort = ['played', 'profit', 'least-profit'].includes(String(req.query.sort))
      ? String(req.query.sort)
      : 'played'
    const requestedGame = String(req.query.game || 'all').toLowerCase()
    const game = ['all', 'mm2', 'adm', 'ps99'].includes(requestedGame) ? requestedGame : 'all'
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
    res.json({ ok: true, game, leaders })
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
    `withdraws?select=*&user_id=eq.${encodeURIComponent(req.identity.profileId)}&canceled=eq.false&completed_at=is.null&order=withdrawed_at.desc`,
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
  const result = await callDatabaseRpc('create_item_withdrawals', {
    p_owner_ids: [req.identity.profileId],
    p_user_name: profile?.username || 'user',
    p_item_uuids: itemIds,
  })
  invalidateAdminGeneralSnapshot('withdrawal-created')
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
  try {
    const result = await callDatabaseRpc('cancel_item_withdrawals', {
      p_profile_id: req.identity.profileId,
      p_withdrawal_uuids: withdrawalIds,
    })
    invalidateAdminGeneralSnapshot('withdrawal-cancelled')
    res.json({ ok: true, data: result })
  } catch (error) {
    const message = String(error?.message || '')
    if (/actively claimed by a bot|completed, actively claimed|claimed by a bot/i.test(message)) {
      res.status(409).json({
        ok: false,
        error: 'Withdrawal cancellation is waiting for the trade bot to finish reconciling the closed trade.',
      })
      return
    }
    throw error
  }
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
  const result = await callDatabaseRpc('send_coin_tip', {
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
  const result = await callDatabaseRpc('send_item_tip', {
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
  const result = await callDatabaseRpc('create_giveaway_atomic', {
    p_profile_id: req.identity.profileId,
    p_item_uuids: itemIds,
    p_duration_minutes: durationMinutes,
    p_level_requirement: levelRequirement,
  })
  res.json({ ok: true, giveaway: result })
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
    const result = await callDatabaseRpc('redeem_promocode', {
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

function normalizeCoinflipGameMode(value) {
  const mode = String(value || '').trim().toLowerCase()
  return ['mm2', 'adm', 'ps99', 'gems_only', 'titanics_only'].includes(mode) ? mode : null
}

function getCoinflipItemGame(item) {
  const type = String(item?.type || item?.game || item?.item_type || item?.game_mode || '').trim().toLowerCase()
  if (type.includes('murder') || type.includes('mm2')) return 'mm2'
  if (type.includes('adopt') || type === 'adm') return 'adm'
  if (type.includes('pet sim') || type.includes('ps99')) return 'ps99'
  return null
}

function getCoinflipRecordGame(game) {
  const explicitMode = normalizeCoinflipGameMode(game?.game_mode)
  if (explicitMode === 'mm2' || explicitMode === 'adm' || explicitMode === 'ps99') return explicitMode
  if (explicitMode === 'gems_only' || explicitMode === 'titanics_only') return 'ps99'
  const items = [
    ...(Array.isArray(game?.creator_items) ? game.creator_items : []),
    ...(Array.isArray(game?.opponent_items) ? game.opponent_items : []),
  ]
  for (const item of items) {
    const itemGame = getCoinflipItemGame(item)
    if (itemGame) return itemGame
  }
  return 'ps99'
}

function coinflipGameModeLabel(gameMode) {
  if (gameMode === 'mm2') return 'Murder Mystery 2 items'
  if (gameMode === 'adm') return 'Adopt Me pets'
  if (gameMode === 'ps99') return 'Pet Simulator 99 pets'
  if (gameMode === 'gems_only') return 'Gems'
  return 'Gargantuan or Titanic pets and Gems'
}

function coinflipItemsMatchGameMode(items, gameMode) {
  if (!gameMode) return true
  if (!Array.isArray(items) || items.length === 0) return false
  if (gameMode === 'mm2' || gameMode === 'adm' || gameMode === 'ps99') {
    return items.every((item) => getCoinflipItemGame(item) === gameMode)
  }
  const pattern = gameMode === 'gems_only' ? /\bgems?\b/i : /\b(?:gargantuan|titanic|gems?)\b/i
  return items.every((item) => pattern.test(String(item?.name || '')))
}

function serializeCoinflipGame(game) {
  if (!game || typeof game !== 'object') return game
  const { server_seed_encrypted, ...publicGame } = game
  if (!publicGame.result) delete publicGame.server_seed
  return publicGame
}

app.get('/api/coinflip/history', requireAuthenticatedUser, async (req, res) => {
  const profileId = String(req.identity.profileId)
  const encodedProfileId = encodeURIComponent(profileId)
  const requestedGame = normalizeCoinflipGameMode(req.query.game)
  const selectedGame = requestedGame === 'mm2' || requestedGame === 'adm' || requestedGame === 'ps99'
    ? requestedGame
    : null

  try {
    const rows = await adminRest(
      `coinflip_games?select=*&or=(creator_uuid.eq.${encodedProfileId},opponent_uuid.eq.${encodedProfileId})&canceled=eq.false&result=not.is.null&order=resolved_at.desc&limit=250`,
    )
    const history = (Array.isArray(rows) ? rows : [])
      .filter((game) => !selectedGame || getCoinflipRecordGame(game) === selectedGame)
      .slice(0, 100)
      .map(serializeCoinflipGame)
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({
      ok: true,
      game: selectedGame || 'all',
      history,
    })
  } catch (error) {
    console.error('[coinflip/history] failed', error)
    res.status(500).json({ ok: false, error: 'Unable to load coinflip history.' })
  }
})

app.post('/api/coinflip/create', express.json({ limit: '24kb' }), requireAuthenticatedUser, async (req, res) => {
  const { supabaseUrl, supabaseKey } = getSupabaseAdminConfig()
  if (!supabaseUrl || !supabaseKey) {
    res.status(500).json({ ok: false, error: 'supabase config missing' })
    return
  }

  const payload = req.body || {}
  let game_mode = normalizeCoinflipGameMode(payload.game_mode)
  if (payload.game_mode && !game_mode) {
    return res.status(400).json({ ok: false, error: 'Invalid coinflip game mode.' })
  }
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
    if (!game_mode) game_mode = getCoinflipItemGame(verifiedCreatorItems[0])
    if (!game_mode) {
      return res.status(400).json({ ok: false, error: 'Unable to determine the selected item game.' })
    }
    if (!coinflipItemsMatchGameMode(verifiedCreatorItems, game_mode)) {
      return res.status(400).json({ ok: false, error: `Select only ${coinflipGameModeLabel(game_mode)} for this coinflip.` })
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
      tax_rate_bps: 1250,
      game_mode,
    }]

    const insertCoinflipGame = (rows) => fetch(`${supabaseUrl}/rest/v1/coinflip_games?select=*`, {
      method: 'POST',
      headers: getSupabaseAdminHeaders(supabaseKey, {
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      }),
      body: JSON.stringify(rows),
    })

    let response = await insertCoinflipGame(insertPayload)
    let text = await response.text()
    const legacyGameModeConstraint = !response.ok
      && ['mm2', 'adm', 'ps99'].includes(game_mode)
      && text.includes('coinflip_games_game_mode_check')
    if (legacyGameModeConstraint) {
      response = await insertCoinflipGame([{ ...insertPayload[0], game_mode: null }])
      text = await response.text()
    }
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
    const gameMode = normalizeCoinflipGameMode(roomObj.game_mode) || getCoinflipRecordGame(roomObj)
    if (!coinflipItemsMatchGameMode(verifiedOpponentItems, gameMode)) {
      return res.status(400).json({ ok: false, error: `This flip only accepts ${coinflipGameModeLabel(gameMode)}.` })
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
app.get('/api/health', (req, res) => {
  res.json({ ok: true })
})

// PS99 Trading Bot Endpoints
function requirePs99Bot(req, res, next) {
  const configuredSecret = String(process.env.PS99_BOT_API_SECRET || '')
  const suppliedHeader = String(req.get('authorization') || '')
  const suppliedSecret = suppliedHeader.replace(/^Bearer\s+/i, '')
  if (!configuredSecret) {
    res.status(503).json({ success: false, error: 'PS99 bot authentication is not configured' })
    return
  }
  const expected = Buffer.from(configuredSecret)
  const actual = Buffer.from(suppliedSecret)
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    res.status(401).json({ success: false, error: 'Invalid bot credentials' })
    return
  }
  next()
}

const PS99_GEM_PACKAGES = [
  ['100M gems', 100_000_000],
  ['50M gems', 50_000_000],
  ['25M gems', 25_000_000],
  ['10M gems', 10_000_000],
  ['5M gems', 5_000_000],
  ['1M gems', 1_000_000],
  ['500K gems', 500_000],
  ['100K gems', 100_000],
]
const PS99_GEM_PACKAGE_VALUES = new Map(PS99_GEM_PACKAGES.map(([name, value]) => [name.toLowerCase(), value]))

function normalizePs99Deposit(pets, gems) {
  const sourcePets = Array.isArray(pets) ? pets : []
  const sourceGems = Array.isArray(gems) ? gems : []
  const petNames = sourcePets
    .map((item) => String(typeof item === 'string' ? item : item?.name || '').trim())
    .filter(Boolean)
  const names = [...petNames]
  const petNameCounts = new Map()
  for (const name of names) {
    const normalized = String(name || '').trim()
    if (normalized) petNameCounts.set(normalized, (petNameCounts.get(normalized) || 0) + 1)
  }

  let gemAmount = 0
  const normalizedGemNames = []
  for (const item of sourceGems) {
    const rawValue = typeof item === 'object' && item !== null
      ? item.amount ?? item.name
      : item
    const normalized = String(rawValue ?? '').trim()
    if (!normalized) continue

    const knownPackageValue = PS99_GEM_PACKAGE_VALUES.get(normalized.toLowerCase())
    if (knownPackageValue) {
      normalizedGemNames.push(PS99_GEM_PACKAGES.find(([name]) => name.toLowerCase() === normalized.toLowerCase())[0])
      gemAmount += knownPackageValue
      continue
    }

    const numericText = normalized.replace(/,/g, '')
    if (!/^\d+$/.test(numericText)) throw new Error('Every PS99 gem deposit must be a valid diamond amount.')
    let remaining = Number(numericText)
    if (!Number.isSafeInteger(remaining) || remaining < 100_000 || remaining > 5_000_000_000) {
      throw new Error('PS99 gem deposits must be between 100,000 and 5,000,000,000 diamonds.')
    }
    gemAmount += remaining
    for (const [packageName, packageValue] of PS99_GEM_PACKAGES) {
      while (remaining >= packageValue) {
        normalizedGemNames.push(packageName)
        remaining -= packageValue
      }
    }
    if (remaining !== 0) throw new Error('PS99 gem deposits must be in increments of 100,000 diamonds.')
  }

  // Preserve duplicate pets while avoiding double-credit if an older bot
  // mirrors a gem package in both arrays.
  const mirroredCounts = new Map()
  for (const normalized of normalizedGemNames) {
    const seen = (mirroredCounts.get(normalized) || 0) + 1
    mirroredCounts.set(normalized, seen)
    if (seen > (petNameCounts.get(normalized) || 0)) names.push(normalized)
  }

  return {
    itemNames: names.map((name) => String(name || '').trim()).filter(Boolean),
    petCount: petNames.filter((name) => !PS99_GEM_PACKAGE_VALUES.has(name.toLowerCase())).length,
    gemAmount,
    sourcePets: petNames,
    sourceGems: sourceGems.map((item) => String(typeof item === 'object' && item !== null ? item.amount ?? item.name ?? '' : item).trim()).filter(Boolean),
  }
}

async function loadPs99ProfileByRobloxId(robloxId) {
  const normalizedRobloxId = String(robloxId || '').trim()
  if (!/^\d+$/.test(normalizedRobloxId)) return null

  try {
    const rows = await adminRest(
      `user_profiles?select=id,username,roblox_id&roblox_id=eq.${encodeURIComponent(normalizedRobloxId)}&limit=1`,
    )
    if (Array.isArray(rows) && rows[0]) return rows[0]
  } catch (error) {
    if (!isMissingDatabaseColumn(error, 'roblox_id')) throw error
  }

  // Profiles created before roblox_id was added use the deterministic UUID of
  // the `roblox:<id>` subject. This keeps those existing accounts compatible.
  const legacyProfileId = resolveStorageProfileId(`roblox:${normalizedRobloxId}`)
  const legacyRows = await adminRest(
    `user_profiles?select=id,username&id=eq.${encodeURIComponent(legacyProfileId)}&limit=1`,
  )
  const legacyProfile = Array.isArray(legacyRows) ? legacyRows[0] || null : null
  if (!legacyProfile) return null

  // Backfill the canonical column when the migration is installed. If it is
  // not installed yet, the virtual value still lets callers report the right
  // account while the secured RPC remains unavailable.
  try {
    await adminRest(`user_profiles?id=eq.${encodeURIComponent(legacyProfile.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: { roblox_id: normalizedRobloxId, updated_at: new Date().toISOString() },
    })
  } catch (error) {
    if (!isMissingDatabaseColumn(error, 'roblox_id')) throw error
  }
  return { ...legacyProfile, roblox_id: normalizedRobloxId }
}

app.get('/items/all', async (req, res) => {
  try {
    const { supabaseUrl, supabaseKey } = getSupabaseAdminConfig()
    if (!supabaseUrl || !supabaseKey) {
      res.status(503).json({ success: 'ERROR', items: [] })
      return
    }

    // PostgREST projects commonly cap a response at 1,000 rows. Page through
    // the complete PS99 catalog so valid pets beyond the first page are not
    // rejected by the trade bot as unsupported.
    const pageSize = 1000
    const itemNames = []
    for (let offset = 0; offset < 50000; offset += pageSize) {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/items?select=name&type=eq.PS99&value=gt.0&order=name&limit=${pageSize}&offset=${offset}`,
        { headers: getSupabaseAdminHeaders(supabaseKey) },
      )
      if (!response.ok) {
        throw new Error(`Unable to fetch PS99 item catalog (${response.status})`)
      }

      const page = await response.json()
      const rows = Array.isArray(page) ? page : []
      itemNames.push(...rows.map((item) => String(item?.name || '').trim()).filter(Boolean))
      if (rows.length < pageSize) break
    }

    // Add gem items to the list
    const gemItems = ['100K gems', '500K gems', '1M gems', '5M gems', '10M gems', '25M gems', '50M gems', '100M gems']
    const allItems = [...new Set([...itemNames, ...gemItems])]

    res.json({ success: 'OK', items: allItems })
  } catch (error) {
    console.error('[PS99] Failed to fetch items:', error)
    res.status(500).json({ success: 'ERROR', items: [] })
  }
})

app.post('/withdraw/method', express.json({ limit: '8kb' }), requirePs99Bot, async (req, res) => {
  try {
    const { userId, game, botUserId, claimToken } = req.body
    const robloxId = String(userId || '').trim()
    const botRobloxId = String(botUserId || '').trim()
    const withdrawalClaimToken = String(claimToken || '').trim()

    if (!/^\d+$/.test(robloxId) || !/^\d+$/.test(botRobloxId) || !withdrawalClaimToken || withdrawalClaimToken.length > 128 || !game) {
      res.status(400).json({ method: 'USERNOTFOUND' })
      return
    }

    if (game !== 'PS99') {
      res.status(400).json({ method: 'USERNOTFOUND' })
      return
    }

    const user = await loadPs99ProfileByRobloxId(robloxId)
    if (!user) {
      res.json({ method: 'USERNOTFOUND' })
      return
    }

    // Deposits do not need to touch the withdrawal claim RPC. Apart from being
    // cheaper, this keeps an unavailable withdrawal function from preventing a
    // registered user with no pending withdrawals from opening a deposit trade.
    const pending = await adminRest(
      `withdraws?select=id&user_id=eq.${encodeURIComponent(user.id)}&item_type=eq.PS99&canceled=eq.false&completed_at=is.null&limit=1`,
    )
    if (!Array.isArray(pending) || pending.length === 0) {
      res.json({ method: 'Deposit' })
      return
    }

    const claimed = await callDatabaseRpc('claim_ps99_withdrawals', {
      p_profile_id: String(user.id),
      p_bot_roblox_id: botRobloxId,
      p_claim_token: withdrawalClaimToken,
    })
    const withdrawals = (Array.isArray(claimed) ? claimed : [])
      .map((row) => ({ id: String(row.withdrawal_id || ''), name: String(row.item_name || '') }))
      .filter((row) => isUuidLike(row.id) && row.name)

    const isGemPackage = (item) => PS99_GEM_PACKAGE_VALUES.has(String(item?.name || '').trim().toLowerCase())
    const petItems = withdrawals.filter((item) => !isGemPackage(item))
    const gemItems = withdrawals.filter(isGemPackage)

    if (withdrawals.length > 0) {
      res.json({
        method: 'Withdraw',
        pets: petItems.map((item) => item.name),
        gems: gemItems.map((item) => item.name),
        withdrawals,
        claimToken: withdrawalClaimToken,
      })
    } else {
      res.json({ method: 'BUSY' })
    }
  } catch (error) {
    console.error('[PS99] Withdraw method check failed:', error)
    res.status(503).json({ success: false, error: 'Unable to check withdrawals' })
  }
})

app.post('/deposit/deposit', express.json({ limit: '64kb' }), requirePs99Bot, async (req, res) => {
  try {
    const {
      userId, pets, gems, game, tradeId, botUserId,
      schemaVersion, botUsername, serverJobId, robloxTradeId, placeId,
    } = req.body
    const robloxId = String(userId || '').trim()
    const externalTradeId = String(tradeId || '').trim()
    const botRobloxId = String(botUserId || '').trim()
    const deposit = normalizePs99Deposit(pets, gems)
    const itemNames = deposit.itemNames
    const payloadVersion = Math.max(1, Math.min(32767, Math.trunc(Number(schemaVersion) || 1)))
    const normalizedBotUsername = String(botUsername || '').trim().slice(0, 100)
    const normalizedServerJobId = String(serverJobId || '').trim().slice(0, 128)
    const normalizedRobloxTradeId = String(robloxTradeId || '').trim().slice(0, 128)
    const normalizedPlaceId = /^\d+$/.test(String(placeId || '')) ? String(placeId) : null

    if (!/^\d+$/.test(robloxId) || !externalTradeId || externalTradeId.length > 128 || !/^\d+$/.test(botRobloxId)) {
      res.status(400).json({ success: false, error: 'Missing required fields' })
      return
    }

    if (game !== 'PS99') {
      res.status(400).json({ success: false, error: 'Invalid game' })
      return
    }

    if (itemNames.length < 1 || itemNames.length > 50) {
      res.status(400).json({ success: false, error: 'Deposit must contain between 1 and 50 items' })
      return
    }

    const profile = await loadPs99ProfileByRobloxId(robloxId)
    if (!profile) {
      res.status(404).json({ success: false, error: 'User not found' })
      return
    }

    const rpcPayload = {
      p_profile_id: String(profile.id),
      p_roblox_id: robloxId,
      p_external_trade_id: externalTradeId,
      p_bot_roblox_id: botRobloxId,
      p_item_names: itemNames,
      p_metadata: {
        payload_version: payloadVersion,
        bot_username: normalizedBotUsername || null,
        server_job_id: normalizedServerJobId || null,
        roblox_trade_id: normalizedRobloxTradeId || null,
        place_id: normalizedPlaceId,
        pet_count: deposit.petCount,
        gem_amount: deposit.gemAmount,
        source_pets: deposit.sourcePets,
        source_gems: deposit.sourceGems,
      },
    }
    let result
    try {
      result = await callDatabaseRpc('record_ps99_deposit_v2', rpcPayload)
    } catch (rpcError) {
      const rpcMessage = String(rpcError?.message || '')
      const v2Unavailable = /record_ps99_deposit_v2|PGRST202|schema cache/i.test(rpcMessage)
      if (!v2Unavailable) throw rpcError
      console.warn('[PS99] Deposit v2 migration is not available yet; using the legacy deposit RPC.')
      result = await callDatabaseRpc('record_ps99_deposit', {
        p_profile_id: rpcPayload.p_profile_id,
        p_roblox_id: rpcPayload.p_roblox_id,
        p_external_trade_id: rpcPayload.p_external_trade_id,
        p_bot_roblox_id: rpcPayload.p_bot_roblox_id,
        p_item_names: rpcPayload.p_item_names,
      })
    }

    await emitWalletRefreshes([profile.id])
    if (!result?.duplicate) invalidateAdminGeneralSnapshot('deposit-created')

    res.json({
      success: true,
      duplicate: Boolean(result?.duplicate),
      message: result?.duplicate ? 'Deposit already recorded' : 'Deposit successful',
      deposit: result?.deposit || null,
    })
  } catch (error) {
    console.error('[PS99] Deposit failed:', error)
    const message = error?.message || 'Deposit failed'
    const expected = /deposit|item|profile|trade|catalog|gem|diamond/i.test(message)
    res.status(expected ? 400 : 500).json({ success: false, error: message })
  }
})

async function confirmPs99Withdrawal(req, res) {
  try {
    const { userId, withdrawalIds, claimToken, tradeId, botUserId, game } = req.body
    const robloxId = String(userId || '').trim()
    const botRobloxId = String(botUserId || '').trim()
    const withdrawalClaimToken = String(claimToken || '').trim()
    const externalTradeId = String(tradeId || '').trim()
    const ids = Array.isArray(withdrawalIds)
      ? [...new Set(withdrawalIds.map(String).filter(isUuidLike))].slice(0, 100)
      : []

    if (!/^\d+$/.test(robloxId) || !/^\d+$/.test(botRobloxId) || !ids.length || !withdrawalClaimToken || !externalTradeId || withdrawalClaimToken.length > 128 || externalTradeId.length > 128) {
      res.status(400).json({ success: false, error: 'Missing required fields' })
      return
    }

    if (game !== 'PS99') {
      res.status(400).json({ success: false, error: 'Invalid game' })
      return
    }

    const profile = await loadPs99ProfileByRobloxId(robloxId)
    if (!profile) {
      res.status(404).json({ success: false, error: 'User not found' })
      return
    }

    const result = await callDatabaseRpc('finalize_ps99_withdrawals', {
      p_profile_id: String(profile.id),
      p_withdrawal_uuids: ids,
      p_claim_token: withdrawalClaimToken,
      p_external_trade_id: externalTradeId,
      p_bot_roblox_id: botRobloxId,
    })

    await emitWalletRefreshes([profile.id])
    if (!result?.duplicate) invalidateAdminGeneralSnapshot('withdrawal-completed')

    res.json({
      success: true,
      duplicate: Boolean(result?.duplicate),
      completedCount: Number(result?.completed_count) || ids.length,
      message: result?.duplicate ? 'Withdrawal was already confirmed' : 'Withdrawal confirmed',
    })
  } catch (error) {
    console.error('[PS99] Withdrawal confirmation failed:', error)
    const message = String(error?.message || 'Withdrawal finalization failed')
    const conflict = /withdrawal|claim|belong|available|duplicate/i.test(message)
    res.status(conflict ? 409 : 500).json({ success: false, error: message })
  }
}

// `confirmed` is the canonical bot callback. Keep `withdrawn` as a compatible
// alias for bots deployed during the secure-withdrawal migration.
app.post('/withdraw/confirmed', express.json({ limit: '64kb' }), requirePs99Bot, confirmPs99Withdrawal)
app.post('/withdraw/withdrawn', express.json({ limit: '64kb' }), requirePs99Bot, confirmPs99Withdrawal)

app.post('/withdraw/release', express.json({ limit: '8kb' }), requirePs99Bot, async (req, res) => {
  try {
    const robloxId = String(req.body?.userId || '').trim()
    const botRobloxId = String(req.body?.botUserId || '').trim()
    const withdrawalClaimToken = String(req.body?.claimToken || '').trim()
    if (req.body?.game !== 'PS99' || !/^\d+$/.test(robloxId) || !/^\d+$/.test(botRobloxId) || !withdrawalClaimToken || withdrawalClaimToken.length > 128) {
      res.status(400).json({ success: false, error: 'Invalid release request' })
      return
    }

    const profile = await loadPs99ProfileByRobloxId(robloxId)
    if (!profile) {
      res.status(404).json({ success: false, error: 'User not found' })
      return
    }

    const result = await callDatabaseRpc('release_ps99_withdrawal_claim', {
      p_profile_id: String(profile.id),
      p_claim_token: withdrawalClaimToken,
      p_bot_roblox_id: botRobloxId,
    })
    res.json({ success: true, released: Number(result?.released_count) || 0 })
  } catch (error) {
    console.error('[PS99] Withdrawal claim release failed:', error)
    res.status(500).json({ success: false, error: 'Unable to release withdrawal claim' })
  }
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

startServer(PORT)
