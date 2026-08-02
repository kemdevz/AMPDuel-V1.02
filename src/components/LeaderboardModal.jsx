import { useEffect, useMemo, useState } from 'react'
import { get } from '../lib/api'
import { getLevelStyle } from '../lib/levelStyles'
import MiniProfileModal from './MiniProfileModal'

const TABS = [
  { id: 'played', label: 'Played', heading: 'Played' },
  { id: 'profit', label: 'Profit', heading: 'Profit' },
  { id: 'least-profit', label: 'Least Profit', heading: 'Least Profit' },
]

function formatCompact(value) {
  const amount = Number(value) || 0
  const absolute = Math.abs(amount)
  const units = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ]
  const unit = units.find(([size]) => absolute >= size)
  if (!unit) return amount.toLocaleString('en-US')
  const compact = amount / unit[0]
  return `${compact.toFixed(Math.abs(compact) >= 100 ? 0 : 1).replace(/\.0$/, '')}${unit[1]}`
}

export default function LeaderboardModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('played')
  const [rowsByTab, setRowsByTab] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const activeConfig = useMemo(() => TABS.find((tab) => tab.id === activeTab) || TABS[0], [activeTab])
  const rows = rowsByTab[activeTab] || []

  useEffect(() => {
    if (!isOpen) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen || rowsByTab[activeTab]) return undefined
    const controller = new AbortController()
    setLoading(true)
    setError('')
    get(`/leaderboard?sort=${encodeURIComponent(activeTab)}`)
      .then((result) => {
        if (controller.signal.aborted) return
        setRowsByTab((current) => ({ ...current, [activeTab]: result?.leaders || [] }))
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(requestError?.message || 'Unable to load the leaderboard.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [activeTab, isOpen, rowsByTab])

  if (!isOpen) return null

  return (
    <div className="leaderboardOverlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div className="leaderboardModal" role="dialog" aria-modal="true" aria-labelledby="leaderboard-title">
        <div className="leaderboardTitle">
          <h1 id="leaderboard-title">Leaderboard</h1>
          <button className="leaderboardClose" type="button" aria-label="Close leaderboard" onClick={onClose}>×</button>
        </div>

        <div className="leaderboardTabs" role="tablist" aria-label="Leaderboard category">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`leaderboardTab${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="leaderboardContent">
          <div className="leaderboardHeaderRow">
            <div className="leaderboardHeaderNumber">#</div>
            <div className="leaderboardHeaderUser">User</div>
            <div className="leaderboardHeaderStat">{activeConfig.heading}</div>
          </div>
          <div className="leaderboardList">
            {loading ? <div className="leaderboardState">Loading leaderboard…</div> : null}
            {!loading && error ? <div className="leaderboardState error">{error}</div> : null}
            {!loading && !error && rows.length === 0 ? <div className="leaderboardState">No players to display yet.</div> : null}
            {!loading && !error && rows.map((player, index) => {
              const level = Math.max(1, Math.floor(Number(player.level) || 1))
              const avatar = player.avatar_headshot_url || player.avatar_url
              return (
                <div className="leaderboardItem" key={player.id || `${player.username}-${index}`}>
                  <div className={`leaderboardPosition rank-${index + 1}`}>#{index + 1}</div>
                  <div className="leaderboardUser">
                    <button className="leaderboardAvatar" type="button" aria-label={`Open profile for ${player.username}`} onClick={() => setSelectedPlayer(player)}>
                      {avatar ? <img src={avatar} alt={player.username || 'Player'} loading="lazy" referrerPolicy="no-referrer" /> : <span>{String(player.username || '?').charAt(0).toUpperCase()}</span>}
                    </button>
                    <div className="leaderboardUsernameColumn">
                      <span className="leaderboardUsernameInline">
                        <span className="leaderboardLevel" title={`Level ${level}`} style={getLevelStyle(level)}>{level}</span>
                        <span className="leaderboardUsername" title={player.username}>{player.username || 'Unknown'}</span>
                      </span>
                    </div>
                  </div>
                  <div className={`leaderboardStat${Number(player.stat) < 0 ? ' negative' : ''}`}>
                    <img src="/bobux.png" alt="Coins" />
                    {formatCompact(player.stat)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <MiniProfileModal isOpen={Boolean(selectedPlayer)} player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />

      <style>{`
        .leaderboardOverlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(7,8,14,.72);backdrop-filter:blur(3px);animation:leaderboardFade .18s ease-out}
        .leaderboardModal{position:relative;background-color:#171925;border:1px solid #181a28;border-radius:6px;padding:16px;width:82%;max-width:560px;height:520px;display:flex;flex-direction:column;overflow:hidden;color:#e1e4f2;font-family:Poppins,sans-serif;box-shadow:0 20px 80px rgba(0,0,0,.55);animation:leaderboardOpen .22s forwards}
        .leaderboardTitle{display:flex;align-items:center;justify-content:space-between;flex-shrink:0;padding:1px 2px 13px}
        .leaderboardTitle h1{margin:0;color:#fff;font-size:21px;font-weight:650;line-height:1.3}
        .leaderboardClose{display:grid;place-items:center;width:30px;height:30px;padding:0;border:0;border-radius:5px;background:transparent;color:#7d839f;font-size:27px;line-height:1;cursor:pointer;transition:color .14s ease,background .14s ease}
        .leaderboardClose:hover{color:#fff;background:rgba(255,255,255,.05)}
        .leaderboardTabs{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;padding:4px;border-radius:6px;background:#12141f;flex-shrink:0}
        .leaderboardTab{height:36px;border:0;border-radius:5px;background:transparent;color:#7f86a6;font:600 12px Poppins,sans-serif;cursor:pointer;transition:background .16s ease,color .16s ease,box-shadow .16s ease}
        .leaderboardTab.active{color:#fff;background:linear-gradient(180deg,#8079ff 0%,#6c63ff 45%,#5a51e6 100%);box-shadow:0 3px 10px rgba(108,99,255,.25)}
        .leaderboardContent{min-height:0;display:flex;flex:1;flex-direction:column;margin-top:12px;border-radius:6px;background:#131520;overflow:hidden}
        .leaderboardHeaderRow{display:grid;grid-template-columns:42px minmax(0,1fr) 120px;align-items:center;min-height:38px;padding:0 12px;border-bottom:1px solid rgba(255,255,255,.06);color:#666d8d;font-size:10px;font-weight:700;text-transform:uppercase}
        .leaderboardHeaderStat{text-align:right}
        .leaderboardList{min-height:0;flex:1;overflow-x:hidden;overflow-y:auto;padding:4px 7px 8px;scrollbar-color:#30364f transparent;scrollbar-width:thin}
        .leaderboardItem{display:grid;grid-template-columns:42px minmax(0,1fr) 120px;align-items:center;min-height:55px;padding:6px 6px;border-bottom:1px solid rgba(255,255,255,.045)}
        .leaderboardPosition{color:#6f7694;font-size:12px;font-weight:700}.leaderboardPosition.rank-1{color:#f5c84c}.leaderboardPosition.rank-2{color:#c9cede}.leaderboardPosition.rank-3{color:#d88b5c}
        .leaderboardUser{display:flex;align-items:center;min-width:0;gap:9px}.leaderboardAvatar{width:35px;height:35px;flex:0 0 35px;overflow:hidden;padding:0;border:1px solid rgba(255,255,255,.08);border-radius:50%;background:#24283a;cursor:pointer}.leaderboardAvatar img{width:100%;height:100%;object-fit:cover}.leaderboardAvatar span{display:grid;width:100%;height:100%;place-items:center;color:#aeb4dd;font-weight:700}
        .leaderboardUsernameColumn,.leaderboardUsernameInline{min-width:0}.leaderboardUsernameInline{display:flex;align-items:center;gap:6px}.leaderboardLevel{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;line-height:14px;white-space:nowrap}.leaderboardUsername{overflow:hidden;color:#cdd1e3;font-size:12px;font-weight:600;text-overflow:ellipsis;white-space:nowrap}
        .leaderboardStat{display:flex;align-items:center;justify-content:flex-end;gap:5px;color:#e1e4f2;font-size:12px;font-weight:650}.leaderboardStat.negative{color:#ff7474}.leaderboardStat img{width:15px;height:15px;object-fit:contain}
        .leaderboardState{display:grid;height:100%;min-height:180px;place-items:center;color:#737b9b;font-size:12px;text-align:center}.leaderboardState.error{color:#ff7474}
        @keyframes leaderboardFade{from{opacity:0}to{opacity:1}}@keyframes leaderboardOpen{from{opacity:0;transform:scale(.94) translateY(12px)}to{opacity:1;transform:scale(1) translateY(0)}}
        @media(max-width:640px){.leaderboardModal{width:100%;height:min(520px,calc(100dvh - 32px));padding:12px}.leaderboardHeaderRow,.leaderboardItem{grid-template-columns:32px minmax(0,1fr) 85px;padding-left:6px;padding-right:6px}.leaderboardUsername{font-size:11px}.leaderboardStat{font-size:11px}}
      `}</style>
    </div>
  )
}
