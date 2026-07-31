import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiRequest } from '../lib/apiClient'
import DepositModal from './DepositModal'
import InventoryItemCard, { inventoryItemCardStyles } from './InventoryItemCard'
import { useAuth } from '../store/auth'
import { supabase } from '../lib/supabaseClient'
import { notifications } from './Notifications'

const COIN_ICON = '/bobux.png'

function formatNumber(value) {
  const numericValue = Number(value ?? 0)
  if (!Number.isFinite(numericValue)) return '0'
  return numericValue.toLocaleString('en-US')
}

const stockItems = [
  { name: 'Mythic Selenic Paladin', image: 'https://www.bgsi.gg/items/mythic-selenic-paladin.png', qty: 'x5', price: '13,000,000' },
  { name: 'Mythic Magic Marshmallow', image: 'https://www.bgsi.gg/items/mythic-magic-marshmallow.png', qty: 'x5', price: '8,000,000' },
  { name: 'Mythic Sunken Treasure', image: 'https://www.bgsi.gg/items/mythic-sunken-treasure.png', qty: 'x1', price: '8,000,000' },
  { name: 'Mythic 67 GOD', image: 'https://www.bgsi.gg/items/mythic-67-god.png', qty: 'x1', price: '7,000,000' },
  { name: 'Mythic BIG ROUND', image: 'https://www.bgsi.gg/items/mythic-big-round.png', qty: 'x1', price: '5,500,000' },
  { name: 'Cheshire Cat', image: 'https://www.bgsi.gg/items/cheshire-cat.png', qty: 'x2', price: '3,850,000' },
  { name: 'Mythic Avernus Tophat', image: 'https://www.bgsi.gg/items/mythic-avernus-tophat.png', qty: 'x2', price: '3,600,000' },
  { name: 'Dazzling Diamond', image: 'https://www.bgsi.gg/items/dazzling-diamond.png', qty: 'x6', price: '3,000,000' },
  { name: 'Mythic Kuuhenki', image: 'https://www.bgsi.gg/items/mythic-kuuhenki.png', qty: 'x1', price: '3,000,000' },
  { name: 'Shiny The Dark Tyrant', image: 'https://www.bgsi.gg/items/shiny-the-dark-tyrant.png', qty: 'x1', price: '3,000,000' },
  { name: 'Mythic Grand Pearl', image: 'https://www.bgsi.gg/items/mythic-grand-pearl.png', qty: 'x2', price: '2,750,000' },
  { name: 'The Love Thief', image: 'https://www.bgsi.gg/items/the-love-thief.png', qty: 'x1', price: '2,500,000' },
  { name: 'Mythic Spring Dragon', image: 'https://www.bgsi.gg/items/mythic-spring-dragon.png', qty: 'x1', price: '1,700,000' },
  { name: 'Mythic OG Lucky Pyramidium', image: 'https://www.bgsi.gg/items/mythic-og-lucky-pyramidium.png', qty: 'x1', price: '1,600,000' },
  { name: 'Trifolium Spirit', image: 'https://www.bgsi.gg/items/trifolium-spirit.png', qty: 'x1', price: '1,500,000' },
  { name: 'OG Easter Robot', image: 'https://www.bgsi.gg/items/og-easter-robot.png', qty: 'x1', price: '900,000' },
  { name: 'Shiny Supreme Seraphim', image: 'https://www.bgsi.gg/items/shiny-supreme-seraphim.png', qty: 'x2', price: '900,000' },
  { name: 'Sunken Treasure', image: 'https://www.bgsi.gg/items/sunken-treasure.png', qty: 'x2', price: '750,000' },
  { name: 'Mythic Reincarnation', image: 'https://www.bgsi.gg/items/mythic-reincarnation.png', qty: 'x2', price: '750,000' },
  { name: 'Mythic Lucky Horseshoe', image: 'https://www.bgsi.gg/items/mythic-lucky-horseshoe.png', qty: 'x1', price: '750,000' },
  { name: 'Shiny Mythic 1x1x1x1', image: 'https://www.bgsi.gg/items/shiny-mythic-1x1x1x1.png', qty: 'x2', price: '750,000' },
  { name: 'Festive Basket', image: 'https://www.bgsi.gg/items/festive-basket.png', qty: 'x1', price: '725,000' },
  { name: 'Chinese Dragon', image: 'https://www.bgsi.gg/items/chinese-dragon.png', qty: 'x7', price: '725,000' },
  { name: 'Mythic Daydream', image: 'https://www.bgsi.gg/items/mythic-daydream.png', qty: 'x2', price: '700,000' },
  { name: 'Shiny Mythic Spirit of Fortune', image: 'https://www.bgsi.gg/items/shiny-mythic-spirit-of-fortune.png', qty: 'x1', price: '650,000' },
  { name: 'Shiny Spring Dragon', image: 'https://www.bgsi.gg/items/shiny-spring-dragon.png', qty: 'x1', price: '625,000' },
  { name: 'Mythic Manticore', image: 'https://www.bgsi.gg/items/mythic-manticore.png', qty: 'x3', price: '525,000' },
  { name: 'Shiny 67 GOD', image: 'https://www.bgsi.gg/items/shiny-67-god.png', qty: 'x4', price: '450,000' },
  { name: 'Mythic Azure Fate', image: 'https://www.bgsi.gg/items/mythic-azure-fate.png', qty: 'x5', price: '450,000' },
  { name: 'World Bubble', image: 'https://www.bgsi.gg/items/world-bubble.png', qty: 'x3', price: '450,000' },
  { name: 'Mirror Gem', image: 'https://www.bgsi.gg/items/mirror-gem.png', qty: 'x6', price: '425,000' },
  { name: 'Mythic Kraken Couplet', image: 'https://www.bgsi.gg/items/mythic-kraken-couplet.png', qty: 'x1', price: '425,000' },
  { name: 'OG Lord Shock', image: 'https://www.bgsi.gg/items/og-lord-shock.png', qty: 'x20', price: '400,000' },
  { name: 'Mythic Framed Loading Screen', image: 'https://www.bgsi.gg/items/mythic-framed-loading-screen.png', qty: 'x2', price: '400,000' },
  { name: 'Shiny Retro Shock', image: 'https://www.bgsi.gg/items/shiny-retro-shock.png', qty: 'x2', price: '400,000' },
  { name: 'Mythic Soulflake', image: 'https://www.bgsi.gg/items/mythic-soulflake.png', qty: 'x2', price: '390,000' },
  { name: 'Mythic Queen of Thorns', image: 'https://www.bgsi.gg/items/mythic-queen-of-thorns.png', qty: 'x1', price: '380,000' },
  { name: 'Supreme Seraphim', image: 'https://www.bgsi.gg/items/supreme-seraphim.png', qty: 'x1', price: '375,000' },
  { name: 'Techarium', image: 'https://www.bgsi.gg/items/techarium.png', qty: 'x2', price: '375,000' },
  { name: 'Shiny Mythic Sunmallow', image: 'https://www.bgsi.gg/items/shiny-mythic-sunmallow.png', qty: 'x2', price: '335,000' },
  { name: 'Shiny Lovely Shock', image: 'https://www.bgsi.gg/items/shiny-lovely-shock.png', qty: 'x3', price: '320,000' },
  { name: 'Mythic Lord of the Flies', image: 'https://www.bgsi.gg/items/mythic-lord-of-the-flies.png', qty: 'x4', price: '300,000' },
  { name: 'Mythic Spirit of Fortune', image: 'https://www.bgsi.gg/items/mythic-spirit-of-fortune.png', qty: 'x2', price: '300,000' },
  { name: 'The Fallen Guardian', image: 'https://www.bgsi.gg/items/the-fallen-guardian.png', qty: 'x1', price: '300,000' },
  { name: 'Mythic Faberge', image: 'https://www.bgsi.gg/items/mythic-faberge.png', qty: 'x8', price: '300,000' },
  { name: 'Symbiote', image: 'https://www.bgsi.gg/items/symbiote.png', qty: 'x3', price: '300,000' },
  { name: 'Mythic Mystic Prophet', image: 'https://www.bgsi.gg/items/mythic-mystic-prophet.png', qty: 'x2', price: '275,000' },
  { name: "Mythic Pot O' Doggy", image: 'https://www.bgsi.gg/items/mythic-pot-o-doggy.png', qty: 'x12', price: '275,000' },
]

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="_searchIcon_150j2_147" aria-hidden="true">
      <path
        fill="currentColor"
        d="M9.75 3.5a6.25 6.25 0 0 1 4.96 10.06l4.36 4.36a1 1 0 0 1-1.42 1.41l-4.35-4.35A6.25 6.25 0 1 1 9.75 3.5Zm0 2a4.25 4.25 0 1 0 0 8.5 4.25 4.25 0 0 0 0-8.5Z"
      />
    </svg>
  )
}

function SortIcon({ ascending = false }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg" width="16" height="16" aria-hidden="true">
      <path d={ascending ? 'M13 3.793V9h-2V3.864L9.914 4.95 8.5 3.536 12.036 0l3.535 3.536-1.414 1.414L13 3.793zM8 10H0V8h8v2zm6 3H0v-2h14v2zm2 3H0v-2h16v2zM6 7H0V5h6v2zM4 4H0V2h4v2z' : 'M13 12.208V7h-2v5.137l-1.086-1.086L8.5 12.466 12.036 16l3.535-3.535-1.414-1.415L13 12.208zM8 6H0v2h8V6zm6-3H0v2h14V3zm2-3H0v2h16V0zM6 9H0v2h6V9zm-2 3H0v2h4v-2z'} fillRule="evenodd" />
    </svg>
  )
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

function StockItemCard({ item, selected, onToggleSelect }) {
  return (
    <InventoryItemCard
      item={item}
      selected={selected}
      onToggleSelect={() => onToggleSelect(item.displayKey)}
      compact
    />
  )
}

function InventorySelectionCard({ item, selected, onToggleSelect }) {
  return (
    <InventoryItemCard
      item={item}
      selected={selected}
      onToggleSelect={() => onToggleSelect(item.displayKey)}
      compact
    />
  )
}

function LoadingButton({ className, disabled = false, onClick, children, ariaLabel }) {
  return (
    <button className={`${className} _loadingButtonBase_150j2_475`} disabled={disabled} type="button" onClick={onClick} aria-label={ariaLabel}>
      <span className="_buttonLabel_150j2_479">{children}</span>
      <span className="_buttonSpinnerWrap_150j2_497">
        <span className="_loaderSmall_150j2_523" />
      </span>
    </button>
  )
}

export default function CoinExchangeModal({ isOpen, onClose }) {
  const [mode, setMode] = useState('items')
  const [depositOpen, setDepositOpen] = useState(false)
  const [inventoryItems, setInventoryItems] = useState([])
  const [stockItems, setStockItems] = useState([])
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [stockLoading, setStockLoading] = useState(false)
  const [inventoryError, setInventoryError] = useState(null)
  const [stockError, setStockError] = useState(null)
  const [selectedItemIds, setSelectedItemIds] = useState([])
  const [exchangeLoading, setExchangeLoading] = useState(false)
  const [exchangeError, setExchangeError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortAscending, setSortAscending] = useState(false)
  const user = useAuth((state) => state.user)
  const balance = useAuth((state) => state.balance)
  const setBalance = useAuth((state) => state.setBalance)

  const loadInventoryItems = async () => {
    if (!user?.id && !user?.profile_id) {
      setInventoryItems([])
      setInventoryError(null)
      notifications.error('Please sign in to view your inventory.')
      return
    }

    setInventoryLoading(true)
    setInventoryError(null)

    try {
      const result = await apiRequest('/api/inventory')
      setInventoryItems(result?.items ?? [])
    } catch (error) {
      console.error('[ExchangeModal] failed to load inventory', error)
      setInventoryItems([])
      setInventoryError(null)
      notifications.error(error.message || 'Failed to load your inventory.')
    } finally {
      setInventoryLoading(false)
    }
  }

  const loadStockItems = async () => {
    setStockLoading(true)
    setStockError(null)

    try {
      const { data, error } = await supabase.from('exchange_stock').select('*').order('stocked_at', { ascending: false })
      if (error) throw error
      setStockItems(data ?? [])
    } catch (error) {
      console.error('[ExchangeModal] failed to load stock', error)
      setStockItems([])
      setStockError(null)
      notifications.error(error.message || 'Failed to load stock items.')
    } finally {
      setStockLoading(false)
    }
  }

  useEffect(() => {
    if (!isOpen) return undefined

    setSelectedItemIds([])
    if (mode === 'items') {
      void loadInventoryItems()
    } else {
      void loadStockItems()
    }

    return undefined
  }, [isOpen, mode, user?.id, user?.profile_id])

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
    }
  }, [isOpen])

  if (!isOpen) return null

  const isCoinsToItems = mode === 'coins'
  const inventoryRows = inventoryItems.map((item, index) => ({
    ...item,
    displayKey: item.id || item.item_id || item.uuid || `${item.name || 'inventory'}-${index}`,
  }))
  const stockRows = stockItems.map((item, index) => ({
    ...item,
    displayKey: item.uuid || item.id || `${item.name || 'stock'}-${index}`,
  }))
  const selectedInventoryItems = inventoryRows.filter((item) => selectedItemIds.includes(item.displayKey))
  const selectedStockItems = stockRows.filter((item) => selectedItemIds.includes(item.displayKey))
  const inventoryValue = inventoryRows.reduce((sum, item) => sum + Number(item.value ?? 0), 0)
  const selectedInventoryValue = selectedInventoryItems.reduce((sum, item) => sum + Number(item.value ?? 0), 0)
  const selectedStockValue = selectedStockItems.reduce((sum, item) => sum + Number(item.value ?? 0), 0)
  const selectedInventoryCount = selectedInventoryItems.length
  const currentRows = (isCoinsToItems ? stockRows : inventoryRows)
    .filter((item) => String(item.name || '').toLowerCase().includes(searchQuery.trim().toLowerCase()))
    .sort((a, b) => sortAscending
      ? Number(a.value ?? 0) - Number(b.value ?? 0)
      : Number(b.value ?? 0) - Number(a.value ?? 0))
  const selectedCurrentItems = isCoinsToItems ? selectedStockItems : selectedInventoryItems
  const currentValue = isCoinsToItems ? selectedStockValue : selectedInventoryValue
  const currentRowIds = currentRows.map((item) => item.displayKey).filter(Boolean)
  const allCurrentRowsSelected = currentRowIds.length > 0 && currentRowIds.every((id) => selectedItemIds.includes(id))

  const toggleSelectedItem = (itemKey) => {
    setSelectedItemIds((current) => (current.includes(itemKey) ? current.filter((value) => value !== itemKey) : [...current, itemKey]))
  }

  const handleSelectAll = () => {
    if (currentRows.length === 0) return
    setSelectedItemIds((current) => {
      if (currentRowIds.every((id) => current.includes(id))) {
        return current.filter((id) => !currentRowIds.includes(id))
      }
      return [...new Set([...current, ...currentRowIds])]
    })
  }

  const handleExchangeItems = async () => {
    if (!user) {
      setExchangeError(null)
      notifications.error('Please sign in to exchange items.')
      return
    }

    if (isCoinsToItems) {
      if (selectedCurrentItems.length === 0) {
        setExchangeError(null)
        notifications.error('Select at least one item to buy.')
        return
      }

      if ((Number(balance) || 0) < currentValue) {
        setExchangeError(null)
        notifications.error('You do not have enough coins for this purchase.')
        return
      }

      setExchangeLoading(true)
      setExchangeError(null)

      try {
        const stockIds = selectedCurrentItems.map((item) => item.uuid || item.id).filter(Boolean)
        const result = await apiRequest('/api/exchange', {
          method: 'POST',
          body: JSON.stringify({ mode: 'coins_to_items', item_ids: stockIds }),
        })
        setBalance(Number(result?.balance ?? balance))
        window.dispatchEvent(new CustomEvent('wallet:updated'))
        setStockItems((current) => current.filter((item) => !stockIds.includes(item.uuid || item.id)))
        setSelectedItemIds([])
        notifications.success('Purchase completed successfully!')
      } catch (error) {
        console.error('[ExchangeModal] coins-to-items purchase failed', error)
        setExchangeError(null)
        notifications.error(error.message || 'Failed to purchase items.')
      } finally {
        setExchangeLoading(false)
      }

      return
    }

    if (selectedCurrentItems.length === 0) {
      setExchangeError(null)
      notifications.error('Select at least one item to exchange.')
      return
    }

    setExchangeLoading(true)
    setExchangeError(null)

    try {
      const inventoryIds = selectedCurrentItems.map((item) => item.id).filter(Boolean)
      const result = await apiRequest('/api/exchange', {
        method: 'POST',
        body: JSON.stringify({ mode: 'items_to_coins', item_ids: inventoryIds }),
      })
      setBalance(Number(result?.balance ?? balance))
      window.dispatchEvent(new CustomEvent('wallet:updated'))
      setInventoryItems((current) => current.filter((item) => !inventoryIds.includes(item.id || item.item_id || item.uuid)))
      setSelectedItemIds([])
      notifications.success('Items exchanged successfully!')
    } catch (error) {
      console.error('[ExchangeModal] item exchange failed', error)
      setExchangeError(null)
      notifications.error(error.message || 'Failed to exchange items.')
    } finally {
      setExchangeLoading(false)
    }
  }

  return createPortal(
    <div
      className="_blurbg_150j2_5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="_modalbackgroundconvert_150j2_27" role="dialog" aria-modal="true" aria-label="Coin exchange">
        <button aria-label="Close" className="_closeButton_150j2_55" type="button" onClick={onClose}>
          &times;
        </button>

        <div className="_headerconvert_150j2_83">
          <div className="_searchContainer_150j2_107">
            <div className="_exchangeSearchRow_150j2_local">
              <div className="_inputWrapper_150j2_109">
                <input type="text" placeholder={isCoinsToItems ? 'Search in stock...' : 'Search for an item...'} className="_inputv3_150j2_113" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
                <SearchIcon />
              </div>
              <button type="button" className="_sortToggle_150j2_1069" aria-label={sortAscending ? 'Sort highest to lowest' : 'Sort lowest to highest'} onClick={() => setSortAscending((current) => !current)}>
                <SortIcon ascending={sortAscending} />
              </button>
            </div>
          </div>

          <div className="_modeButtons_150j2_181">
            <button
              type="button"
              className={`_modeBtn_150j2_197 _modeGreen_150j2_265 ${mode === 'items' ? '_modeActive_150j2_263' : ''}`}
              onClick={() => setMode('items')}
            >
              Items to Coins
            </button>
            <button
              type="button"
              className={`_modeBtn_150j2_197 _modeRed_150j2_267 ${mode === 'coins' ? '_modeActive_150j2_263' : ''}`}
              onClick={() => setMode('coins')}
            >
              Coins to Items
            </button>
          </div>

          <div className="_filterContainer_150j2_167" />
        </div>

        <div className="_itemsWrapper_150j2_541">
          <div className="_stats_150j2_273">
            <div className="_statItem_150j2_277">
              <img src={COIN_ICON} alt="Bobux" />
              <div className="_statCol_150j2_291">
                <span className="_statLabel_150j2_305">VALUE</span>
                <span className="_statValue_150j2_325">
                  <span className="_pcvalue_150j2_1029">{isCoinsToItems ? formatNumber(stockItems.reduce((sum, item) => sum + Number(item.value ?? 0), 0)) : formatNumber(inventoryValue)}</span>
                  <span className="_mobilevalue_150j2_1031">{isCoinsToItems ? formatNumber(stockItems.reduce((sum, item) => sum + Number(item.value ?? 0), 0)) : formatNumber(inventoryValue)}</span>
                </span>
              </div>
            </div>

            <div className="_statItem_150j2_277">
              <ItemsIcon />
              <div className="_statCol_150j2_291">
                <span className="_statLabel_150j2_305">ITEMS</span>
                <span className="_statValue_150j2_325">{isCoinsToItems ? stockItems.length : inventoryRows.length}</span>
              </div>
            </div>

            <LoadingButton className="_plusbutton_150j2_329" ariaLabel="Deposit" onClick={() => setDepositOpen(true)}>
              +
            </LoadingButton>
          </div>

          <div className="_itemsGrid_150j2_563">
            {isCoinsToItems ? (
              stockLoading ? (
                <div className="_emptyState_150j2_1037">
                  <h1>Loading stock…</h1>
                  <p>Fetching the latest items from Supabase.</p>
                </div>
              ) : stockError ? (
                <div className="_emptyState_150j2_1037">
                  <h1>Stock unavailable</h1>
                  <p>{stockError}</p>
                </div>
              ) : currentRows.length > 0 ? (
                currentRows.map((item) => (
                  <div key={item.displayKey} style={{ cursor: 'pointer' }}>
                    <StockItemCard
                      item={item}
                      selected={selectedItemIds.includes(item.displayKey)}
                      onToggleSelect={toggleSelectedItem}
                    />
                  </div>
                ))
              ) : (
                <div className="_emptyState_150j2_1037">
                  <h1>No stock items</h1>
                  <p>The stock table is currently empty.</p>
                </div>
              )
            ) : inventoryLoading ? (
              <div className="_emptyState_150j2_1037">
                <h1>Loading inventory…</h1>
                <p>Fetching your available items.</p>
              </div>
            ) : inventoryError ? (
              <div className="_emptyState_150j2_1037">
                <h1>Inventory unavailable</h1>
                <p>{inventoryError}</p>
              </div>
            ) : currentRows.length > 0 ? (
              currentRows.map((item) => (
                <div key={item.displayKey} style={{ cursor: 'pointer' }}>
                  <InventorySelectionCard
                    item={item}
                    selected={selectedItemIds.includes(item.displayKey)}
                    onToggleSelect={toggleSelectedItem}
                  />
                </div>
              ))
            ) : (
              <div className="_emptyState_150j2_1037">
                <h1>No items!</h1>
                <p>No items were found in your inventory.</p>
              </div>
            )}
          </div>
        </div>

        <div className="_buttonWrapper_150j2_379">
          <LoadingButton className="_flatActionBtn_150j2_409" disabled={exchangeLoading || currentRows.length === 0} onClick={handleSelectAll}>
            {allCurrentRowsSelected ? 'Unselect All' : 'Select All'}
          </LoadingButton>
          <LoadingButton
            className="_withdrawButton_150j2_443"
            disabled={exchangeLoading || selectedCurrentItems.length === 0}
            onClick={handleExchangeItems}
          >
            <strong className="_pcvalue_150j2_1029">
              {isCoinsToItems ? 'Buy' : 'Exchange'}
              <span className="_exchangeSep_150j2_local" />
              <span className="_exchangeCoinValue_150j2_local">
                <img src={COIN_ICON} alt="Bobux" />
                <span className="_pcvalue_150j2_1029">{formatNumber(currentValue)}</span>
              </span>
              {isCoinsToItems ? null : <span className="_feeText_150j2_1033">(0% fee)</span>}
            </strong>
            <strong className="_mobilevalue_150j2_1031">
              {isCoinsToItems ? 'Buy' : 'Exchange'}
              <span className="_exchangeSep_150j2_local" />
              <span className="_exchangeCoinValue_150j2_local">
                <img src={COIN_ICON} alt="Bobux" />
                <span className="_mobilevalue_150j2_1031">{formatNumber(currentValue)}</span>
              </span>
            </strong>
          </LoadingButton>
        </div>

        {exchangeError ? (
          <div className="_emptyState_150j2_1037" style={{ marginTop: '12px' }}>
            <p>{exchangeError}</p>
          </div>
        ) : null}

        <style>{`${inventoryItemCardStyles}
          @keyframes _fadeIn_150j2_1 { from { opacity: 0; } to { opacity: 1; } }
          @keyframes _modalOpen_150j2_1 { from { transform: scale(.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
          @keyframes _spin_150j2_1 { to { transform: rotate(360deg); } }

          ._blurbg_150j2_5 {
            position: fixed;
            inset: 0;
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: rgba(0,0,0,.5);
            animation: _fadeIn_150j2_1 .5s ease-out;
          }

          ._modalbackgroundconvert_150j2_27 {
            position: relative;
            width: 90%;
            max-width: 1200px;
            padding: 15px;
            overflow-y: auto;
            align-items: flex-start;
            border: 1px solid #181a28;
            border-radius: 10px;
            background-color: #131520;
            color: #fff;
            animation: _modalOpen_150j2_1 .3s forwards;
            box-sizing: border-box;
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

          ._headerconvert_150j2_83 {
            display: grid;
            grid-template-columns: 320px 1fr auto;
            align-items: center;
            gap: 15px;
            width: 100%;
            margin-top: 5px;
            margin-bottom: 10px;
            padding-right: 36px;
            box-sizing: border-box;
          }

          ._searchContainer_150j2_107 {
            display: inline-flex;
            align-items: center;
          }

          ._exchangeSearchRow_150j2_local {
            display: inline-flex;
            align-items: center;
            gap: 6px;
          }

          ._inputWrapper_150j2_109 {
            position: relative;
            display: flex;
            flex-grow: 1;
          }

          ._inputv3_150j2_113 {
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

          ._inputv3_150j2_113::placeholder {
            text-align: center;
            color: #cbd5e1;
          }

          ._inputv3_150j2_113:focus { outline: none; }

          ._searchIcon_150j2_147 {
            position: absolute;
            left: 15px;
            top: 50%;
            width: 20px;
            height: 20px;
            transform: translateY(-50%);
            color: #cbd5e1;
            pointer-events: none;
          }

          ._filterContainer_150j2_167 {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
            align-items: center;
          }

          ._modeButtons_150j2_181 {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            min-width: 280px;
          }

          ._modeBtn_150j2_197 {
            --accent: #6c63ff;
            --accentSoft: rgba(108,99,255,.35);
            position: relative;
            height: 40px;
            padding: 0 16px;
            overflow: hidden;
            border: none;
            border-bottom: 2px solid var(--accent);
            border-radius: 8px;
            background: #20222f;
            color: #e1e4f2;
            box-shadow: 0 0 18px rgba(0,0,0,.25);
            cursor: pointer;
            font-size: 13px;
            font-weight: 700;
            user-select: none;
            white-space: nowrap;
            transition: transform .12s ease, opacity .2s ease, box-shadow .2s ease, filter .2s ease;
          }

          ._modeBtn_150j2_197::before {
            content: "";
            position: absolute;
            inset: 0;
            background: linear-gradient(to top, var(--accentSoft) 0%, rgba(0,0,0,0) 60%);
            opacity: .75;
            pointer-events: none;
          }

          ._modeBtn_150j2_197:hover {
            opacity: .98;
            filter: brightness(1.05);
          }

          ._modeBtn_150j2_197:active { transform: translateY(0) scale(.985); }
          ._modeActive_150j2_263 {
            filter: brightness(1.08);
            box-shadow: 0 0 0 2px rgba(255,255,255,.06), 0 16px 26px rgba(0,0,0,.35);
          }
          ._modeGreen_150j2_265 {
            --accent: #22c55e;
            --accentSoft: rgba(34,197,94,.35);
          }
          ._modeRed_150j2_267 {
            --accent: #ef4444;
            --accentSoft: rgba(239,68,68,.35);
          }

          ._itemsWrapper_150j2_541 {
            position: relative;
            height: 350px;
            margin-top: 15px;
            padding: 12px;
            overflow-x: hidden;
            overflow-y: auto;
            border-radius: 6px;
            background-color: #1c1f2e;
          }

          ._stats_150j2_273 {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-top: -5px;
            margin-bottom: 12px;
          }

          ._statItem_150j2_277 {
            display: flex;
            align-items: center;
            justify-content: flex-start;
            gap: 6px;
          }

          ._statItem_150j2_277 img,
          ._statItem_150j2_277 svg {
            width: 20px;
            height: 20px;
            flex-shrink: 0;
          }

          ._statCol_150j2_291 {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 0;
          }

          ._statLabel_150j2_305 {
            color: rgba(255,255,255,.35);
            font-size: 10px;
            font-weight: 700;
            letter-spacing: .06em;
            line-height: 1;
            margin-bottom: 2px;
            text-transform: uppercase;
          }

          ._statValue_150j2_325 {
            color: #f6f6f6;
            font-size: 17px;
            font-weight: 700;
            line-height: 1;
          }

          ._plusbutton_150j2_329 {
            position: relative;
            z-index: 20;
            width: 34px;
            height: 34px;
            padding: 0;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            border: 1px solid rgba(94,85,217,.4);
            border-radius: 8px;
            background: linear-gradient(135deg,#5b52e2,#4038c0);
            color: #fff;
            box-shadow: 0 2px 8px rgba(108,99,255,.25);
            cursor: pointer;
            font-size: 22px;
            font-weight: 700;
            pointer-events: auto;
            transition: transform .15s ease, opacity .25s ease, background .25s ease;
          }

          ._plusbutton_150j2_329:hover {
            background: linear-gradient(135deg,#6c63ff,#5147d9);
            transform: scale(1.05);
          }

          ._itemsGrid_150j2_563 {
            display: grid;
            grid-template-columns: repeat(auto-fill,minmax(160px,1fr));
            gap: 8px;
          }

          ._itemBox_150j2_575 {
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
            transition: transform .2s ease;
          }

          ._itemBox_150j2_575::before {
            content: "";
            position: absolute;
            inset: 0;
            z-index: 0;
            padding: 2px;
            border-radius: 6px;
            background: linear-gradient(to bottom, transparent 0%, var(--item-border-side, rgba(108,99,255,.25)) 55%, var(--item-border-bottom, rgba(108,99,255,.7)) 100%);
            -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
            -webkit-mask-composite: xor;
            mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
            mask-composite: exclude;
            pointer-events: none;
          }

          ._itemBox_150j2_575:hover {
            transform: scale(1.03);
          }

          ._imageWrapper_150j2_679 {
            position: relative;
            width: 100%;
            height: 118px;
            overflow: hidden;
            border-radius: 8px;
            flex: 0 0 118px;
          }

          ._itemImage_150j2_697 {
            position: absolute;
            top: 0;
            left: 0;
            z-index: 1;
            width: 100%;
            height: 100%;
            object-fit: contain;
            border-radius: 8px;
          }

          ._normalImage_150j2_717 {
            z-index: 1;
          }

          ._blurritem_150j2_721 {
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

          ._itemDetails_150j2_749 {
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

          ._itemName_150j2_751 {
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

          ._itemPrice_150j2_753 {
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

          ._itemPriceInner_150j2_local {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            max-width: 100%;
            min-width: 0;
            overflow: hidden;
            vertical-align: middle;
          }

          ._itemPriceInner_150j2_local img {
            width: 15px;
            height: 15px;
            margin-right: 6px;
            flex-shrink: 0;
          }

          ._itemPriceAmount_150j2_local {
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

          ._chanceBadge_150j2_757 {
            position: absolute;
            top: 4px;
            right: 4px;
            z-index: 3;
            padding: 4px 10px;
            border-radius: 6px;
            background: #20222f;
            color: #fff;
            font-size: 12px;
            font-weight: 700;
            pointer-events: none;
          }

          ._emptyState_150j2_1037 {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            transform: translate(-50%,-50%);
            text-align: center;
          }

          ._emptyState_150j2_1037 h1 {
            margin-bottom: 8px;
            color: #ddd;
            font-size: 20px;
            font-weight: 700;
          }

          ._emptyState_150j2_1037 p {
            margin-bottom: 15px;
            color: #aaa;
          }

          ._buttonWrapper_150j2_379 {
            display: flex;
            justify-content: flex-end;
            align-items: center;
            gap: 8px;
            margin-top: 15px;
          }

          ._buttonWrapper_150j2_379 button {
            position: relative;
            border-radius: 6px;
            font-weight: 450;
            transition: opacity .2s ease, transform .1s ease, background .25s ease;
          }

          ._buttonWrapper_150j2_379 button:disabled {
            opacity: .6;
            cursor: not-allowed;
          }

          ._flatActionBtn_150j2_409 {
            min-width: 140px;
            min-height: 42px;
            padding: 0 16px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border: none !important;
            border-radius: 8px !important;
            background: #2a2e44 !important;
            color: #e1e4f2 !important;
            box-shadow: none !important;
          }

          ._withdrawButton_150j2_443 {
            min-width: 190px;
            min-height: 42px;
            padding: 0 16px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border: 1px solid rgba(94,85,217,.4);
            border-radius: 8px !important;
            background: linear-gradient(135deg,#5b52e2,#4038c0);
            color: #fff;
            box-shadow: 0 2px 8px rgba(108,99,255,.2);
          }

          ._loadingButtonBase_150j2_475 { position: relative; overflow: hidden; }
          ._buttonLabel_150j2_479 {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            transition: opacity .2s ease, transform .2s ease;
          }
          ._buttonSpinnerWrap_150j2_497 {
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
          ._loaderSmall_150j2_523 {
            width: 20px;
            height: 20px;
            border: 4px solid #1c1f30;
            border-top-color: #6c63ff;
            border-radius: 50%;
            animation: _spin_150j2_1 .45s linear infinite;
          }

          ._sortToggle_150j2_1069 {
            width: 40px;
            height: 40px;
            padding: 0;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            border: none;
            border-radius: 6px;
            background: #20222f;
            color: #e1e4f2;
            cursor: pointer;
            transition: background .15s;
          }
          ._sortToggle_150j2_1069:hover { background: #2a2e44; }

          ._pcvalue_150j2_1029 {
            display: flex;
            align-items: center;
            justify-content: center;
          }
          ._mobilevalue_150j2_1031 { display: none; }
          ._feeText_150j2_1033 {
            opacity: .7;
            margin-left: 6px;
            font-weight: 700;
          }
          ._exchangeSep_150j2_local {
            width: 1px;
            height: 16px;
            margin: 0 8px;
            background: rgba(255,255,255,.28);
          }
          ._exchangeCoinValue_150j2_local {
            display: inline-flex;
            align-items: center;
            vertical-align: middle;
          }
          ._exchangeCoinValue_150j2_local img {
            width: 15px;
            height: 15px;
            margin-right: 6px;
            flex-shrink: 0;
          }

          @media (max-width: 640px) {
            ._blurbg_150j2_5 {
              align-items: flex-end;
              justify-content: flex-end;
              padding: 0;
            }
            ._modalbackgroundconvert_150j2_27 {
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
            ._modalbackgroundconvert_150j2_27::before {
              content: "";
              display: block;
              width: 36px;
              height: 4px;
              margin: 0 auto 12px;
              flex-shrink: 0;
              border-radius: 2px;
              background: #2a2e44;
            }
            ._closeButton_150j2_55 {
              top: 8px;
              right: 12px;
              font-size: 20px;
            }
            ._headerconvert_150j2_83 {
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 8px;
              width: 100%;
              padding-right: 0;
            }
            ._searchContainer_150j2_107 {
              width: 100%;
              display: flex;
              justify-content: center;
            }
            ._exchangeSearchRow_150j2_local {
              width: 100%;
            }
            ._inputWrapper_150j2_109 {
              width: 100%;
              flex: 1;
            }
            ._inputv3_150j2_113 {
              width: 100%;
              height: 40px;
              font-size: 15px;
            }
            ._modeButtons_150j2_181 {
              width: 100%;
              min-width: 0;
              justify-content: center;
            }
            ._filterContainer_150j2_167 {
              width: 100%;
              justify-content: center;
            }
            ._modeBtn_150j2_197 {
              width: 48%;
              padding: 0 8px;
            }
            ._stats_150j2_273 {
              justify-content: center;
              gap: 12px;
              margin: 0;
              padding: 8px 0 14px;
              flex-shrink: 0;
            }
            ._itemsWrapper_150j2_541 {
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
            ._itemsGrid_150j2_563 {
              grid-template-columns: repeat(2,1fr);
              gap: 6px;
            }
            ._itemBox_150j2_575 {
              height: 180px !important;
              padding: 6px !important;
              overflow: hidden !important;
              justify-content: flex-start !important;
              flex-direction: column !important;
            }
            ._imageWrapper_150j2_679 {
              height: 130px !important;
              flex: 0 0 130px !important;
            }
            ._normalImage_150j2_717 {
              object-fit: contain !important;
            }
            ._itemDetails_150j2_749 {
              width: 100% !important;
              height: 32px !important;
              min-height: 32px !important;
              margin-top: 5px !important;
              padding: 0 !important;
              overflow: hidden !important;
              flex: 0 0 32px !important;
              display: flex !important;
              flex-direction: column !important;
              align-items: center !important;
              justify-content: center !important;
              gap: 1px !important;
            }
            ._itemName_150j2_751 {
              display: block !important;
              width: 100% !important;
              max-width: 100% !important;
              overflow: hidden !important;
              text-overflow: ellipsis !important;
              white-space: nowrap !important;
              font-size: 12px !important;
              line-height: 14px !important;
              margin: 0 !important;
            }
            ._itemPrice_150j2_753 {
              overflow: hidden !important;
              white-space: nowrap !important;
              font-size: 13px !important;
              line-height: 15px !important;
              margin: 0 !important;
            }
            ._buttonWrapper_150j2_379 {
              width: 100%;
              flex-shrink: 0;
              flex-wrap: wrap;
              justify-content: center;
              align-items: center;
              gap: 6px;
              margin-top: 10px;
              padding: 0;
            }
            ._flatActionBtn_150j2_409 {
              min-width: 0 !important;
              flex: 1 1 120px !important;
              min-height: 40px !important;
              padding: 0 8px !important;
              font-size: 13px !important;
            }
            ._withdrawButton_150j2_443 {
              order: 10;
              width: 100% !important;
              min-width: 0 !important;
              min-height: 44px !important;
              flex: 1 1 100% !important;
              font-size: 14px !important;
            }
            ._pcvalue_150j2_1029 { display: none; }
            ._mobilevalue_150j2_1031 {
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
