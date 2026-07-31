// Tiny fetch wrapper. Always sends the auth cookie (credentials:'include') and
// parses JSON, throwing an ApiError with the server's message on non-2xx.

const BASE = '/api'

export class ApiError extends Error {
  constructor(message, status, data) {
    super(typeof message === 'string' ? message : 'Request failed')
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

export async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  // 204 / empty body guard
  const text = await res.text()
  const data = text ? JSON.parse(text) : null

  if (!res.ok) {
    throw new ApiError(data?.error ?? `HTTP ${res.status}`, res.status, data)
  }
  return data
}

// Convenience verbs
export const get = (path) => api(path)
export const post = (path, body) =>
  api(path, { method: 'POST', body: JSON.stringify(body ?? {}) })
export const patch = (path, body) =>
  api(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) })
