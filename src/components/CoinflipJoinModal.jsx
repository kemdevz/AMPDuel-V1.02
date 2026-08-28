import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiRequest } from '../lib/apiClient'
import { useAuth } from '../store/auth'
import { parsePriceValue } from '../Utils/FormatPriceValues'
import DepositModal from './DepositModal'
import {
  AMP_MODAL_STYLES,
  AmpItemCard,
  AmpSearch,
  AmpSort,
  AmpValuePill,
  CloseIcon,
  PlusIcon,
  prioritizeSelectedItems,
  RobuxIcon,
} from './AmpInventoryModalUI'
import { notifications } from './Notifications'
import { getCoinflipRoomGame, inventoryItemMatchesGame, normalizeCoinflipGameMode } from '../lib/coinflipGameMode'

const HEADS_ICON = '/heads.webp'
const TAILS_ICON = '/tails.webp'
const MAX_ITEMS = 20

const numericValue = (...values) => {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue
    const parsed = typeof value === 'number' ? value : parsePriceValue(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

const displayNumber = (value) => Number(value || 0).toLocaleString('en-US', {
  maximumFractionDigits: 2,
})

export default function CoinflipJoinModal({ room, gameMode: selectedGameMode = null, gameType = 'coinflip', onClose, onJoin }) {
  const isMines = gameType === 'mines'
  const user = useAuth((state) => state.user)
  const [inventoryItems, setInventoryItems] = useState([])
  const [selectedItems, setSelectedItems] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [sortAscending, setSortAscending] = useState(false)
  const [inventoryLoading, setInventoryLoading] = useState(true)
  const [inventoryError, setInventoryError] = useState('')
  const [depositOpen, setDepositOpen] = useState(false)
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !depositOpen) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [depositOpen, onClose])

  useEffect(() => {
    let isMounted = true

    const loadInventory = async () => {
      setInventoryLoading(true)
      setInventoryError('')
      try {
        const response = await apiRequest('/api/inventory', { cache: 'no-store' })
        if (!isMounted) return
        setInventoryItems(Array.isArray(response?.items) ? response.items : [])
      } catch (error) {
        if (!isMounted) return
        setInventoryItems([])
        setInventoryError(error.message || 'Failed to load inventory.')
        notifications.error(error.message || 'Failed to load inventory.')
      } finally {
        if (isMounted) setInventoryLoading(false)
      }
    }

    void loadInventory()
    return () => { isMounted = false }
  }, [user?.id, user?.profile_id])

  const inventoryRows = useMemo(() => inventoryItems.map((item, index) => ({
    ...item,
    displayKey: item.id || `${item.name || 'inventory'}-${index}`,
  })), [inventoryItems])

  const gameMode = normalizeCoinflipGameMode(room?.game_mode)
    || getCoinflipRoomGame(room, null)
    || normalizeCoinflipGameMode(selectedGameMode)
  const eligibleRows = useMemo(
    () => inventoryRows.filter((item) => inventoryItemMatchesGame(item, gameMode)),
    [gameMode, inventoryRows],
  )

  const sortedFilteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const direction = sortAscending ? 1 : -1
    return eligibleRows
      .filter((item) => String(item.name || '').toLowerCase().includes(query))
      .slice()
      .sort((a, b) => (Number(a.value ?? 0) - Number(b.value ?? 0)) * direction)
  }, [eligibleRows, searchQuery, sortAscending])

  const visibleRows = useMemo(
    () => prioritizeSelectedItems(sortedFilteredRows, selectedItems),
    [selectedItems, sortedFilteredRows],
  )

  const selectedRows = useMemo(() => {
    const selected = new Set(selectedItems)
    return eligibleRows.filter((item) => selected.has(item.displayKey))
  }, [eligibleRows, selectedItems])

  const selectedValue = useMemo(
    () => selectedRows.reduce((total, item) => total + Number(item.value ?? 0), 0),
    [selectedRows],
  )

  const roomRequirements = room?.joinRequirements || room?.join_requirements || {}
  const creatorItemsValue = Array.isArray(room?.creator_items)
    ? room.creator_items.reduce((total, item) => total + numericValue(item?.value), 0)
    : 0
  const targetValue = numericValue(creatorItemsValue, room?.numericValue, room?.total_value, room?.totalValue, room?.value)
  const minValue = targetValue ? targetValue * 0.9 : numericValue(
    roomRequirements.min,
    room?.minJoinAmount,
    room?.min_join_amount,
  )
  const maxValue = targetValue ? targetValue * 1.1 : numericValue(
    roomRequirements.max,
    room?.maxJoinAmount,
    room?.max_join_amount,
  )
  const configuredMaxItems = numericValue(
    roomRequirements.maxItems,
    roomRequirements.max_items,
    room?.maxJoinItems,
    room?.max_join_items,
  )
  const itemLimit = configuredMaxItems > 0 ? Math.min(MAX_ITEMS, configuredMaxItems) : MAX_ITEMS
  const hasValueRange = minValue > 0 || maxValue > 0
  const valueIsValid = selectedRows.length > 0
    && (!hasValueRange || (selectedValue >= minValue && (!maxValue || selectedValue <= maxValue)))
  const canJoin = valueIsValid && selectedRows.length <= itemLimit

  const creatorSide = String(room?.creator_side || room?.creatorSide || room?.ownerCoin || 'heads').toLowerCase() === 'tails'
    ? 'tails'
    : 'heads'
  const storedOpponentSide = String(room?.opponent_side || room?.opponentSide || '').toLowerCase()
  const joinSide = storedOpponentSide === 'heads' || storedOpponentSide === 'tails'
    ? storedOpponentSide
    : creatorSide === 'heads' ? 'tails' : 'heads'

  const toggleItem = (displayKey) => {
    setSelectedItems((current) => {
      if (current.includes(displayKey)) return current.filter((key) => key !== displayKey)
      if (current.length >= itemLimit) {
        notifications.error(`You can join with up to ${itemLimit} items.`)
        return current
      }
      return [...current, displayKey]
    })
  }

  const toggleSelectAll = () => {
    const selectableKeys = sortedFilteredRows.slice(0, itemLimit).map((item) => item.displayKey)
    const allSelectableSelected = selectableKeys.length > 0 && selectableKeys.every((key) => selectedItems.includes(key))
    setSelectedItems(allSelectableSelected ? [] : selectableKeys)
  }

  const autoSelect = () => {
    const candidates = sortedFilteredRows
      .map((item) => ({ item, value: numericValue(item.value) }))
      .filter(({ value }) => value > 0)

    if (candidates.length === 0) {
      notifications.error('No eligible items are available to auto select.')
      return
    }

    if (!hasValueRange) {
      setSelectedItems(candidates.slice(0, itemLimit).map(({ item }) => item.displayKey))
      return
    }

    const epsilon = 0.000001
    const maxStart = Math.min(candidates.length, 250)
    let best = null

    for (let start = 0; start < maxStart; start += 1) {
      const picked = []
      let total = 0

      for (let index = start; index < candidates.length && picked.length < itemLimit; index += 1) {
        const candidate = candidates[index]
        const nextTotal = total + candidate.value
        if (maxValue > 0 && nextTotal > maxValue + epsilon) continue
        picked.push(candidate.item)
        total = nextTotal
        if (total >= minValue - epsilon) break
      }

      const valid = picked.length > 0
        && total >= minValue - epsilon
        && (!maxValue || total <= maxValue + epsilon)
      if (!valid) continue

      if (!best
        || (sortAscending && picked.length > best.items.length)
        || (!sortAscending && start < best.start)) {
        best = { items: picked, start, total }
      }

      if (!sortAscending && start === 0) break
    }

    if (!best) {
      notifications.error('No item combination in this order fits the required value range.')
      return
    }

    setSelectedItems(best.items.map((item) => item.displayKey))
  }

  const handleJoin = async () => {
    if (!canJoin || joining) return
    setJoining(true)

    try {
      const opponentAvatarUrl = user?.avatar_headshot_url || user?.avatar_url || null
      const payload = {
        roomId: room?.id || room?.room_id || null,
        opponent_uuid: String(user?.profile_id || user?.id || ''),
        opponent_username: user?.username || user?.email || 'user',
        opponent_side: joinSide,
        opponent_items: selectedRows.map((item) => ({
          id: item.id,
          name: item.name,
          image_url: item.image_url || null,
          value: Number(item.value ?? 0),
        })),
        opponent_avatar_url: opponentAvatarUrl,
        opponent_avatar: opponentAvatarUrl,
        item_ids: selectedRows.map((item) => item.id).filter(Boolean),
      }

      const response = await fetch(isMines ? '/api/mines/join' : '/api/coinflip/join', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const text = await response.text()
      let json = null
      try { json = text ? JSON.parse(text) : null } catch { json = null }

      if (!response.ok) throw new Error(json?.error || text || `Unable to join ${isMines ? 'Mines' : 'coinflip'}`)

      window.dispatchEvent(new CustomEvent('wallet:updated'))
      onJoin?.({
        room,
        updatedRoom: json?.data || null,
        selectedItems: selectedRows,
        selectedValue,
        side: joinSide,
      })
      notifications.joinedGame()
      onClose()
    } catch (error) {
      console.error(`[${isMines ? 'Mines' : 'Coinflip'}JoinModal] join failed`, error)
      notifications.error(error?.message || `Unable to join ${isMines ? 'Mines' : 'coinflip'}`)
      setJoining(false)
    }
  }

  if (typeof document === 'undefined') return null

  return createPortal(<>
    <DepositModal isOpen={depositOpen} onClose={() => setDepositOpen(false)} gameMode={gameMode} />
    <div className="amp-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="amp-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="game-join-title">
        <h2 className="amp-modal-header" id="game-join-title">Join</h2>
        <button type="button" className="amp-modal-close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        <div className="amp-modal-body">
          <div className="amp-modal-stack">
            <div className="amp-create-top">
              <AmpSearch value={searchQuery} onChange={setSearchQuery} />
              <div className="amp-create-summary amp-join-summary-hidden">
                <AmpValuePill label="Selected value" value={selectedValue} valid={valueIsValid} />
                <span className="amp-count-badge">{selectedItems.length}/{itemLimit} items</span>
                <span className="amp-join-required">
                  <span>Required</span>
                  <RobuxIcon />
                  <span>{displayNumber(minValue)}–{displayNumber(maxValue)}</span>
                </span>
                {configuredMaxItems > 0 ? <span className="amp-join-max-items">Max {configuredMaxItems} join items</span> : null}
              </div>
              <div className="amp-modal-controls">
                <AmpSort ascending={sortAscending} onChange={setSortAscending} />
              </div>
            </div>

            {inventoryLoading ? <div className="amp-inventory-loading"><span className="amp-spinner" /><p className="amp-loading-copy">Loading inventory</p></div>
              : inventoryError ? <div className="amp-inventory-empty"><div className="amp-empty-inner"><p className="amp-empty-copy">{inventoryError}</p><button type="button" className="amp-action" onClick={() => setDepositOpen(true)}><PlusIcon />Deposit</button></div></div>
              : eligibleRows.length === 0 ? <div className="amp-inventory-empty"><div className="amp-empty-inner"><p className="amp-empty-copy">Your inventory is empty.</p><button type="button" className="amp-action" onClick={() => setDepositOpen(true)}><PlusIcon />Deposit</button></div></div>
              : visibleRows.length === 0 ? <div className="amp-inventory-empty"><p className="amp-empty-copy">No items match “{searchQuery.trim()}”.</p></div>
              : <div className="amp-inventory-grid">{visibleRows.map((item) => <AmpItemCard key={item.displayKey} item={item} selectable selected={selectedItems.includes(item.displayKey)} onClick={() => toggleItem(item.displayKey)} />)}</div>}

            <div className="amp-sticky-footer">
              <div className="amp-footer-row amp-join-footer-row">
                <span className="amp-join-range"><RobuxIcon /><span>{displayNumber(minValue)} &ndash; {displayNumber(maxValue)}</span></span>
                <div className="amp-join-actions">
                  {!isMines ? <img className="amp-join-coin" src={joinSide === 'heads' ? HEADS_ICON : TAILS_ICON} alt={joinSide} draggable="false" /> : null}
                  <button type="button" className="amp-inventory-action amp-footer-selection-action" disabled={sortedFilteredRows.length === 0} onClick={toggleSelectAll}>{selectedItems.length > 0 && sortedFilteredRows.slice(0, itemLimit).every((item) => selectedItems.includes(item.displayKey)) ? 'Unselect All' : 'Select All'}</button>
                  <button type="button" className="amp-inventory-action amp-footer-selection-action" disabled={sortedFilteredRows.length === 0} onClick={autoSelect}>Auto Select</button>
                  <button type="button" className="amp-create-button" disabled={inventoryLoading || !canJoin || joining} onClick={handleJoin}>{joining ? 'Joining' : 'Join'}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <style>{AMP_MODAL_STYLES}</style>
      </section>
    </div>
  </>, document.body)
}
