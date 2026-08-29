import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AMP_MODAL_STYLES, CloseIcon, RobuxIcon } from './AmpInventoryModalUI'
import AdoptMeTraitBadges from './AdoptMeTraitBadges'

const DEFAULT_AVATAR = 'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-7E27815C7C5F72DA623094CFB3768D15-Png/420/420/AvatarHeadshot/Png/noFilter'
const PAGE_SIZE = 5
const CLOSE_DURATION_MS = 200

function itemQuantity(item) {
  const quantity = Number(item?.quantity ?? item?.qty ?? item?.count ?? 1)
  return Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1
}

function itemValue(items) {
  return (Array.isArray(items) ? items : []).reduce((total, item) => (
    total + (Math.max(0, Number(item?.value) || 0) * itemQuantity(item))
  ), 0)
}

function normalizeItem(item, index) {
  if (typeof item === 'string') return { id: `${item}-${index}`, image: item, name: 'Item' }
  return {
    ...item,
    id: item?.item_uuid || item?.id || item?.uuid || item?.image_url || item?.image || `item-${index}`,
    image: item?.image_url || item?.image || '',
    name: item?.name || 'Item',
  }
}

function formatNumber(value) {
  return Math.max(0, Number(value) || 0).toLocaleString('en-US', { maximumFractionDigits: 1 })
}

function isGemItem(item) {
  const name = String(item?.name || '').trim()
  const type = String(item?.type || item?.item_type || item?.game || '').trim()
  return /\bgems?\b/i.test(name) || /^(?:gems?|diamonds?)$/i.test(type)
}

function EyeIcon() {
  return <svg viewBox="0 0 576 512" fill="currentColor" aria-hidden="true"><path d="M572.52 241.4C518.29 135.59 410.93 64 288 64S57.68 135.64 3.48 241.41a32.35 32.35 0 0 0 0 29.19C57.71 376.41 165.07 448 288 448s230.32-71.64 284.52-177.41a32.35 32.35 0 0 0 0-29.19zM288 400a144 144 0 1 1 144-144 143.93 143.93 0 0 1-144 144zm0-240a95.31 95.31 0 0 0-25.31 3.79 47.85 47.85 0 0 1-66.9 66.9A95.78 95.78 0 1 0 288 160z" /></svg>
}

function HistoryIcon() {
  return <svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M504 256c0 136.967-111.033 248-248 248S8 392.967 8 256 119.033 8 256 8c69.742 0 132.886 28.79 177.999 75.146L467.314 49.83C482.434 34.71 508 45.418 508 66.802V192c0 13.255-10.745 24-24 24H358.802c-21.384 0-32.092-25.566-16.971-40.686l35.19-35.19C346.586 109.768 303.964 91 256 91c-91.047 0-165 73.953-165 165s73.953 165 165 165c84.146 0 153.972-62.881 164.244-144.252 1.659-13.144 13.633-22.456 26.777-20.797l35.715 4.508C495.85 262.111 505.579 274.78 504 256zM256 136c-13.255 0-24 10.745-24 24v110.627l-58.515 58.515c-9.373 9.373-9.373 24.569 0 33.941l16.971 16.971c9.373 9.373 24.569 9.373 33.941 0l71.544-71.544A24 24 0 0 0 303 291.539V160c0-13.255-10.745-24-24-24h-23z" /></svg>
}

function ArrowIcon({ direction }) {
  return <svg viewBox="0 0 448 512" fill="currentColor" aria-hidden="true" style={{ transform: direction === 'right' ? 'rotate(180deg)' : undefined }}><path d="M257.5 445.1 235.3 467.3c-9.4 9.4-24.6 9.4-33.9 0L7 273c-9.4-9.4-9.4-24.6 0-33.9L201.4 44.7c9.4-9.4 24.6-9.4 33.9 0l22.2 22.2c9.5 9.5 9.3 25-.4 34.3L136.6 216H424c13.3 0 24 10.7 24 24v32c0 13.3-10.7 24-24 24H136.6l120.5 114.8c9.8 9.3 10 24.8.4 34.3z" /></svg>
}

function HistoryPlayer({ game, creator, winner, onProfileOpen }) {
  const creatorSide = String(game?.creator_side || 'heads').toLowerCase()
  const side = creator ? creatorSide : String(game?.opponent_side || (creatorSide === 'heads' ? 'tails' : 'heads')).toLowerCase()
  const id = creator ? game?.creator_uuid : game?.opponent_uuid
  const username = creator ? game?.creator_username : game?.opponent_username
  const avatar = creator ? game?.creator_avatar_url || game?.creator_avatar : game?.opponent_avatar_url || game?.opponent_avatar
  const openProfile = () => {
    if (!id) return
    onProfileOpen?.({ id, profile_id: id, username, avatar, avatar_url: avatar, avatar_headshot_url: avatar })
  }

  return <button type="button" className={`history-player side-${side}${winner ? ' is-winner' : ' is-loser'}`} onClick={openProfile} disabled={!id} aria-label={id ? `Open ${username || 'player'} profile` : 'Player'}><img className="history-player-avatar" src={avatar || DEFAULT_AVATAR} alt="Player" draggable="false" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.src = DEFAULT_AVATAR }} /><img className="history-player-coin" src={side === 'tails' ? '/tails.webp' : '/heads.webp'} alt="" draggable="false" /></button>
}

function HistoryItem({ item, hiddenItemCount = 0 }) {
  return <div className="history-item" title={item.name} aria-label={item.name}>{item.image ? <img className={isGemItem(item) ? 'is-gem' : ''} src={item.image} alt="" draggable="false" /> : null}{hiddenItemCount === 0 ? <AdoptMeTraitBadges item={item} /> : null}{hiddenItemCount > 0 ? <span className="history-item-more">+{hiddenItemCount}</span> : null}</div>
}

function HistoryRow({ game, index, onView, onProfileOpen }) {
  const creatorSide = String(game?.creator_side || 'heads').toLowerCase()
  const opponentSide = String(game?.opponent_side || (creatorSide === 'heads' ? 'tails' : 'heads')).toLowerCase()
  const result = String(game?.result || '').toLowerCase()
  const creatorWon = game?.winner_uuid ? String(game.winner_uuid) === String(game.creator_uuid) : result === creatorSide
  const opponentWon = game?.winner_uuid ? String(game.winner_uuid) === String(game.opponent_uuid) : result === opponentSide
  const creatorItems = Array.isArray(game?.creator_items) ? game.creator_items : []
  const opponentItems = Array.isArray(game?.opponent_items) ? game.opponent_items : []
  const items = [...creatorItems, ...opponentItems]
    .map(normalizeItem)
    .sort((left, right) => Number(right?.value || 0) - Number(left?.value || 0))
  const visibleItems = items.slice(0, 4)
  const hiddenItemCount = Math.max(0, items.length - visibleItems.length)
  const total = itemValue(items) || Number(game?.total_value ?? game?.numericValue ?? game?.value ?? 0) || 0
  const wager = itemValue(creatorItems) || total / 2
  const low = Number(game?.join_requirements?.min ?? game?.joinRequirements?.min ?? wager * .8)
  const high = Number(game?.join_requirements?.max ?? game?.joinRequirements?.max ?? wager * 1.2)

  return <article className="history-game-card" style={{ '--history-row-index': index }}><div className="history-game-players"><HistoryPlayer game={game} creator winner={creatorWon} onProfileOpen={onProfileOpen} /><span className="history-game-vs">VS</span><HistoryPlayer game={game} winner={opponentWon} onProfileOpen={onProfileOpen} /></div><div className="history-game-items">{visibleItems.map((item, itemIndex) => <HistoryItem key={`${item.id}-${itemIndex}`} item={item} hiddenItemCount={itemIndex === visibleItems.length - 1 ? hiddenItemCount : 0} />)}</div><div className="history-game-result">{result === 'heads' || result === 'tails' ? <img src={result === 'tails' ? '/tails.webp' : '/heads.webp'} alt={`${result} won`} draggable="false" /> : null}</div><div className="history-game-value"><span className="history-game-total"><RobuxIcon /><span>{formatNumber(total)}</span></span><span className="history-game-range">({formatNumber(low)} -&nbsp; {formatNumber(high)})</span></div><div className="history-game-actions"><button type="button" className="history-view-button" aria-label="View game" onClick={() => onView?.(game)}><EyeIcon /></button></div></article>
}

export default function RecentCoinflipsModal({ isOpen, games = [], loading = false, isAuthenticated, onClose, onView, onProfileOpen }) {
  const [closing, setClosing] = useState(false)
  const [page, setPage] = useState(1)
  const dialogRef = useRef(null)
  const closeTimerRef = useRef(null)
  const totalPages = Math.max(1, Math.ceil(games.length / PAGE_SIZE))
  const visibleGames = useMemo(() => games.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [games, page])

  const closeWith = useCallback((callback) => {
    if (closing) return
    setClosing(true)
    closeTimerRef.current = window.setTimeout(() => callback?.(), CLOSE_DURATION_MS)
  }, [closing])
  const requestClose = useCallback(() => closeWith(onClose), [closeWith, onClose])
  const requestView = useCallback((game) => closeWith(() => onView?.(game)), [closeWith, onView])

  useEffect(() => { if (isOpen) { setClosing(false); setPage(1) } }, [isOpen])
  useEffect(() => { if (page > totalPages) setPage(totalPages) }, [page, totalPages])
  useEffect(() => () => { if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current) }, [])
  useEffect(() => {
    if (!isOpen) return undefined
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusTimer = window.setTimeout(() => dialogRef.current?.focus(), 0)
    const handleKeyDown = (event) => { if (event.key === 'Escape') { event.preventDefault(); requestClose() } }
    document.addEventListener('keydown', handleKeyDown)
    return () => { window.clearTimeout(focusTimer); document.removeEventListener('keydown', handleKeyDown); document.body.style.overflow = previousOverflow; previousFocus?.focus?.() }
  }, [isOpen, requestClose])

  if (!isOpen || typeof document === 'undefined') return null

  return createPortal(<div className={`amp-modal-overlay history-modal-overlay${closing ? ' is-closing' : ''}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose() }}><section ref={dialogRef} className={`amp-modal-dialog history-modal-dialog${closing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="coinflip-history-title" tabIndex={-1}><h2 className="amp-modal-header" id="coinflip-history-title">Coinflip History</h2><button type="button" className="amp-modal-close" aria-label="Close" onClick={requestClose}><CloseIcon /></button><div className="amp-modal-body history-modal-body">{loading ? <div className="history-state"><span className="amp-spinner" /><span className="history-loading-copy">Loading history</span></div> : games.length === 0 ? <div className="history-state history-empty"><span className="history-empty-icon"><HistoryIcon /></span><span>{isAuthenticated ? 'No coinflip history yet' : 'Log in to view your coinflip history'}</span></div> : <div className="history-list">{visibleGames.map((game, index) => <HistoryRow key={game.id || game.room_id} game={game} index={index} onView={requestView} onProfileOpen={onProfileOpen} />)}{totalPages > 1 ? <div className="history-pagination"><button type="button" aria-label="Previous history page" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ArrowIcon direction="left" /></button><span>Page {page}/{totalPages}</span><button type="button" aria-label="Next history page" disabled={page === totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}><ArrowIcon direction="right" /></button></div> : null}</div>}</div><style>{AMP_MODAL_STYLES}</style><style>{HISTORY_STYLES}</style></section></div>, document.body)
}

export const HISTORY_STYLES = `
  @keyframes historyRowIn { from { opacity: 0; transform: translateX(-100px) scale(.8); } to { opacity: 1; transform: translateX(0) scale(1); } }
  @keyframes historyModalOut { to { opacity: 0; transform: translateY(15px) scale(.95); } }
  .history-modal-dialog { max-width: 896px; outline: none; }
  .history-modal-dialog.is-closing { animation: historyModalOut .2s ease-in both; }
  .history-modal-overlay.is-closing { opacity: 0; transition: opacity .2s ease; }
  .history-modal-body { min-height: 400px; }
  .history-modal-body:has(.history-state) { height: 400px; flex: 0 0 400px; }
  .history-list { display: flex; flex-direction: column; gap: 8px; }
  .history-state { display: flex; min-height: 360px; align-items: center; justify-content: center; flex-direction: column; gap: 12px; color: #a2a7b2; font-size: 14px; font-weight: 600; }
  .history-empty { border: 1px solid rgba(255,255,255,.06); border-radius: 10px; background: #14171e; }
  .history-empty-icon { display: flex; width: 44px; height: 44px; align-items: center; justify-content: center; border-radius: 50%; color: #ff4fa3; background: rgba(255,79,163,.09); }
  .history-empty-icon svg { width: 17px; height: 17px; }
  .history-loading-copy { color: #858c99; font-size: 13px; font-weight: 400; }
  .history-game-card { display: flex; width: 100%; min-height: 96px; align-items: center; justify-content: space-between; gap: 14px; padding: 10px 14px; overflow: hidden; border: 1px solid rgba(255,255,255,.07); border-radius: 9px; background: #191c24; box-shadow: 0 8px 24px rgba(0,0,0,.14); animation: historyRowIn .45s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(var(--history-row-index) * 35ms); }
  .history-game-players { display: flex; flex: 0 0 auto; align-items: center; justify-content: center; gap: 12px; }
  .history-player { position: relative; display: block; width: 58px; height: 58px; padding: 0; border: 0; border-radius: 50%; background: transparent; cursor: pointer; }
  .history-player:disabled { cursor: default; }
  .history-player-avatar { display: block; width: 58px; height: 58px; border: 2px solid #ff4fa3; border-radius: 50%; background: #111319; object-fit: cover; }
  .history-player.side-tails .history-player-avatar { border-color: #1f6fff; }
  .history-player.is-loser { opacity: .42; filter: saturate(.65) brightness(.78); }
  .history-player-coin { position: absolute; top: -7px; right: -7px; width: 28px; height: 28px; object-fit: contain; }
  .history-game-vs { color: #717784; font-size: 11px; font-weight: 700; }
  .history-game-items { display: flex; width: 220px; min-width: 0; flex: 0 0 220px; align-items: center; justify-content: flex-start; gap: 0; padding: 4px 0 8px; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
  .history-game-items::-webkit-scrollbar { display: none; }
  .history-item + .history-item { margin-left: -18px; }
  .history-item { position: relative; display: flex; width: 64px; height: 64px; flex: 0 0 64px; align-items: center; justify-content: center; overflow: visible; border: 1px solid rgba(255,255,255,.05); border-radius: 50%; background: #12151c; transition: border-color .15s ease; }
  .history-item:hover { border-color: rgba(255,255,255,.12); }
  .history-item img { display: block; width: calc(100% - 6px); height: calc(100% - 6px); border-radius: 50%; object-fit: cover; pointer-events: none; }
  .history-item img.is-gem { width: 78%; height: 78%; object-fit: contain; }
  .history-item-more { position: absolute; inset: 0; z-index: 3; display: grid; place-items: center; border-radius: 50%; color: #fff; background: rgba(15,18,30,.84); backdrop-filter: blur(2px); font-size: 13px; font-weight: 600; pointer-events: none; }
  .history-game-result { position: relative; display: flex; width: 72px; min-width: 72px; height: 72px; flex: 0 0 72px; align-items: center; justify-content: center; }
  .history-game-result img { width: 58px; height: 58px; object-fit: contain; }
  .history-game-value { min-width: 150px; flex: 0 0 auto; text-align: center; }
  .history-game-total { display: flex; align-items: center; justify-content: center; gap: 6px; color: #f4f5f8; font-size: 15px; font-weight: 700; }
  .history-game-total svg { width: 1em; height: 1em; }
  .history-game-range { display: block; margin-top: 4px; color: #777e8d; font-size: 11px; font-weight: 600; white-space: nowrap; }
  .history-game-actions { display: flex; min-width: 42px; flex: 0 0 42px; align-items: center; justify-content: flex-start; }
  .history-view-button { display: flex; width: 42px; min-width: 42px; height: 42px; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 8px; color: #f1f2f5; background: #2b303c; cursor: pointer; }
  .history-view-button:hover { background: #343a47; } .history-view-button:active { background: #252a34; }
  .history-view-button svg { width: 1em; height: 1em; }
  .history-pagination { display: flex; align-items: center; justify-content: center; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.06); }
  .history-pagination button { display: flex; width: 34px; min-width: 34px; height: 34px; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 7px; color: #9aa0ac; background: #242833; cursor: pointer; }
  .history-pagination button:hover { color: #c1c6d0; background: #2b303b; } .history-pagination button:disabled { cursor: not-allowed; opacity: .4; }
  .history-pagination button svg { width: 10px; height: 10px; }
  .history-pagination > span { min-width: 92px; color: #a1a6b2; font-size: 12px; font-weight: 600; text-align: center; }
  @media (max-width: 959px) {
    .history-game-card { display: grid; grid-template-areas: 'players value actions' 'items items items'; grid-template-columns: minmax(0,1fr) minmax(0,1fr) auto; gap: 16px; padding: 12px 16px; }
    .history-game-players { grid-area: players; justify-content: flex-start; }
    .history-game-items { grid-area: items; width: 100%; flex-basis: 100%; }
    .history-game-result { display: none; }
    .history-game-value { grid-area: value; min-width: 0; text-align: left; }
    .history-game-total { justify-content: flex-start; }
    .history-game-actions { grid-area: actions; min-width: 42px; flex-basis: 42px; }
  }
  @media (max-width: 767px) {
    .history-modal-body { min-height: 0; }
    .history-game-card { grid-template-areas: 'players actions' 'value value' 'items items'; grid-template-columns: minmax(0,1fr) auto; }
    .history-item { width: 54px; height: 54px; flex-basis: 54px; }
  }
  @media (prefers-reduced-motion: reduce) { .history-game-card, .history-modal-dialog.is-closing { animation-duration: 1ms; animation-delay: 0ms; } }
`
