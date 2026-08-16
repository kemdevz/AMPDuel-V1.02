import { useEffect, useMemo, useRef, useState } from 'react'
import WalletModal from '../components/InventoryModal'
import { notifications } from '../components/Notifications'
import { useSocket } from '../lib/socket'
import { useAuth } from '../store/auth'

const COIN_ICON = '/bobux.png'
const JACKPOT_SPIN_MS = 10_000

function formatPotValue(value) {
  const amount = Number(value || 0)
  if (amount >= 1000000) return `${Number((amount / 1000000).toFixed(1))}M`
  if (amount >= 1000) return `${Number((amount / 1000).toFixed(1))}K`
  return amount > 0 ? amount.toLocaleString() : '0.0'
}

const JACKPOT_COLORS = ['#6c63ff', '#FFD700', '#22c55e', '#ef4444', '#38bdf8', '#f97316']

function sectorPath(share) {
  if (share >= 0.999999) return null
  const angle = Math.max(0, Math.min(1, share)) * Math.PI * 2
  const x = 95 * Math.sin(angle)
  const y = 95 * Math.cos(angle)
  return `M0,0 V95 A95 95 0 ${share > 0.5 ? 1 : 0} 0 ${x},${y} Z`
}

export default function Jackpot() {
  const user = useAuth((state) => state.user)
  const socket = useSocket()
  const [joinOpen, setJoinOpen] = useState(false)
  const [round, setRound] = useState({ entrants: [], endsAt: null })
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [joining, setJoining] = useState(false)
  const [showWinner, setShowWinner] = useState(false)
  const [isSpinning, setIsSpinning] = useState(false)
  const [displayRotation, setDisplayRotation] = useState(0)
  const rollAudioRef = useRef(null)
  const settledWalletRoundRef = useRef('')
  const countdownAnchorRef = useRef({ remainingMs: 0, receivedAt: 0 })

  const entrants = Array.isArray(round.entrants) ? round.entrants : []
  const potValue = entrants.reduce((sum, entrant) => sum + Number(entrant.value || 0), 0)
  const currentProfileId = String(user?.profile_id || user?.id || '')
  const hasJoined = Boolean(currentProfileId) && entrants.some((entrant) => String(entrant.profileId) === currentProfileId)
  const wheelSegments = useMemo(() => {
    let rotation = 0
    return entrants.map((entrant, index) => {
      const share = potValue > 0 ? Number(entrant.value || 0) / potValue : 1 / Math.max(entrants.length, 1)
      const segment = { entrant, share, rotation, color: entrant.color || JACKPOT_COLORS[index % JACKPOT_COLORS.length] }
      rotation -= share * 360
      return segment
    })
  }, [entrants, potValue])
  const targetWheelRotation = useMemo(() => {
    if (!round.result || !round.winnerId) return 0
    const winnerSegment = wheelSegments.find((segment) => String(segment.entrant?.profileId) === String(round.winnerId))
    if (!winnerSegment) return -3600
    const winnerMidpoint = Math.abs(winnerSegment.rotation) + winnerSegment.share * 180
    return -(winnerMidpoint + 3600)
  }, [round.result, round.winnerId, wheelSegments])

  useEffect(() => {
    if (!socket) return undefined
    let active = true
    const handleState = (nextRound) => {
      if (!active || !nextRound) return
      setRound(nextRound)
    }
    const requestState = () => socket.emit('jackpot:state:get', handleState)
    socket.on('jackpot:state', handleState)
    socket.on('connect', requestState)
    requestState()
    const refreshTimer = window.setInterval(requestState, 5000)
    return () => {
      active = false
      window.clearInterval(refreshTimer)
      socket.off('jackpot:state', handleState)
      socket.off('connect', requestState)
    }
  }, [socket])

  useEffect(() => {
    const serverNow = Number(round.serverNow)
    const endsAt = Number(round.endsAt)
    const suppliedRemaining = Number(round.remainingMs)
    const remainingMs = Number.isFinite(suppliedRemaining)
      ? Math.max(0, suppliedRemaining)
      : Number.isFinite(serverNow) && Number.isFinite(endsAt)
        ? Math.max(0, endsAt - serverNow)
        : 0
    countdownAnchorRef.current = { remainingMs, receivedAt: performance.now() }

    const updateCountdown = () => {
      const elapsed = Math.max(0, performance.now() - countdownAnchorRef.current.receivedAt)
      const remaining = Math.max(0, Math.ceil((countdownAnchorRef.current.remainingMs - elapsed) / 1000))
      setSecondsLeft(remaining)
    }
    updateCountdown()
    if (!round.endsAt) return undefined
    const timer = window.setInterval(updateCountdown, 250)
    return () => window.clearInterval(timer)
  }, [round.endsAt, round.remainingMs, round.serverNow])

  useEffect(() => {
    setShowWinner(false)
    setIsSpinning(false)
    setDisplayRotation(0)
    if (!round.result) {
      if (rollAudioRef.current) {
        rollAudioRef.current.pause()
        rollAudioRef.current.currentTime = 0
      }
      return undefined
    }

    const audio = new Audio('/money-D3u6qQYl.mp3')
    rollAudioRef.current = audio
    let secondFrame = 0
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        setIsSpinning(true)
        setDisplayRotation(targetWheelRotation)
        void audio.play().catch(() => undefined)
      })
    })
    const winnerTimer = window.setTimeout(() => {
      setIsSpinning(false)
      setShowWinner(true)
    }, JACKPOT_SPIN_MS + 100)
    return () => {
      window.cancelAnimationFrame(firstFrame)
      if (secondFrame) window.cancelAnimationFrame(secondFrame)
      window.clearTimeout(winnerTimer)
      audio.pause()
      audio.currentTime = 0
    }
  }, [round.id, round.result, targetWheelRotation])

  useEffect(() => {
    if (!round.result || !round.id || settledWalletRoundRef.current === round.id) return
    settledWalletRoundRef.current = round.id
    window.dispatchEvent(new CustomEvent('wallet:updated'))
  }, [round.id, round.result])

  return (
    <div className="relative z-0 box-border flex-[1_1_auto] overflow-y-auto rounded-t-[0.5rem] [&::-webkit-scrollbar]:hidden">
      <style>{`
        .jackpot-button{position:relative;isolation:isolate;display:inline-flex;height:42px;min-width:120px;align-items:center;justify-content:center;box-sizing:border-box;padding:0 16px;border-radius:8px;color:#fff;font-family:Poppins,sans-serif;font-size:.9rem;font-weight:600;letter-spacing:.01em;cursor:pointer;transform-origin:center;transition:opacity .2s ease,transform .1s ease,background .25s ease}.jackpot-button-primary{border:1px solid rgba(94,85,217,.4);background:linear-gradient(135deg,#5b52e2,#4038c0);box-shadow:0 2px 8px rgba(108,99,255,.2)}.jackpot-button-primary:hover:not(:disabled){background:linear-gradient(135deg,#6c63ff,#5147d9);opacity:.95}.jackpot-button:active:not(:disabled){transform:scale(.97)}.jackpot-button:focus-visible{outline:2px solid #8079ff;outline-offset:2px}.jackpot-button:disabled{cursor:not-allowed;opacity:.6;transform:none}.jackpot-join-action._withdrawButton_cpcgp_387{min-width:190px!important;height:42px!important;min-height:42px!important;padding:0 16px!important;border-radius:8px!important;font-family:Poppins,sans-serif!important;font-size:.9rem!important;font-weight:600!important}.jackpot-join-label{display:flex;align-items:center;justify-content:center}.jackpot-join-divider{width:1px;height:16px;margin:0 8px;background:rgba(255,255,255,.28)}.jackpot-join-value{display:inline-flex;align-items:center}.jackpot-join-value img{width:15px;height:15px;margin-right:5px;flex-shrink:0}.jackpot-entry-name{min-width:0;max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.jackpot-entry-items{display:grid;width:100%;grid-template-columns:repeat(5,56px);gap:6px;justify-content:start}.jackpot-entry-item{position:relative;display:block;width:56px;height:56px;box-sizing:border-box;overflow:hidden;border:2px solid #2f3347;border-radius:5px;background:#141323;cursor:pointer;transition:border-color .2s ease,transform .16s ease}.jackpot-entry-item:hover{z-index:2;border-color:#6c63ff;transform:translateY(-1px)}.jackpot-entry-item img{display:block;width:100%;height:100%;object-fit:contain;transform:scale(1.1)}
        ._blurbg_cpcgp_1{z-index:10000!important;animation-duration:.5s!important}._modalbackgroundinventory_cpcgp_15{width:90%!important;max-width:1200px!important;padding:15px!important;border:1px solid #181a28!important;border-radius:10px!important;background-color:#131520!important;align-items:flex-start!important;overflow-y:auto!important}._headerinventory_cpcgp_43{justify-content:flex-start!important;gap:12px!important;margin-top:5px!important;margin-bottom:10px!important}._walletHeaderControls_cpcgp_local{gap:6px!important}._inputWrapper_cpcgp_59{width:300px!important}
        ._inputv3_cpcgp_65{width:300px!important;height:40px!important;padding:10px 18px 10px 40px!important;border:none!important;border-radius:6px!important;background:#1c1f2e!important;box-shadow:none!important;color:#fff!important;font-family:Poppins,sans-serif!important;font-size:.9rem!important;opacity:1!important;text-align:left!important}._inputv3_cpcgp_65::placeholder{color:#cbd5e1!important;text-align:left!important}._searchIcon_cpcgp_82{left:12px!important;width:18px!important;height:18px!important}._sortToggle_cpcgp_487{background:#20222f!important}
        @media(max-width:640px){.jackpot-button{height:38px;min-width:0;padding-inline:12px}.jackpot-join-action._withdrawButton_cpcgp_387{min-width:0!important;flex:1!important}._inputWrapper_cpcgp_59{width:auto!important}._inputv3_cpcgp_65{width:100%!important}.jackpot-entry-items{grid-template-columns:repeat(auto-fill,56px)}}
      `}</style>
      <div
        className="relative z-10 flex min-h-full items-center justify-center lg:min-h-[calc(100dvh-5rem)]"
        style={{
          background: "linear-gradient(rgba(29, 32, 47, 0.82), rgba(29, 32, 47, 0.94)), url('/site-background.png') center center / cover",
        }}
      >
        <div className="box-border flex h-full w-full flex-wrap items-center justify-center gap-8 p-4">
          <div className="mx-auto grid aspect-square w-fit origin-center place-items-center [grid-template-areas:'stack']">
            <svg viewBox="-100 -100 200 200" className="w-[min(84vw,32rem)] [grid-area:stack]" fill="none">
              <defs>
                <mask id="mask" maskUnits="userSpaceOnUse" x="-100" y="-100">
                  <rect x="-100" y="-100" width="200" height="200" fill="white" />
                  <path d="M0,-56 L-6.2652572265624755,-47.5893533459429 A48 48 0 0 1 6.2652572265624755,-47.5893533459429 Z" fill="black" />
                  <circle r="48.5" cx="0" cy="0" fill="black" />
                </mask>
                <filter id="neon-glow-0" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-1" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-2" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-3" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-4" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-5" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-6" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-7" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-8" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-9" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-10" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-11" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-12" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-13" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-14" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-15" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-16" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-17" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-18" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-19" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-20" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-21" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-22" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-23" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-24" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-25" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-26" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-27" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-28" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-29" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-30" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-31" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-32" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-33" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-34" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-35" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-36" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-37" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-38" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-39" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-40" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-41" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-42" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-43" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-44" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-45" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-46" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-47" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-48" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-49" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-50" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-51" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <g mask="url(#mask)">
                <g transform="matrix(1 0 0 -1 0 0)">
                  <g
                    style={{
                      transform: `rotate(${displayRotation}deg)`,
                      transformBox: 'fill-box',
                      transformOrigin: 'center',
                      transition: isSpinning ? `transform ${JACKPOT_SPIN_MS}ms cubic-bezier(0.12, 0.72, 0.12, 1)` : 'none',
                    }}
                    onTransitionEnd={(event) => {
                      if (event.propertyName !== 'transform' || !round.result) return
                      setIsSpinning(false)
                      setShowWinner(true)
                    }}
                  >
                  {(wheelSegments.length ? wheelSegments : [{ share: 1, rotation: 0, color: '#6c63ff', entrant: null }]).map((segment, index) => {
                    const middleAngle = segment.share * 180
                    const avatarX = 72.5 * Math.sin(middleAngle * Math.PI / 180)
                    const avatarY = 72.5 * Math.cos(middleAngle * Math.PI / 180)
                    return (
                      <g key={segment.entrant?.profileId || `empty-${index}`} transform={`rotate(${segment.rotation})`}>
                        {segment.share >= 0.999999
                          ? <circle r="95" fill={segment.color} style={{ filter: `url("#neon-glow-${index}")`, opacity: 0.9, transition: 'filter 1.5s ease-in-out, opacity 1.5s ease-in-out' }} />
                          : <path d={sectorPath(segment.share)} fill={segment.color} style={{ filter: `url("#neon-glow-${index}")`, transition: 'filter 1.5s ease-in-out, opacity 1.5s ease-in-out' }} />}
                        {segment.entrant ? <image href={segment.entrant.avatar || '/ps99-cat.png'} width="20" height="20" x="-10" y="-10" transform={`translate(${avatarX}, ${avatarY}) rotate(${-middleAngle}) scale(1,-1)`} style={{ clipPath: 'circle(50%)' }} /> : null}
                      </g>
                    )
                  })}
                  </g>
                </g>
                <g strokeWidth="2">
                  <circle r="49" fill="none" stroke="#343c44" />
                  <path d="M0,-58 L-6.526309611002579,-49.57224306869052 A50 50 0 0 1 6.526309611002579,-49.57224306869052 Z" fill="#343c44" />
                </g>
              </g>
            </svg>
            <div className="box-border grid aspect-square place-content-center gap-1 rounded-full p-2 [grid-area:stack]" style={{ width: '50%' }}>
              <h1 className={`flex items-center justify-center gap-1 font-extrabold tracking-tight${entrants.length ? ' text-xl md:text-2xl' : ' text-lg md:text-xl'}`}>
                <img src="/bobux.png" alt="Bobux" className={entrants.length ? 'aspect-square w-5 md:w-6 text-[#0276FF]' : 'aspect-square w-4 md:w-5 text-[#0276FF]'} />
                <span>{formatPotValue(potValue)}</span>
              </h1>
              <div className="text-center text-base font-semibold text-white">
                {round.result
                  ? showWinner ? `🎉 ${round.winnerUsername || 'Player'}` : 'Rolling...'
                  : `${entrants.length} | ${secondsLeft}s`}
              </div>
            </div>
          </div>

          <div className="flex h-[32rem] w-[min(90vw,22rem)] flex-col items-center justify-center rounded-lg border border-solid border-[#22283F] bg-[#171925] pt-2 text-center box-border">
            <div className="mx-auto box-border flex w-full flex-1 flex-col gap-2 overflow-y-auto px-2">
              {entrants.map((entrant, entrantIndex) => {
                const chance = potValue > 0 ? (Number(entrant.value || 0) / potValue) * 100 : 0
                return (
                <div key={entrant.profileId || `entrant-${entrantIndex}`} className="m-0 box-border flex flex-col rounded-lg border border-solid border-[#22283F] bg-[#1A1D2B] p-4 transition-transform duration-200 ease-in-out">
                  <div className="mb-2 flex items-center justify-start">
                    <div className="flex min-w-0 items-center">
                      <img src={entrant.avatar || '/ps99-cat.png'} alt="User Profile Picture" className="mr-4 h-[clamp(30px,4vw,40px)] w-[clamp(30px,4vw,40px)] cursor-pointer rounded-full border-2 border-solid border-[rgba(255,255,255,0.08)] bg-[#1c1f2e] hover:border-[#6c63ff] hover:opacity-90" />
                      <p className="jackpot-entry-name ml-[-8px] mr-[10px] shrink-0 rounded-full px-[5px] py-[0.5px]" style={{ background: entrant.color || JACKPOT_COLORS[entrantIndex % JACKPOT_COLORS.length], color: '#191818', fontWeight: 600 }}>{entrant.username || 'Player'}</p>
                      <p className="shrink-0 text-[clamp(14px,1.5vw,16px)] font-medium text-[#E1E4F2]">{Number(chance.toFixed(2))}%</p>
                    </div>
                  </div>
                  <div className="jackpot-entry-items">
                    {(entrant.items || []).map((item, index) => (
                      <button type="button" key={item.id || `${item.name}-${index}`} className="jackpot-entry-item" title={item.name || 'Item'}>
                        <img src={item.image_url || item.image || '/ps99-cat.png'} alt={item.name || 'Item'} />
                      </button>
                    ))}
                  </div>
                </div>
                )
              })}
            </div>
            <div className="flex items-center justify-center gap-3 p-4">
              <button type="button" disabled={hasJoined || joining || round.result || (entrants.length > 0 && secondsLeft === 0)} onClick={() => setJoinOpen(true)} className="jackpot-button jackpot-button-primary">
                {round.result ? (showWinner ? 'Starting soon...' : 'Rolling...') : `Enter (${secondsLeft}s)`}
              </button>
            </div>
          </div>
        </div>
      </div>
      <WalletModal
        isOpen={joinOpen}
        onClose={() => setJoinOpen(false)}
        ariaLabel="Join jackpot"
        footer={({ selectedItems, selectedAmount, selectedValue, totalItems, onToggleSelectAll }) => (
          <>
            <button type="button" className="_flatActionBtn_cpcgp_373" disabled={totalItems === 0} onClick={onToggleSelectAll}>
              {selectedAmount === totalItems ? 'Unselect All' : 'Select all'}
            </button>
            <button type="button" className="_withdrawButton_cpcgp_387 jackpot-join-action" disabled={selectedAmount === 0 || selectedAmount > 20 || hasJoined || joining} onClick={() => {
              if (!socket) {
                notifications.error('Jackpot is reconnecting. Please try again.')
                return
              }
              setJoining(true)
              socket.emit('jackpot:join', { item_ids: selectedItems.map((item) => item.id).filter(Boolean) }, (response) => {
                setJoining(false)
                if (!response?.ok) {
                  notifications.error(response?.error || 'Unable to join the jackpot.')
                  return
                }
                if (response.round) setRound(response.round)
                setJoinOpen(false)
                window.dispatchEvent(new CustomEvent('wallet:updated'))
              })
            }}>
              <strong className="jackpot-join-label">{selectedAmount > 20 ? 'Max 20 items' : 'Join'}<span className="jackpot-join-divider" /><span className="jackpot-join-value"><img src={COIN_ICON} alt="Bobux" /><span>{Number(selectedValue || 0).toLocaleString()}</span></span></strong>
            </button>
          </>
        )}
      />
    </div>
  )
}
