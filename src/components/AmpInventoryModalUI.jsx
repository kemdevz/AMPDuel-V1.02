import { useEffect, useId, useRef, useState } from 'react'

export const AMP_MODAL_STYLES = `
  @keyframes ampModalOverlayIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes ampModalIn { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes ampModalSpin { to { transform: rotate(360deg); } }

  .amp-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
    box-sizing: border-box;
    background: rgba(4, 5, 8, .76);
    -webkit-backdrop-filter: blur(9px);
    backdrop-filter: blur(9px);
    animation: ampModalOverlayIn .18s ease-out both;
  }

  .amp-modal-dialog {
    position: relative;
    display: flex;
    width: calc(100vw - 24px);
    max-width: 896px;
    max-height: min(760px, calc(100dvh - 24px));
    min-height: 0;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, .08);
    border-radius: 12px;
    color: #f4f5f8;
    background: #191c24;
    box-shadow: 0 26px 80px rgba(0, 0, 0, .55);
    font-family: Poppins, sans-serif;
    animation: ampModalIn .22s cubic-bezier(.22, 1, .36, 1) both;
  }

  .amp-modal-dialog * { box-sizing: border-box; }
  .amp-modal-header {
    flex: 0 0 auto;
    margin: 0;
    padding: 16px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, .06);
    color: #f4f5f8;
    background: #151820;
    font-size: 17px;
    font-weight: 700;
    line-height: 24px;
  }

  .amp-modal-close {
    position: absolute;
    top: 12px;
    right: 14px;
    z-index: 4;
    display: inline-flex;
    width: 30px;
    height: 30px;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: 6px;
    color: #8e94a2;
    background: #222631;
    cursor: pointer;
    transition: color .15s ease, background .15s ease;
  }
  .amp-modal-close:hover { color: #b3b8c3; background: #282c37; }
  .amp-modal-close:focus-visible { outline: 2px solid rgba(255, 79, 163, .4); outline-offset: 0; }
  .amp-modal-close svg { width: 14px; height: 14px; }

  .amp-modal-body {
    min-height: 0;
    padding: 20px;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: #353945 transparent;
  }
  .amp-modal-body::-webkit-scrollbar { width: 6px; }
  .amp-modal-body::-webkit-scrollbar-thumb { border-radius: 999px; background: #353945; }
  .amp-modal-stack { display: flex; min-height: 0; flex-direction: column; gap: 16px; }

  .amp-wallet-top,
  .amp-create-top { display: flex; justify-content: space-between; gap: 12px; }
  .amp-wallet-top { align-items: center; }
  .amp-create-top { align-items: center; flex-wrap: wrap; }
  .amp-wallet-search-actions { display: flex; min-width: 0; align-items: center; gap: 8px; }
  .amp-create-summary { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .amp-modal-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .amp-inventory-action {
    display: inline-flex;
    min-width: 40px;
    height: 40px;
    align-items: center;
    justify-content: center;
    padding: 0 16px;
    border: 0;
    border-radius: 7px;
    color: #a8aeb9;
    background: #20242e;
    font: 600 12px/14.4px Poppins, sans-serif;
    white-space: nowrap;
    cursor: pointer;
    transition: color .2s ease, background-color .2s ease, opacity .2s ease;
  }
  .amp-inventory-action:hover { color: #c1c6d0; background: #282c37; }
  .amp-inventory-action:disabled { cursor: not-allowed; opacity: .45; }
  .amp-deposit-action { gap: 7px; }
  .amp-deposit-action svg { width: 11px; height: 11px; flex: 0 0 11px; }

  .amp-value-pill {
    display: flex;
    min-height: 42px;
    align-items: center;
    gap: 8px;
    padding: 0 16px;
    border: 1px solid rgba(255, 255, 255, .06);
    border-radius: 8px;
    background: #14171e;
  }
  .amp-value-label { color: #8f95a3; font-size: 13px; font-weight: 600; line-height: 20px; white-space: nowrap; }
  .amp-value-icon { width: 13px; height: 13px; flex: 0 0 13px; color: #ff4fa3; }
  .amp-value-pill.is-valid .amp-value-icon { color: #22c55e; }
  .amp-value-number { color: #f5f6f8; font-size: 16px; font-weight: 700; line-height: 20px; white-space: nowrap; }
  .amp-count-badge { padding: 8px 12px; border-radius: 7px; color: #a6acb8; background: #20242d; font-size: 10px; font-weight: 700; line-height: 14px; white-space: nowrap; }
  .amp-join-required { display: inline-flex; align-items: center; gap: 6px; color: #858c99; font-size: 12px; font-weight: 600; line-height: 18px; white-space: nowrap; }
  .amp-join-required svg { width: 11px; height: 11px; flex: 0 0 11px; }
  .amp-join-max-items { color: #fff; font-size: 10px; font-weight: 400; line-height: 14px; white-space: nowrap; }

  .amp-search { position: relative; width: 260px; height: 42px; flex: 0 0 260px; }
  .amp-search > svg { position: absolute; top: 50%; left: 16px; width: 13px; height: 13px; color: #747b89; transform: translateY(-50%); pointer-events: none; }
  .amp-search input {
    width: 100%;
    height: 42px;
    padding: 0 36px 0 40px;
    outline: 0;
    border: 1px solid rgba(255, 255, 255, .07);
    border-radius: 8px;
    color: #eceef2;
    background: #14171e;
    box-shadow: none;
    font: 500 13px/20px Poppins, sans-serif;
    transition: border-color .15s ease;
  }
  .amp-search input::placeholder { color: #747b89; opacity: 1; }
  .amp-search input:hover { border-color: rgba(255, 255, 255, .13); }
  .amp-search input:focus { border-color: rgba(255, 255, 255, .18); }
  .amp-search-clear { position: absolute; top: 7px; right: 7px; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px; color: #858c99; background: transparent; cursor: pointer; }
  .amp-search-clear:hover { color: #eceef2; background: rgba(255, 255, 255, .06); }

  .amp-sort { position: relative; display: inline-flex; height: 42px; flex: 0 0 auto; }
  .amp-sort-trigger {
    display: inline-flex;
    min-width: 132px;
    height: 42px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 16px;
    border: 1px solid rgba(255, 255, 255, .07);
    border-radius: 8px;
    outline: 0;
    color: #d9dce3;
    background: #20242e;
    box-shadow: none;
    font: 600 13px/20px Poppins, sans-serif;
    cursor: pointer;
  }
  .amp-sort-trigger:hover, .amp-sort-trigger[aria-expanded="true"] { border-color: rgba(255,255,255,.07); background: #272c37; }
  .amp-sort-trigger:focus-visible { box-shadow: none; }
  .amp-sort-trigger svg { width: 11px; height: 11px; flex: 0 0 11px; }
  .amp-sort-menu-positioner { position: absolute; top: 50px; right: 0; left: auto; z-index: 30; min-width: max-content; margin: 0; visibility: visible; transform-origin: top right; }
  .amp-sort-menu {
    display: flex;
    min-width: 160px;
    flex-direction: column;
    gap: 0;
    padding: 6px;
    border: 1px solid rgba(255,255,255,.08);
    border-radius: 8px;
    outline: 0;
    color: #d9dce3;
    background: #20242e;
    box-shadow: 0 16px 40px rgba(0,0,0,.4);
    transform-origin: top right;
    animation: ampSortMenuIn .12s ease-out both;
  }
  @keyframes ampSortMenuIn { from { opacity: 0; transform: scale(.8); } to { opacity: 1; transform: none; } }
  .amp-sort-menu-item { display: flex; width: 100%; height: 36px; align-items: center; padding: 0 12px; border: 0; border-radius: 6px; outline: 0; color: #d9dce3; background: transparent; font: 500 13px/20px Poppins, sans-serif; text-align: left; cursor: pointer; }
  .amp-sort-menu-item:hover, .amp-sort-menu-item:focus { background: #292e39; }

  .amp-action {
    display: inline-flex;
    height: 42px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 16px;
    border: 0;
    border-radius: 8px;
    color: #111319;
    background: #ff4fa3;
    font: 700 13px/20px Poppins, sans-serif;
    white-space: nowrap;
    cursor: pointer;
  }
  .amp-action:hover { background: #ff69b0; }
  .amp-action:active { background: #f33f94; }
  .amp-action:disabled { cursor: not-allowed; opacity: .5; }
  .amp-action svg { width: 11px; height: 11px; }
  .amp-action-green { color: #071a12; background: #35e8a0; }
  .amp-action-green:hover, .amp-action-green:active { background: #35e8a0; }
  .amp-action-muted { color: #c4c8d0; background: #252932; }
  .amp-action-muted:hover { background: #292e39; }

  .amp-inventory-loading,
  .amp-inventory-empty { display: flex; min-height: 300px; align-items: center; justify-content: center; }
  .amp-inventory-loading { flex-direction: column; gap: 12px; }
  .amp-spinner { width: 32px; height: 32px; border: 3px solid rgba(255, 255, 255, .1); border-top-color: #ff4fa3; border-radius: 50%; animation: ampModalSpin .7s linear infinite; }
  .amp-loading-copy { margin: 0; color: #858c99; font-size: 13px; }
  .amp-inventory-empty { border: 1px solid rgba(255, 255, 255, .06); border-radius: 10px; background: #14171e; }
  .amp-empty-inner { display: flex; align-items: center; flex-direction: column; gap: 16px; }
  .amp-empty-copy { margin: 0; color: #858c99; font-size: 14px; font-weight: 400; line-height: 20px; text-align: center; }

  .amp-inventory-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
  .amp-item-card { position: relative; display: block; min-width: 0; padding: 12px; overflow: hidden; border: 1px solid rgba(255, 255, 255, .065); border-radius: 10px; color: inherit; background: #14171e; text-align: left; transition: background .15s ease, border-color .15s ease; }
  button.amp-item-card { width: 100%; cursor: pointer; font-family: Poppins, sans-serif; }
  .amp-item-card:hover { background: #171a22; }
  .amp-item-card.is-selected { border-color: #ff4fa3; background: rgba(255, 79, 163, .09); }
  .amp-item-card.is-selected:hover { background: rgba(255, 79, 163, .13); }
  .amp-item-check { position: absolute; top: 8px; right: 8px; z-index: 1; display: flex; width: 22px; height: 22px; align-items: center; justify-content: center; border-radius: 50%; color: #111319; background: #ff4fa3; }
  .amp-item-check svg { width: 10px; height: 10px; }
  .amp-item-image-wrap { display: flex; height: 116px; margin-bottom: 12px; align-items: center; justify-content: center; overflow: hidden; border-radius: 8px; background: #101218; }
  .amp-item-image { width: 104px; height: 104px; object-fit: contain; user-select: none; pointer-events: none; }
  .amp-item-name { margin: 0; overflow: hidden; color: #eceef2; font-size: 13px; font-weight: 600; line-height: 20px; text-overflow: ellipsis; white-space: nowrap; }
  .amp-item-value { display: flex; margin-top: 8px; align-items: center; gap: 6px; color: #ff69b0; }
  .amp-item-value svg { width: 12px; height: 12px; }
  .amp-item-value span { font-size: 12px; font-weight: 700; line-height: 18px; }

  .amp-sticky-footer { position: sticky; bottom: -20px; z-index: 5; margin: 0 -20px -20px; padding: 16px 20px; border-top: 1px solid rgba(255, 255, 255, .07); background: #191c24; }
  .amp-footer-row { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
  .amp-create-footer-coins { margin-right: auto; }
  .amp-create-footer-actions { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
  .amp-footer-selection-action { height: 44px; padding: 0 18px; font-size: 14px; font-weight: 700; line-height: 20px; }
  .amp-join-summary-hidden { display: none; }
  .amp-join-footer-row { justify-content: space-between; }
  .amp-join-range { display: inline-flex; min-width: 0; align-items: center; gap: 8px; color: #c7cce2; font-size: 14px; font-weight: 700; line-height: 20px; white-space: nowrap; }
  .amp-join-range svg { width: 14px; height: 14px; flex: 0 0 14px; color: #fff; }
  .amp-join-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 12px; }
  .amp-side-options { display: flex; align-items: center; gap: 4px; }
  .amp-side-button { display: inline-flex; width: 46px; min-width: 46px; height: 46px; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 50%; background: transparent; opacity: .38; cursor: pointer; transition: opacity .15s ease; }
  .amp-side-button:hover { background: transparent; opacity: .62; }
  .amp-side-button.is-active { opacity: 1; }
  .amp-side-button.is-active:hover { opacity: 1; }
  .amp-side-button:focus-visible { outline: 2px solid rgba(255, 255, 255, .25); outline-offset: 0; }
  .amp-side-button img { width: 42px; height: 42px; object-fit: contain; }
  .amp-create-button { width: 145px; min-width: 145px; height: 44px; padding: 0 18px; border: 0; border-radius: 8px; color: #111319; background: #ff4fa3; font: 700 14px/20px Poppins, sans-serif; cursor: pointer; }
  .amp-create-button:hover { background: #ff69b0; }
  .amp-create-button:active { background: #f33f94; }
  .amp-create-button:disabled { cursor: not-allowed; opacity: .5; }
  .amp-join-coin { width: 42px; height: 42px; object-fit: contain; }

  .amp-custom-footer { display: flex; width: 100%; align-items: center; justify-content: flex-end; gap: 12px; }
  .amp-custom-footer > button {
    display: inline-flex;
    height: 44px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 20px;
    border-radius: 8px;
    font: 700 14px/20px Poppins, sans-serif;
    cursor: pointer;
  }
  .amp-custom-footer > button:first-of-type { border: 1px solid #ff4fa3; color: #ff4fa3; background: rgba(255, 79, 163, .08); }
  .amp-custom-footer > button:first-of-type:hover { background: rgba(255, 79, 163, .14); }
  .amp-custom-footer > button:last-of-type { min-width: 190px; border: 0; color: #111319; background: #ff4fa3; }
  .amp-custom-footer > button:last-of-type:hover { background: #ff69b0; }
  .amp-custom-footer > .amp-footer-selection-action {
    min-width: 40px;
    height: 44px;
    margin-right: 0;
    padding: 0 18px;
    border: 0;
    border-radius: 7px;
    color: #a8aeb9;
    background: #20242e;
  }
  .amp-custom-footer > .amp-footer-selection-action:hover { color: #c1c6d0; background: #282c37; }
  .amp-custom-footer > button:disabled { cursor: not-allowed; opacity: .5; }
  .amp-custom-footer ._pcvalue_cpcgp_471,
  .amp-custom-footer ._mobilevalue_cpcgp_472,
  .amp-custom-footer ._walletCoinValue_cpcgp_local { display: inline-flex; align-items: center; justify-content: center; }
  .amp-custom-footer ._mobilevalue_cpcgp_472 { display: none; }
  .amp-custom-footer ._walletWithdrawSep_cpcgp_local { width: 1px; height: 16px; margin: 0 8px; background: rgba(17, 19, 25, .35); }
  .amp-custom-footer ._walletCoinValue_cpcgp_local { gap: 5px; }
  .amp-custom-footer ._walletCoinValue_cpcgp_local img { width: 15px; height: 15px; object-fit: contain; }

  @media (max-width: 767px) {
    .amp-modal-header { padding-right: 52px; }
    .amp-modal-body { padding: 12px; }
    .amp-wallet-top { align-items: stretch; flex-direction: column; }
    .amp-wallet-search-actions { width: 100%; }
    .amp-wallet-search-actions .amp-search { min-width: 0; flex: 1 1 auto; }
    .amp-modal-controls { width: 100%; }
    .amp-search { width: 100%; flex: 1 1 100%; }
    .amp-create-top .amp-modal-controls { width: 100%; }
    .amp-sort { flex: 1 1 auto; }
    .amp-sort select { width: 100%; }
    .amp-value-pill { width: 100%; justify-content: center; flex-wrap: wrap; }
    .amp-inventory-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .amp-sticky-footer { bottom: -12px; margin: 0 -12px -12px; padding: 12px 12px calc(12px + env(safe-area-inset-bottom)); }
  }

  @media (min-width: 768px) and (max-width: 1023px) {
    .amp-inventory-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  }

  @media (max-width: 479px) {
    .amp-modal-dialog { max-height: calc(100dvh - env(safe-area-inset-top)); }
    .amp-create-summary { width: 100%; }
    .amp-count-badge { margin: 0 auto; }
    .amp-footer-row { gap: 8px; }
    .amp-join-footer-row { align-items: flex-start; flex-direction: column; }
    .amp-join-actions { width: 100%; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
    .amp-create-footer-actions { gap: 8px; }
    .amp-footer-selection-action { padding: 0 12px; }
    .amp-side-button { width: 42px; min-width: 42px; height: 42px; }
    .amp-side-button img { width: 38px; height: 38px; }
    .amp-create-button { width: 108px; min-width: 108px; flex: 0 0 108px; }
    .amp-item-card { padding: 10px; }
    .amp-item-image-wrap { height: 104px; }
    .amp-item-image { width: 94px; height: 94px; }
    .amp-custom-footer { gap: 8px; }
    .amp-custom-footer > button { padding: 0 14px; }
    .amp-custom-footer > .amp-footer-selection-action { padding: 0 12px; }
    .amp-custom-footer > button:last-of-type { min-width: 150px; flex: 1 1 150px; }
  }
`

export function RobuxIcon({ className = '' }) {
  return <svg className={className} role="img" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.926 23.998 0 18.892 5.075.002 24 5.108ZM15.348 10.09l-5.282-1.453-1.414 5.273 5.282 1.453z" /></svg>
}

function SearchIcon() {
  return <svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M505 442.7 405.3 343c-4.5-4.5-10.6-7-17-7H372c27.6-35.3 44-79.7 44-128C416 93.1 322.9 0 208 0S0 93.1 0 208s93.1 208 208 208c48.3 0 92.7-16.4 128-44v16.3c0 6.4 2.5 12.5 7 17l99.7 99.7c9.4 9.4 24.6 9.4 33.9 0l28.3-28.3c9.4-9.4 9.4-24.6.1-34zM208 336c-70.7 0-128-57.2-128-128 0-70.7 57.2-128 128-128 70.7 0 128 57.2 128 128 0 70.7-57.2 128-128 128z" /></svg>
}

export function PlusIcon() {
  return <svg viewBox="0 0 448 512" fill="currentColor" aria-hidden="true"><path d="M416 208H272V64c0-17.67-14.33-32-32-32h-32c-17.67 0-32 14.33-32 32v144H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h144v144c0 17.67 14.33 32 32 32h32c17.67 0 32-14.33 32-32V304h144c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z" /></svg>
}

export function CloseIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M.439 21.44a1.5 1.5 0 0 0 2.122 2.121l9.262-9.262a.25.25 0 0 1 .354 0l9.262 9.263a1.5 1.5 0 1 0 2.122-2.121l-9.262-9.263a.25.25 0 0 1 0-.354l9.263-9.262A1.5 1.5 0 0 0 21.439.44l-9.262 9.262a.25.25 0 0 1-.354 0L2.561.44A1.5 1.5 0 0 0 .439 2.561l9.262 9.262a.25.25 0 0 1 0 .354z" /></svg>
}

function ChevronIcon() {
  return <svg viewBox="0 0 448 512" fill="currentColor" aria-hidden="true"><path d="M207.029 381.476 12.686 187.132c-9.373-9.373-9.373-24.569 0-33.941l22.667-22.667c9.357-9.357 24.522-9.375 33.901-.04L224 284.505l154.745-154.021c9.379-9.335 24.544-9.317 33.901.04l22.667 22.667c9.373 9.373 9.373 24.569 0 33.941L240.971 381.476c-9.373 9.372-24.569 9.372-33.942 0z" /></svg>
}

function CheckIcon() {
  return <svg viewBox="0 0 448 512" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.2 0z" /></svg>
}

export function AmpSearch({ value, onChange }) {
  return <div className="amp-search"><SearchIcon /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Search items..." aria-label="Search inventory items" />{value ? <button type="button" className="amp-search-clear" aria-label="Clear search" onClick={() => onChange('')}>×</button> : null}</div>
}

export function AmpSort({ ascending, onChange }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return undefined
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const choose = (nextAscending) => {
    onChange(nextAscending)
    setOpen(false)
  }

  return <div className="amp-sort" ref={rootRef}><button type="button" className="amp-sort-trigger" aria-label="Sort inventory" aria-haspopup="menu" aria-controls={menuId} aria-expanded={open} onClick={() => setOpen((current) => !current)}><span>{ascending ? 'Low to high' : 'High to low'}</span><ChevronIcon /></button>{open ? <div className="amp-sort-menu-positioner" data-popper-placement="bottom-end"><div id={menuId} className="amp-sort-menu" role="menu" aria-orientation="vertical"><button type="button" className="amp-sort-menu-item" role="menuitem" tabIndex={0} onClick={() => choose(false)}>High to low</button><button type="button" className="amp-sort-menu-item" role="menuitem" tabIndex={-1} onClick={() => choose(true)}>Low to high</button></div></div> : null}</div>
}

export function AmpValuePill({ label, value, valid = false }) {
  return <div className={`amp-value-pill${valid ? ' is-valid' : ''}`}><span className="amp-value-label">{label}</span><RobuxIcon className="amp-value-icon" /><span className="amp-value-number">{Number(value || 0).toLocaleString()}</span></div>
}

export function AmpItemCard({ item, selected = false, selectable = false, onClick, footer = null }) {
  const Tag = selectable ? 'button' : 'div'
  const image = item?.image_url || item?.imageUrl || item?.image || ''
  const value = Number(item?.value ?? item?.amount ?? 0)
  return <Tag type={selectable ? 'button' : undefined} className={`amp-item-card${selected ? ' is-selected' : ''}`} onClick={selectable ? onClick : undefined} aria-pressed={selectable ? selected : undefined}>{selected ? <span className="amp-item-check"><CheckIcon /></span> : null}<span className="amp-item-image-wrap">{image ? <img className="amp-item-image" src={image} alt={item?.name || ''} draggable="false" /> : null}</span><p className="amp-item-name" title={item?.name || ''}>{item?.name || 'Item'}</p><span className="amp-item-value"><RobuxIcon /><span>{value.toLocaleString()}</span></span>{footer ? <span className="amp-item-footer">{footer}</span> : null}</Tag>
}

export function prioritizeSelectedItems(items, selectedItems) {
  const selectedKeys = selectedItems instanceof Set ? selectedItems : new Set(selectedItems || [])
  if (selectedKeys.size === 0) return items

  const selected = []
  const unselected = []
  for (const item of items) {
    (selectedKeys.has(item.displayKey) ? selected : unselected).push(item)
  }
  return [...selected, ...unselected]
}
