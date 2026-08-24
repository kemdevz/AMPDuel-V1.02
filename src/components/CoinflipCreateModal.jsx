import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../store/auth'
import DepositModal from './DepositModal'
import InventoryItemCard from './InventoryItemCard'
import SortDirectionIcon from './SortDirectionIcon'
import { notifications } from './Notifications'

const BOBUX_ICON = '/bobux.png'
const HEADS_ICON = '/heads.png'
const TAILS_ICON = '/tails.png'
const SEARCH_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAASDSURBVGhD7ZnJbh1FFIa76ibECSuww6BcJglCJthkCwRWCCkIIR4hXDACiUeI8gAskDLbeYpEUVhBYMEGkBIRxwTEEBkwg80KE7i5Xfx/53fLPdzurh7gLvxJ1j2n5K6qv+vUqaGDTSYMo99WeOeIm5cZcfyceV1m5zQS8tYgvOSC4KB1wT3WmZ6KE4TGjfC3agLz+ak5+5KKW6eWkNlBuNgLzW487PU8RLvbNlw8M9fbp6LW8OrI7GD08ZbQPgOz0UhS0Mi6T07P2UMqakzlDmEUlreE5n65rXDbumWIeVBuIyoJwVxYQyhtl5thZNyt0LqbxpnfMF9+ZFlogr4zbsaG5uGeM1PRP+aAkVnD3Llbbm1KhRSJwBv9Cm90j9xCEJZXEZZPyU3QhphCIePCCQJWTp81OwNjEO4eOGdm33C/o857VRKDJIAw69UOM6vfDHcmdlbE0IYLGIUZbxEEz+DZadRxXSUxGK0H8OI+kuvNWCHKTgkoAqlzv9zaMP2irkW5MQjh52R6kyuE6wR+EmHHcGpDxDqoay/qXJUbgQbNm4PRNble5ArhYiczJpoTLYM6Z2TGIBL2yvQiI4TbDr4ZuRFRGNSZE2WgTmY+eRFsG324KLcyGSHo7UGZMQwDma2Tl77z+lBGRgg3gDIjuNjJ7Ix0G+jDtMzK5AhJ7mK5YsvsDLSxJDNi3E66iISQ9HmCcNshszPQxi8yY/L6UkRmRNJgmH+S2RlttFEqBCQyWEd4h1KaUiHYxbayzS4CbTQ+HiSE5J2xsRVvfSFMgzYyQnzP+5kR4RlbZgTPEzI7A208JDMCfRjKrEyOkOAPmRFFh6I2YHZCG9vkRqAPmSxWRkYIZvZnMmO0ieyEYS98VmYMstgXMiuTEcIrG2wREvsqnEue5KFIbnugzq0jm9igMrRPzttX5FYmI4TwykZmDE92MlsDda7IjIGQKzK9GPuW3z7iEKqZXfB1HorkNoLhGo30BjDm4Yl5/+0JyR0RwnsnmTFbcVbAwSdzTPUlTwQJA+e9fV9nrBBsrw/hrLAsNwZi9qAjK7XmDC8fBuFqnghyedfCazK9Ke0MDjl/4sS4Q26CoXU3zszZ3E5thCmW2Sk9sdMwyVzof7/jh2OPeR8dKr3VIjFEF3RL2MX+itS5fkG3Cyv2fVzs0utEERTzYf/a1MKxA/+oqBKVw2N2MPqZVzZyO4ViPnj66+3fvLv7bxWVMnaOpOHlGebM5fQaUwdmJ/7c8bLg7ZoXrz7x1+Pv36g8kpWFECSA50+cM5b3W3UEUQDm1RWm2POYC0V1+IqpHFp58LYDPeGHnumCDz1DzJdV44JPT83bV1Uc8cjR76YOLz26xk6rKAPFVgmzRkLS1Pn0tu/ol3e9sLT/VpmYsmzWqpC6VBEDHMNxnJiJEEKaipkYIaSJGK+s1TVcBLkYFmUzYF5Ggui/dzPx8WmihBCK4cQuE3N4sf+t7IiJE0IYNkUjw091WNMStzsTNUfS5M2Zcd8bJ1oI2SimrS/A/xvcAXDTKneTTf47guBfRB/4oi5eINMAAAAASUVORK5CYII='

const formatNumber = (value) => {
  const numericValue = Number(value ?? 0)
  return Number.isFinite(numericValue) ? numericValue.toLocaleString() : '0'
}

function SearchIcon() {
  return <img src={SEARCH_ICON} alt="Search" className="_searchIcon_2jqwz_65" />
}

function BagIcon() {
  return (
    <svg viewBox="0 0 260 320" width="20" height="20" aria-hidden="true">
      <path fill="#ff4fa3" d="M50 110c0-40 30-90 80-90s80 50 80 90v150c0 25-20 45-45 45H95c-25 0-45-20-45-45V110z" />
      <path fill="#5A55E6" d="M60 120c0-35 28-80 70-80s70 45 70 80v20H60v-20z" />
      <path fill="#4A43C9" d="M110 40h40c8 0 12 10 12 20v10H98V60c0-10 4-20 12-20z" />
      <path fill="#7A72FF" d="M60 180h140v75c0 20-15 35-35 35H95c-20 0-35-15-35-35v-75z" />
      <path fill="#ff4fa3" d="M60 180h140v25H60v-25z" />
      <path stroke="#3A33A8" strokeWidth="3" d="M60 205h140" />
      <path stroke="#443CB5" strokeWidth="2" d="M130 120v140" />
      <path fill="#5850E6" d="M50 130c-10 5-20 25-20 45s10 40 20 45V130zM210 130c10 5 20 25 20 45s-10 40-20 45V130z" />
      <ellipse cx="130" cy="290" rx="90" ry="18" fill="#3B36A6" opacity=".35" />
      <path fill="#8A83FF" d="M80 230h100v30H80v-30z" />
      <path stroke="#363092" strokeWidth="3" d="M80 245h100" />
      <path fill="#5049D6" d="M70 80c-20 25-25 55-25 80s5 55 25 80V80z" />
      <path fill="#5049D6" d="M190 80c20 25 25 55 25 80s-5 55-25 80V80z" />
      <path fill="#332F80" opacity=".4" d="M70 100c-12 25-15 45-15 60s3 35 15 60V100z" />
      <path fill="#332F80" opacity=".4" d="M190 100c12 25 15 45 15 60s-3 35-15 60V100z" />
    </svg>
  )
}

function SortStackIcon({ ascending = false }) {
  return <SortDirectionIcon ascending={ascending} />
}

function AutoSelectIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function isGemItem(item) {
  return /\bgems?\b/i.test(String(item?.name || ''))
}

function isTitanicLockItem(item) {
  return /\b(?:gargantuan|titanic)\b/i.test(String(item?.name || ''))
}

export default function CoinflipCreateModal({ onClose, onCreate }) {
  const user = useAuth((state) => state.user)
  const [inventoryItems, setInventoryItems] = useState([])
  const [selectedItems, setSelectedItems] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('Highest to Lowest')
  const [selectedCoin, setSelectedCoin] = useState('heads')
  const [inventoryLoading, setInventoryLoading] = useState(true)
  const [inventoryError, setInventoryError] = useState(null)
  const [depositOpen, setDepositOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [gameModes, setGameModes] = useState({
    titanicsGems: false,
  })
  const settingsRef = useRef(null)

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return
      if (settingsOpen) {
        setSettingsOpen(false)
        return
      }
      if (!depositOpen) onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [depositOpen, onClose, settingsOpen])

  useEffect(() => {
    if (!settingsOpen) return undefined

    const handlePointerDown = (event) => {
      if (!settingsRef.current?.contains(event.target)) setSettingsOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [settingsOpen])

  useEffect(() => {
    let isMounted = true

    const loadInventory = async () => {
      setInventoryLoading(true)
      setInventoryError(null)

      const ownerIds = [user?.profile_id, user?.id]
        .filter((value) => value !== null && value !== undefined && value !== '')
        .map(String)

      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const sessionUserId = sessionData?.session?.user?.id
        if (sessionUserId) ownerIds.push(String(sessionUserId))

        const { data: userData } = await supabase.auth.getUser()
        const authUserId = userData?.user?.id
        if (authUserId) ownerIds.push(String(authUserId))
      } catch (err) {
        console.warn('[CoinflipCreateModal] failed to collect owner ids', err)
      }

      const uniqueOwnerIds = [...new Set(ownerIds)]
      if (uniqueOwnerIds.length === 0) {
        if (isMounted) {
          setInventoryItems([])
          setInventoryLoading(false)
          setInventoryError(null)
          notifications.error('Please sign in to load your inventory.')
        }
        return
      }

      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .in('user_id', uniqueOwnerIds)
        .order('created_at', { ascending: false })

      if (!isMounted) return

      if (error) {
        setInventoryItems([])
        setInventoryError(null)
        notifications.error(error.message || 'Failed to load inventory.')
      } else {
        setInventoryItems(data ?? [])
      }

      setInventoryLoading(false)
    }

    void loadInventory()

    return () => {
      isMounted = false
    }
  }, [user?.id, user?.profile_id])

  const inventoryRows = inventoryItems.map((item) => ({
    ...item,
    displayKey: item.id || item.name || 'inventory',
  }))

  const filteredRows = inventoryRows.filter((item) => {
    const query = searchQuery.trim().toLowerCase()
    return query === '' || String(item.name || '').toLowerCase().includes(query)
  })

  const sortedRows = filteredRows.slice().sort((a, b) => {
    const aSelected = selectedItems.includes(a.displayKey)
    const bSelected = selectedItems.includes(b.displayKey)
    if (aSelected !== bSelected) return aSelected ? -1 : 1
    if (sortBy === 'Highest to Lowest') {
      return Number(b.value ?? 0) - Number(a.value ?? 0)
    }
    if (sortBy === 'Lowest to Highest') {
      return Number(a.value ?? 0) - Number(b.value ?? 0)
    }
    return new Date(b.created_at || 0) - new Date(a.created_at || 0)
  })

  const totalInventoryValue = inventoryRows.reduce((sum, item) => sum + Number(item.value ?? 0), 0)
  const totalInventoryCount = inventoryRows.length
  const selectedAmount = selectedItems.length
  const selectedValue = inventoryRows
    .filter((item) => selectedItems.includes(item.displayKey))
    .reduce((sum, item) => sum + Number(item.value ?? 0), 0)
  const selectedInventoryRows = inventoryRows.filter((item) => selectedItems.includes(item.displayKey))
  const titanicsGemsEligible = selectedInventoryRows.length > 0
    && selectedInventoryRows.every((item) => isTitanicLockItem(item) || isGemItem(item))

  useEffect(() => {
    setGameModes((current) => {
      const next = {
        titanicsGems: current.titanicsGems && titanicsGemsEligible,
      }
      return next.titanicsGems === current.titanicsGems
        ? current
        : next
    })
  }, [titanicsGemsEligible])

  const allInventoryKeys = inventoryRows.map((item) => item.displayKey)
  const onToggleSelectAll = () => {
    if (selectedAmount === inventoryRows.length) {
      setSelectedItems([])
      return
    }
    setSelectedItems(allInventoryKeys)
  }

  const toggleGameMode = () => {
    if (!titanicsGemsEligible) {
      notifications.error('Select only Gargantuan or Titanic pets and Gems to enable Titanic + Gems.')
      return
    }

    setGameModes((current) => ({
      titanicsGems: !current.titanicsGems,
    }))
  }

  if (typeof document === 'undefined') {
    return null
  }

  const [creating, setCreating] = useState(false)

  const tryCreateRemote = async (body) => {
    const res = await fetch('/api/coinflip/create', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const text = await res.text()
    let json = null
    if (text) {
      try {
        json = JSON.parse(text)
      } catch {
        json = null
      }
    }

    if (!res.ok) {
      throw new Error(json?.error || text || `status:${res.status}`)
    }

    return json ?? {}
  }

  const handleCreate = async () => {
    if (selectedItems.length === 0 || creating) return
    setCreating(true)

    const selectedRows = inventoryRows.filter((item) => selectedItems.includes(item.displayKey))
    const creator_uuid = String(user?.profile_id || user?.id || '')
    const creatorAvatarUrl = user?.avatar_headshot_url || user?.avatar_url || null
    const gameMode = gameModes.titanicsGems ? 'titanics_only' : null
    const payload = {
      creator_uuid,
      creator_username: user?.username || user?.email || 'user',
      creator_side: selectedCoin,
      creator_items: selectedRows.map((it) => ({ id: it.id, name: it.name, image_url: it.image_url, value: Number(it.value ?? 0) })),
      creator_avatar_url: creatorAvatarUrl,
      creator_avatar: creatorAvatarUrl,
      item_ids: selectedRows.map((it) => it.id),
      game_mode: gameMode,
    }

    try {
      const result = await tryCreateRemote(payload)
      const returned = (result && result.data) ? result.data : result

      // Build a local room object that the frontend can render immediately
      const roomLocal = {
        id: returned?.id || `local-${Date.now()}`,
        creator_uuid,
        creator_username: payload.creator_username,
        creator_side: payload.creator_side,
        creator_items: payload.creator_items,
        creator_avatar_url: creatorAvatarUrl,
        creator_avatar: creatorAvatarUrl,
        opponent_uuid: returned?.opponent_uuid || null,
        opponent_username: returned?.opponent_username || null,
        opponent_side: returned?.opponent_side || null,
        opponent_items: returned?.opponent_items || null,
        game_mode: returned?.game_mode || payload.game_mode,
        created_at: returned?.created_at || new Date().toISOString(),
      }

      if (onCreate && roomLocal) {
        try { onCreate(roomLocal) } catch (e) { console.warn('[coinflip] onCreate callback failed', e) }
      }

      window.dispatchEvent(new CustomEvent('wallet:updated'))
      notifications.success('Coinflip created successfully!')
      setCreating(false)
      onClose()
    } catch (err) {
      console.error('[CoinflipCreateModal] create failed', err)
      notifications.error(err?.message || 'Failed to create coinflip.')
      setCreating(false)
    }
  }

  return createPortal(
    <>
      <DepositModal isOpen={depositOpen} onClose={() => setDepositOpen(false)} />
      <div
        className="_blurbg_2jqwz_3"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose()
        }}
      >
        <div className="_modalbackgroundinventory_2jqwz_14" role="dialog" aria-modal="true" aria-label="Create coinflip">
          <button type="button" className="_closeButton_2jqwz_28" onClick={onClose} aria-label="Close">
            &times;
          </button>
          <div className="_headerinventory_2jqwz_38">
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <div className="_inputWrapper_2jqwz_49">
                <input
                  type="text"
                  placeholder="Search for an item..."
                  className="_inputv3_2jqwz_51"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                <SearchIcon />
              </div>
              <button
                type="button"
                className="_sortToggle_2jqwz_323"
                aria-label={`Sort items: ${sortBy}`}
                title={sortBy}
                onClick={() => setSortBy((current) => current === 'Highest to Lowest' ? 'Lowest to Highest' : 'Highest to Lowest')}
              >
                <SortStackIcon ascending={sortBy === 'Lowest to Highest'} />
              </button>
            </div>
          </div>

          <div className="_itemsWrapper_2jqwz_165">
            <div className="_stats_2jqwz_111">
              <div className="_statItem_2jqwz_113">
                <img src={BOBUX_ICON} alt="Bobux" style={{ width: 20, height: 20, flexShrink: 0 }} />
                <div className="_statCol_2jqwz_120">
                  <span className="_statLabel_2jqwz_127">VALUE</span>
                  <span className="_statValue_2jqwz_137">
                    <span className="_pcvalue_2jqwz_317">{formatNumber(totalInventoryValue)}</span>
                    <span className="_mobilevalue_2jqwz_318">{formatNumber(totalInventoryValue)}</span>
                  </span>
                </div>
              </div>
              <div className="_statItem_2jqwz_113">
                <BagIcon />
                <div className="_statCol_2jqwz_120">
                  <span className="_statLabel_2jqwz_127">ITEMS</span>
                  <span className="_statValue_2jqwz_137">{formatNumber(totalInventoryCount)}</span>
                </div>
              </div>
              <button className="_plusbutton_2jqwz_139 _loadingButtonBase_2jqwz_298" type="button" onClick={() => setDepositOpen(true)}>
                <span className="_buttonLabel_2jqwz_299 ">+</span>
                <span className="_buttonSpinnerWrap_2jqwz_301 ">
                  <span className="_loaderSmall_2jqwz_303" />
                </span>
              </button>
            </div>

            <div className="_itemsGrid_2jqwz_171">
              {inventoryLoading ? (
                <div className="_emptyState_2jqwz_309">
                  <h1>Loading...</h1>
                  <p>Fetching your inventory...</p>
                </div>
              ) : inventoryError ? (
                <div className="_emptyState_2jqwz_309">
                  <h1>Couldn't load inventory</h1>
                  <p>{inventoryError}</p>
                </div>
              ) : sortedRows.length === 0 ? (
                <div className="_emptyState_2jqwz_309">
                  <h1>No items found</h1>
                  <p>No items were found in your inventory.</p>
                  <button className="_depositbutton_2jqwz_152 _loadingButtonBase_2jqwz_298" type="button" onClick={() => setDepositOpen(true)}>
                    <span className="_buttonLabel_2jqwz_299 ">Deposit</span>
                    <span className="_buttonSpinnerWrap_2jqwz_301 ">
                      <span className="_loaderSmall_2jqwz_303" />
                    </span>
                  </button>
                </div>
              ) : (
                sortedRows.map((item) => (
                  <InventoryItemCard
                    key={item.displayKey}
                    item={item}
                    selected={selectedItems.includes(item.displayKey)}
                    onToggleSelect={() => {
                      setSelectedItems((prev) =>
                        prev.includes(item.displayKey)
                          ? prev.filter((key) => key !== item.displayKey)
                          : [...prev, item.displayKey]
                      )
                    }}
                  />
                ))
              )}
            </div>
          </div>

          <div className="_buttonWrapper_2jqwz_268">
            <div className="_coins_2jqwz_305" role="group" aria-label="Choose coin side">
              <button
                type="button"
                className={`_coin_2jqwz_305 ${selectedCoin === 'heads' ? '_selectedcoin_2jqwz_307' : ''}`}
                onClick={() => setSelectedCoin('heads')}
                aria-pressed={selectedCoin === 'heads'}
              >
                <img src={HEADS_ICON} alt="heads" />
              </button>
              <button
                type="button"
                className={`_coin_2jqwz_305 ${selectedCoin === 'tails' ? '_selectedcoin_2jqwz_307' : ''}`}
                onClick={() => setSelectedCoin('tails')}
                aria-pressed={selectedCoin === 'tails'}
              >
                <img src={TAILS_ICON} alt="tails" />
              </button>
            </div>
            <div className="_settingsWrap_2jqwz_526" ref={settingsRef}>
              <button
                className="_flatActionBtn_2jqwz_278 _loadingButtonBase_2jqwz_298 _autoSelectBtn_2jqwz_320"
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                type="button"
                aria-label="Game settings"
                aria-expanded={settingsOpen}
                title="Game Settings"
                onClick={() => setSettingsOpen((open) => !open)}
              >
                <AutoSelectIcon />
              </button>
              {settingsOpen ? (
                <div className="_settingsDropdown_2jqwz_552">
                  <p className="_settingsTitle_2jqwz_568">Game Modes</p>
                  <button
                    type="button"
                    className="_settingsItem_2jqwz_578"
                    aria-pressed={gameModes.titanicsGems}
                    title="Titanic + Gems"
                    onClick={toggleGameMode}
                  >
                    <span className="_settingsEmoji_2jqwz_593" aria-hidden="true">💎</span>
                    <span className="_settingsItemText_2jqwz_599">
                      <span className="_settingsItemName_2jqwz_606">Titanic + Gems</span>
                      <span className="_settingsItemDesc_2jqwz_612">Only Gargantuans, Titanics, and Gems can be used</span>
                    </span>
                    <span className={`_settingsToggle_2jqwz_619 ${gameModes.titanicsGems ? '_settingsToggleOn_2jqwz_628' : ''}`} aria-hidden="true">
                      <span className="_settingsToggleThumb_2jqwz_629" />
                    </span>
                  </button>
                </div>
              ) : null}
            </div>
            <button
              className="_flatActionBtn_2jqwz_278 _loadingButtonBase_2jqwz_298"
              disabled={inventoryRows.length === 0}
              type="button"
              onClick={onToggleSelectAll}
            >
              <span className="_buttonLabel_2jqwz_299 ">
                {selectedAmount === inventoryRows.length ? 'Unselect All' : 'Select all'}
              </span>
              <span className="_buttonSpinnerWrap_2jqwz_301 ">
                <span className="_loaderSmall_2jqwz_303" />
              </span>
            </button>
            <button
              className="_withdrawButton_2jqwz_287 _loadingButtonBase_2jqwz_298"
              disabled={selectedAmount === 0 || creating}
              type="button"
              onClick={handleCreate}
            >
              <span className="_buttonLabel_2jqwz_299 ">
                <strong className="_pcvalue_2jqwz_317">
                  {'Create\u00A0|\u00A0'}
                  <span style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}>
                    <img src={BOBUX_ICON} alt="Bobux" style={{ width: 15, height: 15, marginRight: 6, flexShrink: 0 }} />
                    <span>{formatNumber(selectedValue)}</span>
                  </span>
                </strong>
                <strong className="_mobilevalue_2jqwz_318">
                  {'Create\u00A0|\u00A0'}
                  <span style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}>
                    <img src={BOBUX_ICON} alt="Bobux" style={{ width: 15, height: 15, marginRight: 6, flexShrink: 0 }} />
                    <span>{formatNumber(selectedValue)}</span>
                  </span>
                </strong>
              </span>
              {/* spinner removed: do not show loader while creating to avoid persistent spinner */}
            </button>
          </div>
        </div>
      </div>
      <style>{`
._blurbg_2jqwz_3 {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #00000080;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 999;
  animation: _fadeIn_2jqwz_1 .5s ease-out;
}

._modalbackgroundinventory_2jqwz_14 {
  background-color: #131520;
  border: 1px solid #181a28;
  border-radius: 10px;
  padding: 15px;
  width: 90%;
  max-width: 1200px;
  color: #fff;
  overflow-y: auto;
  align-items: flex-start;
  animation: _modalOpen_2jqwz_1 .3s forwards;
  position: relative;
}

._closeButton_2jqwz_28 {
  position: absolute;
  top: 5px;
  right: 10px;
  background: none;
  border: none;
  color: #fff;
  font-size: 24px;
  cursor: pointer;
  opacity: .8;
  transition: opacity .3s ease, transform .2s ease;
}

._closeButton_2jqwz_28:hover {
  opacity: 1;
}

._headerinventory_2jqwz_38 {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  width: 100%;
  gap: 12px;
  margin-bottom: 10px;
  margin-top: 5px;
}

._searchContainer_2jqwz_48 {
  flex: 1;
  min-width: 0;
  max-width: 340px;
}

._inputWrapper_2jqwz_49 {
  position: relative;
  display: flex;
  width: 100%;
}

._inputv3_2jqwz_51 {
  padding: 10px 18px 10px 40px;
  width: 100%;
  height: 40px;
  box-sizing: border-box;
  border-radius: 5px;
  background: #1c1f2e;
  border: 2px solid #323240;
  color: #fff;
  box-shadow: 0 10px 7.8px #00000026;
  font-size: .9rem;
  opacity: .9;
}

._inputv3_2jqwz_51::-moz-placeholder {
  color: #cbd5e1;
}

._inputv3_2jqwz_51::placeholder {
  color: #cbd5e1;
}

._inputv3_2jqwz_51:focus {
  outline: none;
}

._searchIcon_2jqwz_65 {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  pointer-events: none;
}

._stats_2jqwz_111 {
  display: flex;
  gap: 15px;
  align-items: center;
  margin-bottom: 12px;
  margin-top: -5px;
}

._statItem_2jqwz_113 {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
}

._statCol_2jqwz_120 {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0;
}

._statLabel_2jqwz_127 {
  font-size: 10px;
  font-weight: 700;
  color: #ffffff59;
  letter-spacing: .06em;
  text-transform: uppercase;
  line-height: 1;
  margin-bottom: 2px;
}

._statValue_2jqwz_137 {
  font-size: 17px;
  font-weight: 700;
  color: #f6f6f6;
  line-height: 1;
}

._plusbutton_2jqwz_139 {
  background: linear-gradient(135deg, #ff4fa3, #f43f8f);
  border: 1px solid rgba(255,79,163,.4);
  color: #fff;
  font-weight: 700;
  font-size: 22px;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px #ff4fa340;
  cursor: pointer;
  transition: transform .15s ease, opacity .25s ease, background .25s ease;
  position: relative;
  z-index: 20;
  pointer-events: auto;
  padding: 0;
  flex-shrink: 0;
}

._plusbutton_2jqwz_139:hover {
  background: linear-gradient(135deg, #ff4fa3, #f43f8f);
  transform: scale(1.05);
}

._plusbutton_2jqwz_139:active {
  transform: scale(.95);
}

._plusbutton_2jqwz_139:disabled {
  opacity: .6;
  cursor: not-allowed;
}

._depositbutton_2jqwz_152 {
  background: linear-gradient(135deg, #ff4fa3, #f43f8f);
  border: 1px solid rgba(255,79,163,.4);
  color: #fff;
  font-weight: 600;
  font-size: 16px;
  border-radius: 8px;
  padding: 10px 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px #ff4fa340;
  cursor: pointer;
  transition: transform .15s ease, opacity .25s ease, background .25s ease;
  position: relative;
  z-index: 20;
  pointer-events: auto;
  min-height: 42px;
}

._depositbutton_2jqwz_152:hover {
  background: linear-gradient(135deg, #ff4fa3, #f43f8f);
  transform: scale(1.03);
}

._depositbutton_2jqwz_152:active {
  transform: scale(.96);
}

._depositbutton_2jqwz_152:disabled {
  opacity: .6;
  cursor: not-allowed;
}

._itemsWrapper_2jqwz_165 {
  background-color: #1c1f2e;
  border-radius: 6px;
  padding: 12px;
  margin-top: 15px;
  height: 350px;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
}

._itemsGrid_2jqwz_171 {
  display: grid;
  grid-template-columns: repeat(auto-fill,minmax(160px,1fr));
  gap: 8px;
}

._inventoryItemCard_cpcgp_local {
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
  transition: transform .2s ease, box-shadow .2s ease, background .2s ease;
}

._inventoryItemCard_cpcgp_local::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  padding: 2px;
  border-radius: 6px;
  background: linear-gradient(to bottom, transparent 0%, var(--inventory-border-side, rgba(255,79,163,.25)) 55%, var(--inventory-border-bottom, rgba(255,79,163,.7)) 100%);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  pointer-events: none;
}

._inventoryItemCard_cpcgp_local_selected {
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.15), 0 10px 25px rgba(0, 0, 0, 0.18);
  transform: scale(1.01);
}

._inventoryItemCard_cpcgp_local:hover {
  transform: scale(1.03);
}

._inventorySelectIndicator_cpcgp_local {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  background: var(--inventory-indicator-color, rgba(54, 123, 255, 1));
  transform-origin: center;
  transition: opacity .25s ease, transform .25s ease, background .25s ease;
  z-index: 3;
  pointer-events: none;
}

._inventoryItemCard_cpcgp_local:hover ._inventorySelectIndicator_cpcgp_local {
  transform: scale(1.08);
}

._inventoryBlurImage_cpcgp_local {
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
  transform: translate(-50%,-60%);
}

._inventoryImageWrap_cpcgp_local {
  position: relative;
  width: 100%;
  height: 118px;
  overflow: hidden;
  border-radius: 8px;
  flex: 0 0 118px;
}

._inventoryImage_cpcgp_local {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 8px;
}

._inventoryDetails_cpcgp_local {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 32px;
  min-height: 32px;
  flex: 0 0 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  text-align: center;
  margin-top: 4px;
  overflow: hidden;
}

._inventoryName_cpcgp_local {
  display: block;
  width: 100%;
  max-width: 100%;
  margin: 0;
  color: #ccd9fa;
  font-size: 12px;
  font-weight: 600;
  line-height: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

._inventoryPrice_cpcgp_local {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 100%;
  margin: 0;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  line-height: 15px;
  overflow: hidden;
  white-space: nowrap;
}

._inventoryPriceInner_cpcgp_local {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  vertical-align: middle;
}

._inventoryPriceInner_cpcgp_local img {
  width: 15px;
  height: 15px;
  margin-right: 6px;
  flex-shrink: 0;
}

._inventoryPriceAmount_cpcgp_local {
  display: inline-block;
  min-width: 0;
  overflow: hidden;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  line-height: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

._buttonWrapper_2jqwz_268 {
  display: flex;
  justify-content: flex-end;
  margin-top: 15px;
  align-items: center;
  gap: 8px;
}

._buttonWrapper_2jqwz_268 button {
  font-weight: 450;
  border-radius: 6px;
  transition: opacity .2s ease, transform .1s ease, background .25s ease;
  position: relative;
}

._buttonWrapper_2jqwz_268 button:disabled {
  opacity: .6;
  cursor: not-allowed;
}

._flatActionBtn_2jqwz_278 {
  background: #2a2e44 !important;
  border: none !important;
  color: #e1e4f2 !important;
  box-shadow: none !important;
  border-radius: 8px !important;
  min-height: 42px;
  min-width: 140px;
  padding: 0 16px;
}

._flatActionBtn_2jqwz_278:disabled {
  opacity: .6;
  cursor: not-allowed;
}

._flatActionBtn_2jqwz_278:hover {
  background: #32385a !important;
}

._flatActionBtn_2jqwz_278:active {
  transform: scale(.97);
}

._withdrawButton_2jqwz_287 {
  background: linear-gradient(135deg, #ff4fa3, #f43f8f);
  border: 1px solid rgba(255,79,163,.4);
  color: #fff;
  box-shadow: 0 2px 8px #ff4fa333;
  min-height: 42px;
  min-width: 190px;
  padding: 0 16px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

._withdrawButton_2jqwz_287:hover {
  background: linear-gradient(135deg, #ff4fa3, #f43f8f);
  opacity: .95;
}

._withdrawButton_2jqwz_287:active {
  opacity: 1;
  transform: scale(.97);
}

._loadingButtonBase_2jqwz_298 {
  position: relative;
  overflow: hidden;
}

._buttonLabel_2jqwz_299 {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  transition: opacity .2s ease, transform .2s ease;
}

._buttonLabelHidden_2jqwz_300 {
  opacity: 0;
  transform: scale(.96);
  pointer-events: none;
}

._buttonSpinnerWrap_2jqwz_301 {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transform: scale(.96);
  pointer-events: none;
  transition: opacity .2s ease, transform .2s ease;
}

._buttonSpinnerWrapVisible_2jqwz_302 {
  opacity: 1;
  transform: scale(1);
}

._loaderSmall_2jqwz_303 {
  border: 4px solid #1c1f30;
  border-radius: 50%;
  border-top: 4px solid #ff4fa3;
  width: 20px;
  height: 20px;
  animation: _spin_2jqwz_1 .45s linear infinite;
}

._coins_2jqwz_305 {
  display: flex;
  align-items: center;
  margin-right: 8px;
}

._coin_2jqwz_305 {
  width: 38px;
  height: 38px;
  -o-object-fit: cover;
  object-fit: cover;
  border-radius: 50%;
  margin-right: 8px;
  opacity: 20%;
  box-shadow: 0 8px 6px #00000026;
  cursor: pointer;
  transition: transform .3s ease, box-shadow .3s ease;
}

._selectedcoin_2jqwz_307 {
  transform: scale(1.1);
  opacity: 100%;
}

._emptyState_2jqwz_309 {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
}

._emptyState_2jqwz_309 h1 {
  font-size: 20px;
  font-weight: 700;
  color: #ddd;
  margin-bottom: 8px;
}

._emptyState_2jqwz_309 p {
  color: #aaa;
  margin-bottom: 15px;
}

._loaderWrapper_2jqwz_313 {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  justify-content: center;
  align-items: center;
}

._loader_2jqwz_303 {
  border: 7px solid #131520;
  border-radius: 50%;
  border-top: 7px solid #ff4fa3;
  width: 45px;
  height: 45px;
  animation: _spin_2jqwz_1 .45s linear infinite;
  opacity: .9;
}

._shrinkOut_2jqwz_316 {
  animation: _shrinkOut_2jqwz_316 .2s forwards;
}

._pcvalue_2jqwz_317 {
  display: flex;
  align-items: center;
  justify-content: center;
}

._mobilevalue_2jqwz_318 {
  display: none;
  align-items: center;
  justify-content: center;
}

._autoSelectBtn_2jqwz_320 {
  min-width: 42px !important;
  width: 42px !important;
  max-width: 42px !important;
  flex: 0 0 42px !important;
  padding: 0 !important;
}

._buttonWrapper_2jqwz_268 ._autoSelectBtn_2jqwz_320:disabled {
  background: #2a2e44 !important;
  color: #e1e4f2 !important;
  opacity: 1 !important;
}

._autoSelectBtn_2jqwz_320 svg {
  color: #e1e4f2;
  stroke: currentColor;
}

._autoSelectBtn_2jqwz_320:focus {
  outline: none;
  box-shadow: none;
}

._autoSelectBtn_2jqwz_320:focus-visible {
  outline: 2px solid #ff4fa3;
  outline-offset: 2px;
}

._valueWrapper_2jqwz_321 {
  display: flex;
  justify-content: flex-start;
  align-items: center;
}

._sortToggle_2jqwz_323 {
  width: 40px;
  height: 40px;
  padding: 0;
  border-radius: 6px;
  border: none;
  background: #20222f;
  color: #e1e4f2;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background .15s;
  flex-shrink: 0;
}

._sortToggle_2jqwz_323:hover {
  background: #2a2e44;
}

._settingsWrap_2jqwz_526 {
  position: relative;
  flex-shrink: 0;
}

._settingsBtn_2jqwz_531 {
  height: 42px;
  width: 42px;
  padding: 0;
  border-radius: 8px;
  border: 1px solid #252839;
  background: #20222f;
  color: #8b92b8;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  transition: background .15s, border-color .15s, color .15s;
  position: relative;
}

._settingsBtn_2jqwz_531:hover:not(:disabled) {
  background: #252839;
  color: #e1e4f2;
}

._settingsBtn_2jqwz_531:disabled {
  opacity: .5;
  cursor: not-allowed;
}

._settingsDropdown_2jqwz_552 {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  width: 388px;
  background: #131520;
  border: 1px solid #1e2235;
  border-radius: 10px;
  padding: 12px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-shadow: 0 8px 32px #0006;
  transform-origin: left bottom;
  animation: _settingsDropdownOpen_2jqwz_1 .16s cubic-bezier(.22, 1, .36, 1);
  will-change: transform, opacity;
}

@media (min-width: 641px) and (max-width: 840px) {
  ._settingsDropdown_2jqwz_552 {
    width: 338px;
  }
}

@media (max-width: 640px) {
  ._settingsDropdown_2jqwz_552 {
    width: min(260px, calc(100vw - 32px));
  }
}

._settingsTitle_2jqwz_568 {
  font-size: 10px;
  font-weight: 700;
  color: #ffffff4d;
  text-transform: uppercase;
  letter-spacing: .08em;
  margin-bottom: 4px;
  padding: 0 4px;
}

._settingsItem_2jqwz_578 {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #1e2235;
  background: #1a1d2b;
  cursor: pointer;
  transition: background .15s, border-color .15s;
  width: 100%;
  text-align: left;
}

._settingsItem_2jqwz_578:hover {
  background: #252839;
}

._settingsEmoji_2jqwz_593 {
  font-size: 20px;
  flex-shrink: 0;
  line-height: 1;
}

._settingsItemText_2jqwz_599 {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

._settingsItemName_2jqwz_606 {
  font-size: 13px;
  font-weight: 700;
  color: #e1e4f2;
  line-height: 1;
}

._settingsItemDesc_2jqwz_612 {
  font-size: 11px;
  color: #ffffff4d;
  font-weight: 500;
}

._settingsToggle_2jqwz_619 {
  width: 36px;
  height: 20px;
  border-radius: 10px;
  background: #252839;
  flex-shrink: 0;
  position: relative;
  transition: background .2s;
}

._settingsToggleOn_2jqwz_628 {
  background: #ff4fa3;
}

._settingsToggleThumb_2jqwz_629 {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  transition: transform .2s;
}

._settingsToggleOn_2jqwz_628 ._settingsToggleThumb_2jqwz_629 {
  transform: translate(16px);
}

@media (max-width: 640px) {
  ._blurbg_2jqwz_3 {
    align-items: flex-end;
    justify-content: flex-end;
    padding: 0;
  }

  ._modalbackgroundinventory_2jqwz_14 {
    width: 100%;
    max-width: 100%;
    height: 100dvh;
    max-height: 100dvh;
    border-radius: 0;
    border: none;
    padding: 12px 12px 16px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-sizing: border-box;
  }

  ._modalbackgroundinventory_2jqwz_14:before {
    content: "";
    display: block;
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: #2a2e44;
    margin: 0 auto 12px;
    flex-shrink: 0;
  }

  ._closeButton_2jqwz_28 {
    top: 8px;
    right: 12px;
    font-size: 20px;
  }

  ._headerinventory_2jqwz_38 {
    flex-direction: row;
    justify-content: center;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    margin-bottom: 8px;
    position: static;
    flex-shrink: 0;
    padding-right: 36px;
  }

  ._inputWrapper_2jqwz_49 {
    width: 100%;
  }

  ._inputv3_2jqwz_51 {
    width: 100%;
    font-size: 15px;
    height: 40px;
    box-sizing: border-box;
  }

  ._stats_2jqwz_111 {
    gap: 12px;
    margin-bottom: 0;
    margin-top: 0;
    flex-shrink: 0;
    justify-content: center;
    padding: 8px 0 14px;
  }

  ._itemsWrapper_2jqwz_165 {
    flex: 1;
    min-height: 0;
    height: auto;
    width: 100%;
    padding: 10px;
    margin-top: 0;
    border-radius: 8px;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    box-sizing: border-box;
  }

  ._itemsGrid_2jqwz_171 {
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
  }

  ._buttonWrapper_2jqwz_268 {
    flex-shrink: 0;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
    justify-content: center;
    align-items: center;
    width: 100%;
    padding: 0;
  }

  ._flatActionBtn_2jqwz_278 {
    min-width: 0 !important;
    flex: 1 1 120px !important;
    min-height: 40px !important;
    font-size: 13px !important;
    padding: 0 8px !important;
  }

  ._withdrawButton_2jqwz_287 {
    min-width: 0 !important;
    width: 100% !important;
    min-height: 44px !important;
    font-size: 14px !important;
    order: 10;
    flex: 1 1 100% !important;
  }

  ._pcvalue_2jqwz_317 {
    display: none;
  }

  ._mobilevalue_2jqwz_318 {
    display: flex;
  }

  ._coin_2jqwz_305 {
    width: 24px !important;
    height: 24px !important;
    margin-right: 0 !important;
  }
}

@media (min-width: 641px) and (max-width: 840px) {
  ._modalbackgroundinventory_2jqwz_14 {
    width: 95%;
    max-height: 90vh;
    overflow-y: auto;
  }

  ._headerinventory_2jqwz_38 {
    flex-direction: column;
    align-items: stretch;
    position: static;
    gap: 8px;
  }

  ._inputv3_2jqwz_51 {
    width: 100%;
  }

  ._itemsWrapper_2jqwz_165 {
    height: 340px;
  }

  ._itemsGrid_2jqwz_171 {
    grid-template-columns: repeat(auto-fill,minmax(140px,1fr));
  }

  ._buttonWrapper_2jqwz_268 {
    flex-wrap: wrap;
    gap: 8px;
  }

  ._flatActionBtn_2jqwz_278 {
    min-width: 120px !important;
  }

  ._withdrawButton_2jqwz_287 {
    min-width: 160px;
  }

  ._pcvalue_2jqwz_317 {
    display: none;
  }

  ._mobilevalue_2jqwz_318 {
    display: flex;
  }
}

@keyframes _fadeIn_2jqwz_1 {
  0% { opacity: 0; }
  to { opacity: 1; }
}

@keyframes _modalOpen_2jqwz_1 {
  0% {
    transform: scale(.8);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes _spin_2jqwz_1 {
  to { transform: rotate(360deg); }
}

@keyframes _settingsDropdownOpen_2jqwz_1 {
  from {
    opacity: 0;
    transform: translateY(4px) scale(.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes _shrinkOut_2jqwz_316 {
  0% { transform: scale(1); }
  to {
    transform: scale(.8);
    opacity: 0;
  }
}
`}</style>
    </>,
    document.body
  )
}
