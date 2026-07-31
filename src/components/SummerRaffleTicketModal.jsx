import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const TICKET_ICON = 'https://i.ibb.co/vxyJzkJ2/ticket.png'

export default function SummerRaffleTicketModal({ isOpen, onClose }) {
  const [closing, setClosing] = useState(false)
  const closeTimerRef = useRef(null)
  const closingRef = useRef(false)

  const requestClose = () => {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
    closeTimerRef.current = window.setTimeout(() => {
      closingRef.current = false
      setClosing(false)
      onClose?.()
    }, 180)
  }

  useEffect(() => {
    if (!isOpen) {
      closingRef.current = false
      setClosing(false)
      return undefined
    }

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') requestClose()
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    }
  }, [isOpen])

  if (!isOpen || typeof document === 'undefined') return null

  return createPortal(
    <div
      className={`_blurbg_2yu7t_7 _fadeIn_2yu7t_1 ${closing ? 'summerRaffleBackdropClosing' : ''}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose()
      }}
    >
      <div
        className="_modal_2yu7t_35 _fadeIn_2yu7t_1"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="_closeBtn_2yu7t_79"
          onClick={requestClose}
        >
          &times;
        </button>
        <div className="_header_2yu7t_105">
          <div className="_iconWrap_2yu7t_117">
            <img src={TICKET_ICON} alt="" className="_headerIcon_2yu7t_127" draggable={false} />
          </div>
          <div className="_headerText_2yu7t_135">
            <span className="_title_2yu7t_141">Your Raffle Tickets</span>
            <span className="_subtitle_2yu7t_147">You don't have any tickets yet</span>
          </div>
        </div>
        <div className="_divider_2yu7t_159" />
        <div className="_empty_2yu7t_265">
          <img src={TICKET_ICON} alt="" className="_emptyImg_2yu7t_281" draggable={false} />
          <p className="_emptyTitle_2yu7t_293">No tickets yet</p>
          <p className="_emptyText_2yu7t_305">
            Open Event Cases with your pearls, every pearl you spend adds one raffle ticket here.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
