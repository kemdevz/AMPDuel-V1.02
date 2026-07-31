import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiRequest } from '../lib/apiClient'
import { useAuth } from '../store/auth'
import DepositModal from './DepositModal'
import InventoryItemCard, { inventoryItemCardStyles } from './InventoryItemCard'
import { notifications } from './Notifications'

const COIN_ICON = '/bobux.png'

const LEVEL_OPTIONS = [
  { value: 'none', label: 'No Requirement' },
  { value: '10', label: 'Level 10+' },
  { value: '25', label: 'Level 25+' },
  { value: '50', label: 'Level 50+' },
  { value: '100', label: 'Level 100+' },
]

const SORT_OPTIONS = [
  { value: 'high', label: 'Highest to Lowest' },
  { value: 'low', label: 'Lowest to Highest' },
  { value: 'az', label: 'A to Z' },
]

const formatNumber = (value) => {
  const numericValue = Number(value ?? 0)
  return Number.isFinite(numericValue) ? numericValue.toLocaleString() : '0'
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="_giveawaySearchIcon_local" aria-hidden="true">
      <path
        fill="currentColor"
        d="M9.75 3.5a6.25 6.25 0 0 1 4.96 10.06l4.36 4.36a1 1 0 0 1-1.42 1.41l-4.35-4.35A6.25 6.25 0 1 1 9.75 3.5Zm0 2a4.25 4.25 0 1 0 0 8.5 4.25 4.25 0 0 0 0-8.5Z"
      />
    </svg>
  )
}

function SortIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg" width="16" height="16" aria-hidden="true">
      <path d="M13 12.208V7h-2v5.137l-1.086-1.086L8.5 12.466 12.036 16l3.535-3.535-1.414-1.415L13 12.208zM8 6H0v2h8V6zm6-3H0v2h14V3zm2-3H0v2h16V0zM6 9H0v2h6V9zm-2 3H0v2h4v-2z" />
    </svg>
  )
}

function ItemsIcon() {
  return (
    <svg viewBox="0 0 260 320" width="30" height="30" aria-hidden="true">
      <path fill="#6C63FF" d="M50 110c0-40 30-90 80-90s80 50 80 90v150c0 25-20 45-45 45H95c-25 0-45-20-45-45V110z" />
      <path fill="#5A55E6" d="M60 120c0-35 28-80 70-80s70 45 70 80v20H60v-20z" />
      <path fill="#4A43C9" d="M110 40h40c8 0 12 10 12 20v10H98V60c0-10 4-20 12-20z" />
      <path fill="#7A72FF" d="M60 180h140v75c0 20-15 35-35 35H95c-20 0-35-15-35-35v-75z" />
      <path fill="#6C63FF" d="M60 180h140v25H60v-25z" />
      <path stroke="#3A33A8" strokeWidth="3" d="M60 205h140" />
      <path stroke="#443CB5" strokeWidth="2" d="M130 120v140" />
      <path fill="#5850E6" d="M50 130c-10 5-20 25-20 45s10 40 20 45V130zM210 130c10 5 20 25 20 45s-10 40-20 45V130z" />
      <ellipse cx="130" cy="290" rx="90" ry="18" fill="#3B36A6" opacity=".35" />
      <path fill="#8A83FF" d="M80 230h100v30H80v-30z" />
      <path stroke="#363092" strokeWidth="3" d="M80 245h100" />
    </svg>
  )
}

function LoadingButton({ className, disabled = false, onClick, children }) {
  return (
    <button className={`${className} _giveawayLoadingButton_local`} disabled={disabled} type="button" onClick={onClick}>
      <span className="_giveawayButtonLabel_local">{children}</span>
      <span className="_giveawaySpinnerWrap_local">
        <span className="_giveawayLoaderSmall_local" />
      </span>
    </button>
  )
}

function GiveawayItemCard({ item, selected, onToggleSelect }) {
  return <InventoryItemCard item={item} selected={selected} onToggleSelect={onToggleSelect} />
}

export default function GiveawayCreateModal({ isOpen, onClose }) {
  const user = useAuth((state) => state.user)
  const [depositOpen, setDepositOpen] = useState(false)
  const [inventoryItems, setInventoryItems] = useState([])
  const [selectedItems, setSelectedItems] = useState([])
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [inventoryError, setInventoryError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortMode, setSortMode] = useState('high')
  const [levelRequirement, setLevelRequirement] = useState('none')
  const [levelMenuOpen, setLevelMenuOpen] = useState(false)
  const [timeMinutes, setTimeMinutes] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)

  useEffect(() => {
    if (!isOpen) return undefined

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !depositOpen) onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [depositOpen, isOpen, onClose])

  useEffect(() => {
    if (!isOpen) {
      setDepositOpen(false)
      setSelectedItems([])
      setSearchQuery('')
      setTimeMinutes('')
      return undefined
    }

    let isMounted = true

    const loadInventory = async () => {
      setInventoryLoading(true)
      setInventoryError(null)

      if (!user?.profile_id) {
        if (!isMounted) return
        setInventoryItems([])
        setInventoryLoading(false)
        setInventoryError(null)
        notifications.error('Please sign in to load your inventory.')
        return
      }

      try {
        const result = await apiRequest('/api/inventory')
        if (!isMounted) return
        setInventoryItems(result?.items ?? [])
      } catch (error) {
        if (!isMounted) return
        setInventoryItems([])
        setInventoryError(null)
        notifications.error(error.message || 'Failed to load inventory.')
      }

      setInventoryLoading(false)
    }

    void loadInventory()

    return () => {
      isMounted = false
    }
  }, [isOpen, user?.id, user?.profile_id])

  const displayItems = useMemo(() => {
    const expandedItems = inventoryItems.flatMap((item) => {
      const quantity = Math.max(1, Number(item.quantity ?? 1))
      return Array.from({ length: quantity }, (_, index) => ({
        ...item,
        displayKey: `${item.id || item.name || 'inventory'}-${index}`,
      }))
    })

    const normalizedQuery = searchQuery.trim().toLowerCase()
    const filteredItems = normalizedQuery
      ? expandedItems.filter((item) => String(item.name || '').toLowerCase().includes(normalizedQuery))
      : expandedItems

    return [...filteredItems].sort((a, b) => {
      if (sortMode === 'low') return Number(a.value ?? 0) - Number(b.value ?? 0)
      if (sortMode === 'az') return String(a.name || '').localeCompare(String(b.name || ''))
      return Number(b.value ?? 0) - Number(a.value ?? 0)
    })
  }, [inventoryItems, searchQuery, sortMode])

  useEffect(() => {
    if (!levelMenuOpen) return undefined

    const handlePointerDown = (event) => {
      const target = event.target
      if (target instanceof Node && !document.getElementById('giveaway-level-dropdown-root')?.contains(target)) {
        setLevelMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [levelMenuOpen])

  if (!isOpen || typeof document === 'undefined') return null

  const selectedDisplayItems = displayItems.filter((item) => selectedItems.includes(item.displayKey))
  const selectedValue = selectedDisplayItems.reduce((sum, item) => sum + Number(item.value ?? 0), 0)
  const totalInventoryValue = inventoryItems.reduce((sum, item) => sum + Number(item.value ?? 0), 0)
  const totalInventoryCount = inventoryItems.reduce((sum, item) => sum + Math.max(1, Number(item.quantity ?? 1)), 0)
  const timeValue = Number(timeMinutes)
  const canCreate = selectedItems.length > 0 && Number.isFinite(timeValue) && timeValue >= 1 && timeValue <= 30
  const activeSortLabel = SORT_OPTIONS.find((option) => option.value === sortMode)?.label ?? 'Highest to Lowest'
  const selectedLevelLabel = LEVEL_OPTIONS.find((option) => option.value === levelRequirement)?.label ?? 'No Requirement'

  const handleSortToggle = () => {
    setSortMode((current) => {
      if (current === 'high') return 'low'
      if (current === 'low') return 'az'
      return 'high'
    })
  }

  const handleCreate = async () => {
    if (!canCreate || creating) return

    try {
      setCreating(true)
      setCreateError(null)

      if (!user?.profile_id) {
        throw new Error('Please sign in to create a giveaway.')
      }

      const normalizedLevelRequirement = levelRequirement === 'none' ? 0 : Number(levelRequirement)
      const result = await apiRequest('/api/giveaways', {
        method: 'POST',
        body: JSON.stringify({
          item_ids: selectedDisplayItems.map((item) => item.id),
          level_requirement: Number.isFinite(normalizedLevelRequirement) ? normalizedLevelRequirement : 0,
          duration_minutes: Number.isFinite(timeValue) ? Math.max(1, Math.min(30, Math.round(timeValue))) : 15,
        }),
      })
      const createdGiveaway = result?.giveaway

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('giveaway:created', { detail: createdGiveaway }))
      }

      notifications.success('Giveaway created successfully!')
      setSelectedItems([])
      setTimeMinutes('')
      setLevelRequirement('none')
      onClose()
    } catch (err) {
      console.error('[Giveaway] create failed', err)
      setCreateError(null)
      notifications.error(err?.message || 'Failed to create giveaway.')
    } finally {
      setCreating(false)
    }
  }

  return createPortal(
    <div
      className="_giveawayBlurBg_local"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !depositOpen) onClose()
      }}
    >
      <div className="_giveawayModal_local" role="dialog" aria-modal="true" aria-label="Create giveaway">
        <button aria-label="Close" className="_giveawayCloseButton_local" type="button" onClick={onClose}>
          &times;
        </button>

        <div className="_giveawayHeader_local">
          <div className="_giveawayHeaderControls_local">
            <div className="_giveawayInputWrapper_local">
              <input
                type="text"
                placeholder="Search for an item..."
                className="_giveawaySearchInput_local"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              <SearchIcon />
            </div>
            <button type="button" className="_giveawaySortToggle_local" aria-label={`Sort items: ${activeSortLabel}`} title={activeSortLabel} onClick={handleSortToggle}>
              <SortIcon />
            </button>
          </div>
        </div>

        <div className="_giveawayItemsWrapper_local">
          <div className="_giveawayStats_local">
            <div className="_giveawayStatItem_local">
              <img src={COIN_ICON} alt="Bobux" />
              <div className="_giveawayStatCol_local">
                <span className="_giveawayStatLabel_local">VALUE</span>
                <span className="_giveawayStatValue_local">{formatNumber(totalInventoryValue)}</span>
              </div>
            </div>
            <div className="_giveawayStatItem_local">
              <ItemsIcon />
              <div className="_giveawayStatCol_local">
                <span className="_giveawayStatLabel_local">ITEMS</span>
                <span className="_giveawayStatValue_local">{formatNumber(totalInventoryCount)}</span>
              </div>
            </div>
            <LoadingButton className="_giveawayPlusButton_local" onClick={() => setDepositOpen(true)}>
              +
            </LoadingButton>
          </div>

          <div className="_giveawayItemsGrid_local">
            {inventoryLoading ? (
              <div className="_giveawayEmptyState_local">
                <h1>Loading...</h1>
                <p>Fetching your inventory...</p>
              </div>
            ) : inventoryError ? (
              <div className="_giveawayEmptyState_local">
                <h1>Could not load inventory</h1>
                <p>{inventoryError}</p>
              </div>
            ) : displayItems.length === 0 ? (
              <div className="_giveawayEmptyState_local">
                <h1>No items!</h1>
                <p>No items were found...</p>
                <LoadingButton className="_giveawayDepositButton_local" onClick={() => setDepositOpen(true)}>
                  Deposit
                </LoadingButton>
              </div>
            ) : (
              displayItems.map((item) => (
                <GiveawayItemCard
                  key={item.displayKey}
                  item={item}
                  selected={selectedItems.includes(item.displayKey)}
                  onToggleSelect={() => {
                    setSelectedItems((prev) =>
                      prev.includes(item.displayKey)
                        ? prev.filter((key) => key !== item.displayKey)
                        : [...prev, item.displayKey],
                    )
                  }}
                />
              ))
            )}
          </div>
        </div>

        <div className="_giveawayButtonWrapper_local">
          <input
            type="number"
            min="1"
            max="30"
            placeholder="Time (min)"
            className="_giveawayTimeInput_local"
            value={timeMinutes}
            onChange={(event) => setTimeMinutes(event.target.value)}
          />
          <div id="giveaway-level-dropdown-root" className="_giveawayLevelDropdown_local">
            <button
              type="button"
              className="_giveawayLevelSelector_local"
              onClick={() => setLevelMenuOpen((prev) => !prev)}
              aria-expanded={levelMenuOpen}
              aria-label="Level requirement"
            >
              <span>{selectedLevelLabel}</span>
              <svg viewBox="0 0 24 24" className={`_giveawayLevelChevron_local${levelMenuOpen ? ' _giveawayLevelChevronOpen_local' : ''}`} aria-hidden="true">
                <path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className={`_giveawayLevelMenu_local${levelMenuOpen ? ' _giveawayLevelMenuOpen_local' : ''}`} role="menu">
              {LEVEL_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`_giveawayLevelOption_local${levelRequirement === option.value ? ' _giveawayLevelOptionActive_local' : ''}`}
                  onClick={() => {
                    setLevelRequirement(option.value)
                    setLevelMenuOpen(false)
                  }}
                  role="menuitem"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <button className="_giveawayCreateButton_local _giveawayLoadingButton_local" disabled={!canCreate || creating} type="button" onClick={handleCreate}>
            <span className="_giveawayButtonLabel_local">
              <strong className="_giveawayCreateValue_local">
                Create┃
                <span style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}>
                  <img src={COIN_ICON} alt="Bobux" style={{ width: 15, height: 15, marginRight: 6, flexShrink: 0 }} />
                  <span>{formatNumber(selectedValue)}</span>
                </span>
              </strong>
            </span>
            <span className="_giveawaySpinnerWrap_local">
              <span className="_giveawayLoaderSmall_local" />
            </span>
          </button>
        </div>

        {createError ? <p className="_giveawayCreateError_local">{createError}</p> : null}

        <style>{`
          ${inventoryItemCardStyles}
          @keyframes _giveawayFadeIn_local { from { opacity: 0; } to { opacity: 1; } }
          @keyframes _giveawayModalOpen_local { from { transform: scale(.86); opacity: 0; } to { transform: scale(1); opacity: 1; } }
          @keyframes _giveawaySpin_local { to { transform: rotate(360deg); } }

          ._giveawayBlurBg_local {
            position: fixed;
            inset: 0;
            z-index: 10050;
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: rgba(0, 0, 0, .5);
            animation: _giveawayFadeIn_local .25s ease-out;
          }

          ._giveawayModal_local {
            position: relative;
            width: 90%;
            max-width: 1200px;
            max-height: 88vh;
            box-sizing: border-box;
            padding: 15px;
            border: 1px solid #181a28;
            border-radius: 10px;
            background-color: #131520;
            color: #fff;
            overflow: visible;
            animation: _giveawayModalOpen_local .25s forwards;
          }

          ._giveawayCloseButton_local {
            position: absolute;
            top: 5px;
            right: 10px;
            z-index: 2;
            border: none;
            background: none;
            color: #fff;
            font-size: 24px;
            line-height: 1;
            cursor: pointer;
            opacity: .8;
          }

          ._giveawayCloseButton_local:hover { opacity: 1; }

          ._giveawayHeader_local {
            display: flex;
            align-items: center;
            justify-content: flex-start;
            gap: 8px;
            width: 100%;
            margin: 5px 0 10px;
            padding-right: 36px;
            box-sizing: border-box;
          }

          ._giveawayHeaderControls_local {
            display: inline-flex;
            align-items: center;
            gap: 6px;
          }

          ._giveawayInputWrapper_local {
            position: relative;
            display: flex;
            flex: 1;
          }

          ._giveawaySearchInput_local,
          ._giveawayTimeInput_local,
          ._giveawaySelector_local,
          ._giveawayLevelSelector_local {
            height: 40px;
            box-sizing: border-box;
            border: 1px solid #252839;
            border-radius: 6px;
            background: #20222f;
            color: #fff;
            outline: none;
            font-size: 14px;
            font-weight: 600;
            box-shadow: none;
          }

          ._giveawaySearchInput_local {
            width: 300px;
            padding: 10px 18px 10px 40px;
            text-align: center;
          }

          ._giveawaySearchInput_local::placeholder,
          ._giveawayTimeInput_local::placeholder {
            color: #cbd5e1;
          }

          ._giveawaySearchInput_local:focus,
          ._giveawayTimeInput_local:focus,
          ._giveawaySelector_local:focus,
          ._giveawayLevelSelector_local:focus {
            border-color: #252839;
            outline: none;
            box-shadow: none;
          }

          ._giveawaySearchIcon_local {
            position: absolute;
            left: 12px;
            top: 50%;
            width: 18px;
            height: 18px;
            color: #cbd5e1;
            transform: translateY(-50%);
            pointer-events: none;
          }

          ._giveawaySortToggle_local {
            width: 40px;
            height: 40px;
            padding: 0;
            border: none;
            border-radius: 6px;
            background: #20222f;
            color: #e1e4f2;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: background .15s;
            flex-shrink: 0;
          }

          ._giveawaySortToggle_local:hover { background: #2a2e44; }

          ._giveawaySelector_local,
          ._giveawayLevelSelector_local {
            min-width: 180px;
            padding: 0 12px;
            background: #20222f;
            border-color: #252839;
            cursor: pointer;
            transition: background .2s ease;
          }

          ._giveawayLevelDropdown_local {
            position: relative;
            min-width: 180px;
          }

          ._giveawayLevelSelector_local {
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
            gap: 8px;
          }

          ._giveawayLevelSelector_local:hover {
            background: #20222f;
          }

          ._giveawayLevelChevron_local {
            width: 16px;
            height: 16px;
            flex-shrink: 0;
            transition: transform .2s ease;
          }

          ._giveawayLevelChevronOpen_local {
            transform: rotate(180deg);
          }

          ._giveawayLevelMenu_local {
            position: absolute;
            top: calc(100% + 4px);
            left: 0;
            right: 0;
            z-index: 20;
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 6px;
            border: 1px solid #252839;
            border-radius: 8px;
            background: #20222f;
            box-shadow: none;
            max-height: 0;
            overflow: hidden;
            opacity: 0;
            transition: max-height .2s ease, opacity .2s ease;
          }

          ._giveawayLevelMenuOpen_local {
            max-height: 220px;
            opacity: 1;
          }

          ._giveawayLevelOption_local {
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
            min-height: 34px;
            padding: 0 10px;
            border: none;
            border-radius: 6px;
            background: transparent;
            color: #e1e4f2;
            font-size: 13px;
            font-weight: 600;
            text-align: left;
            cursor: pointer;
            transition: background .15s ease;
          }

          ._giveawayLevelOption_local:hover {
            background: #222531;
          }

          ._giveawayLevelOptionActive_local {
            background: #222531;
          }

          ._giveawayButtonWrapper_local button {
            position: relative;
            border-radius: 6px;
            font-weight: 450;
            transition: opacity .2s ease, transform .1s ease, background .25s ease;
          }

          ._giveawayButtonWrapper_local button:disabled {
            opacity: .6;
            cursor: not-allowed;
          }

          ._giveawayItemsWrapper_local {
            position: relative;
            height: 350px;
            margin-top: 15px;
            padding: 12px;
            overflow-x: hidden;
            overflow-y: auto;
            border-radius: 6px;
            background-color: #1c1f2e;
            scrollbar-width: none;
            -ms-overflow-style: none;
          }

          ._giveawayItemsWrapper_local::-webkit-scrollbar {
            display: none;
          }

          ._giveawayStats_local {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-top: -5px;
            margin-bottom: 12px;
          }

          ._giveawayStatItem_local {
            display: flex;
            align-items: center;
            justify-content: flex-start;
            gap: 6px;
          }

          ._giveawayStatItem_local img,
          ._giveawayStatItem_local svg {
            width: 20px;
            height: 20px;
            flex-shrink: 0;
          }

          ._giveawayStatCol_local {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 0;
          }

          ._giveawayStatLabel_local {
            color: rgba(255,255,255,.35);
            font-size: 10px;
            font-weight: 700;
            letter-spacing: .06em;
            text-transform: uppercase;
            line-height: 1;
            margin-bottom: 2px;
          }

          ._giveawayStatValue_local {
            color: #f6f6f6;
            font-size: 17px;
            font-weight: 700;
            line-height: 1;
          }

          ._giveawayItemsGrid_local {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
            gap: 8px;
          }

          ._giveawayItemCard_local {
            position: relative;
            box-sizing: border-box;
            height: 170px;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            padding: 8px;
            overflow: hidden;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            transition: transform .2s ease, box-shadow .2s ease;
          }

          ._giveawayItemCard_local::before {
            content: "";
            position: absolute;
            inset: 0;
            z-index: 0;
            padding: 2px;
            border-radius: 6px;
            background: linear-gradient(to bottom, transparent 0%, var(--giveaway-border-side, rgba(108,99,255,.25)) 55%, var(--giveaway-border-bottom, rgba(108,99,255,.7)) 100%);
            -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
            -webkit-mask-composite: xor;
            mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
            mask-composite: exclude;
            pointer-events: none;
          }

          ._giveawayItemCard_local:hover,
          ._giveawayItemCardSelected_local {
            transform: scale(1.03);
          }

          ._giveawayItemCardSelected_local {
            box-shadow: 0 0 0 2px rgba(255,255,255,.14), 0 10px 25px rgba(0,0,0,.18);
          }

          ._giveawaySelectedDot_local {
            position: absolute;
            top: 10px;
            right: 10px;
            z-index: 3;
            width: 10px;
            height: 10px;
            border-radius: 30%;
            background: var(--giveaway-dot-color, #6c63ff);
            opacity: 0;
            transform: scale(.7);
            transition: opacity .2s ease, transform .2s ease;
          }

          ._giveawayItemCardSelected_local ._giveawaySelectedDot_local {
            opacity: 1;
            transform: scale(1);
          }

          ._giveawayBlurImage_local {
            position: absolute;
            top: 50%;
            left: 50%;
            z-index: 0;
            width: 80%;
            height: 80%;
            opacity: .35;
            filter: blur(18px);
            object-fit: contain;
            pointer-events: none;
            transform: translate(-50%, -60%);
          }

          ._giveawayImageWrap_local {
            position: relative;
            width: 100%;
            height: 118px;
            overflow: hidden;
            border-radius: 8px;
            flex: 0 0 118px;
          }

          ._giveawayImage_local {
            position: absolute;
            inset: 0;
            z-index: 1;
            width: 100%;
            height: 100%;
            object-fit: contain;
            border-radius: 8px;
          }

          ._giveawayItemDetails_local {
            position: relative;
            z-index: 2;
            width: 100%;
            height: 32px;
            flex: 0 0 32px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 1px;
            margin-top: 4px;
            overflow: hidden;
            text-align: center;
          }

          ._giveawayItemName_local,
          ._giveawayItemPrice_local {
            width: 100%;
            margin: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          ._giveawayItemName_local {
            color: #ccd9fa;
            font-size: 12px;
            font-weight: 600;
            line-height: 14px;
          }

          ._giveawayItemPrice_local {
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
            font-size: 13px;
            font-weight: 700;
            line-height: 15px;
          }

          ._giveawayItemPrice_local img {
            width: 15px;
            height: 15px;
            margin-right: 6px;
            flex-shrink: 0;
          }

          ._giveawayEmptyState_local {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            transform: translate(-50%, -50%);
            text-align: center;
          }

          ._giveawayEmptyState_local h1 {
            margin: 0 0 8px;
            color: #ddd;
            font-size: 20px;
            font-weight: 700;
          }

          ._giveawayEmptyState_local p {
            margin: 0 0 15px;
            color: #aaa;
          }

          ._giveawayButtonWrapper_local {
            display: flex;
            justify-content: flex-end;
            align-items: center;
            gap: 8px;
            margin-top: 15px;
          }

          ._giveawayCreateError_local {
            margin: 10px 0 0;
            color: #ff7b7b;
            font-size: 13px;
            font-weight: 600;
          }

          ._giveawayTimeInput_local {
            min-width: 120px;
            padding: 0 12px;
            appearance: textfield;
            -moz-appearance: textfield;
          }

          ._giveawayTimeInput_local::-webkit-outer-spin-button,
          ._giveawayTimeInput_local::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
          }

          ._giveawayPlusButton_local,
          ._giveawayDepositButton_local,
          ._giveawayCreateButton_local {
            position: relative;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border: 1px solid rgba(94,85,217,.4);
            background: linear-gradient(135deg,#5b52e2,#4038c0);
            color: #fff;
            box-shadow: 0 2px 8px rgba(108,99,255,.25);
            cursor: pointer;
            transition: transform .15s ease, opacity .25s ease, background .25s ease;
          }

          ._giveawayPlusButton_local {
            width: 34px;
            height: 34px;
            padding: 0;
            border-radius: 8px;
            font-size: 22px;
            font-weight: 700;
            flex-shrink: 0;
          }

          ._giveawayDepositButton_local {
            min-height: 42px;
            padding: 10px 24px;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
          }

          ._giveawayCreateButton_local {
            min-width: 190px;
            min-height: 42px;
            padding: 0 16px;
            border: 1px solid rgba(94,85,217,.4);
            background: linear-gradient(135deg, #5b52e2, #4038c0);
            color: #fff;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 700;
            box-shadow: 0 2px 8px rgba(108,99,255,.2);
            display: inline-flex;
            align-items: center;
            justify-content: center;
          }

          ._giveawayCreateButton_local:hover {
            background: linear-gradient(135deg, #6c63ff, #5147d9);
            opacity: .95;
          }

          ._giveawayCreateButton_local:active {
            opacity: 1;
            transform: scale(.97);
          }

          ._giveawayCreateButton_local:disabled {
            opacity: .55;
            cursor: not-allowed;
          }

          ._giveawayCreateValue_local,
          ._giveawayCoinValue_local {
            display: inline-flex;
            align-items: center;
            justify-content: center;
          }

          ._giveawayCreateSeparator_local {
            width: 1px;
            height: 16px;
            margin: 0 8px;
            background: rgba(255,255,255,.28);
          }

          ._giveawayCoinValue_local img {
            width: 15px;
            height: 15px;
            margin-right: 6px;
            flex-shrink: 0;
          }

          ._giveawayLoadingButton_local {
            position: relative;
            overflow: hidden;
          }

          ._giveawayButtonLabel_local {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 100%;
          }

          ._giveawaySpinnerWrap_local {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            pointer-events: none;
          }

          ._giveawayLoaderSmall_local {
            width: 20px;
            height: 20px;
            border: 4px solid #1c1f30;
            border-top-color: #6c63ff;
            border-radius: 50%;
            animation: _giveawaySpin_local .45s linear infinite;
          }

          @media (max-width: 760px) {
            ._giveawayBlurBg_local {
              align-items: flex-end;
            }

            ._giveawayModal_local {
              width: 100%;
              max-width: 100%;
              height: 100dvh;
              max-height: 100dvh;
              display: flex;
              flex-direction: column;
              padding: 12px 12px 16px;
              border: none;
              border-radius: 0;
              overflow: hidden;
            }

            ._giveawayModal_local::before {
              content: "";
              width: 36px;
              height: 4px;
              margin: 0 auto 12px;
              border-radius: 2px;
              background: #2a2e44;
              flex-shrink: 0;
            }

            ._giveawayCloseButton_local {
              top: 8px;
              right: 12px;
              font-size: 20px;
            }

            ._giveawayHeader_local {
              flex-direction: column;
              align-items: stretch;
              flex-shrink: 0;
              gap: 8px;
              margin: 8px 0;
              padding-right: 36px;
            }

            ._giveawayHeaderControls_local {
              width: 100%;
            }

            ._giveawaySelector_local,
            ._giveawayLevelSelector_local {
              min-width: 0;
              width: 100%;
            }

            ._giveawayItemsWrapper_local {
              flex: 1;
              width: 100%;
              min-height: 0;
              height: auto;
              box-sizing: border-box;
              margin-top: 0;
              padding: 10px;
              border-radius: 8px;
              overflow-y: auto;
            }

            ._giveawayStats_local {
              justify-content: center;
              gap: 12px;
              margin: 0;
              padding: 8px 0 14px;
            }

            ._giveawayItemsGrid_local {
              grid-template-columns: repeat(2, 1fr);
              gap: 6px;
            }

            ._giveawayButtonWrapper_local {
              flex-wrap: wrap;
              justify-content: stretch;
              flex-shrink: 0;
              margin-top: 10px;
              gap: 6px;
            }

            ._giveawayTimeInput_local,
            ._giveawayLevelSelector_local,
            ._giveawayCreateButton_local {
              width: 100%;
              min-width: 0;
            }

            ._giveawayCreateButton_local {
              min-height: 44px;
            }
          }
        `}</style>
      </div>
      <DepositModal isOpen={depositOpen} onClose={() => setDepositOpen(false)} />
    </div>,
    document.body,
  )
}
