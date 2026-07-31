import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not configured')
}
const clientCacheKey = '__BLOXY_SUPABASE_CLIENT__'
const existingClient = globalThis[clientCacheKey]

export const supabase = existingClient ?? createClient(supabaseUrl ?? '', supabaseAnonKey ?? '')

if (!existingClient) {
  globalThis[clientCacheKey] = supabase
}

export const isUuidLike = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ''))

export async function resolveStorageProfileId(value) {
  if (!value) return null

  const rawValue = String(value)
  if (isUuidLike(rawValue)) return rawValue

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(rawValue))
    const bytes = Array.from(new Uint8Array(digest))
    bytes[6] = (bytes[6] & 0x0f) | 0x50
    bytes[8] = (bytes[8] & 0x3f) | 0x80

    const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
  }

  return globalThis.crypto?.randomUUID?.() ?? `uuid-${Math.random().toString(16).slice(2)}`
}
