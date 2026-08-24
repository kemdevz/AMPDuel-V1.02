import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../store/auth'
import DepositModal from './DepositModal'
import {
  AMP_MODAL_STYLES,
  AmpItemCard,
  AmpSearch,
  AmpSort,
  AmpValuePill,
  CloseIcon,
  PlusIcon,
} from './AmpInventoryModalUI'
import { notifications } from './Notifications'

const HEADS_ICON = '/heads.webp'
const TAILS_ICON = '/tails.webp'
const MAX_ITEMS = 20
const JOIN_LIMITS = [1, 5, 10, 15]

export default function CoinflipCreateModal({ onClose, onCreate }) {
  const user = useAuth((state) => state.user)
  const [inventoryItems, setInventoryItems] = useState([])
  const [selectedItems, setSelectedItems] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [sortAscending, setSortAscending] = useState(false)
  const [selectedCoin, setSelectedCoin] = useState('heads')
  const [maxJoinItems, setMaxJoinItems] = useState(null)
  const [inventoryLoading, setInventoryLoading] = useState(true)
  const [inventoryError, setInventoryError] = useState('')
  const [depositOpen, setDepositOpen] = useState(false)
  const [creating, setCreating] = useState(false)

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
        console.warn('[CoinflipCreateModal] failed to collect owner ids', error)
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

  const visibleRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const direction = sortAscending ? 1 : -1
    return inventoryRows
      .filter((item) => String(item.name || '').toLowerCase().includes(query))
      .sort((a, b) => (Number(a.value ?? 0) - Number(b.value ?? 0)) * direction)
  }, [inventoryRows, searchQuery, sortAscending])

  const selectedValue = useMemo(() => {
    const selected = new Set(selectedItems)
    return inventoryRows.reduce((total, item) => selected.has(item.displayKey) ? total + Number(item.value ?? 0) : total, 0)
  }, [inventoryRows, selectedItems])

  const toggleItem = (displayKey) => {
    setSelectedItems((current) => {
      if (current.includes(displayKey)) return current.filter((key) => key !== displayKey)
      if (current.length >= MAX_ITEMS) {
        notifications.error(`You can wager up to ${MAX_ITEMS} items.`)
        return current
      }
      return [...current, displayKey]
    })
  }

  const tryCreateRemote = async (body) => {
    const response = await fetch('/api/coinflip/create', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await response.text()
    let json = null
    try { json = text ? JSON.parse(text) : null } catch { json = null }
    if (!response.ok) throw new Error(json?.error || text || `status:${response.status}`)
    return json ?? {}
  }

  const handleCreate = async () => {
    if (selectedItems.length === 0 || creating) return
    setCreating(true)
    const selected = new Set(selectedItems)
    const selectedRows = inventoryRows.filter((item) => selected.has(item.displayKey))
    const creatorUuid = String(user?.profile_id || user?.id || '')
    const creatorAvatarUrl = user?.avatar_headshot_url || user?.avatar_url || null
    const payload = {
      creator_uuid: creatorUuid,
      creator_username: user?.username || user?.email || 'user',
      creator_side: selectedCoin,
      creator_items: selectedRows.map((item) => ({
        id: item.id,
        name: item.name,
        image_url: item.image_url || item.image || null,
        value: Number(item.value ?? 0),
      })),
      creator_avatar_url: creatorAvatarUrl,
      creator_avatar: creatorAvatarUrl,
      item_ids: selectedRows.map((item) => item.id),
      game_mode: null,
      max_join_items: maxJoinItems,
    }

    try {
      const result = await tryCreateRemote(payload)
      const returned = result?.data ?? result
      const roomLocal = {
        id: returned?.id || `local-${Date.now()}`,
        creator_uuid: creatorUuid,
        creator_username: payload.creator_username,
        creator_side: selectedCoin,
        creator_items: payload.creator_items,
        creator_avatar_url: creatorAvatarUrl,
        creator_avatar: creatorAvatarUrl,
        opponent_uuid: returned?.opponent_uuid || null,
        opponent_username: returned?.opponent_username || null,
        opponent_side: returned?.opponent_side || null,
        opponent_items: returned?.opponent_items || null,
        game_mode: returned?.game_mode || null,
        created_at: returned?.created_at || new Date().toISOString(),
      }
      try { onCreate?.(roomLocal) } catch (error) { console.warn('[coinflip] onCreate callback failed', error) }
      window.dispatchEvent(new CustomEvent('wallet:updated'))
      notifications.success('Coinflip created successfully!')
      onClose()
    } catch (error) {
      console.error('[CoinflipCreateModal] create failed', error)
      notifications.error(error?.message || 'Failed to create coinflip.')
    } finally {
      setCreating(false)
    }
  }

  if (typeof document === 'undefined') return null

  return createPortal(<>
    <DepositModal isOpen={depositOpen} onClose={() => setDepositOpen(false)} />
    <div className="amp-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="amp-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="coinflip-create-title">
        <h2 className="amp-modal-header" id="coinflip-create-title">Create</h2>
        <button type="button" className="amp-modal-close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        <div className="amp-modal-body">
          <div className="amp-modal-stack">
            <div className="amp-create-top">
              <div className="amp-create-summary">
                <AmpValuePill label="Selected value" value={selectedValue} />
                <span className="amp-count-badge">{selectedItems.length}/{MAX_ITEMS} items</span>
              </div>
              <div className="amp-modal-controls">
                <AmpSearch value={searchQuery} onChange={setSearchQuery} />
                <AmpSort ascending={sortAscending} onChange={setSortAscending} />
              </div>
            </div>

            <div className="amp-limit-row" aria-label="Maximum join items">
              {JOIN_LIMITS.map((limit) => <button type="button" key={limit} className={`amp-limit-button${maxJoinItems === limit ? ' is-active' : ''}`} aria-pressed={maxJoinItems === limit} onClick={() => setMaxJoinItems((current) => current === limit ? null : limit)}>{limit}x</button>)}
            </div>

            {inventoryLoading ? <div className="amp-inventory-loading"><span className="amp-spinner" /><p className="amp-loading-copy">Loading inventory</p></div>
              : inventoryError ? <div className="amp-inventory-empty"><div className="amp-empty-inner"><p className="amp-empty-copy">{inventoryError}</p><button type="button" className="amp-action" onClick={() => setDepositOpen(true)}><PlusIcon />Deposit</button></div></div>
              : inventoryRows.length === 0 ? <div className="amp-inventory-empty"><div className="amp-empty-inner"><p className="amp-empty-copy">You do not have any available items.</p><button type="button" className="amp-action" onClick={() => setDepositOpen(true)}><PlusIcon />Deposit</button></div></div>
              : visibleRows.length === 0 ? <div className="amp-inventory-empty"><p className="amp-empty-copy">No items match “{searchQuery.trim()}”.</p></div>
              : <div className="amp-inventory-grid">{visibleRows.map((item) => <AmpItemCard key={item.displayKey} item={item} selectable selected={selectedItems.includes(item.displayKey)} onClick={() => toggleItem(item.displayKey)} />)}</div>}

            <div className="amp-sticky-footer">
              <div className="amp-footer-row">
                <div className="amp-side-options" role="group" aria-label="Choose coin side">
                  {['heads', 'tails'].map((side) => <button type="button" key={side} className={`amp-side-button${selectedCoin === side ? ' is-active' : ''}`} aria-label={`Select ${side}`} aria-pressed={selectedCoin === side} onClick={() => setSelectedCoin(side)}><img src={side === 'heads' ? HEADS_ICON : TAILS_ICON} alt="" /></button>)}
                </div>
                <button type="button" className="amp-create-button" disabled={inventoryLoading || selectedItems.length === 0 || creating} onClick={handleCreate}>{creating ? 'Creating' : 'Create'}</button>
              </div>
            </div>
          </div>
        </div>
        <style>{AMP_MODAL_STYLES}</style>
      </section>
    </div>
  </>, document.body)
}
