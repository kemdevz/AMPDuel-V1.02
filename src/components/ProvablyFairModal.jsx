import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { COINFLIP_FAIR_UI_STYLES } from './CoinflipFairnessModal'

const CLOSE_MS = 180

function CloseIcon() {
  return <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path fill="currentColor" d="M.439,21.44a1.5,1.5,0,0,0,2.122,2.121L11.823,14.3a.25.25,0,0,1,.354,0l9.262,9.263a1.5,1.5,0,1,0,2.122-2.121L14.3,12.177a.25.25,0,0,1,0-.354l9.263-9.262A1.5,1.5,0,0,0,21.439.44L12.177,9.7a.25.25,0,0,1-.354,0L2.561.44A1.5,1.5,0,0,0,.439,2.561L9.7,11.823a.25.25,0,0,1,0,.354Z" /></svg>
}

const fairnessSteps = [
  {
    number: '01',
    title: 'Committed before play',
    text: 'A SHA-256 hash of the secret server seed is published before the game resolves. This locks the server into one seed without revealing it early.',
  },
  {
    number: '02',
    title: 'Combined with public data',
    text: 'The committed seed is combined with the client seed, game ID, and game-specific data to produce a deterministic result.',
  },
  {
    number: '03',
    title: 'Revealed after completion',
    text: 'After the game ends, the original server seed is revealed. Hash it again and compare it with the earlier commitment to verify it was unchanged.',
  },
]

export default function ProvablyFairModal({ isOpen, onClose = () => {} }) {
  const [closing, setClosing] = useState(false)
  const closeTimerRef = useRef(null)
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const requestClose = useCallback(() => {
    if (closeTimerRef.current !== null) return
    setClosing(true)
    closeTimerRef.current = window.setTimeout(() => onCloseRef.current(), CLOSE_MS)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    setClosing(false)
    closeTimerRef.current = null
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return undefined
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement
    document.body.style.overflow = 'hidden'
    const focusTimer = window.setTimeout(() => dialogRef.current?.focus(), 0)
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        requestClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus?.()
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
    }
  }, [isOpen, requestClose])

  if (!isOpen || typeof document === 'undefined') return null

  return createPortal(
    <div className={`coinflip-fair-ui__overlay${closing ? ' is-closing' : ''}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose() }}>
      <section ref={dialogRef} className={`coinflip-fair-ui__modal provably-fair-info${closing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="site-provably-fair-title" tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}>
        <header id="site-provably-fair-title">Provably Fair</header>
        <button type="button" className="coinflip-fair-ui__close" aria-label="Close" onClick={requestClose}><CloseIcon /></button>
        <div className="coinflip-fair-ui__body provably-fair-info__body">
          <div className="coinflip-fair-ui__fields">
            {fairnessSteps.map((step) => <article className="coinflip-fair-ui__field provably-fair-info__step" key={step.number}><span>{step.number}</span><div><p>{step.title}</p><small>{step.text}</small></div></article>)}
          </div>
          <div className="provably-fair-info__games">
            <article><strong>Coinflip</strong><p>The seed inputs deterministically select heads or tails.</p></article>
            <article><strong>Mines</strong><p>The same commitment process fixes the board and first turn before play.</p></article>
          </div>
          <p className="provably-fair-info__hint">To verify a result, open any completed Coinflip or Mines game and select <b>Fairness</b> to view its game ID and seeds.</p>
        </div>
      </section>
      <style>{COINFLIP_FAIR_UI_STYLES}</style>
      <style>{PROVABLY_FAIR_INFO_STYLES}</style>
    </div>,
    document.body,
  )
}

const PROVABLY_FAIR_INFO_STYLES = `
  .provably-fair-info { max-width: 620px; max-height: calc(100dvh - 32px); overflow: hidden; }
  .provably-fair-info__body { overflow-y: auto; scrollbar-width: thin; scrollbar-color: #ff4fa3 #20242e; }
  .provably-fair-info__body::-webkit-scrollbar { width: 6px; }
  .provably-fair-info__body::-webkit-scrollbar-track { background: #20242e; }
  .provably-fair-info__body::-webkit-scrollbar-thumb { border-radius: 999px; background: #ff4fa3; }
  .provably-fair-info__step { display: grid; min-height: 0; grid-template-columns: 34px minmax(0,1fr); align-items: start; gap: 11px; }
  .provably-fair-info__step > span { display: grid; width: 30px; height: 30px; place-items: center; border-radius: 6px; color: #ff69b0; background: #20242e; font: 700 10px/1 Poppins,sans-serif; }
  .provably-fair-info__step p { margin: 0 0 4px; color: #e8eaf0; font-size: 12px; font-weight: 700; line-height: 18px; }
  .provably-fair-info__step small { display: block; color: #858c99; font: 500 11px/17px Poppins,sans-serif; }
  .provably-fair-info__games { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; margin-top: 12px; }
  .provably-fair-info__games article { padding: 13px 14px; border: 1px solid rgba(255,255,255,.06); border-radius: 8px; background: #12151c; }
  .provably-fair-info__games strong { color: #e8eaf0; font-size: 12px; font-weight: 700; }
  .provably-fair-info__games p { margin: 5px 0 0; color: #858c99; font-size: 10px; font-weight: 500; line-height: 16px; }
  .provably-fair-info__hint { margin: 13px 1px 0; color: #777e8d; font-size: 10px; font-weight: 500; line-height: 16px; }
  .provably-fair-info__hint b { color: #a8aeb9; font-weight: 700; }
  @media (max-width: 520px) { .provably-fair-info__games { grid-template-columns: 1fr; } }
`
