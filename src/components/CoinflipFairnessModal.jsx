import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const CLOSE_MS = 180

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <path fill="currentColor" d="M.439,21.44a1.5,1.5,0,0,0,2.122,2.121L11.823,14.3a.25.25,0,0,1,.354,0l9.262,9.263a1.5,1.5,0,1,0,2.122-2.121L14.3,12.177a.25.25,0,0,1,0-.354l9.263-9.262A1.5,1.5,0,0,0,21.439.44L12.177,9.7a.25.25,0,0,1-.354,0L2.561.44A1.5,1.5,0,0,0,.439,2.561L9.7,11.823a.25.25,0,0,1,0,.354Z" />
    </svg>
  )
}

function displayValue(value) {
  const text = String(value ?? '').trim()
  return text && text !== 'Unavailable' && text !== 'Not available' ? text : 'N/A'
}

export default function CoinflipFairnessModal({ gameLabel = 'Coinflip', coinflipId = 'N/A', hashedServerSeed = 'N/A', serverSeed = 'N/A', clientSeed = 'N/A', onClose = () => {} }) {
  const [closing, setClosing] = useState(false)
  const closeTimerRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const requestClose = useCallback(() => {
    if (closeTimerRef.current !== null) return
    setClosing(true)
    closeTimerRef.current = window.setTimeout(() => onCloseRef.current(), CLOSE_MS)
  }, [])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') requestClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
    }
  }, [requestClose])

  const fields = [
    [`${gameLabel} ID`, coinflipId],
    ['Hashed server seed', hashedServerSeed],
    ['Server seed', serverSeed],
    ['Client seed', clientSeed],
  ]

  return createPortal(
    <div className={`coinflip-fair-ui__overlay${closing ? ' is-closing' : ''}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose() }}>
      <section className={`coinflip-fair-ui__modal${closing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="coinflip-provably-fair-title" onMouseDown={(event) => event.stopPropagation()}>
        <header id="coinflip-provably-fair-title">Provably Fair</header>
        <button type="button" className="coinflip-fair-ui__close" aria-label="Close" onClick={requestClose}><CloseIcon /></button>
        <div className="coinflip-fair-ui__body">
          <div className="coinflip-fair-ui__fields">
            {fields.map(([label, value]) => (
              <div className="coinflip-fair-ui__field" key={label}>
                <p>{label}</p>
                <code title={displayValue(value)}>{displayValue(value)}</code>
              </div>
            ))}
          </div>
        </div>
      </section>
      <style>{COINFLIP_FAIR_UI_STYLES}</style>
    </div>,
    document.body,
  )
}

export const COINFLIP_FAIR_UI_STYLES = `
  .coinflip-fair-ui__overlay { position:fixed; inset:0; z-index:2147483200; display:flex; box-sizing:border-box; align-items:center; justify-content:center; overflow:auto; background:rgba(4,5,8,.78); -webkit-backdrop-filter:blur(9px); backdrop-filter:blur(9px); font-family:Poppins,sans-serif; animation:coinflip-fair-overlay-in 160ms ease-out both; }
  .coinflip-fair-ui__modal { position:relative; z-index:1; display:flex; width:calc(100% - 32px); max-width:576px; box-sizing:border-box; flex-direction:column; margin:16px; overflow:visible; border:1px solid rgba(255,255,255,.08); border-radius:12px; background:#2F3049; color:#f4f5f8; box-shadow:none; animation:coinflip-fair-modal-in 180ms cubic-bezier(.2,.8,.2,1) both; }
  .coinflip-fair-ui__modal > header { box-sizing:border-box; min-height:57.5px; margin:0; padding:16px 24px; color:#f4f5f8; font:600 17px/25.5px Poppins,sans-serif; }
  .coinflip-fair-ui__close { position:absolute; top:8px; right:12px; display:flex; width:32px; height:32px; align-items:center; justify-content:center; padding:0; border:0; border-radius:6px; outline:0; background:#3C3C59; color:#B7BBCB; cursor:pointer; transition:background-color .2s,color .2s,box-shadow .2s,transform .2s; }
  .coinflip-fair-ui__close:hover { background:#292e3a; color:#b3b8c3; }
  .coinflip-fair-ui__close:active { transform:scale(.96); }
  .coinflip-fair-ui__close:focus-visible { outline:2px solid #DDD2F1; outline-offset:0; }
  .coinflip-fair-ui__close svg { display:block; width:12px; height:12px; }
  .coinflip-fair-ui__body { box-sizing:border-box; padding:8px 24px 20px; }
  .coinflip-fair-ui__fields { display:flex; flex-direction:column; gap:12px; }
  .coinflip-fair-ui__field { box-sizing:border-box; min-height:70.5px; padding:14px; border:1px solid rgba(255,255,255,.06); border-radius:8px; background:#202134; }
  .coinflip-fair-ui__field p { margin:0 0 6px; color:#858c99; font:600 11px/16.5px Poppins,sans-serif; }
  .coinflip-fair-ui__field code { display:block; min-width:0; margin:0; overflow:hidden; color:#e8eaf0; font:400 12px/18px monospace; text-overflow:ellipsis; white-space:nowrap; }
  .coinflip-fair-ui__overlay.is-closing { pointer-events:none; animation:coinflip-fair-overlay-out ${CLOSE_MS}ms ease-in both; }
  .coinflip-fair-ui__modal.is-closing { animation:coinflip-fair-modal-out ${CLOSE_MS}ms ease-in both; }
  @keyframes coinflip-fair-overlay-in { from { opacity:0; } to { opacity:1; } }
  @keyframes coinflip-fair-overlay-out { from { opacity:1; } to { opacity:0; } }
  @keyframes coinflip-fair-modal-in { from { opacity:0; transform:scale(.96) translateY(8px); } to { opacity:1; transform:none; } }
  @keyframes coinflip-fair-modal-out { from { opacity:1; transform:none; } to { opacity:0; transform:scale(.96) translateY(8px); } }
  @media (max-width:620px) { .coinflip-fair-ui__modal { width:calc(100% - 24px); margin:12px; } .coinflip-fair-ui__modal > header { padding-inline:18px; } .coinflip-fair-ui__body { padding:8px 18px 18px; } .coinflip-fair-ui__field code { white-space:normal; overflow-wrap:anywhere; } }
  @media (prefers-reduced-motion:reduce) { .coinflip-fair-ui__overlay,.coinflip-fair-ui__modal,.coinflip-fair-ui__overlay.is-closing,.coinflip-fair-ui__modal.is-closing { animation-duration:1ms; } }
`
