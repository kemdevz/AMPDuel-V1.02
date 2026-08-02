import { useEffect, useRef, useState } from 'react'

function normalizeValue(value) {
  const numericValue = Number(value ?? 0)
  return Number.isFinite(numericValue) ? Math.max(0, Math.round(numericValue)) : 0
}

function formatCompact(value) {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(value % 1_000_000_000 === 0 ? 0 : 1)}B`
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}K`
  }
  return value.toLocaleString('en-US')
}

export default function AnimatedStatNumber({ value, compact = false, duration = 750, className }) {
  const target = normalizeValue(value)
  const [displayedValue, setDisplayedValue] = useState(0)
  const displayedValueRef = useRef(0)

  useEffect(() => {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion || duration <= 0) {
      displayedValueRef.current = target
      setDisplayedValue(target)
      return undefined
    }

    const startValue = displayedValueRef.current
    const difference = target - startValue
    if (difference === 0) return undefined

    let frameId = 0
    let startedAt = null
    const update = (timestamp) => {
      if (startedAt === null) startedAt = timestamp
      const progress = Math.min(1, (timestamp - startedAt) / duration)
      const easedProgress = 1 - ((1 - progress) ** 3)
      const nextValue = Math.round(startValue + difference * easedProgress)
      displayedValueRef.current = nextValue
      setDisplayedValue(nextValue)
      if (progress < 1) frameId = window.requestAnimationFrame(update)
    }

    frameId = window.requestAnimationFrame(update)
    return () => window.cancelAnimationFrame(frameId)
  }, [duration, target])

  return (
    <span className={className} aria-label={target.toLocaleString('en-US')}>
      {compact ? formatCompact(displayedValue) : displayedValue.toLocaleString('en-US')}
    </span>
  )
}
