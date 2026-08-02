import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiRequest } from '../lib/apiClient'
import { isUuidLike, resolveStorageProfileId } from '../lib/supabaseClient'
import { getLevelStyle } from '../lib/levelStyles'
import { getRoleStyle } from '../lib/roleStyles'
import { useAuth } from '../store/auth'
import { notifications } from './Notifications'
import AnimatedStatNumber from './AnimatedStatNumber'

const profileCache = new Map()
const FALLBACK_AVATAR = '/login.png'

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

  const keys = [
    profile.id,
    profile.profile_id,
    profile.roblox_id,
    profile.username,
    profile.name,
    ...aliases,
  ]

  keys.forEach((value) => {
    const key = normalizeProfileCacheKey(value)
    if (key) profileCache.set(key, profile)
  })
}

export default function MiniProfileModal({ isOpen, player, onClose, onTip }) {
  const currentUser = useAuth((state) => state.user)
  const toggleIgnoredUser = useAuth((state) => state.toggleIgnoredUser)
  const [profile, setProfile] = useState(null)
  const [ignoreUpdating, setIgnoreUpdating] = useState(false)

  useEffect(() => {
    if (!isOpen) return undefined

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.()
    }

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
      return undefined
    }

    const rawIdentifiers = [player?.profile_id, player?.id, player?.user_id, player?.uuid].filter(Boolean)
    const candidateNames = [player?.username, player?.name, player?.display_name]
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)

    if (rawIdentifiers.length === 0 && candidateNames.length === 0) {
      setProfile(null)
      return undefined
    }

    let active = true
    const cacheAliases = [...rawIdentifiers, ...candidateNames]
    const cachedProfile = getCachedProfile(cacheAliases)
    if (cachedProfile) setProfile(cachedProfile)

    const loadProfile = async () => {
      try {
        const candidateIds = []
        for (const identifier of rawIdentifiers) {
          const trimmed = String(identifier).trim()
          if (!trimmed) continue
          if (isUuidLike(trimmed)) candidateIds.push(trimmed)

          const resolvedId = await resolveStorageProfileId(trimmed)
          if (isUuidLike(resolvedId)) candidateIds.push(resolvedId)
        }

        const uniqueIds = [...new Set(candidateIds.filter(Boolean))]

        const idRequest = uniqueIds.length > 0
          ? apiRequest(`/api/public-profiles?ids=${encodeURIComponent(uniqueIds.join(','))}`)
            .then((result) => ({ data: result?.profiles || [], error: null }))
            .catch((error) => ({ data: [], error }))
          : Promise.resolve({ data: [], error: null })
        const nameRequests = candidateNames.map((candidateName) => (
          apiRequest(`/api/public-profiles?username=${encodeURIComponent(candidateName)}`)
            .then((result) => ({ data: result?.profiles?.[0] || null, error: null }))
            .catch((error) => ({ data: null, error }))
        ))
        const [idResponse, ...nameResponses] = await Promise.all([idRequest, ...nameRequests])

        if (!active) return

        if (!idResponse.error && Array.isArray(idResponse.data) && idResponse.data.length > 0) {
          cacheProfile(idResponse.data[0], cacheAliases)
          setProfile(idResponse.data[0])
          return
        }

        for (const nameResponse of nameResponses) {
          if (!nameResponse.error && nameResponse.data) {
            cacheProfile(nameResponse.data, cacheAliases)
            setProfile(nameResponse.data)
            return
          }
        }

        if (!cachedProfile) setProfile(null)
      } catch (err) {
        console.warn('[MiniProfileModal] failed to load profile', err)
        if (active && !cachedProfile) setProfile(null)
      }
    }

    void loadProfile()

    return () => {
      active = false
    }
  }, [
    isOpen,
    player?.profile_id,
    player?.id,
    player?.user_id,
    player?.uuid,
    player?.username,
    player?.name,
    player?.display_name,
  ])

  if (!isOpen || typeof document === 'undefined') return null

  const playerKeys = [
    player?.profile_id,
    player?.id,
    player?.user_id,
    player?.uuid,
    player?.username,
    player?.name,
  ].map(normalizeProfileCacheKey).filter(Boolean)
  const profileKeys = [
    profile?.profile_id,
    profile?.id,
    profile?.user_id,
    profile?.uuid,
    profile?.username,
    profile?.name,
  ].map(normalizeProfileCacheKey).filter(Boolean)
  const profileMatchesPlayer = profileKeys.some((key) => playerKeys.includes(key))
  const resolvedProfile = {
    ...player,
    ...(profileMatchesPlayer ? profile : {}),
  }

  const username = resolvedProfile?.username || resolvedProfile?.name || 'aduplayercrazy80'
  const avatar =
    resolvedProfile?.avatar_headshot_url ||
    resolvedProfile?.avatar ||
    resolvedProfile?.avatar_url ||
    FALLBACK_AVATAR
  const level = Math.max(0, Number(resolvedProfile?.level ?? 0))
  const roleStyle = getRoleStyle(resolvedProfile?.role)
  const targetProfileId = String(
    profile?.id ||
    player?.profile_id ||
    resolvedProfile?.user_id ||
    resolvedProfile?.uuid ||
    '',
  ).trim()
  const currentProfileId = String(currentUser?.profile_id || currentUser?.id || '').trim()
  const isOwnProfile = Boolean(targetProfileId && targetProfileId === currentProfileId)
  const isIgnored = Boolean(
    targetProfileId &&
    Array.isArray(currentUser?.ignored_users) &&
    currentUser.ignored_users.includes(targetProfileId),
  )
  const stats = {
    totalPlayed: Number(resolvedProfile?.played ?? resolvedProfile?.totalPlayed ?? 0),
    won: Number(resolvedProfile?.won ?? 0),
    lost: Number(resolvedProfile?.lost ?? 0),
  }
  const handleToggleIgnored = async () => {
    if (ignoreUpdating) return
    setIgnoreUpdating(true)
    const nextIgnored = !isIgnored
    const updateRequest = toggleIgnoredUser(targetProfileId)
    notifications.success(`${username} ${nextIgnored ? 'ignored' : 'unignored'}.`)
    const result = await updateRequest
    if (result?.error) {
      notifications.error(
        result.error.message ||
        `Unable to ${nextIgnored ? 'ignore' : 'unignore'} ${username}; the change was reverted.`,
      )
    }
    setIgnoreUpdating(false)
  }

  return createPortal(
    <div
      className="miniProfileBackdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.()
      }}
    >
      <style>{`
        @keyframes miniProfileFadeIn {
          0% { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes miniProfileOpen {
          0% { opacity: 0; transform: scale(.97) translateY(4px); }
          to { opacity: 1; transform: scale(1); }
        }

        .miniProfileBackdrop {
          position: fixed;
          inset: 0;
          z-index: 2147483200;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background-color: rgba(0, 0, 0, .5);
          animation: miniProfileFadeIn .18s ease-out;
          font-family: Poppins, sans-serif;
        }

        .miniProfileModal,
        .miniProfileModal * {
          box-sizing: border-box;
          font-family: Poppins, sans-serif;
        }

        .miniProfileModal {
          position: relative;
          width: 90%;
          max-width: 440px;
          min-height: 450px;
          height: auto;
          max-height: none;
          margin: 20px;
          padding: 15px;
          overflow: visible;
          border: 1.2px solid #181a28;
          border-radius: 12px;
          background-color: #131520;
          box-shadow: 0 0 rgba(108, 99, 255, .25);
          color: #fff;
          text-align: center;
          animation: miniProfileOpen .18s cubic-bezier(.22, 1, .36, 1) forwards;
        }

        .miniProfileClose {
          position: absolute;
          top: 5px;
          right: 10px;
          padding: 0;
          border: none;
          background: none;
          color: #fff;
          font-size: 24px;
          line-height: normal;
          opacity: .8;
          cursor: pointer;
          transition: opacity .3s ease, transform .2s ease;
        }

        .miniProfileClose:hover {
          opacity: 1;
        }

        .miniProfileHeader {
          display: flex;
          align-items: center;
          margin-bottom: 25px;
          padding: 0 15px;
        }

        .miniProfileAvatar {
          width: 90px;
          height: 90px;
          flex-shrink: 0;
          border: 5px solid #22283f;
          border-radius: 50%;
          background-color: #1c1f2e;
          object-fit: cover;
          transition: transform .2s ease, box-shadow .2s ease;
        }

        .miniProfileUserInfo {
          min-width: 0;
          margin-left: 20px;
          text-align: left;
        }

        .miniProfileUserRow {
          display: flex;
          min-width: 0;
          align-items: center;
          gap: 10px;
        }

        .miniProfileLevel {
          display: flex;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          padding: 1px 6px;
          border-left: 2px solid;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
          user-select: none;
        }

        .miniProfileUsername {
          max-width: 220px;
          margin: 0;
          overflow: hidden;
          color: #fff;
          font-size: 1.4rem;
          font-weight: 700;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .miniProfileRankRow {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
        }

        .miniProfileRoleWrapper {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .miniProfileRankBackground {
          position: absolute;
          inset: 0;
          z-index: 0;
          border-radius: 5px;
          opacity: .3;
          filter: blur(0);
          transition: background .3s ease;
        }

        .miniProfileRank {
          position: relative;
          z-index: 1;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 3px 8px;
          border-radius: 8px;
          font-size: .95rem;
          font-weight: 600;
          letter-spacing: .8px;
          text-transform: uppercase;
          transition: background .3s ease;
        }

        .miniProfileRankImage {
          width: 22px;
          height: 22px;
          margin: 0;
          object-fit: contain;
        }

        .miniProfileIgnoreButton {
          margin: 0;
          outline: none;
          display: inline-flex;
          width: 28px;
          height: 28px;
          align-items: center;
          justify-content: center;
          padding: 0;
          border: none;
          border-radius: 6px;
          background: #2a2e44;
          color: #e1e4f2;
          box-shadow: none;
          cursor: pointer;
          flex-shrink: 0;
          font-family: Poppins, sans-serif;
          transform-origin: center center;
          transition: background .14s ease, color .14s ease, transform .13s cubic-bezier(.22, 1, .36, 1);
        }

        .miniProfileIgnoreButton:hover {
          background: #353d5b;
          color: #e1e4f2;
        }

        .miniProfileIgnoreButton[aria-pressed="true"] {
          background: #2a2e44;
          color: #e1e4f2;
        }

        .miniProfileIgnoreButton:active {
          transform: scale(.98);
        }

        .miniProfileIgnoreButton:focus,
        .miniProfileIgnoreButton:focus-visible {
          outline: none;
          box-shadow: none;
        }

        .miniProfileStats {
          display: flex;
          margin-top: 20px;
          padding: 0 15px;
          flex-direction: column;
          gap: 15px;
        }

        .miniProfileStatRow {
          display: flex;
          justify-content: space-between;
          gap: 10px;
        }

        .miniProfileStatBox {
          display: block;
          min-width: 0;
          padding: 15px;
          flex: 1;
          border-radius: 10px;
          background: #1c1f2e;
          color: #ccc;
          font-size: .9rem;
          font-weight: 600;
          letter-spacing: .6px;
          text-align: center;
          text-transform: uppercase;
          transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease;
        }

        .miniProfileStatBox strong {
          display: block;
          font-size: 1.1rem;
        }

        .miniProfileStatValue {
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
        }

        .miniProfileStatValue img {
          width: 20px;
          height: 20px;
          margin-top: 4px;
          margin-right: 5px;
        }

        .miniProfileStatValue span {
          display: block;
          margin-top: 5px;
          font-size: 1.4rem;
          font-weight: 600;
        }

        .miniProfileTipWrapper {
          display: flex;
          margin-top: 25px;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          text-align: center;
        }

        .miniProfileAction {
          width: 100%;
          max-width: 360px;
          min-height: 42px;
          padding: 0 20px;
          border: 1px solid rgba(94, 85, 217, .4);
          border-radius: 8px;
          background: linear-gradient(135deg, #5b52e2, #4038c0);
          box-shadow: 0 2px 8px rgba(108, 99, 255, .2);
          color: #fff;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transform-origin: center;
          transition: transform .13s cubic-bezier(.22, 1, .36, 1), background .15s ease, opacity .15s ease;
        }

        .miniProfileAction:hover:not(:disabled) {
          background: linear-gradient(135deg, #6c63ff, #5147d9);
          opacity: .95;
        }

        .miniProfileAction:active:not(:disabled) {
          transform: scale(.98);
        }

        .miniProfileAction:focus-visible {
          outline: 2px solid #8079ff;
          outline-offset: 2px;
        }

        @media (max-width: 840px) {
          .miniProfileBackdrop {
            padding: 0;
          }

          .miniProfileModal {
            width: 100%;
            max-width: 100%;
            min-height: 100%;
            height: auto;
            max-height: none;
            margin: 0;
            padding: 20px;
            overflow: visible;
            border-radius: 0;
          }

          .miniProfileHeader {
            margin-top: 10px;
          }

          .miniProfileAvatar {
            width: 70px;
            height: 70px;
          }

          .miniProfileStats {
            padding: 0 10px;
            flex-direction: column;
            gap: 10px;
          }

          .miniProfileStatBox {
            flex: 1 1 48%;
          }

          .miniProfileAction {
            width: 100%;
            max-width: none;
          }
        }
      `}</style>

      <div
        className="miniProfileModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mini-profile-username"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="miniProfileClose"
          aria-label="Close profile"
          onClick={onClose}
        >
          ×
        </button>

        <div className="miniProfileHeader">
          <img
            src={avatar}
            alt={`${username}'s profile`}
            className="miniProfileAvatar"
            draggable={false}
            referrerPolicy="no-referrer"
          />

          <div className="miniProfileUserInfo">
            <div className="miniProfileUserRow">
              <div
                className="miniProfileLevel"
                title={`Level ${level}`}
                style={getLevelStyle(level)}
              >
                <span>{level}</span>
              </div>
              <h2 id="mini-profile-username" className="miniProfileUsername">
                {username}
              </h2>
            </div>

            <div className="miniProfileRankRow">
              <div className="miniProfileRoleWrapper">
                <div
                  className="_rankBackground_8f3xs_118 miniProfileRankBackground"
                  style={{ backgroundColor: roleStyle.color }}
                />
                <p className="_rank_8f3xs_96 miniProfileRank" style={{ color: roleStyle.color }}>
                  {roleStyle.label}
                  {roleStyle.image ? (
                    <img
                      src={roleStyle.image}
                      className="_rankImage_8f3xs_145 miniProfileRankImage"
                      alt="Role Icon"
                    />
                  ) : null}
                </p>
              </div>
              {currentUser && targetProfileId && !isOwnProfile ? (
                <button
                  type="button"
                  className="_ignoreBtn_8f3xs_161 miniProfileIgnoreButton"
                  title={`${isIgnored ? 'Unignore' : 'Ignore'} ${username}`}
                  aria-label={`${isIgnored ? 'Unignore' : 'Ignore'} ${username}`}
                  aria-pressed={isIgnored}
                  disabled={ignoreUpdating}
                  onClick={() => { void handleToggleIgnored() }}
                >
                  <svg
                    stroke="currentColor"
                    fill="currentColor"
                    strokeWidth="0"
                    viewBox={isIgnored ? '0 0 576 512' : '0 0 640 512'}
                    height="1em"
                    width="1em"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d={isIgnored
                        ? 'M572.52 241.4C518.29 135.59 410.93 64 288 64S57.68 135.64 3.48 241.41a32.35 32.35 0 0 0 0 29.19C57.71 376.41 165.07 448 288 448s230.32-71.64 284.52-177.41a32.35 32.35 0 0 0 0-29.19zM288 400a144 144 0 1 1 144-144 143.93 143.93 0 0 1-144 144zm0-240a95.31 95.31 0 0 0-25.31 3.79 47.85 47.85 0 0 1-66.9 66.9A95.78 95.78 0 1 0 288 160z'
                        : 'M320 400c-75.85 0-137.25-58.71-142.9-133.11L72.2 185.82c-13.79 17.3-26.48 35.59-36.72 55.59a32.35 32.35 0 0 0 0 29.19C89.71 376.41 197.07 448 320 448c26.91 0 52.87-4 77.89-10.46L346 397.39a144.13 144.13 0 0 1-26 2.61zm313.82 58.1l-110.55-85.44a331.25 331.25 0 0 0 81.25-102.07 32.35 32.35 0 0 0 0-29.19C550.29 135.59 442.93 64 320 64a308.15 308.15 0 0 0-147.32 37.7L45.46 3.37A16 16 0 0 0 23 6.18L3.37 31.45A16 16 0 0 0 6.18 53.9l588.36 454.73a16 16 0 0 0 22.46-2.81l19.64-25.27a16 16 0 0 0-2.82-22.45zm-183.72-142l-39.3-30.38A94.75 94.75 0 0 0 416 256a94.76 94.76 0 0 0-121.31-92.21A47.65 47.65 0 0 1 304 192a46.64 46.64 0 0 1-1.54 10l-73.61-56.89A142.31 142.31 0 0 1 320 112a143.92 143.92 0 0 1 144 144c0 21.63-5.29 41.79-13.9 60.11z'}
                    />
                  </svg>
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="miniProfileStats">
          <div className="miniProfileStatRow">
            <div className="miniProfileStatBox">
              <strong>Total Played</strong>
              <div className="miniProfileStatValue">
                <img src="/bobux.png" alt="Total played" draggable={false} />
                <AnimatedStatNumber value={stats.totalPlayed} compact />
              </div>
            </div>
          </div>

          <div className="miniProfileStatRow">
            <div className="miniProfileStatBox">
              <strong>Won</strong>
              <div className="miniProfileStatValue">
                <img src="/bobux.png" alt="Won" draggable={false} />
                <AnimatedStatNumber value={stats.won} compact />
              </div>
            </div>

            <div className="miniProfileStatBox">
              <strong>Lost</strong>
              <div className="miniProfileStatValue">
                <img src="/bobux.png" alt="Lost" draggable={false} />
                <AnimatedStatNumber value={stats.lost} compact />
              </div>
            </div>
          </div>
        </div>

        <div className="miniProfileTipWrapper">
          <button
            type="button"
            className="miniProfileAction"
            onClick={() => onTip?.(resolvedProfile)}
          >
            Tip User
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
