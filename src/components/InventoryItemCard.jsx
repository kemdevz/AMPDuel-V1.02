function getInventoryItemAccent(item) {
  const value = Number(item?.value ?? 0)

  if (Number.isFinite(value) && value >= 10_000_000) return '255, 223, 0'
  if (Number.isFinite(value) && value >= 1_000_000) return '255, 99, 71'
  if (Number.isFinite(value) && value >= 100_000) return '255, 105, 180'
  return '54, 123, 255'
}

export function getInventoryItemCardStyle(item, selected = false) {
  const accentColor = getInventoryItemAccent(item)
  const backgroundOpacity = selected ? 0.35 : 0.18
  const borderBottomOpacity = selected ? 0.95 : 0.7
  const borderSideOpacity = selected ? 0.45 : 0.25

  return {
    background: `linear-gradient(to top, rgba(${accentColor}, ${backgroundOpacity}) 0%, rgba(${accentColor}, 0) 100%), rgb(39, 45, 70)`,
    '--inventory-border-bottom': `rgba(${accentColor}, ${borderBottomOpacity})`,
    '--inventory-border-side': `rgba(${accentColor}, ${borderSideOpacity})`,
    '--inventory-dot-color': `rgba(${accentColor}, 1)`,
    '--inventory-indicator-color': `rgba(${accentColor}, 1)`,
    '--item-border-bottom': `rgba(${accentColor}, 0.7)`,
    '--item-border-side': `rgba(${accentColor}, 0.25)`,
    '--item-dot-color': `rgba(${accentColor}, 1)`,
    '--stock-selected-glow': `rgba(${accentColor}, .17)`,
  }
}
