import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiRequest } from '../lib/apiClient'
import { inventoryItemMatchesGame, normalizeCoinflipGameMode } from '../lib/coinflipGameMode'
import { useAuth } from '../store/auth'
import { AMP_MODAL_STYLES, AmpItemCard, AmpSearch, AmpSort, CloseIcon, prioritizeSelectedItems } from './AmpInventoryModalUI'
import { MinesIcon } from './icons'
import { notifications } from './Notifications'

const MAX_ITEMS = 20

const MINES_CREATE_STYLES = `
  .mines-footer-slider { display: flex; width: 190px; height: 40px; flex: 0 1 190px; align-items: center; gap: 9px; padding: 0 12px; border-radius: 7px; color: #fff; background: #3C3C59; font: 600 12px/14.4px Poppins,sans-serif; }
  .mines-footer-slider > svg { display: block; width: 14px; height: 14px; flex: 0 0 14px; color: inherit; transform: translateY(-1px); }
  .mines-footer-slider > span { color: inherit; line-height: 14px; white-space: nowrap; }
  .mines-footer-slider output { min-width: 18px; color: #f4f5f8; text-align: right; }
  .mines-footer-slider input { width: 100%; min-width: 56px; height: 5px; margin: 0; appearance: none; border-radius: 999px; outline: 0; background: linear-gradient(to right, #DDD2F1 0, #804AFF var(--mine-progress), #4D4A6B var(--mine-progress), #4D4A6B 100%); cursor: pointer; }
  .mines-footer-slider input:focus-visible { outline: 2px solid #DDD2F1; outline-offset: 3px; }
  .mines-footer-slider input::-webkit-slider-thumb { width: 15px; height: 15px; appearance: none; border: 2px solid #804AFF; border-radius: 50%; background: #DDD2F1; box-shadow: none; }
  .mines-footer-slider input::-moz-range-thumb { width: 15px; height: 15px; border: 2px solid #804AFF; border-radius: 50%; background: #DDD2F1; box-shadow: none; }
  .mines-create-footer-row { justify-content: space-between; }
  .mines-create-footer-row .amp-footer-selection-group { margin-right: auto; }
  .mines-create-footer-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 12px; }
  .mines-create-error { margin: 0; padding: 9px 12px; border: 1px solid rgba(239,98,113,.2); border-radius: 7px; color: #ef7885; background: rgba(227,79,95,.08); font: 600 11px/16px Poppins,sans-serif; }
  @media (max-width: 700px) { .mines-create-footer-row { align-items: stretch; flex-direction: column; } .mines-create-footer-row .amp-footer-selection-group { width: 100%; flex-wrap: wrap; } .mines-create-footer-actions { width: 100%; justify-content: flex-end; } }
  @media (max-width: 560px) { .mines-footer-slider { width: 150px; flex-basis: 150px; } }
`

export default function MinesCreateModal({ gameMode = 'mm2', onClose, onCreate }) {
  const user = useAuth((state) => state.user)
  const [inventoryItems, setInventoryItems] = useState([])
  const [selectedItems, setSelectedItems] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [sortAscending, setSortAscending] = useState(false)
  const [mineCount, setMineCount] = useState(3)
  const [inventoryLoading, setInventoryLoading] = useState(true)
  const [inventoryError, setInventoryError] = useState('')
  const [creationError, setCreationError] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    const handleKeyDown = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    let mounted = true
    const loadInventory = async () => {
      setInventoryLoading(true)
      setInventoryError('')
      try {
        const result = await apiRequest('/api/inventory', { cache: 'no-store' })
        if (mounted) setInventoryItems(Array.isArray(result?.items) ? result.items : [])
      } catch (error) {
        if (mounted) {
          setInventoryItems([])
          setInventoryError(error?.message || 'Failed to load inventory.')
          notifications.error(error?.message || 'Failed to load inventory.')
        }
      } finally {
        if (mounted) setInventoryLoading(false)
      }
    }
    void loadInventory()
    return () => { mounted = false }
  }, [user?.id, user?.profile_id])

  const normalizedGameMode = normalizeCoinflipGameMode(gameMode, 'mm2')
  const inventoryRows = useMemo(() => inventoryItems
    .filter((item) => inventoryItemMatchesGame(item, normalizedGameMode))
    .map((item, index) => ({ ...item, displayKey: item.id || `${item.name || 'inventory'}-${index}` })), [inventoryItems, normalizedGameMode])
  const visibleRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const direction = sortAscending ? 1 : -1
    const sortedRows = inventoryRows
      .filter((item) => String(item.name || '').toLowerCase().includes(query))
      .slice()
      .sort((left, right) => (Number(left.value || 0) - Number(right.value || 0)) * direction)
    return prioritizeSelectedItems(sortedRows, selectedItems)
  }, [inventoryRows, searchQuery, selectedItems, sortAscending])
  const selectedRows = useMemo(() => {
    const selected = new Set(selectedItems)
    return inventoryRows.filter((item) => selected.has(item.displayKey))
  }, [inventoryRows, selectedItems])

  const toggleItem = (displayKey) => {
    setCreationError('')
    setSelectedItems((current) => {
      if (current.includes(displayKey)) return current.filter((key) => key !== displayKey)
      if (current.length >= MAX_ITEMS) {
        notifications.error(`You can wager up to ${MAX_ITEMS} items.`)
        return current
      }
      return [...current, displayKey]
    })
  }
  const toggleSelectAll = () => {
    setCreationError('')
    const selectableKeys = visibleRows.slice(0, MAX_ITEMS).map((item) => item.displayKey)
    const allSelected = selectableKeys.length > 0 && selectableKeys.every((key) => selectedItems.includes(key))
    setSelectedItems(allSelected ? [] : selectableKeys)
  }
  const handleCreate = async () => {
    if (!selectedRows.length || creating) return
    setCreationError('')
    setCreating(true)
    try {
      const result = await apiRequest('/api/mines/create', {
        method: 'POST',
        body: JSON.stringify({ game_mode: normalizedGameMode, grid_size: 5, mine_count: mineCount, max_players: 2, item_ids: selectedRows.map((item) => item.id) }),
      })
      if (!result?.data?.id) throw new Error('The Mines game was not created. Please try again.')
      window.dispatchEvent(new CustomEvent('wallet:updated'))
      onCreate?.(result.data)
      notifications.success('Mines game created successfully!')
      onClose()
    } catch (error) {
      const message = error?.message || 'Unable to create Mines game.'
      setCreationError(message)
      notifications.error(message)
    } finally {
      setCreating(false)
    }
  }

  if (typeof document === 'undefined') return null
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.slice(0, MAX_ITEMS).every((item) => selectedItems.includes(item.displayKey))

  return createPortal(<div className="amp-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="amp-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="mines-create-title">
      <h2 className="amp-modal-header" id="mines-create-title">Create Mines</h2>
      <button type="button" className="amp-modal-close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
      <div className="amp-modal-body"><div className="amp-modal-stack">
        <div className="amp-create-top">
          <AmpSearch value={searchQuery} onChange={setSearchQuery} />
          <div className="amp-modal-controls"><AmpSort ascending={sortAscending} onChange={setSortAscending} /></div>
        </div>
        {creationError ? <p className="mines-create-error" role="alert">{creationError}</p> : null}
        {inventoryLoading ? <div className="amp-inventory-loading"><span className="amp-spinner" /><p className="amp-loading-copy">Loading inventory</p></div>
          : inventoryError ? <div className="amp-inventory-empty"><p className="amp-empty-copy">{inventoryError}</p></div>
          : inventoryRows.length === 0 ? <div className="amp-inventory-empty"><p className="amp-empty-copy">Your inventory is empty.</p></div>
          : visibleRows.length === 0 ? <div className="amp-inventory-empty"><p className="amp-empty-copy">No items match “{searchQuery.trim()}”.</p></div>
          : <div className="amp-inventory-grid">{visibleRows.map((item) => <AmpItemCard key={item.displayKey} item={item} selectable selected={selectedItems.includes(item.displayKey)} onClick={() => toggleItem(item.displayKey)} />)}</div>}
        <div className="amp-sticky-footer"><div className="amp-footer-row mines-create-footer-row"><div className="amp-footer-selection-group"><label className="mines-footer-slider"><MinesIcon /><span>Mines</span><input type="range" min="1" max="24" value={mineCount} aria-label="Number of mines" style={{ '--mine-progress': `${((mineCount - 1) / 23) * 100}%` }} onChange={(event) => { setCreationError(''); setMineCount(Number(event.target.value)) }} /><output>{mineCount}</output></label></div><div className="mines-create-footer-actions"><button type="button" className="amp-inventory-action amp-footer-selection-action" disabled={!visibleRows.length} onClick={toggleSelectAll}>{allVisibleSelected ? 'Unselect All' : 'Select All'}</button><button type="button" className="amp-create-button" disabled={inventoryLoading || selectedRows.length === 0 || creating} onClick={handleCreate}>{creating ? 'Creating' : 'Create'}</button></div></div></div>
      </div></div>
      <style>{AMP_MODAL_STYLES}{MINES_CREATE_STYLES}</style>
    </section>
  </div>, document.body)
}
