import { memo, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon, RobuxIcon } from './AmpInventoryModalUI'
import CoinflipFairnessModal from './CoinflipFairnessModal'
import { notifications } from './Notifications'
import { apiRequest } from '../lib/apiClient'
import { useAuth } from '../store/auth'
import { playMinesSound } from '../lib/soundEffects'
import AdoptMeTraitBadges from './AdoptMeTraitBadges'

const formatValue = (items) => (Array.isArray(items) ? items : [])
  .reduce((sum, item) => sum + Number(item?.value || 0), 0)
  .toLocaleString('en-US', { maximumFractionDigits: 2 })
const DEFAULT_AVATAR = 'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-7E27815C7C5F72DA623094CFB3768D15-Png/420/420/AvatarHeadshot/Png/noFilter'

const PlayerEntry = memo(function PlayerEntry({ player, index, gameMode, outcome }) {
  const items = Array.isArray(player.items) ? player.items : []
  const visibleItems = items.slice(0, 2)
  const hiddenItemCount = Math.max(0, items.length - visibleItems.length)
  const countItem = hiddenItemCount > 0 ? items[visibleItems.length] : null
  return <article className={`mines-view-player${outcome ? ` is-${outcome}` : ''}`} style={{ '--player-color': index === 0 ? '#ff4fa3' : '#1f6fff' }}>
    <span className="mines-view-avatar"><img src={player.avatar_url || DEFAULT_AVATAR} alt={player.username || 'Player'} /></span>
    <div className="mines-view-player-details"><strong>{player.username || 'Player'}</strong><div className="mines-view-player-items">{visibleItems.map((item, itemIndex) => <div className="mines-view-player-item" key={item.id || `${item.name}-${itemIndex}`}><span className="mines-view-player-item-tooltip" role="tooltip">{item.name || 'Item'}</span><img className={gameMode === 'mm2' ? 'is-mm2' : ''} src={item.image_url || item.image || '/currency.svg'} alt="" />{gameMode === 'adm' ? <AdoptMeTraitBadges item={item} /> : null}</div>)}{countItem ? <div className="mines-view-player-item" aria-label={`${hiddenItemCount} more items`}><img className={gameMode === 'mm2' ? 'is-mm2' : ''} src={countItem.image_url || countItem.image || '/currency.svg'} alt="" /><span className="mines-view-player-more">+{hiddenItemCount}</span></div> : null}</div></div>
    <div className="mines-view-player-value"><b><RobuxIcon />{formatValue(items)}</b></div>
  </article>
})

function ShieldIcon() {
  return <svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="m466.5 83.7-192-80a48.2 48.2 0 0 0-36.9 0l-192 80A48 48 0 0 0 16 128c0 198.5 114.5 335.7 221.5 380.3 11.8 4.9 25.1 4.9 36.9 0C360.1 472.6 496 349.3 496 128c0-19.4-11.7-36.9-29.5-44.3zM256.1 446.3 256 65.3l175.9 73.3c-3.3 151.4-82.1 261.1-175.8 307.7z" /></svg>
}

function relativeGameTime(game) {
  const timestamp = new Date(game?.created_at || Date.now()).getTime()
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 60) return 'Created less than a minute ago'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `Created ${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  return `Created ${hours} hour${hours === 1 ? '' : 's'} ago`
}

function minesSnapshotKey(game) {
  if (!game) return ''
  return [
    game.id,
    game.status,
    game.updated_at,
    game.current_turn_uuid,
    (Array.isArray(game.revealed_cells) ? game.revealed_cells : []).join(','),
  ].join('|')
}

const TurnStrip = memo(function TurnStrip({ expiresAt, turnPlayer, isCurrentUser }) {
  const [clock, setClock] = useState(Date.now())
  useEffect(() => {
    setClock(Date.now())
    const timer = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [expiresAt])

  const remainingMilliseconds = Math.max(0, new Date(expiresAt || 0).getTime() - clock)
  const remainingSeconds = Math.max(0, Math.ceil(remainingMilliseconds / 1000))
  const turnProgress = Math.min(100, Math.max(0, (remainingMilliseconds / 20_000) * 100))
  return <div className="mines-view-turn-strip">
    <div className="mines-view-turn-player"><img src={turnPlayer?.avatar_url || turnPlayer?.avatar || DEFAULT_AVATAR} alt="" /><span>{isCurrentUser ? 'Your turn' : turnPlayer?.username || 'Player'}</span></div>
    <div className="mines-view-turn-track" aria-hidden="true"><span style={{ width: `${turnProgress}%` }} /></div>
    <output className="mines-view-turn-seconds" aria-label={`${remainingSeconds} seconds remaining`}>{remainingSeconds}s</output>
  </div>
})

export default function MinesViewModal({ game, onClose, onCanceled = () => {} }) {
  const user = useAuth((state) => state.user)
  const [fairnessOpen, setFairnessOpen] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [playingCell, setPlayingCell] = useState(null)
  const [liveGame, setLiveGame] = useState(game)
  const previousGameRef = useRef(game)
  useEffect(() => {
    setLiveGame((current) => minesSnapshotKey(current) === minesSnapshotKey(game) ? current : game)
  }, [game])
  useEffect(() => {
    const handleKeyDown = (event) => { if (event.key === 'Escape' && !fairnessOpen) onClose() }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [fairnessOpen, onClose])
  useEffect(() => {
    const previousGame = previousGameRef.current
    previousGameRef.current = liveGame
    if (!previousGame || !liveGame || String(previousGame.id || '') !== String(liveGame.id || '')) return

    const previousRevealed = new Set((Array.isArray(previousGame.revealed_cells) ? previousGame.revealed_cells : []).map(Number))
    const newlyRevealed = (Array.isArray(liveGame.revealed_cells) ? liveGame.revealed_cells : [])
      .map(Number)
      .filter((cell) => !previousRevealed.has(cell))
    if (newlyRevealed.length) {
      const mines = new Set((Array.isArray(liveGame.mine_positions) ? liveGame.mine_positions : []).map(Number))
      playMinesSound(newlyRevealed.some((cell) => mines.has(cell)) ? 'mine' : 'safe')
    }

    const profileId = String(user?.profile_id || user?.id || '')
    if (profileId && String(previousGame.current_turn_uuid || '') !== String(liveGame.current_turn_uuid || '') && String(liveGame.current_turn_uuid || '') === profileId) {
      playMinesSound('turn')
    }
  }, [liveGame, user?.id, user?.profile_id])
  useEffect(() => {
    if (String(liveGame?.status) !== 'active' || !liveGame?.turn_expires_at || !liveGame?.id) return undefined
    let refreshing = false
    let canceled = false
    const refreshExpiredTurn = async () => {
      if (refreshing || Date.now() < new Date(liveGame.turn_expires_at).getTime()) return
      refreshing = true
      try {
        const result = await apiRequest(`/api/mines?game=${encodeURIComponent(liveGame.game_mode || 'mm2')}`, { cache: 'no-store' })
        const refreshedGame = (Array.isArray(result?.games) ? result.games : []).find((entry) => entry.id === liveGame.id)
        if (!canceled && refreshedGame) {
          setLiveGame((current) => minesSnapshotKey(current) === minesSnapshotKey(refreshedGame) ? current : refreshedGame)
        }
      } catch {
        // Keep retrying while the expired game remains visible. The server owns
        // the move, so a transient network failure cannot alter the result.
      } finally {
        refreshing = false
      }
    }
    const timer = window.setInterval(() => { void refreshExpiredTurn() }, 1500)
    void refreshExpiredTurn()
    return () => { canceled = true; window.clearInterval(timer) }
  }, [liveGame?.game_mode, liveGame?.id, liveGame?.status, liveGame?.turn_expires_at])

  if (!game || typeof document === 'undefined') return null
  const displayedGame = liveGame || game
  const gridSize = Math.min(8, Math.max(5, Number(displayedGame.grid_size) || 5))
  const participants = Array.isArray(displayedGame.participants) && displayedGame.participants.length
    ? displayedGame.participants
    : [{ uuid: displayedGame.creator_uuid, username: displayedGame.creator_username, avatar_url: displayedGame.creator_avatar_url, items: displayedGame.creator_items }]
  const currentProfileId = String(user?.profile_id || user?.id || '')
  const canCancel = Boolean(
    currentProfileId &&
    currentProfileId === String(displayedGame.creator_uuid || '') &&
    String(displayedGame.status || 'open') === 'open' &&
    participants.length === 1,
  )
  const completed = ['completed', 'resolved'].includes(String(displayedGame.status || '').toLowerCase())
  const active = String(displayedGame.status || '').toLowerCase() === 'active'
  const currentTurnUuid = String(displayedGame.current_turn_uuid || '')
  const canPlay = Boolean(active && currentProfileId && currentProfileId === currentTurnUuid && playingCell === null)
  const revealedCells = new Set((Array.isArray(displayedGame.revealed_cells) ? displayedGame.revealed_cells : []).map(Number))
  const minePositions = new Set((completed && Array.isArray(displayedGame.mine_positions) ? displayedGame.mine_positions : []).map(Number))
  const turnPlayer = participants.find((participant) => String(participant?.uuid || '') === currentTurnUuid)

  const playCell = async (cell) => {
    if (!canPlay || revealedCells.has(cell)) return
    playMinesSound('select', { userGesture: true })
    setPlayingCell(cell)
    try {
      const result = await apiRequest('/api/mines/play', {
        method: 'POST',
        body: JSON.stringify({ roomId: displayedGame.id, cell }),
      })
      if (result?.data) {
        setLiveGame((current) => minesSnapshotKey(current) === minesSnapshotKey(result.data) ? current : result.data)
      }
    } catch (error) {
      notifications.error(error?.message || 'Unable to play this Mines turn.')
    } finally {
      setPlayingCell(null)
    }
  }

  const cancelMines = async () => {
    if (!canCancel || canceling) return
    setCanceling(true)
    try {
      const result = await apiRequest('/api/mines/cancel', {
        method: 'POST',
        body: JSON.stringify({ roomId: displayedGame.id }),
      })
      notifications.success('Mines game canceled.')
      onCanceled(result?.data || { ...displayedGame, status: 'canceled' })
    } catch (error) {
      notifications.error(error?.message || 'Unable to cancel Mines game.')
    } finally {
      setCanceling(false)
    }
  }

  return createPortal(<div className="mines-view-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="mines-view-modal" role="dialog" aria-modal="true" aria-label="Mines game">
      <button type="button" className="mines-view-close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
      <aside className="mines-view-sidebar">
        <div className="mines-view-player-list">{participants.map((player, index) => <PlayerEntry key={player?.uuid || `player-${index}`} player={player} index={index} gameMode={displayedGame.game_mode} outcome={completed ? (String(player?.uuid || '') === String(displayedGame.winner_uuid || '') ? 'winner' : 'loser') : ''} />)}</div>
      </aside>
      <main className="mines-view-board-box">
        <div className="mines-view-board-content">
          <div className="mines-view-board-stack">
            <div className="mines-view-grid" style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` }}>{Array.from({ length: gridSize * gridSize }, (_, index) => {
              const revealed = completed || revealedCells.has(index)
              const mine = completed && minePositions.has(index)
              const pending = playingCell === index
              const cellImage = mine ? '/mines-hit.png' : revealed ? '/mines-safe.png' : '/mines-unrevealed.png'
              return <button type="button" disabled={!canPlay || revealed} key={index} className={`mines-view-cell${canPlay && !revealed ? ' is-playable' : ''}${revealed ? ' is-revealed' : ''}${mine ? ' is-mine' : ''}${pending ? ' is-pending' : ''}`} aria-label={pending ? 'Revealing cell' : mine ? 'Mine' : revealed ? 'Safe cell' : 'Unrevealed cell'} onClick={() => { void playCell(index) }}><img src={cellImage} alt="" draggable={false} /></button>
            })}</div>
            {active ? <TurnStrip expiresAt={displayedGame.turn_expires_at} turnPlayer={turnPlayer} isCurrentUser={currentTurnUuid === currentProfileId} /> : null}
          </div>
        </div>
      </main>
      <div className="mines-view-footer-shell">
        <div className="mines-view-divider" />
        <footer className="mines-view-footer">
          <button type="button" className="mines-view-fairness" onClick={() => setFairnessOpen(true)}><ShieldIcon />Fairness</button>
          <p>{completed ? `${participants.find((participant) => String(participant?.uuid || '') === String(displayedGame.winner_uuid || ''))?.username || 'Player'} won` : relativeGameTime(displayedGame)}</p>
          {canCancel ? <button type="button" className="mines-view-cancel" disabled={canceling} onClick={() => { void cancelMines() }}>{canceling ? 'Canceling' : 'Cancel'}</button> : null}
        </footer>
      </div>
      <style>{MINES_VIEW_STYLES}</style>
    </section>
    {fairnessOpen ? <CoinflipFairnessModal gameLabel="Mines" coinflipId={displayedGame.id || 'N/A'} hashedServerSeed={displayedGame.server_seed_hash || 'N/A'} serverSeed={completed ? displayedGame.server_seed || 'N/A' : 'N/A'} clientSeed={completed ? displayedGame.client_seed || 'N/A' : 'N/A'} onClose={() => setFairnessOpen(false)} /> : null}
  </div>, document.body)
}

const MINES_VIEW_STYLES = `
  @keyframes minesViewIn { from { opacity:0; transform:scale(.985); } to { opacity:1; transform:scale(1); } }
  @keyframes minesCellPending { to { transform:rotate(360deg); } }
  .mines-view-overlay { position:fixed; inset:0; z-index:10000; display:flex; align-items:center; justify-content:center; padding:24px; box-sizing:border-box; background:rgba(4,5,8,.82); font-family:Poppins,sans-serif; }
  .mines-view-modal { position:relative; display:grid; width:calc(100% - 48px); max-width:900px; height:min(600px,calc(100dvh - 48px)); min-height:0; grid-template-columns:360px minmax(0,1fr); grid-template-rows:minmax(0,1fr) 51px; overflow:hidden; border:1px solid rgba(255,255,255,.06); border-radius:11px; color:#f4f5f8; background:#171a22; box-shadow:0 26px 80px rgba(0,0,0,.55); animation:minesViewIn .14s ease-out both; will-change:transform,opacity; }
  .mines-view-modal * { box-sizing:border-box; }
  .mines-view-close { position:absolute; top:12px; right:12px; z-index:5; display:grid; width:30px; height:30px; place-items:center; padding:0; border:0; border-radius:6px; color:#8e94a2; background:#222631; cursor:pointer; }
  .mines-view-close:hover { color:#b3b8c3; background:#282c37; }
  .mines-view-close svg { width:14px; height:14px; }
  .mines-view-sidebar { display:flex; min-width:0; min-height:0; flex-direction:column; border-right:1px solid rgba(255,255,255,.06); background:#171a22; }
  .mines-view-player-list { display:flex; min-height:0; flex-direction:column; padding:56px 12px 12px; overflow-y:auto; border:0; border-radius:8px; background:transparent; box-shadow:none; scrollbar-width:thin; scrollbar-color:#ff4fa3 transparent; }
  .mines-view-player-list::-webkit-scrollbar { width:4px; }.mines-view-player-list::-webkit-scrollbar-thumb { border-radius:999px; background:#ff4fa3; }
  .mines-view-player { position:relative; display:grid; min-height:78px; grid-template-columns:62px minmax(0,1fr) auto; align-items:center; gap:13px; margin-bottom:13px; padding:12px 14px; border:0; border-radius:8px; background:#20232d; }
  .mines-view-player.is-loser { opacity:.42; filter:saturate(.65) brightness(.78); }
  .mines-view-player:last-child { margin-bottom:0; }
  .mines-view-avatar { display:flex; width:54px; height:54px; flex:0 0 54px; align-items:center; justify-content:center; overflow:hidden; border:3px solid var(--player-color); border-radius:50%; color:#777e8d; background:#111319; font-size:14px; font-weight:700; }
  .mines-view-avatar img { width:100%; height:100%; object-fit:cover; }
  .mines-view-player-details { display:flex; min-width:0; flex:1; flex-direction:column; gap:5px; }
  .mines-view-player-details strong { overflow:hidden; color:#eef0f3; font-size:12px; font-weight:600; line-height:18px; text-overflow:ellipsis; white-space:nowrap; }
  .mines-view-player-items { display:flex; min-height:46px; align-items:center; gap:0; overflow:visible; }
  .mines-view-player-item + .mines-view-player-item { margin-left:-12px; }
  .mines-view-player-item { position:relative; display:flex; width:46px; height:46px; flex:0 0 46px; box-sizing:border-box; align-items:center; justify-content:center; overflow:visible; border:1px solid rgba(255,255,255,.05); border-radius:9999px; color:#fff; background:#12151c; box-shadow:none; }
  .mines-view-player-item img { display:block; width:40px; height:40px; padding:0; border-radius:9999px; background:transparent; object-fit:cover; pointer-events:none; }
  .mines-view-player-item img.is-mm2 { width:36px; height:36px; object-fit:contain; }
  .mines-view-player-item .adopt-me-traits { bottom:-4px; gap:1px; }
  .mines-view-player-item .adopt-me-trait { width:10px; height:10px; flex-basis:10px; font-size:6px; }
  .mines-view-player-more { position:absolute; inset:0; z-index:3; display:grid; place-items:center; border-radius:50%; background:rgba(15,18,30,.84); color:#fff; backdrop-filter:blur(2px); font-size:11px; font-weight:600; line-height:16.5px; pointer-events:none; }
  .mines-view-player-item-tooltip { position:absolute; bottom:calc(100% + 7px); left:50%; z-index:20; display:block; width:max-content; max-width:150px; padding:4px 8px; overflow:hidden; border:1px solid rgba(255,255,255,.08); border-radius:5px; color:#f4f5f8; background:#191c24; font:600 10px/15px Poppins,sans-serif; opacity:0; visibility:hidden; transform:translate(-50%,3px); white-space:nowrap; text-overflow:ellipsis; pointer-events:none; transition:opacity .12s ease,transform .12s ease,visibility 0s linear .12s; }
  .mines-view-player-item:hover .mines-view-player-item-tooltip { opacity:1; visibility:visible; transform:translate(-50%,0); transition-delay:0s; }
  .mines-view-player-value { display:flex; flex:0 0 auto; align-items:flex-end; flex-direction:column; gap:3px; }
  .mines-view-player-value b { display:flex; align-items:center; gap:4px; color:#f0f2f5; font-size:13px; font-weight:700; }.mines-view-player-value b svg { width:11px; height:11px; color:#ff4fa3; }
  .mines-view-board-box { display:flex; min-width:0; min-height:0; flex-direction:column; padding:56px 24px 8px; box-sizing:border-box; background:#171a22; }
  .mines-view-board-content { display:flex; min-width:0; min-height:0; flex:1; align-items:flex-start; justify-content:center; padding:0; }
  .mines-view-board-stack { display:flex; width:100%; max-width:440px; min-width:0; flex-direction:column; gap:8px; }
  .mines-view-grid { display:grid; width:100%; max-width:440px; gap:8px; margin:0 auto; }
  .mines-view-cell { display:flex; width:100%; min-width:0; min-height:0; aspect-ratio:1/1; align-items:center; justify-content:center; padding:0; border:0; border-radius:6px; background:#20232d; cursor:default; transition:background-color .15s ease,transform .15s ease,opacity .15s ease; }
  .mines-view-cell img { display:block; width:64%; height:64%; object-fit:contain; pointer-events:none; user-select:none; }
  .mines-view-cell.is-playable { cursor:pointer; }
  .mines-view-cell.is-playable:hover { background:#2a2e39; transform:translateY(-1px); }
  .mines-view-cell.is-pending { position:relative; background:#2a2e39; }
  .mines-view-cell.is-pending img { opacity:.28; }
  .mines-view-cell.is-pending::after { position:absolute; width:20px; height:20px; border:2px solid rgba(255,255,255,.22); border-top-color:#ff4fa3; border-radius:50%; content:''; animation:minesCellPending .55s linear infinite; }
  .mines-view-cell.is-revealed { background:#20232d; opacity:1; }
  .mines-view-cell.is-mine { background:#20232d; opacity:1; }
  .mines-view-cell.is-mine img { width:70%; height:70%; }
  .mines-view-turn-strip { display:grid; width:100%; height:37px; min-width:0; grid-template-columns:minmax(112px,auto) minmax(60px,1fr) 34px; align-items:center; gap:10px; }
  .mines-view-turn-player { display:flex; min-width:0; align-items:center; gap:7px; }
  .mines-view-turn-player img { width:26px; height:26px; flex:0 0 26px; border-radius:50%; object-fit:cover; }
  .mines-view-turn-player span { overflow:hidden; color:#d9dce3; font-size:11px; font-weight:600; line-height:16px; text-overflow:ellipsis; white-space:nowrap; }
  .mines-view-turn-track { position:relative; width:100%; height:5px; overflow:hidden; border:0; border-radius:999px; background:#2b2f3a; }
  .mines-view-turn-track span { position:absolute; inset:0 auto 0 0; display:block; height:100%; border-radius:inherit; background:#ff4fa3; transition:width 1s linear; }
  .mines-view-turn-seconds { color:#f4f5f8; font-size:11px; font-weight:700; line-height:16px; text-align:right; }
  .mines-view-footer-shell { grid-column:1/-1; min-width:0; padding:0 16px; background:#171a22; }
  .mines-view-divider { width:100%; height:1px; flex:0 0 1px; background:rgba(255,255,255,.16); opacity:.6; }
  .mines-view-footer { position:relative; display:flex; width:100%; min-height:50px; flex:0 0 50px; align-items:center; justify-content:center; gap:8px; }
  .mines-view-footer p { margin:0; color:#8b919e; font-size:12px; font-weight:600; line-height:18px; }
  .mines-view-fairness { position:absolute; top:5px; left:0; display:flex; min-width:40px; height:40px; align-items:center; justify-content:center; gap:8px; padding:0 16px; border:0; border-radius:7px; color:#a8aeb9; background:#20242e; font:600 12px/14.4px Poppins,sans-serif; cursor:pointer; }
  .mines-view-fairness:hover { color:#c1c6d0; background:#282c37; }
  .mines-view-fairness svg { width:13px; height:13px; }
  .mines-view-cancel { position:absolute; top:5px; right:0; min-width:96px; height:40px; padding:0 16px; border:0; border-radius:8px; color:#fff; background:#e34f5f; font:700 13px/19.5px Poppins,sans-serif; cursor:pointer; }
  .mines-view-cancel:hover { background:#ef6271; }.mines-view-cancel:disabled { cursor:not-allowed; opacity:.65; }
  @media (max-width:760px) { .mines-view-overlay{padding:0}.mines-view-modal{width:100%;height:100dvh;grid-template-columns:1fr;grid-template-rows:210px minmax(0,1fr) 51px;border-radius:0}.mines-view-sidebar{border-right:0;border-bottom:1px solid rgba(255,255,255,.06)}.mines-view-player-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));padding-top:56px}.mines-view-board-box{padding:14px}.mines-view-board-stack{max-width:min(400px,54vh)}.mines-view-grid{gap:5px;max-width:none}.mines-view-turn-strip{grid-template-columns:minmax(96px,auto) minmax(48px,1fr) 32px;gap:7px}.mines-view-footer{justify-content:space-between}.mines-view-fairness,.mines-view-cancel{position:static}.mines-view-footer p{display:none}}
`
