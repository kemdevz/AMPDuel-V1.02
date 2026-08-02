import { useEffect, useState } from 'react'
import { apiRequest } from '../lib/apiClient'
import { useNavigate } from '../lib/router'

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
  const [game, setGame] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true

    apiRequest('/api/live-casino/games')
      .then((response) => {
        if (!mounted) return
        const games = Array.isArray(response?.games) ? response.games : []
        const selectedGame = games.find((entry) => (
          String(entry.providerId) === String(providerId) && String(entry.id) === String(gameId)
        ))
        if (!selectedGame) throw new Error('This Live Casino game is no longer available.')
        setGame(selectedGame)
      })
      .catch((requestError) => {
        if (!mounted) return
        setError(requestError?.message || 'Unable to load this Live Casino game.')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => { mounted = false }
  }, [gameId, providerId])

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
            onClick={() => navigate('/live-casino')}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[6px] border-0 bg-[#202331] p-0 text-[#c7cce2] transition-colors hover:bg-[#2a2e44] hover:text-white"
            aria-label="Back to Live Casino"
            title="Back to Live Casino"
          >
            <BackIcon />
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="m-0 truncate text-[14px] font-semibold text-white sm:text-[15px]">
              {game?.name || (loading ? 'Loading game...' : 'Live Casino')}
            </h1>
            {game ? <p className="m-0 truncate text-[10px] font-medium text-[#6c7399] sm:text-[11px]">{game.provider}</p> : null}
          </div>

          <button
            type="button"
            onClick={openFullscreen}
            disabled={!game}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[6px] border-0 bg-[#202331] p-0 text-[#c7cce2] transition-colors hover:bg-[#2a2e44] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Open game fullscreen"
            title="Fullscreen"
          >
            <ExpandIcon />
          </button>
        </header>

        <div
          id="live-casino-game-window"
          className="relative flex aspect-[980/600] w-full items-center justify-center overflow-hidden bg-[#080a10]"
        >
          {game?.image ? (
            <img
              src={game.image}
              alt=""
              className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-[.12] blur-2xl"
              aria-hidden="true"
            />
          ) : null}
          <div className="relative z-[1] flex max-w-[460px] flex-col items-center px-6 text-center">
            {loading ? (
              <>
                <span className="mb-4 h-8 w-8 animate-spin rounded-full border-[3px] border-[#2a3048] border-t-[#6c63ff]" />
                <p className="m-0 text-[13px] font-medium text-[#a6b2d3]">Preparing game window...</p>
              </>
            ) : error ? (
              <>
                <h2 className="m-0 text-[18px] font-semibold text-white">Game unavailable</h2>
                <p className="mb-5 mt-2 text-[12px] leading-5 text-[#8b92b8]">{error}</p>
                <button
                  type="button"
                  onClick={() => navigate('/live-casino')}
                  className="h-10 cursor-pointer rounded-[8px] border border-[#5e55d966] bg-gradient-to-br from-[#5b52e2] to-[#4038c0] px-5 text-[13px] font-semibold text-white"
                >
                  Return to Live Casino
                </button>
              </>
            ) : (
              <>
                {game?.image ? <img src={game.image} alt={game.name} className="mb-5 max-h-[210px] max-w-[170px] rounded-[6px] object-contain shadow-[0_14px_40px_rgba(0,0,0,.5)]" /> : null}
                <h2 className="m-0 text-[18px] font-semibold text-white">{game?.name}</h2>
                <p className="mb-0 mt-2 text-[12px] leading-5 text-[#8b92b8]">
                  {game?.launchAvailable
                    ? 'The game window is ready. Secure Betnex launch and wallet callbacks must be connected before real-money play is enabled.'
                    : 'This locally featured game does not currently have a matching Betnex game ID.'}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
