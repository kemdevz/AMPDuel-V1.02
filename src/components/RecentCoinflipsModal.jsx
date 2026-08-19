import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CoinflipIcon } from './icons'
import { getInventoryItemCardStyle } from './InventoryItemCard'
import { formatPriceValue } from '../Utils/FormatPriceValues'

const DEFAULT_AVATAR = 'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-7E27815C7C5F72DA623094CFB3768D15-Png/420/420/AvatarHeadshot/Png/noFilter'
const CLOSE_DURATION_MS = 200

function compactValue(value) {
  return formatPriceValue(value)
}

function itemQuantity(item) {
  const quantity = Number(item?.quantity ?? item?.qty ?? item?.count ?? 1)
  return Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1
}

function gameValue(game) {
  const allItems = [...(game?.creator_items || []), ...(game?.opponent_items || [])]
  const itemTotal = allItems.reduce((total, item) => total + ((Number(item?.value) || 0) * itemQuantity(item)), 0)
  return itemTotal || Number(game?.total_value ?? game?.numericValue ?? game?.value ?? 0) || 0
}

function normalizeItem(item) {
  if (typeof item === 'string') return { id: item, image: item, name: 'Item' }
  return {
    ...item,
    id: item?.item_uuid || item?.id || item?.uuid || item?.image_url || item?.image,
    image: item?.image_url || item?.image || '',
    name: item?.name || 'Item',
    quantity: itemQuantity(item),
  }
}

function HistoryAvatar({ avatar, username, side, winner, onClick }) {
  return (
    <button
      type="button"
      className={`recentFlipPlayer ${winner ? 'recentFlipPlayer--winner' : 'recentFlipPlayer--loser'}`}
      onClick={onClick}
      aria-label={`Open ${username || 'player'} profile`}
    >
      <span className="recentFlipPlayerCoin">
        <img src={side === 'tails' ? '/tails.png' : '/heads.png'} alt="coin" className="recentFlipCoinIndicator" />
      </span>
      <img
        src={avatar || DEFAULT_AVATAR}
        alt={username || 'Player'}
        className="recentFlipAvatar"
        loading="lazy"
        draggable={false}
        referrerPolicy="no-referrer"
        onError={(event) => { event.currentTarget.src = DEFAULT_AVATAR }}
      />
    </button>
  )
}

function HistoryItem({ item, overlay }) {
  return (
    <div className="recentFlipItemWrapper" style={getInventoryItemCardStyle(item)} title={item.name}>
      {item.image ? (
        <>
          <img src={item.image} className="recentFlipBackgroundImage" alt="" loading="lazy" />
          <img src={item.image} className="recentFlipItem" alt={item.name} loading="lazy" />
        </>
      ) : null}
      {overlay > 0 ? <span className="recentFlipItemOverlay">+{overlay}</span> : null}
    </div>
  )
}

function HistoryRow({ game, onView, onProfileOpen }) {
  const creatorSide = String(game?.creator_side || 'heads').toLowerCase()
  const opponentSide = String(game?.opponent_side || (creatorSide === 'heads' ? 'tails' : 'heads')).toLowerCase()
  const result = String(game?.result || creatorSide).toLowerCase()
  const creatorWon = game?.winner_uuid
    ? String(game.winner_uuid) === String(game.creator_uuid)
    : result === creatorSide
  const opponentWon = game?.winner_uuid
    ? String(game.winner_uuid) === String(game.opponent_uuid)
    : result === opponentSide
  const items = [...(game?.creator_items || []), ...(game?.opponent_items || [])].map(normalizeItem)
  const visibleItems = items.slice(0, 3)
  const totalItemQuantity = items.reduce((total, item) => total + item.quantity, 0)
  const hiddenCount = Math.max(0, totalItemQuantity - visibleItems.length)
  const total = gameValue(game)
  const creatorValue = (game?.creator_items || []).reduce(
    (sum, item) => sum + ((Number(item?.value) || 0) * itemQuantity(item)),
    0,
  )
  const low = creatorValue || total / 2
  const high = total - low || low

  const openProfile = (player) => {
    const creator = player === 'creator'
    const id = creator ? game?.creator_uuid : game?.opponent_uuid
    if (!id) return
    const avatar = creator ? game?.creator_avatar_url : game?.opponent_avatar_url
    onProfileOpen?.({
      id,
      profile_id: id,
      username: creator ? game?.creator_username : game?.opponent_username,
      avatar,
      avatar_url: avatar,
      avatar_headshot_url: avatar,
    })
  }

  return (
    <article className="recentFlipRow">
      <div className="recentFlipPlayers">
        <HistoryAvatar
          avatar={game?.creator_avatar_url || game?.creator_avatar}
          username={game?.creator_username}
          side={creatorSide}
          winner={creatorWon}
          onClick={() => openProfile('creator')}
        />
        <HistoryAvatar
          avatar={game?.opponent_avatar_url || game?.opponent_avatar}
          username={game?.opponent_username}
          side={opponentSide}
          winner={opponentWon}
          onClick={() => openProfile('opponent')}
        />
      </div>

      <img src={result === 'tails' ? '/tails.png' : '/heads.png'} alt="Winner Coin" className="recentFlipWinnerCoin" />

      <div className="recentFlipItemColumn">
        <div className="recentFlipItemStack">
          {visibleItems.map((item, index) => (
            <HistoryItem
              key={`${item.id || 'item'}-${index}`}
              item={item}
              overlay={index === visibleItems.length - 1 ? hiddenCount : 0}
            />
          ))}
        </div>
      </div>

      <div className="recentFlipValue">
        <div className="recentFlipTopRow">
          <img src="/bobux.png" alt="Icon" className="recentFlipBobuxIcon" />
          <span>{compactValue(total)}</span>
        </div>
        <p>{compactValue(low)} — {compactValue(high)}</p>
      </div>

      <div className="recentFlipButtons">
        <button type="button" className="recentFlipViewButton" onClick={() => onView?.(game)}>View</button>
      </div>
    </article>
  )
}

export default function RecentCoinflipsModal({ isOpen, games = [], isAuthenticated, onClose, onView, onProfileOpen }) {
  const [closing, setClosing] = useState(false)
  const dialogRef = useRef(null)
  const closeTimerRef = useRef(null)

  const closeWith = useCallback((callback) => {
    if (closing) return
    setClosing(true)
    closeTimerRef.current = window.setTimeout(() => callback?.(), CLOSE_DURATION_MS)
  }, [closing])

  const requestClose = useCallback(() => closeWith(onClose), [closeWith, onClose])
  const requestView = useCallback((game) => closeWith(() => onView?.(game)), [closeWith, onView])

  useEffect(() => {
    if (isOpen) setClosing(false)
  }, [isOpen])

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
  }, [])

  useEffect(() => {
    if (!isOpen) return undefined
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusTimer = window.setTimeout(() => dialogRef.current?.focus(), 0)
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        requestClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus?.()
    }
  }, [isOpen, requestClose])

  if (!isOpen) return null

  return createPortal(
    <div className="recentFlipsBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose() }}>
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recent-flips-title"
        tabIndex={-1}
        className={`recentFlipsModal ${closing ? 'recentFlipsModal--closing' : ''}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" className="recentFlipsClose" aria-label="Close recent flips" onClick={requestClose}>×</button>
        <div className="recentFlipsContent">
          <div className="recentFlipsTitleRow">
            <span className="recentFlipsIconWrap"><CoinflipIcon className="recentFlipsGameIcon" /></span>
            <h1 id="recent-flips-title" className="recentFlipsTitle">Recent Flips</h1>
          </div>

          <div className="recentFlipsList">
            {games.length > 0 ? games.map((game) => (
              <HistoryRow key={game.id || game.room_id} game={game} onView={requestView} onProfileOpen={onProfileOpen} />
            )) : (
              <div className="recentFlipsEmpty">
                <p>{isAuthenticated ? 'No recent flips yet.' : 'Log in to view your recent flips.'}</p>
              </div>
            )}
          </div>
        </div>

        <style>{`
          @keyframes recentFlipsFadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes recentFlipsModalOpen { from { transform: scale(.95) translateY(15px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
          @keyframes recentFlipsShrinkOut { from { transform: scale(1); } to { transform: scale(.8); opacity: 0; } }
          .recentFlipsBackdrop { position: fixed; inset: 0; z-index: 2147482900; display: flex; align-items: center; justify-content: center; background-color: rgba(0,0,0,.55); animation: recentFlipsFadeIn .5s ease-out; font-family: Poppins, sans-serif; }
          .recentFlipsModal, .recentFlipsModal * { box-sizing: border-box; font-family: Poppins, sans-serif; }
          .recentFlipsModal { position: relative; display: flex; width: 85%; max-width: 700px; height: 450px; flex-direction: column; overflow: hidden; border: 1px solid #181a28; border-radius: 5px; background-color: #131520; padding: 20px; outline: none; transition: transform .3s ease-out; animation: recentFlipsModalOpen .3s forwards; }
          .recentFlipsModal--closing { animation: recentFlipsShrinkOut .2s forwards; }
          .recentFlipsClose { position: absolute; top: 2px; right: 7px; z-index: 1000; border: 0; background: none; color: #e1e4f2; padding: 0; font-size: 24px; line-height: normal; cursor: pointer; opacity: .8; transition: opacity .3s ease; }
          .recentFlipsClose:hover { opacity: 1; }
          .recentFlipsContent { display: flex; min-height: 0; flex-grow: 1; flex-direction: column; overflow: hidden; text-align: center; }
          .recentFlipsTitleRow { display: flex; align-items: center; gap: 8px; margin-bottom: 1em; }
          .recentFlipsIconWrap { position: relative; display: flex; width: 28px; height: 28px; flex-shrink: 0; align-items: center; justify-content: center; color: #8f96c8; }
          .recentFlipsGameIcon { width: 24px; height: 24px; }
          .recentFlipsTitle { margin: 0; color: #fff; font-size: 1rem; font-weight: 600; letter-spacing: .2px; }
          .recentFlipsList { display: flex; min-height: 0; height: 100%; flex-grow: 1; flex-direction: column; gap: 10px; overflow-y: auto; padding-right: 10px; scrollbar-width: thin; scrollbar-color: #999ea7 transparent; }
          .recentFlipsList::-webkit-scrollbar { width: 4px; background-color: transparent; }
          .recentFlipsList::-webkit-scrollbar-thumb { border-radius: 50px; background-color: #999ea7; }
          .recentFlipsList::-webkit-scrollbar-track { border-radius: 10px; background-color: transparent; }
          .recentFlipRow { position: relative; isolation: isolate; display: grid; width: 100%; height: auto; grid-template-columns: 132px minmax(148px,2fr) minmax(104px,1fr) 100px; align-items: center; justify-content: flex-start; gap: 1rem; border: 1px solid #252839; border-radius: 8px 8px 11px; background: #1c1f2e; padding: 1.02rem; }
          .recentFlipPlayers { position: relative; z-index: 3; display: flex; width: 132px; min-width: 132px; align-items: center; justify-content: flex-start; gap: 1.5rem; flex-wrap: nowrap; }
          .recentFlipPlayer { position: relative; display: flex; align-items: center; justify-content: center; border: 0; background: transparent; padding: 0; }
          .recentFlipPlayerCoin { position: absolute; top: -5px; right: -5px; z-index: 2; border-radius: 50%; padding: 2px; }
          .recentFlipCoinIndicator { width: 1.7rem; height: 1.7rem; border-radius: 50%; }
          .recentFlipAvatar { width: 3.3rem; height: 3.3rem; border: 2.5px solid #2F3347; border-radius: 50%; object-fit: cover; cursor: pointer; transition: border-color .3s, filter .3s; }
          .recentFlipPlayer:not(.recentFlipPlayer--loser) .recentFlipAvatar:hover, .recentFlipPlayer--winner .recentFlipAvatar { border-color: #6c63ff; }
          .recentFlipPlayer--loser .recentFlipAvatar { filter: brightness(.7); }
          .recentFlipPlayer--loser .recentFlipCoinIndicator { opacity: .4; }
          .recentFlipWinnerCoin { position: absolute; top: 50%; left: 53%; display: flex; width: 3.6rem; height: 3.7rem; align-items: center; justify-content: center; transform: translate(-50%,-50%); }
          .recentFlipItemColumn { position: relative; z-index: 1; display: flex; min-width: 0; width: 100%; align-items: center; justify-content: center; overflow: hidden; border-radius: 5px; padding: 2px 10px; contain: layout paint; }
          .recentFlipItemStack { display: flex; min-width: 0; width: min(100%,148px); min-height: 3.6rem; align-items: center; justify-content: center; overflow: hidden; padding-inline: 1.3rem; transform: translateX(-42px); }
          .recentFlipItemWrapper { position: relative; z-index: 1; display: flex; width: 3.6rem; height: 3.6rem; flex: 0 0 3.6rem; align-items: center; justify-content: center; overflow: hidden; border: 2.8px solid #252839; border-radius: 5px; background-color: #20222f; transition: border-color .15s ease; }
          .recentFlipItemWrapper + .recentFlipItemWrapper { margin-left: -2.6rem; }
          .recentFlipItemWrapper:nth-child(2) { z-index: 2; }
          .recentFlipItemWrapper:nth-child(3) { z-index: 3; }
          .recentFlipItemWrapper:hover { border-color: #6c63ff; }
          .recentFlipBackgroundImage { position: absolute; top: 50%; left: 50%; width: 3.7rem; height: 3.7rem; border-radius: 5px; object-fit: cover; filter: blur(6px); opacity: .6; transform: translate(-50%,-50%); }
          .recentFlipItem { position: absolute; top: 50%; left: 50%; width: 3.6rem; height: 3.6rem; border-radius: 5px; object-fit: cover; cursor: pointer; transform: translate(-50%,-50%); }
          .recentFlipItemOverlay { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; border-radius: 5px; background: rgba(32,34,47,.92); color: #fff; font-size: .9rem; font-weight: 500; pointer-events: none; }
          .recentFlipValue { display: flex; width: 100%; flex-direction: column; align-items: flex-start; justify-content: flex-start; margin-left: 1rem; padding: 2px; font-size: 1.2rem; font-weight: 700; }
          .recentFlipTopRow { display: flex; align-items: center; justify-content: flex-start; gap: 5px; color: #fff; font-size: 22px; font-weight: 700; }
          .recentFlipValue p { max-width: 100%; margin: 0 0 0 5px; overflow: hidden; color: rgba(225,228,242,.75); font-size: 14px; white-space: nowrap; text-overflow: ellipsis; }
          .recentFlipBobuxIcon { width: 25px; height: 25px; }
          .recentFlipButtons { display: flex; height: 140%; flex-direction: column; align-items: flex-end; justify-content: center; gap: .4em; }
          .recentFlipViewButton { width: 100px; max-width: 80%; min-width: 0; height: 35px; border: 0; border-radius: 6px; background: #2a2e44; padding: 0 20px; color: #e1e4f2; font-size: 14px; font-weight: 600; cursor: pointer; transition: background .2s ease, transform .1s ease; }
          .recentFlipViewButton:hover { background: #32385a; }
          .recentFlipViewButton:active { transform: scale(.97); }
          .recentFlipsEmpty { display: flex; height: 100%; align-items: center; justify-content: center; color: #8f96b5; font-size: 12px; font-weight: 500; }
          @media (max-width: 900px) {
            .recentFlipsModal { width: 100%; max-width: 100%; height: 100%; max-height: 100%; border-radius: 0; }
            .recentFlipsClose { top: 25px; right: 15px; }
            .recentFlipsTitle { margin-top: 15px; margin-bottom: 1rem; }
            .recentFlipRow { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.5rem; text-align: center; }
            .recentFlipPlayers { width: auto; min-width: 0; flex-direction: row; justify-content: center; }
            .recentFlipPlayer { flex-direction: column; }
            .recentFlipAvatar { width: 3.5rem; height: 3.5rem; }
            .recentFlipItemColumn { width: 100%; margin: 0; padding: 0; }
            .recentFlipItemStack { width: min(100%,148px); justify-content: center; padding-inline: 1.3rem; transform: none; }
            .recentFlipValue { align-items: center; margin: .5rem 0; font-size: 1.2rem; text-align: center; }
            .recentFlipValue p, .recentFlipWinnerCoin { display: none; }
            .recentFlipButtons { flex-direction: row; justify-content: flex-end; }
            .recentFlipTopRow { justify-content: flex-start; }
            .recentFlipsList:last-child { margin-bottom: 2rem; }
          }
          @media (prefers-reduced-motion: reduce) { .recentFlipsBackdrop, .recentFlipsModal, .recentFlipsModal--closing { animation-duration: 1ms; } }
        `}</style>
      </section>
    </div>,
    document.body,
  )
}
