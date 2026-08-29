import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react'
import { apiRequest } from '../lib/apiClient'
import { isUuidLike } from '../lib/supabaseClient'
import { useAuth } from '../store/auth'
import { CoinflipIcon } from './icons'
import { notifications } from './Notifications'
import AnimatedStatNumber from './AnimatedStatNumber'
import { getInventoryItemCardStyle } from './InventoryItemCard'
import SortDirectionIcon from './SortDirectionIcon'
import { formatPriceValue } from '../Utils/FormatPriceValues'
import { AllGamesIcon, GameHistoryStatusBadge } from './GameHistoryUI'
import RoleBadge from './RoleBadge'
import AdminSearchField from './AdminSearchField'
import AdoptMeTraitBadges from './AdoptMeTraitBadges'
import { ADMIN_PRIMARY_BUTTON, SESSION_DANGER_SURFACE } from './AdminControlStyles'
import {
  AdminGeneral,
  AdminPlayers,
  prefetchAdminGeneral,
} from './AdminSections'

const COIN_ICON = '/bobux.png'
const DISCORD_ICON = 'https://i.ibb.co/mVNMLkPG/dc.png'
const PS99_CAT_ICON = '/ps99-cat.png'

const tabs = [
  { id: 'profile', label: 'Profile', icon: 'profile' },
  { id: 'sessions', label: 'Sessions', icon: 'sessions' },
  { id: 'games', label: 'Game History', icon: 'games' },
  { id: 'transactions', label: 'Transaction History', icon: 'transactions' },
  { id: 'ignored', label: 'Ignored Users', icon: 'ignored' },
  { id: 'admin', label: 'Admin Panel', icon: 'admin' },
]

const availableTabs = new Set(['profile', 'sessions', 'games', 'transactions', 'ignored', 'admin'])
const adminPanelRoles = new Set(['admin', 'owner'])

function canAccessAdminPanel(role) {
  return adminPanelRoles.has(String(role ?? '').trim().toLowerCase())
}

const adminSections = [
  { id: 'general', label: 'General', Icon: AdminGeneralIcon },
  { id: 'players', label: 'Players', Icon: AdminPlayersIcon },
  {
    id: 'items-mm2',
    label: 'MM2',
    Icon: AdminCatalogIcon,
  },
  {
    id: 'items-amp',
    label: 'AMP',
    Icon: AdminCatalogIcon,
  },
  {
    id: 'items-ps99',
    label: 'PS99',
    image: PS99_CAT_ICON,
    iconClassName: 'h-3 w-3',
  },
]

const adminItemTypes = {
  'items-mm2': 'MM2',
  'items-amp': 'AMP',
  'items-ps99': 'PS99',
}

const gameFilters = [
  { id: 'all', label: 'All', Icon: AllGamesIcon },
  { id: 'coinflip', label: 'Coinflip', Icon: CoinflipIcon },
]

const transactionFilters = [
  { id: 'all', label: 'All' },
  { id: 'deposit', label: 'Deposit' },
  { id: 'cancelled-withdrawal', label: 'Cancelled Withdrawal' },
  { id: 'withdrawal', label: 'Withdrawal' },
]

const scrollClasses =
  '[&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-[rgba(255,79,163,0.3)]'

function formatSessionDate(value) {
  if (!value) return 'Unknown'

  const parsedValue = new Date(value)
  if (Number.isNaN(parsedValue.getTime())) return 'Unknown'

  return parsedValue.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function normalizeSessionEntry(session) {
  const fallbackId = session?.id || `session-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const currentSessionId = typeof window !== 'undefined' ? window.localStorage.getItem('bloxy_current_session_id_v1') : null
  const currentValue = Boolean(session?.current ?? session?.is_current ?? (currentSessionId && String(session?.id) === String(currentSessionId)))

  const looksLikeIpAddress = (value) => {
    const normalizedValue = String(value ?? '').trim().toLowerCase()
    return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalizedValue) ||
      normalizedValue.includes(':') ||
      normalizedValue === 'localhost'
  }
  const timezoneLabel = (() => {
    if (typeof Intl === 'undefined') return 'Current location'

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    const timezoneMap = {
      'Australia/Brisbane': 'Brisbane, Australia',
      'Australia/Sydney': 'Sydney, Australia',
      'Australia/Melbourne': 'Melbourne, Australia',
      'Australia/Perth': 'Perth, Australia',
      'Australia/Adelaide': 'Adelaide, Australia',
      'America/New_York': 'New York, United States',
      'America/Los_Angeles': 'Los Angeles, United States',
      'America/Chicago': 'Chicago, United States',
      'America/Denver': 'Denver, United States',
      'Europe/London': 'London, United Kingdom',
      'Europe/Paris': 'Paris, France',
      'Europe/Berlin': 'Berlin, Germany',
      'Europe/Madrid': 'Madrid, Spain',
      'Europe/Rome': 'Rome, Italy',
      'Asia/Singapore': 'Singapore, Singapore',
      'Asia/Tokyo': 'Tokyo, Japan',
      'Asia/Bangkok': 'Bangkok, Thailand',
      'Asia/Kolkata': 'Mumbai, India',
      'Asia/Dubai': 'Dubai, United Arab Emirates',
      'UTC': 'UTC',
    }

    return timezoneMap[timeZone] || (timeZone ? timeZone.replace(/\//g, ' ').replace(/_/g, ' ') : 'Current location')
  })()

  const locationValue = (() => {
    const locationRaw = session?.location
    if (typeof locationRaw === 'string' && locationRaw.trim() && !looksLikeIpAddress(locationRaw)) {
      return locationRaw
    }

    if (typeof session?.ip_address === 'string' && session.ip_address.trim() && !looksLikeIpAddress(session.ip_address)) {
      return session.ip_address
    }

    return timezoneLabel
  })()

  const ipAddresses = Array.isArray(session?.ip_addresses)
    ? session.ip_addresses.filter(Boolean)
    : typeof session?.ip_addresses === 'string'
      ? session.ip_addresses.split(/[\s,;]+/).filter(Boolean)
      : []
  const primaryIpAddress = ipAddresses[0] || session?.ip_address || null

  return {
    id: fallbackId,
    location: locationValue,
    lastActive: formatSessionDate(session?.last_active_at || session?.last_seen_at || session?.updated_at || session?.created_at),
    firstLogin: formatSessionDate(session?.first_login_at || session?.created_at),
    current: currentValue,
    ip_address: primaryIpAddress,
    ip_addresses: ipAddresses,
  }
}

function ProfileIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 4c2.21 0 4 1.79 4 4s-1.79 4-4 4-4-1.79-4-4 1.79-4 4-4zm0 16s8 0 8-2c0-2.4-3.9-5-8-5s-8 2.6-8 5c0 2 8 2 8 2z" />
    </svg>
  )
}

function SessionsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  )
}

function GamesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 -64 640 640" fill="currentColor" aria-hidden="true">
      <path d="M480.07 96H160a160 160 0 1 0 114.24 272h91.52A160 160 0 1 0 480.07 96zM248 268a12 12 0 0 1-12 12h-52v52a12 12 0 0 1-12 12h-24a12 12 0 0 1-12-12v-52H84a12 12 0 0 1-12-12v-24a12 12 0 0 1 12-12h52v-52a12 12 0 0 1 12-12h24a12 12 0 0 1 12 12v52h52a12 12 0 0 1 12 12zm216 76a40 40 0 1 1 40-40 40 40 0 0 1-40 40zm64-96a40 40 0 1 1 40-40 40 40 0 0 1-40 40z" />
    </svg>
  )
}

function TransactionsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
      <path d="M504 255.531c.253 136.64-111.18 248.372-247.82 248.468-59.015.042-113.223-20.53-155.822-54.911-11.077-8.94-11.905-25.541-1.839-35.607l11.267-11.267c8.609-8.609 22.353-9.551 31.891-1.984C173.062 425.135 212.781 440 256 440c101.705 0 184-82.311 184-184 0-101.705-82.311-184-184-184-48.814 0-93.149 18.969-126.068 49.932l50.754 50.754c10.08 10.08 2.941 27.314-11.313 27.314H24c-8.837 0-16-7.163-16-16V38.627c0-14.254 17.234-21.393 27.314-11.314l49.372 49.372C129.209 34.136 189.552 8 256 8c136.81 0 247.747 110.78 248 247.531zm-180.912 78.784l9.823-12.63c8.138-10.463 6.253-25.542-4.21-33.679L288 256.349V152c0-13.255-10.745-24-24-24h-16c-13.255 0-24 10.745-24 24v135.651l65.409 50.874c10.463 8.137 25.541 6.253 33.679-4.21z" />
    </svg>
  )
}

function IgnoredIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M12.25 19.25H6.95c-1.18 0-2.06-1.04-1.46-2.05C6.36 15.72 8.24 14 12.25 14" />
      <path d="M19.25 19.25 15.75 15.75M15.75 19.25l3.5-3.5" />
    </svg>
  )
}

function AdminIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 512 512"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M256 16 48 96v142.5C48 367.8 133.4 465.2 256 496c122.6-30.8 208-128.2 208-257.5V96L256 16Zm0 62.7 144 55.4v104.4c0 96.4-57.8 169.9-144 197.7-86.2-27.8-144-101.3-144-197.7V134.1L256 78.7Z" />
      <path d="M256 119.8 144 162.9v75.6c0 75.4 42.1 132.8 112 160.3V119.8Z" />
      <path d="M256 119.8 368 162.9v75.6c0 75.4-42.1 132.8-112 160.3V119.8Z" />
    </svg>
  )
}

function AdminGeneralIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  )
}

function AdminPlayersIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="7.5" r="4" />
      <path d="M1.75 20.5c.45-4.35 2.85-6.75 7.25-6.75s6.8 2.4 7.25 6.75H1.75Z" />
      <circle cx="17.25" cy="8.25" r="3" />
      <path d="M16.2 14.4c.45-.1.93-.15 1.43-.15 3.15 0 4.95 2.15 5.25 5.75h-5.1c-.18-2.2-.7-4.08-1.58-5.6Z" />
    </svg>
  )
}

function AdminPrivateServersIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6.5 10V7.5a5.5 5.5 0 0 1 11 0V10h-3V7.5a2.5 2.5 0 0 0-5 0V10h-3Z" />
      <rect x="3.5" y="9" width="17" height="13" rx="3" />
      <circle cx="12" cy="14.25" r="1.65" fill="#131520" />
      <path
        d="m10.95 15.2-.45 3.05h3l-.45-3.05h-2.1Z"
        fill="#131520"
      />
    </svg>
  )
}

function AdminStockIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4 10h16v9.75c0 1.24-1.01 2.25-2.25 2.25H6.25A2.25 2.25 0 0 1 4 19.75V10Z" />
      <path
        d="m4 10-2.75-4L8 2l4 5-4.5 6L4 10ZM20 10l2.75-4L16 2l-4 5 4.5 6 3.5-3Z"
        opacity=".82"
      />
      <path
        d="m7.7 9.8 4.3-2.6 4.3 2.6-4.3 2.35L7.7 9.8Z"
        fill="#131520"
        opacity=".7"
      />
    </svg>
  )
}

function AdminRewardsIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M11 9H7.25a3.25 3.25 0 1 1 3.75-3.2V9ZM7.25 4.35a1.15 1.15 0 1 0 0 2.3h3.08c-.7-1.44-1.72-2.3-3.08-2.3ZM13 9h3.75a3.25 3.25 0 1 0-3.75-3.2V9Zm3.75-4.65a1.15 1.15 0 1 1 0 2.3h-3.08c.7-1.44 1.72-2.3 3.08-2.3Z"
      />
      <path d="M2 9.5h9v4H2.75A.75.75 0 0 1 2 12.75V9.5ZM13 9.5h9v3.25a.75.75 0 0 1-.75.75H13v-4Z" />
      <path d="M4 14.25h7V22H5.5A1.5 1.5 0 0 1 4 20.5v-6.25ZM13 14.25h7v6.25a1.5 1.5 0 0 1-1.5 1.5H13v-7.75Z" />
    </svg>
  )
}

function AdminCatalogIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4.75 4.25h14.5A1.75 1.75 0 0 1 21 6v3.5H3V6a1.75 1.75 0 0 1 1.75-1.75ZM3 11h18v7a1.75 1.75 0 0 1-1.75 1.75H4.75A1.75 1.75 0 0 1 3 18v-7Z" />
      <path d="M8 7h8M8 14.5h8" fill="none" stroke="#131520" strokeWidth="1.8" strokeLinecap="round" opacity=".72" />
    </svg>
  )
}

function AdminItemsDatabase({ itemType }) {
  const remotePaged = itemType === 'AMP'
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [descending, setDescending] = useState(true)
  const [visibleCount, setVisibleCount] = useState(120)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedQuantities, setSelectedQuantities] = useState({})
  const [addingSelected, setAddingSelected] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const nextOffsetRef = useRef(0)
  const loadSequenceRef = useRef(0)
  const deferredSearch = useDeferredValue(search)
  const selectedItemIds = useMemo(
    () => Object.keys(selectedQuantities).filter((itemId) => Number(selectedQuantities[itemId]) > 0),
    [selectedQuantities],
  )
  const selectedItemCount = useMemo(
    () => selectedItemIds.reduce((total, itemId) => total + Number(selectedQuantities[itemId] || 0), 0),
    [selectedItemIds, selectedQuantities],
  )

  const loadItems = async ({ reset = true } = {}) => {
    if (!reset && (loadingMore || !hasMore)) return
    const sequence = reset ? ++loadSequenceRef.current : loadSequenceRef.current
    if (reset) {
      setLoading(true)
      setItems([])
      setHasMore(false)
      nextOffsetRef.current = 0
    } else {
      setLoadingMore(true)
    }
    setError('')
    try {
      const query = new URLSearchParams({ type: itemType })
      if (remotePaged) {
        query.set('limit', '120')
        query.set('offset', String(reset ? 0 : nextOffsetRef.current))
        query.set('sort', descending ? 'desc' : 'asc')
        if (deferredSearch.trim()) query.set('q', deferredSearch.trim())
      }
      const payload = await apiRequest(`/api/admin/items?${query.toString()}`, { cache: 'no-store' })
      if (sequence !== loadSequenceRef.current) return
      const incoming = Array.isArray(payload?.items) ? payload.items : []
      setItems((current) => {
        if (reset) return incoming
        const knownIds = new Set(current.map((item) => String(item.id)))
        return [...current, ...incoming.filter((item) => !knownIds.has(String(item.id)))]
      })
      nextOffsetRef.current = Number(payload?.next_offset ?? ((reset ? 0 : nextOffsetRef.current) + incoming.length))
      setHasMore(remotePaged && Boolean(payload?.has_more))
    } catch (loadError) {
      if (sequence !== loadSequenceRef.current) return
      if (reset) setItems([])
      setError(loadError?.message || 'Unable to load the item database.')
    } finally {
      if (sequence === loadSequenceRef.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }

  useEffect(() => {
    void loadItems({ reset: true })
  }, [itemType, remotePaged ? deferredSearch : '', remotePaged ? descending : false])

  const filteredItems = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase()
    if (remotePaged) {
      return items.slice().sort((a, b) => (
        Number(selectedItemIds.includes(String(b?.id))) - Number(selectedItemIds.includes(String(a?.id)))
      ))
    }
    return items
      .filter((item) => !query || String(item?.name || '').toLowerCase().includes(query))
      .slice()
      .sort((a, b) => {
        const selectedDifference = Number(selectedItemIds.includes(String(b?.id))) - Number(selectedItemIds.includes(String(a?.id)))
        if (selectedDifference) return selectedDifference
        return descending
          ? Number(b?.value || 0) - Number(a?.value || 0) || String(a?.name || '').localeCompare(String(b?.name || ''))
          : Number(a?.value || 0) - Number(b?.value || 0) || String(a?.name || '').localeCompare(String(b?.name || ''))
      })
  }, [deferredSearch, descending, items, remotePaged, selectedItemIds])

  const visibleItems = useMemo(
    () => remotePaged ? filteredItems : filteredItems.slice(0, visibleCount),
    [filteredItems, remotePaged, visibleCount],
  )

  useEffect(() => {
    setVisibleCount(120)
  }, [deferredSearch, descending])

  const toggleItem = (itemId) => {
    const normalizedId = String(itemId)
    setSelectedQuantities((current) => {
      if (Number(current[normalizedId]) > 0) {
        const next = { ...current }
        delete next[normalizedId]
        return next
      }
      return { ...current, [normalizedId]: 1 }
    })
  }

  const setItemQuantity = (itemId, nextQuantity) => {
    const normalizedId = String(itemId)
    const quantity = Math.max(0, Math.min(100, Math.trunc(Number(nextQuantity) || 0)))
    setSelectedQuantities((current) => {
      if (quantity === 0) {
        const next = { ...current }
        delete next[normalizedId]
        return next
      }
      return { ...current, [normalizedId]: quantity }
    })
  }

  const addSelectedItems = async () => {
    if (!selectedItemCount || addingSelected) return
    setAddingSelected(true)
    setError('')
    try {
      const payload = await apiRequest('/api/admin/items/add-to-inventory', {
        method: 'POST',
        body: JSON.stringify({
          items: selectedItemIds.map((itemId) => ({
            item_id: itemId,
            quantity: Number(selectedQuantities[itemId]) || 0,
          })),
        }),
      })
      const addedCount = Number(payload?.added_count || selectedItemCount)
      setSelectedQuantities({})
      window.dispatchEvent(new CustomEvent('wallet:updated'))
      notifications.success(`${addedCount.toLocaleString()} ${addedCount === 1 ? 'item' : 'items'} added to your inventory!`)
    } catch (addError) {
      setError(addError?.message || 'Unable to add the selected items to your inventory.')
    } finally {
      setAddingSelected(false)
    }
  }

  return (
    <div className="adminItemsDatabase flex min-h-0 flex-1 flex-col gap-2.5">
      <div className="relative flex shrink-0 items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <AdminSearchField value={search} onChange={setSearch} placeholder="Search for an item..." className="sm:max-w-[260px]" />
          <button
            type="button"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-none bg-[#20242e] text-[#d9dce3] transition-colors hover:bg-[#282c37] active:bg-[#303642] [&_.sort-direction-icon]:h-[14px] [&_.sort-direction-icon]:w-[14px]"
            title={`Price ${descending ? 'Descending' : 'Ascending'}`}
            aria-label={`Sort by price ${descending ? 'descending' : 'ascending'}`}
            onClick={() => setDescending((value) => !value)}
          >
            <SortDirectionIcon ascending={!descending} />
          </button>
        </div>
        <button
          type="button"
          className={ADMIN_PRIMARY_BUTTON}
          disabled={!selectedItemCount || addingSelected}
          title={selectedItemCount ? `Add ${selectedItemCount} selected ${selectedItemCount === 1 ? 'item' : 'items'} to your inventory` : 'Select catalog items first'}
          onClick={() => { void addSelectedItems() }}
        >
          {addingSelected ? 'Adding...' : 'Add'}
        </button>
      </div>

      {error ? <div className="shrink-0 rounded-md bg-[rgba(255,77,77,.1)] px-3 py-2 text-xs text-[#ff7b87]">{error}</div> : null}

      <div
        className={`min-h-[260px] flex-1 overflow-y-auto overflow-x-hidden rounded-lg border border-white/[.06] bg-[#14171e] p-2.5 ${scrollClasses}`}
        onScroll={(event) => {
          const element = event.currentTarget
          if (element.scrollHeight - element.scrollTop - element.clientHeight < 320) {
            if (remotePaged && hasMore && !loadingMore) void loadItems({ reset: false })
            else if (!remotePaged && visibleCount < filteredItems.length) {
              setVisibleCount((current) => Math.min(current + 120, filteredItems.length))
            }
          }
        }}
      >
        {loading ? (
          <div className="flex h-full min-h-[240px] items-center justify-center text-xs text-white/45">Loading items...</div>
        ) : filteredItems.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {visibleItems.map((item) => {
              const quantity = Number(selectedQuantities[String(item.id)] || 0)
              const selected = quantity > 0
              return (
              <div
                key={item.id}
                className={`adminItemCard relative flex h-[154px] min-w-0 flex-col overflow-hidden rounded-lg border-none p-1.5 transition-[transform,box-shadow] duration-200 hover:scale-[1.03] ${selected ? 'adminItemCardSelected scale-[1.03]' : ''}`}
                style={getInventoryItemCardStyle(item, selected)}
                title={item.name}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                onClick={() => toggleItem(item.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    toggleItem(item.id)
                  }
                }}
              >
                <span className={`absolute right-2.5 top-2.5 z-[3] h-2.5 w-2.5 rounded-[30%] bg-[var(--inventory-indicator-color)] transition-[opacity,transform] duration-200 ${selected ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}`} />
                <div className="relative min-h-0 flex-1 overflow-hidden rounded-md">
                  {item.image_url ? <img src={item.image_url} alt={item.name} className="absolute inset-0 z-[1] h-full w-full object-contain" loading="lazy" decoding="async" /> : null}
                  {itemType === 'AMP' ? <AdoptMeTraitBadges item={item} className="adopt-me-traits--inside" /> : null}
                </div>
                <div className="relative z-[2] flex h-[34px] shrink-0 flex-col items-center justify-center overflow-hidden text-center">
                  {selected ? (
                    <span className="adminItemQuantity flex items-center justify-center gap-2" onClick={(event) => event.stopPropagation()}>
                      <button type="button" className="flex h-7 w-7 items-center justify-center rounded border-none bg-[#ef4444] text-white disabled:cursor-not-allowed disabled:opacity-55" aria-label={`Decrease ${item.name} quantity`} onClick={() => setItemQuantity(item.id, quantity - 1)} disabled={quantity <= 0}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2 6h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                      </button>
                      <input type="number" min="0" max="100" value={quantity} aria-label={`${item.name} quantity`} className="adminItemQuantityInput h-7 w-[50px] rounded border border-white/[.07] bg-[#20242e] px-1 text-center text-[.85rem] text-white outline-none" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} onChange={(event) => setItemQuantity(item.id, event.target.value)} />
                      <button type="button" className="flex h-7 w-7 items-center justify-center rounded border-none bg-[#10b981] text-white disabled:cursor-not-allowed disabled:opacity-55" aria-label={`Increase ${item.name} quantity`} onClick={() => setItemQuantity(item.id, quantity + 1)} disabled={quantity >= 100}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                      </button>
                    </span>
                  ) : (
                    <>
                      <span className="w-full truncate text-[10px] font-semibold leading-3 text-[#ccd9fa] sm:text-[11px]">{item.name}</span>
                      <span className="inline-flex items-center justify-center text-[11px] font-semibold leading-[14px] text-white sm:text-xs"><img src={COIN_ICON} alt="" className="mr-1 h-3.5 w-3.5 shrink-0" />{formatPriceValue(item.value, { compactNumbers: false })}</span>
                    </>
                  )}
                </div>
              </div>
              )
            })}
          </div>
        ) : (
          <div className="flex h-full min-h-[240px] items-center justify-center text-xs text-white/45">No items found.</div>
        )}
        {loadingMore ? <div className="py-3 text-center text-xs text-white/45">Loading more items...</div> : null}
      </div>
    </div>
  )
}

function AdminPanel({ section, onSectionChange }) {
  const handleWheel = (event) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
    event.currentTarget.scrollLeft += event.deltaY
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div
        className="historyFilterRow flex shrink-0 flex-nowrap gap-1.5 overflow-x-auto pb-0.5"
        onWheel={handleWheel}
      >
        {adminSections.map(({
        id,
        label,
        Icon,
        image,
        iconClassName = 'h-[13px] w-[13px]',
      }) => {
        const active = section.id === id

        return (
          <button
            key={id}
            type="button"
            onClick={() => onSectionChange(id)}
            className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border-none px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              active
                ? 'bg-[#ff4fa3] text-[#111319]'
                : 'bg-[#20242e] text-[#8e94a2] hover:bg-[#282c37] hover:text-[#d9dce3]'
            }`}
          >
            <span className="inline-flex items-center opacity-80">
              {image ? (
                <span
                  className={`inline-block shrink-0 bg-current ${iconClassName}`}
                  aria-hidden="true"
                  style={{
                    WebkitMaskImage: `url(${image})`,
                    maskImage: `url(${image})`,
                    WebkitMaskPosition: 'center',
                    maskPosition: 'center',
                    WebkitMaskRepeat: 'no-repeat',
                    maskRepeat: 'no-repeat',
                    WebkitMaskSize: 'contain',
                    maskSize: 'contain',
                  }}
                />
              ) : (
                <Icon className={iconClassName} />
              )}
            </span>
            <span>{label}</span>
          </button>
        )
        })}
      </div>
      {section.id === 'general' ? <AdminGeneral /> : null}
      {section.id === 'players' ? <AdminPlayers /> : null}
      {adminItemTypes[section.id] ? (
        <AdminItemsDatabase key={adminItemTypes[section.id]} itemType={adminItemTypes[section.id]} />
      ) : null}
    </div>
  )
}

function TabIcon({ icon }) {
  if (icon === 'sessions') return <SessionsIcon />
  if (icon === 'games') return <GamesIcon />
  if (icon === 'transactions') return <TransactionsIcon />
  if (icon === 'ignored') return <IgnoredIcon />
  if (icon === 'admin') return <AdminIcon />
  return <ProfileIcon />
}

function CopyIcon() {
  return (
    <svg fill="currentColor" viewBox="0 0 448 512" height="11" width="11" aria-hidden="true">
      <path d="M320 448v40c0 13.255-10.745 24-24 24H24c-13.255 0-24-10.745-24-24V120c0-13.255 10.745-24 24-24h72v296c0 30.879 25.121 56 56 56h168zm0-344V0H152c-13.255 0-24 10.745-24 24v368c0 13.255 10.745 24 24 24h272c13.255 0 24-10.745 24-24V128H344c-13.2 0-24-10.8-24-24zm120.971-31.029L375.029 7.029A24 24 0 0 0 358.059 0H352v96h96v-6.059a24 24 0 0 0-7.029-16.97z" />
    </svg>
  )
}

function SessionDeviceIcon() {
  return (
    <svg fill="currentColor" viewBox="0 0 576 512" height="18" width="18" aria-hidden="true">
      <path d="M528 0H48C21.5 0 0 21.5 0 48v320c0 26.5 21.5 48 48 48h192l-16 48h-72c-13.3 0-24 10.7-24 24s10.7 24 24 24h272c13.3 0 24-10.7 24-24s-10.7-24-24-24h-72l-16-48h192c26.5 0 48-21.5 48-48V48c0-26.5-21.5-48-48-48zm-16 352H64V64h448v288z" />
    </svg>
  )
}

function StatBox({ amount, label }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-white/[.06] bg-[#14171e] px-1 py-1.5 sm:p-3">
      <div className="inline-flex items-center gap-0.5 text-[.7rem] font-bold text-white sm:gap-1 sm:text-[.95rem]">
        <img src={COIN_ICON} alt="" className="h-[9px] w-[9px] sm:h-3.5 sm:w-3.5" draggable={false} />
        <AnimatedStatNumber value={amount} />
      </div>
      <span className="text-[8px] font-semibold uppercase tracking-normal text-white/35 sm:text-[10px] sm:tracking-[.06em]">
        {label}
      </span>
    </div>
  )
}

function handleHistoryFilterWheel(event) {
  const delta = event.deltaY || event.deltaX
  if (!delta) return

  event.preventDefault()
  event.currentTarget.scrollLeft += delta
}

function formatGameHistoryDate(value) {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  return date.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).replace(',', ' at')
}

function GameHistory({ filter, onFilterChange, history, loading, error }) {
  const rows = filter === 'all'
    ? history
    : history.filter((entry) => entry.filter === filter)

  return (
    <>
      <div className="historyFilterRow flex shrink-0 flex-nowrap gap-1.5 pb-0.5" onWheel={handleHistoryFilterWheel}>
        {gameFilters.map(({ id, label, Icon }) => {
          const active = filter === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onFilterChange(id)}
              className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border-none px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                active
                  ? 'bg-[#ff4fa3] text-[#111319]'
                  : 'bg-[#20242e] text-[#8e94a2] hover:bg-[#282c37] hover:text-[#d9dce3]'
              }`}
            >
              <span className="inline-flex items-center opacity-80">
                <Icon className="h-[13px] w-[13px]" />
              </span>
              <span>{label}</span>
            </button>
          )
        })}
      </div>

      <div className={`flex min-h-0 flex-1 flex-col gap-[3px] overflow-y-auto ${scrollClasses}`}>
        <div className="hidden min-h-7 shrink-0 grid-cols-[1.1fr_.85fr_.85fr_.95fr_1fr_24px] items-end gap-2 bg-transparent px-2 pb-1 pt-2 text-[10px] font-bold uppercase leading-none tracking-[.06em] text-[rgba(225,228,242,.35)] sm:grid">
          <span>Game</span>
          <span>Status</span>
          <span>Amount</span>
          <span>Profit</span>
          <span>Date</span>
          <span />
        </div>

        {loading ? (
          <div className="p-5 text-center text-[13px] text-white/30">Loading game history...</div>
        ) : error ? (
          <div className="p-5 text-center text-[13px] text-[#f87171]">{error}</div>
        ) : rows.length ? rows.map((entry) => {
          const EntryIcon = gameFilters.find((item) => item.id === entry.filter)?.Icon || AllGamesIcon
          const profitColor = entry.profit > 0
            ? 'text-[#34d399]'
            : entry.profit < 0
              ? 'text-[#f87171]'
              : 'text-[#9ca3af]'
          const profitPrefix = entry.profit > 0 ? '+' : ''

          return (
            <div
              key={entry.id}
              className="grid h-[34px] min-h-[34px] cursor-pointer grid-cols-[1.4fr_.85fr_.85fr] items-center gap-x-1 overflow-hidden rounded-[7px] border border-white/[.05] bg-[#14171e] px-1.5 text-[10px] font-semibold text-[#d9dce3] transition-colors hover:bg-[#1b1f28] sm:h-9 sm:min-h-9 sm:grid-cols-[1.1fr_.85fr_.85fr_.95fr_1fr_24px] sm:gap-2 sm:px-2 sm:text-[11px]"
            >
              <span className="inline-flex min-w-0 items-center gap-[5px] overflow-hidden text-ellipsis whitespace-nowrap">
                <span className="inline-flex shrink-0 opacity-70">
                  <EntryIcon className="h-[13px] w-[13px]" />
                </span>
                <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] sm:text-xs">{entry.game}</span>
              </span>
              <span><GameHistoryStatusBadge status={entry.status} /></span>
              <span className="inline-flex items-center gap-[3px] text-[10px] sm:text-xs">
                <img src={COIN_ICON} alt="" className="h-[11px] w-[11px]" />
                {Number(entry.amount || 0).toLocaleString()}
              </span>
              <span className={`hidden items-center gap-[3px] text-xs sm:inline-flex ${profitColor}`}>
                <img src={COIN_ICON} alt="" className="h-[11px] w-[11px]" />
                {profitPrefix}{Number(entry.profit || 0).toLocaleString()}
              </span>
              <span className="hidden overflow-hidden text-ellipsis whitespace-nowrap text-[10px] opacity-50 sm:block">
                {formatGameHistoryDate(entry.date)}
              </span>
              <button
                type="button"
                aria-label={`Open ${entry.game} game details`}
                className="hidden h-6 w-6 items-center justify-center text-white/20 transition-colors hover:text-white/60 sm:inline-flex"
              >
                <ExternalLink className="h-[13px] w-[13px]" strokeWidth={2} />
              </button>
            </div>
          )
        }) : (
          <div className="p-5 text-center text-[13px] text-white/30">No games in this category.</div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between pt-1">
        <button
          type="button"
          disabled
          aria-label="Previous page"
          className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-md border-none bg-[#242833] text-[#9aa0ac] disabled:cursor-not-allowed disabled:opacity-35 sm:h-[30px] sm:w-[30px]"
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
        <span className="text-[11px] font-semibold text-[rgba(225,228,242,.4)] sm:text-xs">1 / 1</span>
        <button
          type="button"
          disabled
          aria-label="Next page"
          className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-md border-none bg-[#242833] text-[#9aa0ac] disabled:cursor-not-allowed disabled:opacity-35 sm:h-[30px] sm:w-[30px]"
        >
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>
    </>
  )
}

function TransactionHistory({ filter, onFilterChange, history, loading, error }) {
  const rows = filter === 'all'
    ? history
    : history.filter((entry) => entry.filter === filter)

  return (
    <>
      <div className="historyFilterRow flex shrink-0 flex-nowrap gap-1.5 pb-0.5" onWheel={handleHistoryFilterWheel}>
        {transactionFilters.map(({ id, label }) => {
          const active = filter === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onFilterChange(id)}
              className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-md border-none px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                active
                  ? 'bg-[#ff4fa3] text-[#111319]'
                  : 'bg-[#20242e] text-[#8e94a2] hover:bg-[#282c37] hover:text-[#d9dce3]'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div className={`flex min-h-0 flex-1 flex-col gap-[3px] overflow-y-auto ${scrollClasses}`}>
        <div className="hidden min-h-7 shrink-0 grid-cols-[1.5fr_1.4fr_.6fr_1.1fr_24px] items-end gap-2 bg-transparent px-2 pb-1 pt-2 text-[10px] font-bold uppercase leading-none tracking-[.06em] text-[rgba(225,228,242,.35)] sm:grid">
          <span>Type</span>
          <span>Date</span>
          <span>Balance</span>
          <span>Amount</span>
          <span />
        </div>

        {loading ? (
          <div className="p-5 text-center text-[13px] text-white/30">Loading transaction history...</div>
        ) : error ? (
          <div className="p-5 text-center text-[13px] text-[#f87171]">{error}</div>
        ) : rows.length ? rows.map((entry) => {
          const isPositive = entry.amount >= 0
          return (
            <div
              key={entry.id}
              className="flex h-[34px] min-h-[34px] cursor-pointer items-center justify-between gap-1.5 overflow-hidden rounded-[7px] border border-white/[.05] bg-[#14171e] px-2 text-[10px] font-semibold text-[#d9dce3] transition-colors hover:bg-[#1b1f28] sm:grid sm:h-9 sm:min-h-9 sm:grid-cols-[1.5fr_1.4fr_.6fr_1.1fr_24px] sm:gap-2 sm:text-[11px]"
            >
              <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap sm:flex-none">
                {entry.type}
              </span>
              <span className="hidden overflow-hidden text-ellipsis whitespace-nowrap text-[10px] opacity-55 sm:block">
                {formatGameHistoryDate(entry.date)}
              </span>
              <span className="hidden text-[10px] opacity-55 sm:block">
                {entry.balance}
              </span>
              <span className={`inline-flex shrink-0 items-center gap-[3px] font-bold ${
                isPositive ? 'text-[#34d399]' : 'text-[#f87171]'
              }`}>
                <img src={COIN_ICON} alt="" className="h-[11px] w-[11px]" draggable={false} />
                {isPositive ? '+' : '-'}{Math.abs(entry.amount).toLocaleString()}
              </span>
              <button
                type="button"
                aria-label={`Open ${entry.type} transaction details`}
                className="hidden h-6 w-6 items-center justify-center border-none bg-transparent text-white/20 transition-colors hover:text-white/60 sm:inline-flex"
              >
                <ExternalLink className="h-[13px] w-[13px]" strokeWidth={2} />
              </button>
            </div>
          )
        }) : (
          <div className="p-5 text-center text-[13px] text-white/30">
            No transactions in this category.
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between pt-1">
        <button
          type="button"
          disabled
          aria-label="Previous transaction page"
          className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-md border-none bg-[#242833] text-[#9aa0ac] disabled:cursor-not-allowed disabled:opacity-35 sm:h-[30px] sm:w-[30px]"
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
        <span className="text-[11px] font-semibold text-[rgba(225,228,242,.4)] sm:text-xs">1 / 1</span>
        <button
          type="button"
          disabled
          aria-label="Next transaction page"
          className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-md border-none bg-[#242833] text-[#9aa0ac] disabled:cursor-not-allowed disabled:opacity-35 sm:h-[30px] sm:w-[30px]"
        >
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>
    </>
  )
}

function IgnoredUsers({ users, loading, onRemove }) {
  if (loading && !users.length) {
    return <div className="p-5 text-center text-[13px] text-white/30">Loading ignored users...</div>
  }

  return (
    <div className="flex flex-col gap-1">
      {users.length ? users.map((ignoredUser) => {
        const name = ignoredUser.username || ignoredUser.name || ignoredUser.id
        const avatar = ignoredUser.avatar_headshot_url || ignoredUser.avatar_url

        return (
        <div
          key={ignoredUser.id}
          className="flex items-center justify-between rounded-lg border border-white/[.05] bg-[#14171e] px-3 py-[9px]"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/[.06] bg-[#20242e] text-[11px] text-white/40">
              {avatar ? (
                <img src={avatar} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : '?'}
            </span>
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-semibold text-[rgba(225,228,242,.85)]">
              {name}
            </span>
          </span>
          <button
            type="button"
            title={`Unignore ${name}`}
            aria-label={`Unignore ${name}`}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] border-none bg-[rgba(239,68,68,.1)] text-[#f87171] transition-colors hover:bg-[rgba(239,68,68,.2)]"
            onClick={() => onRemove(ignoredUser)}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        )
      }) : (
        <div className="p-5 text-center text-[13px] text-white/30">No ignored users.</div>
      )}
    </div>
  )
}

export default function ProfileModal({ isOpen, initialTab = 'profile', onClose }) {
  const user = useAuth((state) => state.user)
  const logout = useAuth((state) => state.logout)
  const toggleIgnoredUser = useAuth((state) => state.toggleIgnoredUser)
  const [profile, setProfile] = useState(null)
  const [activeTab, setActiveTab] = useState('profile')
  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [gameHistory, setGameHistory] = useState([])
  const [gameHistoryLoading, setGameHistoryLoading] = useState(false)
  const [gameHistoryError, setGameHistoryError] = useState('')
  const [gameFilter, setGameFilter] = useState('all')
  const [transactionHistory, setTransactionHistory] = useState([])
  const [transactionHistoryLoading, setTransactionHistoryLoading] = useState(false)
  const [transactionHistoryError, setTransactionHistoryError] = useState('')
  const [transactionFilter, setTransactionFilter] = useState('all')
  const [adminSection, setAdminSection] = useState('general')
  const [ignoredUsers, setIgnoredUsers] = useState([])
  const [ignoredUsersLoading, setIgnoredUsersLoading] = useState(false)
  const [closing, setClosing] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [discordAvatarEnabled, setDiscordAvatarEnabled] = useState(true)
  const [copied, setCopied] = useState(false)
  const closeTimerRef = useRef(null)

  useEffect(() => {
    const handleSessionActivity = (event) => {
      const activeUserId = String(user?.profile_id || user?.id || '').trim()
      const eventUserId = String(event?.detail?.userId || '').trim()
      const session = event?.detail?.session
      if (!activeUserId || activeUserId !== eventUserId || !session?.id) return

      const normalizedSession = normalizeSessionEntry(session)
      setSessions((current) => {
        const hasSession = current.some((item) => item.id === normalizedSession.id)
        if (!hasSession) return [normalizedSession, ...current]
        return current.map((item) => (
          item.id === normalizedSession.id ? normalizedSession : item
        ))
      })
    }

    window.addEventListener('session:activity', handleSessionActivity)
    return () => window.removeEventListener('session:activity', handleSessionActivity)
  }, [user?.id, user?.profile_id])

  useEffect(() => {
    if (!isOpen) {
      setActiveTab(
        initialTab !== 'admin' && availableTabs.has(initialTab)
          ? initialTab
          : 'profile',
      )
      setGameFilter('all')
      setGameHistory([])
      setGameHistoryError('')
      setGameHistoryLoading(false)
      setTransactionHistory([])
      setTransactionHistoryError('')
      setTransactionHistoryLoading(false)
      setTransactionFilter('all')
      setClosing(false)
      setMobileMenuOpen(false)
      setCopied(false)
      return undefined
    }

    let active = true
    const profileId = user?.profile_id || user?.id

    if (!profileId) {
      setProfile(null)
      return undefined
    }

    const loadProfile = async () => {
      try {
        const result = await apiRequest('/api/profile')
        if (active) setProfile(result?.profile || null)
      } catch (error) {
        console.warn('[ProfileModal] failed to load profile', error)
      }
    }

    const loadGameHistory = async () => {
      setGameHistoryLoading(true)
      setGameHistoryError('')
      try {
        const result = await apiRequest('/api/profile/game-history', { cache: 'no-store' })
        if (active) setGameHistory(Array.isArray(result?.history) ? result.history : [])
      } catch (error) {
        console.warn('[ProfileModal] failed to load game history', error)
        if (active) {
          setGameHistory([])
          setGameHistoryError(error?.message || 'Unable to load game history.')
        }
      } finally {
        if (active) setGameHistoryLoading(false)
      }
    }

    const loadTransactionHistory = async () => {
      setTransactionHistoryLoading(true)
      setTransactionHistoryError('')
      try {
        const result = await apiRequest('/api/profile/transaction-history', { cache: 'no-store' })
        if (active) setTransactionHistory(Array.isArray(result?.history) ? result.history : [])
      } catch (error) {
        console.warn('[ProfileModal] failed to load transaction history', error)
        if (active) {
          setTransactionHistory([])
          setTransactionHistoryError(error?.message || 'Unable to load transaction history.')
        }
      } finally {
        if (active) setTransactionHistoryLoading(false)
      }
    }

    const loadSessions = async () => {
      const userId = String(user?.profile_id || user?.id || '').trim()
      if (!userId) {
        if (active) {
          setSessions([])
          setSessionsLoading(false)
        }
        return
      }

      const readStoredSessions = () => {
        if (typeof window === 'undefined') return []

        try {
          const rawValue = window.localStorage.getItem(`bloxy_active_sessions_v1:${userId}`)
          if (!rawValue) return []
          const parsedValue = JSON.parse(rawValue)
          return Array.isArray(parsedValue) ? parsedValue : []
        } catch {
          return []
        }
      }

      const storedSessions = readStoredSessions()
      if (active && storedSessions.length) {
        setSessions(storedSessions.map(normalizeSessionEntry))
        setSessionsLoading(false)
      } else if (active) {
        setSessionsLoading(true)
      }

      try {
        const result = await apiRequest('/api/sessions')
        const data = result?.sessions
        const error = null

        const fallbackSessions = readStoredSessions()

        if (active && !error && Array.isArray(data)) {
          const normalizedSessions = data.length
            ? data.map(normalizeSessionEntry)
            : fallbackSessions.map(normalizeSessionEntry)
          setSessions(normalizedSessions)
          setSessionsLoading(false)
          return
        }
      } catch (err) {
        console.warn('[ProfileModal] failed to load sessions from Supabase', err)
      }

      if (active) {
        const storedSessions = readStoredSessions()
        if (storedSessions.length) {
          setSessions(storedSessions.map(normalizeSessionEntry))
        } else {
          const fallbackSession = {
            id: window?.localStorage?.getItem('bloxy_current_session_id_v1') || `session-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            user_id: userId,
            ip_address: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
            current: true,
            is_current: true,
            location: 'Current location',
          }
          const nextStoredSessions = [fallbackSession]
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(`bloxy_active_sessions_v1:${userId}`, JSON.stringify(nextStoredSessions))
          }
          setSessions(nextStoredSessions.map(normalizeSessionEntry))
        }
      }

      if (active) setSessionsLoading(false)
    }

    void loadProfile()
    void loadSessions()
    void loadGameHistory()
    void loadTransactionHistory()

    return () => {
      active = false
    }
  }, [initialTab, isOpen, user?.id, user?.profile_id])

  useEffect(() => {
    if (!isOpen) return undefined

    const ignoredUserIds = Array.isArray(user?.ignored_users)
      ? [...new Set(user.ignored_users.map((id) => String(id).trim()).filter(Boolean))]
      : []

    if (!ignoredUserIds.length) {
      setIgnoredUsers([])
      setIgnoredUsersLoading(false)
      return undefined
    }

    let active = true
    const loadIgnoredUsers = async () => {
      setIgnoredUsersLoading(true)
      const queryableIds = ignoredUserIds.filter(isUuidLike)
      let data = []
      let error = null
      try {
        const result = queryableIds.length
          ? await apiRequest(`/api/public-profiles?ids=${encodeURIComponent(queryableIds.join(','))}`)
          : { profiles: [] }
        data = result?.profiles || []
      } catch (requestError) {
        error = requestError
      }

      if (!active) return

      if (!error && Array.isArray(data)) {
        const profilesById = new Map(data.map((profile) => [String(profile.id), profile]))
        setIgnoredUsers(ignoredUserIds.map((id) => (
          profilesById.get(id) || { id, username: id }
        )))
      }
      setIgnoredUsersLoading(false)
    }

    void loadIgnoredUsers()
    return () => {
      active = false
    }
  }, [isOpen, user?.ignored_users])

  useEffect(() => {
    if (isOpen && initialTab !== 'admin' && availableTabs.has(initialTab)) {
      setActiveTab(initialTab)
    }
  }, [initialTab, isOpen])

  useEffect(() => {
    if (!isOpen) return undefined

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setClosing(true)
        closeTimerRef.current = window.setTimeout(() => onClose?.(), 200)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    }
  }, [isOpen, onClose])

  const account = useMemo(() => ({
    ...user,
    ...profile,
    level: user?.level ?? profile?.level,
    xp: user?.xp ?? profile?.xp,
    lifetime_xp: user?.lifetime_xp ?? profile?.lifetime_xp,
    max_level: user?.max_level ?? profile?.max_level,
    played: user?.played ?? profile?.played,
    won: user?.won ?? profile?.won,
    lost: user?.lost ?? profile?.lost,
  }), [profile, user])
  const hasAdminPanelAccess = canAccessAdminPanel(account?.role)
  const visibleTabs = hasAdminPanelAccess
    ? tabs
    : tabs.filter((tab) => tab.id !== 'admin')
  const userId = String(account?.roblox_id ?? profile?.id ?? '').replace(/^roblox:/, '')
  const username = account?.username
  const avatarUrl = account?.avatar_headshot_url || account?.avatar_url
  const isDiscordLinked = Boolean(account?.discord_linked)
  const discordHandle = account?.discord_username
    ? `@${String(account.discord_username).replace(/^@/, '')}`
    : null
  const activeTabData =
    visibleTabs.find((tab) => tab.id === activeTab) ||
    visibleTabs[0]
  const activeAdminSection =
    adminSections.find((section) => section.id === adminSection) ||
    adminSections[0]

  useEffect(() => {
    if (!isOpen || !hasAdminPanelAccess) return
    void prefetchAdminGeneral().catch(() => {})
  }, [hasAdminPanelAccess, isOpen])

  useEffect(() => {
    if (!isOpen) return

    if (initialTab === 'admin' && hasAdminPanelAccess) {
      setActiveTab('admin')
      return
    }

    if (!hasAdminPanelAccess) {
      setActiveTab((currentTab) => (
        currentTab === 'admin' ? 'profile' : currentTab
      ))
    }
  }, [hasAdminPanelAccess, initialTab, isOpen])

  if (!isOpen) return null

  const requestClose = () => {
    if (closing) return
    setClosing(true)
    closeTimerRef.current = window.setTimeout(() => onClose?.(), 200)
  }

  const copyUserId = async () => {
    try {
      await navigator.clipboard.writeText(userId)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      setCopied(false)
    }
  }

  const selectTab = (tabId) => {
    if (!availableTabs.has(tabId)) return
    if (tabId === 'admin' && !hasAdminPanelAccess) return
    setActiveTab(tabId)
    setMobileMenuOpen(false)
  }

  const selectAdminSection = (sectionId) => {
    if (!adminSections.some((section) => section.id === sectionId)) return
    setAdminSection(sectionId)
  }

  const contentClasses = activeTab === 'games' || activeTab === 'transactions' || activeTab === 'admin'
    ? 'overflow-hidden'
    : `overflow-y-auto ${scrollClasses}`

  const handleLogoutAllOthers = async () => {
    if (!user) return

    try {
      await apiRequest('/api/sessions/logout-others', { method: 'POST' })
    } catch (err) {
      console.warn('[ProfileModal] failed to revoke other sessions', err)
    }
    setSessions((current) => current.filter((session) => session.current))
  }

  const handleLogoutSession = async (session) => {
    const userId = String(user?.profile_id || user?.id || '').trim()
    const sessionId = session?.id

    if (!userId || !sessionId) return

    try {
      if (session.current) {
        await logout()
      } else {
        await apiRequest(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
      }
    } catch (err) {
      console.warn('[ProfileModal] failed to logout session', err)
    }

    setSessions((current) => current.filter((item) => item.id !== sessionId))
  }

  const handleUnignoreUser = (ignoredUser) => {
    const profileId = String(ignoredUser?.id || '').trim()
    if (!profileId) return

    const username = ignoredUser?.username || ignoredUser?.name || profileId
    setIgnoredUsers((current) => current.filter((item) => item.id !== profileId))
    const updateRequest = toggleIgnoredUser(profileId)
    notifications.success(`${username} successfully unignored!`)

    void updateRequest.then((result) => {
      if (result?.error) {
        notifications.error(result.error.message || `Unable to unignore ${username}.`)
      }
    })
  }

  return createPortal(
    <div
      className={`profileModalOverlay fixed inset-0 z-[2147483300] flex items-center justify-center bg-[rgba(4,5,8,.76)] ${
        closing
          ? 'animate-[profileFadeOut_.2s_ease-in_forwards]'
          : 'animate-[profileFadeIn_.2s_ease-out]'
      }`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose()
      }}
    >
      <style>{`
        @keyframes profileFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes profileFadeOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes profileModalOpen {
          from { opacity: 0; transform: scale(.93); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes profileModalClose {
          from { opacity: 1; transform: scale(1); }
          to { opacity: 0; transform: scale(.93); }
        }
        @keyframes profileTabFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .profileModalOverlay {
          position: fixed;
          inset: 0;
          z-index: 2147483300;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          padding: 12px;
          background: rgba(4, 5, 8, .76);
          -webkit-backdrop-filter: blur(9px);
          backdrop-filter: blur(9px);
        }

        .profileModalSurface,
        .profileModalSurface * {
          box-sizing: border-box;
        }

        .profileModalSurface {
          width: 92%;
          max-width: 860px;
          height: 660px;
          max-height: 92vh;
          display: flex;
          flex-direction: row;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, .08);
          border-radius: 12px;
          background: #191c24;
          color: #f4f5f8;
          box-shadow: 0 26px 80px rgba(0, 0, 0, .55);
          font-family: Poppins, sans-serif;
        }

        .profileModalSidebar {
          width: 210px;
          min-width: 210px;
          height: 100%;
          flex: 0 0 210px;
          overflow: visible;
          border-right: 1px solid rgba(255, 255, 255, .06);
          background: #151820;
        }

        .profileModalPanel {
          width: calc(100% - 210px);
          min-width: 0;
          min-height: 0;
          flex: 1 1 auto;
          overflow: hidden;
          background: #191c24;
        }

        .profileModalContent {
          width: 100%;
          min-width: 0;
          min-height: 0;
          flex: 1 1 auto;
        }

        .profileModalStats {
          width: 100%;
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .profileModalStats > * {
          min-width: 0;
          overflow: hidden;
        }

        .profileModalDiscordCard {
          width: 100%;
          min-width: 0;
          max-width: 100%;
        }

        .profileModalDiscordInfo {
          min-width: 0;
          overflow: hidden;
        }

        .profileModalDiscordInfo p {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .profileModalSurface button:focus-visible,
        .profileModalSurface input:focus-visible {
          outline: 2px solid rgba(255, 79, 163, .62);
          outline-offset: 1px;
        }

        .profileModalSurface [class*="bg-[#171925]"] {
          border-color: rgba(255, 255, 255, .05);
          background: #14171e !important;
        }

        .profileModalSurface [class*="bg-[#1c1f2e]"] {
          background: #20242e !important;
        }

        .profileModalSurface [class*="bg-[#20222f]"] {
          background: #20242e !important;
        }

        .profileModalSurface [class*="bg-[#202332]"] {
          background: #282c37 !important;
        }

        .profileModalSurface [class*="border-[#252839]"] {
          border-color: rgba(255, 255, 255, .08) !important;
        }

        .profileModalSurface [class*="border-[#323240]"] {
          border-color: rgba(255, 255, 255, .07) !important;
        }

        .profileModalSurface [class*="text-[#a78bfa]"] {
          color: #ff4fa3 !important;
        }

        .profileModalSurface [class*="text-[#7d839f]"] {
          color: #8e94a2 !important;
        }

        .profileModalSurface [class*="text-[#ccd9fa]"],
        .profileModalSurface [class*="text-[#cdd2e8]"] {
          color: #d9dce3 !important;
        }

        .profileModalSurface [class*="bg-[rgba(20,30,70,.45)]"] {
          border: 1px solid rgba(255, 255, 255, .06);
          background: #14171e !important;
        }

        .profileModalPanel > div:first-of-type {
          border-bottom: 1px solid rgba(255, 255, 255, .06);
          background: #151820;
        }

        .profileModalPanel > button[aria-label="Close account"] {
          color: #8e94a2;
          background: #222631;
        }

        .profileModalPanel > button[aria-label="Close account"]:hover {
          color: #b3b8c3;
          background: #282c37;
        }

        .profileModalStats > div {
          border: 1px solid rgba(255, 255, 255, .06);
          background: #14171e !important;
        }

        .profileModalContent {
          scrollbar-width: thin;
          scrollbar-color: #353945 transparent;
        }

        .profileModalContent::-webkit-scrollbar { width: 6px; }
        .profileModalContent::-webkit-scrollbar-thumb { border-radius: 999px; background: #353945; }

        .profileModalGameHistory {
          width: 100%;
          min-width: 0;
          min-height: 0;
        }

        .adminItemCard::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 2;
          padding: 2px;
          border-radius: 6px;
          background: linear-gradient(to bottom, transparent 0%, var(--inventory-border-side) 55%, var(--inventory-border-bottom) 100%);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask-composite: exclude;
          pointer-events: none;
        }

        .adminItemQuantity {
          animation: adminItemQuantityIn .22s ease both;
        }

        @keyframes adminItemQuantityIn {
          from { opacity: 0; transform: translateY(4px) scale(.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .adminItemQuantityInput::-webkit-outer-spin-button,
        .adminItemQuantityInput::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }

        .adminItemQuantityInput[type=number] {
          -moz-appearance: textfield;
        }

        .historyFilterRow {
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: none;
          -ms-overflow-style: none;
          scroll-behavior: smooth;
          overscroll-behavior-x: contain;
          touch-action: pan-x;
          scroll-snap-type: x proximity;
        }

        .historyFilterRow:hover {
          cursor: grab;
        }

        .historyFilterRow:active {
          cursor: grabbing;
        }

        .historyFilterRow {
          scrollbar-color: transparent transparent;
        }

        .historyFilterRow::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }

        @media (max-width: 640px) {
          .profileModalSurface {
            width: 100%;
            max-width: 100%;
            height: 100%;
            max-height: 100%;
            flex-direction: column;
            border: 0;
            border-radius: 0;
          }

          .profileModalSidebar {
            width: 100%;
            min-width: 0;
            height: auto;
            flex: 0 0 auto;
          }

          .profileModalPanel {
            width: 100%;
            min-width: 0;
            min-height: 0;
            flex: 1 1 auto;
          }

          .profileModalContent {
            width: 100%;
            max-width: 100vw;
            overflow-x: hidden;
          }

          .profileModalDiscordCard {
            align-items: center;
            flex-wrap: wrap;
          }

          .profileModalDiscordButton {
            width: auto;
            max-width: 100%;
            margin-left: auto;
          }
        }
      `}</style>

      <div
        className={`profileModalSurface flex h-full max-h-full w-full max-w-full flex-col overflow-hidden rounded-none bg-[#191c24] text-[#f4f5f8] sm:h-[660px] sm:max-h-[92vh] sm:w-[92%] sm:max-w-[860px] sm:flex-row sm:rounded-xl ${
          closing
            ? 'animate-[profileModalClose_.2s_forwards]'
            : 'animate-[profileModalOpen_.25s_forwards]'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
      >
        <aside className="profileModalSidebar flex w-full shrink-0 flex-col border-b border-white/[.06] bg-[#151820] px-3 pb-3 pt-2.5 sm:w-[210px] sm:border-b-0 sm:px-0 sm:py-5">
          <div className="flex items-center justify-between pb-2 text-sm font-bold text-[#f6f6f6] sm:mb-2 sm:px-4 sm:pb-4 sm:text-base">
            <span id="profile-modal-title">Account</span>
            <button
              type="button"
              className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-md border-0 bg-[#222631] p-0 text-[#8e94a2] transition-[color,background] duration-150 hover:bg-[#282c37] hover:text-[#b3b8c3] sm:hidden"
              aria-label="Close account"
              onClick={requestClose}
            >
              <X size={18} strokeWidth={2.2} />
            </button>
          </div>

          <div className="relative block sm:hidden">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/[.08] bg-[#20242e] px-3 py-2.5 text-[13px] font-semibold text-[#e8eaf0] outline-none"
              aria-haspopup="menu"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              <span className="inline-flex items-center gap-2">
                <span className="inline-flex items-center opacity-80">
                  {activeTab === 'profile' ? <ProfileIcon size={14} /> : <TabIcon icon={activeTabData.icon} />}
                </span>
                <span>{activeTabData.label}</span>
              </span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
                className="shrink-0 transition-transform duration-200"
                style={{ transform: `rotate(${mobileMenuOpen ? 180 : 0}deg)` }}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {mobileMenuOpen ? (
              <div
                className="absolute left-0 right-0 top-[calc(100%+4px)] z-[100] overflow-hidden rounded-lg border border-white/[.08] bg-[#20242e] shadow-[0_16px_40px_rgba(0,0,0,.4)] animate-[profileTabFadeIn_.15s_ease-out]"
                role="menu"
              >
                {visibleTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="menuitem"
                    className={`flex w-full items-center gap-2.5 border-x-0 border-t-0 border-b border-solid border-white/[.04] px-3.5 py-[11px] text-left text-[13px] font-semibold transition-colors last:border-b-0 ${
                      tab.id === activeTab
                        ? 'bg-[#ff4fa3] text-[#111319]'
                        : 'bg-transparent text-[#9aa0ac] hover:bg-[#282c37] hover:text-[#e8eaf0]'
                    }`}
                    onClick={() => selectTab(tab.id)}
                  >
                    <TabIcon icon={tab.icon} />
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <nav className="hidden flex-col gap-0.5 px-2 sm:flex" aria-label="Account sections">
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-current={tab.id === activeTab ? 'page' : undefined}
                className={`flex w-full items-center gap-[9px] rounded-md border-none px-2.5 py-[9px] text-left text-[13px] font-semibold transition-colors ${
                  tab.id === activeTab
                    ? 'bg-[rgba(255,79,163,.13)] text-[#ff69b0] shadow-[inset_3px_0_0_#ff4fa3]'
                    : 'bg-transparent text-[#858c99] hover:bg-[#20242e] hover:text-[#d9dce3]'
                }`}
                onClick={() => selectTab(tab.id)}
              >
                <span className="inline-flex shrink-0 items-center"><TabIcon icon={tab.icon} /></span>
                <span className="overflow-hidden text-ellipsis whitespace-nowrap">{tab.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <section className="profileModalPanel relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#191c24]">
          <button
            type="button"
            className="absolute right-4 top-3.5 z-[5] hidden h-[30px] w-[30px] shrink-0 place-items-center rounded-md border-0 bg-[#222631] p-0 text-[#8e94a2] transition-[color,background] duration-150 hover:bg-[#282c37] hover:text-[#b3b8c3] sm:grid"
            aria-label="Close account"
            onClick={requestClose}
          >
            <X size={18} strokeWidth={2.2} />
          </button>

          <div className="hidden shrink-0 items-center gap-2.5 px-[22px] pb-3.5 pt-[18px] sm:flex">
            <span className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[7px] bg-[rgba(255,79,163,.10)] text-[#ff4fa3]">
              <TabIcon icon={activeTabData.icon} />
            </span>
            <span className="text-[15px] font-bold text-[#f6f6f6]">{activeTabData.label}</span>
          </div>

          <div className={`profileModalContent flex min-h-0 flex-1 flex-col gap-2 p-2.5 animate-[profileTabFadeIn_.2s_ease-out] sm:gap-3.5 sm:px-[22px] sm:py-[18px] ${contentClasses}`}>
            {activeTab === 'profile' ? (
              <>
                <div className="flex items-start gap-2 sm:gap-3.5">
                  <img
                    src={avatarUrl}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-full border-2 border-solid border-[#ff4fa3] bg-[#111319] object-cover sm:h-[58px] sm:w-[58px]"
                    draggable={false}
                    referrerPolicy="no-referrer"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <div className="inline-flex flex-wrap items-center gap-1 sm:gap-2">
                      <span className="text-[.85rem] font-bold text-white sm:text-[1.05rem]">{username}</span>
                      <span className="font-mono text-[9px] text-[rgba(225,228,242,.4)] sm:text-[11px]">{userId}</span>
                      <button
                        type="button"
                        className="inline-flex items-center border-none bg-transparent p-0.5 text-[rgba(225,228,242,.4)] transition-colors hover:text-[#e1e4f2]"
                        title={copied ? 'Copied' : 'Copy User ID'}
                        aria-label={copied ? 'User ID copied' : 'Copy User ID'}
                        onClick={copyUserId}
                      >
                        <CopyIcon />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <div className="relative -top-0.5 inline-flex items-center gap-1.5">
                        <RoleBadge role={account?.role} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="profileModalStats grid grid-cols-3 gap-1 sm:gap-2">
                  <StatBox amount={account?.played} label="Played" />
                  <StatBox amount={account?.won} label="Won" />
                  <StatBox amount={account?.lost} label="Lost" />
                </div>

                <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[.06] bg-[#14171e] px-2.5 py-2 sm:px-3.5 sm:py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[13px] font-semibold text-[#f6f6f6]">Discord Avatar</span>
                    <span className="text-[10px] text-[rgba(225,228,242,.4)] sm:text-[11px]">
                      {discordAvatarEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 cursor-pointer accent-[#ff4fa3]"
                    checked={discordAvatarEnabled}
                    aria-label="Use Discord avatar"
                    onChange={(event) => setDiscordAvatarEnabled(event.target.checked)}
                  />
                </div>

                <div className="profileModalDiscordCard flex flex-row flex-wrap items-center gap-2 rounded-lg border border-white/[.06] bg-[#14171e] p-2.5 sm:gap-3.5 sm:p-4">
                  <img src={DISCORD_ICON} alt="Discord" className="h-[26px] w-[26px] shrink-0 object-contain sm:h-10 sm:w-10" draggable={false} />
                  <div className="profileModalDiscordInfo min-w-0 flex-1">
                    {isDiscordLinked ? (
                      <>
                        <p className="mb-px text-xs font-bold text-[#f9f9ff] sm:mb-[3px] sm:text-[13px]">Discord Linked</p>
                        <p className="m-0 text-[10px] text-[rgba(225,228,242,.6)] sm:text-xs">
                          Linked to <strong className="text-white">{discordHandle}</strong>
                        </p>
                      </>
                    ) : (
                      <p className="m-0 text-xs font-bold text-[#f9f9ff] sm:text-[13px]">No Discord account linked!</p>
                    )}
                  </div>
                  {isDiscordLinked ? (
                    <button type="button" className={`profileModalDiscordButton shrink-0 rounded-md border-none px-3 py-[7px] text-[11px] font-semibold sm:px-4 sm:py-[9px] sm:text-xs ${SESSION_DANGER_SURFACE}`}>
                      Unlink Discord
                    </button>
                  ) : (
                    <button type="button" className="profileModalDiscordButton shrink-0 rounded-lg border-0 bg-[#ff4fa3] px-3 py-[7px] text-[11px] font-semibold text-[#111319] transition-[transform,background] duration-[140ms] ease-out hover:bg-[#ff69b0] active:scale-[.98] sm:px-4 sm:py-[9px] sm:text-xs">
                      Link Discord
                    </button>
                  )}
                </div>
              </>
            ) : activeTab === 'sessions' ? (
              <>
                <div className="flex flex-col items-stretch gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2.5">
                  <span className="text-[13px] font-semibold text-white">Active Sessions</span>
                  <button
                    type="button"
                    className={`w-full rounded-md border-none px-3 py-[7px] text-[11px] font-semibold sm:w-auto ${SESSION_DANGER_SURFACE}`}
                    onClick={() => { void handleLogoutAllOthers() }}
                  >
                    Logout All Others
                  </button>
                </div>
                <div className="flex flex-col gap-1.5">
                  {sessionsLoading ? (
                    <div className="rounded-lg border border-white/[.05] bg-[#14171e] p-3 text-center text-[11px] text-[#858c99]">
                      Loading sessions...
                    </div>
                  ) : sessions.length ? sessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex items-start gap-[7px] rounded-lg border border-white/[.05] bg-[#14171e] p-2 sm:gap-2.5 sm:px-3 sm:py-2.5"
                    >
                      <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[7px] bg-[#20242e] text-[#9aa0ac]">
                        <SessionDeviceIcon />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
                        <div className="flex flex-wrap items-center justify-between gap-[5px] sm:flex-nowrap sm:gap-2">
                          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-semibold text-white sm:text-xs">
                            {session.location}
                          </span>
                          {session.current ? (
                            <span className="whitespace-nowrap rounded bg-[rgba(16,185,129,.15)] px-2 py-0.5 text-[10px] font-semibold text-[rgba(236,253,245,.9)]">
                              This Device
                            </span>
                          ) : (
                            <button
                              type="button"
                              className={`whitespace-nowrap rounded border-none px-2 py-[3px] text-[9px] font-semibold sm:px-2.5 sm:py-1 sm:text-[10px] ${SESSION_DANGER_SURFACE}`}
                              onClick={() => { void handleLogoutSession(session) }}
                            >
                              Logout
                            </button>
                          )}
                        </div>
                        <div className="flex flex-col gap-0.5 text-[9px] text-[rgba(225,228,242,.35)] sm:text-[10px]">
                          <span>Last active: {session.lastActive}</span>
                          <span>First login: {session.firstLogin}</span>
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-lg border border-white/[.05] bg-[#14171e] p-3 text-center text-[11px] text-[#858c99]">
                      No active sessions found.
                    </div>
                  )}
                </div>
              </>
            ) : activeTab === 'games' ? (
              <GameHistory
                filter={gameFilter}
                onFilterChange={setGameFilter}
                history={gameHistory}
                loading={gameHistoryLoading}
                error={gameHistoryError}
              />
            ) : activeTab === 'transactions' ? (
              <TransactionHistory
                filter={transactionFilter}
                onFilterChange={setTransactionFilter}
                history={transactionHistory}
                loading={transactionHistoryLoading}
                error={transactionHistoryError}
              />
            ) : activeTab === 'admin' && hasAdminPanelAccess ? (
              <AdminPanel
                section={activeAdminSection}
                onSectionChange={selectAdminSection}
              />
            ) : (
              <IgnoredUsers
                users={ignoredUsers}
                loading={ignoredUsersLoading}
                onRemove={handleUnignoreUser}
              />
            )}
          </div>
        </section>
      </div>
    </div>,
    document.body
  )
}
