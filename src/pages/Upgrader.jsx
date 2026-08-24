import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search } from 'lucide-react'
import InventoryItemCard, { inventoryItemCardStyles } from '../components/InventoryItemCard'
import CoinflipFairnessModal from '../components/CoinflipFairnessModal'
import { notifications } from '../components/Notifications'
import SortDirectionIcon from '../components/SortDirectionIcon'
import { apiRequest } from '../lib/apiClient'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../store/auth'

const COIN_ICON = '/currency.svg'
const MAX_TARGETS = 25
const MIN_CHANCE = 1
const MAX_CHANCE = 75
const UPGRADE_RETURN = 95
const SPIN_DURATION = 5000
const FULL_SPIN_TURNS = 8
const SPIN_SOUND = '/money-D3u6qQYl.mp3'
const WIN_SOUND = '/upgrader_win-B7YBQOH1.mp3'
const LOSE_SOUND = '/upgrader_lose-Bvgxc2nW.mp3'
const UPGRADER_SORT_OPTIONS = ['Highest to Lowest', 'Lowest to Highest', 'Selected', 'Alphabetical']
const UPGRADER_GAME_OPTIONS = [
  { value: 'mm2', label: 'Murder Mystery 2' },
  { value: 'adm', label: 'Adopt Me' },
  { value: 'ps99', label: 'Pet Simulator 99' },
]

function formatValue(value) {
  return Math.max(0, Number(value) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function getItemGame(item) {
  const type = String(item?.type || item?.game || item?.item_type || '').toLowerCase()
  if (type.includes('murder') || type.includes('mm2')) return 'mm2'
  if (type.includes('adopt') || type === 'adm') return 'adm'
  return 'ps99'
}

function sortUpgraderItems(items, sortBy, isSelected) {
  return [...items].sort((a, b) => {
    if (sortBy === 'Selected') {
      const aSelected = Boolean(isSelected?.(a))
      const bSelected = Boolean(isSelected?.(b))
      if (aSelected !== bSelected) return aSelected ? -1 : 1
    }
    if (sortBy === 'Lowest to Highest') return a.value - b.value
    if (sortBy === 'Alphabetical') return a.name.localeCompare(b.name)
    return b.value - a.value
  })
}

function groupStockPool(rows = []) {
  const groups = new Map()

  rows.forEach((row, index) => {
    const key = String(row?.item_id || `${row?.name || 'item'}:${row?.value || 0}:${row?.image_url || ''}:${row?.type || ''}`)
    const existing = groups.get(key)
    if (existing) {
      existing.copies += 1
      existing.stockUuids.push(String(row.uuid))
      return
    }

    groups.set(key, {
      id: key || String(row?.uuid || `stock-${index}`),
      itemId: row?.item_id || null,
      name: String(row?.name || 'Unknown Item'),
      image: row?.image_url || '/ps99-cat.png',
      value: Math.max(0, Number(row?.value) || 0),
      type: row?.type || null,
      copies: 1,
      stockUuids: [String(row?.uuid)],
    })
  })

  return [...groups.values()]
}

function getWheelPoint(angle, radius = 48.5) {
  const radians = (angle * Math.PI) / 180
  return {
    x: 50 + radius * Math.sin(radians),
    y: 50 - radius * Math.cos(radians),
  }
}

function normalizeWheelAngle(angle) {
  return ((Number(angle) || 0) % 360 + 360) % 360
}

function getDefaultZoneStart(chance, rollMode) {
  return rollMode === 'over' ? normalizeWheelAngle(360 - chance * 3.6) : 0
}

function getWinZonePath(chance, zoneStartAngle) {
  const safeChance = Math.max(0, Math.min(MAX_CHANCE, Number(chance) || 0))
  if (!safeChance) return ''

  const sweep = safeChance * 3.6
  const startAngle = normalizeWheelAngle(zoneStartAngle)
  const endAngle = startAngle + sweep
  const start = getWheelPoint(startAngle)
  const end = getWheelPoint(endAngle)
  const largeArc = safeChance > 50 ? 1 : 0

  return `M ${start.x} ${start.y} A 48.5 48.5 0 ${largeArc} 1 ${end.x} ${end.y}`
}

function isRollInsideZone(roll, chance, zoneStartAngle) {
  const rollAngle = (Number(roll) || 0) * 3.6
  const distanceFromStart = normalizeWheelAngle(rollAngle - zoneStartAngle)
  return distanceFromStart <= chance * 3.6
}

function getUpgraderItemAccent(item) {
  const value = Number(item?.value ?? 0)

  if (Number.isFinite(value) && value >= 10_000_000) return '255, 223, 0'
  if (Number.isFinite(value) && value >= 1_000_000) return '255, 99, 71'
  if (Number.isFinite(value) && value >= 100_000) return '255, 105, 180'
  return '54, 123, 255'
}

function getUpgraderItemCardStyle(item, selected = false) {
  const accentColor = getUpgraderItemAccent(item)
  const backgroundOpacity = selected ? .35 : .18
  const borderBottomOpacity = selected ? .95 : .7
  const borderSideOpacity = selected ? .45 : .25

  return {
    background: `linear-gradient(to top, rgba(${accentColor}, ${backgroundOpacity}) 0%, rgba(${accentColor}, 0) 100%), rgb(39, 45, 70)`,
    '--pool-border-bottom': `rgba(${accentColor}, ${borderBottomOpacity})`,
    '--pool-border-side': `rgba(${accentColor}, ${borderSideOpacity})`,
    '--pool-dot-color': `rgba(${accentColor}, 1)`,
    '--pool-indicator-color': `rgba(${accentColor}, 1)`,
    '--pool-selected-glow': `rgba(${accentColor}, .17)`,
  }
}

function safeImage(event) {
  if (event.currentTarget.src.endsWith('/ps99-cat.png')) return
  event.currentTarget.src = '/ps99-cat.png'
}

function CoinValue({ value }) {
  return (
    <span className="upgrader-coin-value">
      <img src={COIN_ICON} alt="" />
      <span>{formatValue(value)}</span>
    </span>
  )
}

function QuantityMinusIcon() {
  return (
    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 448 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M416 208H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h384c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z" />
    </svg>
  )
}

function QuantityPlusIcon() {
  return (
    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 448 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M416 208H272V64c0-17.67-14.33-32-32-32h-32c-17.67 0-32 14.33-32 32v144H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h144v144c0 17.67 14.33 32 32 32h32c17.67 0 32-14.33 32-32V304h144c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z" />
    </svg>
  )
}

function ItemCard({ item, selected = false, onClick, compact = false }) {
  return (
    <button
      type="button"
      className={`upgrader-item-card ${selected ? 'is-selected' : ''} ${compact ? 'is-compact' : ''}`}
      onClick={onClick}
      aria-pressed={selected}
      title={item.name}
      style={getUpgraderItemCardStyle(item)}
    >
      <span className="upgrader-pool-selection-glow" aria-hidden="true" />
      <span className="upgrader-pool-selection-dot" aria-hidden="true" />
      <img className="upgrader-item-blur" src={item.image} alt="" onError={safeImage} />
      <span className="upgrader-image-wrap">
        <img className="upgrader-item-image" src={item.image} alt={item.name} onError={safeImage} />
        {item.copies > 1 ? <span className="upgrader-copy-badge">x{item.copies}</span> : null}
      </span>
      <span className="upgrader-item-details">
        <span className="upgrader-item-name">{item.name}</span>
        <CoinValue value={item.value} />
      </span>
    </button>
  )
}

function PoolItemCard({ item, quantity, totalSelected, onToggle, onQuantityChange }) {
  const selected = quantity > 0
  const atTargetLimit = totalSelected >= MAX_TARGETS

  return (
    <div
      className={`upgrader-item-card upgrader-pool-item-card ${selected ? 'is-pool-selected' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onToggle()
        }
      }}
      title={item.name}
      style={getUpgraderItemCardStyle(item, selected)}
    >
      <img className="upgrader-item-blur" src={item.image} alt="" onError={safeImage} />
      <span className="upgrader-image-wrap">
        <img className="upgrader-item-image" src={item.image} alt={item.name} onError={safeImage} />
        {item.copies > 1 ? <span className="upgrader-copy-badge">x{item.copies}</span> : null}
      </span>
      <span className="upgrader-item-details">
        {selected ? (
          <span className="upgrader-qty-wrap" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="upgrader-qty-minus"
              aria-label={`Decrease ${item.name} quantity`}
              onClick={() => onQuantityChange(quantity - 1)}
            >
              <QuantityMinusIcon />
            </button>
            <input
              type="number"
              min="0"
              max={item.copies}
              className="upgrader-qty-input"
              value={quantity}
              aria-label={`${item.name} quantity`}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
              onChange={(event) => onQuantityChange(event.target.value)}
            />
            <button
              type="button"
              className="upgrader-qty-plus"
              aria-label={`Increase ${item.name} quantity`}
              onClick={() => onQuantityChange(quantity + 1)}
              disabled={quantity >= item.copies || atTargetLimit}
            >
              <QuantityPlusIcon />
            </button>
          </span>
        ) : (
          <span className="upgrader-pool-default-details">
            <span className="upgrader-item-name">{item.name}</span>
            <CoinValue value={item.value} />
          </span>
        )}
      </span>
    </div>
  )
}

function TargetArrow({ className, delay = '0ms', gradientId, accent }) {
  const accentChannels = String(accent || '255, 176, 24')
    .split(',')
    .map((channel) => Math.max(0, Math.min(255, Number(channel.trim()) || 0)))
  const gradientStart = `rgb(${accentChannels.join(', ')})`
  const gradientEnd = `rgb(${accentChannels.map((channel) => Math.round(channel + (255 - channel) * .55)).join(', ')})`

  return (
    <div
      className={`rotate-80 float-animation absolute z-[12] animate-pulse upgrader-floating-arrow ${className}`}
      style={{ '--upgrader-arrow-delay': delay }}
      aria-hidden="true"
    >
      <svg
        fill={`url(#${gradientId})`}
        className="max-2xl:max-w-[30px]"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 675.01 561.83"
        style={{ width: '35px', rotate: '-90deg', display: 'flex' }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={gradientStart} />
            <stop offset="70%" stopColor={gradientEnd} />
          </linearGradient>
        </defs>
        <polygon className="upgrader-arrow upgrader-arrow-one" points="148.47 83.06 53.14 83.06 183.66 276.14 53.14 476.5 148.47 476.5 278.99 276.14 148.47 83.06" />
        <polygon className="upgrader-arrow upgrader-arrow-two" points="286.12 49.24 190.79 49.24 343.02 276.14 188.05 512.59 283.38 512.59 438.35 276.14 286.12 49.24" />
        <polygon className="upgrader-arrow upgrader-arrow-three" points="461.35 83.06 366.02 83.06 496.54 276.14 366.02 476.5 461.35 476.5 591.87 276.14 461.35 83.06" />
      </svg>
    </div>
  )
}

function InventoryBagIcon() {
  return (
    <svg className="upgrader-inventory-bag-icon" viewBox="0 0 260 320" aria-hidden="true">
      <path fill="#ff4fa3" d="M50 110c0-40 30-90 80-90s80 50 80 90v150c0 25-20 45-45 45H95c-25 0-45-20-45-45V110z" />
      <path fill="#5a55e6" d="M60 120c0-35 28-80 70-80s70 45 70 80v20H60v-20z" />
      <path fill="#4a43c9" d="M110 40h40c8 0 12 10 12 20v10H98V60c0-10 4-20 12-20z" />
      <path fill="#7a72ff" d="M60 180h140v75c0 20-15 35-35 35H95c-20 0-35-15-35-35v-75z" />
      <path fill="#ff4fa3" d="M60 180h140v25H60v-25z" />
      <path fill="none" stroke="#3a33a8" strokeWidth="3" d="M60 205h140" />
      <path fill="#5850e6" d="M50 130c-10 5-20 25-20 45s10 40 20 45v-90zm160 0c10 5 20 25 20 45s-10 40-20 45v-90z" />
      <ellipse cx="130" cy="290" rx="90" ry="18" fill="#3b36a6" opacity=".35" />
      <path fill="#8a83ff" d="M80 230h100v30H80v-30z" />
      <path fill="none" stroke="#363092" strokeWidth="3" d="M80 245h100" />
    </svg>
  )
}

function SortStackIcon({ ascending }) {
  return <SortDirectionIcon ascending={ascending} />
}

function normalizeInventoryItem(row, index) {
  const imageUrl = row?.image_url || row?.image || row?.thumbnail_url || '/ps99-cat.png'
  return {
    ...row,
    id: String(row?.id || row?.uuid || `inventory-${index}`),
    sourceId: String(row?.item_id || row?.catalog_item_id || row?.id || ''),
    name: String(row?.name || row?.item_name || 'Unknown Item'),
    image: imageUrl,
    image_url: imageUrl,
    value: Math.max(0, Number(row?.value || 0)),
    copies: 1,
    copyIndex: index,
  }
}

function FairnessShieldIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="#00e284" width="14" height="14" viewBox="0 0 347.971 347.971" aria-hidden="true">
      <path d="M317.309,54.367C257.933,54.367,212.445,37.403,173.98,0C135.519,37.403,90.033,54.367,30.662,54.367 c0,97.405-20.155,236.937,143.317,293.604C337.463,291.305,317.309,151.773,317.309,54.367z M162.107,225.773l-47.749-47.756 l21.379-21.378l26.37,26.376l50.121-50.122l21.378,21.378L162.107,225.773z" />
    </svg>
  )
}

function CopySeedIcon({ label, value }) {
  const copyValue = async () => {
    if (!value || value === 'Unavailable' || value === 'Loading...') return
    try {
      await navigator.clipboard.writeText(String(value))
      notifications.success(`${label} copied to clipboard!`)
    } catch {
      notifications.error('Unable to copy to clipboard.')
    }
  }

  return (
    <button className="upgrader-fairness-copy-icon" type="button" aria-label={label} onClick={() => { void copyValue() }}>
      <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    </button>
  )
}

function randomString(length, alphabet) {
  const bytes = new Uint32Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('')
}

function ModalInventoryItemCard({ item, selected, onClick }) {
  return <InventoryItemCard item={item} selected={selected} onToggleSelect={onClick} />
}

function InventoryModal({ initialItems, inventoryItems, loading, error, onClose, onConfirm }) {
  const [search, setSearch] = useState('')
  const [sortAscending, setSortAscending] = useState(false)
  const [chosen, setChosen] = useState(() => new Set(initialItems.map((item) => item.id)))
  const selected = inventoryItems.filter((item) => chosen.has(item.id)).sort((a, b) => b.value - a.value)
  const selectedValue = selected.reduce((total, item) => total + item.value, 0)
  const inventoryValue = inventoryItems.reduce((total, item) => total + item.value, 0)
  const inventoryCount = inventoryItems.length
  const allItemsSelected = inventoryCount > 0 && inventoryItems.every((item) => chosen.has(item.id))
  const filtered = inventoryItems
    .filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => {
      const aSelected = chosen.has(a.id)
      const bSelected = chosen.has(b.id)
      if (aSelected !== bSelected) return aSelected ? -1 : 1
      const valueOrder = sortAscending ? a.value - b.value : b.value - a.value
      return valueOrder || a.copyIndex - b.copyIndex
    })

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const toggleItem = (item) => {
    setChosen((current) => {
      const next = new Set(current)
      if (next.has(item.id)) next.delete(item.id)
      else next.add(item.id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setChosen(allItemsSelected ? new Set() : new Set(inventoryItems.map((item) => item.id)))
  }

  return createPortal(
    <div className="upgrader-inventory-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="upgrader-inventory-modal" role="dialog" aria-modal="true" aria-label="Select inventory items">
        <button type="button" className="upgrader-inventory-close" onClick={onClose} aria-label="Close">×</button>

        <div className="upgrader-inventory-header">
          <div className="upgrader-inventory-controls">
            <label className="upgrader-inventory-search">
              <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search for an item..." />
              <Search aria-hidden="true" />
            </label>
            <button
              type="button"
              className="upgrader-secondary-btn upgrader-inventory-sort"
              aria-label={sortAscending ? 'Sort highest to lowest' : 'Sort lowest to highest'}
              title={sortAscending ? 'Lowest to Highest' : 'Highest to Lowest'}
              onClick={() => setSortAscending((current) => !current)}
            >
              <SortStackIcon ascending={sortAscending} />
            </button>
          </div>
        </div>

        <div className="upgrader-inventory-items-wrap">
          <div className="upgrader-inventory-stats">
            <div className="upgrader-inventory-stat-item">
              <img src={COIN_ICON} alt="" />
              <div><span>VALUE</span><strong>{formatValue(inventoryValue)}</strong></div>
            </div>
            <div className="upgrader-inventory-stat-item">
              <InventoryBagIcon />
              <div><span>ITEMS</span><strong>{formatValue(inventoryCount)}</strong></div>
            </div>
          </div>

          <div className="upgrader-inventory-grid">
            {loading ? (
              <div className="upgrader-inventory-empty">
                <h1>Loading...</h1>
                <p>Fetching your inventory...</p>
              </div>
            ) : error ? (
              <div className="upgrader-inventory-empty">
                <h1>Couldn't load inventory</h1>
                <p>{error}</p>
              </div>
            ) : filtered.length ? filtered.map((item) => (
              <ModalInventoryItemCard key={item.id} item={item} selected={chosen.has(item.id)} onClick={() => toggleItem(item)} />
            )) : (
              <div className="upgrader-inventory-empty">
                <h1>No items!</h1>
                <p>No items found in inventory.</p>
              </div>
            )}
          </div>
        </div>

        <div className="upgrader-inventory-actions">
          <button
            type="button"
            className="upgrader-secondary-btn upgrader-inventory-select-all"
            aria-label={allItemsSelected ? 'Unselect all items' : 'Select all items'}
            disabled={loading || Boolean(error) || !inventoryCount}
            onClick={toggleSelectAll}
          >
            {allItemsSelected ? 'Unselect All' : 'Select all'}
          </button>
          <button type="button" className="upgrader-primary-btn upgrader-inventory-add" disabled={!selected.length} onClick={() => onConfirm(selected)}>
            {selected.length ? (
              <span className="upgrader-inventory-confirm-label">
                Confirm ({selected.length})┃
                <span className="upgrader-inventory-confirm-value">
                  <img src={COIN_ICON} alt="" />
                  <span>{formatValue(selectedValue)}</span>
                </span>
              </span>
            ) : 'Select items to continue'}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}

export function FairnessModal({ onClose, gameActive = false }) {
  const [activeFairnessTab, setActiveFairnessTab] = useState('coinflip')
  const [eosBlockNumber, setEosBlockNumber] = useState('')
  const [coinflipServerSeed, setCoinflipServerSeed] = useState('')
  const [starterTotalValue, setStarterTotalValue] = useState('')
  const [joinerTotalValue, setJoinerTotalValue] = useState('')
  const [validationMessage, setValidationMessage] = useState('')
  const [showCode, setShowCode] = useState(false)
  const [clientSeed, setClientSeed] = useState('')
  const [hashedServerSeed, setHashedServerSeed] = useState('Loading...')
  const [nonce, setNonce] = useState(0)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [previousSeed, setPreviousSeed] = useState(null)
  const [closing, setClosing] = useState(false)
  const closeTimerRef = useRef(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  const requestClose = useCallback(() => {
    if (closeTimerRef.current) return
    setClosing(true)
    closeTimerRef.current = window.setTimeout(() => onCloseRef.current(), 220)
  }, [])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') requestClose()
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    }
  }, [requestClose])

  useEffect(() => {
    if (activeFairnessTab !== 'upgrader') return undefined
    let cancelled = false
    apiRequest('/api/upgrader/fairness')
      .then((response) => {
        if (cancelled) return
        setClientSeed(response?.fairness?.client_seed || '')
        setHashedServerSeed(response?.fairness?.server_seed_hash || 'Unavailable')
        setNonce(Number(response?.fairness?.nonce || 0))
        if (response?.fairness?.previous_server_seed) {
          setPreviousSeed({
            serverSeed: response.fairness.previous_server_seed,
            serverSeedHash: response.fairness.previous_server_seed_hash,
            clientSeed: response.fairness.previous_client_seed,
            nonce: Number(response.fairness.previous_nonce || 0),
            roll: response.fairness.previous_roll,
          })
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setHashedServerSeed('Unavailable')
          notifications.error(error?.message || 'Unable to load Upgrader fairness.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [activeFairnessTab])

  const randomizeClientSeed = () => {
    setClientSeed(randomString(12, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'))
  }

  const rotateServerSeed = async () => {
    if (!clientSeed.trim() || saving || loading || gameActive) return
    setSaving(true)
    try {
      const response = await apiRequest('/api/upgrader/fairness/rotate', {
        method: 'POST',
        body: JSON.stringify({ client_seed: clientSeed.trim() }),
      })
      setClientSeed(response?.fairness?.client_seed || clientSeed.trim())
      setHashedServerSeed(response?.fairness?.server_seed_hash || 'Unavailable')
      setNonce(Number(response?.fairness?.nonce || 0))
      setPreviousSeed({
        serverSeed: response?.fairness?.previous_server_seed,
        serverSeedHash: response?.fairness?.previous_server_seed_hash,
        clientSeed: response?.fairness?.previous_client_seed,
        nonce: Number(response?.fairness?.previous_nonce || 0),
        roll: null,
      })
      notifications.success('Upgrader fairness seed changed.')
    } catch (error) {
      notifications.error(error?.message || 'Unable to change Upgrader fairness seed.')
    } finally {
      setSaving(false)
    }
  }

  const validateCoinflip = () => {
    if (!eosBlockNumber.trim() || !coinflipServerSeed.trim() || !starterTotalValue.trim() || !joinerTotalValue.trim()) {
      setValidationMessage('Please complete all fields to validate fairness.')
      return
    }
    setValidationMessage('Fairness inputs are ready to validate.')
  }

  return createPortal(
    <div className={`upgrader-fairness-overlay${closing ? ' is-closing' : ''}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose() }}>
      <style>{UPGRADER_CSS}</style>
      <section className={`upgrader-fairness-modal${closing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="upgrader-fairness-title" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="upgrader-fairness-title" className="upgrader-fairness-header">Fairness</h2>
        <p className="upgrader-fairness-hint">Our Provably Fair system works by generating a completely random seed on our server which is then combined with a block ID from the EOS blockchain that is not known before the game starts and used to determine the winning ticket in a game. This design doesn't allow anyone to predict the outcome of a game</p>

        <div className="upgrader-fairness-tabs" role="tablist" aria-label="Fairness game">
          <button type="button" role="tab" aria-selected={activeFairnessTab === 'coinflip'} data-state={activeFairnessTab === 'coinflip' ? 'active' : 'inactive'} onClick={() => setActiveFairnessTab('coinflip')}>Coinflip</button>
          <button type="button" role="tab" aria-selected={activeFairnessTab === 'upgrader'} data-state={activeFairnessTab === 'upgrader' ? 'active' : 'inactive'} onClick={() => setActiveFairnessTab('upgrader')}>Upgrader</button>
        </div>

        {activeFairnessTab === 'coinflip' ? (
          <div className="upgrader-fairness-panel" role="tabpanel">
            <div className="upgrader-fairness-form">
              <div><label className="upgrader-fairness-section-title" htmlFor="eos-block-number">EOS Block Number</label><input id="eos-block-number" className="upgrader-fairness-field has-help" value={eosBlockNumber} onChange={(event) => setEosBlockNumber(event.target.value)} /><blockquote className="upgrader-fairness-blockchain-note">You can view the EOS blockchain by visiting your favorite EOS blockchain viewer, such as <a target="_blank" rel="noreferrer" href="https://eosflare.io/">https://eosflare.io</a> or <a target="_blank" rel="noreferrer" href="https://eosauthority.com/">https://eosauthority.com</a> in order to validate that the ID that we gave you is legitimate</blockquote></div>
              <div><label className="upgrader-fairness-section-title" htmlFor="server-seed">Server Seed</label><input id="server-seed" className="upgrader-fairness-field" value={coinflipServerSeed} onChange={(event) => setCoinflipServerSeed(event.target.value)} /></div>
              <div className="upgrader-fairness-value-pair"><div><label className="upgrader-fairness-section-title" htmlFor="starter-total-value">Starter Total Value</label><input id="starter-total-value" className="upgrader-fairness-field" value={starterTotalValue} onChange={(event) => setStarterTotalValue(event.target.value)} /></div><div><label className="upgrader-fairness-section-title" htmlFor="joiner-total-value">Joiner Total Value</label><input id="joiner-total-value" className="upgrader-fairness-field" value={joinerTotalValue} onChange={(event) => setJoinerTotalValue(event.target.value)} /></div></div>
            </div>
            <div className="upgrader-fairness-validation-message">{validationMessage}</div>
            <button type="button" className="upgrader-fairness-validate" onClick={validateCoinflip}>Validate Fairness</button>
            <div><button type="button" className="upgrader-fairness-show-code" onClick={() => setShowCode((visible) => !visible)}>{showCode ? 'Hide Code' : 'Show Code'}</button></div>
            {showCode ? <pre className="upgrader-fairness-code">winningTicket = hash(serverSeed + eosBlockId) % totalValue</pre> : null}
          </div>
        ) : (
          <div className="upgrader-fairness-panel" role="tabpanel">
            <div className="upgrader-fairness-form">
              <div><span className="upgrader-fairness-section-title">Hashed Server Seed</span><div className="upgrader-fairness-input-holder"><span className="upgrader-fairness-value" title={hashedServerSeed}>{hashedServerSeed}</span><CopySeedIcon label="Hashed Server Seed" value={hashedServerSeed} /></div></div>
              <div><label className="upgrader-fairness-section-title" htmlFor="upgrader-client-seed">Client Seed</label><div className="upgrader-fairness-seed-row"><input id="upgrader-client-seed" type="text" className="upgrader-fairness-field" maxLength="128" autoComplete="off" spellCheck="false" disabled={loading || saving || gameActive} value={clientSeed} onChange={(event) => setClientSeed(event.target.value)} /><button type="button" className="upgrader-fairness-random" disabled={loading || saving || gameActive} onClick={randomizeClientSeed}>Random</button></div></div>
              <div><span className="upgrader-fairness-section-title">Nonce</span><div className="upgrader-fairness-input-holder"><span className="upgrader-fairness-value">{nonce}</span><CopySeedIcon label="Nonce" value={nonce} /></div></div>
            </div>
            <button type="button" className="upgrader-fairness-validate" disabled={loading || saving || gameActive || !clientSeed.trim()} onClick={rotateServerSeed}>{saving ? 'Changing Seed...' : 'Change Seed'}</button>
            {previousSeed?.serverSeed ? <div className="upgrader-fairness-reveal-box"><span className="upgrader-fairness-reveal-title">Previous Server Seed</span><div className="upgrader-fairness-input-holder upgrader-fairness-reveal-value"><span className="upgrader-fairness-value" title={previousSeed.serverSeed}>{previousSeed.serverSeed}</span><CopySeedIcon label="Previous Server Seed" value={previousSeed.serverSeed} /></div><div className="upgrader-fairness-reveal-meta"><span>Client Seed: <b>{previousSeed.clientSeed || 'Unavailable'}</b></span><span>Nonce: <b>{previousSeed.nonce}</b></span></div></div> : null}
          </div>
        )}

        <button className="upgrader-fairness-close" type="button" onClick={requestClose} aria-label="Close Fairness"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg><span>Close</span></button>
      </section>
    </div>,
    document.body,
  )
}

const UPGRADER_CSS = `
${inventoryItemCardStyles}
.upgrader-page {
  --accent: #ff4fa3;
  --accent-light: #ff69b0;
  --accent-dark: #f43f8f;
  --accent-gradient: linear-gradient(180deg, var(--accent-light) 0%, var(--accent) 45%, var(--accent-dark) 100%);
  --danger: #ff4d4d;
  --danger-light: #ff6b6b;
  --danger-dark: #e03131;
  --danger-gradient: linear-gradient(180deg, var(--danger-light) 0%, var(--danger) 45%, var(--danger-dark) 100%);
  --success: #22c55e;
  --success-light: #4ade80;
  --success-dark: #16a34a;
  --success-gradient: linear-gradient(180deg, var(--success-light) 0%, var(--success) 45%, var(--success-dark) 100%);
  --surface-1: #1c1f2e;
  --surface-2: #1f2335;
  --btn-secondary-bg: #2a3048;
  --btn-secondary-hover: #32385a;
  --btn-height: 42px;
  --radius-sm: 8px;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  position: relative;
  container-type: inline-size;
  padding: 24px 32px 80px;
  color: #e2e8f0;
  animation: upgrader-fade-in .35s ease-out both;
}
.upgrader-page button, .upgrader-page input { font-family: Poppins, sans-serif; }
.upgrader-arena {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) 280px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
  height: 560px;
  min-height: 560px;
  max-height: 560px;
  margin-bottom: 32px;
}
.upgrader-left-panel, .upgrader-target-panel {
  min-width: 0;
  height: 560px;
  max-height: 560px;
  box-sizing: border-box;
  border: 1px solid #1e2235;
  border-radius: 10px;
  background: #171925;
}
.upgrader-left-panel { display: flex; flex-direction: column; gap: 12px; padding: 18px; overflow: visible; }
.upgrader-panel-head { display: flex; align-items: center; justify-content: space-between; min-height: 16px; }
.upgrader-panel-label { color: rgba(255,255,255,.3); font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.upgrader-selected-value { display: flex; align-items: center; gap: 4px; color: #fff; font-size: 13px; font-weight: 700; }
.upgrader-selected-value .upgrader-coin-value { font-size: 13px; font-weight: 700; }
.upgrader-selected-value .upgrader-coin-value img { width: 13px; height: 13px; margin-right: 4px; }
.upgrader-items-wrapper { position: relative; flex: 1; min-height: 0; overflow-x: hidden; overflow-y: auto; padding: 8px; border-radius: 6px; background: #1c1f2e; }
.upgrader-items-wrapper::-webkit-scrollbar { width: 4px; }
.upgrader-items-wrapper::-webkit-scrollbar-thumb { border-radius: 4px; background: #252839; }
.upgrader-inventory-selected-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(130px,1fr)); gap: 8px; }
.upgrader-empty-state { display: flex; width: 100%; min-height: 100px; height: 100%; flex-direction: column; align-items: center; justify-content: center; padding: 20px 0; color: #374151; text-align: center; font-size: 13px; font-weight: 600; }
.upgrader-empty-state p + p { margin-top: 4px; font-size: 11px; }
.upgrader-primary-btn, .upgrader-secondary-btn {
  position: relative;
  display: flex;
  min-width: 120px;
  height: var(--btn-height);
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
  padding: 0 20px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: #fff;
  font-size: .9rem;
  font-weight: 600;
  cursor: pointer;
  transform-origin: center;
  line-height: 1;
  transition: transform .13s cubic-bezier(.22,1,.36,1), filter .14s ease, opacity .14s ease, background .2s ease, border-color .2s ease;
}
.upgrader-primary-btn { border-color: rgba(255,79,163,.4); background: linear-gradient(135deg,#ff4fa3,#f43f8f); box-shadow: 0 2px 8px rgba(255,79,163,.2); }
.upgrader-secondary-btn { border-color: transparent; background: #2a2e44; color: #e1e4f2; box-shadow: none; }
.upgrader-primary-btn:hover:not(:disabled) { background: linear-gradient(135deg,#ff4fa3,#f43f8f); }
.upgrader-secondary-btn:hover:not(:disabled) { background: var(--btn-secondary-hover); color: #fff; }
.upgrader-primary-btn:active:not(:disabled), .upgrader-secondary-btn:active:not(:disabled) { transform: scale(.98); }
.upgrader-primary-btn:focus-visible, .upgrader-secondary-btn:focus-visible { outline: 2px solid var(--accent-light); outline-offset: 2px; }
.upgrader-primary-btn:disabled, .upgrader-secondary-btn:disabled { opacity: .6; cursor: not-allowed; filter: none; transform: none; }
.upgrader-open-inventory { width: 100%; min-width: 0; flex-shrink: 0; padding: 0 14px; }
.upgrader-center-panel { display: flex; min-width: 0; height: 100%; box-sizing: border-box; flex-direction: column; align-items: center; justify-content: flex-start; gap: 0; padding: 20px 8px; }
.upgrader-wheel-tabs { display: flex; gap: 4px; padding: 4px; border-radius: 8px; background: #131520; }
.upgrader-wheel-tab { min-height: 34px; padding: 6px 20px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: #6c7399; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: transform .13s cubic-bezier(.22,1,.36,1),color .1s,border-color .1s; }
.upgrader-wheel-tab:hover:not(:disabled) { background: #25293d; color: #e1e4f2; }
.upgrader-wheel-tab:active:not(:disabled) { transform: scale(.98); }
.upgrader-wheel-tab:focus-visible { outline: 2px solid var(--accent-light); outline-offset: 2px; }
.upgrader-wheel-tab:disabled { opacity: .6; cursor: not-allowed; }
.upgrader-wheel-tab.is-active { border-color: rgba(255,79,163,.4); background: linear-gradient(135deg,#ff4fa3,#f43f8f); color: #fff; box-shadow: 0 2px 8px rgba(255,79,163,.18); }
.upgrader-wheel-tab.is-active:hover:not(:disabled) { border-color: rgba(255,79,163,.4); background: linear-gradient(135deg,#ff4fa3,#f43f8f); color: #fff; }
.upgrader-wheel-wrap { display: flex; width: 100%; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 16px 0; }
.upgrader-wheel-circle { position: relative; display: flex; width: 220px; height: 220px; align-items: center; justify-content: center; border-radius: 50%; background: radial-gradient(100% 100% at 50% 100%,var(--wheel-glow,rgba(104,84,224,.1)) 0,transparent 80%); transition: background .6s; }
.upgrader-wheel-ring { position: absolute; z-index: 6; top: -3%; left: -3%; width: 106%; height: 106%; }
.upgrader-wheel-zone { pointer-events: none; }
.upgrader-wheel-hit-area { cursor: grab; pointer-events: stroke; touch-action: none; }
.upgrader-wheel-hit-area:active { cursor: grabbing; }
.upgrader-wheel-arrow { position: absolute; z-index: 7; top: 0; left: calc(50% - 11px); display: flex; width: 22px; height: 110px; align-items: flex-start; justify-content: center; padding-top: 10px; transform-origin: center 110px; pointer-events: none; }
.upgrader-wheel-center { position: relative; z-index: 6; display: flex; flex-direction: column; align-items: center; gap: 2px; transition: all .7s; }
.upgrader-wheel-pct { color: #fff; font-size: 26px; font-weight: 700; line-height: 1; cursor: default; }
.upgrader-wheel-pct.is-empty { color: #4b5563; font-size: 18px; }
.upgrader-wheel-label { color: #6b7280; font-size: 13px; font-weight: 500; letter-spacing: .04em; text-transform: uppercase; cursor: default; }
.upgrader-wheel-percent { color: var(--accent); }
.upgrader-fairness-btn { display: inline-flex; height: 34px; align-items: center; justify-content: center; gap: 6px; padding: 0 12px; border: none; border-radius: 6px; outline: none; background: transparent; color: rgba(255,255,255,.75); font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: color .15s ease; }
.upgrader-fairness-btn:hover { color: #fff; }
.upgrader-fairness-btn svg { flex-shrink: 0; }
.upgrader-upgrade-wrap { width: 100%; margin-top: auto; padding-top: 8px; }
.upgrader-upgrade-btn { width: 100%; min-width: 0; padding: 0; font-size: 15px; }
.upgrader-roll-modes { display: flex; width: 100%; gap: 8px; margin-top: 8px; }
.upgrader-roll-mode { flex: 1; min-width: 0; height: 36px; padding: 0; font-size: 13px; transition: transform .13s cubic-bezier(.22,1,.36,1),color .1s,border-color .1s,opacity .14s; }
.upgrader-roll-mode.is-active { border-color: rgba(255,79,163,.4); background: linear-gradient(135deg,#ff4fa3,#f43f8f); color: #fff; box-shadow: 0 2px 8px rgba(255,79,163,.18); }
.upgrader-roll-mode.is-active:hover:not(:disabled) { border-color: rgba(255,79,163,.4); background: linear-gradient(135deg,#ff4fa3,#f43f8f); color: #fff; }
.upgrader-target-panel { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; cursor: default; }
.upgrader-target-blob { position: absolute; z-index: 1; top: 50%; left: 50%; width: 320px; height: 260px; border-radius: 50%; background: radial-gradient(ellipse at center,var(--target-glow,rgba(255,79,163,.18)) 0%,transparent 70%); filter: blur(32px); opacity: 1; transform: translate(-50%,-50%); pointer-events: none; transition: background 1.2s ease,opacity .8s ease; }
.upgrader-target-empty { position: relative; z-index: 10; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 24px; }
.upgrader-target-empty p { color: #6b7280; font-size: 12px; font-weight: 500; letter-spacing: .04em; text-align: center; text-transform: uppercase; cursor: default; }
.upgrader-target-content { position: relative; z-index: 10; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 24px; }
.upgrader-target-arrows { position: absolute; z-index: 2; inset: 0; pointer-events: none; }
.upgrader-floating-arrow { pointer-events: none; animation: upgrader-arrow-popup .3s cubic-bezier(.22,1,.36,1) both,upgrader-arrow-float 3s ease-in-out infinite,upgrader-arrow-pulse 2s cubic-bezier(.4,0,.6,1) infinite; animation-delay: 0ms,var(--upgrader-arrow-delay),var(--upgrader-arrow-delay); }
.upgrader-floating-arrow.is-top-left { top: 15%; left: 16%; }
.upgrader-floating-arrow.is-bottom-left { bottom: 18%; left: 22%; }
.upgrader-floating-arrow.is-top-right { top: 38%; right: 14%; }
.upgrader-floating-arrow.is-top-right svg { rotate: 90deg !important; }
.upgrader-target-grid { --target-thumb-size: 60px; display: grid; flex-shrink: 0; gap: 6px; width: max-content; transition: width .2s ease,height .2s ease; }
.upgrader-target-thumb { position: relative; width: 60px; height: 60px; min-width: 60px; min-height: 60px; box-sizing: border-box; flex-shrink: 0; overflow: hidden; border: 2px solid #2f3347; border-radius: 6px; background: #171925; cursor: pointer; transition: border-color .2s,transform .15s; }
.upgrader-target-thumb:hover { border-color: #ef4444; transform: translateY(-1px); }
.upgrader-target-thumb:hover::after { position: absolute; z-index: 3; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(239,68,68,.45); color: #fff; content: '✕'; font-size: 18px; font-weight: 700; pointer-events: none; }
.upgrader-target-thumb img { display: block; width: 100%; height: 100%; object-fit: contain; transform: scale(1.1); }
.upgrader-target-overflow { position: absolute; z-index: 2; inset: 0; display: grid; place-items: center; background: rgba(23,25,37,.82); backdrop-filter: blur(2px); color: #fff; font-size: 14px; font-weight: 600; pointer-events: none; }
.upgrader-target-summary { width: 90%; text-align: center; }
.upgrader-target-name { max-width: 220px; overflow: hidden; color: #ccd9fa; font-size: 13px; font-weight: 600; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
.upgrader-target-value { display: flex; align-items: center; justify-content: center; gap: 6px; color: #fff; font-size: 13px; font-weight: 600; }
.upgrader-clear-target { position: relative; z-index: 2; min-width: 0; height: 30px; margin-top: 4px; padding: 0 14px; font-size: 11px; }
.upgrader-danger-btn { border-color: rgba(255,77,77,.42); background: var(--danger-gradient); box-shadow: 0 2px 8px rgba(255,77,77,.18); }
.upgrader-danger-btn:hover:not(:disabled) { background: linear-gradient(135deg,#ff6b6b,#e03131); }
.upgrader-pool-section { margin-top: 8px; }
.upgrader-pool-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.upgrader-pool-title { color: #e1e4f2; font-size: 16px; font-weight: 700; }
.upgrader-pool-count { flex-shrink: 0; padding: 2px 8px; border-radius: 20px; background: #1a1d2b; color: #4b5563; font-size: 11px; font-weight: 600; }
.upgrader-target-count { color: rgba(225,228,242,.6); }
.upgrader-pool-spacer { flex: 1; }
.upgrader-search-wrap { position: relative; display: flex; min-width: 200px; flex: 1; }
.upgrader-search-wrap input, .upgrader-amount-input { width: 100%; height: var(--btn-height); box-sizing: border-box; padding: 0 14px 0 34px; border: none; border-radius: var(--radius-sm); outline: none; background: var(--surface-1); color: #fff; font-size: 13px; font-weight: 500; }
.upgrader-search-wrap input::placeholder, .upgrader-amount-input::placeholder { color: rgba(225,228,242,.45); }
.upgrader-search-wrap svg, .upgrader-amount-icon { position: absolute; top: 50%; left: 10px; width: 15px; height: 15px; opacity: .5; transform: translateY(-50%); pointer-events: none; }
.upgrader-pool-items { height: auto; min-height: 0; margin-top: 10px; overflow: visible; padding: 8px; border-radius: 6px; background: transparent; }
.upgrader-pool-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(150px,1fr)); gap: 8px; }
.upgrader-item-card { --pool-border-bottom: rgba(54,123,255,.7); --pool-border-side: rgba(54,123,255,.25); --pool-dot-color: rgba(54,123,255,1); --pool-indicator-color: rgba(54,123,255,1); position: relative; display: flex; height: auto; min-height: 164px; box-sizing: border-box; flex: 0 0 auto; flex-direction: column; justify-content: flex-start; overflow: visible; padding: 7px; border: none; border-radius: 6px; outline: none; color: inherit; text-align: inherit; cursor: pointer; transition: transform .2s ease,box-shadow .2s ease,background .2s ease,filter .15s ease; }
.upgrader-item-card::before { position: absolute; z-index: 0; inset: 0; padding: 2px; border-radius: 6px; background: linear-gradient(to bottom,transparent 0%,var(--pool-border-side) 55%,var(--pool-border-bottom) 100%); content: ''; pointer-events: none; -webkit-mask: linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask: linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0); mask-composite: exclude; }
.upgrader-item-card:hover { transform: scale(1.03); filter: brightness(1.04); }
.upgrader-item-card.is-selected { transform: scale(1.03); }
.upgrader-item-card.is-selected::after { position: absolute; z-index: 2; top: 10px; right: 10px; width: 10px; height: 10px; border-radius: 30%; background: var(--pool-dot-color); content: ''; pointer-events: none; }
.upgrader-pool-item-card { height: 170px; min-height: 170px; overflow: hidden; }
.upgrader-item-card.is-pool-selected { transform: scale(1.01); }
.upgrader-pool-selection-glow { position: absolute; z-index: 0; inset: 0; border-radius: 6px; background: linear-gradient(to top,var(--pool-selected-glow,rgba(54,123,255,.17)) 0%,transparent 100%); opacity: 0; pointer-events: none; transition: opacity .25s ease; }
.upgrader-item-card.is-pool-selected .upgrader-pool-selection-glow { opacity: 1; }
.upgrader-pool-selection-dot { position: absolute; z-index: 3; top: 10px; right: 10px; width: 10px; height: 10px; border-radius: 30%; background: var(--pool-dot-color); opacity: 0; transform: scale(.7); transform-origin: center; pointer-events: none; transition: opacity .25s ease,transform .25s ease; }
.upgrader-item-card.is-pool-selected .upgrader-pool-selection-dot { opacity: 1; transform: scale(1); }
.upgrader-item-card.is-compact { width: 100%; height: 180px; min-width: 0; min-height: 180px; flex: 0 0 auto; justify-content: flex-start; overflow: visible; padding: 8px; }
.upgrader-image-wrap { position: relative; width: 100%; height: 112px; flex: 0 0 112px; overflow: hidden; border-radius: 8px; }
.upgrader-item-card.is-compact .upgrader-image-wrap { height: 125px; flex: 0 0 125px; }
.upgrader-item-image { position: absolute; z-index: 1; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px; object-fit: contain; }
.upgrader-item-blur { position: absolute; z-index: 0; top: 50%; left: 50%; width: 80%; height: 80%; border-radius: 8px; object-fit: contain; opacity: .35; filter: blur(18px); transform: translate(-50%,-60%); pointer-events: none; }
.upgrader-item-details { position: relative; z-index: 2; display: flex; width: 100%; height: 34px; min-height: 34px; flex: 0 0 34px; flex-direction: column; align-items: center; justify-content: center; gap: 2px; overflow: hidden; margin-top: 4px; text-align: center; }
.upgrader-item-card.is-pool-selected .upgrader-item-details { position: absolute; z-index: 2; right: 8px; bottom: 4px; left: 8px; width: auto; margin-top: 0; }
.upgrader-item-name { display: block; width: 100%; max-width: 100%; margin: 0; overflow: hidden; color: #ccd9fa; font-size: 11px; font-weight: 600; line-height: 13px; text-overflow: ellipsis; white-space: nowrap; }
.upgrader-coin-value { display: inline-flex; align-items: center; justify-content: center; color: #fff; font-size: 13px; font-weight: 600; white-space: nowrap; }
.upgrader-coin-value img { width: 15px; height: 15px; flex-shrink: 0; margin-right: 5px; object-fit: contain; }
.upgrader-item-details .upgrader-coin-value { width: 100%; max-width: 100%; min-width: 0; overflow: hidden; font-size: 12px; line-height: 14px; }
.upgrader-item-details .upgrader-coin-value img { width: 13px; height: 13px; margin-right: 5px; }
.upgrader-item-details .upgrader-coin-value > span { display: inline-block; min-width: 0; overflow: hidden; font-size: 12px; line-height: 14px; text-overflow: ellipsis; white-space: nowrap; }
.upgrader-item-card.is-compact .upgrader-item-details { display: flex; height: 34px; min-height: 34px; flex: 0 0 34px; overflow: hidden; margin-top: 4px; }
.upgrader-item-card.is-compact .upgrader-item-name { font-size: 12px; line-height: 13px; }
.upgrader-item-card.is-compact .upgrader-coin-value { font-size: 13px; line-height: 14px; }
.upgrader-item-card.is-compact .upgrader-coin-value img { width: 13px; height: 13px; margin-right: 4px; }
.upgrader-item-card.is-compact .upgrader-coin-value > span { font-size: 13px; line-height: 14px; }
.upgrader-copy-badge { position: absolute; z-index: 3; top: 4px; right: 4px; padding: 3px 8px; border-radius: 6px; background: #20222f; color: #fff; font-size: 11px; font-weight: 700; pointer-events: none; }
.upgrader-pool-default-details { display: flex; width: 100%; flex-direction: column; align-items: center; justify-content: center; gap: 2px; animation: upgrader-selection-content-in .22s ease both; }
.upgrader-qty-wrap { display: flex; width: 100%; box-sizing: border-box; align-items: center; justify-content: center; gap: 8px; padding: 4px; margin: 0 auto; animation: upgrader-selection-content-in .22s ease both; }
.upgrader-qty-minus, .upgrader-qty-plus { display: flex; width: 28px; height: 28px; flex-shrink: 0; align-items: center; justify-content: center; padding: 0; border: none; border-radius: 4px; color: #fff; font-size: 14px; cursor: pointer; }
.upgrader-qty-minus { background: #ef4444; }
.upgrader-qty-plus { background: #10b981; }
.upgrader-qty-minus svg, .upgrader-qty-plus svg { width: 1em; height: 1em; }
.upgrader-qty-minus:disabled, .upgrader-qty-plus:disabled { opacity: .55; cursor: not-allowed; }
.upgrader-qty-input { width: 50px; box-sizing: border-box; padding: 4px; border: none; border-radius: 4px; outline: none; background: #1c1f2e; color: #fff; font-size: .85rem; text-align: center; }
.upgrader-qty-input::-webkit-outer-spin-button, .upgrader-qty-input::-webkit-inner-spin-button { margin: 0; -webkit-appearance: none; }
.upgrader-qty-input[type=number] { -moz-appearance: textfield; }
@keyframes upgrader-selection-content-in { from { opacity: 0; transform: translateY(4px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
.upgrader-coin-wrap { display: flex; min-height: 0; flex: 1; flex-direction: column; align-items: stretch; justify-content: center; gap: 12px; }
.upgrader-coin-controls { display: flex; flex-direction: column; gap: 12px; padding: 14px; border-radius: 8px; background: var(--surface-1); }
.upgrader-amount-wrap { position: relative; display: flex; flex-grow: 1; width: 100%; }
.upgrader-amount-input { padding-left: 36px; background: var(--surface-2); text-align: left; }
.upgrader-amount-icon { width: 18px; height: 18px; opacity: 1; object-fit: contain; }
.upgrader-slider-row { display: flex; align-items: center; justify-content: space-between; margin-top: 2px; }
.upgrader-slider-label { color: rgba(255,255,255,.45); font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.upgrader-slider-value { color: #f6f6f6; font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
.upgrader-slider { width: 100%; height: 6px; border-radius: 999px; outline: none; appearance: none; background: linear-gradient(to right,#ff4fa3 0%,#ff4fa3 var(--slider-fill,0%),#2a2e44 var(--slider-fill,0%),#2a2e44 100%); cursor: pointer; }
.upgrader-slider:disabled { opacity: .45; cursor: not-allowed; }
.upgrader-slider::-webkit-slider-thumb { width: 16px; height: 16px; border: 2px solid var(--accent); border-radius: 50%; appearance: none; background: #fff; box-shadow: 0 2px 6px rgba(255,79,163,.4); cursor: pointer; transition: transform .15s; }
.upgrader-slider::-webkit-slider-thumb:hover { transform: scale(1.15); }
.upgrader-quick-row { display: grid; grid-template-columns: repeat(4,1fr); gap: 6px; }
.upgrader-quick-btn { min-width: 0; height: 32px; padding: 0; font-size: 12px; }
.upgrader-inventory-overlay, .upgrader-fairness-overlay {
  --accent: #ff4fa3;
  --accent-light: #ff69b0;
  --accent-dark: #f43f8f;
  --accent-gradient: linear-gradient(180deg,var(--accent-light) 0%,var(--accent) 45%,var(--accent-dark) 100%);
  --surface-1: #1c1f2e;
  --btn-secondary-hover: #32385a;
  --btn-height: 42px;
  --radius-sm: 8px;
  font-family: Poppins,sans-serif;
}
.upgrader-inventory-overlay button, .upgrader-inventory-overlay input, .upgrader-fairness-overlay button, .upgrader-fairness-overlay input { font-family: Poppins,sans-serif; }
.upgrader-inventory-overlay { position: fixed; z-index: 10010; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.5); animation: upgrader-overlay-in .5s ease-out; }
.upgrader-inventory-modal { position: relative; width: 90%; max-width: 1200px; box-sizing: border-box; overflow-y: auto; padding: 15px; border: 1px solid #181a28; border-radius: 10px; background: #131520; color: #fff; animation: upgrader-modal-in .3s forwards; }
.upgrader-inventory-close { position: absolute; z-index: 5; top: 5px; right: 10px; padding: 0; border: none; background: none; color: #fff; font-size: 24px; line-height: 1; opacity: .8; cursor: pointer; transition: opacity .3s ease,transform .2s ease; }
.upgrader-inventory-close:hover { opacity: 1; }
.upgrader-inventory-header { display: flex; width: 100%; align-items: center; justify-content: flex-start; gap: 8px; margin-top: 5px; margin-bottom: 10px; }
.upgrader-inventory-controls { display: inline-flex; align-items: center; gap: 6px; }
.upgrader-inventory-search { position: relative; display: flex; flex-grow: 1; }
.upgrader-inventory-search input { width: 300px; height: 40px; box-sizing: border-box; padding: 10px 18px 10px 42px; border: 2px solid #323240; border-radius: 5px; outline: none; background: var(--surface-1); box-shadow: 0 10px 7.8px rgba(0,0,0,.15); color: #fff; font-size: .9rem; opacity: .9; text-align: left; }
.upgrader-inventory-search input::placeholder { color: #cbd5e1; text-align: left; }
.upgrader-inventory-search svg { position: absolute; top: 50%; left: 15px; width: 20px; height: 20px; color: #727a9b; transform: translateY(-50%); pointer-events: none; }
.upgrader-inventory-sort { width: 40px; height: 40px; min-width: 40px; flex-shrink: 0; padding: 0; border: none; border-radius: 6px; background: #20222f; color: #e1e4f2; box-shadow: none; }
.upgrader-inventory-sort:hover:not(:disabled) { background: #2a2e44; color: #e1e4f2; }
.upgrader-inventory-items-wrap { position: relative; height: 350px; overflow-x: hidden; overflow-y: auto; padding: 12px; margin-top: 15px; border-radius: 6px; background: #1c1f2e; }
.upgrader-inventory-items-wrap::-webkit-scrollbar { width: 4px; }
.upgrader-inventory-items-wrap::-webkit-scrollbar-thumb { border-radius: 4px; background: #30354d; }
.upgrader-inventory-stats { display: flex; align-items: center; gap: 15px; margin-top: -5px; margin-bottom: 12px; }
.upgrader-inventory-stat-item { display: flex; align-items: center; justify-content: flex-start; gap: 6px; }
.upgrader-inventory-stat-item > img, .upgrader-inventory-bag-icon { width: 20px; height: 20px; flex-shrink: 0; object-fit: contain; }
.upgrader-inventory-stat-item > div { display: flex; flex-direction: column; align-items: flex-start; gap: 0; }
.upgrader-inventory-stat-item span { margin-bottom: 2px; color: rgba(255,255,255,.35); font-size: 10px; font-weight: 700; line-height: 1; letter-spacing: .06em; text-transform: uppercase; }
.upgrader-inventory-stat-item strong { color: #f6f6f6; font-size: 17px; font-weight: 700; line-height: 1; }
.upgrader-inventory-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(160px,1fr)); gap: 8px; }
.upgrader-modal-item { position: relative; display: flex; height: auto; min-height: 164px; box-sizing: border-box; flex: 0 0 auto; flex-direction: column; justify-content: flex-start; overflow: visible; padding: 7px; border: none; border-radius: 6px; color: inherit; text-align: inherit; cursor: pointer; transition: transform .2s ease; }
.upgrader-modal-item::before { position: absolute; z-index: 0; inset: 0; padding: 2px; border-radius: 6px; background: linear-gradient(to bottom,transparent 0%,var(--pool-border-side) 55%,var(--pool-border-bottom) 100%); content: ''; pointer-events: none; -webkit-mask: linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask: linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0); mask-composite: exclude; }
.upgrader-modal-item:hover, .upgrader-modal-item.is-selected { transform: scale(1.03); }
.upgrader-modal-item.is-selected::after { position: absolute; z-index: 2; top: 10px; right: 10px; width: 10px; height: 10px; border-radius: 30%; background: var(--pool-dot-color); content: ''; }
.upgrader-modal-item-blur { position: absolute; z-index: 0; top: 50%; left: 50%; width: 80%; height: 80%; opacity: .35; filter: blur(18px); object-fit: contain; pointer-events: none; transform: translate(-50%,-60%); }
.upgrader-modal-item-image-wrap { position: relative; width: 100%; height: 112px; flex: 0 0 112px; overflow: hidden; border-radius: 8px; }
.upgrader-modal-item-image { position: absolute; z-index: 1; inset: 0; width: 100%; height: 100%; border-radius: 8px; object-fit: contain; }
.upgrader-modal-item-details { position: relative; z-index: 2; display: flex; width: 100%; height: 34px; min-width: 0; min-height: 34px; flex: 0 0 34px; flex-direction: column; align-items: center; justify-content: center; gap: 2px; overflow: hidden; margin-top: 4px; text-align: center; }
.upgrader-modal-item-name { display: block; width: 100%; max-width: 100%; overflow: hidden; margin: 0; color: #ccd9fa; font-size: 11px; font-weight: 600; line-height: 13px; text-overflow: ellipsis; white-space: nowrap; }
.upgrader-modal-item-details .upgrader-coin-value { width: 100%; max-width: 100%; min-width: 0; overflow: hidden; font-size: 12px; font-weight: 600; line-height: 14px; }
.upgrader-modal-item-details .upgrader-coin-value img { display: block; width: 13px; height: 13px; flex-shrink: 0; margin-right: 5px; }
.upgrader-modal-item-details .upgrader-coin-value > span { display: inline-block; min-width: 0; overflow: hidden; font-size: 12px; line-height: 14px; text-overflow: ellipsis; white-space: nowrap; }
.upgrader-inventory-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 15px; }
.upgrader-inventory-actions button { position: relative; border-radius: 8px; font-weight: 600; transition: opacity .2s ease,transform .1s ease,background .25s ease; }
.upgrader-inventory-select-all {
  min-width: 140px;
  min-height: 42px;
  flex-shrink: 0;
  padding: 0 16px;
  border: none;
  border-radius: 8px;
  background: #2a2e44;
  color: #e1e4f2;
  box-shadow: none;
  font-size: 14px;
  font-weight: 450;
}
.upgrader-inventory-select-all:hover:not(:disabled) { background: #32385a; color: #e1e4f2; }
.upgrader-inventory-select-all:active:not(:disabled) { transform: scale(.97); }
.upgrader-inventory-add { min-width: 190px; padding: 0 16px; white-space: nowrap; }
.upgrader-inventory-confirm-label { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; line-height: 1; }
.upgrader-inventory-confirm-value { display: inline-flex; align-items: center; line-height: 1; }
.upgrader-inventory-confirm-value img { display: block; width: 15px; height: 15px; flex-shrink: 0; margin-right: 5px; }
.upgrader-inventory-confirm-value span { display: inline-flex; align-items: center; line-height: 1; }
.upgrader-inventory-empty { position: absolute; top: 50%; left: 50%; display: flex; width: 100%; height: 100%; flex-direction: column; align-items: center; justify-content: center; text-align: center; transform: translate(-50%,-50%); }
.upgrader-inventory-empty h1 { margin-bottom: 8px; color: #ddd; font-size: 20px; }
.upgrader-inventory-empty p { margin-bottom: 15px; color: #aaa; }
.upgrader-fairness-overlay { position: fixed; z-index: 2147483100; inset: 0; background: hsl(228 17% 12%/.4); animation: upgrader-overlay-in 150ms ease-out both; transition: opacity 150ms ease; }
.upgrader-fairness-overlay.is-closing { pointer-events: none; animation: upgrader-overlay-out 220ms cubic-bezier(.4,0,1,1) both; }
.upgrader-fairness-modal { position: fixed; top: 50%; left: 50%; display: flex; width: 100%; height: 100dvh; max-width: 768px; box-sizing: border-box; flex-direction: column; gap: 16px; padding: 24px; overflow-y: auto; transform: translate(-50%,-50%); border: 1px solid hsl(231 16% 16%); border-radius: 0; outline: 0; background: hsl(227 17% 11%); color: #fff; box-shadow: 0 10px 15px -3px rgba(0,0,0,.1),0 4px 6px -4px rgba(0,0,0,.1); font-family: Poppins,sans-serif; animation: upgrader-fairness-modal-in 200ms ease-out both; transition: opacity 200ms ease,transform 200ms ease; }
.upgrader-fairness-modal.is-closing { animation: upgrader-fairness-modal-out 220ms cubic-bezier(.4,0,1,1) both; }
.upgrader-fairness-close { position: absolute; top: 16px; right: 16px; padding: 0; border: 0; border-radius: 2px; outline: 0; background: transparent; color: #fff; opacity: .7; cursor: pointer; transition: opacity 150ms ease; }
.upgrader-fairness-close:hover { opacity: 1; }
.upgrader-fairness-close svg { display: block; width: 20px; height: 20px; }
.upgrader-fairness-close span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; }
.upgrader-fairness-header { margin: 0; color: #fff; font-size: 18px; font-weight: 600; line-height: 18px; letter-spacing: -.025em; }
.upgrader-fairness-hint { margin: 0; color: #d1d5db; font-size: 14px; font-weight: 500; line-height: 20px; }
.upgrader-fairness-tabs { display: inline-flex; width: fit-content; height: 40px; align-items: center; justify-content: center; padding: 4px; border-radius: 6px; background: hsl(229 17% 13%); color: rgba(255,255,255,.5); }
.upgrader-fairness-tabs button { display: inline-flex; height: 32px; align-items: center; justify-content: center; padding: 6px 12px; border: 0; border-radius: 2px; outline: 0; background: transparent; color: inherit; font-size: 14px; font-weight: 500; line-height: 20px; white-space: nowrap; cursor: pointer; transition: all 150ms ease; }
.upgrader-fairness-tabs button[data-state=active] { background: hsl(233 16% 22%/.4); color: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.05); }
.upgrader-fairness-panel { margin-top: 8px; outline: 0; }
.upgrader-fairness-form { display: flex; flex-direction: column; gap: 16px; }
.upgrader-fairness-section-title { display: block; margin: 0; color: rgba(255,255,255,.8); font-size: 14px; font-weight: 500; line-height: 14px; }
.upgrader-fairness-field { display: flex; width: 100%; height: 40px; box-sizing: border-box; margin-top: 8px; padding: 8px 12px; border: 2px solid rgba(255,255,255,.05); border-radius: 6px; outline: 0; background: hsl(228 17% 12%); color: #fff; font-size: 14px; transition: border-color 150ms ease; }
.upgrader-fairness-field.has-help { margin-bottom: 8px; }
.upgrader-fairness-field:focus { border-color: rgba(255,255,255,.6); }
.upgrader-fairness-field:disabled { cursor: not-allowed; opacity: .5; }
.upgrader-fairness-blockchain-note { width: fit-content; margin: 0; padding: 8px; border-left: 4px solid #3b82f6; border-radius: 6px; background: rgba(0,0,0,.5); color: #fff; font-size: 16px; line-height: 24px; }
.upgrader-fairness-blockchain-note a { color: #60a5fa; text-decoration: none; }
.upgrader-fairness-blockchain-note a:hover { text-decoration: underline; }
.upgrader-fairness-value-pair { display: flex; align-items: center; gap: 16px; }
.upgrader-fairness-value-pair>div { flex: 1; }
.upgrader-fairness-input-holder { display: flex; width: 100%; height: 40px; box-sizing: border-box; align-items: center; gap: 10px; margin-top: 8px; padding: 8px 12px; border: 2px solid rgba(255,255,255,.05); border-radius: 6px; background: hsl(228 17% 12%); }
.upgrader-fairness-value { display: block; min-width: 0; flex: 1; overflow: hidden; color: rgba(255,255,255,.88); font-family: ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace; font-size: 13px; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }
.upgrader-fairness-copy-icon { display: inline-flex; width: 18px; height: 18px; flex: 0 0 18px; align-items: center; justify-content: center; padding: 0; border: 0; outline: none; background: transparent; color: #fff; cursor: pointer; transition: color 140ms ease; -webkit-tap-highlight-color: transparent; }
.upgrader-fairness-copy-icon svg { width: 18px; height: 18px; }
.upgrader-fairness-copy-icon:hover { color: rgba(255,255,255,.72); }
.upgrader-fairness-copy-icon:focus-visible { outline: 2px solid #ff69b0; outline-offset: 3px; }
.upgrader-fairness-seed-row { display: flex; align-items: stretch; gap: 10px; }
.upgrader-fairness-seed-row .upgrader-fairness-field { min-width: 0; flex: 1; }
.upgrader-fairness-random { height: 40px; margin-top: 8px; padding: 0 16px; border: 0; border-radius: 6px; background: hsl(233 16% 22%); color: #fff; font-size: 14px; font-weight: 500; cursor: pointer; }
.upgrader-fairness-random:disabled,.upgrader-fairness-validate:disabled { pointer-events: none; opacity: .5; }
.upgrader-fairness-validation-message { min-height: 20px; margin-top: 16px; text-align: center; font-size: 14px; font-weight: 500; }
.upgrader-fairness-validate { display: inline-flex; width: 100%; height: 40px; align-items: center; justify-content: center; margin-top: 16px; padding: 8px 16px; border: 0; border-radius: 6px; background: hsl(331 100% 65%); color: #000; font-size: 14px; font-weight: 500; cursor: pointer; transition: opacity 150ms ease; }
.upgrader-fairness-validate:hover { opacity: .9; }
.upgrader-fairness-show-code { display: inline-flex; height: 40px; align-items: center; padding: 8px 0; border: 0; background: transparent; color: #9ca3af; font-size: 14px; font-weight: 500; cursor: pointer; text-underline-offset: 4px; }
.upgrader-fairness-show-code:hover { text-decoration: underline; }
.upgrader-fairness-code { overflow-x: auto; margin: 0; padding: 12px; border-radius: 6px; background: rgba(0,0,0,.5); color: #d1d5db; font-size: 12px; }
.upgrader-fairness-reveal-box { margin-top: 16px; padding: 16px; border-radius: 6px; background: rgba(0,0,0,.25); animation: upgrader-fairness-modal-in .24s ease-out both; }
.upgrader-fairness-reveal-title { display: block; color: #e1e4f2; font-size: 13px; font-weight: 700; }
.upgrader-fairness-reveal-description { display: block; margin-top: 5px; color: #a6b2d3; font-size: 11px; font-weight: 500; line-height: 1.55; }
.upgrader-fairness-reveal-value { margin-top: 10px; margin-bottom: 0; }
.upgrader-fairness-reveal-meta { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 14px; margin-top: 9px; color: #6c7399; font-size: 11px; font-weight: 500; }
.upgrader-fairness-reveal-meta b { color: #a6b2d3; font-weight: 700; }
@keyframes upgrader-fade-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@keyframes upgrader-overlay-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes upgrader-overlay-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes upgrader-modal-in { from { opacity: 0; transform: scale(.93); } to { opacity: 1; transform: scale(1); } }
@keyframes upgrader-fairness-modal-in { from { opacity: 0; transform: translate(-50%,-48%); } to { opacity: 1; transform: translate(-50%,-50%); } }
@keyframes upgrader-fairness-modal-out { from { opacity: 1; transform: translate(-50%,-50%); } to { opacity: 0; transform: translate(-50%,-50%); } }
@keyframes upgrader-arrow-popup { from { scale: .55; } to { scale: 1; } }
@keyframes upgrader-arrow-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
@keyframes upgrader-arrow-pulse { 0%,100% { opacity: 1; } 50% { opacity: .5; } }
@container (max-width: 850px) {
  .upgrader-target-content { padding-right: 4px; padding-left: 4px; }
  .upgrader-target-grid { --target-thumb-size: 50px; }
  .upgrader-target-thumb { width: 50px; height: 50px; min-width: 50px; min-height: 50px; }
  .upgrader-floating-arrow { display: none; }
}
@media (max-width: 1100px) {
  .upgrader-arena { grid-template-columns: minmax(0,1fr) 240px minmax(0,1fr); gap: 12px; }
  .upgrader-wheel-circle { width: 200px; height: 200px; }
  .upgrader-wheel-arrow { height: 100px; transform-origin: center 100px; }
}
@media (max-width: 900px) {
  .upgrader-arena { grid-template-columns: 1fr; gap: 12px; height: auto; min-height: unset; max-height: unset; }
  .upgrader-left-panel, .upgrader-target-panel { height: auto; min-height: 240px; max-height: unset; }
  .upgrader-center-panel { min-height: 470px; padding: 12px 8px; }
  .upgrader-items-wrapper { max-height: 280px; }
  .upgrader-upgrade-wrap { padding-top: 4px; }
}
@media (max-width: 520px) {
  .upgrader-fairness-seed-row { flex-direction: column; }
  .upgrader-fairness-random { width: 100%; }
}
@media (min-width: 640px) {
  .upgrader-fairness-modal { height: fit-content; max-height: 100dvh; border-radius: 8px; }
}
@media (max-width: 640px) {
  .upgrader-page { padding: 12px 12px 80px; }
  .upgrader-arena { gap: 10px; margin-bottom: 16px; }
  .upgrader-left-panel { min-height: 200px; padding: 12px; gap: 8px; }
  .upgrader-center-panel { min-height: 420px; height: auto; gap: 12px; padding: 10px 8px; }
  .upgrader-wheel-tabs { position: relative; z-index: 1; width: 100%; }
  .upgrader-wheel-tab { flex: 1; text-align: center; }
  .upgrader-wheel-wrap { flex: none; padding: 8px 0; }
  .upgrader-wheel-circle { width: 180px; height: 180px; }
  .upgrader-wheel-arrow { height: 90px; transform-origin: center 90px; }
  .upgrader-wheel-pct { font-size: 22px; }
  .upgrader-upgrade-btn { height: 44px; font-size: 14px; }
  .upgrader-roll-mode { height: 38px; font-size: 13px; }
  .upgrader-target-panel { min-height: 200px; padding: 16px; }
  .upgrader-target-content { padding: 14px; gap: 8px; }
  .upgrader-target-grid { --target-thumb-size: 50px; }
  .upgrader-target-thumb { width: 50px; height: 50px; min-width: 50px; min-height: 50px; }
  .upgrader-target-arrow { display: none; }
  .upgrader-pool-section { margin-top: 4px; }
  .upgrader-pool-head { gap: 6px; }
  .upgrader-pool-title { font-size: 14px; }
  .upgrader-pool-grid, .upgrader-inventory-selected-grid { grid-template-columns: repeat(2,1fr); gap: 6px; }
  .upgrader-item-card { height: auto; min-height: 150px; padding: 6px; }
  .upgrader-item-card.is-compact { height: 150px; min-height: 150px; padding: 6px; }
  .upgrader-item-card.is-compact .upgrader-image-wrap { height: 100px; flex: 0 0 100px; }
  .upgrader-item-card.is-compact .upgrader-item-name { font-size: 11px; }
  .upgrader-item-card.is-compact .upgrader-coin-value, .upgrader-item-card.is-compact .upgrader-coin-value > span { font-size: 12px; }
  .upgrader-pool-item-card { height: 150px; min-height: 150px; }
  .upgrader-image-wrap { height: 98px; flex-basis: 98px; }
  .upgrader-item-name { font-size: 11px; }
  .upgrader-coin-value { font-size: 12px; }
  .upgrader-open-inventory { height: 40px; font-size: 13px; }
  .upgrader-inventory-overlay { align-items: center; justify-content: center; padding: 0; }
  .upgrader-inventory-modal { display: flex; width: 100%; max-width: 100%; height: 100dvh; max-height: 100dvh; box-sizing: border-box; flex-direction: column; overflow: hidden; padding: 12px 12px 16px; border: none; border-radius: 0; }
  .upgrader-inventory-modal::before { display: block; width: 36px; height: 4px; flex-shrink: 0; margin: 0 auto 12px; border-radius: 2px; background: #2a2e44; content: ''; }
  .upgrader-inventory-close { top: 8px; right: 12px; font-size: 20px; }
  .upgrader-inventory-header { width: 100%; flex-shrink: 0; padding-right: 36px; margin-top: 8px; margin-bottom: 8px; }
  .upgrader-inventory-controls, .upgrader-inventory-search { width: 100%; }
  .upgrader-inventory-search input { width: 100%; height: 40px; box-sizing: border-box; font-size: 15px; }
  .upgrader-inventory-items-wrap { width: 100%; height: auto; min-height: 0; box-sizing: border-box; flex: 1; overflow-y: auto; padding: 10px; margin-top: 0; border-radius: 8px; -webkit-overflow-scrolling: touch; }
  .upgrader-inventory-stats { flex-shrink: 0; justify-content: center; gap: 12px; padding: 8px 0 14px; margin-top: 0; margin-bottom: 0; }
  .upgrader-inventory-grid { grid-template-columns: repeat(2,1fr); gap: 6px; }
  .upgrader-modal-item { height: 180px; padding: 6px; }
  .upgrader-modal-item-image-wrap { height: 130px; flex: 0 0 130px; }
  .upgrader-inventory-actions { width: 100%; flex-shrink: 0; flex-wrap: wrap; justify-content: center; gap: 6px; padding: 0; margin-top: 10px; }
  .upgrader-inventory-select-all { min-width: 0; min-height: 40px; flex: 1 1 120px; padding: 0 8px; font-size: 13px; }
  .upgrader-inventory-add { order: 10; width: 100%; min-width: 0; min-height: 44px; flex: 1 1 100%; padding: 0 16px; font-size: 14px; }
}
@media (min-width: 641px) and (max-width: 840px) {
  .upgrader-inventory-modal { width: 95%; max-height: 90vh; overflow-y: auto; }
  .upgrader-inventory-header { position: static; align-items: stretch; flex-direction: column; gap: 8px; }
  .upgrader-inventory-controls, .upgrader-inventory-search, .upgrader-inventory-search input { width: 100%; }
  .upgrader-inventory-items-wrap { height: 340px; }
  .upgrader-inventory-grid { grid-template-columns: repeat(auto-fill,minmax(140px,1fr)); }
  .upgrader-inventory-actions { flex-wrap: wrap; gap: 8px; }
}
@media (prefers-reduced-motion: reduce) {
  .upgrader-page, .upgrader-target-content, .upgrader-fairness-overlay, .upgrader-inventory-overlay, .upgrader-inventory-modal, .upgrader-fairness-modal { animation: none; }
}
`

const REFERENCE_LIVE_WINS = [
  { before: 120, gain: 45, after: 165, player: 'KWOXP_9', multiplier: '1.38' },
  { before: 130, gain: 25, after: 155, player: 'KWOXP_9', multiplier: '1.19' },
  { before: 32, gain: 6, after: 38, player: '9x_Icey', multiplier: '1.19' },
  { before: 35, gain: 30, after: 65, player: 'hellolol321g', multiplier: '1.86' },
  { before: 105, gain: 15, after: 120, player: 'hellolol321g', multiplier: '1.14' },
  { before: 35, gain: 10, after: 45, player: '9x_Icey', multiplier: '1.29' },
]

const REFERENCE_UPGRADER_CSS = `
.reference-upgrader { width:100%; min-height:100%; padding:16px 16px 80px; color:#fff; }
.reference-upgrader * { box-sizing:border-box; }
.reference-upgrader button,.reference-upgrader input { font-family:Poppins,sans-serif; }
.ref-live-wins { overflow:hidden; padding:16px; border:1px solid hsl(231 16% 16%); border-radius:6px; background:hsl(230 16% 14%); }
.ref-live-title { display:flex; align-items:center; gap:8px; color:rgba(255,255,255,.8); font-size:14px; font-weight:600; }
.ref-live-dot-wrap { display:grid; }
.ref-live-dot { grid-area:1/1; width:12px; height:12px; border-radius:999px; background:rgba(239,67,99,.5); animation:ref-live-pulse 1.8s ease-in-out infinite; }
.ref-live-track { display:flex; gap:8px; overflow:hidden; margin-top:12px; }
.ref-live-card { display:flex; min-width:222px; flex-direction:column; gap:8px; padding:16px; border:1px solid hsl(231 16% 16%); border-radius:6px; background:hsl(230 16% 14%); }
.ref-live-values,.ref-live-player { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.ref-live-values { color:#ff4fa3; font-size:12px; font-weight:600; }
.ref-live-value,.ref-live-gain { display:flex; align-items:center; gap:4px; }
.ref-live-gain { padding:4px 8px; border-radius:999px; background:rgba(11,248,148,.2); font-size:14px; }
.ref-live-values img { width:16px; height:16px; }
.ref-live-items { display:flex; align-items:center; justify-content:space-between; }
.ref-live-stack { display:flex; min-height:40px; align-items:center; margin-left:12px; }
.ref-live-item { display:grid; width:40px; height:40px; place-items:center; overflow:hidden; margin-left:-12px; border:1px solid hsl(231 16% 16%); border-radius:999px; background:hsl(228 17% 12%); }
.ref-live-item img { width:32px; height:32px; object-fit:contain; }
.ref-live-arrow { width:20px; color:rgba(255,255,255,.8); }
.ref-live-player { font-size:14px; font-weight:600; }
.ref-live-avatar { width:16px; height:16px; border-radius:999px; background:#303341; }
.ref-live-multiplier { color:#ff4fa3; }
.ref-upgrader-content { margin-top:16px; }
.ref-upgrade-card { display:flex; max-height:50%; flex-direction:column; padding:24px; border:1px solid hsl(231 16% 16%); border-radius:6px; background:hsl(230 16% 14%); }
.ref-wheel-stage { position:relative; display:grid; min-height:360px; place-items:center; }
.ref-wheel { position:relative; z-index:20; display:grid; width:min(380px,24.75vw); min-width:280px; aspect-ratio:1; place-items:center; }
.ref-wheel-glow,.ref-wheel-ring { position:absolute; inset:0; border-radius:999px; }
.ref-wheel-glow { background:rgba(11,248,148,.12); filter:blur(32px); }
.ref-wheel-ring { z-index:2; padding:5px; }
.ref-wheel-ring svg { width:100%; height:100%; overflow:visible; }
.ref-wheel-inner { position:absolute; z-index:4; inset:5px; display:grid; place-items:center; overflow:hidden; border-radius:999px; background:hsl(228 17% 12%); }
.ref-wheel-logo { position:absolute; width:60%; padding:20%; opacity:.05; }
.ref-wheel-readout { position:relative; z-index:3; max-width:78%; text-align:center; }
.ref-wheel-chance { display:block; font-size:60px; font-weight:600; line-height:1.05; }
.ref-wheel-caption { display:block; margin-top:7px; font-size:16px; font-weight:500; }
.ref-wheel-pointer { position:absolute; z-index:8; top:0; left:50%; width:0; height:0; border-top:16px solid #ff4fa3; border-right:8px solid transparent; border-left:8px solid transparent; transform-origin:0 calc((min(380px,24.75vw) - 10px)/2); transition:transform 5s cubic-bezier(.15,.5,.25,1); }
.ref-wheel-side { position:absolute; z-index:8; top:50%; display:flex; width:30%; align-items:center; gap:6px; transform:translateY(-50%); }
.ref-wheel-side.is-left { left:4%; justify-content:flex-end; }
.ref-wheel-side.is-right { right:4%; justify-content:flex-start; }
.ref-wheel-side-item { display:grid; width:72px; height:72px; place-items:center; overflow:hidden; border:1px solid hsl(231 16% 16%); border-radius:999px; background:hsl(228 17% 12%); box-shadow:0 0 22px rgba(11,248,148,.08); }
.ref-wheel-side-item img { width:58px; height:58px; object-fit:contain; }
.ref-wheel-side-empty { width:72px; height:72px; border:1px solid hsl(231 16% 16%); border-radius:999px; background:hsl(228 17% 12%); }
.ref-wheel-multiplier { margin-bottom:16px; text-align:center; }
.ref-wheel-multiplier strong { color:#ff4fa3; }
.ref-upgrade-footer { display:grid; grid-template-columns:1fr 240px 1fr; align-items:end; gap:20px; }
.ref-total-label { font-size:18px; font-weight:600; }
.ref-total-value { display:flex; align-items:center; gap:3px; color:#ff4fa3; font-weight:600; }
.ref-total-value img { width:16px; height:16px; }
.ref-total.is-right { text-align:right; }
.ref-total.is-right .ref-total-value { justify-content:flex-end; }
.ref-mobile-total { display:none; }
.ref-upgrade-button { height:44px; border:0; border-radius:6px; background:#ff4fa3; color:hsl(230 16% 14%); font-size:18px; font-weight:600; transition:opacity .15s ease,transform .12s ease; }
.ref-upgrade-button:hover:not(:disabled) { opacity:.9; }
.ref-upgrade-button:active:not(:disabled) { transform:scale(.98); }
.ref-upgrade-button:disabled { cursor:not-allowed; opacity:.5; }
.ref-browser-card { display:flex; gap:16px; margin-top:16px; padding:16px; border:1px solid hsl(231 16% 16%); border-radius:6px; background:hsl(230 16% 14%); }
.ref-browser-column { min-width:0; width:50%; }
.ref-browser-divider { width:1px; flex:0 0 1px; background:rgba(255,255,255,.1); }
.ref-browser-controls { display:flex; align-items:flex-end; gap:8px; }
.ref-search-group { display:grid; width:100%; max-width:384px; gap:8px; }
.ref-search-group label { font-size:14px; font-weight:500; opacity:.8; }
.ref-browser-input,.ref-browser-select { height:48px; border:2px solid rgba(255,255,255,.25); border-radius:8px; outline:0; background:transparent; color:rgba(255,255,255,.5); font-size:14px; font-weight:600; }
.ref-browser-input { width:100%; padding:8px 12px; }
.ref-browser-input:focus,.ref-browser-select:focus { border-color:rgba(255,255,255,.6); }
.ref-filter-row { display:flex; width:100%; flex-direction:row; gap:8px; }
.ref-filter-select { position:relative; width:180px; }
.ref-browser-select { display:flex; width:100%; height:48px; align-items:center; justify-content:space-between; gap:12px; padding:8px 12px; border:2px solid rgba(255,255,255,.25); border-radius:8px; outline:0; background:transparent; color:rgba(255,255,255,.5); font-size:14px; font-weight:600; white-space:nowrap; transition:border-color .15s ease; }
.ref-browser-select:focus { border-color:rgba(255,255,255,.6); }
.ref-browser-select span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ref-browser-select svg { width:16px; height:16px; flex:none; opacity:.5; transition:transform .15s ease; }
.ref-browser-select[aria-expanded="true"] svg { transform:rotate(180deg); }
.ref-filter-menu { position:absolute; z-index:100; top:52px; left:0; min-width:164px; width:max-content; padding:4px; border:1px solid rgba(255,255,255,.16); border-radius:7px; outline:0; background:#191c24; box-shadow:0 12px 30px rgba(0,0,0,.35); transform-origin:top left; animation:ref-filter-in .12s ease-out; }
.ref-filter-option { display:flex; width:100%; min-width:156px; height:32px; align-items:center; padding:0 12px; border:0; border-radius:5px; outline:0; background:transparent; color:#aeb2bc; font:500 12px/18px Poppins,sans-serif; text-align:left; cursor:pointer; }
.ref-filter-option:hover,.ref-filter-option:focus { background:#262a35; color:#aeb2bc; }
.ref-browser-items { height:400px; margin-top:16px; overflow:auto; }
.ref-browser-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); gap:8px; }
.ref-browser-empty { display:flex; height:100%; flex-direction:column; align-items:center; justify-content:center; text-align:center; }
.ref-browser-empty strong { font-size:30px; font-weight:500; }
.ref-browser-empty p { margin-top:8px; font-weight:500; opacity:.8; }
.ref-browser-empty button { height:44px; margin-top:24px; padding:0 32px; border:0; border-radius:6px; background:#ff4fa3; color:hsl(230 16% 14%); font-size:14px; font-weight:600; }
.ref-mobile-tabs { display:none; }
@keyframes ref-live-pulse { 0%,100%{opacity:.5}50%{opacity:1} }
@keyframes ref-filter-in { from{opacity:0;transform:translateY(-4px) scaleY(.96)} to{opacity:1;transform:translateY(0) scaleY(1)} }
@media(max-width:767px){
  .reference-upgrader { padding:12px 12px 88px; }
  .ref-live-wins { margin:0; padding:12px; }
  .ref-live-track { overflow-x:auto; }
  .ref-live-card { min-width:210px; }
  .ref-upgrade-card { padding:20px; }
  .ref-wheel-stage { min-height:300px; }
  .ref-wheel { width:210px; min-width:210px; }
  .ref-wheel-chance { font-size:28px; }
  .ref-wheel-caption { font-size:12px; }
  .ref-wheel-pointer { transform-origin:0 100px; }
  .ref-wheel-side { width:auto; flex-direction:column; }
  .ref-wheel-side.is-left { left:0; }.ref-wheel-side.is-right { right:0; }
  .ref-wheel-side-item,.ref-wheel-side-empty { width:48px; height:48px; }
  .ref-wheel-side-item img { width:38px; height:38px; }
  .ref-upgrade-footer { grid-template-columns:1fr; gap:14px; }
  .ref-upgrade-footer .ref-total { display:none; }
  .ref-mobile-total { display:block; }
  .ref-mobile-total.is-right { text-align:right; }
  .ref-mobile-total.is-right .ref-total-value { justify-content:flex-end; }
  .ref-upgrade-button { height:64px; font-size:20px; }
  .ref-browser-card { display:block; margin-bottom:20px; padding:0; border:0; background:transparent; }
  .ref-mobile-tabs { display:inline-flex; height:40px; align-items:center; padding:4px; border-radius:6px; background:rgba(255,255,255,.05); }
  .ref-mobile-tab { height:32px; padding:0 14px; border:0; border-radius:4px; background:transparent; color:rgba(255,255,255,.55); font-size:14px; font-weight:500; }
  .ref-mobile-tab.is-active { background:rgba(255,255,255,.09); color:#fff; }
  .ref-browser-column { display:none; width:100%; margin-top:8px; }
  .ref-browser-column.is-mobile-active { display:block; }
  .ref-browser-divider { display:none; }
  .ref-browser-controls { flex-direction:column; align-items:stretch; }
  .ref-search-group { max-width:none; }
  .ref-filter-row,.ref-filter-select,.ref-browser-select { width:100%; }
  .ref-browser-items { height:calc(100dvh - 375px); min-height:300px; max-height:400px; }
  .ref-browser-grid { grid-template-columns:repeat(2,1fr); }
}
`

function ReferenceChevron() {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
}

function ReferenceLiveWins() {
  const itemImages = [
    'https://tr.rbxcdn.com/180DAY-ccf0fd97edf0e575dd354c710cb83c1d/420/420/Model/Png/noFilter',
    'https://tr.rbxcdn.com/180DAY-57a53bbde69e9c48c2e6c7607e78f7c8/420/420/Model/Png/noFilter',
  ]
  return (
    <section className="ref-live-wins">
      <div className="ref-live-title">LIVE WINS <span className="ref-live-dot-wrap"><span className="ref-live-dot" /></span></div>
      <div className="ref-live-track">
        {REFERENCE_LIVE_WINS.map((win, index) => (
          <article className="ref-live-card" key={`${win.player}-${index}`}>
            <div className="ref-live-values"><span className="ref-live-value"><img src="/currency.svg" alt="" />{win.before}</span><span className="ref-live-gain">+<img src="/currency.svg" alt="" />{win.gain}</span><span className="ref-live-value"><img src="/currency.svg" alt="" />{win.after}</span></div>
            <div className="ref-live-items"><div className="ref-live-stack"><span className="ref-live-item"><img src={itemImages[index % 2]} alt="" /></span><span className="ref-live-item" /></div><svg className="ref-live-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg><div className="ref-live-stack"><span className="ref-live-item"><img src={itemImages[(index + 1) % 2]} alt="" /></span><span className="ref-live-item" /></div></div>
            <div className="ref-live-player"><span className="ref-live-value"><span className="ref-live-avatar" />{win.player}</span><span><b className="ref-live-multiplier">{win.multiplier}</b>x</span></div>
          </article>
        ))}
      </div>
    </section>
  )
}

function ReferenceFilterSelect({ value, options, onChange, ariaLabel }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const normalizedOptions = options.map((option) => typeof option === 'string' ? { value: option, label: option } : option)
  const selectedLabel = normalizedOptions.find((option) => option.value === value)?.label || value

  useEffect(() => {
    if (!open) return undefined
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  return (
    <div className="ref-filter-select" ref={rootRef}>
      <button type="button" role="combobox" aria-label={ariaLabel} aria-expanded={open} className="ref-browser-select" onClick={() => setOpen((current) => !current)}>
        <span>{selectedLabel}</span><ReferenceChevron />
      </button>
      {open ? <div className="ref-filter-menu" role="menu" aria-orientation="vertical">{normalizedOptions.map((option, index) => (
        <button type="button" role="menuitem" tabIndex={index === 0 ? 0 : -1} className="ref-filter-option" key={option.value} onClick={() => { onChange(option.value); setOpen(false) }}>{option.label}</button>
      ))}</div> : null}
    </div>
  )
}

function ReferenceBrowserControls({ value, onChange, sortBy, onSortChange, game, onGameChange }) {
  return (
    <div className="ref-browser-controls">
      <label className="ref-search-group"><span>Select Item</span><input className="ref-browser-input" value={value} onChange={onChange} placeholder="Search for an item.." /></label>
      <div className="ref-filter-row">
        <ReferenceFilterSelect value={sortBy} options={UPGRADER_SORT_OPTIONS} onChange={onSortChange} ariaLabel="Sort items" />
        <ReferenceFilterSelect value={game} options={UPGRADER_GAME_OPTIONS} onChange={onGameChange} ariaLabel="Filter items by game" />
      </div>
    </div>
  )
}

function ReferenceUpgraderLayout({ model }) {
  const [inventorySearch, setInventorySearch] = useState('')
  const [mobileTab, setMobileTab] = useState('inventory')
  const [inventorySort, setInventorySort] = useState('Selected')
  const [inventoryGame, setInventoryGame] = useState('ps99')
  const [stockSort, setStockSort] = useState('Selected')
  const [stockGame, setStockGame] = useState('ps99')
  const inventoryRows = useMemo(() => {
    const query = inventorySearch.trim().toLowerCase()
    const matching = model.inventoryItems.filter((item) => getItemGame(item) === inventoryGame && (!query || item.name.toLowerCase().includes(query)))
    return sortUpgraderItems(matching, inventorySort, (item) => model.selectedItems.some((selected) => selected.id === item.id))
  }, [inventoryGame, inventorySearch, inventorySort, model.inventoryItems, model.selectedItems])
  const stockRows = useMemo(() => {
    const query = model.poolSearch.trim().toLowerCase()
    const matching = model.poolItems.filter((item) => getItemGame(item) === stockGame && (!query || item.name.toLowerCase().includes(query)))
    return sortUpgraderItems(matching, stockSort, (item) => Number(model.targetQuantities[item.id]) > 0)
  }, [model.poolItems, model.poolSearch, model.targetQuantities, stockGame, stockSort])
  const multiplier = model.wager > 0 ? model.targetValue / model.wager : 0
  const sideItems = (items, count = 3) => [...items].slice(0, count)

  const InventoryColumn = (
    <div className={`ref-browser-column ${mobileTab === 'inventory' ? 'is-mobile-active' : ''}`}>
      <ReferenceBrowserControls value={inventorySearch} onChange={(event) => setInventorySearch(event.target.value)} sortBy={inventorySort} onSortChange={setInventorySort} game={inventoryGame} onGameChange={setInventoryGame} />
      <div className="ref-browser-items">
        {model.inventoryLoading ? <div className="ref-browser-empty"><strong>Loading...</strong></div> : null}
        {!model.inventoryLoading && model.inventoryError ? <div className="ref-browser-empty"><strong>No Items!</strong><p>{model.inventoryError}</p></div> : null}
        {!model.inventoryLoading && !model.inventoryError && inventoryRows.length ? <div className="ref-browser-grid">{inventoryRows.map((item) => <ItemCard key={item.id} item={item} selected={model.selectedItems.some((selected) => selected.id === item.id)} compact onClick={() => model.toggleInventory(item)} />)}</div> : null}
        {!model.inventoryLoading && !model.inventoryError && !inventoryRows.length ? <div className="ref-browser-empty"><strong>No Items!</strong><p>Your inventory seems to be empty...</p><button type="button" onClick={model.openInventory}>Deposit Items</button></div> : null}
      </div>
    </div>
  )
  const StockColumn = (
    <div className={`ref-browser-column ${mobileTab === 'stock' ? 'is-mobile-active' : ''}`}>
      <ReferenceBrowserControls value={model.poolSearch} onChange={(event) => model.setPoolSearch(event.target.value)} sortBy={stockSort} onSortChange={setStockSort} game={stockGame} onGameChange={setStockGame} />
      <div className="ref-browser-items">
        {model.poolLoading ? <div className="ref-browser-empty"><strong>Loading...</strong></div> : null}
        {!model.poolLoading && model.poolError ? <div className="ref-browser-empty"><strong>No Items!</strong><p>{model.poolError}</p></div> : null}
        {!model.poolLoading && !model.poolError && stockRows.length ? <div className="ref-browser-grid">{stockRows.map((item) => <PoolItemCard key={item.id} item={item} quantity={Number(model.targetQuantities[item.id]) || 0} totalSelected={model.targetCount} onToggle={() => model.toggleTarget(item)} onQuantityChange={(quantity) => model.setTargetQuantity(item, quantity)} />)}</div> : null}
        {!model.poolLoading && !model.poolError && !stockRows.length ? <div className="ref-browser-empty"><strong>No Items!</strong><p>Stock seems to be empty...</p></div> : null}
      </div>
    </div>
  )

  return (
    <div className="reference-upgrader"><style>{UPGRADER_CSS}{REFERENCE_UPGRADER_CSS}</style>
      <ReferenceLiveWins />
      <div className="ref-upgrader-content">
        <section className="ref-upgrade-card">
          <div className="ref-mobile-total"><div className="ref-total-label">Selected Total</div><div className="ref-total-value"><img src="/currency.svg" alt="" />{formatValue(model.wager)}</div></div>
          <div className="ref-wheel-stage">
            <div className="ref-wheel-side is-left">{sideItems(model.selectedItems).map((item) => <span className="ref-wheel-side-item" key={item.id}><img src={item.image} alt={item.name} onError={safeImage} /></span>)}{!model.selectedItems.length ? <span className="ref-wheel-side-empty" /> : null}</div>
            <div className="ref-wheel">
              <div className="ref-wheel-glow" />
              <div className="ref-wheel-ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="48.5" stroke="rgba(255,255,255,.035)" strokeWidth="3" fill="none" />{model.winZonePath ? <path d={model.winZonePath} stroke="#ff4fa3" strokeWidth="3" fill="none" /> : null}</svg></div>
              <div className="ref-wheel-inner"><div className="ref-wheel-readout"><span className="ref-wheel-chance">{model.wheelChance.toFixed(2)}%</span><span className="ref-wheel-caption">Chance of receiving selected items</span></div></div>
              <span className="ref-wheel-pointer" style={{ transform: `translateX(-50%) rotate(${model.rotation}deg)` }} />
            </div>
            <div className="ref-wheel-side is-right">{sideItems(model.expandedTargets).map((item, index) => <span className="ref-wheel-side-item" key={`${item.id}-${index}`}><img src={item.image} alt={item.name} onError={safeImage} /></span>)}{!model.expandedTargets.length ? <span className="ref-wheel-side-empty" /> : null}</div>
          </div>
          <div className="ref-mobile-total is-right"><div className="ref-total-label">Desired Total</div><div className="ref-total-value"><img src="/currency.svg" alt="" />{formatValue(model.targetValue)}</div></div>
          <div className="ref-wheel-multiplier">Multiplier: <strong>{multiplier.toFixed(2)}</strong>x</div>
          <div className="ref-upgrade-footer"><div className="ref-total"><div className="ref-total-label">Selected Total</div><div className="ref-total-value"><img src="/currency.svg" alt="" />{formatValue(model.wager)}</div></div><button type="button" className="ref-upgrade-button" disabled={!model.isReady} onClick={model.runUpgrade}>{model.spinning ? 'Upgrading...' : 'Upgrade'}</button><div className="ref-total is-right"><div className="ref-total-label">Desired Total</div><div className="ref-total-value"><img src="/currency.svg" alt="" />{formatValue(model.targetValue)}</div></div></div>
        </section>
        <span className="block h-4" />
        <div className="ref-mobile-tabs"><button type="button" className={`ref-mobile-tab ${mobileTab === 'inventory' ? 'is-active' : ''}`} onClick={() => setMobileTab('inventory')}>Inventory</button><button type="button" className={`ref-mobile-tab ${mobileTab === 'stock' ? 'is-active' : ''}`} onClick={() => setMobileTab('stock')}>Stock</button></div>
        <section className="ref-browser-card">{InventoryColumn}<div className="ref-browser-divider" />{StockColumn}</section>
      </div>
    </div>
  )
}

export default function Upgrader() {
  const user = useAuth((state) => state.user)
  const balance = useAuth((state) => state.balance)
  const holdBalanceDisplay = useAuth((state) => state.holdBalanceDisplay)
  const releaseBalanceDisplay = useAuth((state) => state.releaseBalanceDisplay)
  const applyProfileUpdate = useAuth((state) => state.applyProfileUpdate)
  const setAuthModalOpen = useAuth((state) => state.setAuthModalOpen)
  const [mode, setMode] = useState('items')
  const [selectedItems, setSelectedItems] = useState([])
  const [inventoryItems, setInventoryItems] = useState([])
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [inventoryError, setInventoryError] = useState('')
  const [poolItems, setPoolItems] = useState([])
  const [poolLoading, setPoolLoading] = useState(true)
  const [poolError, setPoolError] = useState('')
  const [targetQuantities, setTargetQuantities] = useState({})
  const [targetOrder, setTargetOrder] = useState([])
  const [poolSearch, setPoolSearch] = useState('')
  const [coinAmount, setCoinAmount] = useState('')
  const [rollMode, setRollMode] = useState('under')
  const [inventoryOpen, setInventoryOpen] = useState(false)
  const [fairnessOpen, setFairnessOpen] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [zoneStartAngle, setZoneStartAngle] = useState(0)
  const [poolRefreshKey, setPoolRefreshKey] = useState(0)
  const spinTimer = useRef(null)
  const pendingRequestId = useRef(null)
  const balanceBeforeSpin = useRef(null)
  const spinAudioRef = useRef(null)
  const winAudioRef = useRef(null)
  const loseAudioRef = useRef(null)
  const zoneDrag = useRef(null)

  const itemWager = selectedItems.reduce((total, item) => total + item.value, 0)
  const wager = mode === 'coins' ? Number(String(coinAmount).replace(/,/g, '')) || 0 : itemWager
  const selectedTargets = targetOrder
    .map((id) => ({ item: poolItems.find((candidate) => candidate.id === id), quantity: Number(targetQuantities[id]) || 0 }))
    .filter((entry) => entry.item && entry.quantity > 0)
  const targetAccent = selectedTargets.length ? getUpgraderItemAccent(selectedTargets[0].item) : '108, 99, 255'
  const targetCount = selectedTargets.reduce((total, entry) => total + entry.quantity, 0)
  const targetValue = selectedTargets.reduce((total, entry) => total + entry.item.value * entry.quantity, 0)
  const expandedTargets = selectedTargets.flatMap(({ item, quantity }) => Array.from({ length: quantity }, () => item))
  const previewTargets = expandedTargets.length > 9
    ? [...expandedTargets.slice(0, 8), expandedTargets[8]]
    : expandedTargets
  const targetPreviewColumns = Math.min(3, Math.max(1, previewTargets.length))
  const targetPreviewRows = Math.max(1, Math.ceil(previewTargets.length / 3))
  const calculatedChance = targetValue > 0 && wager > 0 ? (wager / targetValue) * UPGRADE_RETURN : 0
  const minimumChanceWager = targetValue > 0 ? Math.ceil((targetValue * MIN_CHANCE) / UPGRADE_RETURN) : 0
  const maximumChanceWager = targetValue > 0 ? Math.round((targetValue * MAX_CHANCE) / UPGRADE_RETURN) : 0
  const chanceIsInRange = targetValue > 0 && wager >= minimumChanceWager && wager <= maximumChanceWager
  const chance = wager === maximumChanceWager && maximumChanceWager > 0
    ? MAX_CHANCE
    : Math.min(MAX_CHANCE, calculatedChance)
  const wheelChance = chanceIsInRange ? chance : 0
  const isReady = Boolean(targetValue > 0 && wager > 0 && !spinning)
  const winZonePath = getWinZonePath(wheelChance, zoneStartAngle)
  const filteredPool = useMemo(() => {
    const query = poolSearch.trim().toLowerCase()
    const sorted = [...poolItems].sort((a, b) => {
      const aSelected = Number(targetQuantities[a.id]) > 0
      const bSelected = Number(targetQuantities[b.id]) > 0
      if (aSelected !== bSelected) return aSelected ? -1 : 1
      return b.value - a.value
    })
    return query ? sorted.filter((item) => item.name.toLowerCase().includes(query)) : sorted
  }, [poolItems, poolSearch, targetQuantities])

  const poolItemCount = poolItems.reduce((total, item) => total + item.copies, 0)

  useEffect(() => {
    let cancelled = false
    const table = mode === 'coins' ? 'exchange_stock' : 'upgrader_stock'

    setPoolLoading(true)
    setPoolError('')
    supabase
      .from(table)
      .select('uuid,item_id,item_uuid,name,value,image_url,type,stocked_at')
      .order('stocked_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) throw error
        setPoolItems(groupStockPool(data || []))
      })
      .catch((requestError) => {
        if (cancelled) return
        setPoolItems([])
        setPoolError(requestError?.message || `Unable to load ${mode === 'coins' ? 'coin' : 'item'} pool.`)
      })
      .finally(() => {
        if (!cancelled) setPoolLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [mode, poolRefreshKey])

  useEffect(() => {
    if (!user) {
      setInventoryItems([])
      return undefined
    }

    let cancelled = false
    setInventoryLoading(true)
    setInventoryError('')

    apiRequest('/api/inventory')
      .then((result) => {
        if (cancelled) return
        const nextItems = (result?.items || []).map(normalizeInventoryItem)
        const nextItemsById = new Map(nextItems.map((item) => [item.id, item]))
        setInventoryItems(nextItems)
        setSelectedItems((current) => current.map((item) => nextItemsById.get(item.id)).filter(Boolean))
      })
      .catch((requestError) => {
        if (cancelled) return
        setInventoryItems([])
        setInventoryError(requestError?.message || 'Unable to load your inventory.')
        if (requestError?.status === 401) setAuthModalOpen(true)
      })
      .finally(() => {
        if (!cancelled) setInventoryLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [setAuthModalOpen, user?.id, user?.profile_id])

  useEffect(() => {
    spinAudioRef.current = new Audio(SPIN_SOUND)
    winAudioRef.current = new Audio(WIN_SOUND)
    loseAudioRef.current = new Audio(LOSE_SOUND)
    const audioTracks = [spinAudioRef.current, winAudioRef.current, loseAudioRef.current]
    audioTracks.forEach((audio) => { audio.preload = 'auto' })
    spinAudioRef.current.volume = .35
    winAudioRef.current.volume = .5
    loseAudioRef.current.volume = .5

    return () => {
      window.clearTimeout(spinTimer.current)
      if (balanceBeforeSpin.current !== null) {
        releaseBalanceDisplay(balanceBeforeSpin.current)
        balanceBeforeSpin.current = null
        window.dispatchEvent(new CustomEvent('wallet:animation-end'))
      }
      spinAudioRef.current?.pause()
      winAudioRef.current?.pause()
      loseAudioRef.current?.pause()
    }
  }, [releaseBalanceDisplay])

  const selectMode = (nextMode) => {
    if (spinning || nextMode === mode) return
    setSelectedItems([])
    setTargetQuantities({})
    setTargetOrder([])
    setMode(nextMode)
  }

  const selectRollMode = (nextMode) => {
    if (spinning) return
    setRollMode(nextMode)
    setZoneStartAngle(getDefaultZoneStart(wheelChance, nextMode))
  }

  const updateCoinAmount = (rawValue) => {
    const digits = rawValue.replace(/\D/g, '').slice(0, 10)
    setCoinAmount(digits)
  }

  const setDesiredChance = (nextChance) => {
    if (!targetValue) return
    const safeChance = Math.max(MIN_CHANCE, Math.min(MAX_CHANCE, Number(nextChance) || MIN_CHANCE))
    const exactWager = (targetValue * safeChance) / UPGRADE_RETURN
    setCoinAmount(String(safeChance === MIN_CHANCE ? Math.ceil(exactWager) : Math.round(exactWager)))
  }

  const getPointerWheelAngle = (event) => {
    const svg = event.currentTarget.ownerSVGElement
    if (!svg) return 0

    const rect = svg.getBoundingClientRect()
    const deltaX = event.clientX - (rect.left + rect.width / 2)
    const deltaY = event.clientY - (rect.top + rect.height / 2)
    let angle = (Math.atan2(deltaX, -deltaY) * 180) / Math.PI
    if (angle < 0) angle += 360
    return angle
  }

  const startZoneDrag = (event) => {
    if (spinning || !wheelChance) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    zoneDrag.current = {
      pointerId: event.pointerId,
      lastPointerAngle: getPointerWheelAngle(event),
    }
  }

  const moveZoneDrag = (event) => {
    const drag = zoneDrag.current
    if (!drag || drag.pointerId !== event.pointerId || !event.currentTarget.hasPointerCapture(event.pointerId)) return

    const pointerAngle = getPointerWheelAngle(event)
    let angleDelta = pointerAngle - drag.lastPointerAngle
    if (angleDelta > 180) angleDelta -= 360
    if (angleDelta < -180) angleDelta += 360
    drag.lastPointerAngle = pointerAngle
    setZoneStartAngle((current) => normalizeWheelAngle(current + angleDelta))
  }

  const endZoneDrag = (event) => {
    if (zoneDrag.current?.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    zoneDrag.current = null
  }

  const setTargetQuantity = (item, nextQuantity) => {
    if (spinning) return
    const currentQuantity = Number(targetQuantities[item.id]) || 0
    const quantityWithoutItem = targetCount - currentQuantity
    const parsedQuantity = Math.floor(Number(nextQuantity) || 0)
    const safeQuantity = Math.max(0, Math.min(item.copies, MAX_TARGETS - quantityWithoutItem, parsedQuantity))

    setTargetQuantities((current) => {
      if (safeQuantity === 0) {
        const next = { ...current }
        delete next[item.id]
        return next
      }
      return { ...current, [item.id]: safeQuantity }
    })
    setTargetOrder((current) => {
      if (safeQuantity === 0) return current.filter((id) => id !== item.id)
      return current.includes(item.id) ? current : [...current, item.id]
    })
  }

  const toggleTarget = (item) => {
    const currentQuantity = Number(targetQuantities[item.id]) || 0
    setTargetQuantity(item, currentQuantity > 0 ? 0 : 1)
  }

  const clearTargets = () => {
    if (spinning) return
    setTargetQuantities({})
    setTargetOrder([])
  }

  const runUpgrade = async () => {
    if (!isReady) return
    if (!user) {
      setAuthModalOpen(true)
      return
    }
    if (mode === 'coins' && wager > Number(balance || 0)) {
      notifications.insufficientCoins()
      return
    }
    if (!chanceIsInRange) return

    const wagerInventoryUuids = mode === 'items' ? selectedItems.map((item) => item.id) : []
    const targetStockUuids = selectedTargets.flatMap(({ item, quantity }) => item.stockUuids.slice(0, quantity))
    if (targetStockUuids.length !== targetCount) {
      notifications.error('One or more target items are no longer available.')
      return
    }

    window.clearTimeout(spinTimer.current)
    const requestId = pendingRequestId.current || window.crypto.randomUUID()
    pendingRequestId.current = requestId
    const startingBalance = Number(balance || 0)
    balanceBeforeSpin.current = startingBalance
    holdBalanceDisplay(mode === 'coins' ? Math.max(0, startingBalance - wager) : startingBalance)
    window.dispatchEvent(new CustomEvent('wallet:animation-start'))
    setSpinning(true)

    try {
      const response = await apiRequest('/api/upgrader/play', {
        method: 'POST',
        body: JSON.stringify({
          request_id: requestId,
          wager_mode: mode,
          roll_mode: rollMode,
          coin_wager: mode === 'coins' ? wager : 0,
          wager_inventory_uuids: wagerInventoryUuids,
          target_stock_uuids: targetStockUuids,
          zone_start_degrees: normalizeWheelAngle(zoneStartAngle),
        }),
      })
      pendingRequestId.current = null
      const serverRoll = Number(response?.roll)
      if (!Number.isFinite(serverRoll) || serverRoll < 0 || serverRoll >= 100) {
        throw new Error('The server returned an invalid Upgrader roll.')
      }

      setRotation((current) => (Math.ceil(current / 360) + FULL_SPIN_TURNS) * 360 + serverRoll * 3.6)
      if (spinAudioRef.current) {
        spinAudioRef.current.currentTime = 0
        spinAudioRef.current.play().catch(() => {})
      }

      spinTimer.current = window.setTimeout(() => {
        if (spinAudioRef.current) {
          spinAudioRef.current.pause()
          spinAudioRef.current.currentTime = 0
        }
        const didWin = Boolean(response.won)
        const resultAudio = didWin ? winAudioRef.current : loseAudioRef.current
        if (resultAudio) {
          resultAudio.currentTime = 0
          resultAudio.play().catch(() => {})
        }

        releaseBalanceDisplay(Number(response.balance ?? startingBalance))
        balanceBeforeSpin.current = null
        if (response.profile) applyProfileUpdate(response.profile)
        setSelectedItems([])
        setInventoryItems((current) => current.filter((item) => !wagerInventoryUuids.includes(item.id)))
        setTargetQuantities({})
        setTargetOrder([])
        setPoolRefreshKey((current) => current + 1)
        setSpinning(false)
        window.dispatchEvent(new CustomEvent('wallet:animation-end'))
        window.dispatchEvent(new CustomEvent('wallet:updated'))
      }, SPIN_DURATION)
    } catch (error) {
      if (error?.status) pendingRequestId.current = null
      releaseBalanceDisplay(startingBalance)
      balanceBeforeSpin.current = null
      setSpinning(false)
      window.dispatchEvent(new CustomEvent('wallet:animation-end'))
      if (error?.status === 401) setAuthModalOpen(true)
      notifications.error(error?.message || 'Unable to complete this upgrade.')
    }
  }

  const removeSelectedItem = (item) => {
    if (spinning) return
    setSelectedItems((items) => items.filter((candidate) => candidate.id !== item.id))
  }

  const toggleInventoryItem = (item) => {
    if (spinning) return
    setSelectedItems((items) => (
      items.some((candidate) => candidate.id === item.id)
        ? items.filter((candidate) => candidate.id !== item.id)
        : [...items, item]
    ))
  }

  const openInventory = () => {
    if (!user) {
      setAuthModalOpen(true)
      return
    }
    setInventoryOpen(true)
  }

  const referenceLayout = (
    <>
      <ReferenceUpgraderLayout
        model={{
          expandedTargets,
          filteredPool,
          inventoryError,
          inventoryItems,
          inventoryLoading,
          isReady,
          openInventory,
          poolError,
          poolItems,
          poolLoading,
          poolSearch,
          rotation,
          runUpgrade,
          selectedItems,
          setPoolSearch,
          setTargetQuantity,
          spinning,
          targetCount,
          targetQuantities,
          targetValue,
          toggleInventory: toggleInventoryItem,
          toggleTarget,
          wager,
          wheelChance,
          winZonePath,
        }}
      />
      {inventoryOpen ? (
        <InventoryModal
          initialItems={selectedItems}
          inventoryItems={inventoryItems}
          loading={inventoryLoading}
          error={inventoryError}
          onClose={() => setInventoryOpen(false)}
          onConfirm={(items) => {
            setSelectedItems(items)
            setInventoryOpen(false)
          }}
        />
      ) : null}
    </>
  )

  return referenceLayout

  // Legacy layout retained below as a rollback-safe reference while the copied UI settles.
  return (
    <div className="upgrader-page">
      <style>{UPGRADER_CSS}</style>

      <div className="upgrader-arena">
        <section className="upgrader-left-panel">
          {mode === 'items' ? (
            <>
              <div className="upgrader-panel-head">
                <span className="upgrader-panel-label">Your Items</span>
                {itemWager > 0 ? <span className="upgrader-selected-value"><CoinValue value={itemWager} /></span> : null}
              </div>
              <div className="upgrader-items-wrapper">
                {selectedItems.length ? (
                  <div className="upgrader-inventory-selected-grid">
                    {selectedItems.map((item) => (
                      <ItemCard key={item.id} item={item} selected compact onClick={() => removeSelectedItem(item)} />
                    ))}
                  </div>
                ) : (
                  <div className="upgrader-empty-state">
                    <p>No items selected</p>
                    <p>Click the button below to pick items</p>
                  </div>
                )}
              </div>
              <button type="button" className="upgrader-primary-btn upgrader-open-inventory" disabled={spinning} onClick={openInventory}>
                {selectedItems.length ? `Change Items (${selectedItems.length})` : 'Select Items from Inventory'}
              </button>
            </>
          ) : (
            <>
              <div className="upgrader-panel-head"><span className="upgrader-panel-label">Play Amount</span></div>
              <div className="upgrader-coin-wrap">
                <div className="upgrader-coin-controls">
                  <div className="upgrader-amount-wrap">
                    <img className="upgrader-amount-icon" src={COIN_ICON} alt="" />
                    <input
                      className="upgrader-amount-input"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="Enter coin amount..."
                      value={coinAmount ? formatValue(coinAmount) : ''}
                      onChange={(event) => updateCoinAmount(event.target.value)}
                      disabled={spinning}
                    />
                  </div>
                  <div className="upgrader-slider-row">
                    <span className="upgrader-slider-label">Win chance</span>
                    <span className="upgrader-slider-value">{chance.toFixed(1)}%</span>
                  </div>
                  <input
                    className="upgrader-slider"
                    type="range"
                    min={MIN_CHANCE}
                    max={MAX_CHANCE}
                    step="1"
                    value={Math.max(MIN_CHANCE, Math.round(chance))}
                    disabled={!targetValue || spinning}
                    onChange={(event) => setDesiredChance(event.target.value)}
                    style={{ '--slider-fill': `${(chance / MAX_CHANCE) * 100}%` }}
                    aria-label="Win chance"
                  />
                  <div className="upgrader-quick-row">
                    {[10, 25, 50, MAX_CHANCE].map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        className="upgrader-secondary-btn upgrader-quick-btn"
                        disabled={!targetValue || spinning}
                        onClick={() => setDesiredChance(amount)}
                      >
                        {amount === MAX_CHANCE ? 'MAX' : `${amount}%`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        <section className="upgrader-center-panel">
          <div className="upgrader-wheel-tabs" role="tablist" aria-label="Upgrade currency">
            <button type="button" role="tab" aria-selected={mode === 'items'} className={`upgrader-wheel-tab ${mode === 'items' ? 'is-active' : ''}`} disabled={spinning} onClick={() => selectMode('items')}>Items</button>
            <button type="button" role="tab" aria-selected={mode === 'coins'} className={`upgrader-wheel-tab ${mode === 'coins' ? 'is-active' : ''}`} disabled={spinning} onClick={() => selectMode('coins')}>Coins</button>
          </div>
          <div className="upgrader-wheel-wrap">
            <div className="upgrader-wheel-circle" style={{ '--wheel-glow': 'rgba(104,84,224,.1)' }}>
              <div className="upgrader-wheel-ring">
                <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ overflow: 'visible' }}>
                  <circle cx="50" cy="50" r="48.5" strokeWidth="3" fillOpacity="0" stroke="rgba(255,255,255,.06)" />
                  {winZonePath ? (
                    <path
                      className="upgrader-wheel-zone"
                      d={winZonePath}
                      stroke="rgb(104,84,224)"
                      strokeWidth="3"
                      fill="none"
                      strokeLinecap="butt"
                    />
                  ) : null}
                  {winZonePath && !spinning ? (
                    <path
                      className="upgrader-wheel-hit-area"
                      d={winZonePath}
                      stroke="transparent"
                      strokeWidth="12"
                      fill="none"
                      onPointerDown={startZoneDrag}
                      onPointerMove={moveZoneDrag}
                      onPointerUp={endZoneDrag}
                      onPointerCancel={endZoneDrag}
                      onLostPointerCapture={() => { zoneDrag.current = null }}
                      aria-label="Drag to reposition the win zone"
                    />
                  ) : null}
                </svg>
              </div>
              <div
                className="upgrader-wheel-arrow"
                style={{
                  transform: `rotate(${rotation}deg)`,
                  transition: spinning
                    ? `transform ${SPIN_DURATION}ms cubic-bezier(0.15, 0.5, 0.25, 1)`
                    : 'transform 0.5s',
                }}
              >
                <svg width="22" height="13" viewBox="0 0 19 11" fill="none" aria-hidden="true">
                  <path fillRule="evenodd" clipRule="evenodd" stroke="hsl(236 30% 70%)" strokeWidth="1.2" d="M17.0018 10.6785L9.51074 3.04363L1.97832 10.6785C0.985035 11.7103 -0.711828 10.0182 0.322845 8.98646L8.80716 0.278569C9.17965 -0.0928575 9.80045 -0.0928575 10.1315 0.278569L18.6986 8.98646C19.6919 10.0182 17.9951 11.7102 17.0018 10.6785Z" fill="hsl(236 30% 70%)" />
                </svg>
              </div>
              <div className="upgrader-wheel-center">
                <span className={`upgrader-wheel-pct ${wheelChance ? '' : 'is-empty'}`}>
                  {wheelChance ? <>{wheelChance.toFixed(2)}<span className="upgrader-wheel-percent">%</span></> : '—'}
                </span>
                <p className="upgrader-wheel-label">{wheelChance ? 'chance' : 'select items'}</p>
              </div>
            </div>
            <button type="button" className="upgrader-fairness-btn" onClick={() => setFairnessOpen(true)} title="Provably fair">
              <FairnessShieldIcon /> Fairness
            </button>
          </div>
          <div className="upgrader-upgrade-wrap">
            <button type="button" className="upgrader-primary-btn upgrader-upgrade-btn" disabled={!isReady} onClick={runUpgrade}>
              {spinning ? 'Upgrading...' : 'Upgrade'}
            </button>
            <div className="upgrader-roll-modes">
              <button type="button" className={`upgrader-secondary-btn upgrader-roll-mode ${rollMode === 'under' ? 'is-active' : ''}`} disabled={spinning} onClick={() => selectRollMode('under')}>Roll Under</button>
              <button type="button" className={`upgrader-secondary-btn upgrader-roll-mode ${rollMode === 'over' ? 'is-active' : ''}`} disabled={spinning} onClick={() => selectRollMode('over')}>Roll Over</button>
            </div>
          </div>
        </section>

        <section className="upgrader-target-panel">
          <div className="upgrader-target-blob" style={{ '--target-glow': targetCount ? `rgba(${targetAccent},.32)` : 'rgba(255,79,163,.18)' }} />
          {targetCount ? (
            <>
              <div className="upgrader-target-arrows" style={{ '--target-accent': targetAccent }}>
                <TargetArrow className="is-top-left" gradientId="upgrader-arrow-gradient-top-left" accent={targetAccent} />
                <TargetArrow className="is-bottom-left delay-150" delay="150ms" gradientId="upgrader-arrow-gradient-bottom-left" accent={targetAccent} />
                <TargetArrow className="is-top-right" delay="75ms" gradientId="upgrader-arrow-gradient-top-right" accent={targetAccent} />
              </div>
            <div className="upgrader-target-content">
              <div
                className="upgrader-target-grid"
                style={{
                  gridTemplateColumns: `repeat(${targetPreviewColumns}, var(--target-thumb-size))`,
                  gridTemplateRows: `repeat(${targetPreviewRows}, var(--target-thumb-size))`,
                }}
              >
                {previewTargets.map((item, index) => (
                  <button
                    key={`${item.id}-${index}`}
                    type="button"
                    className="upgrader-target-thumb"
                    title="Click to remove"
                    disabled={spinning}
                    onClick={() => setTargetQuantity(item, (Number(targetQuantities[item.id]) || 0) - 1)}
                  >
                    <img src={item.image} alt={item.name} onError={safeImage} />
                    {expandedTargets.length > 9 && index === previewTargets.length - 1 ? (
                      <span className="upgrader-target-overflow">+{expandedTargets.length - 8}</span>
                    ) : null}
                  </button>
                ))}
              </div>
              <div className="upgrader-target-summary">
                <p className="upgrader-target-name">{targetCount} {targetCount === 1 ? 'item' : 'items'} selected</p>
                <p className="upgrader-target-value"><CoinValue value={targetValue} /></p>
              </div>
              <button type="button" className="upgrader-primary-btn upgrader-danger-btn upgrader-clear-target" disabled={spinning} onClick={clearTargets}>✕ Clear</button>
            </div>
            </>
          ) : (
            <div className="upgrader-target-empty">
              <p>Select item to start playing</p>
              <p>Click on pool item to select it</p>
            </div>
          )}
        </section>
      </div>

      <section className="upgrader-pool-section">
        <div className="upgrader-pool-head">
          <span className="upgrader-pool-title">{mode === 'coins' ? 'Coin Pool' : 'Item Pool'}</span>
          <span className="upgrader-pool-count">{poolItemCount} items</span>
          {targetCount ? <span className="upgrader-pool-count upgrader-target-count">{targetCount}/{MAX_TARGETS} targets</span> : null}
          <span className="upgrader-pool-spacer" />
          <label className="upgrader-search-wrap">
            <input value={poolSearch} onChange={(event) => setPoolSearch(event.target.value)} placeholder="Search pool..." />
            <Search aria-hidden="true" />
          </label>
        </div>
        <div className="upgrader-pool-items">
          <div className="upgrader-pool-grid">
            {!poolLoading && !poolError ? filteredPool.map((item) => (
              <PoolItemCard
                key={item.id}
                item={item}
                quantity={Number(targetQuantities[item.id]) || 0}
                totalSelected={targetCount}
                onToggle={() => toggleTarget(item)}
                onQuantityChange={(quantity) => setTargetQuantity(item, quantity)}
              />
            )) : null}
          </div>
          {poolLoading ? <div className="upgrader-empty-state"><p>Loading pool...</p></div> : null}
          {!poolLoading && poolError ? <div className="upgrader-empty-state"><p>{poolError}</p></div> : null}
          {!poolLoading && !poolError && !filteredPool.length ? <div className="upgrader-empty-state"><p>No matching items</p></div> : null}
        </div>
      </section>

      {inventoryOpen ? (
        <InventoryModal
          initialItems={selectedItems}
          inventoryItems={inventoryItems}
          loading={inventoryLoading}
          error={inventoryError}
          onClose={() => setInventoryOpen(false)}
          onConfirm={(items) => {
            setSelectedItems(items)
            setInventoryOpen(false)
          }}
        />
      ) : null}
      {fairnessOpen ? <CoinflipFairnessModal onClose={() => setFairnessOpen(false)} /> : null}
    </div>
  )
}
