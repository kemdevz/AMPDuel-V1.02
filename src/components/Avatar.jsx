import { useEffect, useState } from 'react'

function hash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return h
}

export default function Avatar({ name = '?', size = 36, ring = false, paletteIndex = null, className = '', src = null }) {
  const [imgError, setImgError] = useState(false)
  const h = hash(name)
  // const palette = palettes[paletteIndex ?? h % palettes.length]
  const px = `${size}px`

  useEffect(() => {
    // reset error state when src changes
    setImgError(false)
  }, [src])

  const hasValidSrc = Boolean(src && String(src).trim()) && !imgError

  const backgroundClass = hasValidSrc ? 'bg-transparent' : `bg-gradient-to-br ${palette}`
  const ringClass = ring ? 'ring-2 ring-brand-400/70 ring-offset-2 ring-offset-ink-850' : 'ring-1 ring-white/10'

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full ${backgroundClass} ${ringClass} ${className}`}
      style={{ width: px, height: px }}
    >
      {hasValidSrc ? (
        <img
          src={src}
          alt={name}
          className="absolute inset-0 h-full w-full object-cover bg-transparent"
          decoding="async"
          referrerPolicy="no-referrer"
          crossOrigin="anonymous"
          draggable={false}
          onError={() => setImgError(true)}
          onLoad={(e) => {
            try {
              const t = e?.target
              if (t && t.naturalWidth === 0) setImgError(true)
            } catch (err) {
              // ignore
            }
          }}
        />
      ) : (
        <>
          {/* simple blocky face so each avatar reads as a little character */}
          <svg viewBox="0 0 36 36" className="absolute inset-0 h-full w-full">
            <rect x="11" y="14" width="4" height="4" rx="1" fill="#1b1b1b" />
            <rect x="21" y="14" width="4" height="4" rx="1" fill="#1b1b1b" />
            <path d="M13 23c1.6 1.6 8.4 1.6 10 0" stroke="#1b1b1b" strokeWidth="2" strokeLinecap="round" fill="none" />
          </svg>
        </>
      )}
      <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-t from-black/25 to-white/10" />
    </div>
  )
}
