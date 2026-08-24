import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { TermsIcon } from './icons'

const terms = [
  { text: 'You must be 18+, legally eligible to use BloxDice, and comply with local laws.' },
  { text: 'Secure your account and all activity performed on it.' },
  { text: 'BloxDice is entertainment, not real-money gambling.' },
  { text: 'Coins and items have no real-world cash value.' },
  { text: 'No exploits, automation, abusive alts, or reward farming.' },
  { text: 'Check trades carefully; completed transactions are generally final.' },
  { text: 'BloxDice is independent from Roblox and its services.' },
  { text: 'Games, balances, features, and these Terms may change.' },
  { text: 'BloxDice is not liable for indirect losses where lawful.' },
  { text: 'Do not harass users or share private or personal information.' },
  { text: 'Do not impersonate users, staff, bots, or official accounts.' },
  {
    content: (
      <>
        Rule-breaking accounts may be restricted. Contact our{' '}
        <a href="https://discord.gg/bloxdicecom" target="_blank" rel="noopener noreferrer">Discord Server</a> support.
      </>
    ),
  },
]

export default function TermsModal({ isOpen, onClose }) {
  const dialogRef = useRef(null)
  const closeTimerRef = useRef(null)
  const closingRef = useRef(false)
  const onCloseRef = useRef(onClose)
  const [closing, setClosing] = useState(false)
  onCloseRef.current = onClose

  const requestClose = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
    closeTimerRef.current = window.setTimeout(() => onCloseRef.current?.(), 200)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    closingRef.current = false
    setClosing(false)
  }, [isOpen])

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
  }, [])

  useEffect(() => {
    if (!isOpen) return undefined
    const previouslyFocused = document.activeElement
    const focusTimer = window.setTimeout(() => dialogRef.current?.focus(), 0)
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        requestClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = dialogRef.current?.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [isOpen, requestClose])

  if (!isOpen) return null

  return (
    <div className={`termsOverlay ${closing ? 'closing' : ''}`} onMouseDown={(event) => event.target === event.currentTarget && requestClose()}>
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-modal-title"
        aria-describedby="terms-modal-summary"
        tabIndex={-1}
        className={`termsModal ${closing ? 'closing' : ''}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="termsHeader">
          <TermsIcon className="termsIcon" />
          <div className="termsHeading">
            <h1 id="terms-modal-title">Terms of Service</h1>
          </div>
          <button type="button" className="termsClose" aria-label="Close Terms of Service" onClick={requestClose}>
            <X size={18} strokeWidth={2.2} />
          </button>
        </header>

        <div className="termsScroll">
          <div className="termsWelcome">
            <p id="terms-modal-summary"><strong>Welcome to BloxDice.</strong> Using this platform confirms that you accept these Terms.</p>
          </div>
          <div className="termsList">
            {terms.map((term, index) => (
              <article key={index}>
                <span>{index + 1}.</span>
                <p>{term.content || term.text}</p>
              </article>
            ))}
          </div>
        </div>

        <footer className="termsFooter">
          <p>By using BloxDice, you confirm that you have read, understood, and accept these Terms.</p>
          <button type="button" onClick={requestClose}>I understand</button>
        </footer>

        <style>{`
          .termsOverlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.55);animation:termsFadeIn .18s ease-out}
          .termsOverlay.closing{animation:termsFadeOut .2s ease-in forwards}
          .termsModal{position:relative;width:74%;max-width:480px;height:480px;display:flex;flex-direction:column;overflow:hidden;padding:16px;border:1px solid #181a28;border-radius:6px;background:#171925;color:#e1e4f2;font-family:Poppins,sans-serif;box-shadow:0 20px 80px rgba(0,0,0,.55);outline:none;animation:termsModalOpen .22s forwards}
          .termsModal.closing{animation:termsModalClose .2s forwards}
          .termsHeader{display:flex;align-items:center;gap:9px;flex-shrink:0;padding:1px 2px 13px;border-bottom:1px solid rgba(255,255,255,.06)}
          .termsIcon{width:19px;height:19px;flex:0 0 19px;color:#8f96c8}
          .termsHeading{min-width:0;flex:1}.termsHeading h1{margin:0;color:#fff;font-size:21px;font-weight:650;line-height:1.3}
          .termsClose{display:grid;width:30px;height:30px;place-items:center;padding:0;border:0;border-radius:5px;background:transparent;color:#7d839f;cursor:pointer;transition:color .14s ease,background .14s ease}.termsClose:hover{color:#fff;background:rgba(255,255,255,.05)}
          .termsScroll{min-height:0;display:flex;flex:1;flex-direction:column;overflow:hidden;padding:9px 2px 7px}
          .termsWelcome{margin-bottom:7px;padding:0 3px}
          .termsWelcome p{display:block;box-sizing:border-box;width:100%;margin:0;padding-right:2px;color:#9299bc;font-size:clamp(9px,2.15vw,11px);font-weight:500;line-height:1.35;letter-spacing:-.02em;white-space:nowrap}.termsWelcome strong{color:#fff;font-weight:700}
          .termsList{display:grid;min-height:0;flex:1;grid-template-rows:repeat(12,minmax(0,1fr));gap:1px}.termsList article{display:grid;grid-template-columns:17px minmax(0,1fr);align-items:center;gap:2px;padding:0 3px}.termsList article>span{color:#e4e7f4;font-size:10.6px;font-weight:700;line-height:1.3;text-align:left}.termsList p{margin:0;color:#8f96b5;font-size:clamp(9px,2.1vw,10.6px);font-weight:500;line-height:1.3;letter-spacing:-.015em;white-space:nowrap}.termsList a{color:#a7adcf;font-weight:650;text-decoration:underline;text-decoration-color:rgba(167,173,207,.45);text-underline-offset:2px}.termsList a:hover{color:#fff}
          .termsFooter{display:flex;flex-shrink:0;align-items:center;justify-content:space-between;gap:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.06)}
          .termsFooter p{max-width:275px;margin:0;color:#737b9b;font-size:10.5px;font-weight:500;line-height:1.35}
          .termsFooter button{height:36px;padding:0 16px;border:1px solid rgba(255,79,163,.4);border-radius:8px;background:linear-gradient(180deg,#ff69b0 0%,#ff4fa3 45%,#f43f8f 100%);color:#fff;font:600 11px Poppins,sans-serif;cursor:pointer;box-shadow:0 2px 8px rgba(255,79,163,.2);transition:filter .14s ease,transform .14s ease}.termsFooter button:hover{filter:brightness(1.08)}.termsFooter button:active{transform:scale(.98)}
          @keyframes termsFadeIn{from{opacity:0}to{opacity:1}}@keyframes termsFadeOut{from{opacity:1}to{opacity:0}}@keyframes termsModalOpen{from{opacity:0;transform:scale(.94) translateY(12px)}to{opacity:1;transform:scale(1) translateY(0)}}@keyframes termsModalClose{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(.94)}}
          @media(max-width:640px){.termsModal{width:100%;height:min(480px,calc(100dvh - 32px));padding:12px}.termsHeading h1{font-size:19px}.termsScroll{padding-top:8px}.termsList{gap:0}.termsList article{grid-template-columns:17px minmax(0,1fr);gap:2px}.termsList article>span,.termsList p{font-size:9.5px}.termsFooter p{font-size:10px}}
        `}</style>
      </section>
    </div>
  )
}
