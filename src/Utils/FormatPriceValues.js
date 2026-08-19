const COMPACT_UNITS = [
  { suffix: 'T', amount: 1_000_000_000_000 },
  { suffix: 'B', amount: 1_000_000_000 },
  { suffix: 'M', amount: 1_000_000 },
  { suffix: 'K', amount: 1_000 },
]

const COMPACT_MULTIPLIERS = Object.fromEntries(
  COMPACT_UNITS.map(({ suffix, amount }) => [suffix, amount]),
)

export function parsePriceValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0

  const text = String(value ?? '').trim()
  const compactInput = text.match(/^(-?\d+(?:\.\d+)?)\s*([KMBT])$/i)
  if (compactInput) {
    return Number(compactInput[1]) * COMPACT_MULTIPLIERS[compactInput[2].toUpperCase()]
  }

  const numericValue = Number(text.replaceAll(',', ''))
  return Number.isFinite(numericValue) ? numericValue : 0
}

export function formatPriceValue(
  value,
  { compactNumbers = true, maximumFractionDigits = 1 } = {},
) {
  const text = String(value ?? '').trim()
  const compactInput = text.match(/^(-?\d+(?:\.\d+)?)\s*([KMBT])$/i)
  const numericValue = compactInput ? parsePriceValue(text) : Number(text.replaceAll(',', ''))

  if (!Number.isFinite(numericValue)) return text || '0'

  if (compactNumbers) {
    const unit = COMPACT_UNITS.find(({ amount }) => Math.abs(numericValue) >= amount)
    if (unit) {
      const digits = Math.max(0, Math.min(6, Number(maximumFractionDigits) || 0))
      const compactValue = (numericValue / unit.amount)
        .toFixed(digits)
        .replace(/\.0+$|(\.\d*[1-9])0+$/, '$1')
      return `${compactValue}${unit.suffix}`
    }
  }

  return numericValue.toLocaleString('en-US')
}
