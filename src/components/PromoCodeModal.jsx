import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../store/auth'
import { loadRecaptcha, RECAPTCHA_TEST_SITE_KEY } from '../lib/recaptcha'
import { notifications } from './Notifications'

export default function PromoCodeModal({ isOpen, onClose }) {
  const [code, setCode] = useState('')
  const [isRedeeming, setIsRedeeming] = useState(false)
  const [feedback, setFeedback] = useState({ type: '', message: '' })
  const [captchaToken, setCaptchaToken] = useState('')
  const codeInputRef = useRef(null)
  const captchaContainerRef = useRef(null)
  const captchaWidgetIdRef = useRef(null)

  const user = useAuth((state) => state.user)
  const balance = useAuth((state) => state.balance)
  const setBalance = useAuth((state) => state.setBalance)

  useEffect(() => {
    if (!isOpen) {
      setCode('')
      setFeedback({ type: '', message: '' })
      setIsRedeeming(false)
      setCaptchaToken('')
      return undefined
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen || !captchaContainerRef.current) return undefined

    let cancelled = false
    const sitekey = import.meta.env.DEV
      ? RECAPTCHA_TEST_SITE_KEY
      : import.meta.env.VITE_RECAPTCHA_SITE_KEY || ''

    if (!sitekey) {
      setFeedback({ type: 'error', message: 'reCAPTCHA is not configured.' })
      return undefined
    }

    void loadRecaptcha()
      .then((grecaptcha) => {
        if (cancelled || !captchaContainerRef.current) return
        captchaWidgetIdRef.current = grecaptcha.render(captchaContainerRef.current, {
          sitekey,
          theme: 'dark',
          size: window.innerWidth < 380 ? 'compact' : 'normal',
          callback: (token) => {
            setCaptchaToken(token)
            setFeedback({ type: '', message: '' })
            window.setTimeout(() => codeInputRef.current?.focus(), 0)
          },
          'expired-callback': () => setCaptchaToken(''),
          'error-callback': () => {
            setCaptchaToken('')
            setFeedback({ type: 'error', message: 'Verification failed. Please try again.' })
          },
        })
      })
      .catch((error) => {
        if (!cancelled) {
          setFeedback({ type: 'error', message: error?.message || 'Google reCAPTCHA failed to load.' })
        }
      })

    return () => {
      cancelled = true
      if (window.grecaptcha && captchaWidgetIdRef.current != null) {
        window.grecaptcha.reset(captchaWidgetIdRef.current)
      }
      if (captchaContainerRef.current) captchaContainerRef.current.replaceChildren()
      captchaWidgetIdRef.current = null
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!code.trim()) {
      notifications.error('Enter a promocode first.')
      return
    }

    if (!user?.id) {
      notifications.error('Please sign in to redeem a code.')
      return
    }

    if (!captchaToken) {
      notifications.error('Complete the CAPTCHA before redeeming this code.')
      return
    }

    setIsRedeeming(true)
    setFeedback({ type: '', message: '' })

    try {
      const currentUserId = String(user.profile_id || user.id || '')
      if (!currentUserId) throw new Error('Unable to resolve your account id.')

      const response = await fetch('/api/promocode/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          profile_id: currentUserId,
          captcha_token: captchaToken,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.ok) throw new Error(result.error || 'Failed to redeem code.')
      const itemRow = result.item
      if (!itemRow) throw new Error('The reward item could not be found.')

      const rewardValue = Number(itemRow.value ?? 0)
      if (rewardValue > 0) {
        setBalance(Number(balance || 0) + rewardValue)
      }

      window.dispatchEvent(new CustomEvent('wallet:updated'))
      setCode('')
      setCaptchaToken('')
      notifications.success(`${itemRow.name} was added to your inventory.`)
      window.setTimeout(() => onClose?.(), 900)
    } catch (error) {
      notifications.error(error.message || 'Failed to redeem code.')
      setCaptchaToken('')
      if (window.grecaptcha && captchaWidgetIdRef.current != null) {
        window.grecaptcha.reset(captchaWidgetIdRef.current)
      }
    } finally {
      setIsRedeeming(false)
    }
  }

  return (
    <div
      className="promoCodeOverlay"
      onClick={onClose}
    >
      <style>{`
        @keyframes promoCodeFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes promoCodeModalOpen {
          from { opacity: 0; transform: scale(.8); }
          to { opacity: 1; transform: scale(1); }
        }

        .promoCodeOverlay {
          position: fixed;
          inset: 0;
          z-index: 999;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: rgba(0, 0, 0, .5);
          animation: promoCodeFadeIn .5s ease-out;
        }

        .promoCodeModal,
        .promoCodeModal * {
          box-sizing: border-box;
          font-family: Poppins, sans-serif;
        }

        .promoCodeModal {
          position: relative;
          display: flex;
          width: 90%;
          max-width: 380px;
          max-height: 90%;
          margin: 20px;
          padding: 28px 24px 24px;
          flex-direction: column;
          gap: 0;
          overflow-y: auto;
          border: 1px solid #1e2235;
          border-radius: 12px;
          background-color: #171925;
          color: #e1e4f2;
          scrollbar-width: none;
          animation: promoCodeModalOpen .3s forwards;
        }

        .promoCodeModal::-webkit-scrollbar {
          display: none;
        }

        .promoCodeClose {
          position: absolute;
          top: 14px;
          right: 16px;
          z-index: 1000;
          padding: 0;
          border: none;
          background: none;
          color: rgba(255, 255, 255, .5);
          font-size: 22px;
          line-height: 1;
          cursor: pointer;
          transition: color .2s ease;
        }

        .promoCodeClose:hover {
          color: rgba(255, 255, 255, .9);
        }

        .promoCodeIconHeader {
          position: relative;
          z-index: 1;
          display: flex;
          margin-bottom: 24px;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          text-align: center;
        }

        .promoCodeIconBg {
          display: flex;
          width: 60px;
          height: 60px;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: rgba(108, 99, 255, .12);
          color: #6c63ff;
        }

        .promoCodeTitle {
          margin: 0;
          color: #fff;
          font-size: 1.1rem;
          font-weight: 700;
          letter-spacing: .2px;
        }

        .promoCodeSubtitle {
          margin: 0;
          color: rgba(255, 255, 255, .4);
          font-size: 12px;
          font-weight: 500;
          letter-spacing: .2px;
        }

        .promoCodeForm {
          margin: 0;
        }

        .promoCodeSection {
          position: relative;
          z-index: 1;
          margin-bottom: 14px;
        }

        .promoCodeSectionTitle {
          display: block;
          margin-bottom: 6px;
          color: rgba(255, 255, 255, .45);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .7px;
          text-transform: uppercase;
        }

        .promoCodeInputHolder {
          display: flex;
          width: 100%;
          max-width: 100%;
          height: 40px;
          padding: 0 14px;
          align-items: center;
          gap: .5rem;
          border: none;
          border-radius: 6px;
          background: #1c1f2e;
          transition: background .15s;
        }

        .promoCodeInput {
          display: inline-block;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          overflow: hidden;
          border: none;
          outline: none;
          background: transparent;
          color: #fff;
          font-size: 1rem;
          text-overflow: ellipsis;
          white-space: nowrap;
          word-break: break-word;
        }

        .promoCodeFeedback {
          margin: 7px 0 0;
          font-size: 12px;
          font-weight: 500;
          line-height: 1.35;
        }

        .promoCodeFeedbackSuccess {
          color: #34d399;
        }

        .promoCodeFeedbackError {
          color: #f87171;
        }

        .promoCodeButtonContainer {
          position: relative;
          z-index: 1;
          margin-top: 8px;
        }

        .promoCodeCaptcha {
          display: flex;
          min-height: 78px;
          margin: 2px 0 14px;
          align-items: center;
          justify-content: center;
        }

        .promoCodeCaptchaComplete {
          display: none;
        }

        .promoCodeButton {
          position: relative;
          isolation: isolate;
          display: flex;
          width: 100%;
          min-width: 120px;
          height: 40px;
          padding: 0 20px;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          border: none;
          border-radius: 6px;
          background: linear-gradient(180deg, #8079ff 0%, #6c63ff 45%, #5a51e6 100%);
          color: #fff;
          font-size: .9rem;
          font-weight: 600;
          letter-spacing: .01em;
          cursor: pointer;
          transform-origin: center;
          transition: transform .13s cubic-bezier(.22, 1, .36, 1), filter .14s ease;
        }

        .promoCodeButton:hover:not(:disabled) {
          filter: brightness(1.07);
        }

        .promoCodeButton:active:not(:disabled) {
          transform: scale(.98);
        }

        .promoCodeButton:focus-visible {
          outline: 2px solid #8079ff;
          outline-offset: 2px;
        }

        .promoCodeButton:disabled {
          opacity: .6;
          cursor: not-allowed;
          transform: none;
          filter: none;
        }

        @media (max-width: 640px) {
          .promoCodeModal {
            max-width: 92%;
            margin: 16px;
            padding: 24px 20px 20px;
          }

          .promoCodeInput {
            width: 100%;
            max-width: 100%;
            font-size: .95rem;
            white-space: normal;
          }
        }
      `}</style>

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Redeem promocode"
        className="promoCodeModal"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close"
          className="promoCodeClose"
          onClick={onClose}
        >
          ×
        </button>

        <div className="promoCodeIconHeader">
          <div className="promoCodeIconBg">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M22 7H2v5h20V7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 21V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="promoCodeTitle">Redeem Promocode</h2>
          <p className="promoCodeSubtitle">Enter a code to claim your reward</p>
        </div>

        <form onSubmit={handleSubmit} className="promoCodeForm">
          <div className="promoCodeSection">
            <label className="promoCodeSectionTitle" htmlFor="promo-code-input">
              Redeem Code
            </label>
            <div className="promoCodeInputHolder">
              <input
                id="promo-code-input"
                ref={codeInputRef}
                type="text"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="Enter a code..."
                autoComplete="off"
                spellCheck="false"
                className="promoCodeInput"
              />
            </div>

            {feedback.message ? (
              <p
                className={`promoCodeFeedback ${
                  feedback.type === 'success'
                    ? 'promoCodeFeedbackSuccess'
                    : 'promoCodeFeedbackError'
                }`}
              >
                {feedback.message}
              </p>
            ) : null}
          </div>

          <div
            ref={captchaContainerRef}
            className={`promoCodeCaptcha ${captchaToken ? 'promoCodeCaptchaComplete' : ''}`}
          />

          <div className="promoCodeButtonContainer">
            <button
              type="submit"
              disabled={isRedeeming || !captchaToken}
              className="promoCodeButton"
            >
              {isRedeeming ? 'Redeeming...' : 'Redeem Code'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
