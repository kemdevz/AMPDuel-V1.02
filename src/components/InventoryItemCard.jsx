const COIN_ICON = '/bobux.png'

const formatNumber = (value) => {
  const numericValue = Number(value ?? 0)
  return Number.isFinite(numericValue) ? numericValue.toLocaleString() : '0'
}

export function getInventoryItemAccent(item) {
  const value = Number(item?.value ?? 0)

  if (Number.isFinite(value) && value >= 10_000_000) return '255, 223, 0'    // Gold - 10m to 200m
  if (Number.isFinite(value) && value >= 1_000_000) return '255, 99, 71'     // Red - 1m to 10m
  if (Number.isFinite(value) && value >= 100_000) return '255, 105, 180'     // Pink - 100k to 1m
  return '54, 123, 255'                                                      // Blue - under 100k
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

export const inventoryItemCardStyles = `
  ._inventoryItemCard_cpcgp_local {
    position: relative;
    box-sizing: border-box;
    height: auto; /* Changed from fixed height */
    min-height: 34px; /* Keep minimum height */
    flex: 0 0 auto; /* Changed from fixed flex-basis */
    justify-content: flex-start;
    padding: 7px;
    overflow: visible; /* Changed from hidden */
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: transform .2s ease, box-shadow .2s ease, background .2s ease;
  }

  ._inventoryItemCard_cpcgp_local::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 0;
    padding: 2px;
    border-radius: 6px;
    background: linear-gradient(to bottom, transparent 0%, var(--inventory-border-side, rgba(108,99,255,.25)) 55%, var(--inventory-border-bottom, rgba(108,99,255,.7)) 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask-composite: exclude;
    pointer-events: none;
  }

  ._inventoryItemCard_cpcgp_local_selected {
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.15), 0 10px 25px rgba(0, 0, 0, 0.18);
    transform: scale(1.01);
  }

  ._inventoryItemCard_cpcgp_local:hover {
    transform: scale(1.03);
  }

  ._inventoryItemCard_cpcgp_local_readonly {
    cursor: default;
  }

  ._inventoryItemCard_cpcgp_local_readonly:hover {
    transform: none;
  }

  ._inventoryItemCard_cpcgp_local_compact {
    height: 144px;
    min-width: 138px;
    flex: 0 0 138px;
  }

  ._inventoryItemCard_cpcgp_local_compact ._inventoryImageWrap_cpcgp_local {
    height: 92px;
    flex: 0 0 92px;
  }

  ._inventorySelectIndicator_cpcgp_local {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 12px;
    height: 12px;
    border-radius: 3px;
    background: var(--inventory-indicator-color, rgba(54, 123, 255, 1));
    transform-origin: center;
    transition: opacity .25s ease, transform .25s ease, background .25s ease;
    z-index: 3;
    pointer-events: none;
  }

  ._inventoryItemCard_cpcgp_local:hover ._inventorySelectIndicator_cpcgp_local {
    transform: scale(1.08);
  }

  ._inventoryBlurImage_cpcgp_local {
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: 0;
    width: 80%;
    height: 80%;
    opacity: .35;
    filter: blur(18px);
    object-fit: contain;
    pointer-events: none;
    transform: translate(-50%,-60%);
  }

  ._inventoryImageWrap_cpcgp_local {
    position: relative;
    width: 100%;
    height: 112px;
    overflow: hidden;
    border-radius: 8px;
    flex: 0 0 112px;
  }

  ._inventoryImage_cpcgp_local {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 1;
    width: 100%;
    height: 100%;
    object-fit: contain;
    border-radius: 8px;
  }

  ._inventoryDetails_cpcgp_local {
    position: relative;
    z-index: 2;
    width: 100%;
    height: 34px;
    min-height: 34px;
    flex: 0 0 34px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    text-align: center;
    margin-top: 4px;
    overflow: hidden;
  }

  ._inventoryName_cpcgp_local {
    display: block;
    width: 100%;
    max-width: 100%;
    margin: 0;
    color: #ccd9fa;
    font-size: 11px;
    font-weight: 600;
    line-height: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  ._inventoryPrice_cpcgp_local {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    max-width: 100%;
    margin: 0;
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    line-height: 14px;
    overflow: hidden;
    white-space: nowrap;
  }

  ._inventoryPriceInner_cpcgp_local {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
    vertical-align: middle;
  }

  ._inventoryPriceInner_cpcgp_local img {
    width: 13px;
    height: 13px;
    margin-right: 5px;
    flex-shrink: 0;
  }

  ._inventoryPriceAmount_cpcgp_local {
    display: inline-block;
    min-width: 0;
    overflow: hidden;
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    line-height: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`

export default function InventoryItemCard({ item, selected, onToggleSelect, compact = false }) {
  const interactive = typeof onToggleSelect === 'function'
  return (
    <div
      className={`_inventoryItemCard_cpcgp_local${selected ? ' _inventoryItemCard_cpcgp_local_selected' : ''}${compact ? ' _inventoryItemCard_cpcgp_local_compact' : ''}${interactive ? '' : ' _inventoryItemCard_cpcgp_local_readonly'}`}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? selected : undefined}
      onClick={onToggleSelect}
      onKeyDown={(event) => {
        if (interactive && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          onToggleSelect()
        }
      }}
      style={getInventoryItemCardStyle(item, selected)}
    >
      <span className="_inventorySelectIndicator_cpcgp_local" style={{ opacity: selected ? 1 : 0, transform: selected ? 'scale(1)' : 'scale(0.7)' }} />
      <img src={item.image_url || COIN_ICON} alt="" className="_inventoryBlurImage_cpcgp_local" draggable={false} />
      <div className="_inventoryImageWrap_cpcgp_local">
        <img src={item.image_url || COIN_ICON} alt={item.name} className="_inventoryImage_cpcgp_local" draggable={false} />
      </div>
      <div className="_inventoryDetails_cpcgp_local">
        <p className="_inventoryName_cpcgp_local">{item.name}</p>
        <p className="_inventoryPrice_cpcgp_local">
          <span className="_inventoryPriceInner_cpcgp_local">
            <img src={COIN_ICON} alt="Bobux" />
            <span className="_inventoryPriceAmount_cpcgp_local">{formatNumber(item.value || 0)}</span>
          </span>
        </p>
      </div>
    </div>
  )
}
