import { useEffect, useMemo, useRef, useState } from 'react'
import { get } from '../lib/api'
import MiniProfileModal from './MiniProfileModal'
import { formatPriceValue } from '../Utils/FormatPriceValues'

const TABS = [
  { id: 'profit', label: 'Top Profit', heading: 'Profit' },
  { id: 'played', label: 'Top Wager', heading: 'Wager' },
  { id: 'least-profit', label: 'Least Profit', heading: 'Profit' },
]
const GAMES = [
  { id: 'all', label: 'All Games' },
  { id: 'mm2', label: 'MM2' },
  { id: 'adm', label: 'AMP' },
  { id: 'ps99', label: 'PS99' },
]

function ChevronDown() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
}
function CloseIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
}
function TapIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 14a8 8 0 0 1-8 8" /><path d="M18 11v-1a2 2 0 0 0-4 0" /><path d="M14 10V9a2 2 0 0 0-4 0v1" /><path d="M10 9.5V4a2 2 0 0 0-4 0v10" /><path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" /></svg>
}
const formatFull = (value) => Math.round(Number(value) || 0).toLocaleString('en-US')

export default function LeaderboardModal({ isOpen, onClose }) {
  const [isMounted, setIsMounted] = useState(isOpen)
  const [activeTab, setActiveTab] = useState('profit')
  const [activeGame, setActiveGame] = useState('all')
  const [gameMenuOpen, setGameMenuOpen] = useState(false)
  const [rowsByQuery, setRowsByQuery] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const gameMenuRef = useRef(null)
  const dialogRef = useRef(null)
  const queryKey = `${activeTab}:${activeGame}`
  const activeConfig = useMemo(() => TABS.find((tab) => tab.id === activeTab) || TABS[0], [activeTab])
  const activeGameConfig = useMemo(() => GAMES.find((game) => game.id === activeGame) || GAMES[0], [activeGame])
  const rows = rowsByQuery[queryKey] || []

  useEffect(() => {
    if (isOpen) {
      setIsMounted(true)
      return undefined
    }
    if (!isMounted) return undefined
    const timer = window.setTimeout(() => setIsMounted(false), 200)
    return () => window.clearTimeout(timer)
  }, [isMounted, isOpen])

  useEffect(() => {
    if (!isOpen) return undefined
    const previouslyFocused = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus())
    return () => {
      window.cancelAnimationFrame(frame)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus?.()
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (gameMenuOpen) setGameMenuOpen(false)
        else onClose?.()
      }
    }
    const handlePointerDown = (event) => {
      if (!gameMenuRef.current?.contains(event.target)) setGameMenuOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [gameMenuOpen, isOpen, onClose])

  useEffect(() => {
    if (rowsByQuery[queryKey]) return undefined
    const controller = new AbortController()
    setLoading(true)
    setError('')
    get(`/leaderboard?sort=${encodeURIComponent(activeTab)}&game=${encodeURIComponent(activeGame)}`)
      .then((result) => {
        if (!controller.signal.aborted) setRowsByQuery((current) => ({ ...current, [queryKey]: result?.leaders || [] }))
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(requestError?.message || 'Unable to load the leaderboard.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [activeGame, activeTab, queryKey, rowsByQuery])

  if (!isMounted) return null

  const modalState = isOpen ? 'open' : 'closed'

  return (
    <div className="referenceLeaderboardOverlay" data-state={modalState} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && isOpen && onClose?.()}>
      <div ref={dialogRef} className="referenceLeaderboardModal" data-state={modalState} role="dialog" aria-modal="true" aria-labelledby="leaderboard-title" tabIndex={-1}>
        <div className="referenceLeaderboardHeading"><h2 id="leaderboard-title">Leaderboard</h2></div>
        <div>
          <div className="referenceLeaderboardTabs" role="tablist" aria-label="Leaderboard category">
            {TABS.map((tab) => {
              const active = activeTab === tab.id
              return <button key={tab.id} type="button" role="tab" aria-selected={active} data-state={active ? 'active' : 'inactive'} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>
            })}
          </div>
          <div className="referenceLeaderboardFilterRow">
            <div className="referenceLeaderboardSelect" ref={gameMenuRef}>
              <button type="button" role="combobox" aria-label="Filter leaderboard by game" aria-expanded={gameMenuOpen} data-state={gameMenuOpen ? 'open' : 'closed'} onClick={() => setGameMenuOpen((open) => !open)}><span>{activeGameConfig.label}</span><ChevronDown /></button>
              {gameMenuOpen ? <div className="referenceLeaderboardSelectMenu" role="listbox" aria-label="Games">
                {GAMES.map((game) => <button key={game.id} type="button" role="option" aria-selected={activeGame === game.id} data-state={activeGame === game.id ? 'checked' : 'unchecked'} onClick={() => { setActiveGame(game.id); setGameMenuOpen(false) }}>{game.label}{activeGame === game.id ? <span aria-hidden="true">✓</span> : null}</button>)}
              </div> : null}
            </div>
          </div>
          <blockquote className="referenceLeaderboardMobileNote">Long pieces of information are shortened due to screen size. Tap <TapIcon /> value to see it in full, tap away to hide.</blockquote>
          <div className="referenceLeaderboardPanel" role="tabpanel" tabIndex={0}>
            <div className="referenceLeaderboardTableWrap">
              <div className="referenceLeaderboardHorizontalScroll">
                <div className="referenceLeaderboardTableViewport">
                  <table>
                    <thead><tr><th>#</th><th>User</th><th>{activeConfig.heading}</th></tr></thead>
                    <tbody>
                      {!loading && !error && rows.slice(0, 8).map((player, index) => {
                        const avatar = player.avatar_headshot_url || player.avatar_url
                        return <tr key={player.id || `${player.username}-${index}`}>
                          <td className={`referenceLeaderboardRank rank-${index + 1}`}><span>#{index + 1}{index < 3 ? <img src={`/icons/${index + 1}.webp`} width="24" height="24" alt="" /> : null}</span></td>
                          <td><div className="referenceLeaderboardPlayer">
                            <button type="button" className="referenceLeaderboardAvatar" aria-label={`Open profile for ${player.username || 'player'}`} onClick={() => setSelectedPlayer(player)}>{avatar ? <img src={avatar} alt={`${player.username || 'Player'}'s avatar`} loading="lazy" referrerPolicy="no-referrer" /> : <span>{String(player.username || '?').charAt(0).toUpperCase()}</span>}</button>
                            <button type="button" className="referenceLeaderboardName" title={player.username || 'Unknown'} onClick={() => setSelectedPlayer(player)}>{player.username || 'Unknown'}</button>
                          </div></td>
                          <td><div className={`referenceLeaderboardValue ${Number(player.stat) < 0 ? 'negative' : ''}`} title={formatFull(player.stat)}><span className="referenceLeaderboardGem"><img src="/currency.svg" alt="currency" /></span><span className="desktopValue">{formatFull(player.stat)}</span><span className="mobileValue">{formatPriceValue(player.stat)}</span></div></td>
                        </tr>
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              {loading ? <div className="referenceLeaderboardState">Loading leaderboard…</div> : null}
              {!loading && error ? <div className="referenceLeaderboardState error">{error}</div> : null}
              {!loading && !error && rows.length === 0 ? <div className="referenceLeaderboardState">No players to display yet.</div> : null}
            </div>
          </div>
        </div>
        <button type="button" className="referenceLeaderboardClose" aria-label="Close" onClick={onClose}><CloseIcon /><span>Close</span></button>
      </div>
      <MiniProfileModal isOpen={Boolean(selectedPlayer)} player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
      <style>{`
        .referenceLeaderboardOverlay{position:fixed;inset:0;z-index:10000;background:hsl(228 17% 12%/.4);font-family:Poppins,sans-serif}.referenceLeaderboardOverlay[data-state=open]{animation:referenceLeaderboardFadeIn .15s ease-out both}.referenceLeaderboardOverlay[data-state=closed]{animation:referenceLeaderboardFadeOut .15s ease-in both;pointer-events:none}
        .referenceLeaderboardModal{position:fixed;left:50%;top:50%;z-index:10001;display:grid;width:100%;height:100dvh;max-width:100%;box-sizing:border-box;gap:24px;overflow-y:auto;padding:24px;transform:translate(-50%,-50%);border:1px solid hsl(231 16% 16%);border-radius:0;outline:0;background:hsl(227 17% 11%);color:#fff;box-shadow:0 10px 15px -3px rgba(0,0,0,.1),0 4px 6px -4px rgba(0,0,0,.1);font-family:Poppins,sans-serif}.referenceLeaderboardModal[data-state=open]{animation:referenceLeaderboardOpen .2s ease-out both}.referenceLeaderboardModal[data-state=closed]{animation:referenceLeaderboardCloseModal .2s ease-in both;pointer-events:none}
        .referenceLeaderboardModal>div{min-width:0}.referenceLeaderboardHeading{display:flex;flex-direction:column;gap:6px;text-align:center}.referenceLeaderboardHeading h2{margin:0;font-size:18px;font-weight:600;line-height:18px;letter-spacing:-.025em}
        .referenceLeaderboardTabs{display:grid;width:100%;height:40px;box-sizing:border-box;grid-template-columns:repeat(3,minmax(0,1fr));align-items:center;justify-content:center;margin-bottom:8px;padding:4px;border-radius:6px;background:hsl(229 17% 13%);color:rgba(255,255,255,.5)}
        .referenceLeaderboardTabs button{display:inline-flex;height:32px;align-items:center;justify-content:center;padding:6px 12px;border:0;border-radius:2px;outline:0;background:transparent;color:#fff;font:500 14px/20px Poppins,sans-serif;white-space:nowrap;cursor:pointer;transition:all .15s ease}.referenceLeaderboardTabs button:focus-visible{box-shadow:0 0 0 2px hsl(331 100% 65%)}.referenceLeaderboardTabs button[data-state=active]{background:hsl(233 16% 22%/.4);color:#fff;box-shadow:0 1px 2px rgba(0,0,0,.05)}
        .referenceLeaderboardFilterRow{display:flex;justify-content:flex-end}.referenceLeaderboardSelect{position:relative;width:100%}.referenceLeaderboardSelect>button{display:flex;width:100%;height:40px;box-sizing:border-box;align-items:center;justify-content:space-between;padding:8px 12px;border:1px solid rgba(255,255,255,.25);border-radius:8px;background:transparent;color:rgba(255,255,255,.5);font:600 14px/20px Poppins,sans-serif;cursor:pointer;transition:border-color .15s ease}.referenceLeaderboardSelect>button:focus{border-color:rgba(255,255,255,.6);outline:0}.referenceLeaderboardSelect>button span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;pointer-events:none}.referenceLeaderboardSelect>button svg{width:16px;height:16px;flex:0 0 16px;opacity:.5;transition:transform .15s ease}.referenceLeaderboardSelect>button[data-state=open] svg{transform:rotate(180deg)}
        .referenceLeaderboardSelectMenu{position:absolute;right:0;top:calc(100% + 4px);z-index:4;width:100%;box-sizing:border-box;padding:4px;border:1px solid hsl(231 16% 16%);border-radius:6px;background:hsl(227 17% 11%);box-shadow:none;transform-origin:top;animation:referenceLeaderboardMenu .15s ease-out both}.referenceLeaderboardSelectMenu button{display:flex;width:100%;align-items:center;justify-content:space-between;padding:8px 10px;border:0;border-radius:4px;background:transparent;color:rgba(255,255,255,.7);font:500 14px/20px Poppins,sans-serif;text-align:left;cursor:pointer}.referenceLeaderboardSelectMenu button:hover,.referenceLeaderboardSelectMenu button[data-state=checked]{background:hsl(233 16% 22%/.65);color:#fff}.referenceLeaderboardSelectMenu button span{color:hsl(331 100% 65%)}
        .referenceLeaderboardMobileNote{display:block;margin:8px 0;padding-left:8px;border-left:2px solid hsl(331 100% 65%);font-size:14px;line-height:21px}.referenceLeaderboardMobileNote svg{display:inline;width:16px;height:16px;vertical-align:-3px}
        .referenceLeaderboardPanel{min-width:0;margin-top:8px;outline:0}.referenceLeaderboardTableWrap{position:relative;min-width:0;max-width:100%;overflow:auto;border:1px solid hsl(231 16% 16%);border-radius:4px;background:rgba(21,23,29,.25)}.referenceLeaderboardHorizontalScroll,.referenceLeaderboardTableViewport{overflow-x:auto}.referenceLeaderboardTableViewport{position:relative;width:100%;overflow:auto}.referenceLeaderboardTableWrap table{width:100%;border-spacing:0;border-collapse:collapse;font-size:14px;line-height:20px}.referenceLeaderboardTableWrap thead{display:table-header-group;opacity:.4}.referenceLeaderboardTableWrap thead tr{border:0}.referenceLeaderboardTableWrap th{height:48px;padding:0 16px;color:rgba(255,255,255,.5);font-weight:500;text-align:left;vertical-align:middle}.referenceLeaderboardTableWrap tbody{border-spacing:0;opacity:1}.referenceLeaderboardTableWrap tbody tr:nth-child(odd){background:#1b1d26}.referenceLeaderboardTableWrap td{padding:16px;vertical-align:middle}.referenceLeaderboardRank{width:32px;font-weight:600}.referenceLeaderboardRank>span{white-space:nowrap}.referenceLeaderboardRank:nth-child(n){box-sizing:content-box}.referenceLeaderboardRank.rank-1{color:#fbbf24}.referenceLeaderboardRank.rank-2{color:#9ca3af}.referenceLeaderboardRank.rank-3{color:#d97706}.referenceLeaderboardRank.rank-1>span,.referenceLeaderboardRank.rank-2>span,.referenceLeaderboardRank.rank-3>span{display:flex;align-items:center;justify-content:space-evenly;gap:8px}.referenceLeaderboardRank img{width:24px;height:24px;flex:0 0 24px;object-fit:contain}
        .referenceLeaderboardPlayer{display:flex;align-items:center;gap:8px}.referenceLeaderboardAvatar{position:relative;width:36px;height:36px;box-sizing:border-box;flex:0 0 36px;overflow:hidden;padding:0;border:2px solid hsl(231 16% 16%);border-radius:50%;background:transparent;color:#fff;cursor:pointer;transition:border-color .15s ease}.referenceLeaderboardAvatar:hover,.referenceLeaderboardAvatar:focus-visible{border-color:hsl(331 100% 65%);outline:0}.referenceLeaderboardAvatar img{position:absolute;inset:0;width:100%;height:100%;border-radius:50%;object-fit:cover}.referenceLeaderboardAvatar span{display:grid;width:100%;height:100%;place-items:center;font-weight:600}.referenceLeaderboardName{display:block;max-width:20ch;overflow:hidden;padding:0;border:0;background:transparent;color:#fff;font:500 14px/20px Poppins,sans-serif;text-align:left;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}.referenceLeaderboardValue{display:flex;align-items:center;gap:4px;color:hsl(331 100% 65%);font-weight:500;white-space:nowrap}.referenceLeaderboardValue.negative{color:#f87171}.referenceLeaderboardGem{position:relative;display:flex;width:20px;height:20px;flex:0 0 20px}.referenceLeaderboardGem img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}.referenceLeaderboardValue .mobileValue{display:inline}.referenceLeaderboardValue .desktopValue{display:none}.referenceLeaderboardState{display:grid;min-height:200px;place-items:center;padding:24px;color:rgba(255,255,255,.5);font-size:14px;text-align:center}.referenceLeaderboardState.error{color:#f87171}
        .referenceLeaderboardClose{position:absolute;right:16px;top:16px;padding:0;border:0;border-radius:2px;outline:0;background:transparent;color:#fff;opacity:.7;cursor:pointer;transition:opacity .15s ease}.referenceLeaderboardClose:hover{opacity:1}.referenceLeaderboardClose:focus-visible{box-shadow:0 0 0 2px hsl(331 100% 65%)}.referenceLeaderboardClose svg{display:block;width:20px;height:20px}.referenceLeaderboardClose span{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
        @keyframes referenceLeaderboardFadeIn{from{opacity:0}to{opacity:1}}@keyframes referenceLeaderboardFadeOut{from{opacity:1}to{opacity:0}}@keyframes referenceLeaderboardOpen{from{opacity:0;transform:translate(-50%,-48%)}to{opacity:1;transform:translate(-50%,-50%)}}@keyframes referenceLeaderboardCloseModal{from{opacity:1;transform:translate(-50%,-50%)}to{opacity:0;transform:translate(-50%,-50%)}}@keyframes referenceLeaderboardMenu{from{opacity:0;transform:translateY(-8px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}
        @media(min-width:640px){.referenceLeaderboardModal{width:100%;height:auto;max-width:576px;border-radius:8px}.referenceLeaderboardHeading{text-align:left}.referenceLeaderboardTableWrap{max-height:384px}.referenceLeaderboardSelect{width:180px}}
        @media(min-width:768px){.referenceLeaderboardModal{max-width:768px}.referenceLeaderboardTableWrap{max-height:none}.referenceLeaderboardMobileNote{display:none}.referenceLeaderboardName{max-width:none}.referenceLeaderboardValue .mobileValue{display:none}.referenceLeaderboardValue .desktopValue{display:inline}}
        .referenceLeaderboardAvatar:hover{border-color:rgba(255,255,255,.2);outline:0}
      `}</style>
    </div>
  )
}
