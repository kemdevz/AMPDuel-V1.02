import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { MinesIcon } from '../components/icons'
import { apiRequest } from '../lib/apiClient'
import { notifications } from '../components/Notifications'
import { useAuth } from '../store/auth'

const GRID_SIZES = [5, 6, 7, 8]
const DEFAULT_BET = 5000
const MIN_BET = 5000
const MAX_BET = 1000000
const SMALL_BOMB_IMAGE = '/mines-bomb.png'
const UNREVEALED_GEM_IMAGE = '/mines-unrevealed.webp'
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
  const [pendingPosition, setPendingPosition] = useState(null)
  const [loading, setLoading] = useState(false)
  const [restoringGame, setRestoringGame] = useState(true)
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
      setRestoringGame(false)
      return undefined
    }

    const controller = new AbortController()
    setGame(null)
    setRevealedPositions([])
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
    audio.currentTime = 0
    void audio.play().catch(() => undefined)
  }, [muted])

  const updateMineCount = (value) => {
    setMineCount(Math.min(maxMineCount, Math.max(1, Number(value) || 1)))
  }

  const createGame = async (event) => {
    if (!event?.isTrusted) return
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
        setRevealedPositions([])
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
        setGame(response.game)
        setRevealedPositions(response.game.revealed_positions)
        const isMine = response.is_mine === true
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
        setBalance(Number(balance || 0) + Number(response.winnings || 0))
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
    <div className="mines-page main-container relative z-10">
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
          border: none;
          color: #fff;
          height: var(--btn-height);
          min-width: var(--btn-min-width);
          padding: 0 var(--btn-pad-x);
          box-sizing: border-box;
          border-radius: var(--radius-sm);
          font-size: var(--font-size-btn);
          font-weight: var(--font-weight-btn);
          letter-spacing: .01em;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--accent-gradient);
          cursor: pointer;
          transform-origin: center center;
          transition: transform var(--dur-fast) var(--ease-out), filter var(--dur-base) ease;
        }

        .mines-page ._btnPrimary_sd554_43:hover:not(:disabled) { filter: brightness(1.07); }
        .mines-page ._btnPrimary_sd554_43:active:not(:disabled) { transform: scale(var(--press-scale)); }
        .mines-page ._btnPrimary_sd554_43:focus-visible { outline: 2px solid var(--accent-light); outline-offset: 2px; }
        .mines-page ._btnPrimary_sd554_43:disabled { opacity: .6; cursor: not-allowed; transform: none; filter: none; }

        .mines-page ._btnSecondary_sd554_399 {
          border: none;
          color: var(--text-primary);
          height: var(--btn-height);
          min-width: var(--btn-min-width);
          padding: 0 var(--btn-pad-x);
          box-sizing: border-box;
          border-radius: var(--radius-sm);
          font-size: var(--font-size-btn);
          font-weight: var(--font-weight-btn);
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--btn-secondary-gradient);
          cursor: pointer;
          transform-origin: center center;
          transition: transform var(--dur-fast) var(--ease-out), filter var(--dur-base) ease;
        }

        .mines-page ._btnSecondary_sd554_399:hover:not(:disabled) { filter: brightness(1.07); }
        .mines-page ._btnSecondary_sd554_399:active:not(:disabled) { transform: scale(var(--press-scale)); }
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
        ._activeTab_lhu08_325._activeTab_lhu08_325{background:var(--accent-gradient);color:#fff}
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
        ._cell_lhu08_412{border-radius:.375rem;border:none;background:#1e2130;cursor:pointer;transition:background-color .15s ease,transform .12s ease,opacity .15s ease;display:flex;align-items:center;justify-content:center;will-change:transform;aspect-ratio:1 / 1;min-width:0;min-height:0;width:100%}
        ._cell_lhu08_412:hover:not(._revealed_lhu08_424):not(._mine_lhu08_240):not(._disabled_lhu08_424){background:var(--surface-1);transform:translateY(-1px)}
        ._cell_lhu08_412:active:not(._revealed_lhu08_424):not(._mine_lhu08_240):not(._disabled_lhu08_424){transform:translateY(0) scale(.97)}
        ._disabled_lhu08_424{cursor:not-allowed;opacity:.5}
        ._revealed_lhu08_424{background:#22c55e24!important;animation:_reveal_lhu08_424 .18s ease-out}
        ._mine_lhu08_240{background:#ef444424!important;animation:_shake_lhu08_1 .4s ease-out}
        ._gemIcon_lhu08_430{width:70%;height:70%;-o-object-fit:contain;object-fit:contain;transition:filter .15s ease,transform .15s ease}
        ._gemIconGray_lhu08_431{filter:grayscale(1) brightness(.7);opacity:.9}
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
        @media (max-width: 900px){._pageWrap_lhu08_2{min-height:auto;justify-content:flex-start}
        ._middle_lhu08_133{flex-direction:column}
        ._boardBox_lhu08_149{order:1;padding:12px 14px 10px}
        ._leftColumn_lhu08_141{order:2;border-right:none;border-top:1px solid rgba(255,255,255,.06);padding:12px 14px 10px;gap:10px}
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
              <button className="_fairnessBtn_lhu08_73 mines-fairness-button" type="button" title="Provably fair">
                <svg fill="#00e284" width="14" height="14" viewBox="0 0 347.971 347.971" aria-hidden="true">
                  <path d="M317.309,54.367C257.933,54.367,212.445,37.403,173.98,0C135.519,37.403,90.033,54.367,30.662,54.367 c0,97.405-20.155,236.937,143.317,293.604C337.463,291.305,317.309,151.773,317.309,54.367z M162.107,225.773l-47.749-47.756 l21.379-21.378l26.37,26.376l50.121-50.122l21.378,21.378L162.107,225.773z" />
                </svg>
                Fairness
              </button>
            </div>
          </div>

            <div className="_boardBox_lhu08_149 mines-board-wrap">
              <div
                className="_grid_lhu08_404 mines-grid"
                style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}
                aria-label={`${gridSize} by ${gridSize} Mines board`}
              >
                {cells.map((cell) => {
                  const isRevealed = revealedPositions.includes(cell)
                  const isMine = game?.mine_positions?.includes(cell)
                  const showMine = Boolean(isMine && game?.game_state !== 'active')
                  const showGem = Boolean(!showMine && isRevealed)
                  const isDisabled = !isGameActive || isRevealed || uiBusy

                  return (
                    <button
                      key={cell}
                      type="button"
                      className={`_cell_lhu08_412 mines-cell ${isDisabled ? '_disabled_lhu08_424' : ''} ${showGem ? '_revealed_lhu08_424' : ''} ${showMine ? '_mine_lhu08_240' : ''}`}
                      disabled={isDisabled}
                      onClick={() => revealPosition(cell)}
                      aria-label={showMine ? 'Mine' : showGem ? 'Safe' : `Unrevealed cell ${cell + 1}`}
                    >
                      {showMine ? (
                        <img src={SMALL_BOMB_IMAGE} alt="Mine" className="_bombIcon_lhu08_433 mines-mine" />
                      ) : showGem ? (
                        <img src={REVEALED_GEM_IMAGE} alt="Gem" className="_gemIcon_lhu08_430 _gemIconColored_lhu08_432 mines-gem" />
                      ) : (
                        <img
                          src={UNREVEALED_GEM_IMAGE}
                          alt="Unrevealed"
                          className="_gemIcon_lhu08_430 _gemIconGray_lhu08_431 mines-gem"
                          style={pendingPosition === cell ? { transform: 'scale(1.03)', opacity: 0.95 } : undefined}
                        />
                      )}
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
