import { useEffect, useMemo, useRef, useState } from 'react'
import { BlackjackIcon } from '../components/icons'
import { notifications } from '../components/Notifications'
import { apiRequest } from '../lib/apiClient'
import { useAuth } from '../store/auth'

const SUIT_LABELS = { S: '♠', H: '♥', D: '♦', C: '♣' }
const MIN_BET = 5_000
const MAX_BET = 10_000_000

function normalizeBetInput(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits === '' ? '' : Number(digits)
}

function formatBet(value) {
  return value === '' ? '' : Math.max(0, Number(value) || 0).toLocaleString('en-US')
}

function clampBet(value) {
  return Math.min(MAX_BET, Math.max(MIN_BET, Math.floor(Number(value) || MIN_BET)))
}

function handValue(cards) {
  let total = 0
  let aces = 0
  cards.forEach(({ rank }) => {
    if (rank === 'A') { total += 11; aces += 1 }
    else if (['J', 'Q', 'K'].includes(rank)) total += 10
    else total += Number(rank)
  })
  while (total > 21 && aces > 0) { total -= 10; aces -= 1 }
  return total
}

function FairnessShield() {
  return (
    <svg fill="#00e284" width="14" height="14" viewBox="0 0 347.971 347.971" aria-hidden="true">
      <path d="M317.309 54.367C257.933 54.367 212.445 37.403 173.98 0 135.519 37.403 90.033 54.367 30.662 54.367c0 97.405-20.155 236.937 143.317 293.604C337.463 291.305 317.309 151.773 317.309 54.367zm-155.202 171.406-47.749-47.756 21.379-21.378 26.37 26.376 50.121-50.122 21.378 21.378-71.499 71.502z" />
    </svg>
  )
}

function BlackjackFairnessCopy({ label, value }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(value ?? ''))
      notifications.success(`${label} copied.`)
    } catch {
      notifications.error(`Unable to copy ${label.toLowerCase()}.`)
    }
  }

  return (
    <button className="blackjackFairnessCopy" type="button" aria-label={`Copy ${label}`} onClick={() => { void copy() }}>
      <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    </button>
  )
}

function useBlackjackSounds() {
  const shuffleRef = useRef(null)
  const flipRef = useRef(null)
  const winRef = useRef(null)

  useEffect(() => {
    try {
      shuffleRef.current = new Audio('/deckshuffle.mp3')
      flipRef.current = new Audio('/cardflip.mp3')
      winRef.current = new Audio('/success.m4a')

      shuffleRef.current.preload = 'auto'
      flipRef.current.preload = 'auto'
      winRef.current.preload = 'auto'

      shuffleRef.current.volume = 0.2
      flipRef.current.volume = 0.24
      winRef.current.volume = 0.32
    } catch {
      // Audio is optional if the browser blocks it.
    }

    return () => {
      shuffleRef.current = null
      flipRef.current = null
      winRef.current = null
    }
  }, [])

  return (type) => {
    const source = type === 'shuffle' ? shuffleRef.current : type === 'flip' ? flipRef.current : winRef.current
    if (!source) return

    try {
      const sound = source.cloneNode(true)
      sound.volume = source.volume
      const playback = sound.play()
      if (playback && typeof playback.catch === 'function') playback.catch(() => {})
    } catch {
      // Ignore browsers that reject a specific playback attempt.
    }
  }
}

function PlayingCard({ card, hidden = false, revealed = true, index = 0 }) {
  const suit = SUIT_LABELS[card.suit] || card.suit
  const red = card.suit === 'H' || card.suit === 'D'
  const fanTilt = Math.max(-6, Math.min(6, 2 * index - 4))
  const faceDown = hidden || !revealed

  return (
    <div
      className="blackjackCard"
      style={{ '--fan-tilt': `${fanTilt}deg` }}
      aria-label={faceDown ? 'Hidden card' : `${card.rank} of ${suit}`}
    >
      <div className={`blackjackCardInner${faceDown ? ' isHidden' : ''}`}>
        <div className={`blackjackCardFace${red ? ' isRed' : ''}`}>
          <span className="blackjackCardCorner"><b>{card.rank}</b><i>{suit}</i></span>
          <span className="blackjackCardSuit">{suit}</span>
          <span className="blackjackCardCorner blackjackCardCornerBottom"><b>{card.rank}</b><i>{suit}</i></span>
        </div>
        <div className="blackjackCardBack" aria-hidden="true" />
      </div>
    </div>
  )
}

function EmptyHand() {
  return <div className="blackjackCards blackjackEmptyCards" aria-hidden="true" />
}

export default function Blackjack() {
  const user = useAuth((state) => state.user)
  const authLoading = useAuth((state) => state.loading)
  const balance = useAuth((state) => state.balance)
  const setBalance = useAuth((state) => state.setBalance)
  const setAuthModalOpen = useAuth((state) => state.setAuthModalOpen)
  const [bet, setBet] = useState(MIN_BET)
  const [game, setGame] = useState(null)
  const [player, setPlayer] = useState([])
  const [dealer, setDealer] = useState([])
  const [phase, setPhase] = useState('idle')
  const [winner, setWinner] = useState(null)
  const [fairnessOpen, setFairnessOpen] = useState(false)
  const [fairness, setFairness] = useState(null)
  const [draftSeed, setDraftSeed] = useState('')
  const [fairnessLoading, setFairnessLoading] = useState(false)
  const [fairnessSaving, setFairnessSaving] = useState(false)
  const [revealedSeed, setRevealedSeed] = useState(null)
  const [revealVerified, setRevealVerified] = useState(null)
  const [restoring, setRestoring] = useState(true)
  const [visiblePlayerCards, setVisiblePlayerCards] = useState(0)
  const [visibleDealerCards, setVisibleDealerCards] = useState(0)
  const [cardAnimationBusy, setCardAnimationBusy] = useState(false)
  const requestInFlight = useRef(false)
  const soundTimers = useRef([])
  const playSound = useBlackjackSounds()
  const userId = user?.profile_id || user?.id || ''
  const playerScore = useMemo(() => handValue(player), [player])
  const dealerScore = useMemo(() => handValue(dealer.filter((card) => card?.rank !== '?')), [dealer])
  const inRound = phase === 'playing'
  const busy = cardAnimationBusy || restoring

  const clearSoundTimers = () => {
    soundTimers.current.forEach(clearTimeout)
    soundTimers.current = []
  }

  useEffect(() => () => clearSoundTimers(), [])

  const scheduleSoundStep = (delay, callback) => {
    const timer = window.setTimeout(callback, delay)
    soundTimers.current.push(timer)
    return timer
  }

  useEffect(() => {
    if (authLoading) return undefined
    if (!userId) {
      setGame(null)
      setPlayer([])
      setDealer([])
      setPhase('idle')
      setRestoring(false)
      return undefined
    }
    const controller = new AbortController()
    setRestoring(true)
    apiRequest('/api/blackjack/state', { signal: controller.signal, cache: 'no-store' })
      .then((response) => {
        if (controller.signal.aborted || !response?.game) return
        const restored = response.game
        setGame(restored)
        setBet(Number(restored.original_wager || restored.wager_value || MIN_BET))
        setPlayer(restored.player_cards || [])
        setDealer(restored.dealer_cards || [])
        setVisiblePlayerCards(restored.player_cards?.length || 0)
        setVisibleDealerCards(1)
        setWinner(null)
        setPhase('playing')
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') notifications.error(error?.message || 'Unable to restore Blackjack.')
      })
      .finally(() => { if (!controller.signal.aborted) setRestoring(false) })
    return () => controller.abort()
  }, [authLoading, userId])

  useEffect(() => {
    if (!revealedSeed?.serverSeed || !revealedSeed?.serverSeedHash || !window.crypto?.subtle) {
      setRevealVerified(null)
      return undefined
    }
    let cancelled = false
    window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(revealedSeed.serverSeed))
      .then((buffer) => Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join(''))
      .then((hash) => { if (!cancelled) setRevealVerified(hash === revealedSeed.serverSeedHash) })
      .catch(() => { if (!cancelled) setRevealVerified(false) })
    return () => { cancelled = true }
  }, [revealedSeed])

  const updateBet = (value) => setBet(normalizeBetInput(value))

  const updateWallet = (nextBalance) => {
    if (Number.isFinite(Number(nextBalance))) setBalance(Number(nextBalance))
    window.dispatchEvent(new CustomEvent('wallet:updated'))
  }

  const finishRoundAnimation = (nextGame) => {
    setGame(nextGame)
    setPlayer(nextGame.player_cards || [])
    setDealer(nextGame.dealer_cards || [])
    setVisiblePlayerCards(nextGame.player_cards?.length || 0)
    setVisibleDealerCards(nextGame.dealer_cards?.length || 0)
    setWinner(nextGame.outcome === 'player_blackjack' ? 'player' : nextGame.outcome)
    setPhase('finished')
    setCardAnimationBusy(false)
    if (['player', 'player_blackjack'].includes(nextGame.outcome)) playSound('win')
  }

  const revealDealerThenFinish = (nextGame, delay = 0) => {
    const nextDealer = nextGame.dealer_cards || []
    scheduleSoundStep(delay, () => {
      setGame(nextGame)
      setPlayer(nextGame.player_cards || [])
      setVisiblePlayerCards(nextGame.player_cards?.length || 0)
    })

    const startingVisible = Math.min(Math.max(visibleDealerCards, 1), nextDealer.length)
    const cardsToReveal = Math.max(0, nextDealer.length - startingVisible)
    if (cardsToReveal === 0) {
      scheduleSoundStep(delay, () => finishRoundAnimation(nextGame))
      return
    }

    for (let step = 0; step < cardsToReveal; step += 1) {
      scheduleSoundStep(delay + step * 350, () => {
        const revealedCount = startingVisible + step + 1
        setDealer(nextDealer.slice(0, revealedCount))
      })
      scheduleSoundStep(delay + step * 350 + 20, () => {
        const revealedCount = startingVisible + step + 1
        setVisibleDealerCards(revealedCount)
        playSound('flip')
      })
    }
    scheduleSoundStep(delay + (cardsToReveal - 1) * 350 + 410, () => finishRoundAnimation(nextGame))
  }

  const animateDeal = (nextGame) => {
    setGame(nextGame)
    setPlayer([])
    setDealer([])
    setPhase('playing')
    setWinner(null)

    const nextPlayer = nextGame.player_cards || []
    const nextDealer = nextGame.dealer_cards || []
    const sequence = [
      { mount: () => setPlayer(nextPlayer.slice(0, 1)), reveal: () => setVisiblePlayerCards(1) },
      { mount: () => setDealer(nextDealer.slice(0, 1)), reveal: () => setVisibleDealerCards(1) },
      { mount: () => setPlayer(nextPlayer.slice(0, 2)), reveal: () => setVisiblePlayerCards(2) },
    ]
    sequence.forEach(({ mount, reveal }, index) => {
      scheduleSoundStep(index * 350, () => {
        mount()
      })
      scheduleSoundStep(index * 350 + 20, () => {
        reveal()
        playSound('flip')
      })
    })

    scheduleSoundStep(sequence.length * 350, () => {
      setDealer(nextDealer.slice(0, 2))
    })
    if (nextGame.game_state === 'finished') {
      scheduleSoundStep(sequence.length * 350 + 20, () => {
        setVisibleDealerCards(2)
        playSound('flip')
      })
    }

    if (nextGame.game_state === 'finished') {
      scheduleSoundStep(sequence.length * 350 + 410, () => finishRoundAnimation(nextGame))
    } else {
      scheduleSoundStep(sequence.length * 350 + 390, () => setCardAnimationBusy(false))
    }
  }

  const animateAction = (action, nextGame) => {
    const previousPlayerCount = player.length
    const nextPlayer = nextGame.player_cards || []

    if (action === 'stand') {
      revealDealerThenFinish(nextGame)
      return
    }

    setGame(nextGame)
    setPlayer(nextPlayer)
    setVisiblePlayerCards(previousPlayerCount)
    scheduleSoundStep(20, () => {
      setVisiblePlayerCards(nextPlayer.length)
      playSound('flip')
    })

    if (nextGame.game_state === 'finished') {
      revealDealerThenFinish(nextGame, 390)
    } else {
      setDealer(nextGame.dealer_cards || [])
      scheduleSoundStep(390, () => setCardAnimationBusy(false))
    }
  }

  const deal = async () => {
    if (requestInFlight.current || restoring) return
    if (!user) { setAuthModalOpen(true); return }
    if (!Number.isSafeInteger(bet) || bet < MIN_BET || bet > MAX_BET) {
      notifications.error('Wager must be between 5,000 and 10,000,000 coins.')
      return
    }
    if (bet > Number(balance || 0)) { notifications.insufficientCoins(); return }
    clearSoundTimers()
    setWinner(null)
    setVisiblePlayerCards(0)
    setVisibleDealerCards(0)
    setCardAnimationBusy(true)
    playSound('shuffle')
    requestInFlight.current = true
    try {
      const response = await apiRequest('/api/blackjack/create', {
        method: 'POST', body: JSON.stringify({ wager_value: bet }),
      })
      updateWallet(response.balance)
      animateDeal(response.game)
      setFairness((current) => current ? { ...current, nonce: Number(current.nonce || 0) + 1 } : current)
    } catch (error) {
      setCardAnimationBusy(false)
      notifications.error(error?.message || 'Unable to start Blackjack.')
    } finally {
      requestInFlight.current = false
    }
  }

  const playAction = async (action) => {
    if (requestInFlight.current || busy || !game || game.game_state !== 'active') return
    if (action === 'double' && bet > Number(balance || 0)) { notifications.insufficientCoins(); return }
    clearSoundTimers()
    setCardAnimationBusy(true)
    requestInFlight.current = true
    try {
      const response = await apiRequest('/api/blackjack/action', {
        method: 'POST',
        body: JSON.stringify({ game_id: game.id, action, request_id: window.crypto.randomUUID() }),
      })
      updateWallet(response.balance)
      animateAction(action, response.game)
    } catch (error) {
      setCardAnimationBusy(false)
      notifications.error(error?.message || `Unable to ${action}.`)
    } finally {
      requestInFlight.current = false
    }
  }

  const openFairness = async () => {
    if (!user) { setAuthModalOpen(true); return }
    setFairnessOpen(true)
    setFairnessLoading(true)
    try {
      const response = await apiRequest('/api/blackjack/fairness', { cache: 'no-store' })
      setFairness(response.fairness)
      setDraftSeed(response.fairness.client_seed)
    } catch (error) {
      notifications.error(error?.message || 'Unable to load Blackjack fairness.')
    } finally { setFairnessLoading(false) }
  }

  const rotateFairness = async () => {
    const clientSeed = draftSeed.trim()
    if (!clientSeed || fairnessSaving || inRound) return
    setFairnessSaving(true)
    try {
      const response = await apiRequest('/api/blackjack/fairness/rotate', {
        method: 'POST', body: JSON.stringify({ client_seed: clientSeed }),
      })
      const next = response.fairness
      setFairness({ seed_id: next.seed_id, server_seed_hash: next.server_seed_hash, client_seed: next.client_seed, nonce: Number(next.nonce || 0) })
      setDraftSeed(next.client_seed)
      setRevealedSeed({ serverSeed: next.previous_server_seed, serverSeedHash: next.previous_server_seed_hash, clientSeed: next.previous_client_seed, nonce: Number(next.previous_nonce || 0) })
      notifications.success('Blackjack fairness seed changed.')
    } catch (error) {
      notifications.error(error?.message || 'Unable to change Blackjack fairness seed.')
    } finally { setFairnessSaving(false) }
  }

  return (
    <div className="blackjackPage main-container">
      <style>{BLACKJACK_STYLES}</style>
      <div className="blackjackPageWrap">
        <div className="blackjackShell">
          <aside className="blackjackBetPanel">
            <header className="blackjackPanelHeader">
              <div className="blackjackTitle">
                <svg width="0" height="0" aria-hidden="true"><defs><linearGradient id="blackjackIconGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#ffffff" /><stop offset="100%" stopColor="#6c63ff" /></linearGradient></defs></svg>
                <BlackjackIcon className="blackjackTitleIcon" /><h1>Blackjack</h1>
              </div>
            </header>

            <div className="blackjackBetBody">
              {!inRound ? (
                <div className="blackjackInputGroup">
                  <label htmlFor="blackjack-bet">Amount</label>
                  <div className="blackjackBetInput">
                    <img src="/bobux.png" alt="" />
                    <input
                      id="blackjack-bet"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      enterKeyHint="done"
                      autoComplete="off"
                      value={formatBet(bet)}
                      disabled={busy}
                      onChange={(event) => updateBet(event.target.value)}
                      onBlur={() => setBet((current) => clampBet(current))}
                    />
                    <div className="blackjackQuickBets">
                      <button type="button" disabled={busy} onClick={() => setBet((current) => clampBet(Number(current) / 2))}>1/2</button>
                      <button type="button" disabled={busy} onClick={() => setBet((current) => clampBet(Number(current) * 2))}>2X</button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="blackjackActions">
                {inRound ? (
                  <>
                    <div className="blackjackStatsRow">
                      <div className="blackjackStatBox">
                        <span className="blackjackStatLabel">Multiplier</span>
                        <span className="blackjackStatValueAccent">x1.90</span>
                      </div>
                    </div>
                    <div className="blackjackStatBox blackjackStatBoxWide">
                      <span className="blackjackStatLabel">Potential Cashout</span>
                      <span className="blackjackStatValue blackjackPayoutValue"><img src="/bobux.png" alt="" />{Math.floor(Number(game?.wager_value || bet) * 1.9).toLocaleString('en-US')}</span>
                    </div>
                    <div className="blackjackActionRow">
                      <button type="button" className="blackjackSecondary" disabled={busy} onClick={() => playAction('hit')}>Hit</button>
                      <button type="button" className="blackjackSecondary" disabled={busy} onClick={() => playAction('stand')}>Stand</button>
                    </div>
                    <button type="button" className="blackjackSecondary" disabled={busy || player.length !== 2 || Number(game?.action_count || 0) !== 0 || bet > Number(balance || 0)} onClick={() => playAction('double')}>Double</button>
                  </>
                ) : (
                  <button type="button" className="blackjackDeal" disabled={busy} onClick={deal}>
                    <span>{restoring ? 'Loading...' : 'Play'}</span>
                  </button>
                )}
              </div>
            </div>

            <div className="blackjackBottomButtons">
              <button type="button" className="blackjackFairnessButton" onClick={() => { void openFairness() }}><FairnessShield />Fairness</button>
            </div>
          </aside>

          <main className={`blackjackTable${inRound ? ' isPlaying' : ''}`}>
            <section className={`blackjackHand blackjackDealerHand${phase === 'finished' && winner === 'player' ? ' isLoser' : ''}${phase === 'finished' && winner === 'dealer' ? ' isWinner' : ''}`}>
              <div className="blackjackScore"><span>DEALER</span><strong>{dealer.length ? (inRound ? handValue(dealer.slice(0, 1)) : dealerScore) : '-'}</strong></div>
              {dealer.length ? <div className="blackjackCards">{dealer.map((card, index) => <PlayingCard key={`dealer-${index}`} card={card} revealed={index < visibleDealerCards} index={index} />)}</div> : <EmptyHand />}
            </section>
            <div className="blackjackConsole" aria-label="Blackjack table rules">
              <span className="blackjackRule">BLACKJACK PAYS 2.375X</span>
              <span className="blackjackRuleDivider" aria-hidden="true" />
              <span className="blackjackRule">DEALER STANDS ON 17</span>
            </div>
            <section className={`blackjackHand blackjackPlayerHand${phase === 'finished' && winner === 'dealer' ? ' isLoser' : ''}${phase === 'finished' && winner === 'player' ? ' isWinner' : ''}`}>
              {player.length ? <div className="blackjackCards">{player.map((card, index) => <PlayingCard key={`player-${index}`} card={card} revealed={index < visiblePlayerCards} index={index} />)}</div> : <EmptyHand />}
              <div className="blackjackScore"><span>YOU</span><strong>{player.length ? playerScore : '-'}</strong></div>
            </section>
          </main>
        </div>
      </div>

      {fairnessOpen ? (
        <div className="blackjackModalBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setFairnessOpen(false) }}>
          <section className="blackjackModal" role="dialog" aria-modal="true" aria-labelledby="blackjack-fairness-title">
            <button className="blackjackModalClose" type="button" onClick={() => setFairnessOpen(false)} aria-label="Close Blackjack Fairness">×</button>
            <h2 id="blackjack-fairness-title">Blackjack Fairness</h2>
            <p>The server commits to a hidden seed before each hand. Changing your client seed retires and reveals the previous server seed so its SHA-256 commitment and past deterministic decks can be verified.</p>
            <div className="blackjackModalSection"><span>Hashed Server Seed</span><div className="blackjackFairnessValue">{fairnessLoading ? 'Loading...' : fairness?.server_seed_hash || 'Unavailable'}</div></div>
            <div className="blackjackModalSection">
              <span>Client Seed</span>
              <div className="blackjackSeedRow">
                <input value={draftSeed} disabled={inRound || fairnessLoading || fairnessSaving} maxLength={128} onChange={(event) => setDraftSeed(event.target.value)} />
                <button type="button" disabled={inRound || fairnessLoading || fairnessSaving} onClick={() => setDraftSeed(window.crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase())}>Random</button>
              </div>
            </div>
            <div className="blackjackModalSection"><span>Nonce</span><div className="blackjackFairnessValue">{fairnessLoading ? 'Loading...' : Number(fairness?.nonce || 0)}</div></div>
            <button className="blackjackChangeSeed" type="button" disabled={inRound || fairnessLoading || fairnessSaving || !draftSeed.trim()} onClick={() => { void rotateFairness() }}>{fairnessSaving ? 'Changing Seed...' : 'Change Seed'}</button>
            <p className="blackjackFairnessNote">You can&apos;t change your seed while a hand is active.</p>
            {revealedSeed ? (
              <div className="blackjackFairnessReveal" aria-label={`Previous server seed commitment ${revealVerified === null ? 'verifying' : revealVerified ? 'verified' : 'failed verification'}`}>
                <span className="blackjackFairnessRevealTitle">Previous Server Seed</span>
                <span className="blackjackFairnessRevealDescription">This seed is now retired. Use it together with the client seed, nonce below to verify your past games.</span>
                <div className="blackjackFairnessInputHolder blackjackFairnessRevealValue">
                  <span className="blackjackFairnessValue" title={revealedSeed.serverSeed}>{revealedSeed.serverSeed}</span>
                  <BlackjackFairnessCopy label="Previous Server Seed" value={revealedSeed.serverSeed} />
                </div>
                <div className="blackjackFairnessRevealMeta">
                  <span>Client Seed: <b>{revealedSeed.clientSeed}</b></span>
                  <span>Nonce: <b>{revealedSeed.nonce}</b></span>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  )
}

const BLACKJACK_STYLES = `
  .blackjackPage {
    --accent:#6c63ff; --accent-light:#8079ff; --surface-0:#131520; --surface-1:#1c1f2e;
    --text-primary:#c7cce2; --text-secondary:#a6b2d3; --text-muted:#6c7399; --radius-sm:6px;
    container:blackjack-page / inline-size; width:100%; min-height:100%; color:var(--text-primary); font-family:Poppins,sans-serif;
  }
  .blackjackPageWrap { width:100%; max-width:980px; min-height:calc(100vh - 5rem); margin:0 auto; box-sizing:border-box; display:flex; align-items:center; justify-content:center; }
  .blackjackShell { width:100%; min-height:610px; display:grid; grid-template-columns:310px minmax(0,1fr); overflow:hidden; border:0; border-radius:8px; background:var(--surface-0); }
  .blackjackBetPanel { min-width:0; padding:18px 18px 14px; display:flex; flex-direction:column; background:var(--surface-0); border-right:1px solid rgba(255,255,255,.06); }
  .blackjackPanelHeader { width:100%; display:flex; align-items:center; padding-bottom:12px; border-bottom:1px solid rgba(255,255,255,.06); }
  .blackjackTitle { display:flex; align-items:center; gap:8px; min-width:0; }
  .blackjackTitle > svg:first-child { position:absolute; width:0; height:0; }
  .blackjackTitleIcon { width:28px; height:28px; flex-shrink:0; color:#8f9ac6; fill:url(#blackjackIconGrad); }
  .blackjackTitle h1 { margin:0; color:#fff; font-size:17px; font-weight:600; letter-spacing:.02em; line-height:1.25; }
  .blackjackFairnessButton { height:34px; padding:0 12px; display:inline-flex; align-items:center; justify-content:center; gap:6px; border:0; border-radius:var(--radius-sm); outline:0; background:transparent; color:#ffffffbf; font-size:12px; font-weight:600; cursor:pointer; transition:color .15s ease; }
  .blackjackFairnessButton:hover { color:#fff; }
  .blackjackFairnessButton:active { opacity:.8; }
  .blackjackFairnessButton svg { width:14px; height:14px; flex-shrink:0; }
  .blackjackBottomButtons { display:flex; align-items:center; justify-content:center; gap:4px; margin-top:auto; flex-shrink:0; }
  .blackjackBetBody { flex:1; min-height:0; padding:8px 0; display:flex; flex-direction:column; justify-content:center; gap:14px; }
  .blackjackInputGroup { display:flex; flex-direction:column; gap:8px; }
  .blackjackInputGroup label { margin-bottom:2px; color:#ffffff73; font-size:10.5px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; }
  .blackjackBetInput { height:42px; padding:0 12px; display:flex; align-items:center; gap:10px; box-sizing:border-box; border:0; border-radius:var(--radius-sm); background:var(--surface-1); }
  .blackjackBetInput img { width:18px; height:18px; flex:0 0 auto; object-fit:contain; }
  .blackjackBetInput input { min-width:0; flex:1; height:100%; padding:0; border:0; outline:0; background:transparent; color:#ffffffeb; font-family:Poppins,sans-serif; font-size:14px; font-weight:600; }
  .blackjackBetInput input:focus,.blackjackBetInput input:focus-visible { border:0; outline:0; box-shadow:none; background:transparent; }
  .blackjackBetInput input:disabled { color:#ffffff80; cursor:not-allowed; }
  .blackjackQuickBets { display:inline-flex; gap:6px; }
  .blackjackQuickBets button { border:0; border-radius:8px; background:#2a2e44; color:var(--text-primary); font-family:Poppins,sans-serif; font-weight:600; box-shadow:none; cursor:pointer; transform-origin:center; transition:opacity .2s ease,transform .1s ease,background .25s ease; }
  .blackjackQuickBets button { height:30px; min-width:0; padding:0 10px; font-size:12px; }
  .blackjackQuickBets button:hover:not(:disabled) { background:#32385a; }
  .blackjackQuickBets button:active:not(:disabled) { transform:scale(.97); }
  .blackjackQuickBets button:disabled { opacity:.6; cursor:not-allowed; transform:none; }
  .blackjackActions { width:100%; display:flex; flex-direction:column; gap:8px; }
  .blackjackActionRow { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .blackjackActions > .blackjackStatsRow { display:grid; grid-template-columns:1fr; gap:8px; }
  .blackjackStatBox { min-width:0; padding:10px 12px; display:flex; flex-direction:column; gap:3px; border-radius:var(--radius-sm); background:var(--surface-1); }
  .blackjackStatLabel { color:#ffffff61; font-size:9.5px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; }
  .blackjackStatValue,.blackjackStatValueAccent { overflow:hidden; color:#fff; font-size:15px; font-weight:600; white-space:nowrap; text-overflow:ellipsis; }
  .blackjackStatValueAccent { color:var(--accent); }
  .blackjackStatBoxWide { width:100%; box-sizing:border-box; }
  .blackjackPayoutValue { display:inline-flex; align-items:center; gap:6px; }
  .blackjackPayoutValue img { width:14px; height:14px; flex:0 0 auto; object-fit:contain; }
  .blackjackActions button { height:40px; min-width:0; padding:0 14px; border-radius:8px; font-family:Poppins,sans-serif; font-size:14px; font-weight:600; }
  .blackjackSecondary { position:relative; isolation:isolate; overflow:hidden; border:1px solid rgba(94,85,217,.4); color:#fff; background:linear-gradient(135deg,#5b52e2,#4038c0); box-shadow:0 2px 8px rgba(108,99,255,.2); cursor:pointer; transform-origin:center; transition:opacity .2s ease,transform .1s ease,background .25s ease; }
  .blackjackSecondary:hover:not(:disabled) { background:linear-gradient(135deg,#6c63ff,#5147d9); opacity:.95; }
  .blackjackSecondary:active:not(:disabled) { opacity:1; transform:scale(.97); }
  .blackjackSecondary:focus-visible,.blackjackDeal:focus-visible { outline:2px solid #8079ff; outline-offset:2px; }
  .blackjackSecondary:disabled { opacity:.6; cursor:not-allowed; transform:none; }
  .blackjackDeal { position:relative; height:52px!important; display:flex; align-items:center; justify-content:center; gap:10px; overflow:hidden; border:1px solid rgba(94,85,217,.4); color:#fff; background:linear-gradient(135deg,#5b52e2,#4038c0); box-shadow:0 2px 8px rgba(108,99,255,.2); cursor:pointer; transform-origin:center; transition:opacity .2s ease,transform .1s ease,background .25s ease; }
  .blackjackDeal:hover:not(:disabled) { background:linear-gradient(135deg,#6c63ff,#5147d9); opacity:.95; }
  .blackjackDeal:active:not(:disabled) { opacity:1; transform:scale(.97); }
  .blackjackDeal:disabled { opacity:.6; cursor:not-allowed; transform:none; }
  .blackjackTable { min-width:0; padding:20px 24px; display:grid; grid-template-rows:1fr auto 1fr; overflow:hidden; background:var(--surface-0); }
  .blackjackHand { min-width:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:7px; transition:opacity .5s ease,transform .5s cubic-bezier(.4,0,.2,1); }
  .blackjackScore { position:relative; width:auto; min-width:74px; padding:7px 12px; box-sizing:border-box; display:flex; align-items:center; justify-content:center; gap:7px; overflow:hidden; border:0; border-radius:var(--radius-sm); background:var(--surface-1); text-align:center; transition:background .5s ease,box-shadow .5s ease; }
  .blackjackHand.isWinner .blackjackScore { background:#20243a; box-shadow:inset 0 0 0 1px rgba(108,99,255,.24),0 5px 18px rgba(0,0,0,.14); }
  .blackjackScore span { position:relative; z-index:1; color:#ffffff61; font-size:9.5px; font-weight:600; letter-spacing:.08em; transition:opacity 1.9s cubic-bezier(.4,0,.2,1); }
  .blackjackScore strong { position:relative; z-index:1; color:#fff; font-size:15px; font-weight:600; line-height:1.25; transition:opacity 1.9s cubic-bezier(.4,0,.2,1); }
  .blackjackHand.isLoser .blackjackScore span,.blackjackHand.isLoser .blackjackScore strong { opacity:.38; transition-delay:1.05s; }
  .blackjackHand.isLoser .blackjackScore strong { opacity:1; color:rgba(255,255,255,.38); }
  .blackjackHand.isLoser .blackjackScore strong::after { position:absolute; top:50%; left:-8%; width:116%; height:2px; border-radius:999px; background:rgba(198,204,224,.78); content:""; transform:translateY(-50%) rotate(14deg); transform-origin:center; }
  .blackjackCards { position:relative; width:100%; min-width:0; min-height:143px; display:flex; align-items:center; justify-content:center; gap:0; perspective:1200px; z-index:5; padding:0 25px; box-sizing:border-box; opacity:1; filter:none; transition:opacity 180ms cubic-bezier(.4,0,.2,1),filter 180ms cubic-bezier(.4,0,.2,1); }
  .blackjackHand.isLoser .blackjackCards { opacity:.3; filter:saturate(.42) brightness(.84); }
  .blackjackTable.isPlaying .blackjackCards,.blackjackTable.isPlaying .blackjackScore span,.blackjackTable.isPlaying .blackjackScore strong { transition:none; transition-delay:0s; }
  .blackjackCard { position:relative; width:100px; height:143px; flex:0 0 100px; perspective:1200px; will-change:transform,opacity; transform:rotate(var(--fan-tilt,0deg)); transition:transform .28s; animation:blackjackCardDealIn .34s cubic-bezier(.2,.7,.3,1) both; }
  .blackjackCard:not(:first-child) { margin-left:-34px; }
  .blackjackCardInner { position:relative; width:100%; height:100%; transform-style:preserve-3d; will-change:transform; transform:rotateY(0deg); transition:transform 380ms cubic-bezier(.4,0,.2,1); }
  .blackjackCardInner.isHidden { transform:rotateY(180deg); }
  .blackjackHand.isWinner .blackjackCardInner { filter:drop-shadow(0 0 10px rgba(108,99,255,.16)); }
  .blackjackCardFace,.blackjackCardBack { position:absolute; top:0; left:0; width:100%; height:100%; backface-visibility:hidden; -webkit-backface-visibility:hidden; border-radius:10px; box-sizing:border-box; }
  .blackjackCardFace { width:100px; height:143px; border-radius:14px; box-shadow:rgba(0,0,0,.55) 0 12px 26px -8px,rgba(0,0,0,.2) 0 2px; background:rgb(253,253,253); border:0; outline:0; position:relative; overflow:hidden; transition:filter .3s,box-shadow .25s; display:block; color:rgb(17,24,39); }
  .blackjackCardFace.isRed { color:rgb(224,40,40); }
  .blackjackCardCorner { position:absolute; top:9px; left:10px; font-family:Inter,"Helvetica Neue",Arial,sans-serif; font-weight:900; line-height:.9; letter-spacing:-.01em; display:flex; flex-direction:column; align-items:center; gap:0; font-size:19px; }
  .blackjackCardCorner b { font-weight:900; }
  .blackjackCardCorner i { font-size:.72em; font-weight:900; line-height:1; margin-top:1px; font-style:normal; }
  .blackjackCardCornerBottom { top:auto; left:auto; bottom:9px; right:10px; transform:rotate(180deg); }
  .blackjackCardSuit { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:55px; font-weight:900; opacity:1; filter:drop-shadow(rgba(0,0,0,.05) 0 2px 0); }
  .blackjackCardBack { transform:rotateY(180deg); background:repeating-linear-gradient(45deg,rgb(31,36,51) 0,rgb(31,36,51) 6px,rgb(38,43,62) 6px,rgb(38,43,62) 12px),rgb(26,29,46); border-radius:14px; box-shadow:rgba(0,0,0,.6) 0 12px 26px -8px,rgb(26,29,46) 0 0 0 4px inset,rgba(255,255,255,.06) 0 0 0 5px inset; }
  .blackjackCardBack::before { content:""; position:absolute; inset:10px; border-radius:6px; border:1px solid rgba(255,255,255,.08); background:radial-gradient(rgba(255,255,255,.04) 0%,transparent 65%); pointer-events:none; }
  .blackjackEmptyCards { min-height:143px; padding:0 25px; opacity:1; filter:none; transition:none; will-change:auto; }
  .blackjackConsole { position:relative; z-index:1; display:flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:8px; }
  .blackjackRule { padding:6px 12px; border-radius:8px; background:rgba(28,31,46,.85); color:#8a9bc3; font-size:10px; font-weight:700; letter-spacing:.04em; white-space:nowrap; }
  .blackjackRuleDivider { width:32px; height:1px; background:rgba(138,155,195,.3); }
  .blackjackModalBackdrop { position:fixed; inset:0; z-index:2147483100; padding:20px; display:flex; align-items:center; justify-content:center; box-sizing:border-box; background:rgba(0,0,0,.58); animation:blackjackBackdropIn 180ms ease-out both; }
  .blackjackModal { position:relative; width:90%; max-width:600px; max-height:90vh; padding:2rem; box-sizing:border-box; overflow:auto; border:1px solid #181a28; border-radius:5px; background:#131520; color:#e1e4f2; box-shadow:0 20px 80px #0000008c; animation:blackjackModalIn .3s ease-out both; }
  .blackjackModalClose { position:absolute; top:12px; right:14px; width:34px; height:34px; padding:0; display:grid; place-items:center; border:0; background:transparent; color:rgba(255,255,255,.76); font-size:25px; line-height:1; cursor:pointer; transition:color .14s ease,transform .14s ease; }
  .blackjackModalClose:hover { color:#fff; } .blackjackModalClose:active { transform:scale(.92); }
  .blackjackModal h2 { margin:0 38px 12px 0; color:#fff; font-size:24px; font-weight:700; line-height:1.25; }
  .blackjackModal > p { margin:0 0 22px; color:#a6b2d3; font-size:12px; font-weight:500; line-height:1.65; }
  .blackjackModalSection + .blackjackModalSection { margin-top:19px; }
  .blackjackModalSection > span { display:block; margin-bottom:8px; color:rgba(255,255,255,.68); font-size:13px; font-weight:600; }
  .blackjackModalSection > div { min-height:42px; padding:12px 13px; box-sizing:border-box; border:0; border-radius:6px; background:#1c1f2e; color:rgba(255,255,255,.88); font-size:13px; }
  .blackjackFairnessValue { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace; }
  .blackjackSeedRow { min-height:0!important; padding:0!important; display:flex; align-items:stretch; gap:10px; background:transparent!important; }
  .blackjackSeedRow input { width:100%; min-width:0; min-height:42px; padding:0 13px; box-sizing:border-box; border:0; border-radius:6px; outline:0; background:#1c1f2e; color:rgba(255,255,255,.9); font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace; font-size:13px; }
  .blackjackSeedRow input:focus { background:#1f2335; box-shadow:inset 0 0 0 1px rgba(108,99,255,.55); }
  .blackjackSeedRow button { min-width:108px; min-height:42px; padding:0 18px; border:0; border-radius:8px; background:#2a2e44; color:#fff; font-size:14px; font-weight:600; cursor:pointer; transition:transform .13s cubic-bezier(.22,1,.36,1),background .15s ease,opacity .15s ease; }
  .blackjackSeedRow button:hover:not(:disabled) { background:#32385a; }
  .blackjackChangeSeed { width:100%; min-height:42px; margin-top:22px; padding:0 20px; border:1px solid rgba(94,85,217,.4); border-radius:8px; background:linear-gradient(135deg,#5b52e2,#4038c0); color:#fff; box-shadow:0 2px 8px rgba(108,99,255,.2); font-size:14px; font-weight:600; cursor:pointer; transition:transform .13s cubic-bezier(.22,1,.36,1),background .15s ease,opacity .15s ease; }
  .blackjackChangeSeed:hover:not(:disabled) { background:linear-gradient(135deg,#6c63ff,#5147d9); opacity:.95; }
  .blackjackSeedRow button:active:not(:disabled),.blackjackChangeSeed:active:not(:disabled) { transform:scale(.98); }
  .blackjackSeedRow input:disabled,.blackjackSeedRow button:disabled,.blackjackChangeSeed:disabled { cursor:not-allowed; opacity:.55; }
  .blackjackFairnessNote { margin:12px 0 0!important; color:#6c7399!important; font-size:11px!important; font-weight:500!important; line-height:1.55!important; text-align:center; }
  .blackjackFairnessInputHolder { display:flex; min-width:0; min-height:42px; align-items:center; gap:10px; padding:12px 13px; box-sizing:border-box; border:0; border-radius:6px; background:#1c1f2e; }
  .blackjackFairnessInputHolder .blackjackFairnessValue { display:block; min-width:0; flex:1; overflow:hidden; color:rgba(255,255,255,.88); font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace; font-size:13px; line-height:1.45; text-overflow:ellipsis; white-space:nowrap; }
  .blackjackFairnessCopy { display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; flex:0 0 18px; padding:0; border:0; outline:none; background:transparent; color:#fff; cursor:pointer; transition:color 140ms ease; -webkit-tap-highlight-color:transparent; }
  .blackjackFairnessCopy svg { width:18px; height:18px; }
  .blackjackFairnessCopy:hover { color:rgba(255,255,255,.72); }
  .blackjackFairnessCopy:focus-visible { outline:2px solid #8079ff; outline-offset:3px; }
  .blackjackFairnessReveal { margin-top:1.4rem; padding:1rem; border:0 solid rgba(108,99,255,.4); border-radius:6px; background:rgba(108,99,255,.06); animation:blackjackModalIn .24s ease-out both; }
  .blackjackFairnessRevealTitle { display:block; color:#e1e4f2; font-size:13px; font-weight:700; }
  .blackjackFairnessRevealDescription { display:block; margin-top:5px; color:#a6b2d3; font-size:11px; font-weight:500; line-height:1.55; }
  .blackjackFairnessRevealValue { margin-top:.6rem; margin-bottom:0; }
  .blackjackFairnessRevealMeta { display:flex; margin-top:9px; flex-wrap:wrap; justify-content:space-between; gap:6px 14px; color:#6c7399; font-size:11px; font-weight:500; }
  .blackjackFairnessRevealMeta b { color:#a6b2d3; font-weight:700; }
  @keyframes blackjackCardDealIn { from { opacity:0; transform:translateY(-8px) scale(.96) rotate(var(--fan-tilt,0deg)); } to { opacity:1; transform:translateY(0) scale(1) rotate(var(--fan-tilt,0deg)); } }
  @keyframes blackjackBackdropIn { from { opacity:0; } to { opacity:1; } }
  @keyframes blackjackModalIn { from { opacity:0; transform:scale(.96) translateY(10px); } to { opacity:1; transform:none; } }
  @container blackjack-page (max-width:740px) {
    .blackjackShell { grid-template-columns:250px minmax(0,1fr); }
    .blackjackBetPanel { padding:14px; }
    .blackjackTable { padding:14px 12px 10px; }
    .blackjackHand { gap:5px; }
  }
  @media (max-width:600px) {
    .blackjackCard,.blackjackCardFace { width:64px!important; height:91px!important; flex-basis:64px; }
    .blackjackCard:not(:first-child) { margin-left:-24px!important; }
    .blackjackCardCorner { top:6px; left:7px; font-size:11px; }
    .blackjackCardCornerBottom { top:auto; left:auto; bottom:6px; right:7px; }
    .blackjackCardSuit { font-size:29px; }
    .blackjackCards { gap:0; min-height:91px; flex-wrap:nowrap; overflow:visible; padding:0 8px; }
    .blackjackEmptyCards { min-height:91px; padding:0 8px; }
  }
  @media (max-width:520px) {
    .blackjackPage { height:auto; min-height:100%; overflow:visible; touch-action:pan-y; }
    .blackjackPageWrap { min-height:0; padding:4px 6px calc(5.5rem + env(safe-area-inset-bottom,10px)); align-items:flex-start; overflow:visible; }
    .blackjackShell { min-height:0; grid-template-columns:1fr; border-radius:7px; overflow:visible; }
    .blackjackBetPanel { order:2; width:100%; box-sizing:border-box; padding:10px 10px 9px; border-top:1px solid rgba(255,255,255,.06); border-right:0; }
    .blackjackPanelHeader { padding-bottom:8px; }
    .blackjackTitleIcon { width:18px; height:18px; } .blackjackTitle h1 { font-size:16px; }
    .blackjackFairnessButton { height:30px; font-size:11px; }
    .blackjackBottomButtons { margin-top:4px; }
    .blackjackTable { order:1; min-height:clamp(330px,52dvh,430px); padding:8px 8px 6px; overflow:hidden; }
    .blackjackConsole { gap:8px; }
    .blackjackRule { font-size:10px; }
    .blackjackRuleDivider { display:none; }
    .blackjackBetBody { padding:8px 0 4px; grid-template-columns:1fr; gap:10px; }
    .blackjackInputGroup { min-width:0; gap:7px; }
    .blackjackBetInput { width:100%; height:46px; min-width:0; padding:0 8px; gap:7px; }
    .blackjackBetInput img { width:17px; height:17px; }
    .blackjackBetInput input { width:0; min-width:0; flex:1 1 auto; font-size:16px; line-height:1; }
    .blackjackQuickBets { flex:0 0 auto; gap:4px; }
    .blackjackQuickBets button { height:34px; min-width:40px; padding:0 8px; font-size:11px; touch-action:manipulation; }
    .blackjackQuickBets,.blackjackActions,.blackjackBottomButtons { position:relative; z-index:2; }
    .blackjackActions button,.blackjackFairnessButton,.blackjackQuickBets button { min-height:44px; font-size:13px; touch-action:manipulation; -webkit-tap-highlight-color:transparent; }
    .blackjackDeal { height:46px!important; }
    .blackjackHand { gap:5px; }
    .blackjackModalBackdrop { padding:8px; } .blackjackModal { width:100%; max-height:calc(100dvh - 16px); padding:1.25rem; } .blackjackModal h2 { font-size:20px; } .blackjackSeedRow { flex-direction:column; } .blackjackSeedRow button { width:100%; }
  }
  @media (max-width:360px) {
    .blackjackPageWrap { padding-inline:3px; }
    .blackjackBetPanel { padding-inline:8px; }
    .blackjackQuickBets button { min-width:36px; padding-inline:6px; }
    .blackjackRule { padding-inline:8px; font-size:9px; }
  }
  @media (prefers-reduced-motion:reduce) { .blackjackCard,.blackjackModal,.blackjackModalBackdrop { animation:none; } .blackjackCardInner,.blackjackCards,.blackjackScore span,.blackjackScore strong,.blackjackHand { transition:none; } }
`
