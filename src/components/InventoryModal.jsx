import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiRequest } from '../lib/apiClient'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../store/auth'
import DepositModal from './DepositModal'
import InventoryItemCard, { inventoryItemCardStyles } from './InventoryItemCard'
import SortDirectionIcon from './SortDirectionIcon'
import { notifications } from './Notifications'

const COIN_ICON = '/bobux.png'

const formatNumber = (value) => {
  const numericValue = Number(value ?? 0)
  return Number.isFinite(numericValue) ? numericValue.toLocaleString() : '0'
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="_searchIcon_cpcgp_82" aria-hidden="true">
      <path
        fill="currentColor"
        d="M9.75 3.5a6.25 6.25 0 0 1 4.96 10.06l4.36 4.36a1 1 0 0 1-1.42 1.41l-4.35-4.35A6.25 6.25 0 1 1 9.75 3.5Zm0 2a4.25 4.25 0 1 0 0 8.5 4.25 4.25 0 0 0 0-8.5Z"
      />
    </svg>
  )
}

function SortIcon({ ascending = false }) {
  return <SortDirectionIcon ascending={ascending} />
}

function ItemsIcon() {
  return (
    <svg viewBox="0 0 260 320" width="20" height="20" aria-hidden="true">
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
    <div
      className="_blurbg_cpcgp_1"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="_modalbackgroundinventory_cpcgp_15 _fadeIn_cpcgp_1" role="dialog" aria-modal="true" aria-label={ariaLabel}>
        <button aria-label="Close" className="_closeButton_150j2_55" type="button" onClick={onClose}>
          ×
        </button>

        <div className="_headerinventory_cpcgp_43">
          <div className="_walletHeaderControls_cpcgp_local">
            <div className="_inputWrapper_cpcgp_59">
              <input type="text" placeholder="Search for an item..." className="_inputv3_cpcgp_65" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
              <SearchIcon />
            </div>
            <button type="button" className="_sortToggle_cpcgp_487" aria-label={sortAscending ? 'Sort highest to lowest' : 'Sort lowest to highest'} onClick={() => setSortAscending((current) => !current)}>
              <SortIcon ascending={sortAscending} />
            </button>
          </div>
        </div>

        <div className="_itemsWrapper_cpcgp_248">
          <div className="_stats_cpcgp_92">
            <div className="_statItem_cpcgp_100">
              <img src={COIN_ICON} alt="Bobux" />
              <div className="_statCol_cpcgp_107">
                <span className="_statLabel_cpcgp_114">VALUE</span>
                <span className="_statValue_cpcgp_118">
                  <span className="_pcvalue_cpcgp_471">{formatNumber(totalInventoryValue)}</span>
                  <span className="_mobilevalue_cpcgp_472">{formatNumber(totalInventoryValue)}</span>
                </span>
              </div>
            </div>

            <div className="_statItem_cpcgp_100">
              <ItemsIcon />
              <div className="_statCol_cpcgp_107">
                <span className="_statLabel_cpcgp_114">ITEMS</span>
                <span className="_statValue_cpcgp_118">{formatNumber(totalInventoryCount)}</span>
              </div>
            </div>

            {!readOnly ? (
              <LoadingButton className="_plusbutton_cpcgp_145" onClick={() => setDepositOpen(true)}>
                +
              </LoadingButton>
            ) : null}
          </div>

          <div className="_itemsGrid_cpcgp_259">
            {inventoryLoading ? (
              <div className="_emptyState_cpcgp_432">
                <h1>Loading...</h1>
                <p>Fetching your inventory...</p>
              </div>
            ) : inventoryError ? (
              <div className="_emptyState_cpcgp_432">
                <h1>Couldn't load inventory</h1>
                <p>{inventoryError}</p>
              </div>
            ) : displayInventoryItems.length === 0 ? (
              <div className="_emptyState_cpcgp_432">
                <h1>No items!</h1>
                <p>No items were found...</p>
                {!readOnly ? (
                  <LoadingButton className="_depositbutton_cpcgp_170" onClick={() => setDepositOpen(true)}>
                    Deposit
                  </LoadingButton>
                ) : null}
              </div>
            ) : (
              displayInventoryItems.map((item, index) => (
            <InventoryItemCard
              key={item.displayKey || `${item.name}-${index}`}
              item={item}
              selected={!readOnly && selectedItems.includes(item.displayKey)}
              onToggleSelect={readOnly ? undefined : () => {
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

        {!readOnly ? <div className="_buttonWrapper_cpcgp_356">
          {footer ? (
            typeof footer === 'function'
              ? footer({
                selectedItems: selectedInventoryItems,
                selectedAmount,
                selectedValue,
                totalItems: allInventoryRows.length,
                onToggleSelectAll,
              })
              : footer
          ) : (
            <>
              <LoadingButton
                className="_flatActionBtn_cpcgp_373"
                disabled={allInventoryRows.length === 0}
                onClick={onToggleSelectAll}
              >
                {selectedAmount === allInventoryRows.length ? 'Unselect All' : 'Select all'}
              </LoadingButton>
              <LoadingButton className="_withdrawButton_cpcgp_387" disabled={selectedAmount === 0 || withdrawing} onClick={handleWithdraw}>
                <strong className="_pcvalue_cpcgp_471">
                  Withdraw
                  <span className="_walletWithdrawSep_cpcgp_local" />
                  <span className="_walletCoinValue_cpcgp_local">
                    <img src={COIN_ICON} alt="Bobux" />
                    <span className="_pcvalue_cpcgp_471">{formatNumber(selectedValue)}</span>
                  </span>
                </strong>
                <strong className="_mobilevalue_cpcgp_472">
                  Withdraw
                  <span className="_walletWithdrawSep_cpcgp_local" />
                  <span className="_walletCoinValue_cpcgp_local">
                    <img src={COIN_ICON} alt="Bobux" />
                    <span className="_mobilevalue_cpcgp_472">{formatNumber(selectedValue)}</span>
                  </span>
                </strong>
              </LoadingButton>
            </>
          )}
          {withdrawError ? (
            <p className="_walletWithdrawError_cpcgp_local">{withdrawError}</p>
          ) : null}
        </div> : null}

        <style>{`
          ${inventoryItemCardStyles}
          @keyframes _fadeIn_cpcgp_1 { from { opacity: 0; } to { opacity: 1; } }
          @keyframes _modalOpen_cpcgp_1 { from { transform: scale(.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
          @keyframes _spin_cpcgp_1 { to { transform: rotate(360deg); } }

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
            border: 1px solid rgba(94,85,217,.4);
            background: linear-gradient(135deg,#5b52e2,#4038c0);
            color: #fff;
            box-shadow: 0 2px 8px rgba(108,99,255,.25);
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
            background: linear-gradient(135deg,#6c63ff,#5147d9);
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
            border: 1px solid rgba(94,85,217,.4);
            background: linear-gradient(135deg,#5b52e2,#4038c0);
            color: #fff;
            box-shadow: 0 2px 8px rgba(108,99,255,.2);
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
            border-top-color: #6c63ff;
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
