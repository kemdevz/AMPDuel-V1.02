import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

const terms = [
  { title: 'Eligibility', text: 'You must be 18+, legally eligible to use BloxDice, and comply with local laws.' },
  { title: 'Account Responsibility', text: 'Secure your account and all activity performed on it.' },
  { title: 'Entertainment Only', text: 'BloxDice is entertainment, not real-money gambling.' },
  { title: 'Virtual Items and Coins', text: 'Coins and items have no real-world cash value.' },
  { title: 'Fair Use', text: 'No exploits, automation, abusive alts, or reward farming.' },
  { title: 'Transactions', text: 'Check trades carefully; completed transactions are generally final.' },
  { title: 'No Affiliation', text: 'BloxDice is independent from Roblox and its services.' },
  { title: 'Platform Changes', text: 'Games, balances, features, and these Terms may change.' },
  { title: 'Limitation of Liability', text: 'BloxDice is not liable for indirect losses where lawful.' },
  { title: 'Community Conduct', text: 'Do not harass users or share private or personal information.' },
  { title: 'Impersonation', text: 'Do not impersonate users, staff, bots, or official accounts.' },
  {
    title: 'Enforcement and Support',
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
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
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
      document.body.style.overflow = previousOverflow
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
          <h1 id="terms-modal-title">Terms of Service</h1>
          <button type="button" className="termsClose" aria-label="Close Terms of Service" onClick={requestClose}>
            <X size={16} strokeWidth={2.4} />
          </button>
        </header>

        <div className="termsBody">
          <div className="termsIntroRow">
            <p id="terms-modal-summary">Welcome to BloxDice.</p>
          </div>
          <div className="termsIntroduction">
            <p>Using this platform confirms that you accept these Terms. By using BloxDice, you confirm that you have read, understood, and accept these Terms.</p>
          </div>
          <div className="termsList">
            {terms.map((term, index) => (
              <article key={index}>
                <h2>{index + 1}. {term.title}</h2>
                <div className="termsRule"><p>{term.content || term.text}</p></div>
              </article>
            ))}
          </div>
        </div>

        <style>{`
          .termsOverlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(3,5,9,.72);backdrop-filter:blur(5px);animation:termsFadeIn .18s ease-out}
          .termsOverlay.closing{animation:termsFadeOut .2s ease-in forwards}
          .termsModal{position:relative;width:min(700px,100%);max-height:min(760px,calc(100dvh - 48px));display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,.075);border-radius:8px;background:#292A42;color:#f4f5f8;font-family:Poppins,sans-serif;box-shadow:none;outline:none;animation:termsModalOpen .22s cubic-bezier(.22,1,.36,1) forwards}
          .termsModal.closing{animation:termsModalClose .2s forwards}
          .termsHeader{position:relative;display:flex;min-height:58px;flex:0 0 58px;align-items:center;padding:0 24px;border-bottom:1px solid rgba(255,255,255,.065);background:#292A42}
          .termsHeader h1{margin:0;color:#f4f5f8;font-size:20px;font-weight:700;line-height:1.2;letter-spacing:-.01em}
          .termsClose{position:absolute;top:13px;right:15px;display:grid;width:32px;height:32px;place-items:center;padding:0;border:0;border-radius:6px;background:transparent;color:rgba(244,245,248,.58);cursor:pointer;transition:color .15s ease,background-color .15s ease}.termsClose:hover{color:#f4f5f8;background:rgba(255,255,255,.055)}.termsClose:focus-visible{outline:2px solid rgba(128,74,255,.75);outline-offset:1px}
          .termsBody{min-height:0;flex:1;overflow-y:auto;padding:21px 24px 26px;scrollbar-width:thin;scrollbar-color:#804AFF #3C3C59}
          .termsBody::-webkit-scrollbar{width:7px}.termsBody::-webkit-scrollbar-track{background:#3C3C59}.termsBody::-webkit-scrollbar-thumb{border-radius:999px;background:#804AFF}
          .termsIntroRow{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}
          .termsIntroRow p{margin:0;color:rgba(244,245,248,.58);font-size:13px;font-weight:500;line-height:1.5}
          .termsIntroduction{margin-bottom:24px;padding:15px 16px;border:1px solid rgba(255,255,255,.055);border-radius:6px;background:#25263B}
          .termsIntroduction p{margin:0;color:rgba(244,245,248,.58);font-size:12px;font-weight:500;line-height:1.65}
          .termsList{display:flex;flex-direction:column;gap:21px}.termsList article{display:flex;flex-direction:column;gap:8px}.termsList h2{margin:0;color:#f4f5f8;font-size:14px;font-weight:700;line-height:1.35}.termsRule{display:flex;flex-direction:column;gap:7px}.termsList p{margin:0;color:rgba(244,245,248,.56);font-size:12px;font-weight:500;line-height:1.7}.termsList a{color:#DDD2F1;font-weight:600;text-decoration:none}.termsList a:hover{text-decoration:underline;text-underline-offset:2px}
          @keyframes termsFadeIn{from{opacity:0}to{opacity:1}}@keyframes termsFadeOut{from{opacity:1}to{opacity:0}}@keyframes termsModalOpen{from{opacity:0;transform:scale(.94) translateY(12px)}to{opacity:1;transform:scale(1) translateY(0)}}@keyframes termsModalClose{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(.94)}}
          @media(max-width:640px){.termsOverlay{padding:10px}.termsModal{max-height:calc(100dvh - 20px)}.termsHeader{min-height:54px;flex-basis:54px;padding:0 18px}.termsHeader h1{font-size:18px}.termsClose{top:11px;right:11px}.termsBody{padding:17px 18px 22px}.termsIntroRow{align-items:flex-start;flex-direction:column;gap:9px;margin-bottom:15px}.termsIntroduction{margin-bottom:20px}.termsList{gap:18px}}
        `}</style>
      </section>
    </div>
  )
}
