import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiRequest } from '../lib/apiClient'
import { isUuidLike } from '../lib/supabaseClient'
import { getRoleStyle } from '../lib/roleStyles'
import { useAuth } from '../store/auth'
import AnimatedNumber from './AnimatedNumber'
import { PROFILE_TIP_OPEN_EVENT } from './ProfileTipManager'

const profileCache = new Map()
const profilePreloadRequests = new Map()
const profileStatsCache = new Map()
const FALLBACK_AVATAR = '/login.png'
const EMPTY_STATS = { totalBet: 0, totalProfit: 0, totalWon: 0, totalLost: 0 }
const GAME_OPTIONS = [['mm2', 'MM2'], ['adm', 'AMP'], ['ps99', 'PS99']]
const MINI_PROFILE_GAME_STORAGE_KEY = 'bloxdice:mini-profile-game'

function normalizeProfileCacheKey(value) {
  return String(value ?? '').trim().toLowerCase()
}

function getCachedProfile(values) {
  for (const value of values) {
    const cachedProfile = profileCache.get(normalizeProfileCacheKey(value))
    if (cachedProfile) return cachedProfile
  }
  return null
}

function cacheProfile(profile, aliases = []) {
  if (!profile) return
  [profile.id, profile.profile_id, profile.roblox_id, profile.username, profile.name, ...aliases].forEach((value) => {
    const key = normalizeProfileCacheKey(value)
    if (key) profileCache.set(key, profile)
  })
}

function getCachedProfileStats(values) {
  for (const value of values) {
    const cachedStats = profileStatsCache.get(normalizeProfileCacheKey(value))
    if (cachedStats) return cachedStats
  }
  return null
}

function cacheProfileStats(stats, aliases = []) {
  if (!stats) return
  aliases.forEach((value) => {
    const key = normalizeProfileCacheKey(value)
    if (key) profileStatsCache.set(key, stats)
  })
}

export function preloadMiniProfile(player) {
  const aliases = [player?.profile_id, player?.id, player?.user_id, player?.uuid, player?.username, player?.name].filter(Boolean)
  const cachedProfile = getCachedProfile(aliases)
  if (cachedProfile) return Promise.resolve(cachedProfile)

  const profileId = aliases.map((value) => String(value).trim()).find(isUuidLike)
  const username = String(player?.username || player?.name || '').trim()
  const requestKey = profileId || normalizeProfileCacheKey(username)
  if (!requestKey) return Promise.resolve(null)
  if (profilePreloadRequests.has(requestKey)) return profilePreloadRequests.get(requestKey)

  const query = profileId ? `ids=${encodeURIComponent(profileId)}` : `username=${encodeURIComponent(username)}`
  const request = apiRequest(`/api/public-profiles?${query}`)
    .then((result) => {
      const loadedProfile = result?.profiles?.[0] || null
      if (loadedProfile) cacheProfile(loadedProfile, aliases)
      return loadedProfile
    })
    .catch(() => null)
    .finally(() => profilePreloadRequests.delete(requestKey))

  profilePreloadRequests.set(requestKey, request)
  return request
}

function StatCard({ amount, label }) {
  return (
    <div className="miniPlayerProfileCard rounded border border-[hsl(231_16%_16%)] bg-[hsl(230_16%_14%/.15)] px-6 py-4">
      <div className="flex items-center gap-1 font-semibold">
        <img src="/currency.svg" alt="currency" width="18" height="18" className="-mt-[2px] h-[18px] w-[18px] object-contain" />
        <AnimatedNumber value={amount} duration={650} fastThreshold={100_000_000} fastDuration={300} animateOnMount />
      </div>
      <div className="text-xs font-medium uppercase opacity-60">{label}</div>
    </div>
  )
}

export default function MiniProfileModal({ isOpen, player, onClose, onTip, allowOwnProfile = false }) {
  const currentUser = useAuth((state) => state.user)
  const [profile, setProfile] = useState(null)
  const [activeGame, setActiveGame] = useState(() => {
    if (typeof window === 'undefined') return 'mm2'
    const savedGame = window.localStorage.getItem(MINI_PROFILE_GAME_STORAGE_KEY)
    return GAME_OPTIONS.some(([value]) => value === savedGame) ? savedGame : 'mm2'
  })
  const activeGameIndex = Math.max(0, GAME_OPTIONS.findIndex(([value]) => value === activeGame))
  const [statsByGame, setStatsByGame] = useState(null)
  const [statsOwnerKey, setStatsOwnerKey] = useState('')

  const playerAliases = useMemo(() => [player?.profile_id, player?.id, player?.user_id, player?.uuid, player?.username, player?.name]
    .map(normalizeProfileCacheKey).filter(Boolean), [player])

  useEffect(() => {
    if (!isOpen) return undefined
    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event) => { if (event.key === 'Escape') onClose?.() }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) {
      setProfile(null)
      setStatsByGame(null)
      setStatsOwnerKey('')
      return undefined
    }
    let active = true
    const cached = getCachedProfile(playerAliases)
    if (cached) setProfile(cached)
    void preloadMiniProfile(player).then((loadedProfile) => {
      if (active) setProfile(loadedProfile || cached || null)
    })
    return () => { active = false }
  }, [isOpen, player, playerAliases])

  const resolvedProfile = useMemo(() => ({ ...player, ...(profile || {}) }), [player, profile])
  const targetProfileId = String(profile?.id || player?.profile_id || (isUuidLike(String(player?.id || '').trim()) ? player.id : '') || resolvedProfile?.user_id || resolvedProfile?.uuid || '').trim()
  const currentProfileId = String(currentUser?.profile_id || currentUser?.id || '').trim()
  const currentUsername = normalizeProfileCacheKey(currentUser?.username)
  const targetUsername = normalizeProfileCacheKey(resolvedProfile?.username || resolvedProfile?.name)
  const statsRequestKey = normalizeProfileCacheKey(targetProfileId || targetUsername)
  const isOwnProfile = Boolean(
    (targetProfileId && currentProfileId && targetProfileId === currentProfileId) ||
    (!targetProfileId && currentUsername && targetUsername === currentUsername),
  )

  useEffect(() => {
    if (!isOpen || !isOwnProfile || allowOwnProfile) return
    onClose?.()
    window.dispatchEvent(new CustomEvent('profile:open'))
  }, [allowOwnProfile, isOpen, isOwnProfile, onClose])

  useEffect(() => {
    if (!isOpen || !targetProfileId || (isOwnProfile && !allowOwnProfile)) return undefined
    let active = true
    const statsAliases = [targetProfileId, targetUsername, ...playerAliases]
    const cachedStats = getCachedProfileStats(statsAliases)
    setStatsOwnerKey(statsRequestKey)
    setStatsByGame(cachedStats)
    apiRequest(`/api/public-profile-stats?id=${encodeURIComponent(targetProfileId)}`, { cache: 'no-store' })
      .then((result) => {
        const nextStats = result?.stats || null
        if (nextStats) cacheProfileStats(nextStats, statsAliases)
        if (active) setStatsByGame(nextStats)
      })
      .catch((error) => {
        console.warn('[MiniProfileModal] failed to load player stats', error)
        if (active) setStatsByGame(null)
      })
    return () => { active = false }
  }, [allowOwnProfile, isOpen, isOwnProfile, playerAliases, statsRequestKey, targetProfileId, targetUsername])

  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(MINI_PROFILE_GAME_STORAGE_KEY, activeGame)
  }, [activeGame])

  if (!isOpen || (isOwnProfile && !allowOwnProfile) || typeof document === 'undefined') return null

  const username = resolvedProfile?.username || resolvedProfile?.name || 'User'
  const avatar = resolvedProfile?.avatar_headshot_url || resolvedProfile?.avatar || resolvedProfile?.avatar_url || FALLBACK_AVATAR
  const roleStyle = getRoleStyle(resolvedProfile?.role)
  const currentProfileStats = statsOwnerKey === statsRequestKey ? statsByGame : null
  const stats = currentProfileStats?.[activeGame] || EMPTY_STATS

  const handleTip = () => {
    if (typeof onTip === 'function') onTip(resolvedProfile)
    else {
      window.dispatchEvent(new CustomEvent(PROFILE_TIP_OPEN_EVENT, { detail: { recipient: resolvedProfile } }))
      onClose?.()
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[2147483200] bg-[hsl(228_17%_12%/.4)] animate-[miniProfileBackdropIn_200ms_ease-out_forwards]" role="presentation" style={{ pointerEvents: 'auto', zIndex: 2147483200 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.() }}>
      <style>{`
        @keyframes miniProfileBackdropIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes miniProfileDialogIn {
          from { opacity: 0; transform: translate(-50%, -48%); }
          to { opacity: 1; transform: translate(-50%, -50%); }
        }
        .miniPlayerProfileTabs {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        .miniPlayerProfileCard {
          border-color: hsl(231 16% 16%);
          background-color: hsl(230 16% 14% / .15);
        }
        @media (min-width: 640px) {
          .miniPlayerProfileDialog {
            width: 100%;
            max-width: 448px;
            height: fit-content;
            min-height: 288px;
            border-radius: 8px;
          }
        }
      `}</style>

      <div role="dialog" aria-modal="true" aria-labelledby="mini-profile-username" className="miniPlayerProfileDialog fixed left-1/2 top-1/2 z-50 flex h-[100dvh] w-full max-w-full -translate-x-1/2 -translate-y-1/2 flex-col items-start gap-4 rounded-none border border-[hsl(231_16%_16%)] bg-[hsl(227_17%_11%)] px-8 py-8 pb-6 text-white shadow-lg animate-[miniProfileDialogIn_200ms_ease-out_forwards] sm:h-fit sm:min-h-72 sm:max-w-md sm:rounded-lg" style={{ pointerEvents: 'auto' }} onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="relative flex h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-[#ff4fa3] bg-[#171920]">
              <img src={avatar} alt={`${username} thumbnail`} className="absolute inset-0 h-full w-full object-cover" draggable={false} referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.src = FALLBACK_AVATAR }} />
            </span>
            <div>
              <div id="mini-profile-username" className="text-lg font-semibold">
                {username}
                <div className="flex items-center gap-1 text-sm font-medium" style={{ color: roleStyle.color }}>
                  <div className="grid"><span className="col-span-full row-span-full">{roleStyle.label}</span></div>
                  {roleStyle.image ? <img src={roleStyle.image} alt={`${roleStyle.label} rank`} width="22" height="22" className="h-[22px] w-[22px] object-contain" /> : null}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 w-full">
          <div role="tablist" aria-label="Player stats game" className="miniPlayerProfileTabs relative grid h-10 w-full isolate grid-cols-3 items-center justify-center overflow-hidden rounded-md bg-[hsl(229_17%_13%)]">
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 z-0 rounded-md bg-[#ff4fa3] shadow-sm transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)]" style={{ width: 'calc(100% / 3)', transform: `translateX(${activeGameIndex * 100}%)` }} />
            {GAME_OPTIONS.map(([value, label]) => {
              const active = activeGame === value
              return (
                <button key={value} type="button" role="tab" aria-selected={active} onClick={() => setActiveGame(value)} className={`relative z-10 inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff4fa3] focus-visible:ring-offset-2 ${active ? 'font-semibold text-black' : 'text-white/60 hover:text-white'}`}>
                  {label}
                </button>
              )
            })}
          </div>
          <div role="tabpanel" className="mt-2 w-full focus-visible:outline-none">
            <div className="grid w-full grid-cols-2 gap-2">
              <StatCard amount={stats.totalBet} label="Total Bet" />
              <StatCard amount={stats.totalProfit} label="Total Profit" />
              <StatCard amount={stats.totalWon} label="Total Won" />
              <StatCard amount={stats.totalLost} label="Total Lost" />
            </div>
          </div>
        </div>

        {!isOwnProfile ? <button type="button" className="inline-flex h-10 w-full min-w-16 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[#ff4fa3] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-[#ff4fa3]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff4fa3] focus-visible:ring-offset-2" onClick={handleTip}>Tip</button> : null}
        <button type="button" aria-label="Close" className="absolute right-4 top-4 rounded-sm bg-transparent p-0 text-white opacity-70 transition-opacity hover:opacity-100 focus:outline-none" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          <span className="sr-only">Close</span>
        </button>
      </div>
    </div>,
    document.body,
  )
}
