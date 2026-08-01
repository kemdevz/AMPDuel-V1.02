import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { notifications } from '../components/Notifications'
import { apiRequest } from '../lib/apiClient'
import { useAuth } from '../store/auth'
import { useSocket } from '../lib/socket'

const ROUND_COUNTDOWN_MS = 13_000
const ROLL_DURATION_MS = 5_000
const WINNER_INDEX = 40
const DEFAULT_AMOUNT = 5_000

const PETS = [
  { name: 'Huge Cat', image: 'https://biggamesapi.io/image/14976374906' },
  { name: 'Huge Pumpkin Cat', image: 'https://biggamesapi.io/image/14976529226' },
  { name: 'Huge Santa Paws', image: 'https://biggamesapi.io/image/14976542836' },
  { name: 'Huge Festive Cat', image: 'https://biggamesapi.io/image/15281989250' },
  { name: 'Huge Forest Wyvern', image: 'https://biggamesapi.io/image/14976435839' },
  { name: 'Huge Hacked Cat', image: 'https://biggamesapi.io/image/14976449581' },
  { name: 'Huge Gargoyle Dragon', image: 'https://biggamesapi.io/image/14976439876' },
  { name: 'Huge Dog', image: 'https://biggamesapi.io/image/14976397743' },
  { name: 'Huge Dragon', image: 'https://biggamesapi.io/image/14976414803' },
  { name: 'Huge Lucky Cat', image: 'https://biggamesapi.io/image/14976485216' },
  { name: 'Huge Cupcake', image: 'https://biggamesapi.io/image/14976389145' },
  { name: 'Huge Pony', image: 'https://biggamesapi.io/image/14976525582' },
  { name: 'Huge Storm Agony', image: 'https://biggamesapi.io/image/15260479669' },
  { name: 'Huge Pixel Cat', image: 'https://biggamesapi.io/image/14976519049' },
  { name: 'Huge Easter Cat', image: 'https://biggamesapi.io/image/15281989384' },
  { name: 'Huge Super Corgi', image: 'https://biggamesapi.io/image/14976565468' },
]

const BASE_MULTIPLIERS = [
  7.13, 10.10, 13.50, 4.16, 4.37, 1.20, 1.91, 7.34, 3.75, 1.04,
  1.00, 2.02, 2.60, 1.20, 2.43, 2.30, 64.82, 1.49, 1.52, 2.49,
  1.24, 2.48, 1.00, 1.00, 1.53, 2.29, 1.05, 2.16, 1.11, 6.63,
  1.00, 2.07, 1.54, 1.21, 1.06, 2.59, 2.44, 5.67, 1.45, 2.74,
  1.07, 8.32, 7.86, 10.91, 4.45, 1.17, 2.60, 1.36, 3.85, 1.00,
  5.57, 2.00, 6.26, 2.87, 1.90, 2.99, 3.61, 1.15, 12.40, 1.73,
]

const INITIAL_HISTORY = [3.61, 2.99, 1.00, 1.90, 2.87, 6.26, 4.45, 5.57, 2.00, 3.85]

function cardColor(value) {
  if (value > 999_999) return '255,223,0'
  if (value > 99_999) return '255,99,71'
  if (value > 9_999) return '255,105,180'
  if (value > 999) return '54,123,255'
  return '108,108,108'
}

function historyTone(multiplier) {
  if (multiplier >= 20) return 'high'
  if (multiplier >= 5) return 'mid'
  if (multiplier >= 2) return 'low'
  return 'lose'
}

function getCardStep() {
  if (typeof window === 'undefined') return 168
  if (window.innerWidth <= 420) return 108
  if (window.innerWidth <= 640) return 125
  return 168
}

function RollCard({ multiplier, amount, index, items, chosenMultiplier }) {
  const winnings = Math.floor(amount * multiplier)
  const color = cardColor(winnings)
  const safeItems = Array.isArray(items) && items.length > 0 ? items : PETS
  const item = safeItems[index % safeItems.length]
  
  // If chosenMultiplier is provided, color code win/lose cards
  // Cards below chosen multiplier are red (losing cards - "under" your multiplier)
  // Cards at or above chosen multiplier are normal (winning cards)
  const isRedCard = chosenMultiplier ? multiplier < chosenMultiplier : false
  const cardColorClass = chosenMultiplier ? (isRedCard ? 'red' : 'normal') : ''

  return (
    <div
      className={`rollCard ${cardColorClass}`}
      style={{
        background: `linear-gradient(to top, rgba(${color}, .18) 0%, rgba(${color}, 0) 100%), #272d46`,
        '--roll-card-border-bottom': `rgba(${color}, .7)`,
        '--roll-card-border-side': `rgba(${color}, .25)`,
      }}
    >
      <div className="rollImageWrapper">
        <img src={item.image_url || item.image} alt={item.name} className="rollItemImage" draggable={false} />
      </div>
      <div className="rollItemDetails">
        <p className="rollItemName">{item.name}</p>
        <p className="rollCardWin">
          <img src="/bobux.png" alt="" className="rollBobuxIcon" />
          {winnings.toLocaleString('en-US')}
        </p>
        <p className="rollItemMultiplier">{multiplier.toFixed(2)}x</p>
      </div>
    </div>
  )
}

export default function Roll() {
  const user = useAuth((state) => state.user)
  const balance = useAuth((state) => state.balance)
  const setBalance = useAuth((state) => state.setBalance)
  const socket = useSocket()
  
  const [amount, setAmount] = useState(String(DEFAULT_AMOUNT))
  const [multiplier, setMultiplier] = useState('')
  const [phase, setPhase] = useState('countdown')
  const [timeLeft, setTimeLeft] = useState(ROUND_COUNTDOWN_MS)
  const [reelStarted, setReelStarted] = useState(false)
  const [reelTarget, setReelTarget] = useState(0)
  const [history, setHistory] = useState(INITIAL_HISTORY)
  const [entries, setEntries] = useState([])
  const [round, setRound] = useState(0)
  const [gameData, setGameData] = useState(null)
  const [items, setItems] = useState([])
  const [multipliers, setMultipliers] = useState([])
  const [loading, setLoading] = useState(true)
  const requestInFlight = useRef(false)
  const reelViewportRef = useRef(null)
  const roundStartedAtRef = useRef(Date.now())
  const rollTimeoutRef = useRef(null)
  const selectedMultiplierRef = useRef(BASE_MULTIPLIERS[WINNER_INDEX])

  const numericAmount = Math.max(0, Number(amount) || 0)
  const playedAmount = entries.reduce((total, entry) => total + entry.amount, 0)
  const reelAmount = playedAmount > 0 ? playedAmount : 10_000
  const roundMultipliers = useMemo(() => {
    const safeMultipliers = Array.isArray(multipliers) && multipliers.length > 0 ? multipliers : BASE_MULTIPLIERS
    selectedMultiplierRef.current = safeMultipliers[WINNER_INDEX]
    return safeMultipliers
  }, [round, multipliers])
  const idleMultipliers = useMemo(() => {
    const safeMultipliers = Array.isArray(multipliers) && multipliers.length > 0 ? multipliers : BASE_MULTIPLIERS
    return safeMultipliers.slice(0, 30)
  }, [multipliers])

  const beginRoll = useCallback(() => {
    setPhase('rolling')
    setTimeLeft(0)
    setReelStarted(false)
    const viewportWidth = reelViewportRef.current?.clientWidth || window.innerWidth
    const step = getCardStep()
    const offset = ((round * 17) % 55) - 27
    setReelTarget(viewportWidth / 2 - (WINNER_INDEX * step + step / 2) + offset)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setReelStarted(true))
    })

    rollTimeoutRef.current = window.setTimeout(() => {
      const result = selectedMultiplierRef.current
      setHistory((current) => [result, ...current].slice(0, 10))
      setPhase('result')
      rollTimeoutRef.current = window.setTimeout(() => {
        roundStartedAtRef.current = Date.now()
        setRound((current) => current + 1)
        setTimeLeft(ROUND_COUNTDOWN_MS)
        setPhase('countdown')
      }, 900)
    }, ROLL_DURATION_MS)
  }, [round])

  useEffect(() => {
    if (phase !== 'countdown') return undefined
    let frame = 0
    const update = () => {
      const remaining = Math.max(0, ROUND_COUNTDOWN_MS - (Date.now() - roundStartedAtRef.current))
      setTimeLeft(remaining)
      if (remaining <= 0) beginRoll()
      else frame = window.requestAnimationFrame(update)
    }
    frame = window.requestAnimationFrame(update)
    return () => window.cancelAnimationFrame(frame)
  }, [beginRoll, phase])

  // Fetch initial game state and listen for socket updates
  useEffect(() => {
    const fetchGameState = async () => {
      try {
        const response = await apiRequest('/api/roll/state')
        if (response.ok) {
          setGameData(response.round)
          setEntries(response.bets || [])
          setItems(response.items || [])
          setMultipliers(response.multipliers || [])
          setLoading(false)
          
          // Sync phase with server
          if (response.round?.game_state === 'rolling') {
            setPhase('rolling')
            setReelStarted(true)
          } else if (response.round?.game_state === 'ended') {
            setPhase('result')
          } else {
            setPhase('countdown')
          }
        } else {
          // Fallback to static data if backend fails
          console.warn('Backend unavailable, using fallback data')
          setItems(PETS.map(pet => ({ name: pet.name, image_url: pet.image, value: 10000 })))
          setMultipliers(BASE_MULTIPLIERS)
          setLoading(false)
        }
      } catch (err) {
        console.error('Failed to fetch roll state:', err)
        // Fallback to static data
        setItems(PETS.map(pet => ({ name: pet.name, image_url: pet.image, value: 10000 })))
        setMultipliers(BASE_MULTIPLIERS)
        setLoading(false)
      }
    }

    fetchGameState()

    // Listen for socket events
    if (socket) {
      const handleNewRound = (data) => {
        setGameData(data.round)
        setMultipliers(data.multipliers)
        setEntries([])
        setPhase('countdown')
        roundStartedAtRef.current = Date.now()
      }

      const handleRolling = (data) => {
        setGameData(data.round)
        setPhase('rolling')
        beginRoll()
      }

      const handleBet = (bet) => {
        setEntries((current) => {
          // Prevent duplicate bets
          if (current.some(b => b.id === bet.id)) {
            return current
          }
          return [...current, bet]
        })
      }

      const handleEnded = (data) => {
        setGameData(data.round)
        setHistory((current) => [data.result, ...current].slice(0, 10))
        setPhase('result')
        setTimeout(() => {
          roundStartedAtRef.current = Date.now()
          setRound((current) => current + 1)
          setTimeLeft(ROUND_COUNTDOWN_MS)
          setPhase('countdown')
        }, 900)
      }

      const handleBetResult = (data) => {
        if (data.bet.profile_id === user?.profile_id && data.bet.won) {
          setBalance((current) => Number(current) + data.bet.actual_win)
          window.dispatchEvent(new CustomEvent('wallet:updated'))
          notifications.success(`You won ${data.bet.actual_win.toLocaleString()} coins!`)
        }
      }

      const handleWalletUpdated = (data) => {
        if (data.profileId === user?.profile_id) {
          setBalance(data.balance)
        }
      }

      socket.on('roll:new_round', handleNewRound)
      socket.on('roll:rolling', handleRolling)
      socket.on('roll:bet', handleBet)
      socket.on('roll:ended', handleEnded)
      socket.on('roll:bet_result', handleBetResult)
      socket.on('wallet:updated', handleWalletUpdated)

      return () => {
        socket.off('roll:new_round', handleNewRound)
        socket.off('roll:rolling', handleRolling)
        socket.off('roll:bet', handleBet)
        socket.off('roll:ended', handleEnded)
        socket.off('roll:bet_result', handleBetResult)
        socket.off('wallet:updated', handleWalletUpdated)
      }
    }
  }, [socket, user?.profile_id, beginRoll])

  useEffect(() => () => {
    if (rollTimeoutRef.current) window.clearTimeout(rollTimeoutRef.current)
  }, [])

  const updateAmount = (nextAmount) => {
    const normalized = Math.min(1_000_000, Math.max(0, Math.floor(nextAmount || 0)))
    setAmount(String(normalized))
  }

  const placeEntry = async () => {
    const amountValue = Math.floor(Number(amount))
    const multiplierValue = Number(multiplier)
    if (!Number.isFinite(amountValue) || amountValue < 5_000) {
      notifications.error('Minimum play is 5,000 coins')
      return
    }
    if (!Number.isFinite(multiplierValue) || multiplierValue < 1.01 || multiplierValue > 10) {
      notifications.error('Multiplier must be between 1.01x and 10x')
      return
    }

    if (Number(balance || 0) < amountValue) {
      notifications.error('Insufficient balance')
      return
    }

    // Prevent multiple bets in quick succession
    if (requestInFlight.current) {
      notifications.error('Please wait for the bet to be processed')
      return
    }

    requestInFlight.current = true

    // Fallback mode - if no backend, just simulate the bet with real balance
    if (!gameData?.id || gameData.id === 'fallback-round') {
      setBalance(Number(balance || 0) - amountValue)
      window.dispatchEvent(new CustomEvent('wallet:updated'))
      setEntries((current) => [
        ...current,
        { 
          id: `fallback-${Date.now()}`, 
          username: user?.username || 'You', 
          amount: amountValue,
          bet_amount: amountValue,
          multiplier: multiplierValue,
          chosen_multiplier: multiplierValue
        },
      ])
      setMultiplier('')
      requestInFlight.current = false
      notifications.success('Play placed (demo mode)')
      return
    }

    try {
      const response = await apiRequest('/api/roll/bet', {
        method: 'POST',
        body: JSON.stringify({
          round_id: gameData.id,
          bet_amount: amountValue,
          chosen_multiplier: multiplierValue,
        }),
      })

      if (response.ok) {
        // Don't add to entries here - let socket handle it to prevent duplicates
        setMultiplier('')
        setBalance(Number(balance || 0) - amountValue)
        window.dispatchEvent(new CustomEvent('wallet:updated'))
        notifications.success('Play placed')
      } else {
        notifications.error(response.error || 'Failed to place bet')
      }
    } catch (err) {
      notifications.error('Failed to place bet')
    } finally {
      requestInFlight.current = false
    }
  }

  const timerLabel = phase === 'countdown' ? 'ROLLING IN ' : 'ROLLING...'
  const timerWidth = phase === 'countdown' ? (timeLeft / ROUND_COUNTDOWN_MS) * 100 : 0

  return (
    <div className="rollPage rollPageLoaded">
      <style>{ROLL_STYLES}</style>

      <div className="rollSpinnerWrap">
        <div className="rollTimer">
          <div className="rollTimerText">
            {timerLabel}
            {phase === 'countdown' ? <span>{(timeLeft / 1000).toFixed(2)}s</span> : null}
          </div>
          <div className="rollTimerBar" style={{ width: `${timerWidth}%` }} />
        </div>

        <div className="rollSpinner">
          <div className="rollSpinnerSelector" />
          <div className="rollSpinnerInner" ref={reelViewportRef}>
            {phase === 'countdown' ? (
              <div className="rollReelIdle">
                {(idleMultipliers || []).concat(idleMultipliers || []).map((value, index) => {
                  // Find the user's bet and their chosen multiplier
                  const userBet = entries.find(e => e.profile_id === user?.profile_id || e.username === user?.username)
                  const chosenMultiplier = userBet?.chosen_multiplier || userBet?.multiplier
                  return (
                    <RollCard 
                      key={`idle-${index}`} 
                      multiplier={value} 
                      amount={reelAmount} 
                      index={index} 
                      items={items} 
                      chosenMultiplier={chosenMultiplier}
                    />
                  )
                })}
              </div>
            ) : (
              <div
                className="rollReel"
                style={{
                  transform: `translateX(${reelStarted || phase === 'result' ? reelTarget : 0}px)`,
                  transition: reelStarted ? `transform ${ROLL_DURATION_MS / 1000}s cubic-bezier(.05, .85, .25, 1)` : 'none',
                }}
              >
                {(roundMultipliers || []).map((value, index) => {
                  // Find the user's bet and their chosen multiplier
                  const userBet = entries.find(e => e.profile_id === user?.profile_id || e.username === user?.username)
                  const chosenMultiplier = userBet?.chosen_multiplier || userBet?.multiplier
                  return (
                    <RollCard 
                      key={`${round}-${index}`} 
                      multiplier={value} 
                      amount={reelAmount} 
                      index={index + round} 
                      items={items} 
                      chosenMultiplier={chosenMultiplier}
                    />
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rollBottomLayout">
        <div className="rollBottomLeft">
          <div className="rollBottomBox">
            <div className="rollControls">
              <div className="rollControlRow">
                <label className="rollControlLabel" htmlFor="roll-amount">PLAY AMOUNT</label>
                <div className="rollAmountInputWrap">
                  <div className="rollInputWithIcon">
                    <img src="/bobux.png" alt="" className="rollInputIcon" />
                    <input
                      id="roll-amount"
                      type="text"
                      inputMode="numeric"
                      className="rollInput rollInputHasIcon"
                      value={numericAmount ? numericAmount.toLocaleString('en-US') : ''}
                      onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ''))}
                      onBlur={() => updateAmount(Number(amount))}
                    />
                  </div>
                  <div className="rollQuickButtons">
                    <button type="button" className="rollQuickBtn" onClick={() => updateAmount(0)}>CLEAR</button>
                    <button type="button" className="rollQuickBtn" onClick={() => updateAmount(numericAmount + 10_000)}>+10K</button>
                    <button type="button" className="rollQuickBtn" onClick={() => updateAmount(numericAmount / 2)}>1/2</button>
                    <button type="button" className="rollQuickBtn" onClick={() => updateAmount(numericAmount * 2)}>2X</button>
                    <button type="button" className="rollQuickBtn rollQuickBtnMax" onClick={() => updateAmount(1_000_000)}>MAX</button>
                  </div>
                </div>
              </div>

              <div className="rollControlRow">
                <label className="rollControlLabel" htmlFor="roll-multiplier">MULTIPLIER</label>
                <div className="rollMultBetRow">
                  <input
                    id="roll-multiplier"
                    type="text"
                    inputMode="decimal"
                    className="rollInput rollMultInput"
                    placeholder="1.01x — 100x"
                    value={multiplier}
                    onChange={(event) => setMultiplier(event.target.value.replace(',', '.').replace(/[^\d.]/g, ''))}
                    onKeyDown={(event) => { if (event.key === 'Enter') placeEntry() }}
                  />
                  <button type="button" className="rollPlaceBetBtn" onClick={placeEntry}>Enter</button>
                </div>
                <button
                  type="button"
                  className="rollFairnessBtn"
                  title="Provably fair"
                  onClick={() => notifications.info('Provably fair details will be connected with the Roll backend.')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="#00e284" width="16" height="16" viewBox="0 0 347.971 347.971" aria-hidden="true">
                    <path d="M317.309 54.367C257.933 54.367 212.445 37.403 173.98 0 135.519 37.403 90.033 54.367 30.662 54.367c0 97.405-20.155 236.937 143.317 293.604C337.463 291.305 317.309 151.773 317.309 54.367zm-155.202 171.406-47.749-47.756 21.379-21.378 26.37 26.376 50.121-50.122 21.378 21.378-71.499 71.502z" />
                  </svg>
                  Fairness
                </button>
              </div>
            </div>
          </div>

          <div className="rollHistoryStrip">
            <div className="rollHistoryList">
              {(history || []).map((value, index) => (
                <button
                  type="button"
                  className={`rollHistoryChip rollHistory-${historyTone(value)}`}
                  title="View fairness"
                  key={`${value}-${index}`}
                  onClick={() => notifications.info(`Round result: ${value.toFixed(2)}x`)}
                >
                  {value.toFixed(2)}x
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rollPanel">
          <div className="rollPanelHeader">
            <span className="rollPanelTitle">ENTRIES</span>
          </div>
          <div className="rollBetList">
            {entries.length === 0 ? (
              <div className="rollEmptyState">No plays placed yet.</div>
            ) : (entries || []).slice().sort((a, b) => (b.amount || 0) - (a.amount || 0)).map((entry) => {
              const username = entry.username || 'Unknown'
              const multiplier = entry.multiplier || entry.chosen_multiplier || 1
              const amount = entry.amount || entry.bet_amount || 0
              return (
                <div className="rollBetRow" key={entry.id}>
                  <span className="rollBetUser">
                    <button type="button" className="rollBetAvatarBtn" title={username}>
                      <span className="rollBetAvatarFallback">{username[0] || '?'}</span>
                    </button>
                    <span className="rollBetUsername">{username}</span>
                  </span>
                  <span className="rollBetMult">{multiplier.toFixed(2)}x</span>
                  <span className="rollBetAmount">
                    <img src="/bobux.png" alt="" className="rollBobuxIconSm" />
                    {amount.toLocaleString('en-US')}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

const ROLL_STYLES = `
  .rollPage {
    --accent: #6c63ff; --accent-light: #8079ff; --accent-dark: #5a51e6;
    --accent-gradient: linear-gradient(180deg, var(--accent-light) 0%, var(--accent) 45%, var(--accent-dark) 100%);
    --success-gradient: linear-gradient(180deg, #4ade80 0%, #22c55e 45%, #16a34a 100%);
    --surface-1: #1c1f2e; --radius-sm: 6px; --text-primary: #c7cce2;
    --btn-secondary-gradient: linear-gradient(180deg, #353d5b 0%, #2a3048 45%, #212538 100%);
    width: 100%; max-width: 1400px; margin: 0 auto; padding: 24px 32px;
    min-height: calc(100vh - 5rem); display: flex; flex-direction: column; justify-content: center;
    color: #f0f0f5; font-family: "Instrument Sans", system-ui, sans-serif;
    overflow-x: hidden; box-sizing: border-box; scrollbar-width: none;
  }
  .rollPage::-webkit-scrollbar { display: none; }
  .rollSpinnerWrap { margin-bottom: 18px; width: 100%; box-sizing: border-box; min-width: 0; }
  .rollTimer { position: relative; width: 100%; margin-bottom: 14px; }
  .rollTimerText { display: block; text-align: center; font-size: 14px; font-weight: 600; color: #fff; letter-spacing: .08em; margin-bottom: 10px; }
  .rollTimerText span { color: #6c63ff; }
  .rollTimerBar { height: 3px; background: var(--accent); border-radius: 2px; }
  .rollSpinner { position: relative; width: 100%; height: 200px; }
  .rollSpinnerSelector { position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 0; height: 100%; z-index: 5; pointer-events: none; }
  .rollSpinnerSelector::before, .rollSpinnerSelector::after { content: ""; position: absolute; left: -8px; width: 0; height: 0; border-left: 8px solid transparent; border-right: 8px solid transparent; }
  .rollSpinnerSelector::before { top: -2px; border-top: 12px solid var(--accent); }
  .rollSpinnerSelector::after { bottom: -2px; border-bottom: 12px solid var(--accent); }
  .rollSpinnerInner { position: relative; width: 100%; height: 100%; overflow: hidden; }
  .rollReel { position: absolute; top: 0; left: 0; height: 100%; display: flex; align-items: center; will-change: transform; }
  .rollReelIdle { position: absolute; top: 0; left: 0; height: 100%; display: flex; align-items: center; width: max-content; animation: roll-reel-scroll 90s linear infinite; will-change: transform; }
  @keyframes roll-reel-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
  .rollCard { width: 160px; height: 100%; flex-shrink: 0; margin-right: 8px; border-radius: 6px; padding: 8px; display: flex; flex-direction: column; justify-content: space-between; position: relative; border: none; box-sizing: border-box; overflow: hidden; }
  .rollCard::before { content: ""; position: absolute; inset: 0; border-radius: 6px; padding: 2px; background: linear-gradient(to bottom, transparent 0%, var(--roll-card-border-side, rgba(108,99,255,.25)) 55%, var(--roll-card-border-bottom, rgba(108,99,255,.7)) 100%); mask: linear-gradient(#fff 0 0) content-box exclude, linear-gradient(#fff 0 0); pointer-events: none; z-index: 0; }
  .rollCard.red { filter: drop-shadow(0 0 12px rgba(255, 50, 50, 0.8)); }
  .rollCard.red::before { background: linear-gradient(to bottom, transparent 0%, rgba(255, 50, 50, .25) 55%, rgba(255, 50, 50, .5) 100%); }
  .rollCard.normal { opacity: 1; }
  .rollImageWrapper { position: relative; width: 100%; height: 90px; overflow: hidden; border-radius: 8px; flex-shrink: 0; margin-top: 12px; }
  .rollItemImage { width: 100%; height: 100%; object-fit: contain; border-radius: 8px; position: absolute; inset: 0; z-index: 1; }
  .rollItemDetails { position: relative; z-index: 1; text-align: center; margin-top: 5px; }
  .rollItemName { font-weight: 600; font-size: 12px; color: #ccd9fa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 0; }
  .rollCardWin { font-size: 13px; font-weight: 600; color: #fff; margin: 2px 0 0; display: inline-flex; align-items: center; justify-content: center; }
  .rollBobuxIcon { width: 14px; height: 14px; margin-right: 4px; flex-shrink: 0; object-fit: contain; }
  .rollBobuxIconSm { width: 12px; height: 12px; margin-right: 3px; flex-shrink: 0; object-fit: contain; }
  .rollItemMultiplier { font-size: 14px; font-weight: 600; color: #cbd5e1; margin: 2px 0 0; }
  .rollBottomLayout { display: flex; justify-content: center; align-items: flex-start; gap: 10px; margin: 0 auto 18px; max-width: 960px; width: 100%; box-sizing: border-box; min-width: 0; }
  .rollBottomLeft { flex: 0 1 640px; min-width: 0; display: flex; flex-direction: column; }
  .rollBottomBox { background: #181b27; border: none; border-radius: 6px; padding: 14px 18px; box-sizing: border-box; min-width: 0; overflow: hidden; }
  .rollControls { padding: 0; margin-bottom: 0; min-width: 0; }
  .rollControlRow { margin-bottom: 10px; }
  .rollControlRow:last-child { margin-bottom: 0; }
  .rollControlLabel { display: block; font-size: 10.5px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: rgba(255,255,255,.45); margin-bottom: 2px; }
  .rollInput { width: 100%; height: 42px; background: var(--surface-1); border: none; border-radius: var(--radius-sm); padding: 0 14px; color: rgba(255,255,255,.92); font-size: 14px; font-weight: 600; outline: none; box-sizing: border-box; }
  .rollInput:focus, .rollInput:focus-visible { outline: none; border: none; box-shadow: none; background: var(--surface-1); }
  .rollInput::placeholder { color: rgba(225,228,242,.45); }
  .rollAmountInputWrap { display: flex; gap: 8px; align-items: stretch; flex-wrap: wrap; }
  .rollInputWithIcon { position: relative; display: flex; flex: 1 1 180px; max-width: 340px; min-width: 0; }
  .rollInputIcon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; object-fit: contain; pointer-events: none; z-index: 1; }
  .rollInputHasIcon { padding-left: 38px; }
  .rollQuickButtons { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; }
  .rollQuickBtn { height: 30px; min-width: 46px; padding: 0 12px; font-size: 11px; letter-spacing: .04em; border: none; color: var(--text-primary); box-sizing: border-box; border-radius: var(--radius-sm); font-weight: 600; display: flex; align-items: center; justify-content: center; background: var(--btn-secondary-gradient); cursor: pointer; transform-origin: center; transition: transform .13s cubic-bezier(.22,1,.36,1), filter .14s ease; }
  .rollQuickBtn:hover { filter: brightness(1.07); }
  .rollQuickBtn:active { transform: scale(.98); }
  .rollQuickBtnMax { background: var(--success-gradient); color: #fff; }
  .rollMultBetRow { display: flex; gap: 8px; align-items: center; overflow: hidden; }
  .rollMultInput { flex: 1 1 auto; min-width: 0; width: 0; }
  .rollPlaceBetBtn { position: relative; z-index: 1; flex: 0 0 auto; height: 42px; min-width: 110px; padding: 0 18px; font-size: 12px; letter-spacing: .02em; isolation: isolate; overflow: hidden; border: none; color: #fff; box-sizing: border-box; border-radius: var(--radius-sm); font-weight: 600; display: flex; align-items: center; justify-content: center; background: var(--accent-gradient); cursor: pointer; transform-origin: center; transition: transform .13s cubic-bezier(.22,1,.36,1), filter .14s ease; }
  .rollPlaceBetBtn:hover { filter: brightness(1.07); }
  .rollPlaceBetBtn:active { transform: scale(.98); }
  .rollFairnessBtn { height: 34px; padding: 0 12px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; background: transparent; border: none; outline: none; box-shadow: none; border-radius: var(--radius-sm); color: #e1e4f2; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: opacity .15s; width: 100%; margin-top: 4px; }
  .rollFairnessBtn:hover { opacity: .85; }
  .rollHistoryStrip { display: flex; align-items: center; margin-top: 10px; }
  .rollHistoryList { display: flex; gap: 4px; flex: 1; min-width: 0; }
  .rollHistoryChip { position: relative; flex: 1 1 0; min-width: 0; min-height: 35px; display: inline-flex; align-items: center; justify-content: center; text-align: center; padding: 0 6px; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; background: radial-gradient(ellipse at top,rgba(162,155,255,.18) 0%,transparent 65%),var(--surface-1); color: #a29bff; cursor: pointer; overflow: hidden; transition: opacity .15s; }
  .rollHistoryChip::before { content: ""; position: absolute; inset: 0; border-radius: 6px; padding: 2px; background: radial-gradient(at center bottom,rgba(162,155,255,.95) 0%,rgba(162,155,255,.22) 52%,transparent 90%); mask: linear-gradient(#fff 0 0) content-box exclude,linear-gradient(#fff 0 0); pointer-events: none; }
  .rollHistoryChip:hover { opacity: .85; }
  .rollHistory-high { background: radial-gradient(ellipse at top,rgba(245,184,66,.18) 0%,transparent 65%),var(--surface-1); color: #f5b842; }
  .rollHistory-high::before { background: radial-gradient(at center bottom,rgba(245,184,66,.95) 0%,rgba(245,184,66,.22) 52%,transparent 90%); }
  .rollHistory-lose { background: radial-gradient(ellipse at top,rgba(132,140,166,.16) 0%,transparent 65%),var(--surface-1); color: #8b93a8; }
  .rollHistory-lose::before { background: radial-gradient(at center bottom,rgba(132,140,166,.85) 0%,rgba(132,140,166,.2) 52%,transparent 90%); }
  .rollPanel { flex: 0 0 300px; max-width: 300px; min-width: 0; min-height: 280px; align-self: flex-start; background: #181b27; border: none; border-radius: 6px; padding: 16px 18px; overflow: hidden; box-sizing: border-box; }
  .rollPanelHeader { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,.06); }
  .rollPanelTitle { font-size: 11px; font-weight: 600; letter-spacing: .12em; color: #f0f0f5; }
  .rollBetList { display: flex; flex-direction: column; gap: 2px; max-height: 220px; overflow-y: auto; scrollbar-width: none; }
  .rollBetList::-webkit-scrollbar { display: none; }
  .rollEmptyState { padding: 28px 16px; text-align: center; color: #555566; font-size: 13px; }
  .rollBetRow { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; padding: 8px 4px; font-size: 13px; align-items: center; border-bottom: 1px solid rgba(255,255,255,.03); }
  .rollBetUser { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .rollBetAvatarBtn { position: relative; flex-shrink: 0; width: 32px; height: 32px; border-radius: 50%; border: 2px solid #2f3347; background: var(--surface-1); overflow: hidden; cursor: pointer; transition: border-color .15s; padding: 0; }
  .rollBetAvatarBtn:hover { border-color: var(--accent); }
  .rollBetAvatarFallback { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: var(--accent); background: var(--surface-1); }
  .rollBetUsername { font-size: 12px; font-weight: 600; color: #f0f0f5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rollBetMult { font-size: 12px; font-weight: 600; color: #6b7280; }
  .rollBetAmount { font-size: 12px; font-weight: 600; color: #f0f0f5; display: inline-flex; align-items: center; }
  @keyframes roll-page-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  .rollPageLoaded { animation: roll-page-in .35s ease-out both; }
  @media (max-width: 900px) {
    .rollPage { min-height: auto; display: block; }
    .rollBottomLayout { flex-direction: column; align-items: stretch; gap: 12px; }
    .rollBottomLeft { flex: 0 0 auto; width: 100%; }
    .rollPanel { flex: 0 0 auto; width: 100%; max-width: 100%; min-height: auto; align-self: stretch; }
    .rollMultBetRow { flex-wrap: wrap; }
  }
  @media (max-width: 640px) {
    .rollPage { padding: 16px 14px 60px; }
    .rollSpinner { height: 155px; }
    .rollCard { width: 120px; margin-right: 5px; padding: 6px; }
    .rollImageWrapper { height: 68px; margin-top: 6px; }
    .rollItemName { font-size: 10px; }
    .rollCardWin { font-size: 11px; }
    .rollItemMultiplier { font-size: 12px; }
    .rollBottomBox { padding: 12px; }
    .rollAmountInputWrap { flex-direction: column; align-items: stretch; }
    .rollInputWithIcon { max-width: 100%; flex: 1 1 auto; }
    .rollQuickButtons { flex-wrap: nowrap; width: 100%; }
    .rollQuickBtn { flex: 1 1 0; min-width: 0; height: 32px; padding: 0 2px; font-size: 10px; }
    .rollPlaceBetBtn { width: 100%; min-width: 0; }
    .rollBetRow { gap: 6px; font-size: 12px; }
    .rollBetUsername { font-size: 11px; max-width: 90px; }
    .rollHistoryChip { font-size: 11px; padding: 6px 3px; }
  }
  @media (max-width: 420px) {
    .rollPage { padding: 12px 10px 60px; }
    .rollCard { width: 104px; margin-right: 4px; padding: 5px; }
    .rollImageWrapper { height: 58px; margin-top: 4px; }
    .rollSpinner { height: 145px; }
    .rollQuickBtn { height: 30px; font-size: 9px; padding: 0 1px; }
    .rollHistoryList { flex-wrap: wrap; gap: 3px; }
    .rollHistoryChip { flex: 0 0 calc(20% - 3px); font-size: 10px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .rollPageLoaded { animation: none; }
    .rollReelIdle { animation-duration: 180s; }
  }
`
