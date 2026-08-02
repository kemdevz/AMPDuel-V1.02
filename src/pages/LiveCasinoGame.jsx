import { useCallback, useEffect, useRef, useState } from 'react'
import { apiRequest } from '../lib/apiClient'
import { useNavigate } from '../lib/router'
import { useAuth } from '../store/auth'
import { useSocket } from '../lib/socket'

const pendingLaunchRequests = new Map()

function requestGameLaunch(game) {
  const key = `${game.providerId}:${game.id}`
  const pending = pendingLaunchRequests.get(key)
  if (pending) return pending

  const request = apiRequest('/api/live-casino/launch', {
    method: 'POST',
    body: JSON.stringify({ gameId: game.id, providerId: game.providerId }),
  }).finally(() => {
    window.setTimeout(() => {
      if (pendingLaunchRequests.get(key) === request) pendingLaunchRequests.delete(key)
    }, 1_000)
  })
  pendingLaunchRequests.set(key, request)
  return request
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true">
      <path d="m15 18-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true">
      <path d="M8 3H3v5M16 3h5v5M8 21H3v-5m18 0v5h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function LiveCasinoGame({ providerId, gameId }) {
  const navigate = useNavigate()
  const setBalance = useAuth((state) => state.setBalance)
  const socket = useSocket()
  const [game, setGame] = useState(null)
  const [launch, setLaunch] = useState(null)
  const [loading, setLoading] = useState(true)
  const [frameLoading, setFrameLoading] = useState(true)
  const [closing, setClosing] = useState(false)
  const [error, setError] = useState('')
  const closedSessionRef = useRef('')
  const frameRevealTimerRef = useRef(null)
  const isLiveTable = game?.category === 'Blackjack' || game?.category === 'Baccarat'

  useEffect(() => {
    let mounted = true

    const loadGame = async () => {
      try {
        const response = await apiRequest('/api/live-casino/games')
        const games = Array.isArray(response?.games) ? response.games : []
        const selectedGame = games.find((entry) => (
          String(entry.providerId) === String(providerId) && String(entry.id) === String(gameId)
        ))
        if (!selectedGame) throw new Error('This Live Casino game is no longer available.')
        if (!selectedGame.launchAvailable) {
          throw new Error('This featured game does not currently have a matching Betnex game ID.')
        }
        if (!mounted) return
        setGame(selectedGame)

        const launchResult = await requestGameLaunch(selectedGame)
        if (!mounted) return
        console.log('[Live Casino Game] Launch result:', launchResult)
        setLaunch(launchResult)
      } catch (requestError) {
        if (!mounted) return
        const message = requestError?.status === 401
          ? 'Please sign in to play Live Casino games.'
          : requestError?.message || 'Unable to load this Live Casino game.'
        setError(message)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void loadGame()

    return () => { mounted = false }
  }, [gameId, providerId])

  // Listen for wallet updates from the server
  useEffect(() => {
    if (!socket) return

    const handleWalletUpdated = (data) => {
      if (data.profileId && data.balance !== undefined) {
        setBalance(Number(data.balance))
      }
    }

    socket.on('wallet:updated', handleWalletUpdated)

    return () => {
      socket.off('wallet:updated', handleWalletUpdated)
    }
  }, [socket, setBalance])

  const closeSession = useCallback(async (keepalive = false) => {
    const sessionId = String(launch?.sessionId || '')
    if (!sessionId || closedSessionRef.current === sessionId) return null
    closedSessionRef.current = sessionId

    try {
      if (keepalive) {
        await fetch(`/api/live-casino/sessions/${encodeURIComponent(sessionId)}/close`, {
          method: 'POST',
          credentials: 'include',
          keepalive: true,
        })
        return null
      }
      const response = await apiRequest(
        `/api/live-casino/sessions/${encodeURIComponent(sessionId)}/close`,
        { method: 'POST' },
      )
      if (Number.isFinite(Number(response?.balance))) setBalance(Number(response.balance))
      return response
    } catch {
      closedSessionRef.current = ''
      return null
    }
  }, [launch?.sessionId, setBalance])

  useEffect(() => () => {
    void closeSession(true)
  }, [closeSession])

  useEffect(() => () => {
    if (frameRevealTimerRef.current) window.clearTimeout(frameRevealTimerRef.current)
  }, [])

  const returnToCasino = async () => {
    if (closing) return
    setClosing(true)
    await closeSession(false)
    navigate('/live-casino')
  }

  const openFullscreen = () => {
    const element = document.getElementById('live-casino-game-window')
    if (element?.requestFullscreen) void element.requestFullscreen()
  }

  return (
    <section className="box-border flex min-h-[calc(100dvh-var(--header-height))] w-full items-center justify-center px-2 py-3 text-[#e1e4f2] [font-family:Poppins,sans-serif] sm:px-4 sm:py-4">
      <div className="flex w-full max-w-[980px] flex-col overflow-hidden rounded-[8px] bg-[#131520] shadow-[0_18px_55px_rgba(0,0,0,.25)]">
        <header className="flex min-h-[52px] items-center gap-3 border-b border-white/[.06] px-3 sm:px-4">
          <button
            type="button"
            onClick={() => { void returnToCasino() }}
            disabled={closing}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[6px] border-0 bg-[#202331] p-0 text-[#c7cce2] transition-colors hover:bg-[#2a2e44] hover:text-white"
            aria-label="Back to Live Casino"
            title="Back to Live Casino"
          >
            <BackIcon />
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="m-0 truncate text-[14px] font-semibold text-white sm:text-[15px]">
              {game?.name || (loading ? 'Launching game...' : 'Live Casino')}
            </h1>
            {game ? (
              <p className="m-0 truncate text-[10px] font-medium text-[#6c7399] sm:text-[11px]">
                {game.provider}
                {launch ? ` - 1 USD = ${Number(launch.coinsPerUsd).toLocaleString()} Coins - Balance: ${Number(launch.launchBalanceCoins || 0).toLocaleString()} Coins` : ''}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={openFullscreen}
            disabled={!launch?.launchUrl}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[6px] border-0 bg-[#202331] p-0 text-[#c7cce2] transition-colors hover:bg-[#2a2e44] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Open game fullscreen"
            title="Fullscreen"
          >
            <ExpandIcon />
          </button>
        </header>

        <div
          id="live-casino-game-window"
          className={`relative flex w-full items-center justify-center overflow-hidden bg-[#080a10] ${
            isLiveTable ? 'aspect-video' : 'aspect-[980/600]'
          }`}
        >
          {!launch?.launchUrl && game?.image ? (
            <img
              src={game.image}
              alt=""
              className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-[.12] blur-2xl"
              aria-hidden="true"
            />
          ) : null}
          {launch?.launchUrl ? (
            <iframe
              src={launch.launchUrl}
              title={game?.name || 'Live Casino game'}
              className={`absolute inset-0 h-full w-full border-0 bg-black transition-opacity duration-300 ${
                frameLoading ? 'opacity-0' : 'opacity-100'
              }`}
              allow="autoplay; fullscreen; clipboard-read; clipboard-write"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              onLoad={() => {
                if (frameRevealTimerRef.current) window.clearTimeout(frameRevealTimerRef.current)
                frameRevealTimerRef.current = window.setTimeout(() => {
                  setFrameLoading(false)
                  frameRevealTimerRef.current = null
                }, 800)
              }}
            />
          ) : null}

          <div className={`relative z-[1] flex max-w-[460px] flex-col items-center px-6 text-center ${launch?.launchUrl && !frameLoading ? 'hidden' : ''}`}>
            {loading ? (
              <>
                <span className="mb-4 h-8 w-8 animate-spin rounded-full border-[3px] border-[#2a3048] border-t-[#6c63ff]" />
                <p className="m-0 text-[13px] font-medium text-[#a6b2d3]">Converting Coins and launching securely...</p>
              </>
            ) : error ? (
              <>
                <h2 className="m-0 text-[18px] font-semibold text-white">Game unavailable</h2>
                <p className="mb-5 mt-2 text-[12px] leading-5 text-[#8b92b8]">{error}</p>
                <button
                  type="button"
                  onClick={() => { void returnToCasino() }}
                  className="h-10 cursor-pointer rounded-[8px] border border-[#5e55d966] bg-gradient-to-br from-[#5b52e2] to-[#4038c0] px-5 text-[13px] font-semibold text-white"
                >
                  Return to Live Casino
                </button>
              </>
            ) : launch?.launchUrl && frameLoading ? (
              <>
                <span className="mb-4 h-8 w-8 animate-spin rounded-full border-[3px] border-[#2a3048] border-t-[#6c63ff]" />
                <p className="m-0 text-[13px] font-medium text-[#a6b2d3]">Loading {game?.name}...</p>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
