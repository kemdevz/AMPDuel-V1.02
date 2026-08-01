import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { getInventoryItemAccent } from './InventoryItemCard'
import { notifications } from './Notifications'
import { apiRequest } from '../lib/apiClient'
import { useAuth } from '../store/auth'

// All coin animation assets and timing live here so the mockup can be retuned
// without touching the component markup.
export const VIEW_MODAL_CONFIG = Object.freeze({
  assets: {
    logo: '/whitelogo-Dvdx1F_Q.png',
    currency: '/bobux.png',
    coin: {
      heads: '/heads.png',
      tails: '/tails.png',
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

function formatValue(value) {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) ? numeric.toLocaleString('en-US') : '0'
}

function formatCompactValue(value) {
  const numeric = Number(value ?? 0)
  if (!Number.isFinite(numeric)) return '0'
  if (numeric >= 1_000_000) return `${(numeric / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`
  if (numeric >= 1_000) return `${(numeric / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return formatValue(numeric)
}

function normalizeItem(item, index) {
  return {
    ...item,
    id: item?.item_uuid || item?.id || item?.uuid || `item-${index}`,
    name: item?.name || 'Unnamed item',
    image: item?.image_url || item?.image || VIEW_MODAL_CONFIG.assets.currency,
    numericValue: Number(item?.value ?? 0) || 0,
    value: formatValue(item?.value),
  }
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

  return (
    <div className="view-modal__player">
      <button
        type="button"
        className="view-modal__avatar-wrapper"
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
          <div className="view-modal__avatar" aria-hidden="true" />
        ) : (
          <>
            <img
              src={player.avatar}
              alt={player.username}
              className={`view-modal__avatar${isWinner ? ' view-modal__winner' : ''}`}
              draggable={false}
              onError={(event) => {
                event.currentTarget.src = DEFAULT_AVATAR
              }}
            />
            <div className="view-modal__coin">
              <img
                src={VIEW_MODAL_CONFIG.assets.coin[player.side]}
                alt={`${player.side} coin`}
                draggable={false}
              />
            </div>
          </>
        )}
      </button>
      <h3 className="view-modal__username">
        {waiting ? 'Waiting...' : player.username}
      </h3>
    </div>
  )
}

function ItemColumn({ column }) {
  return (
    <div className="view-modal__player-items">
      <div className="view-modal__total-value-container">
        <div className="view-modal__item">
          <img
            src={VIEW_MODAL_CONFIG.assets.currency}
            alt="bobux"
            className="view-modal__bobux"
          />
          <p className="view-modal__desktop-value">{column.total}</p>
          <p className="view-modal__mobile-value">{column.mobileTotal}</p>
          <p className="view-modal__chance">{column.chance}</p>
        </div>
      </div>

      {column.items.map((item) => (
        <div
          key={item.id}
          className="view-modal__item view-modal__item-row"
          style={{ '--view-modal-rarity': getInventoryItemAccent(item) }}
        >
          <div className="view-modal__item-image-wrapper">
            <img
              src={item.image}
              alt=""
              className="view-modal__normal-item-image"
              loading="eager"
            />
            <img
              src={item.image}
              alt=""
              className="view-modal__blurred-item-image"
              loading="eager"
              aria-hidden="true"
            />
          </div>
          <div className="view-modal__item-details">
            <p className="view-modal__item-name">{item.name}</p>
            <p className="view-modal__item-value">
              <img
                src={VIEW_MODAL_CONFIG.assets.currency}
                alt="bobux"
                className="view-modal__item-value-icon"
              />
              {item.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

function CopyIcon({ label, onClick }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="fairness-modal__copy"
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick()
        }
      }}
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function shortenIdentifier(value, maxLength = 24) {
  const text = String(value || '')
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}

function FairnessModal({ gameId, serverSeedHash, resolved, onClose }) {
  const fields = [
    {
      id: 'game-id',
      label: 'Game ID',
      value: gameId,
      copiedMessage: 'Game ID copied to clipboard!',
    },
    ...(resolved ? [{
      id: 'server-seed-hash',
      label: 'Hashed Server Seed',
      value: serverSeedHash,
      copiedMessage: 'Hashed Server Seed copied to clipboard!',
    }] : []),
  ]

  const copyValue = async (value, copiedMessage) => {
    if (!value || value === 'Unavailable') return
    try {
      await navigator.clipboard.writeText(value)
      notifications.success(copiedMessage)
    } catch {
      notifications.error('Unable to copy to clipboard.')
    }
  }

  return (
    <div
      className="fairness-modal__backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="fairness-modal__surface" role="dialog" aria-modal="true" aria-labelledby="coinflip-fairness-title">
        <button type="button" className="fairness-modal__close" onClick={onClose} aria-label="Close fairness details">
          ×
        </button>
        <h1 id="coinflip-fairness-title" className="fairness-modal__header">Coinflip Fairness</h1>

        {fields.map((field) => (
          <div className="fairness-modal__section" key={field.id}>
            <span className="fairness-modal__section-title">{field.label}</span>
            <div className="fairness-modal__value-holder">
              <span className="fairness-modal__value" title={field.value}>{shortenIdentifier(field.value)}</span>
              <CopyIcon
                label={`Copy ${field.label}`}
                onClick={() => copyValue(field.value, field.copiedMessage)}
              />
            </div>
          </div>
        ))}
      </div>
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
  onProfileOpen = () => {},
  profileOpen = false,
}) {
  const user = useAuth((state) => state.user)
  const [closing, setClosing] = useState(false)
  const [fairnessOpen, setFairnessOpen] = useState(false)
  const [canceling, setCanceling] = useState(false)
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
    const creatorItems = (Array.isArray(room?.creator_items) ? room.creator_items : []).map(normalizeItem)
    const opponentItems = (Array.isArray(room?.opponent_items) ? room.opponent_items : []).map(normalizeItem)
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
      if (fairnessOpen) {
        setFairnessOpen(false)
        return
      }
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
          <div className="view-modal__header">
            <img
              src={VIEW_MODAL_CONFIG.assets.logo}
              alt="BloxyPot logo"
              className="view-modal__logo"
              draggable={false}
            />
            <button
              type="button"
              className="view-modal__close"
              onClick={close}
              aria-label="Close coinflip"
            >
              ×
            </button>
          </div>

          <div className="view-modal__players">
            <Player
              player={state.playerOne}
              completed={completed}
              winnerSide={winnerSide}
              winnerVisible={winnerVisible}
              onProfileOpen={onProfileOpen}
            />

            <div className="view-modal__game-info">
              {completed ? (
                <CoinAnimation
                  key={`${room?.id || room?.room_id || 'coinflip'}:${winnerSide}`}
                  side={winnerSide}
                  onComplete={() => setWinnerVisible(true)}
                />
              ) : (
                <p className="view-modal__versus">Vs</p>
              )}
            </div>

            <Player
              player={state.playerTwo}
              completed={completed}
              winnerSide={winnerSide}
              winnerVisible={winnerVisible}
              waiting={!completed}
              onProfileOpen={onProfileOpen}
            />
          </div>

          <button
            type="button"
            className="view-modal__game-id"
            onClick={() => setFairnessOpen(true)}
            aria-label="Open coinflip fairness details"
          >
            <div className="view-modal__game-id-holder">
              <svg
                className="view-modal__hashtag"
                viewBox="0 0 448 512"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M181.3 32.4c17.4 2.9 29.2 19.4 26.3 36.8L197.8 128h95.1l11.5-69.3c2.9-17.4 19.4-29.2 36.8-26.3s29.2 19.4 26.3 36.8L357.8 128H416c17.7 0 32 14.3 32 32s-14.3 32-32 32h-68.9l-21.3 128H384c17.7 0 32 14.3 32 32s-14.3 32-32 32h-68.9l-11.5 69.3c-2.9 17.4-19.4 29.2-36.8 26.3s-29.2-19.4-26.3-36.8l9.8-58.7h-95.2l-11.5 69.3c-2.9 17.4-19.4 29.2-36.8 26.3s-29.2-19.4-26.3-36.8l9.7-58.7H32c-17.7 0-32-14.3-32-32s14.3-32 32-32h68.9l21.3-128H64c-17.7 0-32-14.3-32-32s14.3-32 32-32h68.9l11.5-69.3c2.9-17.4 19.4-29.2 36.8-26.3zM187.1 192l-21.3 128h95.1l21.3-128z"
                />
              </svg>
              <p className="view-modal__game-id-tag">{room?.id || room?.room_id || 'Game ID unavailable'}</p>
            </div>
          </button>

          <div className="view-modal__items">
            <ItemColumn column={state.playerOne.column} />
            <ItemColumn column={state.playerTwo.column} />
          </div>
          {canCancel && (
            <button
              type="button"
              className={`view-modal__cancel${canceling ? ' view-modal__cancel--pending' : ''}`}
              onClick={() => { void cancelCoinflip() }}
              disabled={canceling}
            >
              Cancel
            </button>
          )}
        </div>
        {fairnessOpen && (
          <FairnessModal
            gameId={room?.id || room?.room_id || 'Unavailable'}
            serverSeedHash={room?.server_seed_hash || 'Unavailable'}
            resolved={completed}
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
    background-color: #131520;
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
    background-color: #1c1f2e;
    object-fit: cover;
    cursor: pointer;
    transition: transform .14s ease, border-color .14s ease, filter .14s ease;
  }

  .view-modal__avatar:hover {
    border-color: rgba(108, 99, 255, .65);
    filter: brightness(1.04);
  }

  .view-modal__avatar.view-modal__winner {
    border-color: rgba(108, 99, 255, .85);
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
    filter: drop-shadow(0 6px 16px rgba(0, 0, 0, .45));
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
    outline: 2px solid #6c63ff;
    outline-offset: 3px;
  }

  .view-modal__game-id-holder {
    display: flex;
    width: 22ch;
    margin-bottom: -14px;
    overflow: hidden;
    padding: 6px 10px;
    border-radius: 999px;
    background: #1c1f2e;
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
    background: #131520;
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
    background: #131520;
    color: #e1e4f2;
    box-shadow: 0 20px 80px #0000008c;
    font-family: Poppins, sans-serif;
    opacity: 1;
    transform: scale(1) translateY(0);
    animation: view-modal-open .3s forwards;
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
    background: #1c1f2e;
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

  @media (max-width: 768px) {
    .view-modal__coin-video {
      width: 150px;
      height: 150px;
      transform: scale(2.25);
    }
  }

  @media (max-width: 740px) {
    .view-modal__surface {
      min-width: 100%;
      min-height: 100%;
      border-radius: 0;
    }

    .view-modal__avatar {
      width: 90px;
      height: 90px;
    }

    .view-modal__items {
      width: calc(100% - 20px);
      gap: 10px;
      margin: 12px 10px 10px;
    }

    .view-modal__players {
      gap: 30px;
    }

    .view-modal__player,
    .view-modal__game-info {
      width: 100px;
    }

    .view-modal__versus {
      font-size: 34px;
    }

    .view-modal__desktop-value {
      display: none;
    }

    .view-modal__mobile-value {
      display: flex;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .view-modal__backdrop,
    .view-modal__surface,
    .view-modal__surface--closing {
      animation-duration: 1ms;
    }

  }
`
