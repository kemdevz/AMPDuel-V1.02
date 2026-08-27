import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabaseClient'
import { inventoryItemMatchesGame, normalizeCoinflipGameMode } from '../lib/coinflipGameMode'
import { useAuth } from '../store/auth'
import { AMP_MODAL_STYLES, AmpItemCard, AmpSearch, AmpSort, CloseIcon, prioritizeSelectedItems } from './AmpInventoryModalUI'

const MAX_ITEMS = 20

export default function MinesCreateModal({ gameMode = 'mm2', onClose }) {
  const user = useAuth((state) => state.user)
  const [inventoryItems, setInventoryItems] = useState([])
  const [selectedItems, setSelectedItems] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [sortAscending, setSortAscending] = useState(false)
  const [inventoryLoading, setInventoryLoading] = useState(true)
  const [inventoryError, setInventoryError] = useState('')

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
      const ownerIds = [user?.profile_id, user?.id]
        .filter((value) => value !== null && value !== undefined && value !== '')
        .map(String)
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        if (sessionData?.session?.user?.id) ownerIds.push(String(sessionData.session.user.id))
      } catch { /* Profile identifiers remain available for normal sessions. */ }

      const uniqueOwnerIds = [...new Set(ownerIds)]
      if (!uniqueOwnerIds.length) {
        if (mounted) { setInventoryItems([]); setInventoryLoading(false) }
        return
      }
      const { data, error } = await supabase.from('inventory_items').select('*').in('user_id', uniqueOwnerIds).order('created_at', { ascending: false })
      if (!mounted) return
      if (error) {
        setInventoryItems([])
        setInventoryError(error.message || 'Failed to load inventory.')
      } else setInventoryItems(data ?? [])
      setInventoryLoading(false)
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
      .sort((left, right) => (Number(left.value || 0) - Number(right.value || 0)) * direction)
    return prioritizeSelectedItems(sortedRows, selectedItems)
  }, [inventoryRows, searchQuery, selectedItems, sortAscending])
  const toggleItem = (displayKey) => setSelectedItems((current) => {
    if (current.includes(displayKey)) return current.filter((key) => key !== displayKey)
    return current.length >= MAX_ITEMS ? current : [...current, displayKey]
  })
  const toggleSelectAll = () => {
    const selectableKeys = visibleRows.slice(0, MAX_ITEMS).map((item) => item.displayKey)
    const allSelectableSelected = selectableKeys.length > 0 && selectableKeys.every((key) => selectedItems.includes(key))
    setSelectedItems(allSelectableSelected ? [] : selectableKeys)
  }

  if (typeof document === 'undefined') return null
  return createPortal(<div className="amp-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="amp-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="mines-create-title">
      <h2 className="amp-modal-header" id="mines-create-title">Create Mines</h2>
      <button type="button" className="amp-modal-close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
      <div className="amp-modal-body"><div className="amp-modal-stack">
        <div className="amp-create-top">
          <AmpSearch value={searchQuery} onChange={setSearchQuery} />
          <div className="amp-modal-controls"><AmpSort ascending={sortAscending} onChange={setSortAscending} /></div>
        </div>
        {inventoryLoading ? <div className="amp-inventory-loading"><span className="amp-spinner" /><p className="amp-loading-copy">Loading inventory</p></div>
          : inventoryError ? <div className="amp-inventory-empty"><p className="amp-empty-copy">{inventoryError}</p></div>
          : inventoryRows.length === 0 ? <div className="amp-inventory-empty"><p className="amp-empty-copy">Your inventory is empty.</p></div>
          : visibleRows.length === 0 ? <div className="amp-inventory-empty"><p className="amp-empty-copy">No items match “{searchQuery.trim()}”.</p></div>
          : <div className="amp-inventory-grid">{visibleRows.map((item) => <AmpItemCard key={item.displayKey} item={item} selectable selected={selectedItems.includes(item.displayKey)} onClick={() => toggleItem(item.displayKey)} />)}</div>}
        <div className="amp-sticky-footer"><div className="amp-footer-row"><button type="button" className="amp-inventory-action amp-footer-selection-action" disabled={visibleRows.length === 0} onClick={toggleSelectAll}>{selectedItems.length > 0 && visibleRows.slice(0, MAX_ITEMS).every((item) => selectedItems.includes(item.displayKey)) ? 'Unselect All' : 'Select All'}</button><button type="button" className="amp-create-button" disabled>Create</button></div></div>
      </div></div>
      <style>{AMP_MODAL_STYLES}</style>
    </section>
  </div>, document.body)
}
