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
import { getInventoryItemCardStyle } from '../components/InventoryItemCard'
import MiniProfileModal, { preloadMiniProfile } from '../components/MiniProfileModal'
import TipUserModal from '../components/TipUserModal'
import CoinTipModal from '../components/CoinTipModal'
import { notifications } from '../components/Notifications'
import { formatPriceValue, parsePriceValue } from '../Utils/FormatPriceValues'

const DEFAULT_AVATAR = 'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-7E27815C7C5F72DA623094CFB3768D15-Png/420/420/AvatarHeadshot/Png/noFilter'
const RESOLVED_ROOM_LIFETIME_MS = 40_000
const ROOM_EXIT_ANIMATION_MS = 500
const ROW_RESULT_COUNTDOWN_MS = 5_000
const ROW_RESULT_REVEAL_LEAD_MS = 500
const RECENT_RESULT_LIMIT = 100
const CREATOR_VIEW_OPEN_DELAY_MS = 140

function getRowResultRemainingMs(room) {
  if (room?._skipResultCountdown && room?.result) return 0
  const resolvedAt = new Date(room?.resolved_at || '').getTime()
  if (!Number.isFinite(resolvedAt)) return room?.result ? 0 : ROW_RESULT_COUNTDOWN_MS
  const elapsed = Math.max(0, Date.now() - resolvedAt)
  return Math.min(ROW_RESULT_COUNTDOWN_MS, Math.max(0, ROW_RESULT_COUNTDOWN_MS - elapsed))
}

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

function getCoinflipRoomGame(room) {
  const item = [...(room?.creator_items || []), ...(room?.opponent_items || [])][0]
  const type = String(item?.type || item?.game || item?.item_type || room?.item_type || '').toLowerCase()
  if (type.includes('murder') || type.includes('mm2')) return 'mm2'
  if (type.includes('adopt') || type === 'adm') return 'adm'
  return 'ps99'
}

export default function Coinflip() {
  const user = useAuth((state) => state.user)
  const balance = useAuth((state) => state.balance)
  const setBalance = useAuth((state) => state.setBalance)
  const walletSelection = useAuth((state) => state.walletSelection)
  const setAuthModalOpen = useAuth((state) => state.setAuthModalOpen)
  const [sortBy, setSortBy] = useState('Highest to Lowest')
  const [gameMode, setGameMode] = useState('ps99')
  const [createOpen, setCreateOpen] = useState(false)
  const [joinRoom, setJoinRoom] = useState(null)
  const [viewRoom, setViewRoom] = useState(null)
  const [recentOpen, setRecentOpen] = useState(false)
  const [selectedProfile, setSelectedProfile] = useState(null)
  const [tipRecipient, setTipRecipient] = useState(null)
  const [isUserTipSubmitting, setIsUserTipSubmitting] = useState(false)
  const [userCoinTipAmount, setUserCoinTipAmount] = useState('')
  const [showUserCoinTipInChat, setShowUserCoinTipInChat] = useState(false)
  const [rooms, setRooms] = useState([])
  const [recentResults, setRecentResults] = useState([])
  const [recentPlayerResults, setRecentPlayerResults] = useState([])
  const socketRef = useRef(null)
  const viewOpenTimerRef = useRef(null)
  const handledResolvedRoomIdsRef = useRef(new Set())
  const dismissedViewRoomIdsRef = useRef(new Set())

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
  }, [rooms])

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
    setRecentResults((current) => mergeRecentCoinflipResults(current, [normalized]))
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
  }, [applyRoomUpdate])

  useEffect(() => {
    let isMounted = true
    const activeProfileId = String(user?.profile_id || user?.id || '').trim()

    const loadRecentResults = async () => {
      const { data, error } = await supabase
        .from('coinflip_games')
        .select('id,creator_uuid,creator_username,creator_avatar_url,creator_side,creator_items,opponent_uuid,opponent_username,opponent_avatar_url,opponent_side,opponent_items,created_at,result,winner_uuid,winner_username,resolved_at,canceled,game_mode')
        .eq('canceled', false)
        .not('result', 'is', null)
        .order('resolved_at', { ascending: false })
        .limit(RECENT_RESULT_LIMIT)

      if (!isMounted) return
      if (error) {
        console.warn('[coinflip] failed to load recent results', error)
        return
      }

      setRecentResults((current) => mergeRecentCoinflipResults(current, Array.isArray(data) ? data : []))

      if (!activeProfileId) {
        setRecentPlayerResults([])
        return
      }

      const { data: playerData, error: playerError } = await supabase
        .from('coinflip_games')
        .select('id,creator_uuid,creator_username,creator_avatar_url,creator_side,creator_items,opponent_uuid,opponent_username,opponent_avatar_url,opponent_side,opponent_items,created_at,result,winner_uuid,winner_username,resolved_at,canceled,game_mode')
        .eq('canceled', false)
        .not('result', 'is', null)
        .or(`creator_uuid.eq.${activeProfileId},opponent_uuid.eq.${activeProfileId}`)
        .order('resolved_at', { ascending: false })
        .limit(RECENT_RESULT_LIMIT)

      if (!isMounted) return
      if (playerError) {
        console.warn('[coinflip] failed to load player flip history', playerError)
        return
      }
      setRecentPlayerResults(mergeRecentCoinflipResults([], Array.isArray(playerData) ? playerData : []))
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
  }, [applyRoomUpdate, user?.id, user?.profile_id])

  // Derived stats for the stat cards
  const activeRoomsCount = rooms.filter((r) => !r.canceled && !r.result).length
  const totalValueSum = rooms.reduce((sum, r) => sum + Number(r.total_value ?? r.numericValue ?? 0), 0)
  const totalItemsCount = rooms.reduce((sum, r) => sum + (Array.isArray(r.creator_items) ? r.creator_items.length : 0) + (Array.isArray(r.opponent_items) ? r.opponent_items.length : 0), 0)

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('coinflip:nav-value', { detail: { value: totalValueSum } }))
  }, [totalValueSum])
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
      }
    }

    void loadRooms()
    return () => { isMounted = false }
  }, [])

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
    <div className="reference-coinflip flex-1 overflow-x-hidden overflow-y-auto bg-transparent">
      <style>{`
        @keyframes coinflip-slide-in { from { transform: translateY(-8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
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
        @keyframes coinflip-row-countdown {
          from { stroke-dashoffset: var(--coinflip-countdown-start, 0); }
          to { stroke-dashoffset: 100; }
        }
        @keyframes coinflip-row-winner-in {
          from { opacity: 0; transform: scale(0); }
          to { opacity: 1; transform: scale(1); }
        }
        .coinflip-row-countdown-stroke {
          animation: coinflip-row-countdown var(--coinflip-countdown-duration, 5000ms) forwards linear;
        }
        .coinflip-row-winner-coin {
          animation: coinflip-row-winner-in 150ms forwards;
        }
        .coinflip-row-avatar {
          box-shadow: 0 0 0 0 rgba(255, 79, 163, 0);
          transition:
            border-color 560ms cubic-bezier(.22, 1, .36, 1),
            box-shadow 560ms cubic-bezier(.22, 1, .36, 1),
            filter 560ms cubic-bezier(.22, 1, .36, 1);
          will-change: border-color, box-shadow, filter;
        }
        .coinflip-row-avatar--winner {
          border-color: #ff4fa3;
          box-shadow: 0 0 0 1px rgba(255, 79, 163, .18), 0 0 12px rgba(255, 79, 163, .14);
        }
        .coinflip-row-avatar--loser {
          filter: brightness(.7);
        }
        .coinflip-row-battle-icon {
          color: #6c7399;
          transition: color .2s ease;
        }
        .coinflip-room-row:hover .coinflip-row-battle-icon { color: #ff4fa3; }
        .coinflip-top-counter { height: 40px; border-radius: 8px; }
        .coinflip-sort-trigger { height: 48px; border-radius: 8px; }
        @media (max-width: 640px) {
          .coinflip-top-counter { height: 40px; }
          .coinflip-sort-trigger { height: 48px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .coinflip-row-avatar {
            transition-duration: 0ms;
          }
        }
      `}</style>
      <div className="relative z-10 flex w-full flex-col px-4 pb-32 pt-3">
        {/* Stats Cards */}
        <div className="grid gap-2 md:grid-cols-3">
          <StatCard
            icon="/assets/items-icon.png"
            value={String(totalItemsCount)}
            label="Total Items"
            showIcon={false}
          />
          <StatCard
            icon="/currency.svg"
            value={String(totalValueSum.toLocaleString('en-US'))}
            label="Total Value"
          />
          <StatCard
            icon="/assets/room-icon.png"
            value={String(activeRoomsCount)}
            label="Active Games"
            showIcon={false}
          />
        </div>

        {/* Game controls */}
        <div className="mb-3 mt-4 flex flex-col justify-between gap-2 sm:flex-row">
          <div className="flex items-center justify-start gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[#ff4fa3] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-[#ff4fa3]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff4fa3] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              Create
            </button>
            <button type="button" onClick={() => setRecentOpen(true)} className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[hsl(233_16%_22%)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[hsl(233_16%_26%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50">
              History
            </button>
          </div>
          <div role="tablist" aria-label="CoinFlip game" className="grid h-10 w-full grid-cols-3 items-center justify-center rounded-md bg-[hsl(229_17%_13%)] p-1 sm:w-auto">
            {[
              ['mm2', 'MM2'],
              ['adm', 'ADM'],
              ['ps99', 'PS99'],
            ].map(([value, label]) => {
              const active = gameMode === value
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setGameMode(value)}
                  className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-5 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff4fa3] focus-visible:ring-offset-2 ${active ? 'bg-[#ff4fa3] font-semibold text-black shadow-sm' : 'text-white/60 hover:text-white'}`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Room Cards */}
        <div className="flex flex-col gap-2">
          {rooms.length > 0 &&
            rooms
              .slice()
              .filter((room) => getCoinflipRoomGame(room) === gameMode)
              .sort((a, b) => {
                const aVal = Number(a.numericValue ?? 0)
                const bVal = Number(b.numericValue ?? 0)
                if (sortBy === 'Highest to Lowest') return bVal - aVal
                if (sortBy === 'Lowest to Highest') return aVal - bVal
                if (sortBy === 'Alphabetical') return String(a.creator_username || '').localeCompare(String(b.creator_username || ''))
                return 0
              })
              .map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  onJoin={() => setJoinRoom(room)}
                  onView={() => openViewRoom(room)}
                  onProfileOpen={setSelectedProfile}
                />
              ))
          }
        </div>
      </div>
      {createOpen && <CoinflipCreateModal onClose={() => setCreateOpen(false)} onCreate={(room) => {
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
      }} />}
      {joinRoom && (
        <CoinflipJoinModal
          room={joinRoom}
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
      <RecentCoinflipsModal
        isOpen={recentOpen}
        games={recentPlayerResults}
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
      />
      {viewRoom && (
        <CoinflipViewModal
          room={viewRoom}
          onClose={() => closeViewRoom(viewRoom)}
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
        onClose={() => setSelectedProfile(null)}
        onTip={openTipModal}
      />
      <TipUserModal
        isOpen={Boolean(tipRecipient) && walletSelection === 'items'}
        recipient={tipRecipient}
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

function StatCard({ icon, value, label, showIcon = true }) {
  return (
    <div className="flex min-h-[64px] items-center justify-start gap-3 rounded-lg border border-[hsl(231_16%_16%)] bg-[hsl(230_16%_14%)] px-4 py-2">
      <div className="flex w-full flex-col items-start justify-center text-left">
        <span className="flex items-center justify-start gap-2 text-left text-xl font-bold leading-tight text-white">
          {showIcon && icon && <img src={icon} alt="" className="h-5 w-5" />}
          {value}
        </span>
        <span className="text-left text-base font-semibold leading-tight text-white opacity-60">{label}</span>
      </div>
    </div>
  )
}

function CoinflipRowResult({ room, side, onReveal }) {
  const getRemainingMs = () => getRowResultRemainingMs(room)
  const [initialRemainingMs, setInitialRemainingMs] = useState(getRemainingMs)
  const [remainingSeconds, setRemainingSeconds] = useState(() => Math.max(1, Math.ceil(getRemainingMs() / 1000)))
  const [revealed, setRevealed] = useState(() => getRemainingMs() <= ROW_RESULT_REVEAL_LEAD_MS)

  useEffect(() => {
    const remainingMs = getRemainingMs()
    setInitialRemainingMs(remainingMs)
    const revealDelayMs = Math.max(0, remainingMs - ROW_RESULT_REVEAL_LEAD_MS)

    if (revealDelayMs <= 0) {
      setRevealed(true)
      onReveal?.()
      return undefined
    }

    const deadline = performance.now() + remainingMs
    setRevealed(false)
    setRemainingSeconds(Math.max(1, Math.ceil(remainingMs / 1000)))
    const interval = window.setInterval(() => {
      const seconds = Math.ceil((deadline - performance.now()) / 1000)
      setRemainingSeconds(Math.min(5, Math.max(1, seconds)))
    }, 100)
    const timeout = window.setTimeout(() => {
      window.clearInterval(interval)
      setRevealed(true)
      onReveal?.()
    }, revealDelayMs)

    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
  }, [room?.id, room?.resolved_at, room?.result])

  if (revealed) {
    return (
      <svg
        className="h-full w-full"
        viewBox="-50 -50 100 100"
        fill="none"
        role="img"
        aria-label={`${side} won the coinflip`}
      >
        <circle
          r="49"
          fill="#171925"
          strokeWidth="2"
          stroke="#ff4fa3"
          pathLength="100"
          strokeDasharray="100"
          transform="rotate(-90)"
        />
        <image
          x="-50"
          y="-50"
          width="100"
          height="100"
          href={side === 'heads' ? '/heads.png' : '/tails.png'}
          className="coinflip-row-winner-coin"
        />
      </svg>
    )
  }

  const elapsedPercent = 100 - ((initialRemainingMs / ROW_RESULT_COUNTDOWN_MS) * 100)
  const countdownAnimationMs = Math.max(1, initialRemainingMs - ROW_RESULT_REVEAL_LEAD_MS)
  return (
    <div className="relative h-16 w-16" role="timer" aria-label={`${remainingSeconds} seconds until result`}>
      <svg viewBox="-50 -50 100 100" fill="none" className="h-full w-full" aria-hidden="true">
        <circle
          r="49"
          fill="#171925"
          strokeWidth="2"
          stroke="#ff4fa3"
          pathLength="100"
          strokeDasharray="100"
          transform="rotate(-90)"
          className="coinflip-row-countdown-stroke"
          style={{
            '--coinflip-countdown-start': elapsedPercent,
            '--coinflip-countdown-duration': `${countdownAnimationMs}ms`,
          }}
        />
        <text
          fontSize="32"
          fontWeight="bold"
          fill="white"
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ fontFamily: 'Poppins' }}
        >
          {remainingSeconds}
        </text>
      </svg>
    </div>
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
  const displayItems = combinedItems.slice(0, 5)
  const hiddenItemCount = Math.max(combinedItems.length - displayItems.length, 0)
  const canJoin = !room.opponent_uuid && !room.canceled
  const currentUserId = String(user?.profile_id || user?.id || '')
  const isCreator = Boolean(currentUserId && (currentUserId === String(room.creator_uuid || '')))
  const joinDisabled = !canJoin || isCreator
  const isCompleted = Boolean(room.opponent_uuid && room.result)
  const winner = isCompleted ? room.result || room.winner || null : null
  const gameMode = String(room.game_mode || '').trim().toLowerCase()
  const gameModeIcon = gameMode === 'gems_only' || gameMode === 'titanics_only' ? '💎' : null
  const gameModeLabel = gameMode === 'gems_only' ? 'Gems Only' : gameMode === 'titanics_only' ? 'Titanic + Gems' : ''
  const [rowResultVisible, setRowResultVisible] = useState(
    () => isCompleted && getRowResultRemainingMs(room) <= ROW_RESULT_REVEAL_LEAD_MS,
  )

  useEffect(() => {
    setRowResultVisible(Boolean(
      isCompleted && getRowResultRemainingMs(room) <= ROW_RESULT_REVEAL_LEAD_MS
    ))
  }, [isCompleted, room.id, room.resolved_at, room.result])

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
      className="coinflip-room-row relative grid grid-cols-1 items-center gap-4 overflow-visible rounded-lg border border-solid border-[hsl(231_16%_16%)] bg-[hsl(230_16%_14%)] px-4 py-4 md:grid-cols-[auto_minmax(0,1fr)_3.75rem_9rem_auto] md:gap-2 md:py-2 [&>*]:min-w-0"
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
      <div className="flex items-center gap-4 justify-self-center md:justify-self-start">
        <button
          type="button"
          aria-label={`Open ${room.creator_username || 'creator'} profile`}
          onClick={openCreatorProfile}
          className={`coinflip-row-avatar relative box-border h-14 w-14 flex-[0_0_auto] cursor-pointer rounded-full border-2 border-[hsl(231_16%_16%)] bg-[hsl(228_17%_12%)] p-0 transition hover:border-[#ff4fa3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff4fa3] ${creatorWon ? 'coinflip-row-avatar--winner' : ''} ${rowResultVisible && !creatorWon ? 'coinflip-row-avatar--loser' : ''}`}
        >
          <img
            src={player1.avatar || DEFAULT_AVATAR}
            alt={room.creator_username || 'Creator'}
            className="w-full h-full object-cover rounded-full"
            loading="lazy"
            draggable={false}
            referrerPolicy="no-referrer"
            onError={(event) => {
              event.currentTarget.src = DEFAULT_AVATAR
            }}
          />
          <div className="hidden">
            <img className="block w-full h-full object-contain" alt={player1.side || 'coin'} src={player1.side === 'tails' ? '/tails.png' : '/heads.png'} />
          </div>
        </button>
        <img
          className="h-14 w-14 shrink-0 rounded-full object-contain"
          alt={`${player1.side || 'coin'} image`}
          src={player1.side === 'tails' ? '/tails.png' : '/heads.png'}
        />
        <button
          type="button"
          aria-label={room.opponent_uuid ? `Open ${room.opponent_username || 'opponent'} profile` : 'Waiting for opponent'}
          onClick={openOpponentProfile}
          disabled={!room.opponent_uuid}
          className={`coinflip-row-avatar relative box-border h-14 w-14 flex-[0_0_auto] rounded-full border-2 border-[hsl(231_16%_16%)] bg-[hsl(228_17%_12%)] p-0 transition hover:border-[#ff4fa3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff4fa3] ${room.opponent_uuid ? 'cursor-pointer' : 'hidden cursor-default'} ${opponentWon ? 'coinflip-row-avatar--winner' : ''} ${rowResultVisible && !opponentWon ? 'coinflip-row-avatar--loser' : ''}`}
        >
          {player2.avatar ? (
            <img
              src={player2.avatar}
              alt={room.opponent_username || 'Opponent'}
              className="box-border block w-full h-full object-cover rounded-full"
              loading="lazy"
              draggable={false}
              referrerPolicy="no-referrer"
              onError={(event) => {
                event.currentTarget.src = DEFAULT_AVATAR
              }}
            />
          ) : (
            <div className="box-border flex h-full w-full items-center justify-center rounded-full bg-[#171925]">
              <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden="true">
                <circle cx="32" cy="32" r="32" fill="#1c1f2e" />
                <circle cx="22" cy="32" r="4" fill="#ff4fa3">
                  <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" begin="0s" />
                </circle>
                <circle cx="32" cy="32" r="4" fill="#ff4fa3">
                  <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" begin="0.4s" />
                </circle>
                <circle cx="42" cy="32" r="4" fill="#ff4fa3">
                  <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" begin="0.8s" />
                </circle>
              </svg>
            </div>
          )}
          <div className="hidden">
            <img className="block w-full h-full object-contain" alt={player2.side || 'coin'} src={player2.side === 'tails' ? '/tails.png' : '/heads.png'} />
          </div>
        </button>
      </div>

      {/* Items Display */}
      <div className="flex w-52 justify-self-center -space-x-4 overflow-hidden md:justify-self-start">
        {displayItems.map((item, idx) => {
          const isLastVisibleItem = idx === displayItems.length - 1 && hiddenItemCount > 0

          return (
            <div
              key={item.id || `items-${idx}`}
              className="group relative box-border block h-16 w-16 flex-[0_0_auto] cursor-pointer overflow-visible rounded-full border-2 border-solid border-[hsl(231_16%_16%)] bg-[hsl(228_17%_12%)] transition-colors duration-200 hover:border-[#ff4fa3]"
              aria-label={item.name}
              style={getInventoryItemCardStyle(item)}
            >
              <span
                role="tooltip"
                className="pointer-events-none absolute bottom-[calc(100%+7px)] left-1/2 z-40 max-w-44 -translate-x-1/2 overflow-hidden text-ellipsis whitespace-nowrap rounded bg-[#0f1119] px-2 py-1 text-[10px] font-semibold leading-tight text-[#e1e4f2] opacity-0 shadow-[0_4px_12px_rgba(0,0,0,.35)] transition-opacity duration-150 group-hover:opacity-100"
              >
                {item.name}
              </span>
              <img src={item.image} alt="" className="relative block h-full w-full rounded-full object-contain p-1" />

              {isLastVisibleItem && (
                <div
                  className="pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-full text-sm font-semibold text-white"
                  style={{ backdropFilter: 'blur(2px)', background: 'rgba(15, 18, 30, 0.82)' }}
                >
                  +{hiddenItemCount}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Value Display */}
      <div className="w-36 place-self-center text-center font-semibold">
        <p className="inline-flex items-center gap-2 text-base leading-normal text-white">
          <img src="/bobux.png" className="w-5 text-[#ff4fa3]" alt="bobux" />
          <span>{room.value ?? room.total_value ?? ''}</span>
        </p>
        <p className="text-base leading-normal text-white opacity-50">{room.range ?? room.value_range ?? ''}</p>
      </div>

      {/* Winner Indicator */}
      <div className="relative h-16 w-16 justify-self-center xl:h-16 xl:w-16">
        {isCompleted ? (
          <CoinflipRowResult
            room={room}
            side={winner}
            onReveal={() => setRowResultVisible(true)}
          />
        ) : gameModeIcon ? (
          <div
            className="relative h-full w-full"
            role="img"
            aria-label={`${gameModeLabel} game mode`}
            title={gameModeLabel}
          >
            <svg className="h-full w-full" viewBox="-50 -50 100 100" fill="none" aria-hidden="true">
              <circle
                r="49"
                fill="#171925"
                strokeWidth="2"
                stroke="#ff4fa3"
                pathLength="100"
                strokeDasharray="100"
                transform="rotate(-90)"
              />
            </svg>
            <span
              className="pointer-events-none absolute inset-0 flex items-center justify-center text-2xl leading-none"
              aria-hidden="true"
            >
              {gameModeIcon}
            </span>
          </div>
        ) : null}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center gap-2 justify-self-center md:ml-auto md:flex-col md:justify-self-end">
        {canJoin && (
          <button
            className="h-8 min-w-24 cursor-pointer rounded-md border-0 bg-[#ff4fa3] px-4 py-0 text-sm font-medium leading-8 text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
          className="h-8 min-w-24 cursor-pointer rounded-md border-0 bg-[hsl(233_16%_22%)] px-4 py-0 text-sm font-medium leading-8 text-white shadow-none hover:opacity-90"
        >
          View
        </button>
      </div>
    </div>
  )
}
