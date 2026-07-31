import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

const SHOW_IN_CHAT_MIN_VALUE = 10000
const TIP_ICON_PATH =
  'M17.726 13.02 14 16H9v-1h4.065a.5.5 0 0 0 .416-.777l-.888-1.332A1.995 1.995 0 0 0 10.93 12H3a1 1 0 0 0-1 1v6a2 2 0 0 0 2 2h9.639a3 3 0 0 0 2.258-1.024L22 13l-1.452-.484a2.998 2.998 0 0 0-2.822.504zm1.532-5.63c.451-.465.73-1.108.73-1.818s-.279-1.353-.73-1.818A2.447 2.447 0 0 0 17.494 3S16.25 2.997 15 4.286C13.75 2.997 12.506 3 12.506 3a2.45 2.45 0 0 0-1.764.753c-.451.466-.73 1.108-.73 1.818s.279 1.354.73 1.818L15 12l4.258-4.61z'

export default function CoinTipModal({
  isOpen,
  recipient,
  amount,
  showInChat = false,
  isSubmitting = false,
  onAmountChange,
  onShowInChatChange,
  onClose,
  onSubmit,
}) {
  const inputRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!isOpen) return undefined

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isSubmitting) onCloseRef.current?.()
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0)

    return () => {
      window.clearTimeout(focusTimer)
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, isSubmitting])

  const numericAmount = Number(amount || 0)
  const canShowInChat = Number.isFinite(numericAmount) && numericAmount >= SHOW_IN_CHAT_MIN_VALUE

  useEffect(() => {
    if (showInChat && !canShowInChat) onShowInChatChange?.(false)
  }, [canShowInChat, onShowInChatChange, showInChat])

  if (!isOpen || !recipient || typeof document === 'undefined') return null

  const username = recipient.username || recipient.name || 'user'
  const formattedAmount = amount ? numericAmount.toLocaleString('en-US') : ''

  return createPortal(
    <div
      className="tipUserBackdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onClose?.()
      }}
    >
      <style>{`
        @keyframes tipUserFadeIn {
          0% { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes tipUserModalOpen {
          0% { opacity: 0; transform: scale(.8); }
          to { opacity: 1; transform: scale(1); }
        }

        .tipUserBackdrop {
          position: fixed;
          inset: 0;
          z-index: 999;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: rgba(0, 0, 0, .55);
          animation: tipUserFadeIn .5s ease-out;
        }

        .tipUserModal,
        .tipUserModal * {
          box-sizing: border-box;
          font-family: Poppins, sans-serif;
        }

        .tipUserModal {
          position: relative;
          display: flex;
          width: 90%;
          max-width: 380px;
          margin: 20px;
          padding: 28px 24px 24px;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid #1e2235;
          border-radius: 12px;
          background-color: #171925;
          color: #e1e4f2;
          scrollbar-width: none;
          animation: tipUserModalOpen .3s forwards;
        }

        .tipUserModal::-webkit-scrollbar {
          display: none;
        }

        .tipUserClose {
          position: absolute;
          top: 14px;
          right: 16px;
          z-index: 1;
          padding: 0;
          border: none;
          background: none;
          color: rgba(255, 255, 255, .5);
          font-size: 22px;
          font-weight: 400;
          line-height: 1;
          cursor: pointer;
          transition: color .2s ease;
        }

        .tipUserClose:hover:not(:disabled) {
          color: rgba(255, 255, 255, .9);
        }

        .tipUserClose:focus-visible {
          outline: 2px solid #8079ff;
          outline-offset: 2px;
        }

        .tipUserIconHeader {
          position: relative;
          z-index: 0;
          display: flex;
          margin-bottom: 24px;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }

        .tipUserIconBg {
          display: flex;
          width: 60px;
          height: 60px;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: rgba(108, 99, 255, .12);
        }

        .tipUserIcon {
          display: block;
          width: 28px;
          height: 28px;
          color: #6c63ff;
        }

        .tipUserTitle {
          margin: 0;
          color: #fff;
          font-size: 17.6px;
          font-weight: 700;
          line-height: normal;
          letter-spacing: .2px;
        }

        .tipUserSubtitle {
          margin: 0;
          color: rgba(255, 255, 255, .4);
          font-size: 12px;
          font-weight: 500;
          line-height: normal;
          letter-spacing: .2px;
          text-align: center;
        }

        .tipUserRecipient {
          color: rgba(255, 255, 255, .75);
          font-weight: 600;
        }

        .tipUserSection {
          position: relative;
          z-index: 0;
          margin-bottom: 14px;
        }

        .tipUserSectionTitle {
          display: block;
          margin-bottom: 6px;
          color: rgba(255, 255, 255, .45);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .7px;
          text-transform: uppercase;
        }

        .tipUserInputHolder {
          display: flex;
          height: 40px;
          padding: 0 14px;
          align-items: center;
          border: none;
          border-radius: 6px;
          background: #1c1f2e;
          transition: background .15s;
        }

        .tipUserInput {
          width: 100%;
          padding: 0;
          border: none;
          outline: none;
          background: transparent;
          color: #fff;
          font-size: 13px;
          font-weight: 500;
          appearance: textfield;
        }

        .tipUserInput::placeholder {
          color: #6b7280;
          opacity: 1;
        }

        .tipUserInput::-webkit-outer-spin-button,
        .tipUserInput::-webkit-inner-spin-button {
          margin: 0;
          -webkit-appearance: none;
        }

        .tipUserCheckboxRow {
          display: flex;
          align-items: center;
          padding: 10px 14px;
          border: none;
          border-radius: 6px;
          background: #1c1f2e;
        }

        .tipUserCheckboxLabel {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          user-select: none;
        }

        .tipUserCheckboxInput {
          position: absolute;
          opacity: 0;
          pointer-events: none;
        }

        .tipUserCheckboxBox {
          position: relative;
          width: 18px;
          height: 18px;
          flex-shrink: 0;
          border: 1px solid #252839;
          border-radius: 5px;
          background: #131520;
          transition: background .15s, border-color .15s;
        }

        .tipUserCheckboxInput:checked + .tipUserCheckboxBox {
          border-color: rgba(108, 99, 255, .5);
          background: linear-gradient(135deg, #6c63ff, #574fd6);
        }

        .tipUserCheckboxInput:checked + .tipUserCheckboxBox::after {
          display: block;
          width: 9px;
          height: 5px;
          border-bottom: 2px solid #fff;
          border-left: 2px solid #fff;
          content: "";
          transform: translate(3px, 5px) rotate(-45deg);
        }

        .tipUserCheckboxInput:focus-visible + .tipUserCheckboxBox {
          outline: 2px solid #8079ff;
          outline-offset: 2px;
        }

        .tipUserCheckboxText {
          color: #e1e4f2;
          font-size: 13px;
          font-weight: 600;
        }

        .tipUserButtonContainer {
          position: relative;
          z-index: 0;
          margin-top: 8px;
        }

        .tipUserButton {
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
          font-size: 14.4px;
          font-weight: 600;
          letter-spacing: .01em;
          cursor: pointer;
          transform-origin: center;
          transition: transform .13s cubic-bezier(.22, 1, .36, 1), filter .14s ease;
        }

        .tipUserButton:hover:not(:disabled) {
          filter: brightness(1.07);
        }

        .tipUserButton:active:not(:disabled) {
          transform: scale(.98);
        }

        .tipUserButton:focus-visible {
          outline: 2px solid #8079ff;
          outline-offset: 2px;
        }

        .tipUserButton:disabled,
        .tipUserClose:disabled {
          opacity: .6;
          cursor: not-allowed;
        }

        @media (max-width: 640px) {
          .tipUserModal {
            width: 92%;
            max-width: 380px;
            max-height: calc(100dvh - 32px);
            margin: 16px;
            padding: 24px 20px 20px;
          }

          .tipUserInput {
            font-size: 15.2px;
          }
        }
      `}</style>

      <div
        className="tipUserModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tip-user-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="tipUserClose"
          aria-label="Close"
          disabled={isSubmitting}
          onClick={onClose}
        >
          &times;
        </button>

        <div className="tipUserIconHeader">
          <div className="tipUserIconBg">
            <svg
              className="tipUserIcon"
              fill="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path d={TIP_ICON_PATH} />
            </svg>
          </div>
          <h2 id="tip-user-title" className="tipUserTitle">
            Tip Coins
          </h2>
          <p className="tipUserSubtitle">
            Tip to <span className="tipUserRecipient">{username}</span>
          </p>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit?.()
          }}
        >
          <div className="tipUserSection">
            <label className="tipUserSectionTitle" htmlFor="tip-user-amount">
              Amount
            </label>
            <div className="tipUserInputHolder">
              <input
                ref={inputRef}
                id="tip-user-amount"
                className="tipUserInput"
                type="text"
                inputMode="numeric"
                placeholder="Enter amount"
                autoComplete="off"
                disabled={isSubmitting}
                value={formattedAmount}
                onChange={(event) => onAmountChange?.(event.target.value.replace(/\D/g, ''))}
              />
            </div>
          </div>

          {canShowInChat ? (
            <div className="tipUserSection">
              <div className="tipUserCheckboxRow">
                <label className="tipUserCheckboxLabel">
                  <input
                    type="checkbox"
                    className="tipUserCheckboxInput"
                    checked={showInChat}
                    disabled={isSubmitting}
                    onChange={(event) => onShowInChatChange?.(event.target.checked)}
                  />
                  <span className="tipUserCheckboxBox" aria-hidden="true" />
                  <span className="tipUserCheckboxText">Show in chat</span>
                </label>
              </div>
            </div>
          ) : null}

          <div className="tipUserButtonContainer">
            <button type="submit" className="tipUserButton" disabled={isSubmitting}>
              Send Tip
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
