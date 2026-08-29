import { useCallback, useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { connectSocket } from '../lib/socket'
import { apiRequest } from '../lib/apiClient'
import { isUuidLike, supabase } from '../lib/supabaseClient'
import { useAuth } from '../store/auth'
import CoinflipCreateModal from '../components/CoinflipCreateModal'
import CoinflipJoinModal from '../components/CoinflipJoinModal'
import CoinflipViewModal from '../components/CoinflipViewModal'
import RecentCoinflipsModal from '../components/RecentCoinflipsModal'
import MiniProfileModal, { preloadMiniProfile } from '../components/MiniProfileModal'
import AnimatedNumber from '../components/AnimatedNumber'
import TipUserModal from '../components/TipUserModal'
import CoinTipModal from '../components/CoinTipModal'
import { notifications } from '../components/Notifications'
import { formatPriceValue, parsePriceValue } from '../Utils/FormatPriceValues'
import { getCoinflipRoomGame } from '../lib/coinflipGameMode'
import AdoptMeTraitBadges from '../components/AdoptMeTraitBadges'

const DEFAULT_AVATAR = 'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-7E27815C7C5F72DA623094CFB3768D15-Png/420/420/AvatarHeadshot/Png/noFilter'
const RESOLVED_ROOM_LIFETIME_MS = 40_000
const ROOM_EXIT_ANIMATION_MS = 500
const RECENT_RESULT_LIMIT = 100
const CREATOR_VIEW_OPEN_DELAY_MS = 140
const COINFLIP_GAME_STORAGE_KEY = 'bloxdice:coinflip-game'
const COINFLIP_GAME_OPTIONS = [
  ['mm2', 'MM2'],
  ['adm', 'AMP'],
  ['ps99', 'PS99'],
]
let cachedCoinflipRooms = []

function mergeRecentCoinflipResults(current, incoming) {
  const byId = new Map(current.map((game) => [game.id, game]))

  for (const game of incoming) {
    const result = String(game?.result || '').toLowerCase()
    const id = game?.id || game?.room_id
    if (!id) continue

    if (game?.canceled || (result !== 'heads' && result !== 'tails')) {
      byId.delete(id)
      continue
    }

    byId.set(id, {
      ...normalizeRoom(game),
      id,
      result,
      resolved_at: game.resolved_at || game.updated_at || game.created_at || new Date().toISOString(),
    })
  }

  return Array.from(byId.values())
    .sort((a, b) => new Date(b.resolved_at).getTime() - new Date(a.resolved_at).getTime())
    .slice(0, RECENT_RESULT_LIMIT)
}

function formatCoinflipValue(value) {
  return formatPriceValue(value, { maximumFractionDigits: 2 })
}

function parseCoinflipValue(value) {
  return parsePriceValue(value)
}

function getRoomValueDetails(room) {
  const getItemsValue = (items) => Array.isArray(items)
    ? items.reduce((sum, item) => {
        const value = Number(item?.value ?? 0)
        return sum + (Number.isFinite(value) && value > 0 ? value : 0)
      }, 0)
    : 0

  const creatorItemValue = getItemsValue(room?.creator_items)
  const opponentItemValue = getItemsValue(room?.opponent_items)

  const fallbackValue = parseCoinflipValue(room?.value ?? room?.total_value ?? room?.totalValue ?? room?.numericValue ?? 0)
  const creatorValue = creatorItemValue > 0 ? creatorItemValue : fallbackValue
  const numericValue = creatorValue + opponentItemValue
  const range = room?.range || room?.value_range || `${formatCoinflipValue(creatorValue * 0.9)} - ${formatCoinflipValue(creatorValue * 1.1)}`

  return {
    numericValue,
    displayValue: formatCoinflipValue(numericValue),
    range,
  }
}

function normalizeRoom(room) {
  if (!room) return null

  const roomId = room.id || room.room_id || null
  const fingerprint = [room.creator_uuid, room.creator_username, room.creator_side, room.created_at, room.creator_items?.length ?? 0]
    .filter((value) => value !== null && value !== undefined && value !== '')
    .join('::')
  const valueDetails = getRoomValueDetails(room)

  const creatorAvatarUrl = room.creator_avatar_url || room.creator_avatar || room.player1?.avatar_headshot_url || room.player1?.avatar_headshot || room.player1?.avatar || room.player1?.avatar_url || null
  const opponentAvatarUrl = room.opponent_avatar_url || room.opponent_avatar || room.player2?.avatar_headshot_url || room.player2?.avatar_headshot || room.player2?.avatar || room.player2?.avatar_url || null

  return {
    ...room,
    id: roomId || fingerprint || `room-${Date.now()}`,
    creator_avatar_url: creatorAvatarUrl,
    opponent_avatar_url: opponentAvatarUrl,
    numericValue: valueDetails.numericValue,
    value: valueDetails.displayValue,
    total_value: valueDetails.numericValue,
    range: valueDetails.range,
  }
}

function normalizeCoinflipPreviewItem(item) {
  if (typeof item === 'string') {
    return {
      id: item,
      image: item,
      name: 'Unnamed item',
    }
  }

  return {
    ...item,
    id: item?.item_uuid || item?.id || item?.uuid || item?.image_url || item?.image,
    image: item?.image_url || item?.image || '',
    name: item?.name || 'Unnamed item',
    value: Number(item?.value ?? 0) || 0,
  }
}

function isCoinflipGemItem(item) {
  const name = String(item?.name || '').trim()
  const type = String(item?.type || item?.item_type || item?.game || '').trim()
  return /\bgems?\b/i.test(name) || /^(?:gems?|diamonds?)$/i.test(type)
}

export default function Coinflip({ isMinesPage = false, onInitialReady }) {
  const hasWarmRoomCache = !isMinesPage && cachedCoinflipRooms.length > 0
  const user = useAuth((state) => state.user)
  const balance = useAuth((state) => state.balance)
  const setBalance = useAuth((state) => state.setBalance)
  const walletSelection = useAuth((state) => state.walletSelection)
  const setAuthModalOpen = useAuth((state) => state.setAuthModalOpen)
  const [sortBy, setSortBy] = useState('Highest to Lowest')
  const [gameMode, setGameMode] = useState(() => {
    if (typeof window === 'undefined') return 'mm2'
    try {
      const savedGame = window.localStorage.getItem(isMinesPage ? 'bloxdice:mines-game' : COINFLIP_GAME_STORAGE_KEY)
      return COINFLIP_GAME_OPTIONS.some(([value]) => value === savedGame) ? savedGame : 'mm2'
    } catch {
      return 'mm2'
    }
  })
  const gameModeIndex = Math.max(0, COINFLIP_GAME_OPTIONS.findIndex(([value]) => value === gameMode))
  const [createOpen, setCreateOpen] = useState(false)
  const [joinRoom, setJoinRoom] = useState(null)
  const [viewRoom, setViewRoom] = useState(null)
  const [recentOpen, setRecentOpen] = useState(false)
  const [selectedProfile, setSelectedProfile] = useState(null)
  const [tipRecipient, setTipRecipient] = useState(null)
  const [isUserTipSubmitting, setIsUserTipSubmitting] = useState(false)
  const [userCoinTipAmount, setUserCoinTipAmount] = useState('')
  const [showUserCoinTipInChat, setShowUserCoinTipInChat] = useState(false)
  const [rooms, setRooms] = useState(() => (isMinesPage ? [] : cachedCoinflipRooms))
  const [recentPlayerResults, setRecentPlayerResults] = useState([])
  const [recentPlayerResultsLoading, setRecentPlayerResultsLoading] = useState(false)
  const [initialRoomsLoaded, setInitialRoomsLoaded] = useState(isMinesPage)
  const pageRootRef = useRef(null)
  const initialReadySentRef = useRef(false)
  const socketRef = useRef(null)
  const viewOpenTimerRef = useRef(null)
  const handledResolvedRoomIdsRef = useRef(new Set())
  const dismissedViewRoomIdsRef = useRef(new Set())

  useEffect(() => {
    const storageKey = isMinesPage ? 'bloxdice:mines-game' : COINFLIP_GAME_STORAGE_KEY
    try {
      window.localStorage.setItem(storageKey, gameMode)
    } catch {
      // Browsers can disable storage; the selected game still works for this session.
    }
    window.dispatchEvent(new CustomEvent('ampduel:game-mode-changed', {
      detail: { storageKey, gameMode },
    }))
  }, [gameMode, isMinesPage])

  useEffect(() => {
    if (!isMinesPage) cachedCoinflipRooms = rooms
  }, [isMinesPage, rooms])

  const openViewRoom = useCallback((room, delayMs = 0) => {
    if (viewOpenTimerRef.current) {
      window.clearTimeout(viewOpenTimerRef.current)
      viewOpenTimerRef.current = null
    }

    const roomId = String(room?.id || room?.room_id || '')
    if (roomId) dismissedViewRoomIdsRef.current.delete(roomId)

    if (delayMs <= 0) {
      setViewRoom(room)
      return
    }

    viewOpenTimerRef.current = window.setTimeout(() => {
      viewOpenTimerRef.current = null
      setViewRoom(room)
    }, delayMs)
  }, [])

  const closeViewRoom = useCallback((room) => {
    const roomId = String(room?.id || room?.room_id || '')
    if (roomId) dismissedViewRoomIdsRef.current.add(roomId)
    if (viewOpenTimerRef.current) {
      window.clearTimeout(viewOpenTimerRef.current)
      viewOpenTimerRef.current = null
    }
    setViewRoom(null)
  }, [])

  useEffect(() => () => {
    if (viewOpenTimerRef.current) window.clearTimeout(viewOpenTimerRef.current)
  }, [])

  useEffect(() => {
    if (isMinesPage) return undefined
    rooms.slice(0, 30).forEach((room) => {
      void preloadMiniProfile({
        profile_id: room.creator_uuid,
        username: room.creator_username,
      })
      if (room.opponent_uuid) {
        void preloadMiniProfile({
          profile_id: room.opponent_uuid,
          username: room.opponent_username,
        })
      }
    })
    return undefined
  }, [isMinesPage, rooms])

  useEffect(() => {
    if (!initialRoomsLoaded || initialReadySentRef.current || typeof onInitialReady !== 'function') return undefined
    let canceled = false
    let firstFrame = 0
    let secondFrame = 0

    const waitForVisibleImage = (image) => {
      if (image.complete) return image.decode?.().catch(() => undefined) || Promise.resolve()
      return new Promise((resolve) => {
        const finish = () => resolve()
        image.addEventListener('load', finish, { once: true })
        image.addEventListener('error', finish, { once: true })
      })
    }

    const finishInitialRender = async () => {
      try {
        await document.fonts?.ready
        const visibleImages = Array.from(pageRootRef.current?.querySelectorAll('img') || []).filter((image) => {
          const bounds = image.getBoundingClientRect()
          return bounds.bottom >= 0 && bounds.top <= window.innerHeight
        })
        await Promise.race([
          Promise.allSettled(visibleImages.map(waitForVisibleImage)),
          new Promise((resolve) => window.setTimeout(resolve, 4000)),
        ])
      } catch {
        // A failed decorative image must not permanently block the application.
      }
      if (canceled) return
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          if (canceled || initialReadySentRef.current) return
          initialReadySentRef.current = true
          onInitialReady()
        })
      })
    }

    void finishInitialRender()
    return () => {
      canceled = true
      if (firstFrame) window.cancelAnimationFrame(firstFrame)
      if (secondFrame) window.cancelAnimationFrame(secondFrame)
    }
  }, [initialRoomsLoaded, onInitialReady])

  const applyRoomUpdate = useCallback((incomingRoom) => {
    const normalized = normalizeRoom(incomingRoom)
    if (!normalized) return

    const roomId = String(normalized.id || '')
    const activeUser = useAuth.getState().user
    const activeProfileId = String(activeUser?.profile_id || activeUser?.id || '')
    const isFirstResolvedUpdate = Boolean(
      normalized.result &&
      roomId &&
      !handledResolvedRoomIdsRef.current.has(roomId),
    )

    if (isFirstResolvedUpdate) {
      handledResolvedRoomIdsRef.current.add(roomId)
      if (activeProfileId === String(normalized.winner_uuid || '')) {
        window.dispatchEvent(new CustomEvent('wallet:updated'))
      }
    }

    const isActiveParticipant = Boolean(
      activeProfileId && (
        activeProfileId === String(normalized.creator_uuid || '') ||
        activeProfileId === String(normalized.opponent_uuid || '')
      )
    )
    if (isActiveParticipant || normalized.canceled) {
      setRecentPlayerResults((current) => mergeRecentCoinflipResults(current, [normalized]))
    }
    setRooms((current) => {
      if (normalized.canceled) {
        return current.filter((existing) => String(existing.id) !== roomId)
      }

      const existingIndex = current.findIndex((existing) => String(existing.id) === roomId)
      if (existingIndex < 0) return [normalized, ...current]
      const nextRooms = [...current]
      nextRooms[existingIndex] = { ...nextRooms[existingIndex], ...normalized }
      return nextRooms
    })

    const isJoiningOpponent = Boolean(
      activeProfileId &&
      activeProfileId === String(normalized.opponent_uuid || ''),
    )
    if (
      isFirstResolvedUpdate &&
      isJoiningOpponent &&
      !dismissedViewRoomIdsRef.current.has(roomId)
    ) {
      openViewRoom(normalized)
      return
    }

    setViewRoom((current) => {
      if (normalized.canceled && current?.id === normalized.id) return null
      return current?.id === normalized.id ? { ...current, ...normalized } : current
    })
  }, [openViewRoom])

  useEffect(() => {
    if (isMinesPage) return undefined
    const socket = connectSocket()
    socketRef.current = socket

    const upsertRoom = (incomingRoom) => {
      const room = normalizeRoom(incomingRoom)
      if (!room) return

      setRooms((prev) => {
        const existingIndex = prev.findIndex((existing) => {
          const nextId = room.id
          const currentId = existing.id || existing.room_id
          if (nextId && currentId && nextId === currentId) return true

          const currentFingerprint = [existing.creator_uuid, existing.creator_username, existing.creator_side, existing.created_at, existing.creator_items?.length ?? 0]
            .filter((value) => value !== null && value !== undefined && value !== '')
            .join('::')

          return currentFingerprint && currentFingerprint === [room.creator_uuid, room.creator_username, room.creator_side, room.created_at, room.creator_items?.length ?? 0]
            .filter((value) => value !== null && value !== undefined && value !== '')
            .join('::')
        })

        if (existingIndex >= 0) {
          const nextRooms = [...prev]
          nextRooms[existingIndex] = { ...nextRooms[existingIndex], ...room }
          return nextRooms
        }

        // mark as new so UI can animate
        const newRoom = { ...room, isNew: true }
        // schedule clearing the isNew flag after animation
        setTimeout(() => {
          setRooms((cur) => cur.map((r) => (r.id === newRoom.id ? { ...r, isNew: false } : r)))
        }, 700)

        return [newRoom, ...prev]
      })
    }

    const handleCreated = (room) => {
      try {
        upsertRoom(room)
      } catch (err) {
        console.warn('[coinflip] handleCreated error', err)
      }
    }

    const handleUpdated = (room) => applyRoomUpdate(room)

    socket.on('coinflip:created', handleCreated)
    socket.on('coinflip:updated', handleUpdated)

    return () => {
      socket.off('coinflip:created', handleCreated)
      socket.off('coinflip:updated', handleUpdated)
    }
  }, [applyRoomUpdate, isMinesPage])

  useEffect(() => {
    if (isMinesPage) {
      setRecentPlayerResults([])
      setRecentPlayerResultsLoading(false)
      return undefined
    }
    if (!recentOpen) {
      setRecentPlayerResultsLoading(false)
      return undefined
    }
    let isMounted = true
    const activeProfileId = String(user?.profile_id || user?.id || '').trim()

    const loadRecentResults = async () => {
      if (!activeProfileId) {
        setRecentPlayerResults([])
        setRecentPlayerResultsLoading(false)
        return
      }

      setRecentPlayerResultsLoading(true)
      try {
        const playerResult = await apiRequest(`/api/coinflip/history?game=${encodeURIComponent(gameMode)}`, { cache: 'no-store' })
        if (!isMounted) return
        setRecentPlayerResults(mergeRecentCoinflipResults([], Array.isArray(playerResult?.history) ? playerResult.history : []))
      } catch (playerError) {
        if (!isMounted) return
        console.warn('[coinflip] failed to load player flip history', playerError)
        setRecentPlayerResults([])
      } finally {
        if (isMounted) setRecentPlayerResultsLoading(false)
      }
    }

    void loadRecentResults()

    const channel = supabase
      .channel('coinflip-recent-results')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coinflip_games' }, (payload) => {
        const game = payload.new || payload.old
        if (!game) return
        applyRoomUpdate(payload.eventType === 'DELETE' ? { ...game, canceled: true } : game)
      })
      .subscribe()

    return () => {
      isMounted = false
      supabase.removeChannel(channel)
    }
  }, [applyRoomUpdate, gameMode, isMinesPage, recentOpen, user?.id, user?.profile_id])

  // Derived stats for the stat cards
  const gameRooms = isMinesPage ? [] : rooms.filter((room) => getCoinflipRoomGame(room) === gameMode)
  const activeRoomsCount = gameRooms.filter((room) => !room.canceled && !room.result).length
  const totalValueSum = gameRooms.reduce((sum, room) => sum + Number(room.total_value ?? room.numericValue ?? 0), 0)
  const totalItemsCount = gameRooms.reduce((sum, room) => sum + (Array.isArray(room.creator_items) ? room.creator_items.length : 0) + (Array.isArray(room.opponent_items) ? room.opponent_items.length : 0), 0)

  useEffect(() => {
    if (isMinesPage) return undefined
    window.dispatchEvent(new CustomEvent('coinflip:nav-value', { detail: { value: totalValueSum } }))
    return undefined
  }, [isMinesPage, totalValueSum])
  useEffect(() => {
    const timers = []

    rooms.forEach((room) => {
      if (!room?.result) return

      if (room.isExiting) {
        timers.push(window.setTimeout(() => {
          setRooms((current) => current.filter((item) => item.id !== room.id))
          setViewRoom((current) => (current?.id === room.id ? null : current))
        }, ROOM_EXIT_ANIMATION_MS))
        return
      }

      const resolvedAt = new Date(room.resolved_at || room.created_at || Date.now()).getTime()
      const elapsed = Number.isFinite(resolvedAt) ? Date.now() - resolvedAt : 0
      const remaining = Math.max(0, RESOLVED_ROOM_LIFETIME_MS - elapsed)

      timers.push(window.setTimeout(() => {
        setRooms((current) => current.map((item) => (
          item.id === room.id ? { ...item, isExiting: true } : item
        )))
      }, remaining))
    })

    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [rooms])

  // Load active coinflip rooms from Supabase on initial load so state persists across refreshes
  useEffect(() => {
    if (isMinesPage) return undefined
    let isMounted = true
    const loadRooms = async () => {
      try {
        const resolvedCutoff = new Date(Date.now() - RESOLVED_ROOM_LIFETIME_MS).toISOString()
        const { data, error } = await supabase
          .from('coinflip_games')
          .select('*')
          .eq('canceled', false)
          .or(`result.is.null,resolved_at.gte.${resolvedCutoff}`)
          .order('created_at', { ascending: false })

        if (!isMounted) return
        if (error) {
          console.warn('[coinflip] failed to load rooms', error)
          return
        }

        const normalized = Array.isArray(data)
          ? data
              .map((room) => normalizeRoom({
                ...room,
                _skipResultCountdown: Boolean(room?.result),
              }))
              .filter(Boolean)
          : []
        for (const room of normalized) {
          if (room.result && room.id) handledResolvedRoomIdsRef.current.add(String(room.id))
        }
        setRooms((prev) => {
          // merge existing rooms with fetched ones, preferring fetched
          const byId = new Map()
          for (const r of prev) byId.set(r.id, r)
          for (const r of normalized) byId.set(r.id, r)
          return Array.from(byId.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        })
      } catch (err) {
        console.warn('[coinflip] loadRooms error', err)
      } finally {
        if (isMounted) setInitialRoomsLoaded(true)
      }
    }

    void loadRooms()
    return () => { isMounted = false }
  }, [isMinesPage])

  const getTipRecipientId = (recipient) => String(
    recipient?.profile_id ||
    recipient?.user_id ||
    recipient?.uuid ||
    recipient?.id ||
    '',
  ).trim()

  const openTipModal = (recipient) => {
    setSelectedProfile(null)
    if (viewRoom) closeViewRoom(viewRoom)

    if (!user) {
      setAuthModalOpen(true)
      return
    }

    setTipRecipient(recipient)
  }

  const handleUserItemTip = async (items) => {
    if (isUserTipSubmitting || !tipRecipient || !Array.isArray(items) || items.length === 0) return

    const recipientId = getTipRecipientId(tipRecipient)
    const senderId = String(user?.profile_id || user?.id || '').trim()
    const itemIds = items.map((item) => item.id).filter(Boolean)

    if (!isUuidLike(recipientId)) {
      notifications.error("This user's profile could not be found.")
      return
    }
    if (recipientId === senderId) {
      notifications.error('You cannot tip items to yourself.')
      return
    }
    if (itemIds.length === 0) {
      notifications.error('Select at least one item to tip.')
      return
    }

    setIsUserTipSubmitting(true)
    try {
      await apiRequest('/api/tips/items', {
        method: 'POST',
        body: JSON.stringify({
          recipient_profile_id: recipientId,
          item_ids: itemIds,
          show_in_chat: false,
        }),
      })

      notifications.tippedUser(tipRecipient.username || tipRecipient.name || 'user')
      window.dispatchEvent(new CustomEvent('wallet:updated'))
      setTipRecipient(null)
    } catch (error) {
      console.error('[Coinflip] failed to tip inventory items', error)
      notifications.error(error?.message || 'Failed to tip items.')
    } finally {
      setIsUserTipSubmitting(false)
    }
  }

  const handleUserCoinTip = async () => {
    if (isUserTipSubmitting || !tipRecipient || !user) return

    const amount = Number(userCoinTipAmount)
    const recipientId = getTipRecipientId(tipRecipient)
    const senderId = String(user.profile_id || user.id || '').trim()

    if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
      notifications.invalidTipAmount()
      return
    }
    if (amount > Number(balance || 0)) {
      notifications.insufficientCoins()
      return
    }
    if (!isUuidLike(recipientId)) {
      notifications.error("This user's profile could not be found.")
      return
    }
    if (recipientId === senderId) {
      notifications.error('You cannot tip coins to yourself.')
      return
    }

    setIsUserTipSubmitting(true)
    try {
      const result = await apiRequest('/api/tips/coins', {
        method: 'POST',
        body: JSON.stringify({
          recipient_profile_id: recipientId,
          amount,
          show_in_chat: showUserCoinTipInChat,
        }),
      })

      setBalance(Number(result?.balance ?? (Number(balance || 0) - amount)))
      window.dispatchEvent(new CustomEvent('wallet:updated'))
      notifications.tippedUser(tipRecipient.username || tipRecipient.name || 'user')
      setUserCoinTipAmount('')
      setShowUserCoinTipInChat(false)
      setTipRecipient(null)
    } catch (error) {
      console.error('[Coinflip] failed to tip coins', error)
      notifications.error(error?.message || 'Failed to tip coins.')
    } finally {
      setIsUserTipSubmitting(false)
    }
  }

  return (
    <div ref={pageRootRef} className="reference-coinflip flex-1 overflow-x-hidden bg-transparent">
      <style>{`
        @keyframes coinflip-slide-in { from { transform: translateY(-8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .reference-coinflip {
          min-height: 100%;
          background-color: #111319;
          background-image: url('/cf-paw-pattern.svg');
          background-repeat: repeat;
          background-size: 180px 180px;
          background-position: 0 18px;
        }
        @keyframes coinflip-resolved-out {
          from {
            opacity: 1;
            filter: blur(0);
            transform: scale(1);
          }
          to {
            opacity: 0;
            filter: blur(2px);
            transform: scale(.985);
          }
        }
        @keyframes coinflip-row-winner-in {
          from { opacity: 0; transform: scale(0); }
          to { opacity: 1; transform: scale(1); }
        }
        .coinflip-row-winner-coin {
          display: block;
          width: 58px;
          height: 58px;
          object-fit: contain;
          animation: coinflip-row-winner-in 150ms forwards;
        }
        .coinflip-row-avatar {
          position: relative;
          display: block;
          width: 58px;
          height: 58px;
          flex: 0 0 58px;
          padding: 0;
          overflow: hidden;
          border: 2px solid #ff4fa3;
          border-radius: 9999px;
          background: #111319;
          cursor: pointer;
          box-shadow: none;
          transition: border-color .2s ease, opacity .2s ease;
        }
        .coinflip-row-avatar--heads { border-color: #ff4fa3; }
        .coinflip-row-avatar--tails { border-color: #1f6fff; }
        .coinflip-row-avatar:disabled { cursor: default; }
        .coinflip-row-avatar:not(:disabled):hover { opacity: .9; }
        .coinflip-row-avatar:focus-visible { outline: 2px solid #ff4fa3; outline-offset: 2px; }
        .coinflip-row-avatar-image { display: block; width: 54px; height: 54px; border-radius: 9999px; object-fit: cover; }
        .coinflip-row-avatar--winner { box-shadow: none; }
        .coinflip-row-avatar--loser { filter: none; }
        .coinflip-row-battle-icon {
          color: #6c7399;
          transition: color .2s ease;
        }
        .coinflip-room-row:hover .coinflip-row-battle-icon { color: #ff4fa3; }
        .game-preview-shell { width: 100%; container-type: inline-size; }
        .coinflip-room-row {
          display: grid;
          min-height: 105px;
          box-sizing: border-box;
          grid-template-columns: auto minmax(190px, 1fr) 86px minmax(120px, 145px) auto;
          align-items: center;
          justify-content: space-between;
          gap: clamp(10px, 1.25cqw, 20px);
          padding: 12px 20px;
          overflow: visible;
          border: 1px solid rgba(255, 255, 255, .07);
          border-radius: 9px;
          background: #191c24;
          box-shadow: 0 8px 24px rgba(0, 0, 0, .14);
          font-family: Poppins, sans-serif;
        }
        .game-preview-players {
          display: flex;
          width: auto;
          min-width: 0;
          flex: 0 0 auto;
          align-items: center;
          justify-content: center;
          gap: 12px;
        }
        .game-preview-player { position: relative; flex: 0 0 58px; width: 58px; height: 58px; opacity: 1; transition: opacity .22s ease, filter .22s ease; }
        .game-preview-player--loser { opacity: .42; filter: saturate(.65) brightness(.78); }
        .game-preview-side-coin {
          position: absolute;
          top: -7px;
          right: -7px;
          z-index: 2;
          display: block;
          width: 28px;
          height: 28px;
          object-fit: contain;
          pointer-events: none;
        }
        .game-preview-versus { margin: 0; color: #717784; font-size: 11px; font-weight: 700; line-height: 16.5px; }
        .game-preview-waiting {
          display: flex;
          width: 100%;
          height: 100%;
          align-items: center;
          justify-content: center;
          border-radius: 9999px;
          color: #f7fafc;
          background: #111319;
          font-size: 18px;
          font-weight: 400;
        }
        .game-preview-items {
          display: flex;
          min-width: 0;
          height: 76px;
          flex: 0 0 auto;
          align-items: center;
          justify-content: flex-start;
          gap: 0;
          padding: 4px 0 8px;
          overflow: visible;
          scrollbar-width: none;
        }
        .game-preview-items::-webkit-scrollbar { display: none; }
        .game-preview-item + .game-preview-item { margin-left: -18px; }
        .game-preview-item {
          position: relative;
          display: flex;
          width: 64px;
          height: 64px;
          flex: 0 0 64px;
          box-sizing: border-box;
          align-items: center;
          justify-content: center;
          overflow: visible;
          border: 1px solid rgba(255,255,255,.05);
          border-radius: 9999px;
          background: #12151c;
          cursor: default;
          box-shadow: none;
          filter: none;
          transition: none;
        }
        .game-preview-item:hover {
          border-color: rgba(255,255,255,.05);
          background: #12151c;
          box-shadow: none;
          filter: none;
          transform: none;
        }
        .game-preview-item-image { display: block; width: calc(100% - 6px); height: calc(100% - 6px); padding: 0; border-radius: 9999px; object-fit: cover; pointer-events: none; }
        .game-preview-item-image--mm2 { width: calc(100% - 10px); height: calc(100% - 10px); }
        .game-preview-item-image--gem { width: 78%; height: 78%; object-fit: contain; }
        .game-preview-tooltip {
          position: absolute;
          bottom: calc(100% + 8px);
          left: 50%;
          z-index: 40;
          width: max-content;
          max-width: 180px;
          padding: 5px 9px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 5px;
          background: #191c24;
          color: #f4f5f8;
          box-shadow: none;
          font-family: Poppins, sans-serif;
          font-size: 11px;
          font-weight: 600;
          line-height: 16px;
          letter-spacing: 0;
          opacity: 0;
          visibility: hidden;
          transform: translate(-50%, 3px);
          white-space: nowrap;
          text-overflow: ellipsis;
          pointer-events: none;
          transition: opacity .12s ease, transform .12s ease, visibility 0s linear .12s;
        }
        .game-preview-item:hover .game-preview-tooltip {
          opacity: 1;
          visibility: visible;
          transform: translate(-50%, 0);
          transition-delay: 0s;
        }
        .game-preview-more {
          position: absolute;
          inset: 0;
          z-index: 3;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: rgba(15,18,30,.84);
          color: #fff;
          backdrop-filter: blur(2px);
          font-size: 13px;
          font-weight: 600;
          pointer-events: none;
        }
        .game-preview-result { position: relative; display: flex; width: 86px; height: 78px; flex: 0 0 auto; align-items: center; justify-content: center; overflow: visible; }
        .coinflip-row-result-video {
          display: block;
          width: 78px;
          height: 78px;
          object-fit: contain;
          mix-blend-mode: screen;
          pointer-events: none;
        }
        .game-preview-mode {
          display: grid;
          width: 54px;
          height: 54px;
          place-items: center;
          border: 1px solid rgba(255,79,163,.5);
          border-radius: 50%;
          background: rgba(255,79,163,.08);
          font-size: 23px;
        }
        .game-preview-value { width: 145px; min-width: 0; flex: 0 0 auto; text-align: center; }
        .game-preview-value-total { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 0; color: #f4f5f8; font-size: 15px; font-weight: 700; line-height: 22.5px; }
        .game-preview-value-total svg { width: 16px; height: 16px; flex: 0 0 16px; }
        .game-preview-range { margin: 4px 0 0; color: #777e8d; font-size: 11px; font-weight: 600; line-height: 16.5px; white-space: nowrap; }
        .game-preview-actions { display: flex; flex: 0 0 auto; align-items: center; justify-content: center; gap: 6px; }
        .game-preview-join,
        .game-preview-view {
          display: inline-flex;
          height: 42px;
          box-sizing: border-box;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 8px;
          box-shadow: none;
          font-family: Poppins, sans-serif;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: opacity .15s ease, background-color .15s ease;
        }
        .game-preview-join { min-width: 40px; padding: 0 20px; background: #ff4fa3; color: #111319; line-height: 15.6px; }
        .game-preview-view { width: 42px; min-width: 42px; padding: 0; background: #2b303c; color: #f1f2f5; }
        .game-preview-view svg { width: 16px; height: 16px; }
        .game-preview-join:hover:not(:disabled), .game-preview-view:hover { opacity: .88; }
        .game-preview-join:disabled { cursor: not-allowed; opacity: .5; }
        .game-preview-join:focus-visible, .game-preview-view:focus-visible { outline: 2px solid #ff4fa3; outline-offset: 2px; }
        .coinflip-top-counter { height: 40px; border-radius: 8px; }
        .coinflip-sort-trigger { height: 48px; border-radius: 8px; }
        @container (min-width: 560px) and (max-width: 819px) {
          .coinflip-room-row {
            grid-template-columns: auto minmax(120px, 1fr) auto;
            grid-template-areas: "players value actions" "items items items";
            gap: 12px 16px;
          }
          .game-preview-players { grid-area: players; }
          .game-preview-items { grid-area: items; }
          .game-preview-result { display: none; }
          .game-preview-value { grid-area: value; }
          .game-preview-actions { grid-area: actions; }
        }
        @container (max-width: 559px) {
          .coinflip-room-row {
            grid-template-columns: minmax(0, 1fr) auto;
            grid-template-areas: "players actions" "items items" "value value";
            gap: 13px 10px;
            padding: 12px;
          }
          .game-preview-players { grid-area: players; min-width: 0; }
          .game-preview-items { grid-area: items; overflow: visible; padding-bottom: 2px; }
          .game-preview-result { display: none; }
          .game-preview-value { grid-area: value; text-align: left; }
          .game-preview-value-total { justify-content: flex-start; }
          .game-preview-range { text-align: left; }
          .game-preview-actions { grid-area: actions; }
          .game-preview-join { min-width: 62px; padding: 0 12px; }
          .game-preview-item { width: 48px; height: 48px; flex-basis: 48px; }
        }
        @media (max-width: 640px) {
          .coinflip-top-counter { height: 40px; }
          .coinflip-sort-trigger { height: 48px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .coinflip-row-avatar, .game-preview-item {
            transition-duration: 0ms;
          }
          .coinflip-row-result-video { display: none; }
          .coinflip-row-winner-coin { animation-duration: 1ms; }
        }
        @keyframes coinflipGameListIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .coinflip-game-list { animation: none; }
        @media (prefers-reduced-motion: reduce) {
          .coinflip-game-list { animation: none; }
        }
      `}</style>
      <div className="relative z-10 flex w-full flex-col px-3 pb-32 pt-3 sm:px-[18px] sm:pt-5">
        {/* Stats Cards */}
        <div className="grid gap-2 md:grid-cols-3">
          <StatCard
            value={totalItemsCount}
            label="Total Items"
            showIcon={false}
            animateOnMount={!hasWarmRoomCache}
          />
          <StatCard
            icon="/currency.svg"
            value={totalValueSum}
            label="Total Value"
            animateOnMount={!hasWarmRoomCache}
          />
          <StatCard
            value={activeRoomsCount}
            label="Active Games"
            showIcon={false}
            animateOnMount={!hasWarmRoomCache}
          />
        </div>

        {/* Game controls */}
        <div className="mb-[10px] mt-3 flex flex-col justify-between gap-2 sm:flex-row">
          <div role="tablist" aria-label={isMinesPage ? 'Mines game' : 'CoinFlip game'} className="relative grid h-[43px] w-full isolate grid-cols-3 items-center justify-center overflow-hidden rounded-md bg-[hsl(229_17%_13%)] sm:w-auto">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 z-0 rounded-md bg-[#ff4fa3] shadow-sm transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)]"
              style={{ width: 'calc(100% / 3)', transform: `translateX(${gameModeIndex * 100}%)` }}
            />
            {COINFLIP_GAME_OPTIONS.map(([value, label]) => {
              const active = gameMode === value
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setGameMode(value)}
                  className={`relative z-10 inline-flex items-center justify-center whitespace-nowrap rounded-sm px-5 py-1.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff4fa3] focus-visible:ring-offset-2 ${active ? 'font-semibold text-black' : 'text-white/60 hover:text-white'}`}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                if (!user) {
                  setAuthModalOpen(true)
                  return
                }
                setCreateOpen(true)
              }}
              className="inline-flex h-[43px] min-w-[98px] items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[#ff4fa3] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-[#ff4fa3]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff4fa3] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              Create
            </button>
            <button type="button" onClick={() => {
              if (!user) {
                setAuthModalOpen(true)
                return
              }
              if (!isMinesPage) setRecentOpen(true)
            }} className="inline-flex h-[43px] min-w-[92px] items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[hsl(233_16%_22%)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[hsl(233_16%_26%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50">
              History
            </button>
          </div>
        </div>

        {/* Room Cards */}
        <div className="coinflip-game-list flex flex-col gap-2">
          {gameRooms.length > 0 &&
            gameRooms
              .slice()
              .sort((a, b) => {
                const aVal = Number(a.numericValue ?? 0)
                const bVal = Number(b.numericValue ?? 0)
                if (sortBy === 'Highest to Lowest') return bVal - aVal
                if (sortBy === 'Lowest to Highest') return aVal - bVal
                if (sortBy === 'Alphabetical') return String(a.creator_username || '').localeCompare(String(b.creator_username || ''))
                return 0
              })
              .map((room) => (
                <div className="game-preview-shell" key={room.id}>
                  <RoomCard
                    room={room}
                    onJoin={() => setJoinRoom(room)}
                    onView={() => openViewRoom(room)}
                    onProfileOpen={setSelectedProfile}
                  />
                </div>
              ))
          }
        </div>
      </div>
      {createOpen && <CoinflipCreateModal
        gameMode={gameMode}
        title={isMinesPage ? 'Create Mines' : 'Create Coinflip'}
        showCoinSelection={!isMinesPage}
        creationEnabled={!isMinesPage}
        onClose={() => setCreateOpen(false)}
        onCreate={(room) => {
        const normalized = normalizeRoom(room)
        if (!normalized) return
        setRooms((prev) => {
          const existingIndex = prev.findIndex((existing) => {
            const nextId = normalized.id
            const currentId = existing.id || existing.room_id
            if (nextId && currentId && nextId === currentId) return true

            const currentFingerprint = [existing.creator_uuid, existing.creator_username, existing.creator_side, existing.created_at, existing.creator_items?.length ?? 0]
              .filter((value) => value !== null && value !== undefined && value !== '')
              .join('::')

            return currentFingerprint && currentFingerprint === [normalized.creator_uuid, normalized.creator_username, normalized.creator_side, normalized.created_at, normalized.creator_items?.length ?? 0]
              .filter((value) => value !== null && value !== undefined && value !== '')
              .join('::')
          })

          if (existingIndex >= 0) {
            const nextRooms = [...prev]
            nextRooms[existingIndex] = { ...nextRooms[existingIndex], ...normalized }
            return nextRooms
          }

          const newRoom = { ...normalized, isNew: true }
          setTimeout(() => {
            setRooms((cur) => cur.map((r) => (r.id === newRoom.id ? { ...r, isNew: false } : r)))
          }, 700)

          return [newRoom, ...prev]
        })
        openViewRoom(normalized, CREATOR_VIEW_OPEN_DELAY_MS)
        }}
      />}
      {!isMinesPage && joinRoom && (
        <CoinflipJoinModal
          room={joinRoom}
          gameMode={gameMode}
          onClose={() => setJoinRoom(null)}
          onJoin={({ updatedRoom } = {}) => {
            if (updatedRoom) {
              const normalized = normalizeRoom(updatedRoom)
              setRooms((prev) => prev.map((existing) => (existing.id === normalized.id ? { ...existing, ...normalized } : existing)))
              openViewRoom(normalized)
            }
            setJoinRoom(null)
          }}
        />
      )}
      {!isMinesPage && <RecentCoinflipsModal
        isOpen={recentOpen}
        games={recentPlayerResults.filter((game) => getCoinflipRoomGame(game) === gameMode)}
        loading={recentPlayerResultsLoading}
        isAuthenticated={Boolean(user?.profile_id || user?.id)}
        onClose={() => setRecentOpen(false)}
        onView={(game) => {
          setRecentOpen(false)
          openViewRoom(game, 180)
        }}
        onProfileOpen={(player) => {
          void preloadMiniProfile(player).then((loadedProfile) => {
            setSelectedProfile({ ...player, ...(loadedProfile || {}) })
          })
        }}
      />}
      {!isMinesPage && viewRoom && (
        <CoinflipViewModal
          room={viewRoom}
          onClose={() => closeViewRoom(viewRoom)}
          onJoin={(room) => {
            setViewRoom(null)
            setJoinRoom(room)
          }}
          onProfileOpen={(player) => {
            void preloadMiniProfile(player).then((loadedProfile) => {
              setSelectedProfile({ ...player, ...(loadedProfile || {}) })
            })
          }}
          profileOpen={Boolean(selectedProfile)}
          onCanceled={(canceledRoom) => {
            const canceledId = canceledRoom?.id || canceledRoom?.room_id
            setRooms((prev) => prev.filter((existing) => existing.id !== canceledId))
            closeViewRoom(canceledRoom || viewRoom)
            window.dispatchEvent(new CustomEvent('wallet:updated'))
          }}
        />
      )}
      <MiniProfileModal
        isOpen={Boolean(selectedProfile)}
        player={selectedProfile}
        allowOwnProfile
        onClose={() => setSelectedProfile(null)}
        onTip={openTipModal}
      />
      <TipUserModal
        isOpen={Boolean(tipRecipient) && walletSelection === 'items'}
        recipient={tipRecipient}
        gameMode={gameMode}
        isSubmitting={isUserTipSubmitting}
        onClose={() => {
          if (!isUserTipSubmitting) setTipRecipient(null)
        }}
        onSubmit={handleUserItemTip}
      />
      <CoinTipModal
        isOpen={Boolean(tipRecipient) && walletSelection === 'coins'}
        recipient={tipRecipient}
        amount={userCoinTipAmount}
        showInChat={showUserCoinTipInChat}
        isSubmitting={isUserTipSubmitting}
        onAmountChange={setUserCoinTipAmount}
        onShowInChatChange={setShowUserCoinTipInChat}
        onClose={() => {
          if (!isUserTipSubmitting) {
            setUserCoinTipAmount('')
            setShowUserCoinTipInChat(false)
            setTipRecipient(null)
          }
        }}
        onSubmit={handleUserCoinTip}
      />
    </div>
  )
}

function StatCard({ icon, value, label, showIcon = true, animateOnMount = true }) {
  return (
    <div className="flex min-h-[76px] items-center justify-start gap-3 rounded-lg border border-[hsl(231_16%_16%)] bg-[hsl(230_16%_14%)] px-4 py-2">
      <div className="flex w-full flex-col items-start justify-center text-left">
        <span className="flex items-center justify-start gap-2 text-left text-2xl font-bold leading-tight text-white">
          {showIcon && icon && <img src={icon} alt="" className="h-5 w-5" />}
          <AnimatedNumber value={value} duration={260} fastThreshold={100_000_000} fastDuration={160} animateOnMount={animateOnMount} />
        </span>
        <span className="text-left text-base font-semibold leading-tight text-white opacity-60">{label}</span>
      </div>
    </div>
  )
}

function CoinflipRowResult({ room, side, onReveal }) {
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    setRevealed(false)
  }, [room?.id, room?.result])

  const revealWinner = () => {
    setRevealed(true)
    onReveal?.()
  }

  if (revealed) {
    return (
      <img
        src={side === 'heads' ? '/heads.webp' : '/tails.webp'}
        className="coinflip-row-winner-coin"
        alt={`${side} won`}
        draggable={false}
      />
    )
  }

  return (
    <video
      className="coinflip-row-result-video"
      src={side === 'heads' ? '/heads.webm' : '/tails.webm'}
      autoPlay
      muted
      playsInline
      preload="auto"
      disablePictureInPicture
      onEnded={revealWinner}
      onError={revealWinner}
      aria-label={`${side} coinflip result`}
    />
  )
}

function RoomCard({ room, onJoin, onView, onProfileOpen }) {
  const user = useAuth((state) => state.user)
  const creatorSide = String(room.creator_side || 'heads').toLowerCase()
  const opponentSide = String(room.opponent_side || (creatorSide === 'heads' ? 'tails' : 'heads')).toLowerCase()

  const creatorAvatarUrl = room.creator_avatar_url || room.creator_avatar || room.player1?.avatar_headshot_url || room.player1?.avatar_headshot || room.player1?.avatar || room.player1?.avatar_url || null
  const opponentAvatarUrl = room.opponent_avatar_url || room.opponent_avatar || room.player2?.avatar_headshot_url || room.player2?.avatar_headshot || room.player2?.avatar || room.player2?.avatar_url || null

  const player1 = {
    avatar: creatorAvatarUrl,
    items: (room.creator_items || room.player1?.items || []).map(normalizeCoinflipPreviewItem),
    side: String(room.creator_side || room.player1?.side || creatorSide).toLowerCase(),
  }

  const player2 = {
    avatar: opponentAvatarUrl,
    items: (room.opponent_items || room.player2?.items || []).map(normalizeCoinflipPreviewItem),
    side: String(room.opponent_side || room.player2?.side || opponentSide).toLowerCase(),
  }

  const combinedItems = [
    ...(player1.items || []),
    ...(player2.items || []),
  ].sort((left, right) => Number(right?.value || 0) - Number(left?.value || 0))
  const displayItems = combinedItems.slice(0, 4)
  const hiddenItemCount = Math.max(combinedItems.length - displayItems.length, 0)
  const canJoin = !room.opponent_uuid && !room.canceled
  const currentUserId = String(user?.profile_id || user?.id || '')
  const isCreator = Boolean(currentUserId && (currentUserId === String(room.creator_uuid || '')))
  const joinDisabled = !canJoin || isCreator
  const isCompleted = Boolean(room.opponent_uuid && room.result)
  const winner = isCompleted ? room.result || room.winner || null : null
  const isMm2Game = getCoinflipRoomGame(room) === 'mm2'
  const gameMode = String(room.game_mode || '').trim().toLowerCase()
  const gameModeIcon = gameMode === 'gems_only' || gameMode === 'titanics_only' ? '💎' : null
  const gameModeLabel = gameMode === 'gems_only' ? 'Gems Only' : gameMode === 'titanics_only' ? 'Titanic + Gems' : ''
  const [rowResultVisible, setRowResultVisible] = useState(false)

  useEffect(() => {
    setRowResultVisible(false)
  }, [isCompleted, room.id, room.result])

  const creatorWon = rowResultVisible && (room.winner_uuid
    ? String(room.winner_uuid) === String(room.creator_uuid)
    : winner === player1.side)
  const opponentWon = rowResultVisible && (room.winner_uuid
    ? String(room.winner_uuid) === String(room.opponent_uuid)
    : winner === player2.side)
  const openCreatorProfile = () => {
    const player = {
      id: room.creator_uuid,
      profile_id: room.creator_uuid,
      username: room.creator_username,
      avatar: player1.avatar,
      avatar_url: player1.avatar,
      avatar_headshot_url: player1.avatar,
    }
    void preloadMiniProfile(player).then((loadedProfile) => {
      onProfileOpen?.({ ...player, ...(loadedProfile || {}) })
    })
  }
  const openOpponentProfile = () => {
    if (!room.opponent_uuid) return
    const player = {
      id: room.opponent_uuid,
      profile_id: room.opponent_uuid,
      username: room.opponent_username,
      avatar: player2.avatar,
      avatar_url: player2.avatar,
      avatar_headshot_url: player2.avatar,
    }
    void preloadMiniProfile(player).then((loadedProfile) => {
      onProfileOpen?.({ ...player, ...(loadedProfile || {}) })
    })
  }

  return (
    <div
      className="coinflip-room-row game-preview-card"
      style={
        room.isExiting
          ? {
              animation: `coinflip-resolved-out ${ROOM_EXIT_ANIMATION_MS}ms cubic-bezier(.22, 1, .36, 1) forwards`,
              pointerEvents: 'none',
              willChange: 'transform, opacity, filter',
            }
          : room.isNew ? { animation: 'coinflip-slide-in .45s ease' } : undefined
      }
    >
      {/* Player VS Display */}
      <div className="game-preview-players">
        <div className={`game-preview-player${rowResultVisible && !creatorWon ? ' game-preview-player--loser' : ''}`}>
          <button
            type="button"
            aria-label={`Open ${room.creator_username || 'creator'} profile`}
            onClick={openCreatorProfile}
            className={`coinflip-row-avatar coinflip-row-avatar--${player1.side === 'tails' ? 'tails' : 'heads'} ${creatorWon ? 'coinflip-row-avatar--winner' : ''} ${rowResultVisible && !creatorWon ? 'coinflip-row-avatar--loser' : ''}`}
          >
            <img
              src={player1.avatar || DEFAULT_AVATAR}
              alt={room.creator_username || 'Creator'}
              className="coinflip-row-avatar-image"
              loading="lazy"
              draggable={false}
              referrerPolicy="no-referrer"
              onError={(event) => {
                event.currentTarget.src = DEFAULT_AVATAR
              }}
            />
          </button>
          <img className="game-preview-side-coin" alt="" src={player1.side === 'tails' ? '/tails.webp' : '/heads.webp'} draggable={false} />
        </div>

        <p className="game-preview-versus">VS</p>

        <div className={`game-preview-player${rowResultVisible && !opponentWon ? ' game-preview-player--loser' : ''}`}>
          <button
            type="button"
            aria-label={room.opponent_uuid ? `Open ${room.opponent_username || 'opponent'} profile` : 'Waiting for opponent'}
            onClick={openOpponentProfile}
            disabled={!room.opponent_uuid}
            className={`coinflip-row-avatar coinflip-row-avatar--${player2.side === 'tails' ? 'tails' : 'heads'} ${opponentWon ? 'coinflip-row-avatar--winner' : ''} ${rowResultVisible && !opponentWon ? 'coinflip-row-avatar--loser' : ''}`}
          >
            {player2.avatar ? (
              <img
                src={player2.avatar}
                alt={room.opponent_username || 'Opponent'}
                className="coinflip-row-avatar-image"
                loading="lazy"
                draggable={false}
                referrerPolicy="no-referrer"
                onError={(event) => {
                  event.currentTarget.src = DEFAULT_AVATAR
                }}
              />
            ) : (
              <span className="game-preview-waiting" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 384 512" fill="currentColor">
                  <path d="M202.021 0C122.202 0 70.503 32.703 29.914 91.026c-7.363 10.58-5.093 25.086 5.178 32.874l43.138 32.709c10.373 7.865 25.132 6.026 33.253-4.148 25.049-31.381 43.63-49.449 82.757-49.449 30.764 0 68.816 19.799 68.816 49.631 0 22.552-18.617 34.134-48.993 51.164-35.423 19.86-82.299 44.576-82.299 106.405V320c0 13.255 10.745 24 24 24h72.471c13.255 0 24-10.745 24-24v-5.773c0-42.86 125.268-44.645 125.268-160.627C377.504 66.256 286.902 0 202.021 0zM192 373.459c-38.196 0-69.271 31.075-69.271 69.271 0 38.195 31.075 69.27 69.271 69.27s69.271-31.075 69.271-69.271-31.075-69.27-69.271-69.27z" />
                </svg>
              </span>
            )}
          </button>
          <img className="game-preview-side-coin" alt="" src={player2.side === 'tails' ? '/tails.webp' : '/heads.webp'} draggable={false} />
        </div>
      </div>

      {/* Items Display */}
      <div className="game-preview-items">
        {displayItems.map((item, idx) => {
          const isLastVisibleItem = idx === displayItems.length - 1 && hiddenItemCount > 0

          return (
            <div
              key={item.id || `items-${idx}`}
              className="game-preview-item group"
              aria-label={item.name}
            >
              <span
                role="tooltip"
                className="game-preview-tooltip"
              >
                {item.name}
              </span>
              <img
                src={item.image}
                alt=""
                className={`game-preview-item-image${isMm2Game ? ' game-preview-item-image--mm2' : ''}${isCoinflipGemItem(item) ? ' game-preview-item-image--gem' : ''}`}
              />
              {!isLastVisibleItem && <AdoptMeTraitBadges item={item} />}

              {isLastVisibleItem && (
                <div className="game-preview-more">
                  +{hiddenItemCount}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Winner Indicator */}
      <div className="game-preview-result">
        {isCompleted ? (
          <CoinflipRowResult
            room={room}
            side={winner}
            onReveal={() => setRowResultVisible(true)}
          />
        ) : gameModeIcon ? (
          <div className="game-preview-mode" role="img" aria-label={`${gameModeLabel} game mode`} title={gameModeLabel}>
            <span aria-hidden="true">{gameModeIcon}</span>
          </div>
        ) : null}
      </div>

      {/* Value Display */}
      <div className="game-preview-value">
        <p className="game-preview-value-total">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.926 23.998 0 18.892 5.075.002 24 5.108ZM15.348 10.09l-5.282-1.453-1.414 5.273 5.282 1.453z" /></svg>
          <span>{room.value ?? room.total_value ?? ''}</span>
        </p>
        <p className="game-preview-range">({room.range ?? room.value_range ?? ''})</p>
      </div>

      {/* Action Buttons */}
      <div className="game-preview-actions">
        {canJoin && (
          <button
            className="game-preview-join"
            type="button"
            onClick={() => { if (!joinDisabled && typeof onJoin === 'function') onJoin() }}
            disabled={joinDisabled}
          >
            Join
          </button>
        )}
        <button
          type="button"
          onClick={onView}
          className="game-preview-view"
          aria-label="View game"
        >
          <svg viewBox="0 0 576 512" aria-hidden="true"><path fill="currentColor" d="M572.52 241.4C518.29 135.59 410.93 64 288 64S57.68 135.64 3.48 241.41a32.35 32.35 0 0 0 0 29.19C57.71 376.41 165.07 448 288 448s230.32-71.64 284.52-177.41a32.35 32.35 0 0 0 0-29.19zM288 400a144 144 0 1 1 144-144 143.93 143.93 0 0 1-144 144zm0-240a95.31 95.31 0 0 0-25.31 3.79 47.85 47.85 0 0 1-66.9 66.9A95.78 95.78 0 1 0 288 160z" /></svg>
        </button>
      </div>
    </div>
  )
}
