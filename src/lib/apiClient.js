const pendingGetRequests = new Map()

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
  if (method !== 'GET' || options.signal) return executeRequest(path, options)

  const requestKey = String(path)
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
