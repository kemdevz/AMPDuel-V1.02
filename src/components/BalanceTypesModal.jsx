import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const CLOSE_ANIMATION_MS = 200

export default function BalanceTypesModal({ isOpen, onClose }) {
  const [closing, setClosing] = useState(false)
  const closeTimerRef = useRef(null)
  const closingRef = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const requestClose = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
    closeTimerRef.current = window.setTimeout(() => onCloseRef.current?.(), CLOSE_ANIMATION_MS)
  }, [])

  useEffect(() => {
    if (isOpen) {
      closingRef.current = false
      setClosing(false)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') requestClose()
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
    }
  }, [isOpen, requestClose])

  if (!isOpen || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="balance-types-modal__backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose()
      }}
    >
      <style>{BALANCE_TYPES_MODAL_STYLES}</style>
      <div
        className={`balance-types-modal__surface${closing ? ' balance-types-modal__surface--closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="balance-types-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="balance-types-modal__close"
          type="button"
          aria-label="Close"
          onClick={requestClose}
        >
          ×
        </button>

        <div className="balance-types-modal__header-wrap">
          <h2 id="balance-types-modal-title" className="balance-types-modal__header">
            Why There is 2 Balance Types?
          </h2>
        </div>

        <div className="balance-types-modal__card-row">
          <div className="balance-types-modal__card">
            <div>
              <h3 className="balance-types-modal__card-title">Items Balance</h3>
            </div>
            <p className="balance-types-modal__card-description">
              This balance Shows total Value of Items in your Inventory
            </p>
            <div className="balance-types-modal__how-to">
              <div className="balance-types-modal__how-to-title">ITEMS</div>
              <ul className="balance-types-modal__list">
                <li>are Not a Currency</li>
                <li>Can be obtained by depositing in-game Items</li>
              </ul>
            </div>
          </div>

          <div className="balance-types-modal__card">
            <div>
              <h3 className="balance-types-modal__card-title">Coins Balance</h3>
            </div>
            <p className="balance-types-modal__card-description">
              This balance Shows your current balance in Coins
            </p>
            <div className="balance-types-modal__how-to">
              <div className="balance-types-modal__how-to-title">COINS</div>
              <ul className="balance-types-modal__list">
                <li>Can be Obtained from Exchanging your in-game Items on-site.</li>
                <li>Can only be Exchanged for in-game Items on-site.</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="balance-types-modal__notice-box">
          <div className="balance-types-modal__notice-title">Exchanging</div>
          <p className="balance-types-modal__notice-text">
            You can exchange your Items to Coins and Coins to Items at any time. Please note there is a 5% fee while exchanging your Items to Coins.
          </p>
          <div className="balance-types-modal__notice-divider" />
          <div className="balance-types-modal__notice-title">Games</div>
          <p className="balance-types-modal__notice-text">
            There is Seperate Games to play with either ur Items or Coins.
          </p>
        </div>

        <div className="balance-types-modal__button-container">
          <button className="balance-types-modal__button" type="button" onClick={requestClose}>
            I Understand
            <svg
              className="balance-types-modal__button-icon"
              stroke="currentColor"
              fill="currentColor"
              strokeWidth="0"
              viewBox="0 0 448 512"
              height="1em"
              width="1em"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path d="M190.5 66.9l22.2-22.2c9.4-9.4 24.6-9.4 33.9 0L441 239c9.4 9.4 9.4 24.6 0 33.9L246.6 467.3c-9.4 9.4-24.6 9.4-33.9 0l-22.2-22.2c-9.5-9.5-9.3-25 .4-34.3L311.4 296H24c-13.3 0-24-10.7-24-24v-32c0-13.3 10.7-24 24-24h287.4L190.9 101.2c-9.8-9.3-10-24.8-.4-34.3z" />
            </svg>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

const BALANCE_TYPES_MODAL_STYLES = `
  .balance-types-modal__backdrop {
    --accent-gradient: linear-gradient(135deg, #5b52e2, #4038c0);
    --font-weight-btn: 600;
    --radius-sm: 8px;
    --dur-fast: .13s;
    --ease-out: cubic-bezier(.22, 1, .36, 1);
    --press-scale: .98;
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    background-color: #0000008c;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 999;
    animation: balance-types-modal-fade-in .5s ease-out;
    padding: 16px;
  }

  .balance-types-modal__surface {
    background-color: #131520;
    border: 0 solid #181a28;
    border-radius: 6px;
    padding: 22px;
    width: 720px;
    max-width: 92vw;
    color: #e1e4f2;
    animation: balance-types-modal-open .3s forwards;
    position: relative;
    display: flex;
    flex-direction: column;
    max-height: 90vh;
    overflow-y: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .balance-types-modal__surface::-webkit-scrollbar {
    display: none;
  }

  .balance-types-modal__close {
    position: absolute;
    top: 14px;
    right: 14px;
    background: none;
    border: none;
    color: #e1e4f2eb;
    font-size: 22px;
    cursor: pointer;
    opacity: .85;
    transition: opacity .2s ease, transform .15s ease;
    z-index: 1000;
  }

  .balance-types-modal__close:hover {
    opacity: 1;
    transform: scale(1.05);
  }

  .balance-types-modal__header-wrap {
    text-align: center;
    padding: 6px 36px 10px;
  }

  .balance-types-modal__header {
    margin: 0;
    font-size: 22px;
    font-weight: 800;
    color: #fff;
  }

  .balance-types-modal__card-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    margin-top: 14px;
  }

  .balance-types-modal__card {
    background: #1c1f2e;
    border: 0 solid rgba(37, 40, 57, .9);
    border-radius: 6px;
    padding: 14px;
    box-shadow: inset 0 0 24px #6c63ff14, 0 10px 26px #00000047;
  }

  .balance-types-modal__card-title {
    margin: 0;
    font-size: 14px;
    font-weight: 800;
    color: #fff;
  }

  .balance-types-modal__card-description {
    margin: 10px 0 0;
    font-size: 13px;
    line-height: 1.45;
    color: #e1e4f2b8;
  }

  .balance-types-modal__how-to {
    margin-top: 12px;
  }

  .balance-types-modal__how-to-title {
    font-size: 11px;
    font-weight: 900;
    letter-spacing: .6px;
    color: #6c63fff2;
    margin-bottom: 8px;
  }

  .balance-types-modal__list {
    margin: 0;
    padding-left: 18px;
    display: grid;
    gap: 6px;
  }

  .balance-types-modal__list li {
    font-size: 12.5px;
    color: #e1e4f2b8;
  }

  .balance-types-modal__notice-box {
    margin-top: 14px;
    padding: 14px 16px;
    border-radius: 6px;
    background: #1c1f2e;
    border: 0 solid rgba(37, 40, 57, .9);
    box-shadow: inset 0 0 24px #6c63ff0f;
  }

  .balance-types-modal__notice-title {
    font-size: 11px;
    font-weight: 900;
    letter-spacing: .6px;
    color: #6c63fff2;
    margin-bottom: 8px;
  }

  .balance-types-modal__notice-text {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: #e1e4f2b8;
  }

  .balance-types-modal__notice-divider {
    margin: 12px 0;
    height: 1px;
    background: #ffffff0f;
  }

  .balance-types-modal__button-container {
    display: flex;
    margin-top: 16px;
  }

  .balance-types-modal__button {
    width: 100%;
    min-height: 42px;
    background: var(--accent-gradient);
    border: 1px solid rgba(94, 85, 217, .4);
    color: #fff;
    font-weight: var(--font-weight-btn);
    border-radius: var(--radius-sm);
    padding: 14px 16px;
    font-size: 15px;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(108, 99, 255, .2);
    transition: transform var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), opacity var(--dur-fast) var(--ease-out);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }

  .balance-types-modal__button:hover {
    background: linear-gradient(135deg, #6c63ff, #5147d9);
    opacity: .95;
  }

  .balance-types-modal__button:active {
    transform: scale(var(--press-scale));
  }

  .balance-types-modal__button:disabled {
    opacity: .6;
    cursor: not-allowed;
    transform: none;
    filter: none;
  }

  .balance-types-modal__button-icon {
    margin-left: 6px;
  }

  .balance-types-modal__surface--closing {
    animation: balance-types-modal-shrink-out .2s forwards;
  }

  @media (max-width: 768px) {
    .balance-types-modal__surface {
      width: 100%;
      height: 100%;
      max-width: 100%;
      max-height: 100%;
      margin: 0;
      padding: 16px;
      border-radius: 0;
      display: flex;
      flex-direction: column;
    }

    .balance-types-modal__header-wrap {
      padding: 6px 34px 8px;
    }

    .balance-types-modal__card-row {
      grid-template-columns: 1fr;
    }

    .balance-types-modal__button-container {
      background: #131520;
      padding: 14px;
      margin: 0;
      border-top: 1px solid #181a28;
      position: sticky;
      bottom: 0;
    }
  }

  @keyframes balance-types-modal-fade-in {
    0% { opacity: 0; }
    100% { opacity: 1; }
  }

  @keyframes balance-types-modal-open {
    0% { transform: scale(.95) translateY(15px); opacity: 0; }
    100% { transform: scale(1) translateY(0); opacity: 1; }
  }

  @keyframes balance-types-modal-shrink-out {
    0% { transform: scale(1); }
    100% { transform: scale(.85); opacity: 0; }
  }
`
