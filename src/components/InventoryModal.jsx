import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiRequest } from '../lib/apiClient'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../store/auth'
import DepositModal from './DepositModal'
import InventoryItemCard, { inventoryItemCardStyles } from './InventoryItemCard'
import { notifications } from './Notifications'

const COIN_ICON = '/currency.svg'

const formatNumber = (value) => {
  const numericValue = Number(value ?? 0)
  return Number.isFinite(numericValue) ? numericValue.toLocaleString() : '0'
}

function ItemsIcon() {
  return (
    <svg viewBox="0 0 30 30" width="30" height="30" fill="none" aria-hidden="true">
      <path d="M6.33953 0 0 23.66 23.6605 30 30 6.34 6.33953 0Zm11.08147 19.1925-6.6119-1.7713 1.7724-6.6124 6.6132 1.7724-1.7737 6.6113Z" fill="currentColor" />
    </svg>
  )
}

function ChevronIcon() {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
}

function LoadingButton({ className, disabled = false, onClick, children }) {
  return (
    <button className={`${className} _loadingButtonBase_cpcgp_399`} disabled={disabled} type="button" onClick={onClick}>
      <span className="_buttonLabel_cpcgp_401">{children}</span>
      <span className="_buttonSpinnerWrap_cpcgp_410">
        <span className="_loaderSmall_cpcgp_423" />
      </span>
    </button>
  )
}

export default function WalletModal({ isOpen, onClose, onOpenWithdrawalDeposit, footer, ariaLabel = 'Wallet inventory', profileId = null, readOnly = false }) {
  const user = useAuth((state) => state.user)
  const [depositOpen, setDepositOpen] = useState(false)
  const [inventoryItems, setInventoryItems] = useState([])
  const [selectedItems, setSelectedItems] = useState([])
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [inventoryError, setInventoryError] = useState(null)
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawError, setWithdrawError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortAscending, setSortAscending] = useState(false)
  const [gameFilter, setGameFilter] = useState('all')
  const [gameFilterTouched, setGameFilterTouched] = useState(false)

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
      return undefined
    }

    let isMounted = true
    let inventoryChannel = null

    const loadInventory = async () => {
      setInventoryLoading(true)
      setInventoryError(null)

      const resolvedProfileId = profileId || user?.profile_id
      if (!resolvedProfileId) {
        if (!isMounted) return
        setInventoryItems([])
        setInventoryLoading(false)
        setInventoryError(null)
        notifications.error('Please sign in to load your inventory.')
        return
      }

      try {
        const result = await apiRequest(profileId
          ? `/api/admin/players/${encodeURIComponent(profileId)}/inventory`
          : '/api/inventory')
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

    const ownerIdsForRealtime = profileId ? [profileId] : [user?.profile_id, user?.id]
      .filter((value) => value !== null && value !== undefined && value !== '')
      .map((value) => String(value))

    const uniqueOwnerIdsForRealtime = [...new Set(ownerIdsForRealtime)]
    if (uniqueOwnerIdsForRealtime.length > 0) {
      const channelName = `inventory-${uniqueOwnerIdsForRealtime.join('-')}`
      inventoryChannel = supabase.channel(channelName)
      inventoryChannel.on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, () => {
        if (isMounted) {
          void loadInventory()
        }
      })
      inventoryChannel.subscribe()
    }

    return () => {
      isMounted = false
      if (inventoryChannel) {
        supabase.removeChannel(inventoryChannel)
      }
    }
  }, [isOpen, profileId, user?.id, user?.profile_id])

  useEffect(() => {
    if (!isOpen) {
      setSelectedItems([])
      setWithdrawError(null)
    }
  }, [isOpen])

  if (!isOpen) return null

  const totalInventoryValue = inventoryItems.reduce((sum, item) => sum + Number(item.value ?? 0), 0)
  const totalInventoryCount = inventoryItems.length
  const allInventoryRows = inventoryItems.map((item, index) => ({
    ...item,
    displayKey: item.id || `${item.name || 'inventory'}-${index}`,
  }))
  const displayInventoryItems = allInventoryRows
    .filter((item) => String(item.name || '').toLowerCase().includes(searchQuery.trim().toLowerCase()))
    .filter((item) => {
      if (!gameFilterTouched || gameFilter === 'all') return true
      const itemGame = String(item.type || item.game || item.item_type || 'mm2').toLowerCase()
      return itemGame.includes(gameFilter) || (gameFilter === 'ps99' && itemGame.includes('pet')) || (gameFilter === 'adm' && itemGame.includes('adopt'))
    })
    .sort((a, b) => {
      const aSelected = selectedItems.includes(a.displayKey)
      const bSelected = selectedItems.includes(b.displayKey)
      if (aSelected !== bSelected) return aSelected ? -1 : 1
      return sortAscending
        ? Number(a.value ?? 0) - Number(b.value ?? 0)
        : Number(b.value ?? 0) - Number(a.value ?? 0)
    })

  const selectedAmount = selectedItems.length
  const selectedValue = allInventoryRows
    .filter((item) => selectedItems.includes(item.displayKey))
    .reduce((sum, item) => sum + Number(item.value ?? 0), 0)
  const selectedInventoryItems = allInventoryRows
    .filter((item) => selectedItems.includes(item.displayKey))
  const allInventoryKeys = allInventoryRows.map((item) => item.displayKey)
  const onToggleSelectAll = () => {
    if (selectedAmount === allInventoryRows.length) {
      setSelectedItems([])
      return
    }
    setSelectedItems(allInventoryKeys)
  }

  const handleWithdraw = async () => {
    if (withdrawing || selectedAmount === 0) return

    const itemsToWithdraw = allInventoryRows.filter((item) => selectedItems.includes(item.displayKey))
    if (itemsToWithdraw.length === 0) return

    setWithdrawing(true)
    setWithdrawError(null)

    try {
      if (!user?.profile_id) {
        throw new Error('Please sign in to withdraw items.')
      }

      const inventoryIds = itemsToWithdraw.map((item) => item.id).filter(Boolean)
      if (inventoryIds.length !== itemsToWithdraw.length) {
        throw new Error('One or more selected items are missing their inventory UUID.')
      }

      await apiRequest('/api/withdrawals', {
        method: 'POST',
        body: JSON.stringify({ item_ids: inventoryIds }),
      })

      setSelectedItems([])
      setInventoryItems((prev) => prev.filter((item) => !inventoryIds.includes(item.id)))
      notifications.success('Withdrawal request created successfully!')
      window.dispatchEvent(new CustomEvent('wallet:updated'))
      if (onOpenWithdrawalDeposit) {
        onClose()
        onOpenWithdrawalDeposit()
      } else {
        setDepositOpen(true)
      }
    } catch (err) {
      setWithdrawError(null)
      notifications.error(err?.message || 'Failed to withdraw items.')
    } finally {
      setWithdrawing(false)
    }
  }

  return createPortal(
    <div className="wallet-reference-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="wallet-reference-dialog" role="dialog" aria-modal="true" aria-label={ariaLabel}>
        <button aria-label="Close" className="wallet-reference-close" type="button" onClick={onClose}><CloseIcon /></button>
        <div className="wallet-reference-heading"><h2>Inventory</h2></div>

        <div className="wallet-reference-main">
          <div className="wallet-reference-controls">
            <div className="wallet-reference-search-group">
              <label htmlFor="wallet-inventory-search">Select Item</label>
              <input id="wallet-inventory-search" type="text" placeholder="Search for an item.." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
            </div>
            <div className="wallet-reference-selects">
              <label className="wallet-reference-select">
                <select value={sortAscending ? 'asc' : 'desc'} onChange={(event) => setSortAscending(event.target.value === 'asc')} aria-label="Sort inventory">
                  <option value="desc">High - Low</option><option value="asc">Low - High</option>
                </select><ChevronIcon />
              </label>
              <label className="wallet-reference-select">
                <select value={gameFilter} onChange={(event) => { setGameFilter(event.target.value); setGameFilterTouched(true) }} aria-label="Filter inventory by game">
                  <option value="all">All Games</option><option value="mm2">Murder Mystery 2</option><option value="adm">Adopt Me</option><option value="ps99">Pet Simulator 99</option>
                </select><ChevronIcon />
              </label>
            </div>
          </div>

          <div className="wallet-reference-summary">
            <div className="wallet-reference-summary-top">
              <div className="wallet-reference-stats">
                <div className="wallet-reference-stat"><img src={COIN_ICON} alt="Gem" /><div><div className="wallet-reference-stat-label">Value</div><div className="wallet-reference-stat-value">{formatNumber(totalInventoryValue)}</div></div></div>
                <div className="wallet-reference-stat wallet-reference-items-stat"><ItemsIcon /><div><div className="wallet-reference-stat-label">Items</div><div className="wallet-reference-stat-value">{formatNumber(totalInventoryCount)}</div></div></div>
              </div>
              {!readOnly ? <LoadingButton className="wallet-reference-plus" onClick={() => setDepositOpen(true)}>+</LoadingButton> : null}
            </div>
            <div className="wallet-reference-scroll" tabIndex="0"><div className="wallet-reference-grid">
              {inventoryLoading ? <div className="wallet-reference-empty"><h3>Loading...</h3><p>Fetching your inventory...</p></div>
                : inventoryError ? <div className="wallet-reference-empty"><h3>Couldn't load inventory</h3><p>{inventoryError}</p></div>
                : displayInventoryItems.length === 0 ? <div className="wallet-reference-empty"><h3>No Items!</h3><p>Your inventory seems to be empty...</p>{!readOnly ? <LoadingButton className="wallet-reference-deposit" onClick={() => setDepositOpen(true)}>Deposit Items</LoadingButton> : null}</div>
                : displayInventoryItems.map((item, index) => <InventoryItemCard key={item.displayKey || `${item.name}-${index}`} item={item} selected={!readOnly && selectedItems.includes(item.displayKey)} onToggleSelect={readOnly ? undefined : () => { setSelectedItems((prev) => prev.includes(item.displayKey) ? prev.filter((key) => key !== item.displayKey) : [...prev, item.displayKey]) }} />)}
            </div></div>
          </div>
        </div>

        {!readOnly ? <div className="wallet-reference-footer">
          {footer ? (typeof footer === 'function' ? footer({ selectedItems: selectedInventoryItems, selectedAmount, selectedValue, totalItems: allInventoryRows.length, onToggleSelectAll }) : footer) : <>
            <LoadingButton className="wallet-reference-select-all" disabled={allInventoryRows.length === 0} onClick={onToggleSelectAll}>{selectedAmount === allInventoryRows.length && allInventoryRows.length > 0 ? 'Unselect All' : 'Select All'}</LoadingButton>
            <LoadingButton className="wallet-reference-withdraw" disabled={selectedAmount === 0 || withdrawing} onClick={handleWithdraw}>Withdraw R${formatNumber(selectedValue)}</LoadingButton>
          </>}
          {withdrawError ? <p className="wallet-reference-error">{withdrawError}</p> : null}
        </div> : null}

        <style>{`
          ${inventoryItemCardStyles}
          @keyframes _fadeIn_cpcgp_1 { from { opacity: 0; } to { opacity: 1; } }
          @keyframes _modalOpen_cpcgp_1 { from { transform: scale(.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
          @keyframes _spin_cpcgp_1 { to { transform: rotate(360deg); } }

          @keyframes walletReferenceOverlayIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes walletReferenceDialogIn {
            from { opacity: 0; transform: translateY(6px) scale(.985); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }

          .wallet-reference-overlay {
            position: fixed;
            inset: 0;
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
            padding: 0;
            background: hsl(228 17% 12% / .4);
            animation: walletReferenceOverlayIn .2s ease-out;
          }

          .wallet-reference-dialog {
            position: relative;
            z-index: 10001;
            display: flex;
            width: 100%;
            max-width: 100%;
            height: 100dvh;
            box-sizing: border-box;
            flex-direction: column;
            justify-content: space-between;
            gap: 16px;
            padding: 24px 16px 16px;
            overflow: hidden;
            border: 1px solid hsl(231 16% 16%);
            border-radius: 0;
            background: hsl(227 17% 11%);
            color: #fff;
            box-shadow: 0 10px 15px -3px rgb(0 0 0 / .1), 0 4px 6px -4px rgb(0 0 0 / .1);
            font-family: Poppins, sans-serif;
            animation: walletReferenceDialogIn .2s ease-out;
          }

          .wallet-reference-dialog * { box-sizing: border-box; }
          .wallet-reference-heading { display: flex; flex-direction: column; flex: 0 0 auto; gap: 6px; text-align: center; }
          .wallet-reference-heading h2 { margin: 0; font-size: 18px; font-weight: 600; line-height: 18px; letter-spacing: -.025em; }
          .wallet-reference-main { min-height: 0; flex: 1 1 auto; }
          .wallet-reference-controls { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
          .wallet-reference-search-group { display: grid; width: 100%; align-items: center; gap: 8px; }
          .wallet-reference-search-group label { opacity: .8; font-size: 14px; font-weight: 500; line-height: 14px; }
          .wallet-reference-search-group input,
          .wallet-reference-select {
            width: 100%;
            height: 48px;
            border: 2px solid rgb(255 255 255 / .25);
            border-radius: 8px;
            background: transparent;
            color: rgb(255 255 255 / .5);
            font: 600 14px/20px Poppins, sans-serif;
            transition: border-color .15s ease;
          }
          .wallet-reference-search-group input { padding: 8px 12px; outline: none; }
          .wallet-reference-search-group input::placeholder { color: rgb(255 255 255 / .5); opacity: 1; }
          .wallet-reference-search-group input:focus,
          .wallet-reference-select:focus-within { border-color: rgb(255 255 255 / .6); }
          .wallet-reference-selects { display: flex; width: 100%; flex-direction: row; gap: 8px; }
          .wallet-reference-select { position: relative; display: flex; align-items: center; flex: 1 1 0; overflow: hidden; }
          .wallet-reference-select select { width: 100%; height: 100%; appearance: none; padding: 8px 36px 8px 12px; border: 0; outline: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; }
          .wallet-reference-select select option { background: hsl(227 17% 11%); color: #fff; }
          .wallet-reference-select svg { position: absolute; right: 12px; opacity: .5; pointer-events: none; }

          .wallet-reference-summary { margin-top: 16px; padding: 16px; border-radius: 8px; background: hsl(228 17% 12%); }
          .wallet-reference-summary-top { display: flex; align-items: center; gap: 24px; }
          .wallet-reference-stats { display: flex; align-items: center; gap: 32px; }
          .wallet-reference-stat { display: flex; align-items: center; gap: 8px; }
          .wallet-reference-stat > img { width: 35px; height: 35px; object-fit: contain; }
          .wallet-reference-items-stat > svg { width: 30px; height: 30px; color: #fff; }
          .wallet-reference-stat-label { opacity: .5; font-size: 12px; font-weight: 500; line-height: 16px; text-transform: uppercase; }
          .wallet-reference-stat-value { margin-top: -4px; font-size: 20px; font-weight: 700; line-height: 28px; }
          .wallet-reference-plus { display: inline-flex; width: 32px; height: 32px; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 6px; background: hsl(331 100% 65%); color: #000; font-size: 20px; font-weight: 600; line-height: 28px; cursor: pointer; }

          .wallet-reference-scroll { width: 100%; height: 100vh; max-height: calc(100dvh - 375px); margin-top: 16px; overflow: auto; outline: none; }
          .wallet-reference-grid { position: relative; display: grid; min-height: 100%; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; }
          .wallet-reference-empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
          .wallet-reference-empty h3 { margin: 0; font-size: 30px; font-weight: 500; line-height: 36px; }
          .wallet-reference-empty p { margin: 8px 0 0; opacity: .8; font-size: 16px; font-weight: 500; line-height: 24px; }
          .wallet-reference-deposit { display: inline-flex; height: 44px; margin-top: 24px; align-items: center; justify-content: center; padding: 0 32px; border: 0; border-radius: 6px; background: hsl(331 100% 65%); color: #000; font-size: 14px; font-weight: 600; cursor: pointer; }

          .wallet-reference-footer { display: flex; flex: 0 0 auto; flex-direction: row; gap: 8px; }
          .wallet-reference-footer button { display: inline-flex; height: 44px; align-items: center; justify-content: center; padding: 0 32px; border-radius: 6px; font: 600 14px/20px Poppins, sans-serif; cursor: pointer; transition: color .15s, background-color .15s, opacity .15s; }
          .wallet-reference-footer button:disabled { opacity: .5; cursor: not-allowed; }
          .wallet-reference-select-all { border: 1px solid hsl(331 100% 65%); background: hsl(331 100% 65% / .1); color: hsl(331 100% 65%); }
          .wallet-reference-withdraw { flex: 1 1 0; border: 0; background: hsl(331 100% 65%); color: #000; }
          .wallet-reference-error { width: 100%; margin: 8px 0 0; color: #ff6b81; font-size: 13px; text-align: right; }
          .wallet-reference-close { position: absolute; right: 16px; top: 16px; display: inline-flex; width: 20px; height: 20px; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 2px; background: transparent; color: #fff; opacity: .7; cursor: pointer; transition: opacity .15s; }
          .wallet-reference-close:hover { opacity: 1; }
          .wallet-reference-close:focus-visible { outline: 2px solid hsl(331 100% 65%); outline-offset: 2px; }

          .wallet-reference-dialog ._loadingButtonBase_cpcgp_399 { position: relative; overflow: hidden; }
          .wallet-reference-dialog ._buttonLabel_cpcgp_401 { display: inline-flex; width: 100%; align-items: center; justify-content: center; }
          .wallet-reference-dialog ._buttonSpinnerWrap_cpcgp_410 { display: none; }

          @media (min-width: 640px) {
            .wallet-reference-overlay { padding: 16px; }
            .wallet-reference-dialog { width: 100%; max-width: 672px; height: auto; max-height: calc(100dvh - 32px); border-radius: 8px; overflow: visible; }
            .wallet-reference-heading { text-align: left; }
            .wallet-reference-scroll { max-height: 400px; }
            .wallet-reference-footer { justify-content: flex-end; gap: 16px; }
            .wallet-reference-withdraw { flex: 0 0 auto; }
          }
          @media (min-width: 768px) {
            .wallet-reference-dialog { max-width: 768px; }
            .wallet-reference-controls { flex-direction: row; align-items: flex-end; }
            .wallet-reference-search-group { max-width: 384px; }
            .wallet-reference-select { width: 180px; flex: 0 0 180px; }
          }
          @media (min-width: 1024px) { .wallet-reference-dialog { max-width: 896px; } }
          @media (min-width: 1280px) { .wallet-reference-dialog { max-width: 1024px; } }
          @media (max-width: 639px) {
            .wallet-reference-overlay { align-items: flex-end; justify-content: flex-end; padding: 0; }
          }

          ._blurbg_cpcgp_1 {
            position: fixed;
            inset: 0;
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: rgba(0, 0, 0, .5);
            animation: _fadeIn_cpcgp_1 .5s ease-out;
          }

          ._modalbackgroundinventory_cpcgp_15 {
            position: relative;
            width: 90%;
            max-width: 1200px;
            box-sizing: border-box;
            padding: 15px;
            border: 1px solid #181a28;
            border-radius: 10px;
            background-color: #131520;
            color: #fff;
            overflow-y: auto;
            animation: _modalOpen_cpcgp_1 .3s forwards;
          }

          ._closeButton_150j2_55 {
            position: absolute;
            top: 5px;
            right: 10px;
            background: none;
            border: none;
            color: #fff;
            font-size: 24px;
            line-height: 1;
            cursor: pointer;
            opacity: .8;
            transition: opacity .3s ease, transform .2s ease;
          }

          ._closeButton_150j2_55:hover { opacity: 1; }

          ._headerinventory_cpcgp_43 {
            display: flex;
            align-items: center;
            justify-content: flex-start;
            gap: 8px;
            width: 100%;
            margin: 5px 0 10px;
          }

          ._walletHeaderControls_cpcgp_local {
            display: inline-flex;
            align-items: center;
            gap: 6px;
          }

          ._inputWrapper_cpcgp_59 {
            position: relative;
            display: flex;
            flex-grow: 1;
          }

          ._inputv3_cpcgp_65 {
            width: 300px;
            height: 40px;
            box-sizing: border-box;
            padding: 10px 18px;
            border: 2px solid #323240;
            border-radius: 5px;
            background: #1c1f2e;
            color: #fff;
            box-shadow: 0 10px 7.8px rgba(0,0,0,.15);
            font-size: .9rem;
            opacity: .9;
            text-align: center;
          }

          ._inputv3_cpcgp_65::placeholder {
            text-align: center;
            color: #cbd5e1;
          }

          ._inputv3_cpcgp_65:focus { outline: none; }

          ._searchIcon_cpcgp_82 {
            position: absolute;
            left: 15px;
            top: 50%;
            width: 20px;
            height: 20px;
            transform: translateY(-50%);
            color: #cbd5e1;
            pointer-events: none;
          }

          ._sortToggle_cpcgp_487 {
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

          ._sortToggle_cpcgp_487:hover { background: #2a2e44; }

          ._itemsWrapper_cpcgp_248 {
            position: relative;
            height: 350px;
            margin-top: 15px;
            padding: 12px;
            overflow-x: hidden;
            overflow-y: auto;
            border-radius: 6px;
            background-color: #1c1f2e;
          }

          ._stats_cpcgp_92 {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-top: -5px;
            margin-bottom: 12px;
          }

          ._statItem_cpcgp_100 {
            display: flex;
            align-items: center;
            justify-content: flex-start;
            gap: 6px;
          }

          ._statItem_cpcgp_100 img,
          ._statItem_cpcgp_100 svg {
            width: 20px;
            height: 20px;
            flex-shrink: 0;
          }

          ._statCol_cpcgp_107 {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 0;
          }

          ._statLabel_cpcgp_114 {
            color: rgba(255,255,255,.35);
            font-size: 10px;
            font-weight: 700;
            letter-spacing: .06em;
            text-transform: uppercase;
            line-height: 1;
            margin-bottom: 2px;
          }

          ._statValue_cpcgp_118 {
            order: 1;
            color: #f6f6f6;
            font-size: 17px;
            font-weight: 700;
            line-height: 1;
          }

          ._plusbutton_cpcgp_145,
          ._depositbutton_cpcgp_170 {
            position: relative;
            z-index: 20;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border: 1px solid rgba(255,79,163,.4);
            background: linear-gradient(135deg,#ff4fa3,#f43f8f);
            color: #fff;
            box-shadow: 0 2px 8px rgba(255,79,163,.25);
            cursor: pointer;
            transition: transform .15s ease, opacity .25s ease, background .25s ease;
          }

          ._plusbutton_cpcgp_145 {
            width: 34px;
            height: 34px;
            padding: 0;
            border-radius: 8px;
            font-size: 22px;
            font-weight: 700;
            flex-shrink: 0;
          }

          ._depositbutton_cpcgp_170 {
            min-height: 42px;
            padding: 10px 24px;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
          }

          ._plusbutton_cpcgp_145:hover,
          ._depositbutton_cpcgp_170:hover {
            background: linear-gradient(135deg,#ff4fa3,#f43f8f);
          }

          ._plusbutton_cpcgp_145:hover { transform: scale(1.05); }
          ._depositbutton_cpcgp_170:hover { transform: scale(1.03); }

          ._itemsGrid_cpcgp_259 {
            display: grid;
            grid-template-columns: repeat(auto-fill,minmax(160px,1fr));
            gap: 8px;
          }

          ._walletWithdrawError_cpcgp_local {
            width: 100%;
            margin: 8px 0 0;
            color: #ff6b81;
            font-size: 13px;
            text-align: right;
          }

          ._emptyState_cpcgp_432 {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            transform: translate(-50%,-50%);
            text-align: center;
          }

          ._emptyState_cpcgp_432 h1 {
            margin-bottom: 8px;
            color: #ddd;
            font-size: 20px;
            font-weight: 700;
          }

          ._emptyState_cpcgp_432 p {
            margin-bottom: 15px;
            color: #aaa;
          }

          ._buttonWrapper_cpcgp_356 {
            display: flex;
            justify-content: flex-end;
            align-items: center;
            gap: 8px;
            margin-top: 15px;
          }

          ._buttonWrapper_cpcgp_356 button {
            position: relative;
            border-radius: 6px;
            font-weight: 450;
            transition: opacity .2s ease, transform .1s ease, background .25s ease;
          }

          ._buttonWrapper_cpcgp_356 button:disabled {
            opacity: .6;
            cursor: not-allowed;
          }

          ._flatActionBtn_cpcgp_373 {
            min-width: 140px;
            min-height: 42px;
            padding: 0 16px;
            border: none !important;
            border-radius: 8px !important;
            background: #2a2e44 !important;
            color: #e1e4f2 !important;
            box-shadow: none !important;
          }

          ._withdrawButton_cpcgp_387 {
            min-width: 190px;
            min-height: 42px;
            padding: 0 16px;
            border: 1px solid rgba(255,79,163,.4);
            background: linear-gradient(135deg,#ff4fa3,#f43f8f);
            color: #fff;
            box-shadow: 0 2px 8px rgba(255,79,163,.2);
          }

          ._loadingButtonBase_cpcgp_399 { position: relative; overflow: hidden; }

          ._buttonLabel_cpcgp_401 {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            transition: opacity .2s ease, transform .2s ease;
          }

          ._buttonSpinnerWrap_cpcgp_410 {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transform: scale(.96);
            pointer-events: none;
            transition: opacity .2s ease, transform .2s ease;
          }

          ._loaderSmall_cpcgp_423 {
            width: 20px;
            height: 20px;
            border: 4px solid #1c1f30;
            border-top-color: #ff4fa3;
            border-radius: 50%;
            animation: _spin_cpcgp_1 .45s linear infinite;
          }

          ._pcvalue_cpcgp_471 {
            display: flex;
            align-items: center;
            justify-content: center;
          }

          ._mobilevalue_cpcgp_472 { display: none; }

          ._walletWithdrawSep_cpcgp_local {
            width: 1px;
            height: 16px;
            margin: 0 8px;
            background: rgba(255,255,255,.28);
          }

          ._walletCoinValue_cpcgp_local {
            display: inline-flex;
            align-items: center;
          }

          ._walletCoinValue_cpcgp_local img {
            width: 15px;
            height: 15px;
            margin-right: 5px;
            flex-shrink: 0;
          }

          @media (max-width: 640px) {
            ._blurbg_cpcgp_1 {
              align-items: flex-end;
              justify-content: flex-end;
              padding: 0;
            }

            ._modalbackgroundinventory_cpcgp_15 {
              width: 100%;
              max-width: 100%;
              height: 100dvh;
              max-height: 100dvh;
              display: flex;
              flex-direction: column;
              box-sizing: border-box;
              padding: 12px 12px 16px;
              border: none;
              border-radius: 0;
              overflow: hidden;
            }

            ._modalbackgroundinventory_cpcgp_15::before {
              content: "";
              display: block;
              width: 36px;
              height: 4px;
              border-radius: 2px;
              background: #2a2e44;
              margin: 0 auto 12px;
              flex-shrink: 0;
            }

            ._closeButton_150j2_55 {
              top: 8px;
              right: 12px;
              font-size: 20px;
            }

            ._headerinventory_cpcgp_43 {
              justify-content: center;
              flex-wrap: nowrap;
              margin-top: 8px;
              margin-bottom: 8px;
              padding-right: 36px;
              flex-shrink: 0;
            }

            ._walletHeaderControls_cpcgp_local,
            ._inputWrapper_cpcgp_59 {
              width: 100%;
            }

            ._inputv3_cpcgp_65 {
              width: 100%;
              height: 40px;
              font-size: 15px;
            }

            ._stats_cpcgp_92 {
              justify-content: center;
              gap: 12px;
              margin: 0;
              padding: 8px 0 14px;
              flex-shrink: 0;
            }

            ._statItem_cpcgp_100 img,
            ._statItem_cpcgp_100 svg {
              height: 32px !important;
              width: auto !important;
            }

            ._plusbutton_cpcgp_145 {
              width: 32px !important;
              height: 32px !important;
              font-size: 18px !important;
            }

            ._itemsWrapper_cpcgp_248 {
              flex: 1;
              width: 100%;
              min-height: 0;
              height: auto;
              box-sizing: border-box;
              margin-top: 0;
              padding: 10px;
              border-radius: 8px;
              overflow-y: auto;
              -webkit-overflow-scrolling: touch;
            }

            ._itemsGrid_cpcgp_259 {
              grid-template-columns: repeat(2,1fr);
              gap: 6px;
            }

            ._buttonWrapper_cpcgp_356 {
              width: 100%;
              flex-shrink: 0;
              flex-wrap: wrap;
              justify-content: center;
              align-items: center;
              gap: 6px;
              margin-top: 10px;
              padding: 0;
            }

            ._flatActionBtn_cpcgp_373 {
              min-width: 0 !important;
              flex: 1 1 120px !important;
              min-height: 40px !important;
              padding: 0 8px !important;
              font-size: 13px !important;
            }

            ._withdrawButton_cpcgp_387 {
              order: 10;
              width: 100% !important;
              min-width: 0 !important;
              min-height: 44px !important;
              flex: 1 1 100% !important;
              font-size: 14px !important;
            }

            ._pcvalue_cpcgp_471 { display: none; }
            ._mobilevalue_cpcgp_472 {
              display: flex;
              align-items: center;
              justify-content: center;
            }
          }
        `}</style>
      </div>
      <DepositModal isOpen={depositOpen} onClose={() => setDepositOpen(false)} />
    </div>,
    document.body,
  )
}
