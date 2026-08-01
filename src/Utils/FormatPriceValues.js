const COMPACT_UNITS = [
  { suffix: 'T', amount: 1_000_000_000_000 },
  { suffix: 'B', amount: 1_000_000_000 },
  { suffix: 'M', amount: 1_000_000 },
  { suffix: 'K', amount: 1_000 },
]

export function formatPriceValue(value, { compactNumbers = true } = {}) {
  const text = String(value ?? '').trim()
  const compactInput = text.match(/^(-?\d+(?:\.\d+)?)\s*([KMBT])$/i)

  if (compactInput) {
    return `${Number(compactInput[1]).toFixed(1)}${compactInput[2].toUpperCase()}`
  }

  const numericValue = Number(text.replaceAll(',', ''))
  if (!Number.isFinite(numericValue)) return text || '0'

  if (compactNumbers) {
    const unit = COMPACT_UNITS.find(({ amount }) => Math.abs(numericValue) >= amount)
    if (unit) return `${(numericValue / unit.amount).toFixed(1)}${unit.suffix}`
  }

  return numericValue.toLocaleString('en-US')
}