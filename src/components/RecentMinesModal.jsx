import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AMP_MODAL_STYLES, CloseIcon, RobuxIcon } from './AmpInventoryModalUI'
import AdoptMeTraitBadges from './AdoptMeTraitBadges'
import { MinesIcon } from './icons'
import { HISTORY_STYLES } from './RecentCoinflipsModal'

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

function HistoryPlayer({ player, index, winner, onProfileOpen }) {
  const id = player?.uuid || player?.profile_id || player?.id
  const username = player?.username || player?.name
  const avatar = player?.avatar_url || player?.avatar || player?.avatar_headshot_url
  const openProfile = () => {
    if (!id) return
    onProfileOpen?.({ ...player, id, profile_id: id, username, avatar, avatar_url: avatar, avatar_headshot_url: avatar })
  }

  return <button type="button" className={`history-player${index === 1 ? ' side-tails' : ''}${winner ? ' is-winner' : ' is-loser'}`} onClick={openProfile} disabled={!id} aria-label={id ? `Open ${username || 'player'} profile` : 'Player'}><img className="history-player-avatar" src={avatar || DEFAULT_AVATAR} alt="Player" draggable="false" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.src = DEFAULT_AVATAR }} /></button>
}

function HistoryItem({ item, hiddenItemCount = 0 }) {
  return <div className="history-item" title={item.name} aria-label={item.name}>{item.image ? <img className={isGemItem(item) ? 'is-gem' : ''} src={item.image} alt="" draggable="false" /> : null}{hiddenItemCount === 0 ? <AdoptMeTraitBadges item={item} /> : null}{hiddenItemCount > 0 ? <span className="history-item-more">+{hiddenItemCount}</span> : null}</div>
}

function HistoryRow({ game, index, onView, onProfileOpen }) {
  const participants = Array.isArray(game?.participants) && game.participants.length
    ? game.participants
    : [{ uuid: game?.creator_uuid, username: game?.creator_username, avatar_url: game?.creator_avatar_url, items: game?.creator_items }]
  const players = participants.slice(0, 2)
  const items = participants.flatMap((participant) => Array.isArray(participant?.items) ? participant.items : [])
    .map(normalizeItem)
    .sort((left, right) => Number(right?.value || 0) - Number(left?.value || 0))
  const visibleItems = items.slice(0, 4)
  const hiddenItemCount = Math.max(0, items.length - visibleItems.length)
  const total = itemValue(items)
  const creatorItems = Array.isArray(participants[0]?.items) ? participants[0].items : game?.creator_items
  const wager = itemValue(creatorItems) || total / 2
  const low = wager * .9
  const high = wager * 1.1

  return <article className="history-game-card" style={{ '--history-row-index': index }}><div className="history-game-players"><HistoryPlayer player={players[0]} index={0} winner={String(players[0]?.uuid || '') === String(game?.winner_uuid || '')} onProfileOpen={onProfileOpen} /><span className="history-game-vs">VS</span><HistoryPlayer player={players[1]} index={1} winner={String(players[1]?.uuid || '') === String(game?.winner_uuid || '')} onProfileOpen={onProfileOpen} /></div><div className="history-game-items">{visibleItems.map((item, itemIndex) => <HistoryItem key={`${item.id}-${itemIndex}`} item={item} hiddenItemCount={itemIndex === visibleItems.length - 1 ? hiddenItemCount : 0} />)}</div><div className="history-game-result mines-history-result" aria-label={`${game?.mine_count || 1} mines`}><MinesIcon /><b>{game?.mine_count || 1}</b></div><div className="history-game-value"><span className="history-game-total"><RobuxIcon /><span>{formatNumber(total)}</span></span><span className="history-game-range">({formatNumber(low)} -&nbsp; {formatNumber(high)})</span></div><div className="history-game-actions"><button type="button" className="history-view-button" aria-label="View game" onClick={() => onView?.(game)}><EyeIcon /></button></div></article>
}

export default function RecentMinesModal({ isOpen, games = [], loading = false, isAuthenticated, onClose, onView, onProfileOpen }) {
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

  return createPortal(<div className={`amp-modal-overlay history-modal-overlay${closing ? ' is-closing' : ''}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose() }}><section ref={dialogRef} className={`amp-modal-dialog history-modal-dialog${closing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="mines-history-title" tabIndex={-1}><h2 className="amp-modal-header" id="mines-history-title">Mines History</h2><button type="button" className="amp-modal-close" aria-label="Close" onClick={requestClose}><CloseIcon /></button><div className="amp-modal-body history-modal-body">{loading ? <div className="history-state"><span className="amp-spinner" /><span className="history-loading-copy">Loading history</span></div> : games.length === 0 ? <div className="history-state history-empty"><span className="history-empty-icon"><HistoryIcon /></span><span>{isAuthenticated ? 'No mines history yet' : 'Log in to view your mines history'}</span></div> : <div className="history-list">{visibleGames.map((game, index) => <HistoryRow key={game.id || game.room_id} game={game} index={index} onView={requestView} onProfileOpen={onProfileOpen} />)}{totalPages > 1 ? <div className="history-pagination"><button type="button" aria-label="Previous history page" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ArrowIcon direction="left" /></button><span>Page {page}/{totalPages}</span><button type="button" aria-label="Next history page" disabled={page === totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}><ArrowIcon direction="right" /></button></div> : null}</div>}</div><style>{AMP_MODAL_STYLES}</style><style>{HISTORY_STYLES}</style><style>{`.mines-history-result { gap: 7px; color: #fff; } .mines-history-result svg { width: 30px; height: 30px; } .mines-history-result b { font-size: 14px; font-weight: 700; }`}</style></section></div>, document.body)
}
