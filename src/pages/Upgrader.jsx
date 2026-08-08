import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search } from 'lucide-react'
import InventoryItemCard, { inventoryItemCardStyles } from '../components/InventoryItemCard'
import { notifications } from '../components/Notifications'
import SortDirectionIcon from '../components/SortDirectionIcon'
import { apiRequest } from '../lib/apiClient'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../store/auth'

const COIN_ICON = '/bobux.png'
const MAX_TARGETS = 25
const MIN_CHANCE = 1
const MAX_CHANCE = 75
const UPGRADE_RETURN = 90
const SPIN_DURATION = 5000
const FULL_SPIN_TURNS = 8
const SPIN_SOUND = '/money-D3u6qQYl.mp3'
const WIN_SOUND = '/upgrader_win-B7YBQOH1.mp3'
const LOSE_SOUND = '/upgrader_lose-Bvgxc2nW.mp3'

function formatValue(value) {
  return Math.max(0, Number(value) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
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

function TargetArrow({ className, delay = '0ms' }) {
  return (
    <svg className={`upgrader-target-arrow ${className}`} style={{ animationDelay: delay }} viewBox="0 0 675.01 561.83" aria-hidden="true">
      <polygon points="148.47 83.06 53.14 83.06 183.66 276.14 53.14 476.5 148.47 476.5 278.99 276.14 148.47 83.06" />
      <polygon points="286.12 49.24 190.79 49.24 343.02 276.14 188.05 512.59 283.38 512.59 438.35 276.14 286.12 49.24" />
      <polygon points="461.35 83.06 366.02 83.06 496.54 276.14 366.02 476.5 461.35 476.5 591.87 276.14 461.35 83.06" />
    </svg>
  )
}

function InventoryBagIcon() {
  return (
    <svg className="upgrader-inventory-bag-icon" viewBox="0 0 260 320" aria-hidden="true">
      <path fill="#6c63ff" d="M50 110c0-40 30-90 80-90s80 50 80 90v150c0 25-20 45-45 45H95c-25 0-45-20-45-45V110z" />
      <path fill="#5a55e6" d="M60 120c0-35 28-80 70-80s70 45 70 80v20H60v-20z" />
      <path fill="#4a43c9" d="M110 40h40c8 0 12 10 12 20v10H98V60c0-10 4-20 12-20z" />
      <path fill="#7a72ff" d="M60 180h140v75c0 20-15 35-35 35H95c-20 0-35-15-35-35v-75z" />
      <path fill="#6c63ff" d="M60 180h140v25H60v-25z" />
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

function AutoSelectIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 9v10.4c0 .56 0 .84.109 1.054.096.188.249.341.437.437C3.76 21 4.04 21 4.598 21H15M17 8l-4 4-2-2M7 13.8V6.2c0-1.12 0-1.68.218-2.108a2 2 0 0 1 .874-.874C8.52 3 9.08 3 10.2 3h7.6c1.12 0 1.68 0 2.108.218.376.192.682.498.874.874C21 4.52 21 5.08 21 6.2v7.6c0 1.12 0 1.68-.218 2.108a2 2 0 0 1-.874.874C19.48 17 18.922 17 17.804 17h-7.607c-1.118 0-1.678 0-2.105-.218a2 2 0 0 1-.874-.874C7 15.48 7 14.92 7 13.8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function FairnessShieldIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="#00e284" width="14" height="14" viewBox="0 0 347.971 347.971" aria-hidden="true">
      <path d="M317.309,54.367C257.933,54.367,212.445,37.403,173.98,0C135.519,37.403,90.033,54.367,30.662,54.367 c0,97.405-20.155,236.937,143.317,293.604C337.463,291.305,317.309,151.773,317.309,54.367z M162.107,225.773l-47.749-47.756 l21.379-21.378l26.37,26.376l50.121-50.122l21.378,21.378L162.107,225.773z" />
    </svg>
  )
}

function CopySeedIcon({ label, value }) {
  const copyValue = () => {
    navigator.clipboard?.writeText(String(value)).catch(() => {})
  }

  return (
    <svg
      stroke="currentColor"
      fill="none"
      strokeWidth="2"
      viewBox="0 0 24 24"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="upgrader-fairness-copy-icon"
      aria-label={label}
      role="button"
      tabIndex="0"
      height="1em"
      width="1em"
      xmlns="http://www.w3.org/2000/svg"
      onClick={copyValue}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          copyValue()
        }
      }}
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
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

  const autoSelect = () => {
    setChosen(new Set(filtered.slice(0, 6).map((item) => item.id)))
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
          <button type="button" className="upgrader-secondary-btn upgrader-inventory-auto" aria-label="Auto select items" title="Auto Select" disabled={loading || Boolean(error) || !filtered.length} onClick={autoSelect}>
            <AutoSelectIcon />
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

function FairnessModal({ onClose, gameActive = false }) {
  const [clientSeed, setClientSeed] = useState('')
  const [hashedServerSeed, setHashedServerSeed] = useState('Loading...')
  const [nonce, setNonce] = useState(0)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [previousSeed, setPreviousSeed] = useState(null)

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

  useEffect(() => {
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
  }, [])

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
    } catch (error) {
      notifications.error(error?.message || 'Unable to change Upgrader seed.')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="upgrader-fairness-overlay" role="dialog" aria-modal="true" aria-labelledby="upgrader-fairness-title" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="upgrader-fairness-modal">
        <button className="upgrader-fairness-close" type="button" onClick={onClose} aria-label="Close fairness details">×</button>
        <h1 id="upgrader-fairness-title" className="upgrader-fairness-header">Upgrader Fairness</h1>
        <p className="upgrader-fairness-hint">Single-player house games use a separate provably-fair system that keeps you in full control, the active server seed stays hidden, only its hash is shown. Changing your client seed generates a brand-new server seed and reveals the previous one, so you can verify all your past games.</p>

        <div className="upgrader-fairness-section">
          <span className="upgrader-fairness-section-title">Hashed Server Seed</span>
          <div className="upgrader-fairness-input-holder">
            <span className="upgrader-fairness-value">{hashedServerSeed}</span>
            <CopySeedIcon label="Copy hashed server seed" value={hashedServerSeed} />
          </div>
        </div>

        <div className="upgrader-fairness-section">
          <span className="upgrader-fairness-section-title">Client Seed</span>
          <div className="upgrader-fairness-seed-row">
            <input
              type="text"
              className="upgrader-fairness-seed-input"
              maxLength="128"
              placeholder="Your client seed"
              autoComplete="off"
              spellCheck="false"
              disabled={loading || saving || gameActive}
              value={clientSeed}
              onChange={(event) => setClientSeed(event.target.value)}
            />
            <button type="button" className="upgrader-secondary-btn upgrader-fairness-random" disabled={loading || saving || gameActive} title="Generate a random 12-character seed" onClick={randomizeClientSeed}>Random</button>
          </div>
        </div>

        <div className="upgrader-fairness-section">
          <span className="upgrader-fairness-section-title">Nonce</span>
          <div className="upgrader-fairness-input-holder">
            <span className="upgrader-fairness-value">{nonce}</span>
            <CopySeedIcon label="Copy nonce" value={nonce} />
          </div>
        </div>

        <button type="button" className="upgrader-primary-btn upgrader-fairness-save" disabled={loading || saving || gameActive || !clientSeed.trim()} onClick={rotateServerSeed}>{saving ? 'Changing...' : 'Change Seed'}</button>
        <p className="upgrader-fairness-note">Entering the same client seed still rotates the server seed (and reveals the old one). You can't change it while a game is active.</p>

        {previousSeed?.serverSeed ? (
          <div className="upgrader-fairness-reveal-box">
            <span className="upgrader-fairness-reveal-title">Previous Server Seed</span>
            <span className="upgrader-fairness-reveal-description">This seed is retired. Hash it with SHA-256 and use it with the client seed and nonce below to verify the previous roll.</span>
            <div className="upgrader-fairness-input-holder upgrader-fairness-reveal-value">
              <span className="upgrader-fairness-value">{previousSeed.serverSeed}</span>
              <CopySeedIcon label="Copy revealed server seed" value={previousSeed.serverSeed} />
            </div>
            <div className="upgrader-fairness-reveal-meta">
              <span>Client Seed: <b>{previousSeed.clientSeed || 'Unavailable'}</b></span>
              <span>Nonce: <b>{previousSeed.nonce}</b></span>
              {previousSeed.roll !== null && previousSeed.roll !== undefined ? <span>Roll: <b>{Number(previousSeed.roll).toFixed(8)}</b></span> : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>,
    document.body,
  )
}

const UPGRADER_CSS = `
${inventoryItemCardStyles}
.upgrader-page {
  --accent: #6c63ff;
  --accent-light: #8079ff;
  --accent-dark: #5a51e6;
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
.upgrader-primary-btn { border-color: rgba(94,85,217,.4); background: linear-gradient(135deg,#5b52e2,#4038c0); box-shadow: 0 2px 8px rgba(108,99,255,.2); }
.upgrader-secondary-btn { border-color: transparent; background: #2a2e44; color: #e1e4f2; box-shadow: none; }
.upgrader-primary-btn:hover:not(:disabled) { background: linear-gradient(135deg,#6c63ff,#5147d9); }
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
.upgrader-wheel-tab.is-active { border-color: rgba(94,85,217,.4); background: linear-gradient(135deg,#5b52e2,#4038c0); color: #fff; box-shadow: 0 2px 8px rgba(108,99,255,.18); }
.upgrader-wheel-tab.is-active:hover:not(:disabled) { border-color: rgba(94,85,217,.4); background: linear-gradient(135deg,#6c63ff,#5147d9); color: #fff; }
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
.upgrader-roll-mode.is-active { border-color: rgba(94,85,217,.4); background: linear-gradient(135deg,#5b52e2,#4038c0); color: #fff; box-shadow: 0 2px 8px rgba(108,99,255,.18); }
.upgrader-roll-mode.is-active:hover:not(:disabled) { border-color: rgba(94,85,217,.4); background: linear-gradient(135deg,#6c63ff,#5147d9); color: #fff; }
.upgrader-target-panel { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; cursor: default; }
.upgrader-target-blob { position: absolute; z-index: 1; top: 50%; left: 50%; width: 320px; height: 260px; border-radius: 50%; background: radial-gradient(ellipse at center,var(--target-glow,rgba(108,99,255,.18)) 0%,transparent 70%); filter: blur(32px); opacity: 1; transform: translate(-50%,-50%); pointer-events: none; transition: background 1.2s ease,opacity .8s ease; }
.upgrader-target-empty { position: relative; z-index: 10; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 24px; }
.upgrader-target-empty p { color: #6b7280; font-size: 12px; font-weight: 500; letter-spacing: .04em; text-align: center; text-transform: uppercase; cursor: default; }
.upgrader-target-content { position: relative; z-index: 10; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 24px; }
.upgrader-target-arrows { position: absolute; z-index: 2; inset: 0; pointer-events: none; }
.upgrader-target-arrow { position: absolute; width: 28px; fill: rgb(var(--target-accent,255,105,180)); opacity: .55; animation: upgrader-arrow-pulse 1.8s ease-in-out infinite; }
.upgrader-target-arrow.is-top-left { top: 15%; left: 16%; transform: rotate(-90deg); }
.upgrader-target-arrow.is-bottom-left { bottom: 20%; left: 14%; transform: rotate(-90deg); }
.upgrader-target-arrow.is-top-right { top: 38%; right: 14%; transform: rotate(90deg); }
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
.upgrader-slider { width: 100%; height: 6px; border-radius: 999px; outline: none; appearance: none; background: linear-gradient(to right,#6c63ff 0%,#6c63ff var(--slider-fill,0%),#2a2e44 var(--slider-fill,0%),#2a2e44 100%); cursor: pointer; }
.upgrader-slider:disabled { opacity: .45; cursor: not-allowed; }
.upgrader-slider::-webkit-slider-thumb { width: 16px; height: 16px; border: 2px solid var(--accent); border-radius: 50%; appearance: none; background: #fff; box-shadow: 0 2px 6px rgba(108,99,255,.4); cursor: pointer; transition: transform .15s; }
.upgrader-slider::-webkit-slider-thumb:hover { transform: scale(1.15); }
.upgrader-quick-row { display: grid; grid-template-columns: repeat(4,1fr); gap: 6px; }
.upgrader-quick-btn { min-width: 0; height: 32px; padding: 0; font-size: 12px; }
.upgrader-inventory-overlay, .upgrader-fairness-overlay {
  --accent: #6c63ff;
  --accent-light: #8079ff;
  --accent-dark: #5a51e6;
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
.upgrader-inventory-auto { width: var(--btn-height); height: var(--btn-height); min-width: 0; flex-shrink: 0; padding: 0; }
.upgrader-inventory-add { min-width: 190px; padding: 0 16px; white-space: nowrap; }
.upgrader-inventory-confirm-label { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; line-height: 1; }
.upgrader-inventory-confirm-value { display: inline-flex; align-items: center; line-height: 1; }
.upgrader-inventory-confirm-value img { display: block; width: 15px; height: 15px; flex-shrink: 0; margin-right: 5px; }
.upgrader-inventory-confirm-value span { display: inline-flex; align-items: center; line-height: 1; }
.upgrader-inventory-empty { position: absolute; top: 50%; left: 50%; display: flex; width: 100%; height: 100%; flex-direction: column; align-items: center; justify-content: center; text-align: center; transform: translate(-50%,-50%); }
.upgrader-inventory-empty h1 { margin-bottom: 8px; color: #ddd; font-size: 20px; }
.upgrader-inventory-empty p { margin-bottom: 15px; color: #aaa; }
.upgrader-fairness-overlay { position: fixed; z-index: 10010; inset: 0; display: flex; align-items: center; justify-content: center; padding: 16px; background-color: rgba(0,0,0,.55); animation: upgrader-overlay-in .5s ease-out; }
.upgrader-fairness-modal { position: relative; width: 90%; max-width: 600px; height: auto; max-height: 90vh; box-sizing: border-box; overflow-x: hidden; overflow-y: auto; padding: 2rem; border: 1px solid #181a28; border-radius: 5px; background-color: #131520; box-shadow: 0 20px 80px rgba(0,0,0,.55); color: #e1e4f2; animation: upgrader-fairness-modal-in .3s forwards; }
.upgrader-fairness-close { position: absolute; z-index: 1000; top: 15px; right: 15px; border: none; background: none; color: #e1e4f2; font-size: 24px; line-height: normal; opacity: .85; cursor: pointer; transition: opacity .3s ease; }
.upgrader-fairness-close:hover { opacity: 1; }
.upgrader-fairness-header { margin-bottom: 1rem; color: #fff; font-size: 1.3em; font-weight: 700; }
.upgrader-fairness-hint { padding: .7rem .9rem; margin: 0 0 1.3rem; border-radius: var(--radius-sm); background: rgba(90,170,255,.1); color: #7ec8ff; font-size: .82rem; line-height: 1.5; }
.upgrader-fairness-section { margin-bottom: 1.4rem; }
.upgrader-fairness-section-title { display: block; margin-bottom: .4em; color: rgba(225,228,242,.7); font-size: .9rem; font-weight: 600; letter-spacing: .6px; text-transform: uppercase; }
.upgrader-fairness-input-holder { display: flex; max-width: 100%; align-items: center; justify-content: space-between; padding: .35rem 1rem; margin-bottom: 1rem; border: none; border-radius: var(--radius-sm); background: var(--surface-1); }
.upgrader-fairness-copy-icon { flex-shrink: 0; padding: .6rem; border-radius: 8px; color: #e1e4f2; opacity: .9; cursor: pointer; transition: all .2s ease; }
.upgrader-fairness-copy-icon:hover { color: #fff; opacity: 1; }
.upgrader-fairness-copy-icon:focus-visible { outline: 2px solid var(--accent-light); outline-offset: 1px; }
.upgrader-fairness-value { max-width: 22ch; flex-shrink: 1; overflow: hidden; color: #e1e4f2; font-family: monospace; text-overflow: ellipsis; white-space: nowrap; }
.upgrader-fairness-seed-row { display: flex; align-items: center; gap: 8px; }
.upgrader-fairness-seed-input { height: 42px; min-width: 0; flex: 1; padding: 0 12px; border: none; border-radius: var(--radius-sm); outline: none; background: var(--surface-1); color: #e1e4f2; font-family: monospace; font-size: .95rem; font-weight: 600; }
.upgrader-fairness-random { height: 42px; min-width: 0; flex-shrink: 0; padding: 0 16px; font-size: .85rem; }
.upgrader-fairness-save { width: 100%; height: 44px; min-width: 0; margin-top: .4rem; font-size: .95rem; }
.upgrader-fairness-note { margin: .55rem 0 0; color: rgba(225,228,242,.4); font-size: .75rem; line-height: 1.4; text-align: center; }
.upgrader-fairness-reveal-box { padding: 1rem; margin-top: 1.4rem; border-radius: 6px; background: rgba(108,99,255,.06); }
.upgrader-fairness-reveal-title { display: block; color: #e1e4f2; font-size: .92rem; font-weight: 700; }
.upgrader-fairness-reveal-description { display: block; margin-top: .35rem; color: rgba(225,228,242,.55); font-size: .76rem; line-height: 1.45; }
.upgrader-fairness-reveal-value { margin-top: .6rem; margin-bottom: 0; }
.upgrader-fairness-reveal-meta { display: flex; flex-wrap: wrap; gap: .35rem 1rem; margin-top: .7rem; color: rgba(225,228,242,.55); font-size: .75rem; }
.upgrader-fairness-reveal-meta b { color: #e1e4f2; font-family: monospace; font-weight: 600; }
@keyframes upgrader-fade-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@keyframes upgrader-overlay-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes upgrader-modal-in { from { opacity: 0; transform: scale(.93); } to { opacity: 1; transform: scale(1); } }
@keyframes upgrader-fairness-modal-in { from { opacity: 0; transform: scale(.95) translateY(15px); } to { opacity: 1; transform: scale(1) translateY(0); } }
@keyframes upgrader-arrow-pulse { 0%,100% { opacity: .55; } 50% { opacity: .9; } }
@container (max-width: 850px) {
  .upgrader-target-content { padding-right: 4px; padding-left: 4px; }
  .upgrader-target-grid { --target-thumb-size: 50px; }
  .upgrader-target-thumb { width: 50px; height: 50px; min-width: 50px; min-height: 50px; }
  .upgrader-target-arrow { display: none; }
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
  .upgrader-fairness-modal { width: 100%; max-width: 100%; height: 100%; max-height: 100%; padding: 2rem; margin: 0; border-radius: 0; overflow-x: hidden; overflow-y: auto; }
  .upgrader-fairness-header { margin-top: 20px; }
  .upgrader-fairness-input-holder { width: 100%; max-width: 100%; box-sizing: border-box; }
  .upgrader-fairness-close { margin-top: 30px; }
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
  .upgrader-inventory-auto { min-width: 0; min-height: 40px; flex: 1 1 120px; padding: 0 8px; font-size: 13px; }
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
    if (!inventoryOpen || !user) return undefined

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
  }, [inventoryOpen, setAuthModalOpen, user?.id, user?.profile_id])

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

  const openInventory = () => {
    if (!user) {
      setAuthModalOpen(true)
      return
    }
    setInventoryOpen(true)
  }

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
          <div className="upgrader-target-blob" style={{ '--target-glow': targetCount ? `rgba(${targetAccent},.32)` : 'rgba(108,99,255,.18)' }} />
          {targetCount ? (
            <>
              <div className="upgrader-target-arrows" style={{ '--target-accent': targetAccent }}>
                <TargetArrow className="is-top-left" />
                <TargetArrow className="is-bottom-left" delay="150ms" />
                <TargetArrow className="is-top-right" delay="75ms" />
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
      {fairnessOpen ? <FairnessModal gameActive={spinning} onClose={() => setFairnessOpen(false)} /> : null}
    </div>
  )
}
