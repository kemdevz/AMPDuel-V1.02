import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const NOTIFICATION_EVENT = 'bloxdice:notification'
const DEFAULT_DURATION = 4500
const MAX_VISIBLE_NOTIFICATIONS = 4
let notificationSequence = 0

function messageText(message, fallback) {
  if (typeof message === 'string' && message.trim()) return message.trim()
  if (message instanceof Error && message.message) return message.message
  if (message && typeof message === 'object' && typeof message.message === 'string') return message.message
  return fallback
}

function dispatchNotification(type, message, options = {}) {
  if (typeof window === 'undefined') return null
  const id = `notification-${Date.now()}-${notificationSequence += 1}`
  window.dispatchEvent(new CustomEvent(NOTIFICATION_EVENT, {
    detail: {
      id,
      type,
      title: options.title,
      message: messageText(message, 'Something went wrong. Please try again.'),
      duration: Math.max(1800, Number(options.duration) || DEFAULT_DURATION),
    },
  }))
  return id
}

function showNotification(message, options) {
  return dispatchNotification('info', message, options)
}

showNotification.error = (message, options) => dispatchNotification('error', message, options)
showNotification.success = (message, options) => dispatchNotification('success', message, options)
showNotification.info = (message, options) => dispatchNotification('info', message, options)

const errorNotice = (fallback) => (message) => showNotification.error(messageText(message, fallback))
const successNotice = (fallback) => (message) => showNotification.success(messageText(message, fallback))
const infoNotice = (fallback) => (message) => showNotification.info(messageText(message, fallback))

export const notifications = Object.freeze({
  insufficientCoins: errorNotice('You do not have enough coins for this action.'),
  invalidPromoCode: errorNotice('That promo code is invalid.'),
  promoCodeRequired: errorNotice('Enter a promo code first.'),
  signInToRedeem: errorNotice('Sign in to redeem a promo code.'),
  promoCodeRedeemed: successNotice('Promo code redeemed successfully.'),
  promoCodeFailed: errorNotice('Unable to redeem that promo code.'),
  invalidTipAmount: errorNotice('Enter a valid whole-number tip amount.'),
  coinflipCreateFailed: errorNotice('Unable to create the Coinflip game.'),
  inventoryWithdrawFailed: errorNotice('Unable to withdraw the selected items.'),
  withdrawalCancelFailed: errorNotice('Unable to cancel that withdrawal.'),
  loginFailed: errorNotice('Unable to sign in. Please try again.'),
  selectedValueTooHigh: errorNotice('The selected value is too high.'),
  autoSelected: infoNotice('Matching items were selected automatically.'),
  joinedGame: successNotice('You joined the game successfully.'),
  joinFailed: errorNotice('Unable to join that game.'),
  tippedUser: (username = 'user') => showNotification.success(`Successfully tipped ${username}.`),
  error: showNotification.error,
  success: showNotification.success,
  info: showNotification.info,
})

function NotificationIcon({ type, notificationId }) {
  const gradientId = `notification-gradient-${notificationId}`
  return <svg viewBox="0 0 31 34" aria-hidden="true"><defs><linearGradient id={gradientId} x1="4" y1="2" x2="27" y2="32" gradientUnits="userSpaceOnUse"><stop stopColor="#DDD2F1" /><stop offset="1" stopColor="#804AFF" /></linearGradient></defs>{type === 'success' ? <path fillRule="evenodd" clipRule="evenodd" d="M12.627.767a5.724 5.724 0 0 1 5.724 0l9.765 5.638a5.724 5.724 0 0 1 2.862 4.957v11.276a5.724 5.724 0 0 1-2.862 4.957l-9.765 5.639a5.724 5.724 0 0 1-5.724 0l-9.766-5.639A5.724 5.724 0 0 1 0 22.638V11.362a5.724 5.724 0 0 1 2.861-4.957zm10.371 10.402c-.466-.872-1.582-1.208-2.494-.752-1.398.7-2.656 1.855-3.72 3.054a35.34 35.34 0 0 0-2.879 3.871 50.51 50.51 0 0 0-1.464 2.444 7.486 7.486 0 0 0-1.321-.885c-.64-.324-1.341-.525-2.062-.463-1.017.124-1.744 1.017-1.624 1.992.15 1.23 1.08 1.195 1.93 1.626.318.16 1.023.632 2.021 1.92.39.503 1.031.768 1.684.696.653-.072 1.221-.47 1.494-1.047.005-.01.392-.792.673-1.32a45.516 45.516 0 0 1 1.821-3.115c.757-1.181 1.624-2.393 2.538-3.422.932-1.051 1.853-1.712 2.566-2.305.884-.735 1.303-1.422.837-2.294Z" fill={`url(#${gradientId})`} /> : type === 'error' ? <path fillRule="evenodd" clipRule="evenodd" d="M12.627.767a5.724 5.724 0 0 1 5.724 0l9.765 5.638a5.724 5.724 0 0 1 2.862 4.957v11.277a5.724 5.724 0 0 1-2.862 4.956l-9.765 5.639a5.724 5.724 0 0 1-5.724 0l-9.766-5.639A5.724 5.724 0 0 1 0 22.639V11.362a5.724 5.724 0 0 1 2.861-4.957zm1.765 21.695c-.316 0-.573.227-.573.505v2.353c0 .278.257.504.573.504h2.194c.316 0 .572-.226.572-.504v-2.353c0-.278-.256-.505-.572-.505zm0-14.286c-.316 0-.572.225-.573.504v11.037c0 .278.257.505.573.505h2.194c.316 0 .572-.227.572-.505V8.68c0-.279-.256-.504-.572-.504z" fill={`url(#${gradientId})`} /> : <><path d="M12.627.767a5.724 5.724 0 0 1 5.724 0l9.765 5.638a5.724 5.724 0 0 1 2.862 4.957v11.276a5.724 5.724 0 0 1-2.862 4.957l-9.765 5.639a5.724 5.724 0 0 1-5.724 0l-9.766-5.639A5.724 5.724 0 0 1 0 22.638V11.362a5.724 5.724 0 0 1 2.861-4.957z" fill={`url(#${gradientId})`} /><path d="M15.489 15.5v7" fill="none" stroke="#202134" strokeWidth="2.7" strokeLinecap="round" /><circle cx="15.489" cy="11.2" r="1.55" fill="#202134" /></>}</svg>
}

const TYPE_TITLES = { error: 'Error', success: 'Success', info: 'Notice' }

export default function NotificationCenter() {
  const [items, setItems] = useState([])
  const timersRef = useRef(new Map())

  const dismiss = useCallback((id) => {
    const timer = timersRef.current.get(id)
    if (timer) window.clearTimeout(timer)
    timersRef.current.delete(id)
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  useEffect(() => {
    const timers = timersRef.current
    const handleNotification = (event) => {
      const item = event.detail
      if (!item?.id || !item?.message) return
      setItems((current) => [...current.filter((entry) => entry.message !== item.message), item].slice(-MAX_VISIBLE_NOTIFICATIONS))
      timers.set(item.id, window.setTimeout(() => dismiss(item.id), item.duration))
    }
    window.addEventListener(NOTIFICATION_EVENT, handleNotification)
    return () => {
      window.removeEventListener(NOTIFICATION_EVENT, handleNotification)
      timers.forEach((timer) => window.clearTimeout(timer))
      timers.clear()
    }
  }, [dismiss])

  if (typeof document === 'undefined') return null

  return createPortal(<div className="notification-center" aria-live="polite" aria-relevant="additions removals">{items.map((item) => <article key={item.id} className={`notification-toast notification-toast--${item.type}`} role={item.type === 'error' ? 'alert' : 'status'} style={{ '--notification-duration': `${item.duration}ms` }}><span className="notification-toast-accent" aria-hidden="true" /><span className="notification-toast-icon"><NotificationIcon type={item.type} notificationId={item.id} /></span><span className="notification-toast-message"><strong>{item.title || TYPE_TITLES[item.type] || TYPE_TITLES.info}</strong><span>{item.message}</span></span><button type="button" className="notification-toast-close" aria-label="Dismiss notification" onClick={() => dismiss(item.id)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button><span className="notification-toast-progress" aria-hidden="true" /></article>)}</div>, document.body)
}
