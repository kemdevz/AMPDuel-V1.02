import { useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  MessageSquare,
} from 'lucide-react'
import { CoinflipIcon } from './icons'
import { notifications } from './Notifications'
import { getInventoryItemCardStyle } from './InventoryItemCard'
import InventoryModal from './InventoryModal'
import RoleBadge from './RoleBadge'
import AdminSearchField from './AdminSearchField'
import SortDirectionIcon from './SortDirectionIcon'
import { ADMIN_DANGER_BUTTON, ADMIN_PRIMARY_BUTTON } from './AdminControlStyles'
import { formatPriceValue } from '../Utils/FormatPriceValues'
import { apiRequest } from '../lib/apiClient'
import { connectSocket } from '../lib/socket'

const COIN_ICON = '/bobux.png'
const PANEL = 'rounded-md bg-[#1c1f2e]'
const INNER = 'rounded-md border border-white/[.035] bg-[#171925]'
const LABEL = 'text-[10px] font-semibold uppercase tracking-[.04em] text-[rgba(225,228,242,.35)]'
const INPUT = 'h-8 w-full rounded-[5px] border border-[#323240] bg-[#171925] px-2.5 text-[11px] text-white outline-none placeholder:text-white/25 focus:border-[#f43f8f]'

let adminGeneralClientCache = null
let adminGeneralPendingRequest = null

export function prefetchAdminGeneral({ force = false } = {}) {
  if (adminGeneralPendingRequest) return adminGeneralPendingRequest
  if (!force && adminGeneralClientCache) return Promise.resolve(adminGeneralClientCache)

  adminGeneralPendingRequest = apiRequest('/api/admin/general')
    .then((result) => {
      adminGeneralClientCache = result
      return result
    })
    .finally(() => {
      adminGeneralPendingRequest = null
    })
  return adminGeneralPendingRequest
}

const games = ['Coinflip']
const serviceKeys = {
  Coinflip: 'coinflip',
  Chat: 'chat',
}
const gameIcons = {
  Coinflip: CoinflipIcon,
}
function CoinValue({ value, compact = false }) {
  return <span className="inline-flex items-center gap-1 font-semibold text-white"><img src={COIN_ICON} alt="" className="h-3.5 w-3.5" />{formatPriceValue(value, { compactNumbers: compact })}</span>
}

function SearchField({ value, onChange, placeholder, onFocus }) {
  return <AdminSearchField value={value} onChange={onChange} onFocus={onFocus} placeholder={placeholder} />
}

function Toggle({ checked, onChange, label, disabled = false }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className={`relative h-[18px] w-8 shrink-0 rounded-full border-0 p-0 transition-colors duration-200 disabled:cursor-wait disabled:opacity-50 ${checked ? 'bg-[#ff4fa3]' : 'bg-[#303448]'}`}>
      <span className={`absolute left-[3px] top-[3px] h-3 w-3 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-[14px]' : 'translate-x-0'}`} />
    </button>
  )
}

function formatActivityTime(value) {
  const timestamp = new Date(value || 0).getTime()
  if (!Number.isFinite(timestamp) || timestamp <= 0) return ''
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (elapsedSeconds < 10) return 'Just now'
  if (elapsedSeconds < 60) return `${elapsedSeconds} seconds ago`
  const minutes = Math.floor(elapsedSeconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function formatPlayerJoinedDate(value) {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function EmptyState({ children }) {
  return <div className="flex min-h-[160px] items-center justify-center text-center text-[11px] text-white/30">{children}</div>
}

function TransactionItemStack({ items = [] }) {
  const visibleItems = items.slice(0, 5)
  const hiddenCount = Math.max(0, items.length - visibleItems.length)

  return (
    <span className="flex min-w-0 items-center overflow-visible">
      {visibleItems.map((item, index) => (
        <span
          key={`${item.id}-${index}`}
          className="group relative box-border block h-[30px] w-[30px] shrink-0 cursor-pointer rounded-[3px] border-2 border-solid border-[#2F3347] bg-[#171925] transition-colors duration-200 [transform:var(--item-shift)] hover:!z-20 hover:border-[#ff4fa3]"
          style={{
            ...getInventoryItemCardStyle(item),
            '--item-shift': `translateX(${index * -35.7}%)`,
            zIndex: index + 1,
          }}
        >
          <span role="tooltip" className="pointer-events-none absolute bottom-[calc(100%+7px)] left-1/2 z-40 max-w-44 -translate-x-1/2 overflow-hidden text-ellipsis whitespace-nowrap rounded bg-[#0f1119] px-2 py-1 text-[10px] font-semibold leading-tight text-[#e1e4f2] opacity-0 shadow-[0_4px_12px_rgba(0,0,0,.35)] transition-opacity duration-150 group-hover:opacity-100">{item.name}</span>
          <img src={item.image || item.image_url} alt="" className="block h-full w-full scale-100 rounded-[1px] object-contain" />
          {index === visibleItems.length - 1 && hiddenCount > 0 ? (
            <span
              className="pointer-events-none absolute inset-0 z-20 grid place-items-center overflow-hidden rounded-[1px] bg-[rgba(15,18,30,.88)] text-[9px] font-semibold leading-none text-white"
            >
              +{hiddenCount}
            </span>
          ) : null}
        </span>
      ))}
    </span>
  )
}

export function AdminGeneral() {
  const [overview, setOverview] = useState(() => ({
    stats: adminGeneralClientCache?.stats || null,
    activity: Array.isArray(adminGeneralClientCache?.activity) ? adminGeneralClientCache.activity : [],
    services: adminGeneralClientCache?.services || null,
  }))
  const [loadError, setLoadError] = useState('')
  const [page, setPage] = useState(1)
  const [savingServices, setSavingServices] = useState(() => new Set())
  const pageSize = 5

  useEffect(() => {
    let active = true
    const loadOverview = async () => {
      try {
        const result = await prefetchAdminGeneral({ force: true })
        if (!active) return
        setOverview({
          stats: result?.stats || null,
          activity: Array.isArray(result?.activity) ? result.activity : [],
          services: result?.services || null,
        })
        setLoadError('')
      } catch (error) {
        if (active) setLoadError(error.message || 'Unable to load the admin overview.')
      }
    }
    void loadOverview()
    const socket = connectSocket()
    const handleRealtimeChange = () => void loadOverview()
    socket.on('admin:general:changed', handleRealtimeChange)
    const interval = window.setInterval(loadOverview, 15_000)
    return () => {
      active = false
      socket.off('admin:general:changed', handleRealtimeChange)
      window.clearInterval(interval)
    }
  }, [])

  const activity = overview.activity
  const pageCount = Math.max(1, Math.ceil(activity.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const visibleActivity = activity.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const stats = [
    { label: 'Users', value: overview.stats?.users ?? null },
    { label: 'Wagered', value: overview.stats?.wagered ?? null, coins: true },
    { label: 'Stock', value: overview.stats?.stock ?? null, coins: true },
    { label: 'Profit', value: overview.stats?.profit ?? null, coins: true, profit: true },
  ]

  const updateService = async (name, enabled) => {
    const serviceKey = serviceKeys[name]
    if (!serviceKey || savingServices.has(serviceKey)) return
    const previousValue = overview.services?.[serviceKey] !== false
    setOverview((current) => ({
      ...current,
      services: { ...(current.services || {}), [serviceKey]: enabled },
    }))
    if (adminGeneralClientCache) {
      adminGeneralClientCache = {
        ...adminGeneralClientCache,
        services: { ...(adminGeneralClientCache.services || {}), [serviceKey]: enabled },
      }
    }
    setSavingServices((current) => new Set(current).add(serviceKey))
    try {
      await apiRequest(`/api/admin/services/${serviceKey}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      })
      notifications.success(`${name} ${enabled ? 'enabled' : 'disabled'}.`)
    } catch (error) {
      setOverview((current) => ({
        ...current,
        services: { ...(current.services || {}), [serviceKey]: previousValue },
      }))
      if (adminGeneralClientCache) {
        adminGeneralClientCache = {
          ...adminGeneralClientCache,
          services: { ...(adminGeneralClientCache.services || {}), [serviceKey]: previousValue },
        }
      }
      notifications.error(error.message || `Unable to update ${name}.`)
    } finally {
      setSavingServices((current) => {
        const next = new Set(current)
        next.delete(serviceKey)
        return next
      })
    }
  }

  return (
    <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pr-0.5">
      <div className="flex shrink-0 flex-col items-stretch gap-1.5 rounded-[8px] bg-[#0f1119] px-3 py-2 sm:flex-row sm:items-center sm:gap-0.5">
        {stats.map((stat, index) => (
          <div key={stat.label} className="contents">
            {index > 0 ? <span className="h-px w-full shrink-0 bg-[#1e2235] sm:mx-2 sm:h-6 sm:w-px" aria-hidden="true" /> : null}
            <div className="flex min-w-[80px] flex-1 items-center justify-between gap-2 sm:flex-col sm:justify-center sm:gap-0.5">
              <span className="text-[9px] font-bold uppercase tracking-[.6px] text-[#4a5278]">{stat.label}</span>
              <span className={`flex items-center gap-[5px] text-[13px] font-bold ${stat.profit && Number(stat.value) > 0 ? 'text-[#22c55e]' : stat.profit && Number(stat.value) < 0 ? 'text-[#f87171]' : 'text-[#e1e4f2]'}`}>
                {stat.coins ? <img src={COIN_ICON} alt="" className="h-3 w-3 object-contain" /> : null}
                {stat.value === null ? '—' : stat.coins ? formatPriceValue(stat.value, { compactNumbers: false }) : Number(stat.value).toLocaleString()}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex min-h-[470px] flex-1 flex-col gap-2.5">
        <div className="flex min-w-0 flex-col">
          <div className="flex flex-none flex-col gap-[3px] overflow-visible">
            <div className="hidden min-h-7 shrink-0 grid-cols-[1.3fr_.7fr_.95fr_1.65fr_1.05fr] items-end gap-2 bg-transparent px-2 pb-1 pt-2 text-[10px] font-bold uppercase leading-none tracking-[.06em] text-[rgba(225,228,242,.35)] sm:grid">
              <span>User</span><span>Type</span><span>Date</span><span>Items</span><span>Amount</span>
            </div>
            {visibleActivity.map((entry) => {
              const isPositive = entry.amount >= 0
              return (
                <div key={entry.id} className="adminActivityRow flex h-[42px] min-h-[42px] cursor-pointer items-center justify-between gap-1.5 overflow-visible rounded-[5px] bg-[#171925] px-2 text-[10px] font-semibold text-[rgba(225,228,242,.85)] transition-colors hover:bg-[#202332] sm:grid sm:grid-cols-[1.3fr_.7fr_.95fr_1.65fr_1.05fr] sm:gap-2 sm:text-[11px]">
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none">
                    <img src={entry.player?.avatar || '/ps99-cat.png'} alt="" className="h-[22px] w-[22px] shrink-0 rounded-full border border-[#292d43] bg-[#202435] object-cover" />
                    <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{entry.player.name}</span>
                  </span>
                  <span className="hidden min-w-0 overflow-hidden text-ellipsis whitespace-nowrap sm:block">{entry.type}</span>
                  <span className="hidden overflow-hidden text-ellipsis whitespace-nowrap text-[10px] opacity-55 sm:block">{formatActivityTime(entry.date)}</span>
                  <span className="hidden min-w-0 overflow-visible sm:block"><TransactionItemStack items={entry.items} /></span>
                  <span className={`inline-flex shrink-0 items-center gap-[3px] font-bold ${isPositive ? 'text-[#34d399]' : 'text-[#f87171]'}`}><img src={COIN_ICON} alt="" className="h-[11px] w-[11px]" draggable={false} />{isPositive ? '+' : '-'}{Math.abs(entry.amount).toLocaleString()}</span>
                </div>
              )
            })}
          </div>
          <div className="mt-1 flex shrink-0 items-center justify-between">
            <button type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Previous transaction page" className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-md border-none bg-[#1c1f2e] text-white/60 disabled:cursor-not-allowed disabled:opacity-35"><ChevronLeft className="h-3 w-3" /></button>
            <span className="text-[11px] font-semibold text-[rgba(225,228,242,.4)]">{currentPage} / {pageCount}</span>
            <button type="button" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} aria-label="Next transaction page" className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-md border-none bg-[#1c1f2e] text-white/60 disabled:cursor-not-allowed disabled:opacity-35"><ChevronRight className="h-3 w-3" /></button>
          </div>
        </div>

        <div className="min-w-0">
        <p className={`${LABEL} mb-1.5 px-2.5`}>Games</p>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {games.map((game) => {
            const GameIcon = gameIcons[game]
            const serviceKey = serviceKeys[game]
            return <div key={game} className="flex h-[31px] items-center justify-between rounded-md bg-[#171925] px-2.5"><span className="inline-flex items-center gap-2 text-[10px] font-semibold text-[#cdd2e8]"><GameIcon className="h-3 w-3 text-[#777fb0]" />{game}</span><Toggle label={game} checked={overview.services?.[serviceKey] !== false} disabled={!overview.services || savingServices.has(serviceKey)} onChange={(value) => updateService(game, value)} /></div>
          })}
        </div>
        <p className={`${LABEL} mb-1.5 mt-3 px-2.5`}>Community</p>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {[['Chat', MessageSquare]].map(([name, Icon]) => {
            const serviceKey = serviceKeys[name]
            return <div key={name} className="flex h-9 items-center justify-between rounded-md bg-[#171925] px-2.5"><span className="inline-flex items-center gap-2 text-[10px] font-semibold text-[#cdd2e8]"><Icon className="h-3.5 w-3.5 text-[#777fb0]" />Site chat</span><Toggle label={name} checked={overview.services?.[serviceKey] !== false} disabled={!overview.services || savingServices.has(serviceKey)} onChange={(value) => updateService(name, value)} /></div>
          })}
        </div>
        {loadError ? <p className="mt-2 px-2.5 text-[10px] font-semibold text-[#f87171]">{loadError}</p> : null}
        </div>
      </div>
    </div>
  )
}

export function AdminPlayers() {
  const [query, setQuery] = useState('')
  const [playerSortAscending, setPlayerSortAscending] = useState(true)
  const [searchOpen, setSearchOpen] = useState(true)
  const [players, setPlayers] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [loadingPlayers, setLoadingPlayers] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [inventoryOpen, setInventoryOpen] = useState(false)
  const [savingBan, setSavingBan] = useState(false)

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(async () => {
      setLoadingPlayers(true)
      try {
        const result = await apiRequest(`/api/admin/players?q=${encodeURIComponent(query.trim())}`, { cache: 'no-store' })
        if (!active) return
        const nextPlayers = Array.isArray(result?.players) ? result.players : []
        setPlayers(nextPlayers)
        setSelectedId((current) => nextPlayers.some((player) => player.id === current) ? current : '')
        setLoadError('')
      } catch (error) {
        if (active) {
          setPlayers([])
          setSelectedId('')
          setLoadError(error?.message || 'Unable to search players.')
        }
      } finally {
        if (active) setLoadingPlayers(false)
      }
    }, query ? 220 : 0)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [query])

  const sortedPlayers = useMemo(() => players.slice().sort((left, right) => (
    playerSortAscending
      ? String(left.username || '').localeCompare(String(right.username || ''))
      : String(right.username || '').localeCompare(String(left.username || ''))
  )), [playerSortAscending, players])
  const selectedPlayer = players.find((player) => player.id === selectedId) || null

  const togglePlayerBan = async () => {
    if (!selectedPlayer || savingBan) return
    const nextBanned = !selectedPlayer.is_banned
    setSavingBan(true)
    try {
      await apiRequest(`/api/admin/players/${encodeURIComponent(selectedPlayer.id)}/ban`, {
        method: 'PATCH',
        body: JSON.stringify({ banned: nextBanned }),
      })
      setPlayers((current) => current.map((player) => (
        player.id === selectedPlayer.id ? { ...player, is_banned: nextBanned } : player
      )))
      notifications.success(`${selectedPlayer.username} ${nextBanned ? 'banned' : 'unbanned'}.`)
    } catch (error) {
      notifications.error(error?.message || `Unable to ${nextBanned ? 'ban' : 'unban'} this player.`)
    } finally {
      setSavingBan(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-hidden pr-0.5">
      <div className={searchOpen ? 'flex min-h-0 w-full flex-1 flex-col' : 'w-full shrink-0'}>
        <div className="flex w-full items-center justify-between gap-2"><div className="flex min-w-0 flex-1 items-center gap-1.5"><div className="min-w-0 flex-1 sm:max-w-[260px]"><SearchField value={query} onChange={(value) => { setQuery(value); setSearchOpen(true) }} onFocus={() => setSearchOpen(true)} placeholder="Search players..." /></div><button type="button" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-none bg-[#20222f] text-[#e1e4f2] transition-colors hover:bg-[#2a2e44] active:bg-[#32364d] [&_.sort-direction-icon]:h-[14px] [&_.sort-direction-icon]:w-[14px]" title={`Username ${playerSortAscending ? 'Ascending' : 'Descending'}`} aria-label={`Sort username ${playerSortAscending ? 'descending' : 'ascending'}`} onClick={() => { setPlayerSortAscending((value) => !value); setSearchOpen(true) }}><SortDirectionIcon ascending={playerSortAscending} /></button></div><div className="flex shrink-0 items-center gap-1.5"><button type="button" className={ADMIN_PRIMARY_BUTTON} aria-disabled={!selectedPlayer} title={selectedPlayer ? `Open ${selectedPlayer.username}'s inventory` : 'Select a player first'} onClick={() => { if (selectedPlayer) setInventoryOpen(true) }}>Inventory</button><button type="button" className={ADMIN_DANGER_BUTTON} aria-disabled={!selectedPlayer || savingBan} title={selectedPlayer ? `${selectedPlayer.is_banned ? 'Unban' : 'Ban'} ${selectedPlayer.username}` : 'Select a player first'} onClick={() => { if (selectedPlayer && !savingBan) void togglePlayerBan() }}>{savingBan ? 'Saving...' : selectedPlayer?.is_banned ? 'Unban' : 'Ban'}</button></div></div>
        {searchOpen ? <div className="mt-2 flex min-h-0 flex-1 flex-col gap-[3px]">
          <div className="hidden min-h-7 shrink-0 grid-cols-[1.3fr_.7fr_1fr_1fr] items-end gap-2 px-2 pb-1 pt-2 text-[10px] font-bold uppercase leading-none tracking-[.06em] text-[rgba(225,228,242,.35)] sm:grid">
            <span>User</span><span>Rank</span><span>Balance</span><span>Joined At</span>
          </div>
          <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-[3px] overflow-y-auto">
          {sortedPlayers.map((player) => (
            <button type="button" key={player.id} onClick={() => setSelectedId(player.id)} className={`adminActivityRow flex h-[42px] min-h-[42px] w-full cursor-pointer items-center justify-between gap-1.5 overflow-hidden rounded-[5px] px-2 text-left text-[10px] font-semibold text-[rgba(225,228,242,.85)] transition-colors sm:grid sm:grid-cols-[1.3fr_.7fr_1fr_1fr] sm:gap-2 sm:text-[11px] ${selectedId === player.id ? 'bg-[#202332]' : 'bg-[#171925] hover:bg-[#202332]'}`}>
              <span className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none">
                <img src={player.avatar_headshot_url || player.avatar_url || '/ps99-cat.png'} alt="" className="h-[22px] w-[22px] shrink-0 rounded-full border border-[#292d43] bg-[#202435] object-cover" />
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{player.username}</span>
              </span>
              <span className="hidden min-w-0 sm:block"><RoleBadge role={player.role} compact /></span>
              <span className="inline-flex shrink-0 items-center gap-[3px] font-bold"><img src={COIN_ICON} alt="" className="h-[11px] w-[11px]" />{formatPriceValue(Number(player.coin_balance || 0) + Number(player.item_balance || 0), { compactNumbers: false })}</span>
              <span className="hidden min-w-0 truncate text-[10px] opacity-55 sm:block">{formatPlayerJoinedDate(player.created_at)}</span>
            </button>
          ))}
          {loadingPlayers ? <div className="flex h-[42px] items-center justify-center rounded-[5px] bg-[#171925] text-[10px] text-white/30">Searching players...</div> : null}
          {!loadingPlayers && !players.length ? <div className={`flex h-[42px] items-center justify-center rounded-[5px] bg-[#171925] px-3 text-center text-[10px] ${loadError ? 'font-semibold text-[#f87171]' : 'text-white/30'}`}>{loadError || 'No players found.'}</div> : null}
          </div>
        </div> : null}
      </div>
      {selectedPlayer ? <InventoryModal isOpen={inventoryOpen} onClose={() => setInventoryOpen(false)} profileId={selectedPlayer.id} readOnly ariaLabel={`${selectedPlayer.username}'s inventory`} /> : null}
    </div>
  )
}
