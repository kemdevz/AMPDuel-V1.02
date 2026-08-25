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
