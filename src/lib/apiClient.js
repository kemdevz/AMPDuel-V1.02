const pendingGetRequests = new Map()
const prefetchedGetResponses = new Map()
const PREFETCH_TTL_MS = 30_000

function getClientTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch {
    return ''
  }
}

async function executeRequest(path, options) {
  const clientTimezone = getClientTimezone()
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(clientTimezone ? { 'X-Client-Timezone': clientTimezone } : {}),
      ...(options.headers || {}),
    },
  })

  const text = await response.text()
  let payload = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }

  if (!response.ok) {
    const error = new Error(payload?.error || payload?.message || text || `Request failed (${response.status}).`)
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload
}

export function apiRequest(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase()
  if (method !== 'GET') {
    prefetchedGetResponses.clear()
    return executeRequest(path, options)
  }
  if (options.signal) return executeRequest(path, options)

  const requestKey = String(path)
  if (options.cache !== 'no-store') {
    const prefetched = prefetchedGetResponses.get(requestKey)
    if (prefetched) {
      prefetchedGetResponses.delete(requestKey)
      if (prefetched.expiresAt > Date.now()) return Promise.resolve(prefetched.payload)
    }
  }
  const pendingRequest = pendingGetRequests.get(requestKey)
  if (pendingRequest) return pendingRequest

  const request = executeRequest(path, options)
    .finally(() => {
      if (pendingGetRequests.get(requestKey) === request) {
        pendingGetRequests.delete(requestKey)
      }
    })
  pendingGetRequests.set(requestKey, request)
  return request
}

export function prefetchApiRequest(path, options = {}) {
  const requestKey = String(path)
  const cached = prefetchedGetResponses.get(requestKey)
  if (cached?.expiresAt > Date.now()) return Promise.resolve(cached.payload)

  return apiRequest(path, { ...options, cache: 'no-store' })
    .then((payload) => {
      prefetchedGetResponses.set(requestKey, {
        payload,
        expiresAt: Date.now() + Math.max(1_000, Number(options.ttlMs) || PREFETCH_TTL_MS),
      })
      return payload
    })
}

export function clearPrefetchedApiResponses() {
  prefetchedGetResponses.clear()
}
