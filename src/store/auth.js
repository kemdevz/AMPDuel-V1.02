import { create } from 'zustand'
import { apiRequest } from '../lib/apiClient'
import { connectSocket, refreshSocketAuthentication } from '../lib/socket'

const getXpThresholdForLevel = (level) => {
  const safeLevel = Math.max(1, Number(level) || 1)
  return Math.floor(50000 * Math.pow(safeLevel, 1.6))
}

const getXpUntilNextLevel = (level, xp) => {
  const safeLevel = Math.max(1, Number(level) || 1)
  const safeXp = Math.max(0, Number(xp) || 0)
  return Math.max(0, getXpThresholdForLevel(safeLevel) - safeXp)
}

const normalizeUser = (row) => {
  if (!row) return null

  return {
    id: row.id,
    profile_id: row.profile_id || row.id || null,
    username: row.username || 'user',
    roblox_id: row.roblox_id ? String(row.roblox_id) : null,
    balance: Number(row.balance ?? 0),
    level: Number(row.level ?? 1),
    max_level: Number(row.max_level ?? 200),
    xp: Number(row.xp ?? 0),
    xp_until_next_level: Number(row.xp_until_next_level ?? getXpUntilNextLevel(row.level, row.xp)),
    role: row.role || 'user',
    played: Number(row.played ?? 0),
    won: Number(row.won ?? 0),
    lost: Number(row.lost ?? 0),
    ignored_users: Array.isArray(row.ignored_users)
      ? [...new Set(row.ignored_users.map((value) => String(value).trim()).filter(Boolean))]
      : [],
    pearls: Number(row.pearls ?? 0),
    summer_tickets: Number(row.summer_tickets ?? 0),
    avatar_url: row.avatar_url || null,
    avatar_headshot_url: row.avatar_headshot_url || null,
    discord_linked: row.discord_linked ?? false,
    discord_username: row.discord_username || null,
    ip_address: row.ip_address || null,
  }
}

const sendLoginWebhook = async (user) => {
  try {
    await apiRequest('/api/auth/login-webhook', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  } catch (err) {
    console.warn('[Auth] login webhook failed', err)
  }
}

export const useAuth = create((set) => ({
  user: null,
  balance: 0,
  fairness: null,
  loading: true,
  authError: null,
  isAuthModalOpen: false,
  walletSelection: 'items',

  async bootstrap() {
    set({ loading: true, authError: null })

    let user = null
    try {
      const result = await apiRequest('/api/auth/me')
      user = normalizeUser(result?.user)
    } catch (err) {
      if (err?.status !== 401) console.warn('[Auth] bootstrap error', err)
    }

    set({
      user,
      balance: user?.balance ?? 0,
      loading: false,
      fairness: null,
    })
    connectSocket()
  },

  async logout() {
    try {
      await apiRequest('/api/auth/session', { method: 'DELETE' })
    } catch (err) {
      if (err?.status !== 401) console.warn('[Auth] logout error', err)
    }

    set({ user: null, balance: 0, fairness: null })
    refreshSocketAuthentication()
  },

  setBalance(balance) {
    set((state) => ({
      balance,
      user: state.user ? { ...state.user, balance } : state.user,
    }))
  },

  setAuthModalOpen(isOpen) {
    set({ isAuthModalOpen: isOpen })
  },

  setWalletSelection(selection) {
    set({ walletSelection: selection === 'coins' ? 'coins' : 'items' })
  },

  touchSessionActivity() {
    // The HttpOnly server session is the source of truth.
  },

  async toggleIgnoredUser(profileId) {
    const targetProfileId = String(profileId || '').trim()
    const currentUser = useAuth.getState().user
    const currentProfileId = String(currentUser?.profile_id || currentUser?.id || '').trim()
    if (!targetProfileId || !currentUser?.id || targetProfileId === currentProfileId) {
      return { error: new Error('Invalid user to ignore') }
    }

    const previousIgnoredUsers = Array.isArray(currentUser.ignored_users)
      ? currentUser.ignored_users
      : []
    const isIgnored = previousIgnoredUsers.includes(targetProfileId)
    const nextIgnoredUsers = isIgnored
      ? previousIgnoredUsers.filter((id) => id !== targetProfileId)
      : [...previousIgnoredUsers, targetProfileId]
    const nextUser = { ...currentUser, ignored_users: nextIgnoredUsers }

    set({ user: nextUser })
    try {
      await apiRequest('/api/profile/ignored-users', {
        method: 'PATCH',
        body: JSON.stringify({ ignored_users: nextIgnoredUsers }),
      })
      return { ignored: !isIgnored, error: null }
    } catch (error) {
      set({ user: currentUser })
      return { error }
    }
  },

  async setAuthenticatedUser(userData) {
    const user = normalizeUser(userData)
    set({
      user,
      balance: user?.balance ?? 0,
      loading: false,
      authError: null,
    })

    await sendLoginWebhook(user)
    refreshSocketAuthentication()
  },

  setFairness(fairness) {
    set({ fairness })
  },
}))
