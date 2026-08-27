import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import AnimatedNumber from '../components/AnimatedNumber'
import MinesCreateModal from '../components/MinesCreateModal'
import MinesViewModal from '../components/MinesViewModal'
import CoinflipJoinModal from '../components/CoinflipJoinModal'
import { RobuxIcon } from '../components/AmpInventoryModalUI'
import AdoptMeTraitBadges from '../components/AdoptMeTraitBadges'
import { MinesIcon } from '../components/icons'
import { apiRequest } from '../lib/apiClient'
import { connectSocket } from '../lib/socket'
import { useAuth } from '../store/auth'
import { formatPriceValue } from '../Utils/FormatPriceValues'

const MINES_GAME_STORAGE_KEY = 'bloxdice:mines-game'
const GAME_OPTIONS = [['mm2', 'MM2'], ['adm', 'AMP'], ['ps99', 'PS99']]
const DEFAULT_AVATAR = 'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-7E27815C7C5F72DA623094CFB3768D15-Png/420/420/AvatarHeadshot/Png/noFilter'

function StatCard({ icon, value, label }) {
  return <div className="flex min-h-[76px] items-center justify-start gap-3 rounded-lg border border-[hsl(231_16%_16%)] bg-[hsl(230_16%_14%)] px-4 py-2"><div className="flex w-full flex-col items-start justify-center text-left"><span className="flex items-center justify-start gap-2 text-left text-2xl font-bold leading-tight text-white">{icon ? <img src={icon} alt="" className="h-5 w-5" /> : null}<AnimatedNumber value={Number(value) || 0} duration={260} fastThreshold={100_000_000} fastDuration={160} /></span><span className="text-left text-base font-semibold leading-tight text-white opacity-60">{label}</span></div></div>
}

function gameValue(game) {
  return gameItems(game).reduce((sum, item) => sum + Number(item?.value || 0), 0)
}

function creatorGameValue(game) {
  return (Array.isArray(game?.creator_items) ? game.creator_items : [])
    .reduce((sum, item) => sum + Number(item?.value || 0), 0)
}

function gameItems(game) {
  const participants = Array.isArray(game?.participants) ? game.participants : []
  const participantItems = participants.flatMap((participant) => Array.isArray(participant?.items) ? participant.items : [])
  return participantItems.length ? participantItems : Array.isArray(game?.creator_items) ? game.creator_items : []
}

function normalizePreviewItem(item) {
  return {
    ...item,
    id: item?.item_uuid || item?.id || item?.uuid || item?.image_url || item?.image,
    image: item?.image_url || item?.image || '',
    name: item?.name || 'Unnamed item',
    value: Number(item?.value || 0),
  }
}

function WaitingIcon() {
  return <svg width="18" height="18" viewBox="0 0 384 512" fill="currentColor" aria-hidden="true"><path d="M202.021 0C122.202 0 70.503 32.703 29.914 91.026c-7.363 10.58-5.093 25.086 5.178 32.874l43.138 32.709c10.373 7.865 25.132 6.026 33.253-4.148 25.049-31.381 43.63-49.449 82.757-49.449 30.764 0 68.816 19.799 68.816 49.631 0 22.552-18.617 34.134-48.993 51.164-35.423 19.86-82.299 44.576-82.299 106.405V320c0 13.255 10.745 24 24 24h72.471c13.255 0 24-10.745 24-24v-5.773c0-42.86 125.268-44.645 125.268-160.627C377.504 66.256 286.902 0 202.021 0zM192 373.459c-38.196 0-69.271 31.075-69.271 69.271 0 38.195 31.075 69.27 69.271 69.27s69.271-31.075 69.271-69.271-31.075-69.27-69.271-69.27z" /></svg>
}

function MinesGameRow({ game, currentProfileId, onJoin, onView }) {
  const storedParticipants = Array.isArray(game.participants) ? game.participants : []
  const participants = storedParticipants.length ? storedParticipants : [{ uuid: game.creator_uuid, username: game.creator_username, avatar_url: game.creator_avatar_url, items: game.creator_items }]
  const maxPlayers = 2
  const playerSlots = Array.from({ length: maxPlayers }, (_, index) => participants[index] || null)
  const items = gameItems(game).map(normalizePreviewItem).sort((left, right) => right.value - left.value)
  const displayItems = items.slice(0, 4)
  const hiddenItemCount = Math.max(0, items.length - displayItems.length)
  const isMm2 = game.game_mode === 'mm2'
  const creatorValue = creatorGameValue(game)
  const range = `${formatPriceValue(creatorValue * 0.9, { maximumFractionDigits: 2 })} - ${formatPriceValue(creatorValue * 1.1, { maximumFractionDigits: 2 })}`
  const isParticipant = participants.some((participant) => String(participant?.uuid || '') === currentProfileId)
  const canJoin = participants.length < maxPlayers && !isParticipant

  return <div className="game-preview-shell"><article className="coinflip-room-row mines-room-row">
    <div className="game-preview-players" aria-label={`${participants.length} of ${maxPlayers} players`}>
      {playerSlots.map((player, index) => <Fragment key={player?.uuid || `waiting-${index}`}>{index > 0 ? <p className="game-preview-versus">VS</p> : null}<div className="game-preview-player"><button type="button" disabled className={`coinflip-row-avatar coinflip-row-avatar--${index === 0 ? 'creator' : 'joiner'}`} aria-label={player?.username || 'Waiting for player'}>{player ? <img src={player.avatar_url || player.avatar || DEFAULT_AVATAR} alt={player.username || 'Player'} className="coinflip-row-avatar-image" loading="lazy" draggable={false} referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.src = DEFAULT_AVATAR }} /> : <span className="game-preview-waiting"><WaitingIcon /></span>}</button></div></Fragment>)}
    </div>
    <div className="game-preview-items">{displayItems.map((item, index) => {
      const isLastVisible = index === displayItems.length - 1 && hiddenItemCount > 0
      return <div key={item.id || `item-${index}`} className="game-preview-item"><span role="tooltip" className="game-preview-tooltip">{item.name}</span><img src={item.image || '/currency.svg'} alt="" className={`game-preview-item-image${isMm2 ? ' game-preview-item-image--mm2' : ''}`} />{!isLastVisible ? <AdoptMeTraitBadges item={item} /> : null}{isLastVisible ? <div className="game-preview-more">+{hiddenItemCount}</div> : null}</div>
    })}</div>
    <div className="mines-game-result"><span className="mines-game-result-count"><MinesIcon /><b>{game.mine_count || 1}</b></span></div>
    <div className="game-preview-value"><p className="game-preview-value-total"><RobuxIcon /><span>{formatPriceValue(gameValue(game), { maximumFractionDigits: 2 })}</span></p><p className="game-preview-range">({range})</p></div>
    <div className="game-preview-actions">{canJoin ? <button type="button" onClick={() => onJoin(game)} className="game-preview-join">Join</button> : null}<button type="button" onClick={() => onView(game)} className="game-preview-view" aria-label="View game"><svg viewBox="0 0 576 512" aria-hidden="true"><path fill="currentColor" d="M572.52 241.4C518.29 135.59 410.93 64 288 64S57.68 135.64 3.48 241.41a32.35 32.35 0 0 0 0 29.19C57.71 376.41 165.07 448 288 448s230.32-71.64 284.52-177.41a32.35 32.35 0 0 0 0-29.19zM288 400a144 144 0 1 1 144-144 143.93 143.93 0 0 1-144 144zm0-240a95.31 95.31 0 0 0-25.31 3.79 47.85 47.85 0 0 1-66.9 66.9A95.78 95.78 0 1 0 288 160z" /></svg></button></div>
  </article></div>
}

export default function Mines({ onInitialReady }) {
  const user = useAuth((state) => state.user)
  const setAuthModalOpen = useAuth((state) => state.setAuthModalOpen)
  const [createOpen, setCreateOpen] = useState(false)
  const [viewGame, setViewGame] = useState(null)
  const [joinRoom, setJoinRoom] = useState(null)
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [gameMode, setGameMode] = useState(() => {
    if (typeof window === 'undefined') return 'mm2'
    try { const saved = window.localStorage.getItem(MINES_GAME_STORAGE_KEY); return GAME_OPTIONS.some(([value]) => value === saved) ? saved : 'mm2' } catch { return 'mm2' }
  })
  const gameModeIndex = Math.max(0, GAME_OPTIONS.findIndex(([value]) => value === gameMode))

  const loadGames = useCallback(async () => {
    setLoading(true)
    try {
      const result = await apiRequest(`/api/mines?game=${encodeURIComponent(gameMode)}`, { cache: 'no-store' })
      setGames(Array.isArray(result?.games) ? result.games : [])
    } catch {
      setGames([])
    } finally {
      setLoading(false)
      onInitialReady?.()
    }
  }, [gameMode, onInitialReady])

  useEffect(() => { void loadGames() }, [loadGames])
  useEffect(() => {
    try { window.localStorage.setItem(MINES_GAME_STORAGE_KEY, gameMode) } catch { /* Storage may be unavailable. */ }
    window.dispatchEvent(new CustomEvent('ampduel:game-mode-changed', { detail: { storageKey: MINES_GAME_STORAGE_KEY, gameMode } }))
  }, [gameMode])
  useEffect(() => {
    const socket = connectSocket()
    const onCreated = (game) => { if (game?.game_mode === gameMode) setGames((current) => [game, ...current.filter((entry) => entry.id !== game.id)]) }
    const onUpdated = (game) => {
      setGames((current) => game?.status === 'open' || game?.status === 'active' ? current.map((entry) => entry.id === game.id ? game : entry) : current.filter((entry) => entry.id !== game?.id))
      setViewGame((current) => current?.id === game?.id ? game : current)
    }
    socket.on('mines:created', onCreated)
    socket.on('mines:updated', onUpdated)
    return () => { socket.off('mines:created', onCreated); socket.off('mines:updated', onUpdated) }
  }, [gameMode])

  const totalItems = useMemo(() => games.reduce((sum, game) => sum + gameItems(game).length, 0), [games])
  const totalValue = useMemo(() => games.reduce((sum, game) => sum + gameValue(game), 0), [games])
  const requireLogin = (action) => { if (!user) return setAuthModalOpen(true); action?.() }
  const handleCreated = (game) => { if (game) { setGames((current) => [game, ...current.filter((entry) => entry.id !== game.id)]); setViewGame(game) } }
  const currentProfileId = String(user?.profile_id || user?.id || '')

  return <div className="reference-mines flex-1 overflow-x-hidden bg-transparent">
    <style>{MINES_PAGE_STYLES}</style>
    <div className="relative z-10 flex w-full flex-col px-[18px] pb-32 pt-5">
      <div className="grid gap-2 md:grid-cols-3"><StatCard value={totalItems} label="Total Items" /><StatCard icon="/currency.svg" value={totalValue} label="Total Value" /><StatCard value={games.length} label="Active Games" /></div>
      <div className="mb-[10px] mt-3 flex flex-col justify-between gap-2 sm:flex-row">
        <div role="tablist" aria-label="Mines game" className="relative isolate grid h-[43px] w-full grid-cols-3 items-center justify-center overflow-hidden rounded-md bg-[hsl(229_17%_13%)] sm:w-auto"><span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 z-0 rounded-md bg-[#ff4fa3] shadow-sm transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)]" style={{ width: 'calc(100% / 3)', transform: `translateX(${gameModeIndex * 100}%)` }} />{GAME_OPTIONS.map(([value, label]) => { const active = gameMode === value; return <button key={value} type="button" role="tab" aria-selected={active} onClick={() => setGameMode(value)} className={`relative z-10 inline-flex items-center justify-center whitespace-nowrap rounded-sm px-5 py-1.5 text-sm font-medium transition-colors duration-200 ${active ? 'font-semibold text-black' : 'text-white/60 hover:text-white'}`}>{label}</button> })}</div>
        <div className="flex items-center justify-end gap-2"><button type="button" onClick={() => requireLogin(() => setCreateOpen(true))} className="inline-flex h-[43px] min-w-[98px] items-center justify-center rounded-md bg-[#ff4fa3] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-[#ff69b0]">Create</button><button type="button" onClick={() => requireLogin()} className="inline-flex h-[43px] min-w-[92px] items-center justify-center rounded-md bg-[hsl(233_16%_22%)] px-4 py-2 text-sm font-medium text-white">History</button></div>
      </div>
      <div className="mines-game-list">{loading ? <div className="mines-page-state">Loading games</div> : games.map((game) => <MinesGameRow key={game.id} game={game} currentProfileId={currentProfileId} onJoin={(room) => requireLogin(() => setJoinRoom(room))} onView={setViewGame} />)}</div>
    </div>
    {createOpen ? <MinesCreateModal gameMode={gameMode} onClose={() => setCreateOpen(false)} onCreate={handleCreated} /> : null}
    {joinRoom ? <CoinflipJoinModal room={joinRoom} gameMode={gameMode} gameType="mines" onClose={() => setJoinRoom(null)} onJoin={({ updatedRoom } = {}) => { if (updatedRoom) { setGames((current) => current.map((game) => game.id === updatedRoom.id ? updatedRoom : game)); setViewGame(updatedRoom) } setJoinRoom(null) }} /> : null}
    {viewGame ? <MinesViewModal game={viewGame} onClose={() => setViewGame(null)} onCanceled={(canceledGame) => { setGames((current) => current.filter((game) => game.id !== canceledGame.id)); setViewGame(null) }} /> : null}
  </div>
}

const MINES_PAGE_STYLES = `
  .reference-mines{min-height:100%;background-color:#111319;background-image:url('/cf-paw-pattern.svg');background-repeat:repeat;background-size:180px 180px;background-position:0 18px}
  .mines-game-list{display:flex;flex-direction:column;gap:8px}.mines-page-state{display:grid;min-height:180px;place-items:center;border:1px solid rgba(255,255,255,.05);border-radius:8px;color:#858c99;background:#171a22;font:500 13px/20px Poppins,sans-serif}
  .game-preview-shell{width:100%;container-type:inline-size}
  .coinflip-room-row{display:grid;min-height:105px;box-sizing:border-box;grid-template-columns:auto minmax(190px,1fr) 86px minmax(120px,145px) auto;align-items:center;justify-content:space-between;gap:clamp(10px,1.25cqw,20px);padding:12px 20px;overflow:visible;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:#191c24;box-shadow:0 8px 24px rgba(0,0,0,.14);font-family:Poppins,sans-serif}
  .game-preview-players{display:flex;width:auto;min-width:0;flex:0 0 auto;align-items:center;justify-content:center;gap:8px}
  .game-preview-player{position:relative;width:58px;height:58px;flex:0 0 58px}
  .game-preview-versus{margin:0;color:#717784;font-size:11px;font-weight:700;line-height:16.5px}
  .coinflip-row-avatar{position:relative;display:block;width:58px;height:58px;flex:0 0 58px;padding:0;overflow:hidden;border:2px solid #ff4fa3;border-radius:9999px;background:#111319;box-shadow:none}.coinflip-row-avatar--creator{border-color:#ff4fa3}.coinflip-row-avatar--joiner{border-color:#1f6fff}
  .coinflip-row-avatar-image{display:block;width:54px;height:54px;border-radius:9999px;object-fit:cover}
  .game-preview-waiting{display:flex;width:100%;height:100%;align-items:center;justify-content:center;border-radius:9999px;color:#f7fafc;background:#111319;font-size:18px;font-weight:400}
  .game-preview-items{display:flex;min-width:0;height:76px;flex:0 0 auto;align-items:center;justify-content:flex-start;gap:0;padding:4px 0 8px;overflow:visible;scrollbar-width:none}
  .game-preview-items::-webkit-scrollbar{display:none}.game-preview-item+.game-preview-item{margin-left:-18px}
  .game-preview-item{position:relative;display:flex;width:64px;height:64px;flex:0 0 64px;box-sizing:border-box;align-items:center;justify-content:center;overflow:visible;border:1px solid rgba(255,255,255,.05);border-radius:9999px;background:#12151c;cursor:default;box-shadow:none;filter:none;transition:none}
  .game-preview-item:hover{border-color:rgba(255,255,255,.05);background:#12151c;box-shadow:none;filter:none;transform:none}
  .game-preview-item-image{display:block;width:calc(100% - 6px);height:calc(100% - 6px);padding:0;border-radius:9999px;object-fit:cover;pointer-events:none}.game-preview-item-image--mm2{width:calc(100% - 10px);height:calc(100% - 10px)}
  .game-preview-item .adopt-me-traits{bottom:-5px;gap:1px}.game-preview-item .adopt-me-trait{width:13px;height:13px;flex-basis:13px;font-size:7px}
  .game-preview-tooltip{position:absolute;bottom:calc(100% + 8px);left:50%;z-index:40;width:max-content;max-width:180px;padding:5px 9px;overflow:hidden;border:1px solid rgba(255,255,255,.08);border-radius:5px;background:#191c24;color:#f4f5f8;box-shadow:none;font:600 11px/16px Poppins,sans-serif;opacity:0;visibility:hidden;transform:translate(-50%,3px);white-space:nowrap;text-overflow:ellipsis;pointer-events:none;transition:opacity .12s ease,transform .12s ease,visibility 0s linear .12s}
  .game-preview-item:hover .game-preview-tooltip{opacity:1;visibility:visible;transform:translate(-50%,0);transition-delay:0s}
  .game-preview-more{position:absolute;inset:0;z-index:3;display:grid;place-items:center;border-radius:50%;background:rgba(15,18,30,.84);color:#fff;backdrop-filter:blur(2px);font-size:13px;font-weight:600;pointer-events:none}
  .mines-game-result{position:relative;display:flex;width:86px;height:78px;flex:0 0 auto;align-items:center;justify-content:center}.mines-game-result-count{display:inline-flex;align-items:center;justify-content:center;gap:7px;color:#fff}.mines-game-result-count svg{display:block;width:30px;height:30px;color:#fff}.mines-game-result-count b{color:#fff;font-size:14px;font-weight:700;line-height:21px}
  .game-preview-value{width:145px;min-width:0;flex:0 0 auto;text-align:center}.game-preview-value-total{display:flex;align-items:center;justify-content:center;gap:6px;margin:0;color:#f4f5f8;font-size:15px;font-weight:700;line-height:22.5px}.game-preview-value-total svg{width:16px;height:16px;flex:0 0 16px}.game-preview-range{margin:4px 0 0;color:#777e8d;font-size:11px;font-weight:600;line-height:16.5px;white-space:nowrap}
  .game-preview-actions{display:flex;flex:0 0 auto;align-items:center;justify-content:center;gap:6px}.game-preview-join,.game-preview-view{display:inline-flex;height:42px;box-sizing:border-box;align-items:center;justify-content:center;border:0;border-radius:8px;box-shadow:none;font:700 13px Poppins,sans-serif;cursor:pointer;transition:opacity .15s ease,background-color .15s ease}.game-preview-join{min-width:40px;padding:0 20px;color:#111319;background:#ff4fa3}.game-preview-view{width:42px;min-width:42px;padding:0;color:#f1f2f5;background:#2b303c}.game-preview-view svg{width:16px;height:16px}.game-preview-join:hover,.game-preview-view:hover{opacity:.88}.game-preview-join:focus-visible,.game-preview-view:focus-visible{outline:2px solid #ff4fa3;outline-offset:2px}
  @container (min-width:560px) and (max-width:819px){.coinflip-room-row{grid-template-columns:auto 64px minmax(100px,1fr) auto;grid-template-areas:'players result value actions' 'items items items items';gap:12px 12px}.game-preview-players{grid-area:players}.game-preview-items{grid-area:items}.mines-game-result{grid-area:result;width:64px}.mines-game-result-count svg{width:26px;height:26px}.game-preview-value{grid-area:value}.game-preview-actions{grid-area:actions}}
  @container (max-width:559px){.coinflip-room-row{grid-template-columns:minmax(0,1fr) 52px auto;grid-template-areas:'players result actions' 'items items items' 'value value value';gap:13px 8px;padding:12px}.game-preview-players{grid-area:players;min-width:0;justify-content:flex-start}.game-preview-player{width:48px;height:48px;flex-basis:48px}.coinflip-row-avatar{width:48px;height:48px;flex-basis:48px}.coinflip-row-avatar-image{width:44px;height:44px}.game-preview-items{grid-area:items;overflow:visible;padding-bottom:2px}.mines-game-result{grid-area:result;width:52px;height:48px}.mines-game-result-count{gap:5px}.mines-game-result-count svg{width:22px;height:22px}.mines-game-result-count b{font-size:12px}.game-preview-value{grid-area:value;text-align:left}.game-preview-value-total{justify-content:flex-start}.game-preview-range{text-align:left}.game-preview-actions{grid-area:actions}.game-preview-item{width:48px;height:48px;flex-basis:48px}.game-preview-item .adopt-me-traits{bottom:-4px}.game-preview-item .adopt-me-trait{width:9px;height:9px;flex-basis:9px;font-size:6px}}
`
