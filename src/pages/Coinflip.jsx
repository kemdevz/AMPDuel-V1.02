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
const RECENT_RESULT_LIMIT = 100
const CREATOR_VIEW_OPEN_DELAY_MS = 140
const COINFLIP_GAME_STORAGE_KEY = 'bloxdice:coinflip-game'
const COINFLIP_GAME_OPTIONS = [
  ['mm2', 'MM2'],
  ['adm', 'AMP'],
  ['ps99', 'PS99'],
]

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
  const [gameMode, setGameMode] = useState(() => {
    if (typeof window === 'undefined') return 'mm2'
    try {
      const savedGame = window.localStorage.getItem(COINFLIP_GAME_STORAGE_KEY)
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
  const [rooms, setRooms] = useState([])
  const [recentResults, setRecentResults] = useState([])
  const [recentPlayerResults, setRecentPlayerResults] = useState([])
  const socketRef = useRef(null)
  const viewOpenTimerRef = useRef(null)
  const handledResolvedRoomIdsRef = useRef(new Set())
  const dismissedViewRoomIdsRef = useRef(new Set())

  useEffect(() => {
    try {
      window.localStorage.setItem(COINFLIP_GAME_STORAGE_KEY, gameMode)
    } catch {
      // Browsers can disable storage; the selected game still works for this session.
    }
  }, [gameMode])

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
  const gameRooms = rooms.filter((room) => getCoinflipRoomGame(room) === gameMode)
  const activeRoomsCount = gameRooms.filter((room) => !room.canceled && !room.result).length
  const totalValueSum = gameRooms.reduce((sum, room) => sum + Number(room.total_value ?? room.numericValue ?? 0), 0)
  const totalItemsCount = gameRooms.reduce((sum, room) => sum + (Array.isArray(room.creator_items) ? room.creator_items.length : 0) + (Array.isArray(room.opponent_items) ? room.opponent_items.length : 0), 0)

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
    <div className="reference-coinflip flex-1 overflow-x-hidden bg-transparent">
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
        @keyframes coinflip-row-winner-in {
          from { opacity: 0; transform: scale(0); }
          to { opacity: 1; transform: scale(1); }
        }
        .coinflip-row-winner-coin {
          display: block;
          width: 68px;
          height: 68px;
          object-fit: contain;
          animation: coinflip-row-winner-in 150ms forwards;
        }
        .coinflip-row-avatar {
          position: relative;
          display: block;
          width: 50px;
          height: 50px;
          flex: 0 0 50px;
          padding: 0;
          overflow: hidden;
          border: 2px solid hsl(231 16% 16%);
          border-radius: 50%;
          background: #151820;
          cursor: pointer;
          box-shadow: 0 0 0 0 rgba(255, 79, 163, 0);
          transition:
            border-color 560ms cubic-bezier(.22, 1, .36, 1),
            box-shadow 560ms cubic-bezier(.22, 1, .36, 1),
            filter 560ms cubic-bezier(.22, 1, .36, 1);
          will-change: border-color, box-shadow, filter;
        }
        .coinflip-row-avatar:disabled { cursor: default; }
        .coinflip-row-avatar:not(:disabled):hover { border-color: #ff4fa3; }
        .coinflip-row-avatar:focus-visible { outline: 2px solid #ff4fa3; outline-offset: 2px; }
        .coinflip-row-avatar-image { display: block; width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
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
        .game-preview-shell { width: 100%; container-type: inline-size; }
        .coinflip-room-row {
          display: grid;
          min-height: 102px;
          box-sizing: border-box;
          grid-template-columns: auto minmax(190px, 1fr) 86px minmax(120px, 145px) auto;
          align-items: center;
          gap: clamp(10px, 1.25vw, 20px);
          padding: 10px 16px;
          overflow: visible;
          border: 1px solid rgba(255, 255, 255, .07);
          border-radius: 6px;
          background: #191c24;
          box-shadow: none;
          font-family: Poppins, sans-serif;
        }
        .game-preview-players {
          display: flex;
          min-width: 150px;
          align-items: center;
          justify-content: flex-start;
          gap: 11px;
        }
        .game-preview-player { position: relative; flex: 0 0 50px; width: 50px; height: 50px; }
        .game-preview-side-coin {
          position: absolute;
          right: -5px;
          bottom: -4px;
          z-index: 2;
          display: block;
          width: 22px;
          height: 22px;
          object-fit: contain;
          filter: drop-shadow(0 2px 3px rgba(0,0,0,.42));
          pointer-events: none;
        }
        .game-preview-versus { margin: 0; color: rgba(255,255,255,.36); font-size: 12px; font-weight: 700; }
        .game-preview-waiting {
          display: grid;
          width: 100%;
          height: 100%;
          place-items: center;
          border-radius: 50%;
          color: #777d8c;
          background: #151820;
          font-size: 20px;
          font-weight: 700;
        }
        .game-preview-items {
          display: flex;
          min-width: 0;
          align-items: center;
          gap: 7px;
          overflow: visible;
        }
        .game-preview-item {
          position: relative;
          display: block;
          width: 52px;
          height: 52px;
          flex: 0 0 52px;
          box-sizing: border-box;
          border: 1px solid rgba(255,255,255,.07);
          border-radius: 50%;
          background: #151820;
          cursor: pointer;
          transition: border-color .15s ease, transform .15s ease;
        }
        .game-preview-item:hover { z-index: 5; border-color: #ff4fa3; transform: translateY(-1px); }
        .game-preview-item-image { display: block; width: 100%; height: 100%; box-sizing: border-box; padding: 5px; border-radius: 50%; object-fit: contain; }
        .game-preview-tooltip {
          position: absolute;
          bottom: calc(100% + 7px);
          left: 50%;
          z-index: 40;
          max-width: 176px;
          padding: 4px 8px;
          overflow: hidden;
          border-radius: 4px;
          background: #0f1119;
          color: #e1e4f2;
          box-shadow: 0 4px 12px rgba(0,0,0,.35);
          font-size: 10px;
          font-weight: 600;
          line-height: 1.2;
          opacity: 0;
          transform: translateX(-50%);
          white-space: nowrap;
          text-overflow: ellipsis;
          pointer-events: none;
          transition: opacity .15s ease;
        }
        .game-preview-item:hover .game-preview-tooltip { opacity: 1; }
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
        .game-preview-result { display: flex; width: 86px; height: 76px; align-items: center; justify-content: center; overflow: visible; }
        .coinflip-row-result-video {
          display: block;
          width: 86px;
          height: 86px;
          object-fit: contain;
          mix-blend-mode: screen;
          transform: scale(1.32);
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
        .game-preview-value { min-width: 0; text-align: center; }
        .game-preview-value-total { display: flex; align-items: center; justify-content: center; gap: 7px; margin: 0; color: #f4f5f8; font-size: 16px; font-weight: 700; line-height: 1.35; }
        .game-preview-value-total svg { width: 17px; height: 17px; flex: 0 0 17px; }
        .game-preview-range { margin: 2px 0 0; color: rgba(255,255,255,.48); font-size: 11px; font-weight: 600; line-height: 1.35; white-space: nowrap; }
        .game-preview-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
        .game-preview-join,
        .game-preview-view {
          display: inline-flex;
          height: 36px;
          box-sizing: border-box;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 6px;
          box-shadow: none;
          font-family: Poppins, sans-serif;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity .15s ease, background-color .15s ease;
        }
        .game-preview-join { min-width: 72px; padding: 0 16px; background: #ff4fa3; color: #1a0711; }
        .game-preview-view { width: 38px; min-width: 38px; padding: 0; background: #2a2e3a; color: #fff; }
        .game-preview-view svg { width: 15px; height: 15px; }
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
          .game-preview-items { grid-area: items; overflow-x: auto; padding-bottom: 2px; }
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
        .coinflip-game-list { animation: coinflipGameListIn .22s cubic-bezier(.22,1,.36,1); }
        @media (prefers-reduced-motion: reduce) {
          .coinflip-game-list { animation: none; }
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
          <div role="tablist" aria-label="CoinFlip game" className="relative grid h-10 w-full isolate grid-cols-3 items-center justify-center overflow-hidden rounded-md bg-[hsl(229_17%_13%)] sm:w-auto">
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
              onClick={() => setCreateOpen(true)}
              className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[#ff4fa3] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-[#ff4fa3]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff4fa3] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              Create
            </button>
            <button type="button" onClick={() => setRecentOpen(true)} className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[hsl(233_16%_22%)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[hsl(233_16%_26%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50">
              History
            </button>
          </div>
        </div>

        {/* Room Cards */}
        <div key={gameMode} className="coinflip-game-list flex flex-col gap-2">
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
        <div className="game-preview-player">
          <button
            type="button"
            aria-label={`Open ${room.creator_username || 'creator'} profile`}
            onClick={openCreatorProfile}
            className={`coinflip-row-avatar ${creatorWon ? 'coinflip-row-avatar--winner' : ''} ${rowResultVisible && !creatorWon ? 'coinflip-row-avatar--loser' : ''}`}
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

        <div className="game-preview-player">
          <button
            type="button"
            aria-label={room.opponent_uuid ? `Open ${room.opponent_username || 'opponent'} profile` : 'Waiting for opponent'}
            onClick={openOpponentProfile}
            disabled={!room.opponent_uuid}
            className={`coinflip-row-avatar ${opponentWon ? 'coinflip-row-avatar--winner' : ''} ${rowResultVisible && !opponentWon ? 'coinflip-row-avatar--loser' : ''}`}
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
              <span className="game-preview-waiting" aria-hidden="true">?</span>
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
              style={getInventoryItemCardStyle(item)}
            >
              <span
                role="tooltip"
                className="game-preview-tooltip"
              >
                {item.name}
              </span>
              <img src={item.image} alt="" className="game-preview-item-image" />

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
