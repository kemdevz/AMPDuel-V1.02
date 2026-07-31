import { useEffect, useRef, useState } from 'react'

export default function AnimatedNumber({ value, formatter, className = '', duration = 400 }) {
  const [displayValue, setDisplayValue] = useState(Number(value ?? 0))
  const frameRef = useRef(null)
  const startValueRef = useRef(Number(value ?? 0))
  const endValueRef = useRef(Number(value ?? 0))

  useEffect(() => {
    const startValue = displayValue
    const endValue = Number(value ?? 0)

    if (!Number.isFinite(endValue)) {
      setDisplayValue(0)
      return undefined
    }

    if (startValue === endValue) {
      setDisplayValue(endValue)
      return undefined
    }

    startValueRef.current = startValue
    endValueRef.current = endValue

    const startTime = performance.now()

    const tick = (now) => {
      const elapsed = Math.min(1, (now - startTime) / duration)
      const eased = 1 - Math.pow(1 - elapsed, 3)
      const nextValue = startValueRef.current + (endValueRef.current - startValueRef.current) * eased
      setDisplayValue(Math.round(nextValue))

      if (elapsed < 1) {
        frameRef.current = requestAnimationFrame(tick)
      }
    }

    frameRef.current = requestAnimationFrame(tick)

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current)
      }
    }
  }, [value, duration])

  const resolvedFormatter = formatter || ((number) => number.toLocaleString())

  return <span className={className}>{resolvedFormatter(displayValue)}</span>
}
