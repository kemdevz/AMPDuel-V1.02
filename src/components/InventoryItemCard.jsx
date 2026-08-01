const COIN_ICON = '/bobux.png'

const formatNumber = (value) => {
  const numericValue = Number(value ?? 0)
  return Number.isFinite(numericValue) ? numericValue.toLocaleString() : '0'
}

export function getInventoryItemAccent(item) {
  const value = Number(item?.value ?? 0)

  if (Number.isFinite(value) && value >= 10_000_000) return '255, 223, 0'
  if (Number.isFinite(value) && value >= 750_000) return '255, 105, 180'
  return '54, 123, 255'
}

export function getInventoryItemCardStyle(item) {
  const accentColor = getInventoryItemAccent(item)

  return {
    background: `linear-gradient(to top, rgba(${accentColor}, 0.18) 0%, rgba(${accentColor}, 0) 100%), rgb(39, 45, 70)`,
    '--inventory-border-bottom': `rgba(${accentColor}, 0.7)`,
    '--inventory-border-side': `rgba(${accentColor}, 0.25)`,
    '--inventory-dot-color': `rgba(${accentColor}, 1)`,
    '--inventory-indicator-color': `rgba(${accentColor}, 1)`,
    '--item-border-bottom': `rgba(${accentColor}, 0.7)`,
    '--item-border-side': `rgba(${accentColor}, 0.25)`,
    '--item-dot-color': `rgba(${accentColor}, 1)`,
  }
}

export const inventoryItemCardStyles = `
  ._inventoryItemCard_cpcgp_local {
    position: relative;
    box-sizing: border-box;
    height: 170px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    padding: 8px;
    overflow: hidden;
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

  ._inventoryItemCard_cpcgp_local_compact {
    height: 150px;
    min-width: 140px;
    flex: 0 0 140px;
  }

  ._inventoryItemCard_cpcgp_local_compact ._inventoryImageWrap_cpcgp_local {
    height: 96px;
    flex: 0 0 96px;
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
    height: 118px;
    overflow: hidden;
    border-radius: 8px;
    flex: 0 0 118px;
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
    height: 32px;
    min-height: 32px;
    flex: 0 0 32px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
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
    font-size: 12px;
    font-weight: 600;
    line-height: 14px;
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
    font-size: 13px;
    font-weight: 600;
    line-height: 15px;
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
    width: 15px;
    height: 15px;
    margin-right: 6px;
    flex-shrink: 0;
  }

  ._inventoryPriceAmount_cpcgp_local {
    display: inline-block;
    min-width: 0;
    overflow: hidden;
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    line-height: 15px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`

export default function InventoryItemCard({ item, selected, onToggleSelect, compact = false }) {
  return (
    <div
      className={`_inventoryItemCard_cpcgp_local${selected ? ' _inventoryItemCard_cpcgp_local_selected' : ''}${compact ? ' _inventoryItemCard_cpcgp_local_compact' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onToggleSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onToggleSelect()
        }
      }}
      style={getInventoryItemCardStyle(item)}
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
