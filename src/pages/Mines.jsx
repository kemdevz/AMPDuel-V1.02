import { useMemo, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { MinesIcon } from '../components/icons'

const GRID_SIZES = [5, 6, 7, 8]
const DEFAULT_BET = 5000
const SMALL_BOMB_IMAGE = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14"><path fill="#848ba8" d="m11.324 3.075-1.219 1.219.622.621a.562.562 0 0 1 0 .795l-.408.408A4.875 4.875 0 1 1 7.881 3.682l.408-.407a.562.562 0 0 1 .795 0l.621.621 1.219-1.219.4.398Zm1.395-.668h-.563a.281.281 0 0 0 0 .563h.563a.281.281 0 0 0 0-.563Zm-1.407-1.406a.281.281 0 0 0-.281.281v.563a.281.281 0 0 0 .563 0v-.563a.281.281 0 0 0-.282-.281Zm.795 1.289.398-.398a.282.282 0 0 0-.398-.399l-.398.399a.282.282 0 0 0 .398.398Zm-1.589 0a.282.282 0 0 0 .398-.398l-.398-.399a.282.282 0 0 0-.398.399l.398.398Zm1.589.797a.282.282 0 0 0-.398.398l.398.399a.282.282 0 0 0 .398-.399l-.398-.398ZM3.625 7.376a1.5 1.5 0 0 1 1.5-1.5.375.375 0 0 0 0-.75 2.253 2.253 0 0 0-2.25 2.25.375.375 0 0 0 .75 0Z"/></svg>')}`
const UNREVEALED_GEM_IMAGE = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="a" x1="12" y1="8" x2="50" y2="56" gradientUnits="userSpaceOnUse"><stop stop-color="#a9aec8"/><stop offset="1" stop-color="#5c627c"/></linearGradient><linearGradient id="b" x1="18" y1="13" x2="44" y2="51" gradientUnits="userSpaceOnUse"><stop stop-color="#d3d6e4"/><stop offset="1" stop-color="#777d96"/></linearGradient></defs><path d="M16 8h32l10 16-26 32L6 24 16 8Z" fill="url(#a)"/><path d="m16 8 8 16h16l8-16H16Z" fill="url(#b)" opacity=".75"/><path d="M6 24h18l8 32L6 24Zm52 0H40l-8 32 26-32Z" fill="#737991" opacity=".8"/><path d="M16 8 6 24h18L16 8Zm32 0 10 16H40L48 8Z" fill="#bec2d4" opacity=".66"/></svg>')}`

const MINES_STYLES = `
.mines-page {
  --surface-0: #131520;
  --mines-accent: #6c63ff;
  --mines-accent-light: #8079ff;
  --mines-accent-dark: #5a51e6;
  --mines-surface-0: #131520;
  --mines-surface-1: #1c1f2e;
  --mines-surface-2: #1f2335;
  --mines-control-bg: #1c1f2d;
  --mines-text: #c7cce2;
  --mines-muted: #6c7399;
  width: 100%;
  min-height: 100%;
  color: var(--mines-text);
}

.mines-page-wrap {
  width: 100%;
  max-width: 980px;
  margin: 0 auto;
  align-self: center;
  box-sizing: border-box;
  display: flex;
  min-height: calc(100vh - var(--header-height));
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.mines-panel {
  margin: 0;
  font-family: Poppins,sans-serif;
  background: var(--mines-surface-0);
  border-radius: 8px;
  width: 100%;
  max-width: 980px;
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.mines-middle {
  margin: 0;
  padding: 0;
  font-family: Poppins, sans-serif;
  display: flex;
  margin-top: 2px;
  border-radius: 8px;
  overflow: hidden;
  background: #151723;
}

.mines-controls {
  margin: 0;
  font-family: Poppins,sans-serif;
  flex: 0 0 310px;
  min-width: 0;
  padding: 18px 18px 14px;
  background: var(--surface-0);
  border-right: 1px solid rgba(255,255,255,.06);
  display: flex;
  flex-direction: column;
  gap: 0;
}

.mines-title-row {
  margin: 0;
  padding: 0;
  font-family: Poppins, sans-serif;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  width: 100%;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, .06);
  margin-bottom: 0;
}

.mines-title-text {
  color: #f0f1f8;
  font-size: 1.05rem;
  font-weight: 700;
}

.mines-title-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  fill: url("#minesIconGrad");
  filter: drop-shadow(0 0 7px rgba(108, 99, 255, .38));
}

.mines-gradient-defs {
  position: absolute;
}

.mines-volume-button {
  display: inline-grid;
  width: 34px;
  height: 34px;
  margin-left: auto;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #757d9e;
  cursor: pointer;
  transition: color .14s ease, background .14s ease;
}

.mines-volume-button:hover {
  background: rgba(255, 255, 255, .045);
  color: #fff;
}

.mines-volume-button svg {
  width: 21px;
  height: 21px;
}

.mines-control-fields {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  gap: 22px;
  padding: 28px 0 24px;
}

.mines-input-group {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.mines-input-group label,
.mines-label {
  color: #9198b9;
  font-size: .78rem;
  font-weight: 700;
}

.mines-bet-input-wrap,
.mines-count-wrap {
  display: flex;
  min-height: 48px;
  align-items: center;
  overflow: hidden;
  border: 1px solid #272b3e;
  border-radius: 7px;
  background: var(--mines-control-bg);
  transition: border-color .14s ease, box-shadow .14s ease;
}

.mines-bet-input-wrap:focus-within,
.mines-count-wrap:focus-within {
  border-color: rgba(108, 99, 255, .68);
  box-shadow: 0 0 0 3px rgba(108, 99, 255, .09);
}

.mines-coin-icon {
  width: 23px;
  height: 23px;
  margin-left: 14px;
  object-fit: contain;
}

.mines-bet-input-wrap > input,
.mines-count-input input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #e6e8f2;
  font-size: .83rem;
  font-weight: 600;
}

.mines-bet-input-wrap > input {
  padding: 0 12px;
}

.mines-bet-buttons {
  display: flex;
  align-self: stretch;
  gap: 5px;
  padding: 5px;
}

.mines-bet-buttons button,
.mines-grid-tabs button {
  border: 1px solid #313750;
  border-bottom-color: #191d2c;
  border-radius: 5px;
  background: linear-gradient(180deg, #353d5b 0%, #2a3048 45%, #212538 100%);
  box-shadow: inset 0 1px rgba(255, 255, 255, .055), 0 2px 0 #171a27;
  color: #aeb5d1;
  font-size: .72rem;
  font-weight: 700;
  cursor: pointer;
  transition: color .13s ease, filter .13s ease, transform .13s ease;
}

.mines-bet-buttons button {
  min-width: 47px;
  padding: 0 10px;
}

.mines-bet-buttons button:hover,
.mines-grid-tabs button:hover {
  color: #fff;
  filter: brightness(1.1);
}

.mines-bet-buttons button:active,
.mines-grid-tabs button:active,
.mines-play-button:active {
  transform: translateY(1px) scale(.98);
}

.mines-count-wrap {
  position: relative;
  display: grid;
  grid-template-columns: 92px 1fr;
  overflow: visible;
  padding: 0 14px;
}

.mines-count-input {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mines-small-bomb {
  width: 22px;
  height: 22px;
  color: #848ba8;
}

.mines-count-input input {
  appearance: textfield;
  padding: 0;
}

.mines-count-input input::-webkit-inner-spin-button,
.mines-count-input input::-webkit-outer-spin-button {
  appearance: none;
}

.mines-slider {
  width: 100%;
  height: 4px;
  appearance: none;
  border-radius: 999px;
  outline: 0;
  background: linear-gradient(
    90deg,
    var(--mines-accent) 0%,
    var(--mines-accent) var(--mines-slider-pct),
    #34394f var(--mines-slider-pct),
    #34394f 100%
  );
  cursor: pointer;
}

.mines-slider::-webkit-slider-thumb {
  width: 15px;
  height: 15px;
  appearance: none;
  border: 3px solid #dadcf0;
  border-radius: 50%;
  background: var(--mines-accent);
  box-shadow: 0 1px 5px rgba(0, 0, 0, .4);
}

.mines-slider::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border: 3px solid #dadcf0;
  border-radius: 50%;
  background: var(--mines-accent);
}

.mines-grid-tabs {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 7px;
}

.mines-grid-tabs button {
  height: 40px;
}

.mines-grid-tabs button.is-active {
  border-color: #7a72ff;
  border-bottom-color: #4941bb;
  background: linear-gradient(180deg, #8079ff 0%, #6c63ff 45%, #5a51e6 100%);
  box-shadow: inset 0 1px rgba(255, 255, 255, .15), 0 2px 0 #443caf, 0 0 13px rgba(108, 99, 255, .15);
  color: #fff;
}

.mines-play-button {
  width: 100%;
  height: 44px;
  border: 1px solid #7a72ff;
  border-bottom-color: #463eb1;
  border-radius: 6px;
  background: linear-gradient(180deg, #8079ff 0%, #6c63ff 45%, #5a51e6 100%);
  box-shadow: inset 0 1px rgba(255, 255, 255, .16), 0 3px 0 #443caf, 0 8px 20px rgba(61, 52, 171, .18);
  color: #fff;
  font-size: .88rem;
  font-weight: 700;
  cursor: pointer;
  transition: filter .13s ease, transform .13s ease;
}

.mines-play-button:hover {
  filter: brightness(1.08);
}

.mines-actions,
.mines-bottom-buttons {
  display: flex;
  width: 100%;
}

.mines-fairness-button {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 7px;
  border: 0;
  background: transparent;
  color: #8e95b2;
  font-size: .72rem;
  font-weight: 600;
  cursor: pointer;
  transition: color .14s ease;
}

.mines-fairness-button:hover {
  color: #c7cce2;
}

.mines-fairness-button svg {
  width: 15px;
  height: 15px;
  color: #00e284;
  fill: rgba(0, 226, 132, .12);
}

.mines-board-wrap {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  justify-content: center;
  padding: clamp(28px, 4.2vw, 62px);
  background:
    radial-gradient(circle at 50% 50%, rgba(108, 99, 255, .075), transparent 58%),
    #1b1e2c;
}

.mines-grid {
  display: grid;
  width: min(100%, 570px);
  aspect-ratio: 1;
  grid-template-columns: repeat(var(--mines-grid-size), minmax(0, 1fr));
  gap: clamp(5px, .7vw, 10px);
}

.mines-cell {
  display: grid;
  min-width: 0;
  min-height: 0;
  place-items: center;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, .025);
  border-radius: 7px;
  background: linear-gradient(145deg, #252a3d 0%, #202438 100%);
  box-shadow: inset 0 1px rgba(255, 255, 255, .025), 0 3px 7px rgba(4, 5, 10, .18);
}

.mines-cell:disabled {
  cursor: default;
  opacity: 1;
}

.mines-gem {
  width: 51%;
  height: 51%;
  opacity: .34;
  filter: saturate(.25) drop-shadow(0 5px 4px rgba(0, 0, 0, .24));
}

@media (max-width: 1100px) {
  .mines-page-wrap {
    width: calc(100% - 32px);
  }

  .mines-board-wrap {
    padding: 32px;
  }
}

@media (max-width: 820px) {
  .mines-middle {
    flex-direction: column;
  }

  .mines-controls {
    flex-basis: auto;
    border-right: 0;
    border-bottom: 1px solid rgba(255, 255, 255, .06);
  }

  .mines-board-wrap {
    min-height: 420px;
  }
}

@media (max-width: 520px) {
  .mines-page-wrap {
    width: calc(100% - 20px);
  }

  .mines-controls {
    padding: 18px;
  }

  .mines-control-fields {
    gap: 18px;
    padding-top: 20px;
  }

  .mines-board-wrap {
    min-height: 320px;
    padding: 18px;
  }

  .mines-grid {
    gap: 5px;
  }

  .mines-cell {
    border-radius: 5px;
  }
}

`

function normalizeAmount(value) {
  const digits = String(value || '').replace(/\D/g, '')
  return Math.max(0, Number(digits || 0))
}

function formatAmount(value) {
  return Math.max(0, Number(value || 0)).toLocaleString('en-US')
}

export default function Mines() {
  const [amount, setAmount] = useState(DEFAULT_BET)
  const [mineCount, setMineCount] = useState(3)
  const [gridSize, setGridSize] = useState(5)
  const [muted, setMuted] = useState(false)
  const cells = useMemo(() => Array.from({ length: gridSize * gridSize }, (_, index) => index), [gridSize])
  const sliderPercentage = ((mineCount - 1) / 23) * 100

  const updateMineCount = (value) => {
    setMineCount(Math.min(24, Math.max(1, Number(value) || 1)))
  }

  return (
    <div className="mines-page main-container">
      <style>{MINES_STYLES}</style>
      <div className="_pageWrap_lhu08_2 mines-page-wrap">
        <div className="_modal_lhu08_121 mines-panel" aria-labelledby="mines-title">
          <div className="_middle_lhu08_133 mines-middle">
            <div className="_leftColumn_lhu08_141 mines-controls">
            <div className="_modalTitleRow_lhu08_173 mines-title-row">
              <svg width="0" height="0" className="mines-gradient-defs" aria-hidden="true">
                <defs>
                  <linearGradient id="minesIconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="100%" stopColor="#6c63ff" />
                  </linearGradient>
                </defs>
              </svg>
              <MinesIcon className="_headerTitleIcon_lhu08_55 mines-title-icon" />
              <span id="mines-title" className="_sidebarTitle_lhu08_47 mines-title-text" role="heading" aria-level="1">Mines</span>
              <button
                className="_volumeBtn_lhu08_96 mines-volume-button"
                type="button"
                aria-label={muted ? 'Unmute Mines' : 'Mute Mines'}
                onClick={() => setMuted((current) => !current)}
              >
                {muted ? <VolumeX className="_volumeIcon_lhu08_110" /> : <Volume2 className="_volumeIcon_lhu08_110" />}
              </button>
            </div>

            <div className="_leftMiddle_lhu08_162 mines-control-fields">
              <div className="_inputGroup_lhu08_195 mines-input-group">
                <label className="_label_lhu08_196" htmlFor="mines-amount">Amount</label>
                <div className="_betInputWrapper_lhu08_208 mines-bet-input-wrap">
                  <img src="/bobux.png" alt="" className="_coinIcon_lhu08_217 mines-coin-icon" />
                  <input
                    className="_betInput_lhu08_208"
                    id="mines-amount"
                    type="text"
                    inputMode="numeric"
                    value={formatAmount(amount)}
                    onChange={(event) => setAmount(normalizeAmount(event.target.value))}
                  />
                  <div className="_betButtons_lhu08_229 mines-bet-buttons">
                    <button className="_betQuickBtn_lhu08_230 _btnSecondary_sd554_399" type="button" onClick={() => setAmount(Math.floor(amount / 2))}>1/2</button>
                    <button className="_betQuickBtn_lhu08_230 _btnSecondary_sd554_399" type="button" onClick={() => setAmount(amount * 2)}>2X</button>
                  </div>
                </div>
              </div>

              <div className="_inputGroup_lhu08_195 mines-input-group">
                <label className="_label_lhu08_196" htmlFor="mines-count">Number of mines</label>
                <div className="_minesInputWrapper_lhu08_240 mines-count-wrap">
                  <div className="_minesInputContainer_lhu08_241 mines-count-input">
                    <img src={SMALL_BOMB_IMAGE} alt="bomb" className="_smallBombIcon_lhu08_250 mines-small-bomb" />
                    <input
                      className="_minesNumberInput_lhu08_251"
                      id="mines-count"
                      type="number"
                      min="1"
                      max="24"
                      value={mineCount}
                      onChange={(event) => updateMineCount(event.target.value)}
                    />
                  </div>
                  <input
                    className="_slider_lhu08_265 mines-slider"
                    type="range"
                    min="1"
                    max="24"
                    value={mineCount}
                    onChange={(event) => updateMineCount(event.target.value)}
                    style={{ '--mines-slider-pct': `${sliderPercentage}%` }}
                    aria-label="Number of mines"
                  />
                </div>
              </div>

              <div className="_inputGroup_lhu08_195 mines-input-group">
                <label className="_label_lhu08_196 mines-label">Grid size</label>
                <div className="_tabSelector_lhu08_312 mines-grid-tabs">
                  {GRID_SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      className={`_tab_lhu08_312 _btnSecondary_sd554_399 ${gridSize === size ? '_activeTab_lhu08_325 is-active' : ''}`}
                      onClick={() => setGridSize(size)}
                    >
                      {size}x{size}
                    </button>
                  ))}
                </div>
              </div>

              <div className="_actions_lhu08_380 mines-actions">
                <button className="_primaryAction_lhu08_383 _btnPrimary_sd554_43 mines-play-button" type="button">Play</button>
              </div>
            </div>

            <div className="_leftBottomBtns_lhu08_185 mines-bottom-buttons">
              <button className="_fairnessBtn_lhu08_73 mines-fairness-button" type="button" title="Provably fair">
                <svg fill="#00e284" width="14" height="14" viewBox="0 0 347.971 347.971" aria-hidden="true">
                  <path d="M317.309,54.367C257.933,54.367,212.445,37.403,173.98,0C135.519,37.403,90.033,54.367,30.662,54.367 c0,97.405-20.155,236.937,143.317,293.604C337.463,291.305,317.309,151.773,317.309,54.367z M162.107,225.773l-47.749-47.756 l21.379-21.378l26.37,26.376l50.121-50.122l21.378,21.378L162.107,225.773z" />
                </svg>
                Fairness
              </button>
            </div>
          </div>

            <div className="_boardBox_lhu08_149 mines-board-wrap">
              <div
                className="_grid_lhu08_404 mines-grid"
                style={{ '--mines-grid-size': gridSize }}
                aria-label={`${gridSize} by ${gridSize} Mines board`}
              >
                {cells.map((cell) => (
                  <button key={cell} type="button" className="_cell_lhu08_412 _disabled_lhu08_424 mines-cell" disabled aria-label={`Unrevealed cell ${cell + 1}`}>
                    <img src={UNREVEALED_GEM_IMAGE} alt="Unrevealed" className="_gemIcon_lhu08_430 _gemIconGray_lhu08_431 mines-gem" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
