import { useEffect, useMemo, useState } from 'react'
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CloudRain,
  Gift,
  MessageSquare,
  Package,
  Pencil,
  Play,
  Plus,
  Power,
  RefreshCw,
  Search,
  ShieldBan,
  Trash2,
  VolumeX,
  Wallet,
} from 'lucide-react'
import {
  BattlesIcon,
  CasesIcon,
  CoinflipIcon,
  UpgraderIcon,
  MinesIcon,
  RollIcon,
  BlackjackIcon,
} from './icons'
import { notifications } from './Notifications'
import { getInventoryItemCardStyle } from './InventoryItemCard'
import { formatPriceValue } from '../Utils/FormatPriceValues'
import { apiRequest } from '../lib/apiClient'
import { connectSocket } from '../lib/socket'

const COIN_ICON = '/bobux.png'
const PANEL = 'rounded-md bg-[#1c1f2e]'
const INNER = 'rounded-md border border-white/[.035] bg-[#171925]'
const LABEL = 'text-[10px] font-semibold uppercase tracking-[.04em] text-[rgba(225,228,242,.35)]'
const INPUT = 'h-8 w-full rounded-[5px] border border-[#323240] bg-[#171925] px-2.5 text-[11px] text-white outline-none placeholder:text-white/25 focus:border-[#5147d9]'
const PRIMARY = 'inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[rgba(94,85,217,.4)] bg-[linear-gradient(135deg,#5b52e2,#4038c0)] px-3 text-[11px] font-semibold text-white shadow-[0_2px_8px_rgba(108,99,255,.16)] transition-[transform,filter,opacity] duration-[140ms] hover:brightness-110 active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-40'
const SECONDARY = 'inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-white/[.04] bg-[#252839] px-3 text-[11px] font-semibold text-[#d6daf0] transition-[transform,background,color] duration-[140ms] hover:bg-[#303448] hover:text-white active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-40'
const DANGER = 'inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-red-400/10 bg-red-500/10 px-3 text-[11px] font-semibold text-[#ff7b87] transition-[transform,background,color] duration-[140ms] hover:bg-red-500/20 hover:text-[#ff9ca5] active:scale-[.97]'

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

const petImages = [
  'https://biggamesapi.io/image/14976374906',
  'https://biggamesapi.io/image/14976529226',
  'https://biggamesapi.io/image/14976542836',
  'https://biggamesapi.io/image/14976545749',
  'https://biggamesapi.io/image/14976551601',
  'https://biggamesapi.io/image/14976555825',
]

const games = ['Case Battles', 'Cases', 'Coinflip', 'Upgrader', 'Mines', 'Roll', 'Blackjack']
const serviceKeys = {
  'Case Battles': 'case_battles',
  Cases: 'cases',
  Coinflip: 'coinflip',
  Upgrader: 'upgrader',
  Mines: 'mines',
  Roll: 'roll',
  Blackjack: 'blackjack',
  Chat: 'chat',
  Rain: 'rain',
}
const gameIcons = {
  'Case Battles': BattlesIcon,
  Cases: CasesIcon,
  Coinflip: CoinflipIcon,
  Upgrader: UpgraderIcon,
  Mines: MinesIcon,
  Roll: RollIcon,
  Blackjack: BlackjackIcon,
}

const people = [
  { id: '114847208', name: 'deanzapper2022', value: 12450800, status: 'Online', avatar: 'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-CD1D1A7071137D011815CEDDB70AC5FA-Png/420/420/AvatarHeadshot/Png/noFilter' },
  { id: '92730154', name: 'MexicanTravis_Scott', value: 8820600, status: 'Online', avatar: 'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-4A2AEBC1024BCF622CAA069C82B06E7F-Png/420/420/AvatarHeadshot/Png/noFilter' },
  { id: '33190982', name: 'larpsky3', value: 4153400, status: 'Offline', avatar: 'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-D517857E5CC51E2FF93E63E20241169E-Png/420/420/AvatarHeadshot/Png/noFilter' },
  { id: '61842007', name: 'klerp1234', value: 1100250, status: 'Offline', avatar: '/ps99-cat.png' },
  { id: '50213066', name: 'WaveRider', value: 748900, status: 'Online', avatar: '/ps99-cat.png' },
]

const bots = [
  { id: 'ps-01', name: 'BloxyBot One', status: 'Online', players: '4/10', avatar: 'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-C4D471323BFE27394BD99F7CC09A6CAE-Png/150/150/AvatarHeadshot/Webp/noFilter' },
  { id: 'ps-02', name: 'BloxyBot Two', status: 'Online', players: '7/10', avatar: 'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-C4D471323BFE27394BD99F7CC09A6CAE-Png/150/150/AvatarHeadshot/Webp/noFilter' },
  { id: 'ps-03', name: 'BloxyBot Three', status: 'Restarting', players: '0/10', avatar: '/ps99-cat.png' },
  { id: 'ps-04', name: 'BloxyBot Four', status: 'Offline', players: '0/10', avatar: '/ps99-cat.png' },
]

const inventory = Array.from({ length: 14 }, (_, index) => ({
  id: `item-${index}`,
  name: ['Huge Cat', 'Huge Pumpkin Cat', 'Huge Santa Paws', 'Huge Dragon', 'Huge Unicorn', 'Huge Happy Rock'][index % 6],
  value: [14000000, 695000, 1950000, 3400000, 2650000, 820000][index % 6],
  image: petImages[index % petImages.length],
}))

const initialStocks = {
  exchange: inventory.slice(0, 7),
  upgrader: inventory.slice(3, 11),
  tax: inventory.slice(6, 14),
}

const initialCodes = [
  { id: 1, name: 'WELCOME', reward: '25,000 Coins', uses: 842, maxUses: 1000, requirement: 'New players', enabled: true },
  { id: 2, name: 'BLOXY10', reward: 'Huge Happy Rock', uses: 34, maxUses: 100, requirement: 'Level 10+', enabled: true },
  { id: 3, name: 'SUMMER', reward: '100,000 Coins', uses: 500, maxUses: 500, requirement: 'None', enabled: false },
]

function CoinValue({ value, compact = false }) {
  return <span className="inline-flex items-center gap-1 font-semibold text-white"><img src={COIN_ICON} alt="" className="h-3.5 w-3.5" />{formatPriceValue(value, { compactNumbers: compact })}</span>
}

function SearchField({ value, onChange, placeholder }) {
  return (
    <label className="relative block">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-[13px] w-[13px] -translate-y-1/2 text-white/35" />
      <input className={`${INPUT} pl-8`} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  )
}

function Toggle({ checked, onChange, label, disabled = false }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className={`relative h-[18px] w-8 shrink-0 rounded-full border-0 p-0 transition-colors duration-200 disabled:cursor-wait disabled:opacity-50 ${checked ? 'bg-[#6c63ff]' : 'bg-[#303448]'}`}>
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
          className="group relative box-border block h-[30px] w-[30px] shrink-0 cursor-pointer rounded-[3px] border-2 border-solid border-[#2F3347] bg-[#171925] transition-colors duration-200 [transform:var(--item-shift)] hover:!z-20 hover:border-[#6c63ff]"
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
          {[['Chat', MessageSquare], ['Rain', CloudRain]].map(([name, Icon]) => {
            const serviceKey = serviceKeys[name]
            return <div key={name} className="flex h-9 items-center justify-between rounded-md bg-[#171925] px-2.5"><span className="inline-flex items-center gap-2 text-[10px] font-semibold text-[#cdd2e8]"><Icon className="h-3.5 w-3.5 text-[#777fb0]" />{name === 'Rain' ? 'Rain Pool' : 'Site chat'}</span><Toggle label={name} checked={overview.services?.[serviceKey] !== false} disabled={!overview.services || savingServices.has(serviceKey)} onChange={(value) => updateService(name, value)} /></div>
          })}
        </div>
        {loadError ? <p className="mt-2 px-2.5 text-[10px] font-semibold text-[#f87171]">{loadError}</p> : null}
        </div>
      </div>
    </div>
  )
}

export function AdminPlayers() {
  return <div className="min-h-0 flex-1" />

  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(people[0].id)
  const [coinAmount, setCoinAmount] = useState('')
  const [muted, setMuted] = useState(false)
  const [banned, setBanned] = useState(false)
  const selected = people.find((person) => person.id === selectedId) || people[0]
  const filtered = people.filter((person) => `${person.name} ${person.id}`.toLowerCase().includes(query.toLowerCase()))
  const act = (message) => notifications.success(message)

  return (
    <div className="grid min-h-0 flex-1 gap-2.5 overflow-y-auto sm:grid-cols-[220px_minmax(0,1fr)] sm:overflow-hidden">
      <div className={`${PANEL} flex min-h-[190px] flex-col p-2 sm:min-h-0`}>
        <SearchField value={query} onChange={setQuery} placeholder="Search name or ID..." />
        <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto">
          {filtered.map((person) => (
            <button type="button" key={person.id} onClick={() => setSelectedId(person.id)} className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors ${selectedId === person.id ? 'border-[#5147d9]/40 bg-[rgba(108,99,255,.13)]' : 'border-transparent bg-[#171925] hover:bg-[#202332]'}`}>
              <img src={person.avatar} alt="" className="h-7 w-7 shrink-0 rounded-full border border-[#292d43] bg-[#202435] object-cover" />
              <span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-semibold text-[#e1e4f2]">{person.name}</span><span className="block truncate font-mono text-[8px] text-white/25">ID {person.id}</span></span>
              <span className="text-[9px]"><CoinValue value={person.value} compact /></span>
            </button>
          ))}
          {!filtered.length ? <EmptyState>No players found.</EmptyState> : null}
        </div>
      </div>
      <div className="min-h-0 overflow-visible sm:overflow-y-auto">
        <div className={`${PANEL} mb-2.5 p-3`}>
          <div className="flex items-center gap-3">
            <div className="relative"><img src={selected.avatar} alt="" className="h-12 w-12 rounded-full border-2 border-[#292e46] bg-[#202435] object-cover" /><span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#1c1f2e] ${selected.status === 'Online' ? 'bg-[#22c55e]' : 'bg-[#5c627d]'}`} /></div>
            <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="truncate text-[14px] font-bold text-white">{selected.name}</h3><span className="rounded bg-[#6c63ff]/15 px-1.5 py-0.5 text-[8px] font-semibold text-[#9d98ff]">PLAYER</span></div><p className="font-mono text-[9px] text-white/30">Roblox ID {selected.id}</p><p className="mt-1 text-[10px] text-white/45">Balance <CoinValue value={selected.value} /></p></div>
          </div>
        </div>
        <div className="grid gap-2.5 lg:grid-cols-2">
          <div className={`${PANEL} p-3`}><div className="mb-2.5 flex items-center gap-2"><ShieldBan className="h-3.5 w-3.5 text-[#ff7b87]" /><p className="text-[11px] font-bold text-white">Moderation</p></div><div className="space-y-2"><label className="block"><span className={LABEL}>Reason</span><input className={`${INPUT} mt-1`} placeholder="Enter a reason..." /></label><div className="grid grid-cols-2 gap-2"><button className={muted ? SECONDARY : DANGER} onClick={() => { setMuted(!muted); act(`${selected.name} ${muted ? 'unmuted' : 'muted'}.`) }}><VolumeX className="h-3.5 w-3.5" />{muted ? 'Unmute' : 'Mute'}</button><button className={banned ? SECONDARY : DANGER} onClick={() => { setBanned(!banned); act(`${selected.name} ${banned ? 'unbanned' : 'banned'}.`) }}><Ban className="h-3.5 w-3.5" />{banned ? 'Unban' : 'Ban'}</button></div></div></div>
          <div className={`${PANEL} p-3`}><div className="mb-2.5 flex items-center gap-2"><Wallet className="h-3.5 w-3.5 text-[#8d86ff]" /><p className="text-[11px] font-bold text-white">Coin Balance</p></div><label className="block"><span className={LABEL}>Amount</span><div className="relative mt-1"><img src={COIN_ICON} alt="" className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" /><input className={`${INPUT} pl-8`} inputMode="numeric" value={coinAmount} onChange={(event) => setCoinAmount(event.target.value.replace(/\D/g, ''))} placeholder="0" /></div></label><div className="mt-2 grid grid-cols-2 gap-2"><button className={SECONDARY} disabled={!coinAmount} onClick={() => { act(`${formatPriceValue(coinAmount)} coins removed.`); setCoinAmount('') }}>Remove</button><button className={PRIMARY} disabled={!coinAmount} onClick={() => { act(`${formatPriceValue(coinAmount)} coins added.`); setCoinAmount('') }}>Add coins</button></div></div>
          <div className={`${PANEL} p-3 lg:col-span-2`}><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><Package className="h-3.5 w-3.5 text-[#8d86ff]" /><div><p className="text-[11px] font-bold text-white">Player Inventory</p><p className="text-[9px] text-white/30">18 items • 34.2M total value</p></div></div><button className={SECONDARY} onClick={() => act(`Opened ${selected.name}'s inventory.`)}>Manage inventory <ChevronRight className="h-3 w-3" /></button></div></div>
        </div>
      </div>
    </div>
  )
}

export function AdminPrivateServers() {
  return <div className="min-h-0 flex-1" />

  const [selectedId, setSelectedId] = useState(bots[0].id)
  const [page, setPage] = useState(0)
  const selected = bots.find((bot) => bot.id === selectedId) || bots[0]
  const pages = Math.ceil(inventory.length / 6)
  const pageItems = inventory.slice(page * 6, page * 6 + 6)
  const command = (verb) => notifications.success(`${selected.name} ${verb}.`)

  return (
    <div className="grid min-h-0 flex-1 gap-2.5 overflow-y-auto sm:grid-cols-[190px_minmax(0,1fr)] sm:overflow-hidden">
      <div className={`${PANEL} flex min-h-0 flex-col p-2`}><div className="mb-2 flex items-center justify-between px-1"><div><p className="text-[11px] font-bold text-white">Deposit Bots</p><p className="text-[8px] text-white/30">{bots.filter((bot) => bot.status === 'Online').length} of {bots.length} online</p></div><span className="h-2 w-2 animate-pulse rounded-full bg-[#22c55e]" /></div><div className="min-h-0 space-y-1 overflow-y-auto">{bots.map((bot) => <button key={bot.id} onClick={() => { setSelectedId(bot.id); setPage(0) }} className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-all ${selectedId === bot.id ? 'border-[#5147d9]/40 bg-[rgba(108,99,255,.13)]' : 'border-transparent bg-[#171925] hover:bg-[#202332]'}`}><div className="relative"><img src={bot.avatar} alt="" className="h-7 w-7 rounded-full border border-[#2b3047] bg-[#202435] object-cover" /><span className={`absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full border-2 border-[#171925] ${bot.status === 'Online' ? 'bg-[#22c55e]' : bot.status === 'Restarting' ? 'bg-[#f59e0b]' : 'bg-[#5c627d]'}`} /></div><span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-semibold text-white">{bot.name}</span><span className="block text-[8px] text-white/30">{bot.status} • {bot.players}</span></span><ChevronRight className="h-3 w-3 text-white/20" /></button>)}</div></div>
      <div className="flex min-h-0 flex-col gap-2.5 overflow-visible sm:overflow-y-auto">
        <div className={`${PANEL} flex flex-wrap items-center gap-2 p-2.5`}><img src={selected.avatar} alt="" className="h-9 w-9 rounded-full border border-[#2b3047] object-cover" /><div className="mr-auto min-w-0"><p className="truncate text-[12px] font-bold text-white">{selected.name}</p><p className="text-[9px] text-white/30">Server {selected.id.toUpperCase()} • {selected.players} players</p></div><button className={SECONDARY} onClick={() => command('launched')}><Play className="h-3 w-3" />Launch</button><button className={SECONDARY} onClick={() => command('is restarting')}><RefreshCw className="h-3 w-3" />Restart</button><button className={DANGER} onClick={() => command('shut down')}><Power className="h-3 w-3" />Shutdown</button></div>
        <div className={`${PANEL} flex min-h-[300px] flex-1 flex-col p-2.5`}><div className="mb-2 flex items-center justify-between"><div><p className="text-[11px] font-bold text-white">Bot Inventory</p><p className="text-[9px] text-white/30">{inventory.length} items held by this bot</p></div><div className="flex items-center gap-1.5"><button className="flex h-6 w-6 items-center justify-center rounded bg-[#252839] text-white/55 hover:text-white disabled:opacity-30" disabled={page === 0} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="h-3 w-3" /></button><span className="min-w-[36px] text-center text-[9px] text-white/35">{page + 1}/{pages}</span><button className="flex h-6 w-6 items-center justify-center rounded bg-[#252839] text-white/55 hover:text-white disabled:opacity-30" disabled={page === pages - 1} onClick={() => setPage((value) => value + 1)}><ChevronRight className="h-3 w-3" /></button></div></div><div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3">{pageItems.map((item) => <div key={item.id} className="group relative flex min-h-[118px] flex-col overflow-hidden rounded-md border border-white/[.04] bg-[#202538] p-1.5 transition-transform hover:scale-[1.02]"><div className="min-h-0 flex-1 overflow-hidden rounded bg-[radial-gradient(circle,rgba(108,99,255,.16),transparent_68%)]"><img src={item.image} alt={item.name} className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-105" /></div><div className="pt-1 text-center"><p className="truncate text-[9px] font-semibold text-[#d6ddf5]">{item.name}</p><span className="text-[9px]"><CoinValue value={item.value} compact /></span></div></div>)}</div></div>
      </div>
    </div>
  )
}

export function AdminStock() {
  return <div className="min-h-0 flex-1" />

  const [active, setActive] = useState('exchange')
  const [stocks, setStocks] = useState(initialStocks)
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const stock = stocks[active]
  const visible = stock.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()))
  const totalValue = stock.reduce((sum, item) => sum + item.value, 0)
  const labels = { exchange: 'Exchange Stock', upgrader: 'Upgrader Stock', tax: 'Tax Stock' }
  const removeSelected = (verb) => {
    if (!selectedIds.length) return
    setStocks((current) => ({ ...current, [active]: current[active].filter((item) => !selectedIds.includes(item.id)) }))
    notifications.success(`${selectedIds.length} ${selectedIds.length === 1 ? 'item' : 'items'} ${verb}.`)
    setSelectedIds([])
  }
  const addItem = () => {
    const source = inventory.find((item) => !stock.some((current) => current.id === item.id)) || { ...inventory[0], id: `${active}-${Date.now()}` }
    setStocks((current) => ({ ...current, [active]: [...current[active], source] }))
    notifications.success(`Item added to ${labels[active].toLowerCase()}.`)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      <div className="flex shrink-0 gap-1.5">{Object.entries(labels).map(([id, label]) => <button key={id} onClick={() => { setActive(id); setSelectedIds([]) }} className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-[10px] font-semibold transition-colors ${active === id ? 'bg-[rgba(108,99,255,.16)] text-white' : 'bg-[#1c1f2e] text-white/40 hover:bg-[#252839] hover:text-white/70'}`}><Package className="h-3 w-3" />{label}</button>)}</div>
      <div className={`${PANEL} flex min-h-0 flex-1 flex-col p-2.5`}>
        <div className="mb-2.5 flex flex-wrap items-center gap-2"><div className="min-w-[150px] flex-1"><SearchField value={query} onChange={setQuery} placeholder={`Search ${labels[active].toLowerCase()}...`} /></div><div className="flex items-center gap-2 rounded-md bg-[#171925] px-2.5 py-1.5 text-[9px] text-white/35"><span>{stock.length} items</span><span className="h-3 w-px bg-white/[.06]" /><CoinValue value={totalValue} compact /></div><button className={PRIMARY} onClick={addItem}><Plus className="h-3 w-3" />Add item</button></div>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md bg-[#171925] p-2"><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{visible.map((item) => { const selected = selectedIds.includes(item.id); return <button key={item.id} onClick={() => setSelectedIds((current) => selected ? current.filter((id) => id !== item.id) : [...current, item.id])} className={`group relative flex min-h-[132px] flex-col overflow-hidden rounded-md border p-1.5 text-left transition-[transform,border,box-shadow] hover:scale-[1.02] ${selected ? 'border-[#6c63ff] bg-[#282c44] shadow-[0_0_0_1px_rgba(108,99,255,.2)]' : 'border-white/[.04] bg-[#22263a]'}`}><span className={`absolute right-2 top-2 z-10 h-2 w-2 rounded-[3px] bg-[#6c63ff] transition-opacity ${selected ? 'opacity-100' : 'opacity-0'}`} /><div className="min-h-0 flex-1 overflow-hidden rounded bg-[radial-gradient(circle,rgba(108,99,255,.12),transparent_68%)]"><img src={item.image} alt={item.name} className="h-full w-full object-contain" /></div><div className="pt-1 text-center"><p className="truncate text-[9px] font-semibold text-[#d6ddf5]">{item.name}</p><span className="text-[9px]"><CoinValue value={item.value} compact /></span></div></button> })}</div>{!visible.length ? <EmptyState>No stock items found.</EmptyState> : null}</div>
        <div className="mt-2.5 flex items-center justify-between gap-2"><p className="text-[9px] text-white/30">{selectedIds.length ? `${selectedIds.length} selected` : 'Select items to manage stock'}</p><div className="flex gap-2"><button className={DANGER} disabled={!selectedIds.length} onClick={() => removeSelected('removed')}><Trash2 className="h-3 w-3" />Remove</button><button className={SECONDARY} disabled={!selectedIds.length} onClick={() => removeSelected('withdrawn')}><Wallet className="h-3 w-3" />Withdraw</button></div></div>
      </div>
    </div>
  )
}

export function AdminRewards() {
  return <div className="min-h-0 flex-1" />

  const [codes, setCodes] = useState(initialCodes)
  const [editingId, setEditingId] = useState(null)
  const [name, setName] = useState('')
  const [uses, setUses] = useState('100')
  const [rewardType, setRewardType] = useState('coins')
  const [reward, setReward] = useState('')
  const [requirementEnabled, setRequirementEnabled] = useState(false)
  const [requirement, setRequirement] = useState('')
  const [enabled, setEnabled] = useState(true)

  const reset = () => { setEditingId(null); setName(''); setUses('100'); setRewardType('coins'); setReward(''); setRequirementEnabled(false); setRequirement(''); setEnabled(true) }
  const save = () => {
    if (!name.trim() || !reward.trim() || !uses) return
    const entry = { id: editingId || Date.now(), name: name.trim().toUpperCase(), uses: editingId ? codes.find((code) => code.id === editingId)?.uses || 0 : 0, maxUses: Number(uses), reward: rewardType === 'coins' ? `${Number(reward).toLocaleString()} Coins` : reward, requirement: requirementEnabled && requirement.trim() ? requirement : 'None', enabled }
    setCodes((current) => editingId ? current.map((code) => code.id === editingId ? entry : code) : [entry, ...current])
    notifications.success(`Promocode ${editingId ? 'updated' : 'created'}.`)
    reset()
  }
  const edit = (code) => { setEditingId(code.id); setName(code.name); setUses(String(code.maxUses)); setRewardType(code.reward.includes('Coins') ? 'coins' : 'item'); setReward(code.reward.replace(/\s*Coins$/, '').replace(/,/g, '')); setRequirementEnabled(code.requirement !== 'None'); setRequirement(code.requirement === 'None' ? '' : code.requirement); setEnabled(code.enabled) }

  return (
    <div className="grid min-h-0 flex-1 gap-2.5 overflow-y-auto lg:grid-cols-[minmax(230px,.8fr)_minmax(0,1.2fr)] lg:overflow-hidden">
      <div className={`${PANEL} min-h-0 overflow-y-auto p-3`}>
        <div className="mb-2.5 flex items-center justify-between"><div><p className="text-[12px] font-bold text-white">{editingId ? 'Edit Promocode' : 'Create Promocode'}</p><p className="text-[9px] text-white/30">Configure usage and reward details</p></div><Gift className="h-5 w-5 text-[#8079ff]" /></div>
        <div className="space-y-2.5"><div className="grid grid-cols-[1fr_82px] gap-2"><label><span className={LABEL}>Code name</span><input className={`${INPUT} mt-1 uppercase`} value={name} onChange={(event) => setName(event.target.value.replace(/\s/g, ''))} placeholder="BLOXY10" /></label><label><span className={LABEL}>Max uses</span><input className={`${INPUT} mt-1`} inputMode="numeric" value={uses} onChange={(event) => setUses(event.target.value.replace(/\D/g, ''))} placeholder="100" /></label></div>
          <div><span className={LABEL}>Reward type</span><div className="mt-1 grid grid-cols-2 gap-1 rounded-md bg-[#171925] p-1"><button onClick={() => setRewardType('coins')} className={`h-7 rounded text-[10px] font-semibold transition-colors ${rewardType === 'coins' ? 'bg-[#252839] text-white' : 'text-white/35 hover:text-white/60'}`}><CircleDollarSign className="mr-1 inline h-3 w-3" />Coins</button><button onClick={() => setRewardType('item')} className={`h-7 rounded text-[10px] font-semibold transition-colors ${rewardType === 'item' ? 'bg-[#252839] text-white' : 'text-white/35 hover:text-white/60'}`}><Package className="mr-1 inline h-3 w-3" />Item</button></div></div>
          <label className="block"><span className={LABEL}>{rewardType === 'coins' ? 'Coin amount' : 'Reward item'}</span>{rewardType === 'coins' ? <div className="relative mt-1"><img src={COIN_ICON} alt="" className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" /><input className={`${INPUT} pl-8`} inputMode="numeric" value={reward} onChange={(event) => setReward(event.target.value.replace(/\D/g, ''))} placeholder="25,000" /></div> : <select className={`${INPUT} mt-1`} value={reward} onChange={(event) => setReward(event.target.value)}><option value="">Select an item...</option>{[...new Set(inventory.map((item) => item.name))].map((item) => <option key={item}>{item}</option>)}</select>}</label>
          <div className={`${INNER} p-2.5`}><div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold text-[#d6daf0]">Requirements</p><p className="text-[8px] text-white/25">Optional redemption rule</p></div><Toggle label="Requirements" checked={requirementEnabled} onChange={setRequirementEnabled} /></div>{requirementEnabled ? <input className={`${INPUT} mt-2`} value={requirement} onChange={(event) => setRequirement(event.target.value)} placeholder="e.g. Level 10+" /> : null}</div>
          <div className={`${INNER} flex items-center justify-between p-2.5`}><div><p className="text-[10px] font-semibold text-[#d6daf0]">Code enabled</p><p className="text-[8px] text-white/25">Allow players to redeem</p></div><Toggle label="Code enabled" checked={enabled} onChange={setEnabled} /></div>
          <div className="grid grid-cols-[1fr_auto] gap-2"><button className={PRIMARY} disabled={!name.trim() || !reward.trim() || !uses} onClick={save}>{editingId ? 'Save changes' : 'Create code'}</button>{editingId ? <button className={SECONDARY} onClick={reset}>Cancel</button> : null}</div>
        </div>
      </div>
      <div className={`${PANEL} flex min-h-0 flex-col p-2.5`}><div className="mb-2 flex items-center justify-between"><div><p className="text-[12px] font-bold text-white">Existing Codes</p><p className="text-[9px] text-white/30">{codes.length} promocodes configured</p></div></div><div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">{codes.map((code) => <div key={code.id} className={`${INNER} p-2.5 transition-colors hover:bg-[#1a1c29]`}><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><p className="truncate text-[11px] font-bold tracking-[.03em] text-white">{code.name}</p><span className={`h-1.5 w-1.5 rounded-full ${code.enabled ? 'bg-[#22c55e]' : 'bg-[#5c627d]'}`} /></div><p className="mt-0.5 truncate text-[9px] text-white/40">{code.reward} • {code.requirement}</p></div><button className="flex h-6 w-6 items-center justify-center rounded bg-[#252839] text-white/40 hover:text-white" onClick={() => edit(code)} aria-label={`Edit ${code.name}`}><Pencil className="h-3 w-3" /></button><button className="flex h-6 w-6 items-center justify-center rounded bg-red-500/10 text-[#ff7b87] hover:bg-red-500/20" onClick={() => { setCodes((current) => current.filter((item) => item.id !== code.id)); if (editingId === code.id) reset(); notifications.success(`${code.name} deleted.`) }} aria-label={`Delete ${code.name}`}><Trash2 className="h-3 w-3" /></button></div><div className="mt-2"><div className="mb-1 flex justify-between text-[8px] text-white/25"><span>{code.uses.toLocaleString()} used</span><span>{code.maxUses.toLocaleString()} max</span></div><div className="h-1 overflow-hidden rounded-full bg-[#252839]"><span className="block h-full rounded-full bg-[linear-gradient(90deg,#5147d9,#8079ff)]" style={{ width: `${Math.min(100, code.uses / code.maxUses * 100)}%` }} /></div></div></div>)}</div></div>
    </div>
  )
}
