import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabaseClient'
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

export default function CoinflipJoinModal({ room, gameMode: selectedGameMode = null, onClose, onJoin }) {
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
      const ownerIds = [user?.profile_id, user?.id]
        .filter((value) => value !== null && value !== undefined && value !== '')
        .map(String)

      try {
        const { data: sessionData } = await supabase.auth.getSession()
        if (sessionData?.session?.user?.id) ownerIds.push(String(sessionData.session.user.id))
        const { data: userData } = await supabase.auth.getUser()
        if (userData?.user?.id) ownerIds.push(String(userData.user.id))
      } catch (error) {
        console.warn('[CoinflipJoinModal] failed to collect owner ids', error)
      }

      const uniqueOwnerIds = [...new Set(ownerIds)]
      if (uniqueOwnerIds.length === 0) {
        if (isMounted) {
          setInventoryItems([])
          setInventoryLoading(false)
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
        setInventoryError(error.message || 'Failed to load inventory.')
        notifications.error(error.message || 'Failed to load inventory.')
      } else {
        setInventoryItems(data ?? [])
      }
      setInventoryLoading(false)
    }

    void loadInventory()
    return () => { isMounted = false }
  }, [user?.id, user?.profile_id])

  const inventoryRows = useMemo(() => inventoryItems.map((item, index) => ({
    ...item,
    displayKey: item.id || `${item.name || 'inventory'}-${index}`,
  })), [inventoryItems])

  const gameMode = normalizeCoinflipGameMode(room?.game_mode)
    || normalizeCoinflipGameMode(selectedGameMode)
    || getCoinflipRoomGame(room)
  const eligibleRows = useMemo(
    () => inventoryRows.filter((item) => inventoryItemMatchesGame(item, gameMode)),
    [gameMode, inventoryRows],
  )

  const visibleRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const direction = sortAscending ? 1 : -1
    return eligibleRows
      .filter((item) => String(item.name || '').toLowerCase().includes(query))
      .sort((a, b) => (Number(a.value ?? 0) - Number(b.value ?? 0)) * direction)
  }, [eligibleRows, searchQuery, sortAscending])

  const selectedRows = useMemo(() => {
    const selected = new Set(selectedItems)
    return eligibleRows.filter((item) => selected.has(item.displayKey))
  }, [eligibleRows, selectedItems])

  const selectedValue = useMemo(
    () => selectedRows.reduce((total, item) => total + Number(item.value ?? 0), 0),
    [selectedRows],
  )

  const roomRequirements = room?.joinRequirements || room?.join_requirements || {}
  const targetValue = numericValue(room?.numericValue, room?.total_value, room?.totalValue, room?.value)
  const minValue = numericValue(
    roomRequirements.min,
    room?.minJoinAmount,
    room?.min_join_amount,
    targetValue ? targetValue * 0.9 : 0,
  )
  const maxValue = numericValue(
    roomRequirements.max,
    room?.maxJoinAmount,
    room?.max_join_amount,
    targetValue ? targetValue * 1.1 : 0,
  )
  const configuredMaxItems = numericValue(
    roomRequirements.maxItems,
    roomRequirements.max_items,
    room?.maxJoinItems,
    room?.max_join_items,
  )
  const itemLimit = configuredMaxItems > 0 ? Math.min(MAX_ITEMS, configuredMaxItems) : MAX_ITEMS
  const valueIsValid = selectedRows.length > 0
    && (!targetValue || (selectedValue >= minValue && selectedValue <= maxValue))
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

      const response = await fetch('/api/coinflip/join', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const text = await response.text()
      let json = null
      try { json = text ? JSON.parse(text) : null } catch { json = null }

      if (!response.ok) throw new Error(json?.error || text || 'Unable to join coinflip')

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
      console.error('[CoinflipJoinModal] join failed', error)
      notifications.error(error?.message || 'Unable to join coinflip')
      setJoining(false)
    }
  }

  if (typeof document === 'undefined') return null

  return createPortal(<>
    <DepositModal isOpen={depositOpen} onClose={() => setDepositOpen(false)} />
    <div className="amp-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="amp-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="coinflip-join-title">
        <h2 className="amp-modal-header" id="coinflip-join-title">Join</h2>
        <button type="button" className="amp-modal-close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        <div className="amp-modal-body">
          <div className="amp-modal-stack">
            <div className="amp-create-top">
              <AmpSearch value={searchQuery} onChange={setSearchQuery} />
              <div className="amp-create-summary amp-join-summary-hidden">
                <AmpValuePill label="Selected value" value={selectedValue} valid={valueIsValid} />
                <span className="amp-count-badge">{selectedItems.length}/{MAX_ITEMS} items</span>
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
              : eligibleRows.length === 0 ? <div className="amp-inventory-empty"><div className="amp-empty-inner"><p className="amp-empty-copy">You do not have any available items.</p><button type="button" className="amp-action" onClick={() => setDepositOpen(true)}><PlusIcon />Deposit</button></div></div>
              : visibleRows.length === 0 ? <div className="amp-inventory-empty"><p className="amp-empty-copy">No items match “{searchQuery.trim()}”.</p></div>
              : <div className="amp-inventory-grid">{visibleRows.map((item) => <AmpItemCard key={item.displayKey} item={item} selectable selected={selectedItems.includes(item.displayKey)} onClick={() => toggleItem(item.displayKey)} />)}</div>}

            <div className="amp-sticky-footer">
              <div className="amp-footer-row amp-join-footer-row">
                <span className="amp-join-range"><RobuxIcon /><span>{displayNumber(minValue)}&ndash;{displayNumber(maxValue)}</span></span>
                <div className="amp-join-actions">
                  <img className="amp-join-coin" src={joinSide === 'heads' ? HEADS_ICON : TAILS_ICON} alt={joinSide} draggable="false" />
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
