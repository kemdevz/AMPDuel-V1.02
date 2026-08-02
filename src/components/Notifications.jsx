import { useCallback, useEffect, useState } from 'react'

const subscribers = new Set()
const DEFAULT_DURATION = 4000
let notificationId = 0
const SUCCESS_SOUND_URL = '/success-jgkLyONA.mp3'
const ERROR_SOUND_URL = '/error-DccXaKyU.mp3'

function playNotificationSound(type) {
  if (typeof window === 'undefined') return
  const soundUrl = type === 'success'
    ? SUCCESS_SOUND_URL
    : type === 'error'
      ? ERROR_SOUND_URL
      : null
  if (!soundUrl) return

  try {
    const audio = new Audio(soundUrl)
    audio.volume = 0.35
    void audio.play().catch(() => undefined)
  } catch {
    // ignore autoplay restrictions
  }
}

function publish(notification) {
  playNotificationSound(notification?.type)

  subscribers.forEach((subscriber) => subscriber(notification))
}

export function showNotification(message, options = {}) {
  const notification = {
    id: ++notificationId,
    message: String(message || ''),
    type: options.type || 'info',
    duration: Math.max(1000, Number(options.duration) || DEFAULT_DURATION),
  }

  publish(notification)
  return notification.id
}

showNotification.error = (message, options = {}) =>
  showNotification(message, { ...options, type: 'error' })

showNotification.success = (message, options = {}) =>
  showNotification(message, { ...options, type: 'success' })

showNotification.info = (message, options = {}) =>
  showNotification(message, { ...options, type: 'info' })

export const notify = showNotification

export const notifications = Object.freeze({
  insufficientCoins: () =>
    showNotification('Insufficient coins', { type: 'error' }),

  invalidPromoCode: () =>
    showNotification('Invalid promo code!', { type: 'error' }),

  promoCodeRequired: () =>
    showNotification('Enter a promocode first.', { type: 'error' }),

  signInToRedeem: () =>
    showNotification('Please sign in to redeem a code.', { type: 'error' }),

  promoCodeRedeemed: (itemName) =>
    showNotification(`${itemName || 'Your reward'} was added to your inventory.`, { type: 'success' }),

  promoCodeFailed: (message) =>
    showNotification(message || 'Failed to redeem code.', { type: 'error' }),

  invalidTipAmount: () =>
    showNotification('Enter a whole number greater than 0', { type: 'error' }),

  exchangeFailed: (message) =>
    showNotification(message || 'Failed to exchange items.', { type: 'error' }),

  giveawayCreateFailed: (message) =>
    showNotification(message || 'Failed to create giveaway.', { type: 'error' }),

  coinflipCreateFailed: (message) =>
    showNotification(message || 'Failed to create coinflip.', { type: 'error' }),

  inventoryWithdrawFailed: (message) =>
    showNotification(message || 'Failed to withdraw items.', { type: 'error' }),

  withdrawalCancelFailed: (message) =>
    showNotification(message || 'Failed to cancel withdrawals.', { type: 'error' }),

  loginFailed: (message) =>
    showNotification(message || 'Unable to complete login.', { type: 'error' }),

  selectedValueTooHigh: () =>
    showNotification('Selected value is too high', { type: 'error' }),

  autoSelected: (itemCount) => {
    const count = Math.max(0, Number(itemCount) || 0)
    return showNotification(
      `Auto selected ${count} ${count === 1 ? 'item' : 'items'}!`,
      { type: 'success' },
    )
  },

  joinedGame: () =>
    showNotification('Successfully joined the game!', { type: 'success' }),

  joinFailed: (message) =>
    showNotification(message || 'Unable to join coinflip', { type: 'error' }),

  tippedUser: (username) =>
    showNotification(`Successfully tipped ${username || 'user'}!`, { type: 'success' }),

  error: (message, options = {}) =>
    showNotification(message, { ...options, type: 'error' }),

  success: (message, options = {}) =>
    showNotification(message, { ...options, type: 'success' }),

  info: (message, options = {}) =>
    showNotification(message, { ...options, type: 'info' }),
})

function NotificationIcon({ type }) {
  if (type === 'success') {
    return (
      <span className="appNotificationIcon appNotificationIconSuccess" aria-hidden="true">
        <span />
      </span>
    )
  }

  if (type === 'info') {
    return (
      <span className="appNotificationIcon appNotificationIconInfo" aria-hidden="true">
        i
      </span>
    )
  }

  return (
    <span className="appNotificationIcon appNotificationIconError" aria-hidden="true">
      <span />
    </span>
  )
}

function NotificationToast({ notification, onRemove }) {
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    const exitDuration = 230
    const exitTimer = window.setTimeout(
      () => setIsExiting(true),
      Math.max(0, notification.duration - exitDuration),
    )
    const removeTimer = window.setTimeout(
      () => onRemove(notification.id),
      notification.duration,
    )

    return () => {
      window.clearTimeout(exitTimer)
      window.clearTimeout(removeTimer)
    }
  }, [notification.duration, notification.id, onRemove])

  return (
    <div
      className={`appNotification appNotification-${notification.type} ${isExiting ? 'appNotificationExiting' : ''}`}
      style={{ '--notification-duration': `${notification.duration}ms` }}
      onClick={() => {
        setIsExiting(true)
        window.setTimeout(() => onRemove(notification.id), 230)
      }}
    >
      <NotificationIcon type={notification.type} />
      <div role="status" aria-live="polite" className="appNotificationMessage">
        {notification.message}
      </div>
    </div>
  )
}

export default function Notifications() {
  const [notifications, setNotifications] = useState([])

  useEffect(() => {
    const subscriber = (notification) => {
      setNotifications((current) => [...current, notification])
    }

    subscribers.add(subscriber)
    return () => subscribers.delete(subscriber)
  }, [])

  const removeNotification = useCallback((id) => {
    setNotifications((current) => current.filter((notification) => notification.id !== id))
  }, [])

  return (
    <>
      <div className="appNotificationsViewport" aria-label="Notifications">
        {notifications.map((notification) => (
          <NotificationToast
            key={notification.id}
            notification={notification}
            onRemove={removeNotification}
          />
        ))}
      </div>

      <style>{`
        @keyframes appNotificationEnter {
          0% {
            opacity: 1;
            transform: translate3d(0, 35%, 0) scale(.96);
          }

          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }

        @keyframes appNotificationExit {
          0% {
            opacity: 1;
            transform: translate3d(0, 0, -1px) scale(1);
          }

          100% {
            opacity: 0;
            transform: translate3d(0, 150%, -1px) scale(.6);
          }
        }

        @keyframes appNotificationProgress {
          0% { width: 100%; }
          100% { width: 0; }
        }

        @keyframes appNotificationIconIn {
          from {
            opacity: 0;
            transform: scale(0) rotate(45deg);
          }

          to {
            opacity: 1;
            transform: scale(1) rotate(45deg);
          }
        }

        .appNotificationsViewport,
        .appNotificationsViewport * {
          box-sizing: border-box;
          font-family: Poppins, sans-serif;
        }

        .appNotificationsViewport {
          position: fixed;
          left: 16px;
          bottom: 16px;
          width: min(350px, calc(100vw - 32px));
          z-index: 9999;
          display: flex;
          flex-direction: column-reverse;
          align-items: flex-start;
          justify-content: flex-start;
          gap: 8px;
          pointer-events: none;
        }

        .appNotification {
          position: relative;
          display: flex;
          width: fit-content;
          max-width: 100%;
          padding: 10px 14px 14px;
          overflow: hidden;
          align-items: center;
          border: 1px solid #181a28;
          border-radius: 8px;
          background: #131520;
          box-shadow: 0 3px 10px rgba(0, 0, 0, .1), 0 3px 3px rgba(0, 0, 0, .05);
          color: #fff;
          font-size: 14px;
          font-weight: 400;
          line-height: 1.3;
          pointer-events: auto;
          cursor: pointer;
          will-change: transform;
          animation: appNotificationEnter .14s cubic-bezier(.21, 1.02, .73, 1) forwards;
        }

        .appNotification::after {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          height: 3px;
          background: #6c63ff;
          content: "";
          transform-origin: left;
          animation: appNotificationProgress var(--notification-duration, 4000ms) linear forwards;
        }

        .appNotification-error::after {
          background: #ef4444;
        }

        .appNotification-success::after {
          background: #22c55e;
        }

        .appNotificationExiting {
          animation: appNotificationExit .23s cubic-bezier(.21, 1.02, .73, 1) forwards;
        }

        .appNotificationIcon {
          position: relative;
          display: flex;
          width: 20px;
          min-width: 20px;
          height: 20px;
          align-items: center;
          justify-content: center;
        }

        .appNotificationIconError,
        .appNotificationIconSuccess {
          width: 20px;
          height: 20px;
          border-radius: 10px;
          opacity: 0;
          transform: rotate(45deg);
          animation: appNotificationIconIn .14s cubic-bezier(.175, .885, .32, 1.275) forwards;
        }

        .appNotificationIconError {
          background: #ff4b4b;
        }

        .appNotificationIconError span::before,
        .appNotificationIconError span::after {
          position: absolute;
          bottom: 9px;
          left: 4px;
          width: 12px;
          height: 2px;
          border-radius: 3px;
          background: #fff;
          content: "";
        }

        .appNotificationIconError span::after {
          transform: rotate(90deg);
        }

        .appNotificationIconSuccess {
          background: #61d345;
        }

        .appNotificationIconSuccess span {
          position: absolute;
          bottom: 6px;
          left: 6px;
          width: 6px;
          height: 10px;
          border-right: 2px solid #fff;
          border-bottom: 2px solid #fff;
        }

        .appNotificationIconInfo {
          border-radius: 50%;
          background: #6c63ff;
          color: #fff;
          font-size: 13px;
          font-weight: 700;
        }

        .appNotificationMessage {
          display: flex;
          margin: 4px 10px;
          flex: 1 1 auto;
          justify-content: center;
          color: inherit;
          white-space: pre-line;
        }

        @media (max-width: 640px) {
          .appNotificationsViewport {
            left: 10px;
            bottom: calc(4.5rem + max(10px, env(safe-area-inset-bottom)));
            width: min(280px, calc(100vw - 20px));
            gap: 6px;
            align-items: flex-start;
          }

          .appNotification {
            width: auto;
            max-width: 100%;
            padding: 7px 10px 10px;
            border-radius: 7px;
            font-size: 12px;
            line-height: 1.25;
          }

          .appNotificationIcon,
          .appNotificationIconError,
          .appNotificationIconSuccess {
            width: 18px;
            min-width: 18px;
            height: 18px;
          }

          .appNotificationMessage {
            margin: 3px 7px;
          }
        }
      `}</style>
    </>
  )
}
