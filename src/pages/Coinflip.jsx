import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Settings, ChevronDown } from 'lucide-react'
import { connectSocket } from '../lib/socket'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../store/auth'
import CoinflipCreateModal from '../components/CoinflipCreateModal'
import CoinflipJoinModal from '../components/CoinflipJoinModal'
import CoinflipViewModal from '../components/CoinflipViewModal'
import { getInventoryItemCardStyle } from '../components/InventoryItemCard'
import MiniProfileModal from '../components/MiniProfileModal'

const DEFAULT_AVATAR = 'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-7E27815C7C5F72DA623094CFB3768D15-Png/420/420/AvatarHeadshot/Png/noFilter'
const RESOLVED_ROOM_LIFETIME_MS = 60_000
const ROOM_EXIT_ANIMATION_MS = 500
const ROW_RESULT_COUNTDOWN_MS = 5_000
const RECENT_RESULT_LIMIT = 100

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
  const numericValue = Number(value ?? 0)
  if (!Number.isFinite(numericValue)) return '0'

  if (numericValue >= 1_000_000) {
    return `${(numericValue / 1_000_000).toFixed(2).replace(/\.0+$/, '').replace(/(\.\d)0+$/, '$1')}M`
  }

  if (numericValue >= 1_000) {
    return `${(numericValue / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  }

  return numericValue.toLocaleString('en-US')
}

function parseCoinflipValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value

  const raw = String(value ?? '').trim().toUpperCase()
  if (!raw) return 0

  const cleaned = raw.replace(/,/g, '')
  const number = Number(cleaned.replace(/[MK]/g, ''))
  if (!Number.isFinite(number)) return 0

  if (cleaned.includes('M')) return number * 1_000_000
  if (cleaned.includes('K')) return number * 1_000
  return number
}

function getRoomValueDetails(room) {
  const itemValue = Array.isArray(room?.creator_items)
    ? room.creator_items.reduce((sum, item) => sum + Number(item?.value ?? 0), 0)
    : 0

  const fallbackValue = parseCoinflipValue(room?.value ?? room?.total_value ?? room?.totalValue ?? room?.numericValue ?? 0)
  const numericValue = fallbackValue > 0 ? fallbackValue : itemValue
  const range = room?.range || room?.value_range || `${formatCoinflipValue(numericValue * 0.9)} - ${formatCoinflipValue(numericValue * 1.1)}`

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

export default function Coinflip() {
  const [sortBy, setSortBy] = useState('Highest to Lowest')
  const [createOpen, setCreateOpen] = useState(false)
  const [joinRoom, setJoinRoom] = useState(null)
  const [viewRoom, setViewRoom] = useState(null)
  const [selectedProfile, setSelectedProfile] = useState(null)
  const [rooms, setRooms] = useState([])
  const [recentResults, setRecentResults] = useState([])
  const socketRef = useRef(null)

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

    const handleUpdated = (room) => {
      if (!room) return
      const normalized = normalizeRoom(room)
      const activeUser = useAuth.getState().user
      const activeProfileId = String(activeUser?.profile_id || activeUser?.id || '')
      const isParticipant = Boolean(
        activeProfileId && (
          activeProfileId === String(normalized.creator_uuid || '') ||
          activeProfileId === String(normalized.opponent_uuid || '')
        ),
      )
      if (normalized.result && activeProfileId === String(normalized.winner_uuid || '')) {
        window.dispatchEvent(new CustomEvent('wallet:updated'))
      }
      setRecentResults((current) => mergeRecentCoinflipResults(current, [normalized]))
      setRooms((prev) => normalized.canceled
        ? prev.filter((existing) => existing.id !== normalized.id)
        : prev.map((existing) => (existing.id === normalized.id ? { ...existing, ...normalized } : existing)))
      setViewRoom((current) => {
        if (normalized.canceled && current?.id === normalized.id) return null
        if (normalized.result && isParticipant) return normalized
        return current?.id === normalized.id ? { ...current, ...normalized } : current
      })
    }

    socket.on('coinflip:created', handleCreated)
    socket.on('coinflip:updated', handleUpdated)

    return () => {
      socket.off('coinflip:created', handleCreated)
      socket.off('coinflip:updated', handleUpdated)
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadRecentResults = async () => {
      const { data, error } = await supabase
        .from('coinflip_games')
        .select('id,result,resolved_at,created_at,canceled')
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
    }

    void loadRecentResults()

    const channel = supabase
      .channel('coinflip-recent-results')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coinflip_games' }, (payload) => {
        const game = payload.new || payload.old
        if (!game) return
        setRecentResults((current) => mergeRecentCoinflipResults(current, [game]))
      })
      .subscribe()

    return () => {
      isMounted = false
      supabase.removeChannel(channel)
    }
  }, [])

  // Derived stats for the stat cards
  const activeRoomsCount = rooms.filter((r) => !r.canceled && !r.result).length
  const totalValueSum = rooms.reduce((sum, r) => sum + Number(r.total_value ?? r.numericValue ?? 0), 0)
  const totalItemsCount = rooms.reduce((sum, r) => sum + (Array.isArray(r.creator_items) ? r.creator_items.length : 0) + (Array.isArray(r.opponent_items) ? r.opponent_items.length : 0), 0)
  const recentHeadsWins = recentResults.filter((game) => game.result === 'heads').length
  const recentTailsWins = recentResults.filter((game) => game.result === 'tails').length
  const recentResultBalance = recentHeadsWins - recentTailsWins
  const recentHeadsCount = Math.min(100, Math.max(0, 50 + recentResultBalance))
  const recentTailsCount = 100 - recentHeadsCount

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

        const normalized = Array.isArray(data) ? data.map(normalizeRoom).filter(Boolean) : []
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

  return (
    <div className="flex-1 overflow-x-hidden overflow-y-auto bg-transparent">
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
        .coinflip-row-countdown-stroke {
          animation: coinflip-row-countdown var(--coinflip-countdown-duration, 5000ms) forwards linear;
        }
        .coinflip-row-avatar {
          box-shadow: 0 0 0 0 rgba(108, 99, 255, 0);
          transition:
            border-color 560ms cubic-bezier(.22, 1, .36, 1),
            box-shadow 560ms cubic-bezier(.22, 1, .36, 1),
            filter 560ms cubic-bezier(.22, 1, .36, 1);
          will-change: border-color, box-shadow, filter;
        }
        .coinflip-row-avatar--winner {
          border-color: #6c63ff;
          box-shadow: 0 0 0 1px rgba(108, 99, 255, .18), 0 0 12px rgba(108, 99, 255, .14);
        }
        .coinflip-row-avatar--loser {
          filter: brightness(.7);
        }
        @media (prefers-reduced-motion: reduce) {
          .coinflip-row-avatar {
            transition-duration: 0ms;
          }
        }
      `}</style>
      <div className="relative z-10 p-4">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 mb-4">
          <StatCard
            icon="/assets/room-icon.png"
            value={String(activeRoomsCount)}
            label="Active Rooms"
            gradient="rgba(108, 99, 255, 0.22)"
            bgColor="rgba(108, 99, 255, 0.04)"
            showIcon={false}
          />
          <StatCard
            icon="/bobux.png"
            value={String(totalValueSum.toLocaleString('en-US'))}
            label="Total Value"
            gradient="rgba(255, 216, 77, 0.22)"
            bgColor="rgba(255, 216, 77, 0.04)"
          />
          <StatCard
            icon="/assets/items-icon.png"
            value={String(totalItemsCount)}
            label="Total Items"
            gradient="rgba(108, 99, 255, 0.22)"
            bgColor="rgba(108, 99, 255, 0.04)"
            showIcon={false}
          />
        </div>

        {/* Mobile Controls */}
        <div className="flex flex-col gap-2 sm:hidden mb-4">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="h-9 px-5 text-sm font-semibold rounded-md border border-[#5E55D9]/40 bg-[linear-gradient(135deg,#6C63FF_0%,#5147D9_100%)] text-white shadow-[0_2px_8px_rgba(108,99,255,0.25)] hover:opacity-90"
          >
              Create
            </button>
            <button className="h-9 px-5 text-sm font-semibold rounded-md bg-[#2a2e44] text-[#E1E4F2] hover:opacity-90">
              Recent
            </button>
            <button className="h-9 w-9 flex items-center justify-center rounded-md bg-[#2a2e44] text-[#E1E4F2] hover:opacity-90">
              <Settings size={18} />
            </button>
          </div>
          <div className="flex items-center justify-center gap-4 px-3 bg-[#20222f] text-sm font-semibold text-[#E1E4F2] rounded-md h-9" title="Last 100 resolved coinflips" aria-label={`Last 100 coinflips: ${recentHeadsCount} heads and ${recentTailsCount} tails`}>
            <span className="flex items-center gap-1">
              <img src="/heads.png" alt="heads" className="h-4 w-4" />
              {recentHeadsCount}
            </span>
            <span className="flex items-center gap-1">
              <img src="/tails.png" alt="tails" className="h-4 w-4" />
              {recentTailsCount}
            </span>
          </div>
          <SortDropdown value={sortBy} onChange={setSortBy} className="w-full" />
        </div>

        {/* Desktop Controls */}
        <div className="hidden sm:flex items-center gap-2.5 mb-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="min-w-24 h-9 px-5 text-sm font-semibold rounded-md border border-[#5E55D9]/40 bg-[linear-gradient(135deg,#6C63FF_0%,#5147D9_100%)] text-white shadow-[0_2px_8px_rgba(108,99,255,0.25)] hover:opacity-90"
            >
              Create
            </button>
            <button className="min-w-24 h-9 px-5 text-sm font-semibold rounded-md bg-[#2a2e44] text-[#E1E4F2] hover:opacity-90">
              Recent
            </button>
            <button className="h-9 w-10 flex items-center justify-center rounded-md bg-[#2a2e44] text-[#E1E4F2] hover:opacity-90">
              <Settings size={18} />
            </button>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-3 px-3 bg-[#20222f] text-sm font-semibold text-[#E1E4F2] rounded-md h-9" title="Last 100 resolved coinflips" aria-label={`Last 100 coinflips: ${recentHeadsCount} heads and ${recentTailsCount} tails`}>
              <span className="flex items-center gap-1">
                <img src="/heads.png" alt="heads" className="h-4 w-4" />
                {recentHeadsCount}
              </span>
              <span className="flex items-center gap-1">
                <img src="/tails.png" alt="tails" className="h-4 w-4" />
                {recentTailsCount}
              </span>
            </div>
            <SortDropdown value={sortBy} onChange={setSortBy} className="w-44" />
          </div>
        </div>

        {/* Room Cards */}
        <div className="flex flex-col gap-2">
          {rooms.length > 0 &&
            rooms
              .slice()
              .sort((a, b) => {
                const aVal = Number(a.numericValue ?? 0)
                const bVal = Number(b.numericValue ?? 0)
                if (sortBy === 'Highest to Lowest') return bVal - aVal
                if (sortBy === 'Lowest to Highest') return aVal - bVal
                return 0
              })
              .map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  onJoin={() => setJoinRoom(room)}
                  onView={() => setViewRoom(room)}
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
        setViewRoom(normalized)
      }} />}
      {joinRoom && (
        <CoinflipJoinModal
          room={joinRoom}
          onClose={() => setJoinRoom(null)}
          onJoin={({ updatedRoom } = {}) => {
            if (updatedRoom) {
              const normalized = normalizeRoom(updatedRoom)
              setRooms((prev) => prev.map((existing) => (existing.id === normalized.id ? { ...existing, ...normalized } : existing)))
              setViewRoom(normalized)
            }
            setJoinRoom(null)
          }}
        />
      )}
      {viewRoom && (
        <CoinflipViewModal
          room={viewRoom}
          onClose={() => setViewRoom(null)}
          onProfileOpen={setSelectedProfile}
          profileOpen={Boolean(selectedProfile)}
          onCanceled={(canceledRoom) => {
            const canceledId = canceledRoom?.id || canceledRoom?.room_id
            setRooms((prev) => prev.filter((existing) => existing.id !== canceledId))
            setViewRoom(null)
            window.dispatchEvent(new CustomEvent('wallet:updated'))
          }}
        />
      )}
      <MiniProfileModal
        isOpen={Boolean(selectedProfile)}
        player={selectedProfile}
        onClose={() => setSelectedProfile(null)}
      />
    </div>
  )
}

function StatCard({ icon, value, label, gradient, bgColor, showIcon = true }) {
  return (
    <div
      className="flex items-start justify-start gap-3 rounded-md p-3"
      style={{
        background: `radial-gradient(circle at 100% 100%, ${gradient} 0%, rgba(108, 99, 255, 0.16) 24%, rgba(108, 99, 255, 0.09) 52%, rgba(108, 99, 255, 0.04) 68%, transparent 82%), rgb(27, 31, 46)`,
      }}
    >
      <div className="flex w-full flex-col items-start justify-center text-left">
        <span className="flex items-center justify-start gap-2 text-left text-lg font-bold text-white">
          {showIcon && icon && <img src={icon} alt="" className="h-5 w-5" />}
          {value}
        </span>
        <span className="text-left text-xs text-white">{label}</span>
      </div>
    </div>
  )
}

function SortDropdown({ value, onChange, className = '' }) {
  const [isOpen, setIsOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState(null)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const options = ['Highest to Lowest', 'Lowest to Highest']

  useEffect(() => {
    if (!isOpen) return undefined

    const updatePosition = () => {
      const button = buttonRef.current
      if (!button) return
      const rect = button.getBoundingClientRect()
      const menuHeight = menuRef.current?.offsetHeight || 88
      const roomBelow = window.innerHeight - rect.bottom
      const openAbove = roomBelow < menuHeight + 8 && rect.top > roomBelow

      setMenuPosition({
        left: rect.left,
        top: openAbove ? Math.max(4, rect.top - menuHeight - 4) : rect.bottom + 4,
        width: rect.width,
      })
    }

    const closeOnOutsideClick = (event) => {
      if (buttonRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return
      setIsOpen(false)
    }

    updatePosition()
    const animationFrame = window.requestAnimationFrame(updatePosition)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    document.addEventListener('pointerdown', closeOnOutsideClick)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      document.removeEventListener('pointerdown', closeOnOutsideClick)
    }
  }, [isOpen])

  return (
    <div className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex h-9 w-full items-center justify-between rounded-md bg-[#20222f] px-3 text-sm text-[#E1E4F2] shadow-none transition-none hover:bg-[#20222f] focus:border-0 focus:outline-none"
      >
        <span>{value}</span>
        <ChevronDown size={16} className={`text-[#E1E4F2] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={menuPosition || { left: 0, top: 0, width: 0 }}
          className={`fixed z-[10000] origin-top overflow-hidden rounded-md bg-[#20222f] p-1 shadow-[0_10px_24px_rgba(0,0,0,.35)] transition-[opacity,transform,visibility] duration-150 ease-out ${
            isOpen && menuPosition
              ? 'visible translate-y-0 scale-y-100 opacity-100'
              : 'invisible pointer-events-none -translate-y-1 scale-y-95 opacity-0'
          }`}
        >
          {options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                onChange(option)
                setIsOpen(false)
              }}
              className={`mx-0 my-0.5 flex w-full items-center rounded-[6px] px-3 py-2 text-left text-sm text-[#E1E4F2] transition-all duration-200 ease-out hover:bg-[#222531] ${value === option ? 'bg-[#222531]' : 'bg-transparent'}`}
            >
              {option}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}

function CoinflipRowResult({ room, side, onReveal }) {
  const getRemainingMs = () => {
    const resolvedAt = new Date(room?.resolved_at || Date.now()).getTime()
    const elapsed = Number.isFinite(resolvedAt) ? Date.now() - resolvedAt : 0
    return Math.max(0, ROW_RESULT_COUNTDOWN_MS - elapsed)
  }

  const [initialRemainingMs, setInitialRemainingMs] = useState(getRemainingMs)
  const [remainingSeconds, setRemainingSeconds] = useState(() => Math.max(1, Math.ceil(getRemainingMs() / 1000)))
  const [revealed, setRevealed] = useState(() => getRemainingMs() <= 0)

  useEffect(() => {
    const remainingMs = getRemainingMs()
    setInitialRemainingMs(remainingMs)

    if (remainingMs <= 0) {
      setRevealed(true)
      onReveal?.()
      return undefined
    }

    setRevealed(false)
    setRemainingSeconds(Math.max(1, Math.ceil(remainingMs / 1000)))
    const interval = window.setInterval(() => {
      setRemainingSeconds(Math.max(1, Math.ceil(getRemainingMs() / 1000)))
    }, 250)
    const timeout = window.setTimeout(() => {
      window.clearInterval(interval)
      setRevealed(true)
      onReveal?.()
    }, remainingMs)

    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
  }, [room?.id, room?.resolved_at, room?.result])

  if (revealed) {
    return <img className="h-full w-full object-contain" alt={side} src={side === 'heads' ? '/heads.png' : '/tails.png'} />
  }

  const elapsedPercent = 100 - ((initialRemainingMs / ROW_RESULT_COUNTDOWN_MS) * 100)
  return (
    <div className="relative grid h-14 w-14 place-items-center" role="timer" aria-label={`${remainingSeconds} seconds until result`}>
      <svg viewBox="0 0 104 104" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <circle
          cx="52"
          cy="52"
          r="49"
          fill="#171925"
          strokeWidth="2"
          stroke="#6c63ff"
          pathLength="100"
          strokeDasharray="100"
          transform="rotate(-90 52 52)"
          className="coinflip-row-countdown-stroke"
          style={{
            '--coinflip-countdown-start': elapsedPercent,
            '--coinflip-countdown-duration': `${initialRemainingMs}ms`,
          }}
        />
      </svg>
      <span className="relative z-10 text-base font-bold text-[#e1e4f2]">{remainingSeconds}</span>
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
  ]
  const displayItems = combinedItems.slice(0, 5)
  const hiddenItemCount = Math.max(combinedItems.length - displayItems.length, 0)
  const canJoin = !room.opponent_uuid && !room.canceled
  const currentUserId = String(user?.profile_id || user?.id || '')
  const isCreator = Boolean(currentUserId && (currentUserId === String(room.creator_uuid || '')))
  const joinDisabled = !canJoin || isCreator
  const isCompleted = Boolean(room.opponent_uuid && room.result)
  const winner = isCompleted ? room.result || room.winner || null : null
  const resolvedAtMs = new Date(room.resolved_at || Date.now()).getTime()
  const [rowResultVisible, setRowResultVisible] = useState(
    () => isCompleted && Date.now() - resolvedAtMs >= ROW_RESULT_COUNTDOWN_MS,
  )

  useEffect(() => {
    const nextResolvedAtMs = new Date(room.resolved_at || Date.now()).getTime()
    setRowResultVisible(
      Boolean(isCompleted && Date.now() - nextResolvedAtMs >= ROW_RESULT_COUNTDOWN_MS),
    )
  }, [isCompleted, room.id, room.resolved_at, room.result])

  const creatorWon = rowResultVisible && (room.winner_uuid
    ? String(room.winner_uuid) === String(room.creator_uuid)
    : winner === player1.side)
  const opponentWon = rowResultVisible && (room.winner_uuid
    ? String(room.winner_uuid) === String(room.opponent_uuid)
    : winner === player2.side)
  const openCreatorProfile = () => onProfileOpen?.({
    id: room.creator_uuid,
    profile_id: room.creator_uuid,
    username: room.creator_username,
    avatar: player1.avatar,
    avatar_url: player1.avatar,
    avatar_headshot_url: player1.avatar,
  })
  const openOpponentProfile = () => {
    if (!room.opponent_uuid) return
    onProfileOpen?.({
      id: room.opponent_uuid,
      profile_id: room.opponent_uuid,
      username: room.opponent_username,
      avatar: player2.avatar,
      avatar_url: player2.avatar,
      avatar_headshot_url: player2.avatar,
    })
  }

  return (
    <div
      className="relative grid grid-cols-1 items-center gap-2 overflow-visible rounded-lg border border-solid border-[#252839] bg-[#1c1f2e] py-3 pl-6 pr-2.5 xl:grid-cols-[repeat(5,auto)] [&>*]:min-w-0"
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
      <div className="flex items-center gap-3 justify-self-center xl:justify-self-start">
        <button
          type="button"
          aria-label={`Open ${room.creator_username || 'creator'} profile`}
          onClick={openCreatorProfile}
          className={`coinflip-row-avatar relative box-border h-14 w-14 flex-[0_0_auto] cursor-pointer rounded-full border-2 border-[#2F3347] bg-[#1C1F2E] p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6c63ff] ${creatorWon ? 'coinflip-row-avatar--winner' : ''} ${rowResultVisible && !creatorWon ? 'coinflip-row-avatar--loser' : ''}`}
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
          <div className="absolute right-0 top-0 h-7 w-7 overflow-hidden rounded-full" style={{ transform: 'translate(25%, -25%)' }}>
            <img className="block w-full h-full object-contain" alt={player1.side || 'coin'} src={player1.side === 'tails' ? '/tails.png' : '/heads.png'} />
          </div>
        </button>
        <strong className="text-lg font-bold text-[#B0B8C1]">VS</strong>
        <button
          type="button"
          aria-label={room.opponent_uuid ? `Open ${room.opponent_username || 'opponent'} profile` : 'Waiting for opponent'}
          onClick={openOpponentProfile}
          disabled={!room.opponent_uuid}
          className={`coinflip-row-avatar relative box-border h-14 w-14 flex-[0_0_auto] rounded-full border-2 border-[#2F3347] bg-[#1C1F2E] p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6c63ff] ${room.opponent_uuid ? 'cursor-pointer' : 'cursor-default'} ${opponentWon ? 'coinflip-row-avatar--winner' : ''} ${rowResultVisible && !opponentWon ? 'coinflip-row-avatar--loser' : ''}`}
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
                <circle cx="22" cy="32" r="4" fill="#6C63FF">
                  <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" begin="0s" />
                </circle>
                <circle cx="32" cy="32" r="4" fill="#6C63FF">
                  <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" begin="0.4s" />
                </circle>
                <circle cx="42" cy="32" r="4" fill="#6C63FF">
                  <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" begin="0.8s" />
                </circle>
              </svg>
            </div>
          )}
          <div className="absolute right-0 top-0 h-7 w-7 overflow-hidden rounded-full" style={{ transform: 'translate(25%, -25%)' }}>
            <img className="block w-full h-full object-contain" alt={player2.side || 'coin'} src={player2.side === 'tails' ? '/tails.png' : '/heads.png'} />
          </div>
        </button>
      </div>

      {/* Items Display */}
      <div className="flex justify-self-center xl:grid xl:grid-cols-5 xl:justify-self-start">
        {displayItems.map((item, idx) => {
          const isLastVisibleItem = idx === displayItems.length - 1 && hiddenItemCount > 0

          return (
            <div
              key={item.id || `items-${idx}`}
              className="group relative box-border block h-14 w-14 flex-[0_0_auto] cursor-pointer rounded-[5px] border-2 border-solid border-[#2F3347] bg-[#171925] transition-colors duration-200 hover:border-[#6c63ff] xl:[transform:var(--shift)] max-xl:[&+*]:-ml-5"
              aria-label={item.name}
              style={{ ...getInventoryItemCardStyle(item), '--shift': `translate(${idx * -35.7}%)` }}
            >
              <span
                role="tooltip"
                className="pointer-events-none absolute bottom-[calc(100%+7px)] left-1/2 z-40 max-w-44 -translate-x-1/2 overflow-hidden text-ellipsis whitespace-nowrap rounded bg-[#0f1119] px-2 py-1 text-[10px] font-semibold leading-tight text-[#e1e4f2] opacity-0 shadow-[0_4px_12px_rgba(0,0,0,.35)] transition-opacity duration-150 group-hover:opacity-100"
              >
                {item.name}
              </span>
              <img src={item.image} alt="" className="block h-full w-full scale-100 rounded-[3px] object-contain" />

              {isLastVisibleItem && (
                <div
                  className="pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-[5px] text-sm font-semibold text-white"
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
      <div className="w-32 place-self-center text-center font-bold">
        <p className="inline-flex items-center gap-2 text-[1.375rem] leading-normal text-white">
          <img src="/bobux.png" className="w-5 text-[#6c63ff]" alt="bobux" />
          <span>{room.value ?? room.total_value ?? ''}</span>
        </p>
        <p className="text-sm leading-normal text-[#CCC]">{room.range ?? room.value_range ?? ''}</p>
      </div>

      {/* Winner Indicator */}
      <div className="relative justify-self-center xl:w-14 xl:h-14 w-14 h-14">
        {isCompleted ? (
          <CoinflipRowResult
            room={room}
            side={winner}
            onReveal={() => setRowResultVisible(true)}
          />
        ) : null}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center gap-2 justify-self-center xl:ml-auto xl:flex-col xl:justify-self-end">
        <button
          className="min-w-24 rounded-md border border-solid px-5 text-base font-semibold transition-none h-[34px] leading-[34px] py-0 cursor-pointer border-[#5E55D9]/40 bg-[linear-gradient(135deg,#6C63FF_0%,#5147D9_100%)] text-white shadow-[0_2px_8px_rgba(108,99,255,0.25)] disabled:opacity-50 disabled:cursor-not-allowed"
          type="button"
          onClick={() => { if (!joinDisabled && typeof onJoin === 'function') onJoin() }}
          disabled={joinDisabled}
        >
          Join
        </button>
        <button
          type="button"
          onClick={onView}
          className="min-w-24 rounded-md border border-solid px-5 text-base font-semibold transition-none h-[34px] leading-[34px] py-0 cursor-pointer border-[#2D314A] bg-[#2a2e44] text-[#E1E4F2] shadow-none hover:opacity-90"
        >
          View
        </button>
      </div>
    </div>
  )
}
