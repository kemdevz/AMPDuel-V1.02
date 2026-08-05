import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { MinesIcon } from '../components/icons'
import { apiRequest } from '../lib/apiClient'
import { notifications } from '../components/Notifications'
import { useAuth } from '../store/auth'

const GRID_SIZES = [5, 6, 7, 8]
const DEFAULT_BET = 5000
const MIN_BET = 5000
const MAX_BET = 10000000
const SMALL_BOMB_IMAGE = '/mines-bomb.png'
const REVEALED_GEM_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAASSSURBVHgB7ZnBbhtVFIb/e8dVhANthARNEEJmAaui2PAC9Rs0T0D7Bh61sK37AMgtEkvU9gnSF0BkD1JHtGLDIsMCGhKJuGoaktrjyz1jbNljz8y9c88YVZ1vZcfjGZ9//v/cuSdARUVFRUVFxZuKgCWfH327C4VrYODiBf0D6gr70QhMBGHdb9l8Qdoc3Dy6d5ur+JqW/pO3JT6tefFrJpqNk17P5gvGl24e9poS3mMw0VgX+OCtsf4H2gE/D4ZgQ2EnXPcfmRxq5IDms15DKLkLJsj6k+KJTU/ismdlxjzuN457DZMDja4qpOwKIRpgYGL9JE3OKAhsYA1GNyxXAMq9Lv5LMPFhXWDNW6z0ghBahBoYMeoHmZqT9aXn7YMJsv6VS17mMT/pXvAX36oARGiH7/h7aR+nOiDOvZQ/gok06y9cl3dVoAp3s/pB6i/izD2RZv0k7FEY94P7aR8vFaB50Otw5j7Z9fMoYVW4mtYPFm4Jd+7Jztsb0ujuzzJQCj+8GmCowMeSfjAnc3O/t8GZe8LU+klKWBUAb/H5YE4AUZd3OXNva/0kJUShkewH07Nz554w6fp5sK8KcT/4pjN5E586XvI8+VhAbIAJsv5HdZ67x75XIP7rByLOfV0Xz2j9NV33F+964IT9AQkIcY6WxLq4zVk8ceUSa25jSogC9YPd2uhZ9DwSEbio6aZ18b0tcLOmi986PcSL4QB8qN/lL9s3u0qpe2BiqG3698tzcHMWRdzFPwwu+9djrz7dvtWBUg/BxNHzU3BzeM56zgCniFeCaVifbN+6ziXCH/2X4Obg7B8woYtX7eBjv09v5rqVN/I6QokAjnDHgNH+IUZqZ1I8MSdA0PL7ciTaHCJwxoDJ/lR8O9jyw9k/LqxXUxEgQjjAGQMG+y8tnli6YMciRG4icMWAwf6pxROpTyxahNBVBI4YONlfoJ9VPJH5yOYqAkcMCtufikd28UTuMyuJMIyGO/plH5a4xsDN/rr49/3cZm700P5r6+sgiqI2CojgEoPC9h+pGybFE8a7FhJBidEOLHGJQSH7U/Fb/gPTw622bU8/+2pP76Nv2HynaAwK2X+k7tgUT1jvW5+0bj6wFaFIDKztPy6+C0sKbdxJBKFwx/T4IjGwsn/B4onCkwvaRpuKYBsDK/s7FE84jW5sRLCJgbH99RzDpXjCeXZlKoJNDMzsrwcam34HjrAM70iEvFmCaQyM7C/xiKY5YIBtemkyUDGJgYH9A5woq1UoC9bxLYmQNUswiUGO/eemORywz6+zBip5Mcix/8I0hwN2AfIGKlkxyLB/mLetLQr/fzCQPVDJisHRq6XuKK14ohQBiLRZQloMyP79RQFKLZ4oTQAiTYRlMTgeJIo3mOZwUKoAxEQEzMwSlsXgz7MZUQynORyULgBBIswOVJIxWLB/pLu94UDDlZUIQCSnSrMxmLP/eKCxhxWxMgEIEkHPEnx6PRuDqf2V8m0HGq6sVABiMlCZxGBqf9rWbvp3sWJWLgAxGagcn5yN7e+4p39tufrbd91rL77voqKioqLi/+FfGaqckYdgVycAAAAASUVORK5CYII='
const MINES_SOUND_URLS = {
  gem0: '/Gem-LRZteFQ0.mp3',
  gem1: '/Gem-LRZteFQ0.mp3',
  gem2: '/Gem-LRZteFQ0.mp3',
  mine: '/mine-DwyaPDKk.mp3',
}

function normalizeAmount(value) {
  const digits = String(value || '').replace(/\D/g, '')
  return Math.max(0, Number(digits || 0))
}
function formatAmount(value) {
  return Math.max(0, Number(value || 0)).toLocaleString('en-US')
}

function clampBet(value) {
  return Math.min(MAX_BET, Math.max(MIN_BET, Math.floor(Number(value) || MIN_BET)))
}

function getMinesErrorMessage(error, fallback) {
  if (error?.status === 401) return 'Please sign in to play Mines.'

  const message = String(typeof error === 'string' ? error : error?.message || '')
    .replace(/^Error:\s*/i, '')
    .trim()

  if (
    !message ||
    /failed to fetch|networkerror|network request failed|load failed|request failed|supabase|failed to parse/i.test(message)
  ) {
    return fallback
  }

  return message
}

function createRandomMinesClientSeed() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const values = new Uint32Array(12)
  window.crypto.getRandomValues(values)
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join('')
}

function MinesFairnessCopy({ label, value }) {
  const copy = async () => {
    if (!value || value === 'Unavailable') return
    try {
      await navigator.clipboard.writeText(String(value))
      notifications.success(`${label} copied to clipboard!`)
    } catch {
      notifications.error('Unable to copy to clipboard.')
    }
  }
  return (
    <button className="minesFairnessCopy" type="button" aria-label={`Copy ${label}`} onClick={() => { void copy() }}>
      <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    </button>
  )
}

function MinesFairnessModal({ fairness, loading, gameActive, onSave, onClose }) {
  const [draftSeed, setDraftSeed] = useState(fairness?.client_seed || '')
  const [saving, setSaving] = useState(false)
  const [closing, setClosing] = useState(false)
  const [revealed, setRevealed] = useState(null)
  const closeTimerRef = useRef(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => {
    if (fairness?.client_seed) setDraftSeed(fairness.client_seed)
  }, [fairness?.client_seed])

  const requestClose = useCallback(() => {
    if (closeTimerRef.current) return
    setClosing(true)
    closeTimerRef.current = window.setTimeout(() => onCloseRef.current(), 180)
  }, [])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event) => { if (event.key === 'Escape') requestClose() }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    }
  }, [requestClose])

  const changeSeed = async () => {
    const nextSeed = draftSeed.trim()
    if (!nextSeed || nextSeed.length > 128 || saving || gameActive) return
    setSaving(true)
    try {
      const result = await onSave(nextSeed)
      setRevealed({
        serverSeed: result.previous_server_seed,
        clientSeed: result.previous_client_seed,
        nonce: Number(result.previous_nonce || 0),
      })
    } finally {
      setSaving(false)
    }
  }

  const serverSeedHash = fairness?.server_seed_hash || (loading ? 'Loading...' : 'Unavailable')
  const nonce = fairness?.nonce ?? (loading ? 'Loading...' : 'Unavailable')

  return (
    <div className={`minesFairnessBackdrop${closing ? ' isClosing' : ''}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose() }}>
      <section className={`minesFairnessModal${closing ? ' isClosing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="mines-fairness-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="minesFairnessClose" type="button" onClick={requestClose} aria-label="Close Mines Fairness">×</button>
        <h1 id="mines-fairness-title" className="minesFairnessHeader">Mines Fairness</h1>
        <p className="minesFairnessHint">Single-player house games use a separate provably-fair system that keeps you in full control, the active server seed stays hidden, only its hash is shown. Changing your client seed generates a brand-new server seed and reveals the previous one, so you can verify all your past games.</p>

        <div className="minesFairnessSection">
          <span className="minesFairnessSectionTitle">Hashed Server Seed</span>
          <div className="minesFairnessInputHolder">
            <span className="minesFairnessValue" title={serverSeedHash}>{serverSeedHash}</span>
            <MinesFairnessCopy label="Hashed Server Seed" value={serverSeedHash} />
          </div>
        </div>

        <div className="minesFairnessSection">
          <span className="minesFairnessSectionTitle">Client Seed</span>
          <div className="minesFairnessSeedRow">
            <input className="minesFairnessSeedInput" type="text" maxLength={128} autoComplete="off" spellCheck={false} value={draftSeed} disabled={loading || saving || gameActive} onChange={(event) => setDraftSeed(event.target.value)} />
            <button className="minesFairnessRandom" type="button" disabled={loading || saving || gameActive} onClick={() => setDraftSeed(createRandomMinesClientSeed())}>Random</button>
          </div>
        </div>

        <div className="minesFairnessSection">
          <span className="minesFairnessSectionTitle">Nonce</span>
          <div className="minesFairnessInputHolder">
            <span className="minesFairnessValue">{nonce}</span>
            <MinesFairnessCopy label="Nonce" value={nonce} />
          </div>
        </div>

        <button className="minesFairnessSave" type="button" disabled={loading || saving || gameActive || !draftSeed.trim()} onClick={() => { void changeSeed() }}>{saving ? 'Changing Seed...' : 'Change Seed'}</button>
        <p className="minesFairnessNote">Entering the same client seed still rotates the server seed (and reveals the old one). You can&apos;t change it while a game is active.</p>

        {revealed ? (
          <div className="minesFairnessReveal">
            <span className="minesFairnessRevealTitle">Previous Server Seed</span>
            <span className="minesFairnessRevealDescription">This seed is now retired. Use it together with the client seed, nonce below to verify your past games.</span>
            <div className="minesFairnessInputHolder minesFairnessRevealValue">
              <span className="minesFairnessValue" title={revealed.serverSeed}>{revealed.serverSeed}</span>
              <MinesFairnessCopy label="Previous Server Seed" value={revealed.serverSeed} />
            </div>
            <div className="minesFairnessRevealMeta">
              <span>Client Seed: <b>{revealed.clientSeed}</b></span>
              <span>Nonce: <b>{revealed.nonce}</b></span>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}

export default function Mines() {
  const user = useAuth((state) => state.user)
  const authLoading = useAuth((state) => state.loading)
  const balance = useAuth((state) => state.balance)
  const setBalance = useAuth((state) => state.setBalance)
  const setAuthModalOpen = useAuth((state) => state.setAuthModalOpen)
  const [amount, setAmount] = useState(DEFAULT_BET)
  const [mineCount, setMineCount] = useState(3)
  const [gridSize, setGridSize] = useState(5)
  const [muted, setMuted] = useState(false)
  const [game, setGame] = useState(null)
  const [revealedPositions, setRevealedPositions] = useState([])
  const [cellResults, setCellResults] = useState({})
  const [pendingPosition, setPendingPosition] = useState(null)
  const [loading, setLoading] = useState(false)
  const [restoringGame, setRestoringGame] = useState(true)
  const [fairnessOpen, setFairnessOpen] = useState(false)
  const [fairness, setFairness] = useState(null)
  const [fairnessLoading, setFairnessLoading] = useState(false)
  const requestInFlight = useRef(false)
  const soundsRef = useRef({})
  const cells = useMemo(() => Array.from({ length: gridSize * gridSize }, (_, index) => index), [gridSize])
  const maxMineCount = Math.min(63, gridSize * gridSize - 1)
  const sliderPercentage = ((mineCount - 1) / Math.max(1, maxMineCount - 1)) * 100
  const userId = user?.profile_id || user?.id || ''
  const isGameActive = game?.game_state === 'active'
  const safeRevealCount = revealedPositions.filter((position) => !game?.mine_positions?.includes(position)).length
  const uiBusy = loading || restoringGame
  const canCashOut = isGameActive && safeRevealCount > 0 && !uiBusy
  const displayedMultiplier = Number(game?.multiplier || 1)
  const displayedCashout = safeRevealCount > 0 ? Number(game?.current_value || 0) : 0

  useEffect(() => {
    const sounds = {}
    Object.entries(MINES_SOUND_URLS).forEach(([name, url]) => {
      const audio = new Audio(url)
      audio.preload = 'auto'
      audio.volume = 0.3
      audio.muted = muted
      audio.load()
      sounds[name] = audio
    })
    soundsRef.current = sounds

    return () => {
      Object.values(sounds).forEach((audio) => {
        audio.pause()
        audio.src = ''
      })
    }
  }, [])

  useEffect(() => {
    Object.values(soundsRef.current).forEach((audio) => {
      audio.muted = muted
      audio.volume = 0.3
    })
  }, [muted])

  useEffect(() => {
    if (authLoading) return undefined

    if (!userId) {
      setGame(null)
      setRevealedPositions([])
      setCellResults({})
      setRestoringGame(false)
      return undefined
    }

    const controller = new AbortController()
    setGame(null)
    setRevealedPositions([])
    setCellResults({})
    setRestoringGame(true)

    apiRequest('/api/mines/state', { signal: controller.signal, cache: 'no-store' })
      .then((response) => {
        if (controller.signal.aborted) return

        const restoredGame = response?.game
        if (!restoredGame || restoredGame.game_state !== 'active') return

        const restoredGridSize = Number(restoredGame.grid_size)
        const restoredMineCount = Number(restoredGame.mines_count)
        const restoredAmount = Number(restoredGame.wager_value)
        const restoredPositions = Array.isArray(restoredGame.revealed_positions)
          ? restoredGame.revealed_positions.map(Number).filter(Number.isInteger)
          : []

        if (GRID_SIZES.includes(restoredGridSize)) setGridSize(restoredGridSize)
        if (Number.isInteger(restoredMineCount) && restoredMineCount > 0) setMineCount(restoredMineCount)
        if (Number.isFinite(restoredAmount) && restoredAmount > 0) setAmount(restoredAmount)
        setGame({ ...restoredGame, revealed_positions: restoredPositions })
        setRevealedPositions(restoredPositions)
        setCellResults(Object.fromEntries(restoredPositions.map((position) => [position, 'gem'])))
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') {
          notifications.error(getMinesErrorMessage(error, 'Unable to restore your Mines game. Please refresh and try again.'))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setRestoringGame(false)
      })

    return () => controller.abort()
  }, [authLoading, userId])

  const playMinesSound = useCallback((name) => {
    const audio = soundsRef.current[name]
    if (!audio || muted) return
    Object.entries(soundsRef.current).forEach(([soundName, otherAudio]) => {
      if (soundName === name) return
      otherAudio.pause()
      otherAudio.currentTime = 0
    })
    audio.currentTime = 0
    void audio.play().catch(() => undefined)
  }, [muted])

  const updateMineCount = (value) => {
    setMineCount(Math.min(maxMineCount, Math.max(1, Number(value) || 1)))
  }

  const openFairness = async () => {
    if (!user) {
      setAuthModalOpen(true)
      return
    }
    setFairnessOpen(true)
    setFairnessLoading(true)
    try {
      const response = await apiRequest('/api/mines/fairness', { cache: 'no-store' })
      if (!response.ok) throw new Error(response.error || 'Unable to load Mines fairness.')
      setFairness(response.fairness)
    } catch (error) {
      notifications.error(getMinesErrorMessage(error, 'Unable to load Mines fairness.'))
    } finally {
      setFairnessLoading(false)
    }
  }

  const rotateFairnessSeed = async (clientSeed) => {
    try {
      const response = await apiRequest('/api/mines/fairness/rotate', {
        method: 'POST',
        body: JSON.stringify({ client_seed: clientSeed }),
      })
      if (!response.ok) throw new Error(response.error || 'Unable to change Mines fairness seed.')
      setFairness({
        seed_id: response.fairness.seed_id,
        server_seed_hash: response.fairness.server_seed_hash,
        client_seed: response.fairness.client_seed,
        nonce: Number(response.fairness.nonce || 0),
      })
      notifications.success('Mines fairness seed changed.')
      return response.fairness
    } catch (error) {
      notifications.error(getMinesErrorMessage(error, 'Unable to change Mines fairness seed.'))
      throw error
    }
  }

  const createGame = async () => {
    if (requestInFlight.current || restoringGame) return
    if (!user) {
      setAuthModalOpen(true)
      return
    }
    if (!Number.isInteger(amount) || amount < MIN_BET || amount > MAX_BET) {
      notifications.error(`Amount must be between ${formatAmount(MIN_BET)} and ${formatAmount(MAX_BET)}.`)
      return
    }
    if (amount > Number(balance || 0)) {
      notifications.insufficientCoins()
      return
    }
    if (mineCount >= gridSize * gridSize) {
      notifications.error('The board must have at least one safe tile.')
      return
    }

    requestInFlight.current = true
    setLoading(true)
    try {
      const response = await apiRequest('/api/mines/create', {
        method: 'POST',
        body: JSON.stringify({
          wager_value: amount,
          mines_count: mineCount,
          grid_size: gridSize,
        }),
      })
      if (response.ok) {
        setGame(response.game)
        setFairness((current) => current ? { ...current, nonce: Number(current.nonce || 0) + 1 } : current)
        setRevealedPositions([])
        setCellResults({})
        setBalance(Math.max(0, Number(balance || 0) - amount))
        window.dispatchEvent(new CustomEvent('wallet:updated'))
        notifications.success('Successfully started game.')
      } else {
        notifications.error(getMinesErrorMessage(response.error, 'Unable to start Mines. Please try again.'))
      }
    } catch (err) {
      notifications.error(getMinesErrorMessage(err, 'Unable to start Mines. Please try again.'))
    } finally {
      requestInFlight.current = false
      setLoading(false)
    }
  }

  const revealPosition = async (position) => {
    if (requestInFlight.current || restoringGame || !game || game.game_state !== 'active' || revealedPositions.includes(position)) return

    requestInFlight.current = true
    setPendingPosition(position)
    setLoading(true)
    try {
      const response = await apiRequest('/api/mines/reveal', {
        method: 'POST',
        body: JSON.stringify({
          game_id: game.id,
          position,
        }),
      })
      if (response.ok) {
        const isMine = response.is_mine === true
        setCellResults((current) => ({ ...current, [position]: isMine ? 'bomb' : 'gem' }))
        setGame(response.game)
        setRevealedPositions(response.game.revealed_positions)
        if (isMine) {
          playMinesSound('mine')
        } else {
          const totalSafeCells = gridSize * gridSize - Number(response.game.mines_count || mineCount)
          const progress = response.game.revealed_positions.length / Math.max(1, totalSafeCells)
          playMinesSound(progress < 1 / 3 ? 'gem0' : progress < 2 / 3 ? 'gem1' : 'gem2')
        }
      } else {
        notifications.error(getMinesErrorMessage(response.error, 'Unable to reveal that tile. Please try again.'))
      }
    } catch (err) {
      notifications.error(getMinesErrorMessage(err, 'Unable to reveal that tile. Please try again.'))
    } finally {
      requestInFlight.current = false
      setPendingPosition(null)
      setLoading(false)
    }
  }

  const cashOut = async () => {
    if (requestInFlight.current || !canCashOut) return

    requestInFlight.current = true
    setLoading(true)
    try {
      const response = await apiRequest('/api/mines/cashout', {
        method: 'POST',
        body: JSON.stringify({
          game_id: game.id,
        }),
      })
      if (response.ok) {
        setGame(response.game)
        const returnedBalance = Number(response.balance)
        setBalance(Number.isFinite(returnedBalance)
          ? returnedBalance
          : Number(balance || 0) + Number(response.winnings || 0))
        window.dispatchEvent(new CustomEvent('wallet:updated'))
      } else {
        notifications.error(getMinesErrorMessage(response.error, 'Unable to cash out. Please try again.'))
      }
    } catch (err) {
      notifications.error(getMinesErrorMessage(err, 'Unable to cash out. Please try again.'))
    } finally {
      requestInFlight.current = false
      setLoading(false)
    }
  }

  return (
    <div className={`mines-page main-container relative z-10 ${isGameActive ? 'mines-page-active' : ''}`}>
      <style>{`
        .mines-page {
          --header-height: 5rem;
          --accent: #6c63ff;
          --accent-light: #8079ff;
          --accent-dark: #5a51e6;
          --accent-gradient: linear-gradient(180deg, var(--accent-light) 0%, var(--accent) 45%, var(--accent-dark) 100%);
          --surface-0: #131520;
          --surface-1: #1c1f2e;
          --text-primary: #c7cce2;
          --text-secondary: #a6b2d3;
          --text-muted: #6c7399;
          --btn-secondary-bg: #2a3048;
          --btn-secondary-light: #353d5b;
          --btn-secondary-dark: #212538;
          --btn-secondary-gradient: linear-gradient(180deg, var(--btn-secondary-light) 0%, var(--btn-secondary-bg) 45%, var(--btn-secondary-dark) 100%);
          --radius-sm: 6px;
          --font-size-btn: .9rem;
          --font-weight-btn: 600;
          --btn-height: 40px;
          --btn-min-width: 120px;
          --btn-pad-x: 20px;
          --dur-fast: .13s;
          --dur-base: .14s;
          --ease-out: cubic-bezier(.22, 1, .36, 1);
          --press-scale: .98;
          width: 100%;
          min-height: 100%;
          color: var(--text-primary);
        }

        .mines-page ._btnPrimary_sd554_43 {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          border: 1px solid rgba(94,85,217,.4);
          color: #fff;
          height: var(--btn-height);
          min-width: var(--btn-min-width);
          padding: 0 var(--btn-pad-x);
          box-sizing: border-box;
          border-radius: 8px;
          font-size: var(--font-size-btn);
          font-weight: var(--font-weight-btn);
          letter-spacing: .01em;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #5b52e2, #4038c0);
          box-shadow: 0 2px 8px rgba(108,99,255,.2);
          cursor: pointer;
          transform-origin: center center;
          transition: opacity .2s ease, transform .1s ease, background .25s ease;
        }

        .mines-page ._btnPrimary_sd554_43:hover:not(:disabled) { background: linear-gradient(135deg, #6c63ff, #5147d9); opacity: .95; }
        .mines-page ._btnPrimary_sd554_43:active:not(:disabled) { opacity: 1; transform: scale(.97); }
        .mines-page ._btnPrimary_sd554_43:focus-visible { outline: 2px solid var(--accent-light); outline-offset: 2px; }
        .mines-page ._btnPrimary_sd554_43:disabled { opacity: .6; cursor: not-allowed; transform: none; filter: none; }

        .mines-page ._btnSecondary_sd554_399 {
          border: none;
          color: var(--text-primary);
          height: var(--btn-height);
          min-width: var(--btn-min-width);
          padding: 0 var(--btn-pad-x);
          box-sizing: border-box;
          border-radius: 8px;
          font-size: var(--font-size-btn);
          font-weight: var(--font-weight-btn);
          display: flex;
          align-items: center;
          justify-content: center;
          background: #2a2e44;
          box-shadow: none;
          cursor: pointer;
          transform-origin: center center;
          transition: opacity .2s ease, transform .1s ease, background .25s ease;
        }

        .mines-page ._btnSecondary_sd554_399:hover:not(:disabled) { background: #32385a; }
        .mines-page ._btnSecondary_sd554_399:active:not(:disabled) { transform: scale(.97); }
        .mines-page ._btnSecondary_sd554_399:disabled { opacity: .6; cursor: not-allowed; transform: none; filter: none; }
        ._pageWrap_lhu08_2{width:100%;max-width:980px;margin:0 auto;align-self:center;min-height:calc(100vh - var(--header-height));box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center}
        ._headerLeft_lhu08_30{display:flex;align-items:center;gap:8px;min-width:0}
        ._headerCenter_lhu08_32{position:absolute;left:50%;transform:translate(-50%);display:flex;align-items:center;pointer-events:none}
        ._headerLogo_lhu08_40{height:22px;width:auto;opacity:.18;-webkit-user-select:none;-moz-user-select:none;user-select:none}
        ._sidebarTitle_lhu08_47{color:#fff;font-size:17px;font-weight:600!important;margin:0;letter-spacing:.02em}
        ._headerTitleIcon_lhu08_55{width:28px;height:28px;flex-shrink:0}
        ._headerRight_lhu08_61{margin-left:auto;display:inline-flex;align-items:center;gap:4px;min-width:0}
        ._fairnessBtn_lhu08_73{height:34px;padding:0 12px;display:inline-flex;align-items:center;justify-content:center;gap:6px;background:transparent;border:none;outline:none;box-shadow:none;border-radius:var(--radius-sm);color:#ffffffbf;font-size:12px;font-weight:var(--font-weight-btn);cursor:pointer;white-space:nowrap;transition:color .15s ease}
        ._fairnessBtn_lhu08_73:hover{background:transparent;color:#fff}
        ._fairnessBtn_lhu08_73 svg{flex-shrink:0}
        .minesFairnessBackdrop{position:fixed;inset:0;z-index:2147483100;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;background:rgba(0,0,0,.58);animation:mines-fairness-backdrop-in 180ms ease-out both;transition:opacity 180ms ease}
        .minesFairnessBackdrop.isClosing{opacity:0}
        .minesFairnessModal{position:relative;box-sizing:border-box;width:90%;max-width:600px;max-height:90vh;margin:0;padding:2rem;overflow-x:hidden;overflow-y:auto;border:1px solid #181a28;border-radius:5px;background:#131520;color:#e1e4f2;box-shadow:0 20px 80px #0000008c;font-family:Poppins,sans-serif;animation:mines-fairness-modal-in .3s ease-out both;transition:opacity 180ms ease,transform 180ms ease}
        .minesFairnessModal.isClosing{opacity:0;transform:scale(.97) translateY(6px)}
        .minesFairnessClose{position:absolute;top:12px;right:14px;display:grid;width:34px;height:34px;place-items:center;padding:0;border:0;background:transparent;color:rgba(255,255,255,.76);font-size:25px;line-height:1;cursor:pointer;transition:color 140ms ease,transform 140ms ease}
        .minesFairnessClose:hover{color:#fff}.minesFairnessClose:active{transform:scale(.92)}
        .minesFairnessHeader{margin:0 38px 12px 0;color:#fff;font-size:24px;font-weight:700;line-height:1.25}
        .minesFairnessHint{margin:0 0 22px;color:#a6b2d3;font-size:12px;font-weight:500;line-height:1.65}
        .minesFairnessSection+.minesFairnessSection{margin-top:19px}
        .minesFairnessSectionTitle{display:block;margin-bottom:8px;color:rgba(255,255,255,.68);font-size:13px;font-weight:600}
        .minesFairnessInputHolder,.minesFairnessSeedInput{box-sizing:border-box;min-height:42px;border:0;border-radius:6px;background:#1c1f2e}
        .minesFairnessInputHolder{display:flex;min-width:0;align-items:center;gap:10px;padding:12px 13px}
        .minesFairnessValue{display:block;min-width:0;flex:1;overflow:hidden;color:rgba(255,255,255,.88);font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:13px;line-height:1.45;text-overflow:ellipsis;white-space:nowrap}
        .minesFairnessCopy{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;flex:0 0 18px;padding:0;border:0;outline:none;background:transparent;color:#fff;cursor:pointer;transition:color 140ms ease;-webkit-tap-highlight-color:transparent}
        .minesFairnessCopy svg{width:18px;height:18px}.minesFairnessCopy:hover{color:rgba(255,255,255,.72)}.minesFairnessCopy:focus-visible{outline:2px solid #8079ff;outline-offset:3px}
        .minesFairnessSeedRow{display:flex;align-items:stretch;gap:10px}
        .minesFairnessSeedInput{width:100%;min-width:0;padding:0 13px;outline:none;color:rgba(255,255,255,.9);font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:13px;transition:box-shadow 140ms ease,background 140ms ease}
        .minesFairnessSeedInput:focus{background:#1f2335;box-shadow:inset 0 0 0 1px rgba(108,99,255,.55)}
        .minesFairnessRandom,.minesFairnessSave{min-height:42px;border-radius:8px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:transform .13s cubic-bezier(.22,1,.36,1),background .15s ease,opacity .15s ease}
        .minesFairnessRandom{min-width:108px;padding:0 18px;border:0;background:#2a2e44}.minesFairnessRandom:hover:not(:disabled){background:#32385a}
        .minesFairnessSave{width:100%;margin-top:22px;padding:0 20px;border:1px solid rgba(94,85,217,.4);background:linear-gradient(135deg,#5b52e2,#4038c0);box-shadow:0 2px 8px rgba(108,99,255,.2)}
        .minesFairnessSave:hover:not(:disabled){background:linear-gradient(135deg,#6c63ff,#5147d9);opacity:.95}
        .minesFairnessRandom:active:not(:disabled),.minesFairnessSave:active:not(:disabled){transform:scale(.98)}
        .minesFairnessSeedInput:disabled,.minesFairnessRandom:disabled,.minesFairnessSave:disabled{cursor:not-allowed;opacity:.55}
        .minesFairnessNote{margin:12px 0 0;color:#6c7399;font-size:11px;font-weight:500;line-height:1.55;text-align:center}
        .minesFairnessReveal{margin-top:1.4rem;padding:1rem;border:0 solid rgba(108,99,255,.4);border-radius:6px;background:rgba(108,99,255,.06);animation:mines-fairness-modal-in .24s ease-out both}
        .minesFairnessRevealTitle{display:block;color:#e1e4f2;font-size:13px;font-weight:700}.minesFairnessRevealDescription{display:block;margin-top:5px;color:#a6b2d3;font-size:11px;font-weight:500;line-height:1.55}
        .minesFairnessRevealValue{margin-top:.6rem;margin-bottom:0}.minesFairnessRevealMeta{display:flex;margin-top:9px;flex-wrap:wrap;justify-content:space-between;gap:6px 14px;color:#6c7399;font-size:11px;font-weight:500}.minesFairnessRevealMeta b{color:#a6b2d3;font-weight:700}
        @keyframes mines-fairness-backdrop-in{from{opacity:0}to{opacity:1}}@keyframes mines-fairness-modal-in{from{opacity:0;transform:scale(.96) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}
        ._volumeBtn_lhu08_96{width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center;border-radius:var(--radius-sm);background:transparent;border:none;cursor:pointer;transition:opacity .14s ease;padding:0}
        ._volumeBtn_lhu08_96:hover{opacity:.75}
        ._volumeIcon_lhu08_110{width:18px;height:18px;color:#8f9ac6}
        ._header_lhu08_30{display:none}
        ._modal_lhu08_121{background:var(--surface-0);border-radius:8px;width:100%;max-width:980px;padding:0;display:flex;flex-direction:column;overflow:hidden}
        ._middle_lhu08_133{display:flex;margin-top:2px;border-radius:8px;overflow:hidden;background:#151723}
        ._leftColumn_lhu08_141{flex:0 0 310px;min-width:0;padding:18px 18px 14px;background:var(--surface-0);border-right:1px solid rgba(255,255,255,.06);display:flex;flex-direction:column;gap:0}
        ._boardBox_lhu08_149{flex:1;padding:20px 24px;background:var(--surface-0);box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:0}
        ._leftMiddle_lhu08_162{flex:1;display:flex;flex-direction:column;justify-content:center;gap:14px;min-height:0;padding:8px 0}
        ._modalTitleRow_lhu08_173{display:flex;align-items:center;gap:6px;flex-shrink:0;width:100%;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,.06);margin-bottom:0}
        ._leftBottomBtns_lhu08_185{display:flex;align-items:center;justify-content:center;gap:4px;margin-top:auto;flex-shrink:0}
        ._inputGroup_lhu08_195{display:flex;flex-direction:column;gap:8px}
        ._label_lhu08_196{color:#ffffff73;font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;font-weight:600;margin-bottom:2px}
        ._betInputWrapper_lhu08_208{display:flex;align-items:center;gap:10px;background:var(--surface-1);border-radius:var(--radius-sm);padding:0 12px;border:none;height:42px;box-sizing:border-box}
        ._coinIcon_lhu08_217{width:18px;height:18px;-o-object-fit:contain;object-fit:contain;flex:0 0 auto}
        ._betInput_lhu08_208{flex:1;min-width:0;background:transparent;border:none;outline:none;color:#ffffffeb;font-size:14px;font-weight:600}
        ._betInput_lhu08_208:focus,._betInput_lhu08_208:focus-visible{outline:none;border:none;box-shadow:none;background:transparent}
        ._betButtons_lhu08_229{display:inline-flex;gap:6px}
        ._betQuickBtn_lhu08_230._betQuickBtn_lhu08_230{height:30px;min-width:0;padding:0 10px;font-size:12px}
        ._minesInputWrapper_lhu08_240{display:flex;flex-direction:column;gap:10px}
        ._minesInputContainer_lhu08_241{display:flex;align-items:center;gap:10px;background:var(--surface-1);border-radius:var(--radius-sm);padding:0 12px;border:none;height:42px;box-sizing:border-box}
        ._smallBombIcon_lhu08_250{width:18px;height:18px;-o-object-fit:contain;object-fit:contain;flex:0 0 auto}
        ._minesNumberInput_lhu08_251{flex:1;min-width:0;background:transparent;border:none;outline:none;color:#ffffffeb;font-size:14px;font-weight:600}
        ._minesNumberInput_lhu08_251:focus,._minesNumberInput_lhu08_251:focus-visible{outline:none;border:none;box-shadow:none;background:transparent}
        ._minesNumberInput_lhu08_251::-webkit-outer-spin-button,._minesNumberInput_lhu08_251::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
        ._minesNumberInput_lhu08_251[type=number]{-moz-appearance:textfield}
        ._slider_lhu08_265{width:100%;-webkit-appearance:none;-moz-appearance:none;appearance:none;height:20px;background:transparent;outline:none;cursor:pointer;display:block}
        ._slider_lhu08_265::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:linear-gradient(to right,var(--accent) var(--slider-pct, 20%),#2a2e44 var(--slider-pct, 20%))}
        ._slider_lhu08_265::-webkit-slider-thumb{-webkit-appearance:none;-moz-appearance:none;appearance:none;width:13px;height:13px;border-radius:50%;background:var(--accent);cursor:pointer;box-shadow:0 0 4px #6c63ff66;margin-top:-4.5px}
        ._slider_lhu08_265::-moz-range-track{height:4px;border-radius:2px;background:#2a2e44}
        ._slider_lhu08_265::-moz-range-progress{height:4px;border-radius:2px;background:var(--accent)}
        ._slider_lhu08_265::-moz-range-thumb{width:13px;height:13px;border-radius:50%;background:var(--accent);cursor:pointer;border:none;box-shadow:0 0 4px #6c63ff66}
        ._tabSelector_lhu08_312{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
        ._tab_lhu08_312._tab_lhu08_312{height:38px;min-width:0;padding:0;font-size:13px}
        ._activeTab_lhu08_325._activeTab_lhu08_325{background:linear-gradient(135deg,#5b52e2,#4038c0);border:1px solid rgba(94,85,217,.4);box-shadow:0 2px 8px rgba(108,99,255,.2);color:#fff}
        .mines-page ._activeTab_lhu08_325._activeTab_lhu08_325:hover:not(:disabled){background:linear-gradient(135deg,#6c63ff,#5147d9);opacity:.95}
        ._statsRow_lhu08_332{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        ._statBox_lhu08_337{background:var(--surface-1);border-radius:var(--radius-sm);padding:10px 12px;display:flex;flex-direction:column;gap:3px;min-width:0}
        ._statLabel_lhu08_346{font-size:9.5px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#ffffff61}
        ._statValue_lhu08_353{font-size:15px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        ._statValueAccent_lhu08_361{font-size:15px;font-weight:600;color:var(--accent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        ._statBoxWide_lhu08_369{background:var(--surface-1);border-radius:var(--radius-sm);padding:10px 12px;display:flex;flex-direction:column;gap:3px;min-width:0}
        ._actions_lhu08_380{display:flex;flex-direction:column;gap:8px;width:100%}
        ._primaryAction_lhu08_383._primaryAction_lhu08_383{width:100%;height:52px;min-width:0;padding:0 20px;font-size:14px}
        ._placeBetInner_lhu08_394{display:inline-flex;align-items:center;justify-content:center;gap:10px;white-space:nowrap}
        ._placeBetAmount_lhu08_395{display:inline-flex;align-items:center;gap:8px}
        ._coinSmall_lhu08_396{width:16px!important;height:16px!important;display:block}
        ._grid_lhu08_404{display:grid;gap:8px;width:100%;max-width:560px;margin:0 auto}
        ._cell_lhu08_412{border-radius:.375rem;border:none;background:#1e2130;cursor:pointer;transition:background-color .16s ease,transform .16s cubic-bezier(.22,1,.36,1),opacity .15s ease;display:flex;align-items:center;justify-content:center;will-change:transform;aspect-ratio:1 / 1;min-width:0;min-height:0;width:100%}
        ._cell_lhu08_412:hover:not(._revealed_lhu08_424):not(._mine_lhu08_240):not(._disabled_lhu08_424):not(._locked_lhu08_424){background:var(--surface-1);transform:translateY(-1px)}
        ._cell_lhu08_412:active:not(._revealed_lhu08_424):not(._mine_lhu08_240):not(._disabled_lhu08_424):not(._locked_lhu08_424){transform:translateY(0) scale(.97)}
        ._cell_lhu08_412._pending_lhu08_424{background:var(--surface-1);transform:scale(.98)}
        ._locked_lhu08_424{cursor:default}
        ._disabled_lhu08_424{cursor:not-allowed;opacity:.5}
        ._revealed_lhu08_424{background:#22c55e24!important;animation:_reveal_lhu08_424 .18s cubic-bezier(.22,1,.36,1)}
        ._mine_lhu08_240{background:#ef444424!important;animation:_shake_lhu08_1 .4s ease-out}
        ._gemIcon_lhu08_430{width:70%;height:70%;-o-object-fit:contain;object-fit:contain;transition:filter .15s ease,transform .15s ease}
        ._gemIconGray_lhu08_431{filter:grayscale(1) brightness(.5);opacity:.6}
        ._gemIconColored_lhu08_432{filter:none;opacity:1}
        ._bombIcon_lhu08_433{width:75%;height:75%;-o-object-fit:contain;object-fit:contain}
        @keyframes _reveal_lhu08_424{0%{transform:scale(.95);opacity:0}
        to{transform:scale(1);opacity:1}
        }
        @keyframes _shake_lhu08_1{0%{transform:translate(0)}
        20%{transform:translate(-4px)}
        40%{transform:translate(4px)}
        60%{transform:translate(-3px)}
        80%{transform:translate(3px)}
        to{transform:translate(0)}
        }
        @media (max-width: 900px){.mines-page{height:auto;min-height:100%;flex:0 0 auto;overflow:visible}
        ._pageWrap_lhu08_2{height:auto;min-height:auto;justify-content:flex-start}
        ._modal_lhu08_121{height:auto;overflow:hidden}
        ._middle_lhu08_133{height:auto;flex-direction:column}
        ._leftColumn_lhu08_141{order:2;width:100%;box-sizing:border-box;flex:0 0 auto;border-top:1px solid rgba(255,255,255,.06);border-right:none;border-bottom:0;padding:12px 14px 10px;gap:10px}
        ._boardBox_lhu08_149{order:1;width:100%;box-sizing:border-box;flex:0 0 auto;padding:12px 14px 10px}
        ._grid_lhu08_404{gap:6px}
        }
        @media (max-width: 740px){._pageWrap_lhu08_2{padding:4px 8px env(safe-area-inset-bottom,12px) 8px}
        ._modal_lhu08_121{padding:4px 10px 10px;border-radius:10px}
        ._sidebarTitle_lhu08_47{font-size:16px}
        ._headerTitleIcon_lhu08_55{width:18px;height:18px}
        ._headerRight_lhu08_61{gap:2px}
        ._fairnessBtn_lhu08_73{height:30px;padding:0 10px;font-size:11px}
        ._volumeBtn_lhu08_96{width:30px;height:30px}
        ._volumeIcon_lhu08_110{width:16px;height:16px}
        ._boardBox_lhu08_149{padding:10px 10px 8px}
        ._leftColumn_lhu08_141{padding:10px 10px 8px;gap:8px}
        ._inputGroup_lhu08_195{gap:6px}
        ._label_lhu08_196{font-size:10px}
        ._betInputWrapper_lhu08_208,._minesInputContainer_lhu08_241{padding:0 8px;gap:8px;height:38px}
        ._coinIcon_lhu08_217,._smallBombIcon_lhu08_250{width:16px;height:16px}
        ._betInput_lhu08_208,._minesNumberInput_lhu08_251{font-size:13px}
        ._betButtons_lhu08_229{gap:4px}
        ._betQuickBtn_lhu08_230._betQuickBtn_lhu08_230{height:26px;padding:0 8px;font-size:11px}
        ._minesInputWrapper_lhu08_240{gap:8px}
        ._tabSelector_lhu08_312{gap:6px}
        ._tab_lhu08_312._tab_lhu08_312{height:30px;font-size:12px}
        ._actions_lhu08_380{margin-top:2px;gap:8px}
        ._primaryAction_lhu08_383._primaryAction_lhu08_383{height:42px;padding:0 12px;font-size:13px}
        ._placeBetInner_lhu08_394{gap:8px}
        ._placeBetAmount_lhu08_395{gap:6px}
        ._coinSmall_lhu08_396{width:14px!important;height:14px!important}
        ._grid_lhu08_404{gap:5px}
        ._cell_lhu08_412{border-radius:.3rem}
        }
        @media (max-width: 520px){._pageWrap_lhu08_2{padding:2px 6px env(safe-area-inset-bottom,10px) 6px}
        .minesFairnessBackdrop{padding:8px}
        .minesFairnessModal{width:100%;max-height:calc(100dvh - 16px);padding:1.25rem}
        .minesFairnessHeader{font-size:20px}
        .minesFairnessSeedRow{flex-direction:column}
        .minesFairnessRandom{width:100%}
        ._modal_lhu08_121{padding:2px 8px 8px;border-radius:8px}
        ._sidebarTitle_lhu08_47{font-size:15px}
        ._headerTitleIcon_lhu08_55{width:16px;height:16px}
        ._fairnessBtn_lhu08_73{height:28px;padding:0 8px;font-size:10px;gap:4px}
        ._fairnessBtn_lhu08_73 svg{width:13px;height:13px}
        ._volumeBtn_lhu08_96{width:28px;height:28px;border-radius:5px}
        ._volumeIcon_lhu08_110{width:15px;height:15px}
        ._boardBox_lhu08_149{padding:8px 8px 6px}
        ._leftColumn_lhu08_141{padding:8px 8px 6px;gap:7px}
        ._inputGroup_lhu08_195{gap:5px}
        ._label_lhu08_196{font-size:9px}
        ._betInputWrapper_lhu08_208,._minesInputContainer_lhu08_241{padding:0 7px;gap:7px;height:36px}
        ._coinIcon_lhu08_217,._smallBombIcon_lhu08_250{width:14px;height:14px}
        ._betInput_lhu08_208,._minesNumberInput_lhu08_251{font-size:12px}
        ._betQuickBtn_lhu08_230._betQuickBtn_lhu08_230{height:24px;padding:0 7px;font-size:10px}
        ._minesInputWrapper_lhu08_240{gap:7px}
        ._tabSelector_lhu08_312{gap:5px}
        ._tab_lhu08_312._tab_lhu08_312{height:28px;font-size:11px}
        ._actions_lhu08_380{gap:7px}
        ._primaryAction_lhu08_383._primaryAction_lhu08_383{height:38px;padding:0 10px;font-size:12px}
        ._placeBetInner_lhu08_394{gap:7px}
        ._placeBetAmount_lhu08_395{gap:5px}
        ._coinSmall_lhu08_396{width:13px!important;height:13px!important}
        ._grid_lhu08_404{gap:4px}
        ._cell_lhu08_412{border-radius:.28rem}
        ._gemIcon_lhu08_430{width:66%;height:66%}
        ._bombIcon_lhu08_433{width:70%;height:70%}
        }

        @media (prefers-reduced-motion: reduce) {
          .mines-page ._btnPrimary_sd554_43,
          .mines-page ._btnSecondary_sd554_399 { transition: none; }
          .mines-page ._btnPrimary_sd554_43:active:not(:disabled),
          .mines-page ._btnSecondary_sd554_399:active:not(:disabled) { transform: none; }
        }
      `}</style>
      <div className="_pageWrap_lhu08_2 mines-page-wrap">
        <div className="_modal_lhu08_121 mines-panel" aria-labelledby="mines-title">
          <div className="_middle_lhu08_133 mines-middle">
            <div className="_leftColumn_lhu08_141 mines-controls">
            <div className="_modalTitleRow_lhu08_173 mines-title-row">
              <svg width="0" height="0" className="mines-gradient-defs" aria-hidden="true">
                <defs>
                  <linearGradient id="minesIconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="100%" stopColor="#6c63ff" />
                  </linearGradient>
                </defs>
              </svg>
              <MinesIcon
                className="_headerTitleIcon_lhu08_55 mines-title-icon"
                style={{ fill: 'url(#minesIconGrad)', color: 'url(#minesIconGrad)' }}
              />
              <span id="mines-title" className="_sidebarTitle_lhu08_47 mines-title-text" role="heading" aria-level="1">Mines</span>
              <button
                className="_volumeBtn_lhu08_96 mines-volume-button"
                type="button"
                aria-label={muted ? 'Unmute Mines' : 'Mute Mines'}
                onClick={() => setMuted((current) => !current)}
              >
                {muted ? <VolumeX className="_volumeIcon_lhu08_110" /> : <Volume2 className="_volumeIcon_lhu08_110" />}
              </button>
            </div>

            <div className="_leftMiddle_lhu08_162 mines-control-fields">
              {!isGameActive ? (
                <>
                  <div className="_inputGroup_lhu08_195 mines-input-group">
                    <label className="_label_lhu08_196" htmlFor="mines-amount">Amount</label>
                    <div className="_betInputWrapper_lhu08_208 mines-bet-input-wrap">
                      <img src="/mines-bobux.png" alt="" className="_coinIcon_lhu08_217 mines-coin-icon" />
                      <input
                        className="_betInput_lhu08_208"
                        id="mines-amount"
                        type="text"
                        inputMode="numeric"
                        value={formatAmount(amount)}
                        onChange={(event) => setAmount(normalizeAmount(event.target.value))}
                        onBlur={() => setAmount((current) => clampBet(current))}
                        disabled={uiBusy}
                      />
                      <div className="_betButtons_lhu08_229 mines-bet-buttons">
                        <button className="_betQuickBtn_lhu08_230 _btnSecondary_sd554_399" type="button" onClick={() => setAmount((current) => clampBet(Math.floor(current / 2)))} disabled={uiBusy}>1/2</button>
                        <button className="_betQuickBtn_lhu08_230 _btnSecondary_sd554_399" type="button" onClick={() => setAmount((current) => clampBet(current * 2))} disabled={uiBusy}>2X</button>
                      </div>
                    </div>
                  </div>

                  <div className="_inputGroup_lhu08_195 mines-input-group">
                    <label className="_label_lhu08_196" htmlFor="mines-count">Number of mines</label>
                    <div className="_minesInputWrapper_lhu08_240 mines-count-wrap">
                      <div className="_minesInputContainer_lhu08_241 mines-count-input">
                        <img src={SMALL_BOMB_IMAGE} alt="bomb" className="_smallBombIcon_lhu08_250 mines-small-bomb" />
                        <input
                          className="_minesNumberInput_lhu08_251"
                          id="mines-count"
                          type="number"
                          min="1"
                          max={maxMineCount}
                          value={mineCount}
                          onChange={(event) => updateMineCount(event.target.value)}
                          disabled={uiBusy}
                        />
                      </div>
                      <input
                        className="_slider_lhu08_265 mines-slider"
                        type="range"
                        min="1"
                        max={maxMineCount}
                        value={mineCount}
                        onChange={(event) => updateMineCount(event.target.value)}
                        style={{ '--slider-pct': `${sliderPercentage}%` }}
                        aria-label="Number of mines"
                        disabled={uiBusy}
                      />
                    </div>
                  </div>

                  <div className="_inputGroup_lhu08_195 mines-input-group">
                    <label className="_label_lhu08_196 mines-label">Grid size</label>
                    <div className="_tabSelector_lhu08_312 mines-grid-tabs">
                      {GRID_SIZES.map((size) => (
                        <button
                          key={size}
                          type="button"
                          className={`_tab_lhu08_312 _btnSecondary_sd554_399 ${gridSize === size ? '_activeTab_lhu08_325 is-active' : ''}`}
                          onClick={() => {
                            setGridSize(size)
                            setMineCount((current) => Math.min(current, size * size - 1))
                          }}
                          disabled={uiBusy}
                        >
                          {size}x{size}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}

              <div className="_actions_lhu08_380 mines-actions">
                {isGameActive ? (
                  <>
                    <div className="_statsRow_lhu08_332">
                      <div className="_statBox_lhu08_337">
                        <span className="_statLabel_lhu08_346">Multiplier</span>
                        <span className="_statValueAccent_lhu08_361">x{displayedMultiplier.toFixed(2)}</span>
                      </div>
                      <div className="_statBox_lhu08_337">
                        <span className="_statLabel_lhu08_346">Mines Left</span>
                        <span className="_statValue_lhu08_353">{Number(game?.mines_count || mineCount)}</span>
                      </div>
                    </div>
                    <div className="_statBoxWide_lhu08_369">
                      <span className="_statLabel_lhu08_346">Cashout Amount</span>
                      <span className="_statValue_lhu08_353" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <img src="/mines-bobux.png" alt="" style={{ width: 14, height: 14, objectFit: 'contain' }} />
                        {formatAmount(displayedCashout)}
                      </span>
                    </div>
                    <button
                      className="_primaryAction_lhu08_383 _btnPrimary_sd554_43 mines-play-button"
                      type="button"
                      onClick={cashOut}
                      disabled={!canCashOut}
                    >
                      Cashout
                    </button>
                  </>
                ) : (
                  <button
                    className="_primaryAction_lhu08_383 _btnPrimary_sd554_43 mines-play-button"
                    type="button"
                    onClick={createGame}
                    disabled={uiBusy}
                  >
                    Play
                  </button>
                )}
              </div>
            </div>

            <div className="_leftBottomBtns_lhu08_185 mines-bottom-buttons">
              <button className="_fairnessBtn_lhu08_73 mines-fairness-button" type="button" title="Provably fair" onClick={() => { void openFairness() }}>
                <svg fill="#00e284" width="14" height="14" viewBox="0 0 347.971 347.971" aria-hidden="true">
                  <path d="M317.309,54.367C257.933,54.367,212.445,37.403,173.98,0C135.519,37.403,90.033,54.367,30.662,54.367 c0,97.405-20.155,236.937,143.317,293.604C337.463,291.305,317.309,151.773,317.309,54.367z M162.107,225.773l-47.749-47.756 l21.379-21.378l26.37,26.376l50.121-50.122l21.378,21.378L162.107,225.773z" />
                </svg>
                Fairness
              </button>
            </div>
          </div>

          {fairnessOpen ? (
            <MinesFairnessModal
              fairness={fairness}
              loading={fairnessLoading}
              gameActive={isGameActive}
              onSave={rotateFairnessSeed}
              onClose={() => setFairnessOpen(false)}
            />
          ) : null}

            <div className="_boardBox_lhu08_149 mines-board-wrap">
              <div
                className="_grid_lhu08_404 mines-grid"
                style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}
                aria-label={`${gridSize} by ${gridSize} Mines board`}
              >
                {cells.map((cell) => {
                  const isRevealed = revealedPositions.includes(cell)
                  const isMine = game?.mine_positions?.includes(cell)
                  const cellResult = cellResults[cell]
                  const showMine = cellResult === 'bomb' || Boolean(isMine && game?.game_state !== 'active')
                  const showGem = cellResult === 'gem' || Boolean(!showMine && !isMine && isRevealed)
                  const isDisabled = !isGameActive || isRevealed || uiBusy || game?.game_state === 'exploded'
                  const isVisuallyDisabled = !isGameActive || isRevealed
                  const isInteractionLocked = uiBusy && !isVisuallyDisabled
                  const isPending = pendingPosition === cell

                  return (
                    <button
                      key={cell}
                      type="button"
                      className={`_cell_lhu08_412 mines-cell ${isVisuallyDisabled ? '_disabled_lhu08_424' : ''} ${isInteractionLocked ? '_locked_lhu08_424' : ''} ${isPending ? '_pending_lhu08_424' : ''} ${showGem ? '_revealed_lhu08_424' : ''} ${showMine ? '_mine_lhu08_240' : ''}`}
                      disabled={isDisabled}
                      onClick={() => revealPosition(cell)}
                      aria-label={showMine ? 'Mine' : showGem ? 'Safe' : `Unrevealed cell ${cell + 1}`}
                    >
                      {showMine ? (
                        <img src={SMALL_BOMB_IMAGE} alt="Mine" className="_bombIcon_lhu08_433 mines-mine" />
                      ) : showGem ? (
                        <img src={REVEALED_GEM_IMAGE} alt="Gem" className="_gemIcon_lhu08_430 _gemIconColored_lhu08_432 mines-gem" />
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
