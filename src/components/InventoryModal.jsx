import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiRequest } from '../lib/apiClient'
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

export default function WalletModal({
  isOpen,
  onClose,
  onOpenWithdrawalDeposit,
  footer,
  ariaLabel = 'Wallet inventory',
  profileId = null,
  readOnly = false,
}) {
  const user = useAuth((state) => state.user)
  const [depositOpen, setDepositOpen] = useState(false)
  const [inventoryItems, setInventoryItems] = useState([])
  const [selectedItems, setSelectedItems] = useState([])
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [inventoryError, setInventoryError] = useState('')
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawMode, setWithdrawMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortAscending, setSortAscending] = useState(false)

  useEffect(() => {
    if (!isOpen) return undefined
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || depositOpen) return
      if (withdrawMode) {
        setWithdrawMode(false)
        setSelectedItems([])
      } else {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [depositOpen, isOpen, onClose, withdrawMode])

  useEffect(() => {
    if (!isOpen) {
      setDepositOpen(false)
      setSelectedItems([])
      setWithdrawMode(false)
      setSearchQuery('')
      return undefined
    }

    let isMounted = true
    let inventoryChannel = null

    const loadInventory = async () => {
      setInventoryLoading(true)
      setInventoryError('')
      const resolvedProfileId = profileId || user?.profile_id
      if (!resolvedProfileId) {
        if (isMounted) {
          setInventoryItems([])
          setInventoryLoading(false)
          notifications.error('Please sign in to load your inventory.')
        }
        return
      }

      try {
        const result = await apiRequest(profileId
          ? `/api/admin/players/${encodeURIComponent(profileId)}/inventory`
          : '/api/inventory')
        if (isMounted) setInventoryItems(result?.items ?? [])
      } catch (error) {
        if (isMounted) {
          setInventoryItems([])
          setInventoryError(error.message || 'Failed to load inventory.')
          notifications.error(error.message || 'Failed to load inventory.')
        }
      } finally {
        if (isMounted) setInventoryLoading(false)
      }
    }

    void loadInventory()
    const realtimeOwnerIds = (profileId ? [profileId] : [user?.profile_id, user?.id])
      .filter((value) => value !== null && value !== undefined && value !== '')
      .map(String)
    const uniqueOwnerIds = [...new Set(realtimeOwnerIds)]
    if (uniqueOwnerIds.length > 0) {
      inventoryChannel = supabase.channel(`inventory-${uniqueOwnerIds.join('-')}`)
      inventoryChannel.on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, () => {
        if (isMounted) void loadInventory()
      })
      inventoryChannel.subscribe()
    }

    return () => {
      isMounted = false
      if (inventoryChannel) supabase.removeChannel(inventoryChannel)
    }
  }, [isOpen, profileId, user?.id, user?.profile_id])

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

  const totalInventoryValue = useMemo(() => inventoryRows.reduce((sum, item) => sum + Number(item.value ?? 0), 0), [inventoryRows])
  const selectedInventoryItems = useMemo(() => {
    const selected = new Set(selectedItems)
    return inventoryRows.filter((item) => selected.has(item.displayKey))
  }, [inventoryRows, selectedItems])
  const selectedValue = useMemo(() => selectedInventoryItems.reduce((sum, item) => sum + Number(item.value ?? 0), 0), [selectedInventoryItems])
  const selectionEnabled = !readOnly && (Boolean(footer) || withdrawMode)

  const toggleItem = (displayKey) => {
    if (!selectionEnabled) return
    setSelectedItems((current) => current.includes(displayKey)
      ? current.filter((key) => key !== displayKey)
      : [...current, displayKey])
  }

  const onToggleSelectAll = () => {
    if (selectedItems.length === inventoryRows.length) setSelectedItems([])
    else setSelectedItems(inventoryRows.map((item) => item.displayKey))
  }

  const handleWithdraw = async () => {
    if (withdrawing || selectedInventoryItems.length === 0) return
    setWithdrawing(true)
    try {
      if (!user?.profile_id) throw new Error('Please sign in to withdraw items.')
      const inventoryIds = selectedInventoryItems.map((item) => item.id).filter(Boolean)
      if (inventoryIds.length !== selectedInventoryItems.length) throw new Error('One or more selected items are missing their inventory UUID.')
      await apiRequest('/api/withdrawals', {
        method: 'POST',
        body: JSON.stringify({ item_ids: inventoryIds }),
      })
      setSelectedItems([])
      setWithdrawMode(false)
      setInventoryItems((current) => current.filter((item) => !inventoryIds.includes(item.id)))
      notifications.success('Withdrawal request created successfully!')
      window.dispatchEvent(new CustomEvent('wallet:updated'))
      if (onOpenWithdrawalDeposit) {
        onClose()
        onOpenWithdrawalDeposit()
      }
    } catch (error) {
      notifications.error(error?.message || 'Failed to withdraw items.')
    } finally {
      setWithdrawing(false)
    }
  }

  if (!isOpen || typeof document === 'undefined') return null

  const customFooter = footer
    ? (typeof footer === 'function' ? footer({
      selectedItems: selectedInventoryItems,
      selectedAmount: selectedItems.length,
      selectedValue,
      totalItems: inventoryRows.length,
      onToggleSelectAll,
    }) : footer)
    : null

  return createPortal(<>
    <DepositModal isOpen={depositOpen} onClose={() => setDepositOpen(false)} />
    <div className="amp-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="amp-modal-dialog" role="dialog" aria-modal="true" aria-label={ariaLabel}>
        <h2 className="amp-modal-header">Inventory</h2>
        <button type="button" className="amp-modal-close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        <div className="amp-modal-body">
          <div className="amp-modal-stack">
            <div className="amp-wallet-top">
              <AmpValuePill label="Total value" value={totalInventoryValue} />
              <div className="amp-modal-controls">
                <AmpSearch value={searchQuery} onChange={setSearchQuery} />
                {!readOnly ? <button type="button" className="amp-action" onClick={() => setDepositOpen(true)}><PlusIcon />Deposit</button> : null}
                {!readOnly && !footer && inventoryRows.length > 0 ? <button type="button" className="amp-action amp-action-green" onClick={() => { setWithdrawMode(true); setSelectedItems([]) }}>Withdraw</button> : null}
                <AmpSort ascending={sortAscending} onChange={setSortAscending} />
              </div>
            </div>

            {inventoryLoading ? <div className="amp-inventory-loading"><span className="amp-spinner" /><p className="amp-loading-copy">Loading inventory</p></div>
              : inventoryError ? <div className="amp-inventory-empty"><p className="amp-empty-copy">{inventoryError}</p></div>
              : inventoryRows.length === 0 ? <div className="amp-inventory-empty"><div className="amp-empty-inner"><p className="amp-empty-copy">Your inventory is empty.</p>{!readOnly ? <button type="button" className="amp-action" onClick={() => setDepositOpen(true)}><PlusIcon />Deposit</button> : null}</div></div>
              : visibleRows.length === 0 ? <div className="amp-inventory-empty"><p className="amp-empty-copy">No items match “{searchQuery.trim()}”.</p></div>
              : <div className="amp-inventory-grid">{visibleRows.map((item) => <AmpItemCard key={item.displayKey} item={item} selectable={selectionEnabled} selected={selectedItems.includes(item.displayKey)} onClick={() => toggleItem(item.displayKey)} />)}</div>}

            {customFooter ? <div className="amp-sticky-footer"><div className="amp-custom-footer">{customFooter}</div></div> : null}
            {!footer && withdrawMode ? <div className="amp-sticky-footer"><div className="amp-footer-row"><button type="button" className="amp-action amp-action-muted" onClick={() => { setWithdrawMode(false); setSelectedItems([]) }}>Cancel</button><button type="button" className="amp-create-button" disabled={selectedItems.length === 0 || withdrawing} onClick={handleWithdraw}>{withdrawing ? 'Withdrawing' : `Withdraw ${selectedItems.length || ''} ${selectedItems.length === 1 ? 'item' : 'items'}`}</button></div></div> : null}
          </div>
        </div>
        <style>{AMP_MODAL_STYLES}</style>
      </section>
    </div>
  </>, document.body)
}
