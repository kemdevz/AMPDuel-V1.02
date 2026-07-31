import { useState, useEffect, useCallback } from 'react'
import { liveFeed as fallbackFeed } from '../data'
import { get } from '../lib/api'
import { connectSocket } from '../lib/socket'

const MAX = 50

function fmtNum(n) {
  if (n == null) return '…'
  return Number(n).toLocaleString('en-US')
}

function fmtMult(m) {
  return `x${Number(m).toFixed(2)}`
}

function fmtTime(iso) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

function GameIcon({ name }) {
  const normalized = String(name || '').toLowerCase()

  if (normalized.includes('upgrader')) {
    return (
      <svg width="30" height="30" viewBox="0 0 512 512" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 opacity-90">
        <path d="M256 29.816l-231 154v106.368l231-154 231 154V183.816zm0 128.043L105 259.783v90.283l151-101.925 151 101.925v-90.283zm0 112l-87 58.725v67.6l87-58 87 58v-67.6zm0 89.957l-87 58v64.368l87-58 87 58v-64.368z" />
      </svg>
    )
  }

  if (normalized.includes('coinflip')) {
    return (
      <svg viewBox="0 0 512 512" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 opacity-90">
        <path d="M326.27,86.016l57.667,15.304c1.504,0.307,2.726,1.536,3.072,3.049l15.203,57.667c0.41,1.693,1.899,2.883,3.631,2.883c1.749,0,3.222-1.19,3.615-2.883l15.226-57.667c0.323-1.512,1.552-2.742,3.056-3.049l57.675-15.304c1.686-0.316,2.884-1.82,2.884-3.553c0-1.749-1.198-3.222-2.884-3.56L427.74,63.606c-1.504-0.322-2.733-1.536-3.056-3.048L409.458,2.891C409.064,1.213,407.591,0,405.843,0c-1.732,0-3.222,1.213-3.631,2.891l-15.203,57.667c-0.346,1.512-1.567,2.726-3.072,3.048L326.27,78.903c-1.702,0.339-2.883,1.812-2.883,3.56C323.387,84.196,324.569,85.701,326.27,86.016z" />
        <path d="M385.253,326.53l-26.176-6.939c-0.685-0.158-1.244-0.694-1.394-1.386l-6.9-26.175c-0.181-0.764-0.851-1.308-1.646-1.308c-0.78,0-1.457,0.544-1.646,1.308l-6.9,26.175c-0.158,0.693-0.709,1.228-1.394,1.386l-26.167,6.939c-0.772,0.15-1.316,0.828-1.316,1.615c0,0.788,0.544,1.466,1.316,1.623l26.167,6.932c0.685,0.141,1.236,0.709,1.394,1.402l6.9,26.159c0.189,0.764,0.866,1.308,1.646,1.308c0.796,0,1.465-0.544,1.646-1.308l6.9-26.159c0.15-0.693,0.709-1.261,1.394-1.402l26.176-6.932c0.756-0.157,1.308-0.835,1.308-1.623C386.56,327.357,386.009,326.68,385.253,326.53z" />
        <path d="M37.841,140.075l41.204,10.917c1.086,0.229,1.946,1.104,2.205,2.19l10.854,41.204c0.299,1.221,1.363,2.064,2.6,2.064c1.244,0,2.3-0.843,2.592-2.064l10.862-41.204c0.229-1.086,1.119-1.961,2.198-2.19l41.212-10.917c1.205-0.252,2.063-1.339,2.063-2.568c0-1.229-0.858-2.284-2.063-2.536l-41.212-10.934c-1.079-0.236-1.969-1.086-2.198-2.174L97.296,80.636c-0.292-1.198-1.347-2.048-2.592-2.048c-1.236,0-2.3,0.85-2.6,2.048l-10.854,41.228c-0.26,1.087-1.119,1.937-2.205,2.174l-41.204,10.934c-1.229,0.252-2.072,1.307-2.072,2.536C35.769,138.736,36.612,139.824,37.841,140.075z" />
        <path d="M396.595,276.897c-7.877-9.216-19.133-17.392-33.012-24.245c-27.68-13.706-65.638-22.094-107.583-22.118c-57.746,0-109.978,11.658-147.031,30.035c-18.526,9.16-33.209,19.967-42.992,31.444c-9.783,11.477-15.691,23.96-15.691,36.013v81.873c0,24.474,19.417,47.113,52.683,64.273C140.022,502.342,195.245,512,256,512c60.755,0,115.978-9.658,153.031-27.828c33.266-17.16,52.683-39.799,52.683-64.273v-81.873c0-24.49-19.417-47.129-52.683-64.289z" />
      </svg>
    )
  }

  if (normalized.includes('battle')) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 opacity-90">
        <path fill="none" d="M0 0h24v24H0z" />
        <path fillRule="nonzero" d="M7.05 13.406l3.534 3.536-1.413 1.414 1.415 1.415-1.414 1.414-2.475-2.475-2.829 2.829-1.414-1.414 2.829-2.83-2.475-2.474 1.414-1.414 1.414 1.413 1.413-1.414zM3 3l3.546.003 11.817 11.818 1.415-1.414 1.414 1.414-2.474 2.475 2.828 2.829-1.414 1.414-2.829-2.829-2.475 2.475-1.414-1.414 1.414-1.415L3.003 6.531 3 3zm14.457 0L21 3.003l.002 3.523-4.053 4.052-3.536-3.535L17.457 3z" />
      </svg>
    )
  }

  return (
    <svg width="30" height="30" viewBox="0 0 512 512" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 opacity-90">
      <path d="M256 29.816l-231 154v106.368l231-154 231 154V183.816zm0 128.043L105 259.783v90.283l151-101.925 151 101.925v-90.283zm0 112l-87 58.725v67.6l87-58 87 58v-67.6zm0 89.957l-87 58v64.368l87-58 87 58v-64.368z" />
    </svg>
  )
}

function FeedRow({ row }) {
  return (
    <div
      className="mt-1.5 grid grid-cols-1 gap-2 rounded-lg border border-[#252839] p-3 text-sm sm:grid-cols-6 sm:items-center sm:gap-4 sm:px-4 sm:py-3"
      style={{ backgroundColor: 'rgb(26, 29, 43)' }}
    >
      <div className="col-span-1 flex items-center justify-between sm:col-span-2">
        <div className="flex items-center gap-3">
          <img
            src={row.avatar || 'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-9573CD5AF37DCB3F7BE601BD41BC805F-Png/420/420/AvatarHeadshot/Png/noFilter'}
            alt={row.user}
            className="h-8 w-8 cursor-pointer rounded-full object-cover transition-transform duration-150 hover:scale-[1.03]"
            referrerPolicy="no-referrer"
          />
          <div>
            <div className="font-semibold tracking-wide text-gray-100">{row.user}</div>
            <div className="text-xs text-gray-500">{row.time}</div>
          </div>
        </div>
      </div>

      <div className="hidden items-center gap-2 font-semibold tracking-wide text-gray-300 sm:flex">
        <GameIcon name={row.game} />
        <span>{row.game}</span>
      </div>

      <div className="col-span-1 grid grid-cols-3 gap-2 sm:col-span-3">
        <div className="flex items-center gap-1 font-semibold text-gray-100">
          <img src="/bobux.png" alt="" className="h-4 w-4" />
          <span style={{ minWidth: '60px' }}>{fmtNum(row.amount)}</span>
        </div>
        <div className="font-bold tracking-wide text-[#7a73ff]">{row.mult}</div>
        <div className="flex items-center gap-1 font-semibold text-gray-100">
          <img src="/bobux.png" alt="" className="h-4 w-4" />
          <span style={{ minWidth: '60px' }}>{fmtNum(row.win)}</span>
        </div>
      </div>
    </div>
  )
}

export default function LiveFeed() {
  const [feed, setFeed] = useState([])
  const [errored, setErrored] = useState(false)

  useEffect(() => {
    let cancelled = false
    get('/games/feed?limit=40')
      .then((data) => {
        if (cancelled) return
        const rows = (data.feed || []).map((r) => ({
          ...r,
          time: fmtTime(r.createdAt),
          mult: fmtMult(r.multiplier),
        }))
        setFeed(rows)
        setErrored(false)
      })
      .catch(() => {
        if (!cancelled) setErrored(true)
      })
    return () => { cancelled = true }
  }, [])

  const handleFeedNew = useCallback((row) => {
    setFeed((prev) => {
      const next = [
        {
          ...row,
          time: 'just now',
          mult: fmtMult(row.multiplier),
        },
        ...prev,
      ].slice(0, MAX)
      return next
    })
  }, [])

  useEffect(() => {
    const socket = connectSocket()
    if (!socket) return
    socket.on('feed:new', handleFeedNew)
    return () => { socket.off('feed:new', handleFeedNew) }
  }, [handleFeedNew])

  const rows = feed.length > 0 || !errored
    ? feed
    : fallbackFeed.map((f, index) => ({
        id: index,
        user: f.user,
        time: f.time,
        game: f.game,
        amount: parseInt(f.amount.replace(/,/g, ''), 10),
        mult: f.mult,
        win: parseInt(f.win.replace(/,/g, ''), 10),
        avatar: f.avatar,
      }))

  return (
    <div className="mx-auto w-full max-w-[1500px] box-border px-4">
      <div className="mt-10">
        <div className="livebets-head mb-3">
          <div className="livebets-head-left">
            <span className="livebets-head-title">Live Feed</span>
          </div>
          <div className="livebets-head-line" />
        </div>

        <div className="grid grid-cols-1 gap-2 rounded-lg border border-[#252839] p-3 text-sm sm:grid-cols-6 sm:items-center sm:gap-4 sm:px-4 sm:py-3">
          <div className="col-span-1 font-bold tracking-wide text-gray-400 sm:col-span-2">User</div>
          <div className="hidden font-bold tracking-wide text-gray-400 sm:block">Game</div>
          <div className="col-span-1 grid grid-cols-3 gap-2 font-bold tracking-wide text-gray-400 sm:col-span-3">
            <div>Amount</div>
            <div>Multiplier</div>
            <div>Win</div>
          </div>
        </div>

        <div>
          {rows.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">No bets yet. Be the first!</p>
          )}
          {rows.map((row, i) => (
            <FeedRow key={row.id ?? i} row={row} />
          ))}
        </div>
      </div>

      <style>{`
        .livebets-head { display:flex; align-items:center; gap:12px; width:100%; }
        .livebets-head-left { display:flex; align-items:baseline; gap:10px; flex:0 0 auto; min-width:0; }
        .livebets-head-title { color:#fff; font-weight:700; font-size:18px; letter-spacing:.02em; white-space:nowrap; }
        .livebets-head-line { flex:1 1 auto; height:2px; border-radius:999px; background:linear-gradient(to left, rgba(108,99,255,0.78), rgba(108,99,255,0)); }
      `}</style>
    </div>
  )
}
