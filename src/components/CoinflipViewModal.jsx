import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { notifications } from './Notifications'
import CoinflipFairnessModal from './CoinflipFairnessModal'
import AdoptMeTraitBadges from './AdoptMeTraitBadges'
import { apiRequest } from '../lib/apiClient'
import { useAuth } from '../store/auth'
import { formatPriceValue } from '../Utils/FormatPriceValues'
import { RobuxIcon as CurrencyIcon } from './AmpInventoryModalUI'

// All coin animation assets and timing live here so the mockup can be retuned
// without touching the component markup.
const VIEW_MODAL_CONFIG = Object.freeze({
  assets: {
    currency: '/bobux.png',
    coin: {
      heads: '/heads.webp',
      tails: '/tails.webp',
    },
    coinAnimation: {
      heads: '/heads.webm',
      tails: '/tails.webm',
    },
  },
  animation: {
    backdropInMs: 180,
    modalInMs: 180,
    closeMs: 160,
  },
})

const DEFAULT_AVATAR = '/ps99-cat.png'
const FAIRNESS_CLOSE_MS = 220

function formatValue(value) {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) ? numeric.toLocaleString('en-US') : '0'
}

function formatCompactValue(value) {
  return formatPriceValue(value, { maximumFractionDigits: 2 })
}

function normalizeItem(item, index) {
  const name = item?.name || 'Unnamed item'
  return {
    ...item,
    id: item?.item_uuid || item?.id || item?.uuid || `item-${index}`,
    name,
    image: item?.image_url || item?.image || VIEW_MODAL_CONFIG.assets.currency,
    numericValue: Number(item?.value ?? 0) || 0,
    value: formatValue(item?.value),
  }
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M.439 21.44a1.5 1.5 0 0 0 2.122 2.121l9.262-9.262a.25.25 0 0 1 .354 0l9.262 9.263a1.5 1.5 0 1 0 2.122-2.121l-9.262-9.263a.25.25 0 0 1 0-.354l9.263-9.262A1.5 1.5 0 0 0 21.439.44l-9.262 9.262a.25.25 0 0 1-.354 0L2.561.44A1.5 1.5 0 0 0 .439 2.561l9.262 9.262a.25.25 0 0 1 0 .354z" /></svg>
}

function FingerprintIcon() {
  return <svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M256.12 245.96c-13.25 0-24 10.74-24 24 1.14 72.25-8.14 141.9-27.7 211.55-2.73 9.72 2.15 30.49 23.12 30.49 10.48 0 20.11-6.92 23.09-17.52 13.53-47.91 31.04-125.41 29.48-224.52.01-13.25-10.73-24-23.99-24zm-.86-81.73C194 164.16 151.25 211.3 152.1 265.32c.75 47.94-3.75 95.91-13.37 142.55-2.69 12.98 5.67 25.69 18.64 28.36 13.05 2.67 25.67-5.66 28.36-18.64 10.34-50.09 15.17-101.58 14.37-153.02-.41-25.95 19.92-52.49 54.45-52.34 31.31.47 57.15 25.34 57.62 55.47.77 48.05-2.81 96.33-10.61 143.55-2.17 13.06 6.69 25.42 19.76 27.58 19.97 3.33 26.81-15.1 27.58-19.77 8.28-50.03 12.06-101.21 11.27-152.11-.88-55.8-47.94-101.88-104.91-102.72zm-110.69-19.78c-10.3-8.34-25.37-6.8-33.76 3.48-25.62 31.5-39.39 71.28-38.75 112 .59 37.58-2.47 75.27-9.11 112.05-2.34 13.05 6.31 25.53 19.36 27.89 20.11 3.5 27.07-14.81 27.89-19.36 7.19-39.84 10.5-80.66 9.86-121.33-.47-29.88 9.2-57.88 28-80.97 8.35-10.28 6.79-25.39-3.49-33.76zm109.47-62.33c-15.41-.41-30.87 1.44-45.78 4.97-12.89 3.06-20.87 15.98-17.83 28.89 3.06 12.89 16 20.83 28.89 17.83 11.05-2.61 22.47-3.77 34-3.69 75.43 1.13 137.73 61.5 138.88 134.58.59 37.88-1.28 76.11-5.58 113.63-1.5 13.17 7.95 25.08 21.11 26.58 16.72 1.95 25.51-11.88 26.58-21.11a929.06 929.06 0 0 0 5.89-119.85c-1.56-98.75-85.07-180.33-186.16-181.83zm252.07 121.45c-2.86-12.92-15.51-21.2-28.61-18.27-12.94 2.86-21.12 15.66-18.26 28.61 4.71 21.41 4.91 37.41 4.7 61.6-.11 13.27 10.55 24.09 23.8 24.2h.2c13.17 0 23.89-10.61 24-23.8.18-22.18.4-44.11-5.83-72.34zm-40.12-90.72C417.29 43.46 337.6 1.29 252.81.02 183.02-.82 118.47 24.91 70.46 72.94 24.09 119.37-.9 181.04.14 246.65l-.12 21.47c-.39 13.25 10.03 24.31 23.28 24.69.23.02.48.02.72.02 12.92 0 23.59-10.3 23.97-23.3l.16-23.64c-.83-52.5 19.16-101.86 56.28-139 38.76-38.8 91.34-59.67 147.68-58.86 69.45 1.03 134.73 35.56 174.62 92.39 7.61 10.86 22.56 13.45 33.42 5.86 10.84-7.62 13.46-22.59 5.84-33.43z" /></svg>
}

function KeyIcon() {
  return <svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M512 176c0 97.2-78.8 176-176 176-11.2 0-22.2-1.1-32.8-3.1l-24 27A24 24 0 0 1 261.2 384H224v40a24 24 0 0 1-24 24h-40v40a24 24 0 0 1-24 24H24a24 24 0 0 1-24-24v-78.1c0-6.4 2.5-12.5 7-17l161.8-161.8A176 176 0 1 1 512 176zm-128-48a48 48 0 1 0 0 96 48 48 0 0 0 0-96z" /></svg>
}

function QuestionIcon() {
  return <svg viewBox="0 0 384 512" fill="currentColor" aria-hidden="true"><path d="M202 0C122.2 0 70.5 32.7 29.9 91a24 24 0 0 0 5.2 32.9l43.1 32.7a24 24 0 0 0 33.3-4.1c25-31.4 43.6-49.5 82.7-49.5 30.8 0 68.9 19.8 68.9 49.6 0 22.6-18.7 34.2-49 51.2-35.5 19.9-82.3 44.6-82.3 106.4V320a24 24 0 0 0 24 24h72.4a24 24 0 0 0 24-24v-5.8c0-42.8 125.3-44.6 125.3-160.6C377.5 66.3 286.9 0 202 0zm-10 373.5a69.3 69.3 0 1 0 0 138.5 69.3 69.3 0 0 0 0-138.5z" /></svg>
}

function ShieldIcon() {
  return <svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="m466.5 83.7-192-80a48.2 48.2 0 0 0-36.9 0l-192 80A48 48 0 0 0 16 128c0 198.5 114.5 335.7 221.5 380.3 11.8 4.9 25.1 4.9 36.9 0C360.1 472.6 496 349.3 496 128c0-19.4-11.7-36.9-29.5-44.3zM256.1 446.3 256 65.3l175.9 73.3c-3.3 151.4-82.1 261.1-175.8 307.7z" /></svg>
}

function relativeGameTime(room, completed) {
  const source = completed
    ? room?.resolved_at || room?.updated_at || room?.created_at
    : room?.created_at
  const timestamp = new Date(source || Date.now()).getTime()
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  const prefix = completed ? 'Ended' : 'Created'
  if (seconds < 60) return `${prefix} less than a minute ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${prefix} ${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${prefix} ${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${prefix} ${days} day${days === 1 ? '' : 's'} ago`
}

function CoinAnimation({ side, onComplete }) {
  return (
    <video
      className="view-modal__coin-video"
      src={VIEW_MODAL_CONFIG.assets.coinAnimation[side]}
      autoPlay
      muted
      playsInline
      preload="auto"
      disablePictureInPicture
      onEnded={onComplete}
      onError={onComplete}
      aria-label={`${side} won the coinflip`}
    />
  )
}

function Player({ player, completed, winnerSide, winnerVisible, waiting = false, onProfileOpen }) {
  const isWinner = completed && winnerVisible && player.side === winnerSide
  const isLoser = completed && winnerVisible && !waiting && player.side !== winnerSide

  return (
    <div className={`view-modal__player${isWinner ? ' view-modal__player--winner' : ''}${isLoser ? ' view-modal__player--loser' : ''}`}>
      <button
        type="button"
        className={`view-modal__avatar-wrapper view-modal__avatar-wrapper--${player.side === 'tails' ? 'tails' : 'heads'}`}
        onClick={() => {
          if (!waiting) {
            onProfileOpen?.({
              id: player.profileId,
              profile_id: player.profileId,
              username: player.username,
              avatar: player.avatar,
              avatar_url: player.avatar,
              avatar_headshot_url: player.avatar,
            })
          }
        }}
        disabled={waiting}
        aria-label={waiting ? 'Waiting for opponent' : `Open ${player.username} profile`}
      >
        {waiting ? (
          <span className="view-modal__avatar view-modal__avatar--waiting" aria-hidden="true"><QuestionIcon /></span>
        ) : (
          <img
            src={player.avatar}
            alt={player.username}
            className={`view-modal__avatar${isWinner ? ' view-modal__winner' : ''}`}
            draggable={false}
            onError={(event) => {
              event.currentTarget.src = DEFAULT_AVATAR
            }}
          />
        )}
        <span className="view-modal__coin"><img src={VIEW_MODAL_CONFIG.assets.coin[player.side]} alt="" draggable={false} /></span>
      </button>
      <h3 className="view-modal__username">
        {waiting ? 'Waiting...' : player.username}
      </h3>
    </div>
  )
}

function ItemColumn({ column, waiting = false }) {
  return (
    <div className="view-modal__player-items">
      {waiting ? <div className="view-modal__waiting-items">Waiting for an opponent</div> : column.items.map((item) => (
        <div
          key={item.id}
          className="view-modal__item-row"
        >
          <div className="view-modal__item-image-wrapper">
            <img src={item.image} alt={item.name} className="view-modal__normal-item-image" loading="eager" />
            <AdoptMeTraitBadges item={item} />
          </div>
          <p className="view-modal__item-name">{item.name}</p>
          <span className="view-modal__item-value"><CurrencyIcon />{item.value}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Pure frontend coinflip view.
 *
 * completed=false renders the waiting/open lobby.
 * completed=true renders the two-player result and sprite animation.
 */
export default function CoinflipViewModal({
  room,
  onClose = () => {},
  onCanceled = () => {},
  onJoin = null,
  onProfileOpen = () => {},
  profileOpen = false,
}) {
  const user = useAuth((state) => state.user)
  const [closing, setClosing] = useState(false)
  const [fairnessOpen, setFairnessOpen] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const hasOpponent = Boolean(room?.opponent_uuid)
  const completed = Boolean(room?.opponent_uuid && room?.result)
  const winnerSide = String(room?.result || 'heads').toLowerCase() === 'tails' ? 'tails' : 'heads'
  const [winnerVisible, setWinnerVisible] = useState(false)
  const currentProfileId = String(user?.profile_id || user?.id || '')
  const canCancel = Boolean(
    currentProfileId &&
    currentProfileId === String(room?.creator_uuid || '') &&
    !room?.opponent_uuid &&
    !room?.canceled,
  )

  const state = useMemo(() => {
    const sortItemsHighToLow = (items) => items
      .map(normalizeItem)
      .sort((left, right) => right.numericValue - left.numericValue)
    const creatorItems = sortItemsHighToLow(Array.isArray(room?.creator_items) ? room.creator_items : [])
    const opponentItems = sortItemsHighToLow(Array.isArray(room?.opponent_items) ? room.opponent_items : [])
    const creatorTotal = creatorItems.reduce((sum, item) => sum + item.numericValue, 0)
    const opponentTotal = opponentItems.reduce((sum, item) => sum + item.numericValue, 0)
    const potTotal = creatorTotal + opponentTotal
    const chance = (value) => `${(potTotal > 0 ? (value / potTotal) * 100 : 0).toFixed(2)}%`

    return {
      playerOne: {
        profileId: room?.creator_uuid,
        username: room?.creator_username || 'Unknown player',
        avatar: room?.creator_avatar_url || room?.creator_avatar || DEFAULT_AVATAR,
        side: String(room?.creator_side || 'heads').toLowerCase(),
        column: {
          total: formatValue(creatorTotal),
          mobileTotal: formatCompactValue(creatorTotal),
          chance: chance(creatorTotal),
          items: creatorItems,
        },
      },
      playerTwo: {
        profileId: room?.opponent_uuid,
        username: room?.opponent_username || 'Waiting...',
        avatar: room?.opponent_avatar_url || room?.opponent_avatar || DEFAULT_AVATAR,
        side: String(room?.opponent_side || (room?.creator_side === 'tails' ? 'heads' : 'tails')).toLowerCase(),
        column: {
          total: formatValue(opponentTotal),
          mobileTotal: formatCompactValue(opponentTotal),
          chance: chance(opponentTotal),
          items: opponentItems,
        },
      },
    }
  }, [room])

  useEffect(() => {
    setWinnerVisible(false)
  }, [completed, room?.id, room?.result])

  const close = useCallback(() => {
    if (closing) return
    setClosing(true)
    window.setTimeout(onClose, VIEW_MODAL_CONFIG.animation.closeMs)
  }, [closing, onClose])

  const cancelCoinflip = async () => {
    if (!canCancel || canceling) return
    setCanceling(true)
    try {
      const result = await apiRequest('/api/coinflip/cancel', {
        method: 'POST',
        body: JSON.stringify({ roomId: room?.id || room?.room_id }),
      })
      notifications.success('Coinflip canceled.')
      onCanceled(result?.data || { ...room, canceled: true })
    } catch (error) {
      notifications.error(error?.message || 'Unable to cancel coinflip.')
      setCanceling(false)
    }
  }

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return
      if (profileOpen) return
      if (fairnessOpen) return
      close()
    }

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [close, fairnessOpen, profileOpen])

  if (typeof document === 'undefined') return null

  return createPortal(
    (
      <div
        className={`view-modal__backdrop${closing ? ' view-modal__backdrop--closing' : ''}`}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) close()
        }}
        role="presentation"
      >
        <style>{VIEW_MODAL_STYLES}</style>
        <div
          className={`view-modal__surface${closing ? ' view-modal__surface--closing' : ''}${canCancel ? ' view-modal__surface--cancelable' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-label={completed ? 'Completed coinflip' : 'Open coinflip'}
        >
          <div className="view-modal__body">
            <div className="view-modal__content">
              <button
                type="button"
                className="view-modal__close"
                onClick={close}
                aria-label="Close coinflip"
              >
                <CloseIcon />
              </button>
              <div className="view-modal__players">
                <Player player={state.playerOne} completed={completed} winnerSide={winnerSide} winnerVisible={winnerVisible} onProfileOpen={onProfileOpen} />

                <div className="view-modal__game-info">
                  {completed ? (winnerVisible
                    ? <img className="view-modal__winner-coin" src={VIEW_MODAL_CONFIG.assets.coin[winnerSide]} alt={`${winnerSide} won`} draggable={false} />
                    : <CoinAnimation key={`${room?.id || room?.room_id || 'coinflip'}:${winnerSide}`} side={winnerSide} onComplete={() => setWinnerVisible(true)} />)
                    : !hasOpponent ? (canCancel
                      ? null
                      : <button type="button" className="view-modal__middle-action" onClick={() => onJoin?.(room)}>Join</button>)
                      : <p className="view-modal__versus">VS</p>}
                </div>

                <Player player={state.playerTwo} completed={completed} winnerSide={winnerSide} winnerVisible={winnerVisible} waiting={!hasOpponent} onProfileOpen={onProfileOpen} />
              </div>

              <div className="view-modal__seed-grid">
                <button type="button" className="view-modal__seed" aria-label="Open coinflip fairness details" onClick={() => setFairnessOpen(true)}><FingerprintIcon /><span>{room?.id || room?.room_id || 'Not available'}</span></button>
                <button type="button" className="view-modal__seed" aria-label="Open server seed fairness details" onClick={() => setFairnessOpen(true)}><KeyIcon /><span>{completed ? room?.server_seed_hash || 'Not available' : 'Not available'}</span></button>
                <button type="button" className="view-modal__seed" aria-label="Open client seed fairness details" onClick={() => setFairnessOpen(true)}><QuestionIcon /><span>{completed ? room?.client_seed || room?.random_seed || 'Not available' : 'Not available'}</span></button>
              </div>

              <div className="view-modal__totals">
                {[state.playerOne.column, state.playerTwo.column].map((column, index) => {
                  const unavailable = index === 1 && !hasOpponent
                  return <div className="view-modal__total" key={index}><strong>{unavailable ? '0%' : column.chance}</strong><span><CurrencyIcon />{unavailable ? '—' : column.total}</span></div>
                })}
              </div>

              <div className="view-modal__items">
                <ItemColumn column={state.playerOne.column} />
                <ItemColumn column={state.playerTwo.column} waiting={!hasOpponent} />
              </div>

              <div className="view-modal__divider" />
              <footer className="view-modal__footer">
                <button type="button" className="view-modal__fairness" onClick={() => setFairnessOpen(true)}><ShieldIcon />Fairness</button>
                <p>{relativeGameTime(room, completed)}</p>
                {canCancel ? <button type="button" className="view-modal__middle-action view-modal__middle-action--cancel view-modal__footer-cancel" disabled={canceling} onClick={() => { void cancelCoinflip() }}>{canceling ? 'Canceling' : 'Cancel'}</button> : null}
              </footer>
            </div>
          </div>
        </div>
        {fairnessOpen && (
          <CoinflipFairnessModal
            coinflipId={room?.id || room?.room_id || 'N/A'}
            hashedServerSeed={room?.server_seed_hash || 'N/A'}
            serverSeed={completed ? room?.server_seed || room?.revealed_server_seed || 'N/A' : 'N/A'}
            clientSeed={completed ? room?.client_seed || room?.random_seed || 'N/A' : 'N/A'}
            onClose={() => setFairnessOpen(false)}
          />
        )}
      </div>
    ),
    document.body,
  )
}

const VIEW_MODAL_STYLES = `
  @keyframes view-modal-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes view-modal-open {
    from { transform: scale(.985); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }

  @keyframes view-modal-fade-out {
    to { opacity: 0; }
  }

  @keyframes view-modal-shrink-out {
    to { transform: scale(.98); opacity: 0; }
  }

  .view-modal__backdrop {
    position: fixed;
    inset: 0;
    z-index: 2147483000;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(0, 0, 0, .5);
    font-family: Poppins, sans-serif;
    animation: view-modal-fade-in ${VIEW_MODAL_CONFIG.animation.backdropInMs}ms ease-out;
  }

  .view-modal__backdrop--closing {
    animation: view-modal-fade-out ${VIEW_MODAL_CONFIG.animation.closeMs}ms ease-in forwards;
  }

  .view-modal__surface {
    position: relative;
    display: flex;
    width: 85%;
    max-width: 1000px;
    height: 600px;
    flex-direction: column;
    margin: auto;
    padding: 0;
    overflow: hidden;
    border: none;
    border-radius: 6px;
    background-color: #25263B;
    color: rgba(255, 255, 255, .92);
    font-family: Poppins, sans-serif;
    font-size: 16px;
    font-weight: 400;
    line-height: normal;
    animation: view-modal-open ${VIEW_MODAL_CONFIG.animation.modalInMs}ms ease-out forwards;
  }

  .view-modal__surface button,
  .view-modal__surface p,
  .view-modal__surface h3 {
    font-family: Poppins, sans-serif;
  }

  .view-modal__surface--closing {
    animation: view-modal-shrink-out ${VIEW_MODAL_CONFIG.animation.closeMs}ms forwards;
  }

  .view-modal__header {
    position: relative;
    margin-bottom: 6px;
    padding: 18px 18px 0;
    text-align: center;
  }

  .view-modal__logo {
    display: block;
    width: auto;
    max-width: 150px;
    height: auto;
    margin: 0 auto;
    border-radius: 10px;
  }

  .view-modal__close {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 1000;
    display: inline-flex;
    width: 36px;
    height: 36px;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 8px;
    background: none;
    color: rgba(255, 255, 255, .85);
    font-size: 24px;
    line-height: 1;
    cursor: pointer;
    opacity: .8;
    transition: color .14s ease, opacity .14s ease;
  }

  .view-modal__close:hover {
    color: #fff;
    opacity: 1;
  }

  .view-modal__cancel {
    position: absolute;
    right: 18px;
    bottom: 16px;
    z-index: 5;
    padding: 9px 17px;
    border: none;
    border-radius: 6px;
    background: linear-gradient(180deg, #ff6b6b 0%, #ff4d4d 45%, #e03131 100%);
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    line-height: normal;
    cursor: pointer;
    transition: transform .13s cubic-bezier(.22, 1, .36, 1), filter .14s ease, opacity .14s ease;
  }

  .view-modal__cancel:hover:not(:disabled) {
    filter: brightness(1.07);
  }

  .view-modal__cancel:focus-visible {
    outline: 2px solid #ff6b6b;
    outline-offset: 2px;
  }

  .view-modal__cancel:disabled {
    cursor: not-allowed;
    opacity: .6;
  }

  .view-modal__cancel:active:not(:disabled),
  .view-modal__cancel--pending {
    filter: brightness(.9);
    transform: scale(.98) translateY(1px);
  }

  .view-modal__players {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 60px;
    padding: 14px 16px 10px;
  }

  .view-modal__player {
    display: flex;
    width: 160px;
    flex-shrink: 0;
    flex-direction: column;
    align-items: center;
  }

  .view-modal__avatar-wrapper {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .view-modal__avatar-wrapper:disabled {
    cursor: default;
  }

  .view-modal__avatar {
    width: 120px;
    height: 120px;
    margin-bottom: 10px;
    border: 4px solid rgba(255, 255, 255, .06);
    border-radius: 50%;
    background-color: #353650;
    object-fit: cover;
    cursor: pointer;
    transition: transform .14s ease, border-color .14s ease, filter .14s ease;
  }

  .view-modal__avatar:hover {
    border-color: rgba(128, 74, 255, .65);
    filter: brightness(1.04);
  }

  .view-modal__avatar.view-modal__winner {
    border-color: rgba(128, 74, 255, .85);
  }

  .view-modal__username {
    max-width: 160px;
    margin-top: 5px;
    overflow: hidden;
    color: rgba(255, 255, 255, .92);
    font-size: 1.17em;
    font-weight: 700;
    line-height: normal;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .view-modal__coin {
    position: absolute;
    right: 2px;
    bottom: 2px;
    width: 38px;
    height: 38px;
    filter: none;
  }

  .view-modal__coin img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .view-modal__game-info {
    display: flex;
    width: 160px;
    flex-shrink: 0;
    flex-direction: column;
    align-items: center;
  }

  .view-modal__coin-video {
    display: block;
    width: 240px;
    height: 240px;
    object-fit: contain;
    border-radius: 50%;
    mix-blend-mode: screen;
    pointer-events: none;
    transform: scale(2.85);
    transform-origin: center;
  }

  .view-modal__versus {
    color: rgba(255, 255, 255, .22);
    font-size: 42px;
    font-weight: 800;
    line-height: 1;
  }

  .view-modal__game-id {
    display: flex;
    width: 100%;
    flex-direction: column;
    align-items: center;
    margin-bottom: 10px;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .view-modal__game-id:focus-visible {
    outline: 2px solid #804AFF;
    outline-offset: 3px;
  }

  .view-modal__game-id-holder {
    display: flex;
    width: 22ch;
    margin-bottom: -14px;
    overflow: hidden;
    padding: 6px 10px;
    border-radius: 999px;
    background: #353650;
    color: rgba(255, 255, 255, .85);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .view-modal__game-id-tag {
    width: 22ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .view-modal__hashtag {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    margin-top: 4px;
    margin-right: 6px;
    opacity: .85;
  }

  .view-modal__items {
    display: flex;
    width: calc(100% - 20px);
    flex: 1;
    justify-content: space-between;
    gap: 12px;
    margin: 14px 10px 12px;
    padding-right: 8px;
    overflow-y: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .view-modal__surface--cancelable .view-modal__items {
    padding-bottom: 44px;
  }

  .view-modal__items::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  .view-modal__player-items {
    box-sizing: border-box;
    display: flex;
    width: 50%;
    flex-direction: column;
    padding: 0 6px;
  }

  .view-modal__total-value-container {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 10px 0 6px;
    padding: 10px 0;
    background: #25263B;
    color: rgba(255, 255, 255, .92);
    font-weight: 700;
  }

  .view-modal__item {
    box-sizing: border-box;
    display: flex;
    width: 100%;
    flex-shrink: 0;
    align-items: center;
    margin: 6px 0;
    padding: 12px;
    border: none;
    border-radius: 6px;
    background-color: #151723;
    transition: background-color .14s ease;
  }

  .view-modal__bobux {
    width: 18px;
    height: 18px;
    margin-right: 4px;
  }

  .view-modal__chance {
    margin-left: auto;
    color: rgba(255, 255, 255, .65);
    font-weight: 600;
  }

  .view-modal__item-row {
    border-bottom: 3px solid rgb(var(--view-modal-rarity, 108, 108, 108));
  }

  .view-modal__item-image-wrapper {
    position: relative;
    width: 50px;
    height: 50px;
    flex-shrink: 0;
    margin-right: 10px;
  }

  .view-modal__blurred-item-image {
    position: absolute;
    inset: 0;
    z-index: 0;
    width: 100%;
    height: 100%;
    border-radius: 8px;
    filter: blur(9px);
    opacity: .55;
  }

  .view-modal__normal-item-image {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 100%;
    border-radius: 8px;
  }

  .view-modal__item-details {
    display: flex;
    width: 100%;
    min-width: 0;
    flex-direction: column;
  }

  .view-modal__item-name {
    display: block;
    max-width: 100%;
    overflow: hidden;
    color: rgba(255, 255, 255, .92);
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .view-modal__item-value {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-top: 2px;
    color: rgb(var(--view-modal-rarity, 108, 108, 108));
    font-weight: 700;
  }

  .view-modal__item-value-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    opacity: .95;
  }

  .view-modal__mobile-value {
    display: none;
  }

  .view-modal__desktop-value {
    display: flex;
  }

  /* AMP reference coinflip viewer */
  .view-modal__backdrop {
    padding: 0;
    overflow: hidden;
    background: rgba(4, 5, 8, .76);
    -webkit-backdrop-filter: blur(9px);
    backdrop-filter: blur(9px);
  }
  .view-modal__surface {
    width: calc(100% - 48px);
    max-width: 900px;
    height: min(600px, calc(100dvh - 48px));
    max-height: calc(100dvh - 48px);
    min-height: 0;
    margin: auto;
    overflow: visible;
    border: 0;
    border-radius: 0;
    color: #f4f5f8;
    background: transparent;
  }
  .view-modal__header {
    position: relative;
    flex: 0 0 56px;
    height: 56px;
    margin: 0;
    padding: 12px 20px;
    box-sizing: border-box;
  }
  .view-modal__logo {
    width: 156px;
    max-width: 180px;
    height: 32px;
    margin: 0 auto;
    border-radius: 0;
    object-fit: contain;
    transform: translateY(-6px);
  }
  .view-modal__close {
    top: 12px;
    right: 12px;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    color: #B7BBCB;
    background: #3C3C59;
    font-size: 12px;
    opacity: 1;
    transition: color .2s, background-color .2s, box-shadow .2s;
  }
  .view-modal__close svg { width: 14px; height: 14px; }
  .view-modal__close:hover { color: #b3b8c3; background: #4D4A6B; opacity: 1; }
  .view-modal__close:focus-visible { outline: 2px solid #DDD2F1; outline-offset: 0; box-shadow: none; }
  .view-modal__body {
    min-height: 0;
    flex: 1 1 auto;
    overflow-x: hidden;
    overflow-y: hidden;
  }
  .view-modal__body::-webkit-scrollbar { display: none; }
  .view-modal__content {
    position: relative;
    display: flex;
    height: 100%;
    min-width: 0;
    min-height: 0;
    flex-direction: column;
    gap: 12px;
    box-sizing: border-box;
    padding: 16px;
    border: 1px solid rgba(255,255,255,.06);
    border-radius: 11px;
    background: #292A42;
  }
  .view-modal__players {
    display: grid;
    min-height: 280px;
    grid-template-columns: minmax(0,270px) minmax(0,360px) minmax(0,270px);
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 12px 20px;
    box-sizing: border-box;
  }
  .view-modal__player {
    width: 100%;
    min-width: 0;
    flex-shrink: 1;
    gap: 8px;
    opacity: 1;
    transition: opacity .24s ease, filter .24s ease;
  }
  .view-modal__player--loser { opacity: .34; filter: saturate(.62) brightness(.74); }
  .view-modal__avatar-wrapper {
    position: relative;
    display: block;
    width: 98px;
    height: 98px;
    padding: 3px;
    box-sizing: border-box;
    border-radius: 9999px;
    background: #303540;
  }
  .view-modal__avatar-wrapper--heads { background: #804AFF; }
  .view-modal__avatar-wrapper--tails { background: #DDD2F1; }
  .view-modal__avatar {
    display: inline-flex;
    width: 92px;
    height: 92px;
    margin: 0;
    box-sizing: border-box;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 9999px;
    color: #fff;
    background: #202134;
    object-fit: cover;
  }
  .view-modal__avatar:hover { border-color: transparent; filter: none; }
  .view-modal__avatar--waiting svg { width: 24px; height: 24px; }
  .view-modal__avatar.view-modal__winner {
    border: 0;
    box-shadow: none;
  }
  .view-modal__coin {
    top: -8px;
    right: -8px;
    bottom: auto;
    width: 40px;
    height: 40px;
    filter: none;
  }
  .view-modal__username {
    width: auto;
    max-width: 180px;
    height: 21px;
    margin: 0;
    color: #f3f4f6;
    font-size: 14px;
    font-weight: 600;
    line-height: 21px;
  }
  .view-modal__game-info {
    width: 100%;
    min-height: 280px;
    flex-shrink: 1;
    justify-content: center;
  }
  .view-modal__middle-action {
    position: relative;
    display: flex;
    min-width: 110px;
    height: 42px;
    align-items: center;
    justify-content: center;
    padding: 0 16px;
    border: 0;
    border-radius: 8px;
    color: #202134;
    background: linear-gradient(135deg, #DDD2F1, #804AFF);
    box-shadow: none;
    font: 700 13px/15.6px Poppins,sans-serif;
    cursor: pointer;
  }
  .view-modal__middle-action:hover { background: linear-gradient(135deg, #DDD2F1, #804AFF); }
  .view-modal__middle-action--cancel { color: #fff; background: #e34f5f; }
  .view-modal__middle-action--cancel:hover { background: #ef6271; }
  .view-modal__middle-action:disabled { cursor: not-allowed; opacity: .55; }
  .view-modal__versus { margin: 0; color: #777e8d; font-size: 18px; font-weight: 700; line-height: 27px; }
  .view-modal__coin-video {
    width: 280px;
    height: 280px;
    border-radius: 0;
    mix-blend-mode: screen;
    transform: none;
  }
  .view-modal__winner-coin { display: block; width: 150px; height: 150px; object-fit: contain; }
  .view-modal__seed-grid {
    display: grid;
    height: 46px;
    grid-template-columns: repeat(3,minmax(0,1fr));
    gap: 8px;
  }
  .view-modal__seed {
    display: flex;
    min-width: 0;
    height: 46px;
    box-sizing: border-box;
    align-items: center;
    gap: 8px;
    padding: 0 16px;
    border: 1px solid rgba(255,255,255,.06);
    border-radius: 8px;
    outline: 0;
    color: #9298a5;
    background: #3C3C59;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: border-color .15s ease, background-color .15s ease;
  }
  .view-modal__seed:hover { border-color: rgba(255,255,255,.12); background: #252a35; }
  .view-modal__seed:focus-visible { border-color: #DDD2F1; outline: 2px solid rgba(221,210,241,.35); outline-offset: 0; box-shadow: none; }
  .view-modal__seed svg { width: 13px; height: 13px; flex: 0 0 13px; }
  .view-modal__seed span {
    min-width: 0;
    overflow: hidden;
    color: #aeb3be;
    font: 400 12px/18px monospace;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .view-modal__totals {
    display: grid;
    height: 46px;
    grid-template-columns: repeat(2,minmax(0,1fr));
    gap: 8px;
  }
  .view-modal__total {
    display: flex;
    height: 46px;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 16px;
    box-sizing: border-box;
    border-radius: 8px;
    background: #3C3C59;
  }
  .view-modal__total strong { color: #f0f1f4; font-size: 15px; font-weight: 700; line-height: 22.5px; }
  .view-modal__total span { display: flex; align-items: center; gap: 6px; color: #f0f1f4; font-size: 14px; font-weight: 700; line-height: 21px; }
  .view-modal__total svg { width: 16px; height: 16px; color: #804AFF; }
  .view-modal__items {
    display: grid;
    width: 100%;
    height: 80px;
    flex: 0 0 80px;
    grid-template-columns: repeat(2,minmax(0,1fr));
    justify-content: normal;
    gap: 32px;
    margin: 0;
    padding: 0;
    overflow: hidden;
  }
  .view-modal__surface--cancelable .view-modal__items { padding-bottom: 0; }
  .view-modal__player-items {
    display: flex;
    width: 100%;
    height: 80px;
    min-width: 0;
    flex-direction: column;
    padding: 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: none;
  }
  .view-modal__player-items::-webkit-scrollbar { display: none; }
  .view-modal__item-row {
    display: flex;
    width: 100%;
    min-width: 0;
    height: 64px;
    flex-shrink: 0;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
    box-sizing: border-box;
    border: 0;
    border-radius: 0;
    background: transparent;
  }
  .view-modal__item-image-wrapper { display: flex; width: 48px; height: 48px; flex: 0 0 48px; align-items: center; justify-content: center; margin: 0; overflow: visible; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
  .view-modal__normal-item-image { display: block; width: 46px; height: 46px; margin: 0; padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; object-fit: contain; object-position: center; }
  .view-modal__item-name {
    display: flow-root;
    min-width: 0;
    flex: 1;
    margin: 0;
    overflow: hidden;
    color: #dde0e6;
    font-size: 13px;
    font-weight: 500;
    line-height: 19.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .view-modal__item-value { display: flex; flex: 0 0 auto; align-items: center; gap: 6px; margin: 0; color: #f1f2f5; font-size: 12px; font-weight: 600; line-height: 18px; }
  .view-modal__item-value svg { width: 11px; height: 11px; color: #DDD2F1; }
  .view-modal__waiting-items { display: flex; min-height: 80px; align-items: center; justify-content: center; color: #777e8d; font-size: 13px; line-height: 19.5px; }
  .view-modal__divider { width: 100%; height: 1px; background: rgba(255,255,255,.16); opacity: .6; }
  .view-modal__footer { position: relative; display: flex; width: 100%; min-height: 50px; align-items: center; justify-content: center; gap: 8px; }
  .view-modal__footer p { margin: 0; color: #8b919e; font-size: 12px; font-weight: 600; line-height: 18px; }
  .view-modal__fairness {
    position: absolute;
    top: 5px;
    left: 0;
    display: flex;
    min-width: 40px;
    height: 40px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 16px;
    border: 0;
    border-radius: 7px;
    color: #a8aeb9;
    background: #3C3C59;
    font: 600 12px/14.4px Poppins,sans-serif;
    cursor: pointer;
  }
  .view-modal__fairness:hover { color: #c1c6d0; background: #4D4A6B; }
  .view-modal__fairness svg { width: 13px; height: 13px; }
  .view-modal__footer-cancel {
    position: absolute;
    top: 5px;
    right: 0;
    min-width: 96px;
    height: 40px;
    padding: 0 16px;
  }

  @media (max-width: 760px) {
    .view-modal__surface { width: 100%; height: 100dvh; max-height: 100dvh; margin: 0; }
    .view-modal__body { padding: 0 8px 8px; overflow-y: auto; scrollbar-width: none; }
    .view-modal__content { height: auto; min-height: 100%; padding: 14px; gap: 12px; }
    .view-modal__players { min-height: 260px; grid-template-columns: minmax(0,1fr) 110px minmax(0,1fr); padding: 8px 0; gap: 8px; }
    .view-modal__game-info { min-height: 240px; }
    .view-modal__avatar-wrapper { width: 82px; height: 82px; }
    .view-modal__avatar { width: 76px; height: 76px; }
    .view-modal__coin { width: 34px; height: 34px; }
    .view-modal__username { max-width: 120px; font-size: 12px; }
    .view-modal__coin-video { width: 180px; height: 180px; }
    .view-modal__seed-grid { height: auto; grid-template-columns: 1fr; }
    .view-modal__items { gap: 16px; }
    .view-modal__fairness { position: static; }
    .view-modal__footer { justify-content: space-between; }
  }

  @media (max-width: 520px) {
    .view-modal__players { grid-template-columns: 1fr 86px 1fr; }
    .view-modal__middle-action { min-width: 76px; padding: 0 10px; }
    .view-modal__items { height: 256px; flex-basis: 256px; grid-template-columns: 1fr; gap: 0; }
    .view-modal__player-items { height: 128px; }
    .view-modal__totals { grid-template-columns: 1fr; height: auto; }
    .view-modal__item-name { font-size: 12px; }
  }

  .fairness-modal__backdrop {
    position: fixed;
    inset: 0;
    z-index: 2147483100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(0, 0, 0, .58);
    animation: view-modal-fade-in 160ms ease-out;
  }

  .fairness-modal__backdrop--closing {
    pointer-events: none;
    animation: fairness-modal-fade-out ${FAIRNESS_CLOSE_MS}ms cubic-bezier(.4, 0, 1, 1) both;
  }

  .fairness-modal__surface {
    position: relative;
    box-sizing: border-box;
    width: 90%;
    max-width: 600px;
    max-height: 90vh;
    margin: 0;
    padding: 2rem;
    overflow-x: hidden;
    overflow-y: auto;
    border: 0;
    border-radius: 5px;
    background: #25263B;
    color: #e1e4f2;
    box-shadow: none;
    font-family: Poppins, sans-serif;
    opacity: 1;
    transform: scale(1) translateY(0);
    animation: view-modal-open .3s forwards;
  }

  .fairness-modal__surface--closing {
    animation: fairness-modal-shrink-out ${FAIRNESS_CLOSE_MS}ms cubic-bezier(.4, 0, 1, 1) both;
  }

  @keyframes fairness-modal-fade-out {
    from { opacity: 1; }
    to { opacity: 0; }
  }

  @keyframes fairness-modal-shrink-out {
    from { opacity: 1; transform: scale(1) translateY(0); }
    to { opacity: 0; transform: scale(.96) translateY(8px); }
  }

  .fairness-modal__close {
    position: absolute;
    top: 12px;
    right: 14px;
    display: grid;
    width: 34px;
    height: 34px;
    place-items: center;
    padding: 0;
    border: 0;
    background: transparent;
    color: rgba(255, 255, 255, .76);
    font-size: 25px;
    cursor: pointer;
  }

  .fairness-modal__close:hover {
    color: #fff;
  }

  .fairness-modal__header {
    margin: 0 38px 24px 0;
    color: #fff;
    font-size: 24px;
    font-weight: 700;
    line-height: 1.25;
  }

  .fairness-modal__section + .fairness-modal__section {
    margin-top: 19px;
  }

  .fairness-modal__section-title {
    display: block;
    margin-bottom: 8px;
    color: rgba(255, 255, 255, .68);
    font-size: 13px;
    font-weight: 600;
  }

  .fairness-modal__value-holder {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 10px;
    padding: 12px 13px;
    border: 0;
    border-radius: 6px;
    background: #353650;
  }

  .fairness-modal__value {
    display: block;
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: rgba(255, 255, 255, .88);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 13px;
    line-height: 1.45;
  }

  .fairness-modal__copy {
    width: 18px;
    height: 18px;
    flex: 0 0 18px;
    border: 0;
    outline: none;
    box-shadow: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    color: #fff;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .fairness-modal__copy:focus,
  .fairness-modal__copy:focus-visible,
  .fairness-modal__copy:active {
    border: 0;
    outline: none;
    box-shadow: none;
  }

  .fairness-modal__copy:hover {
    color: rgba(255, 255, 255, .72);
  }

  .fairness-modal__pending {
    margin: 12px 0 0;
    color: #6c7399;
    font-size: 11px;
    font-weight: 500;
    line-height: 1.55;
    text-align: center;
  }

  @media (prefers-reduced-motion: reduce) {
    .view-modal__backdrop,
    .view-modal__surface,
    .view-modal__surface--closing,
    .fairness-modal__backdrop--closing,
    .fairness-modal__surface--closing {
      animation-duration: 1ms;
    }

  }
`
