import { useEffect, useState } from 'react'
import AnimatedNumber from '../components/AnimatedNumber'
import MinesCreateModal from '../components/MinesCreateModal'
import { useAuth } from '../store/auth'

const MINES_GAME_STORAGE_KEY = 'bloxdice:mines-game'
const GAME_OPTIONS = [['mm2', 'MM2'], ['adm', 'AMP'], ['ps99', 'PS99']]

function StatCard({ icon, value, label }) {
  return <div className="flex min-h-[76px] items-center justify-start gap-3 rounded-lg border border-[hsl(231_16%_16%)] bg-[hsl(230_16%_14%)] px-4 py-2">
    <div className="flex w-full flex-col items-start justify-center text-left">
      <span className="flex items-center justify-start gap-2 text-left text-2xl font-bold leading-tight text-white">
        {icon ? <img src={icon} alt="" className="h-5 w-5" /> : null}
        <AnimatedNumber value={Number(value) || 0} duration={260} fastThreshold={100_000_000} fastDuration={160} />
      </span>
      <span className="text-left text-base font-semibold leading-tight text-white opacity-60">{label}</span>
    </div>
  </div>
}

export default function Mines({ onInitialReady }) {
  const user = useAuth((state) => state.user)
  const setAuthModalOpen = useAuth((state) => state.setAuthModalOpen)
  const [createOpen, setCreateOpen] = useState(false)
  const [gameMode, setGameMode] = useState(() => {
    if (typeof window === 'undefined') return 'mm2'
    try {
      const saved = window.localStorage.getItem(MINES_GAME_STORAGE_KEY)
      return GAME_OPTIONS.some(([value]) => value === saved) ? saved : 'mm2'
    } catch { return 'mm2' }
  })
  const gameModeIndex = Math.max(0, GAME_OPTIONS.findIndex(([value]) => value === gameMode))

  useEffect(() => { onInitialReady?.() }, [onInitialReady])
  useEffect(() => {
    try { window.localStorage.setItem(MINES_GAME_STORAGE_KEY, gameMode) } catch { /* Storage may be unavailable. */ }
    window.dispatchEvent(new CustomEvent('ampduel:game-mode-changed', { detail: { storageKey: MINES_GAME_STORAGE_KEY, gameMode } }))
  }, [gameMode])

  const requireLogin = (action) => {
    if (!user) return setAuthModalOpen(true)
    action?.()
  }

  return <div className="reference-mines flex-1 overflow-x-hidden bg-transparent">
    <style>{`.reference-mines{min-height:100%;background-color:#111319;background-image:url('/cf-paw-pattern.svg');background-repeat:repeat;background-size:180px 180px;background-position:0 18px}`}</style>
    <div className="relative z-10 flex w-full flex-col px-[18px] pb-32 pt-5">
      <div className="grid gap-2 md:grid-cols-3">
        <StatCard value={0} label="Total Items" />
        <StatCard icon="/currency.svg" value={0} label="Total Value" />
        <StatCard value={0} label="Active Games" />
      </div>
      <div className="mb-[10px] mt-3 flex flex-col justify-between gap-2 sm:flex-row">
        <div role="tablist" aria-label="Mines game" className="relative isolate grid h-[43px] w-full grid-cols-3 items-center justify-center overflow-hidden rounded-md bg-[hsl(229_17%_13%)] sm:w-auto">
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 z-0 rounded-md bg-[#ff4fa3] shadow-sm transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)]" style={{ width: 'calc(100% / 3)', transform: `translateX(${gameModeIndex * 100}%)` }} />
          {GAME_OPTIONS.map(([value, label]) => {
            const active = gameMode === value
            return <button key={value} type="button" role="tab" aria-selected={active} onClick={() => setGameMode(value)} className={`relative z-10 inline-flex items-center justify-center whitespace-nowrap rounded-sm px-5 py-1.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff4fa3] focus-visible:ring-offset-2 ${active ? 'font-semibold text-black' : 'text-white/60 hover:text-white'}`}>{label}</button>
          })}
        </div>
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={() => requireLogin(() => setCreateOpen(true))} className="inline-flex h-[43px] min-w-[98px] items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[#ff4fa3] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-[#ff4fa3]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff4fa3] focus-visible:ring-offset-2">Create</button>
          <button type="button" onClick={() => requireLogin()} className="inline-flex h-[43px] min-w-[92px] items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[hsl(233_16%_22%)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[hsl(233_16%_26%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2">History</button>
        </div>
      </div>
      <div className="mines-game-list flex flex-col gap-2" />
    </div>
    {createOpen ? <MinesCreateModal gameMode={gameMode} onClose={() => setCreateOpen(false)} /> : null}
  </div>
}
