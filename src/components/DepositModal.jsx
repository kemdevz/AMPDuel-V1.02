import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiRequest } from '../lib/apiClient'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../store/auth'
import { inventoryItemMatchesGame, normalizeCoinflipGameMode } from '../lib/coinflipGameMode'
import { AMP_MODAL_STYLES, AmpItemCard, CloseIcon } from './AmpInventoryModalUI'
import { notifications } from './Notifications'

const BOT_CONFIGS = Object.freeze({
  mm2: {
    label: 'MM2',
    fullLabel: 'Murder Mystery 2',
    itemType: 'MM2',
    icon: '/deposit-mm2.png',
    accent: '#ff3636',
    accentRgb: '255,54,54',
    surface: '#2a171a',
    example: 'Chroma Luger',
    bots: [
      { name: 'MM2_Rush', active: true, avatar: '/bacon-avatar.png' },
      { name: 'MM2_Zenu', active: true, avatar: '/bacon-avatar.png' },
    ],
  },
  adm: {
    label: 'Adopt Me',
    fullLabel: 'Adopt Me',
    itemType: 'AMP',
    icon: '/deposit-adm.png',
    accent: '#ff4fa3',
    accentRgb: '255,79,163',
    surface: '#2b1825',
    example: 'Unicorn',
    bots: [
      { name: 'ADM_Rush', active: true, avatar: '/bacon-avatar.png' },
      { name: 'ADM_Zenu', active: true, avatar: '/bacon-avatar.png' },
    ],
  },
  ps99: {
    label: 'PS99',
    fullLabel: 'Pet Simulator 99',
    itemType: 'PS99',
    icon: '/ps99-cat.png',
    accent: '#38bdf8',
    accentRgb: '56,189,248',
    surface: '#172630',
    example: 'Huge Santa Monkey',
    bots: [
      { name: 'PS99_Rush', active: true, avatar: '/bacon-avatar.png' },
      { name: 'PS99_Zenu', active: true, avatar: '/bacon-avatar.png' },
    ],
  },
})

function StatusDot({ active }) {
  return (
    <div className="_circle_holder_13k1a_663">
      <div className={active ? '_online_circle_active_13k1a_687' : '_online_circle_inactive_13k1a_689'} />
      <div className={active ? '_inner_circle_active_13k1a_745' : '_inner_circle_inactive_13k1a_747'} />
    </div>
  )
}

function BotRow({ bot }) {
  return (
    <li className="_botItem_13k1a_521">
      <div className="_botDetails_13k1a_543">
        <div className="_statusWrapper_13k1a_575">
          <StatusDot active={bot.active} />
          <img src={bot.avatar} alt={bot.name} className="_botPfp_13k1a_597" draggable={false} />
          <div className="_botNameWrap_13k1a_local">
            <span className="_botName_13k1a_633">{bot.name}</span>
          </div>
        </div>
        <button className="_joinbutton_13k1a_931" type="button">
          Join
        </button>
      </div>
    </li>
  )
}

export default function DepositModal({ isOpen, onClose, gameMode = 'ps99' }) {
  const user = useAuth((state) => state.user)
  const requestedGameMode = normalizeCoinflipGameMode(gameMode, 'ps99')
  const [selectedGameMode, setSelectedGameMode] = useState(requestedGameMode)
  const botConfig = BOT_CONFIGS[selectedGameMode]
  const [view, setView] = useState('bots')
  const [activeWithdraws, setActiveWithdraws] = useState([])
  const [withdrawsLoading, setWithdrawsLoading] = useState(false)
  const [withdrawsError, setWithdrawsError] = useState(null)
  const [canceling, setCanceling] = useState(false)
  const [itemSearchName, setItemSearchName] = useState('')
  const [checkingItem, setCheckingItem] = useState(false)
  const withdrawalScrollRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return undefined

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) {
      setView('bots')
      setWithdrawsError(null)
      setItemSearchName('')
      setCheckingItem(false)
    } else {
      setSelectedGameMode(requestedGameMode)
    }
  }, [isOpen, requestedGameMode])

  useEffect(() => {
    if (!isOpen || view !== 'withdrawals') return undefined

    let isMounted = true

    const loadActiveWithdraws = async () => {
      setWithdrawsLoading(true)
      setWithdrawsError(null)

      if (!user?.profile_id) {
        if (!isMounted) return
        setActiveWithdraws([])
        setWithdrawsLoading(false)
        setWithdrawsError('Please sign in to view withdrawals.')
        return
      }

      try {
        const result = await apiRequest('/api/withdrawals')
        if (!isMounted) return
        setActiveWithdraws(result?.withdrawals ?? [])
      } catch (error) {
        if (!isMounted) return
        setActiveWithdraws([])
        setWithdrawsError(error.message || 'Failed to load withdrawals.')
      }

      setWithdrawsLoading(false)
    }

    void loadActiveWithdraws()

    return () => {
      isMounted = false
    }
  }, [isOpen, view, user?.id, user?.profile_id])

  useEffect(() => {
    const row = withdrawalScrollRef.current
    if (!isOpen || view !== 'withdrawals' || !row) return undefined

    const handleWheel = (event) => {
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      const canScrollBack = delta < 0 && row.scrollLeft > 0
      const canScrollForward = delta > 0 && row.scrollLeft < row.scrollWidth - row.clientWidth
      if (!canScrollBack && !canScrollForward) return
      event.preventDefault()
      row.scrollLeft += delta
    }

    row.addEventListener('wheel', handleWheel, { passive: false })
    return () => row.removeEventListener('wheel', handleWheel)
  }, [activeWithdraws.length, isOpen, view, withdrawsLoading])

  if (!isOpen) return null

  const withdrawCards = activeWithdraws
    .filter((withdraw) => inventoryItemMatchesGame(withdraw, selectedGameMode))
    .map((withdraw, index) => ({
    id: withdraw.id,
    displayKey: withdraw.id || `${withdraw.item_name || 'withdraw'}-${index}`,
    name: withdraw.item_name || 'Unknown item',
    value: withdraw.value ?? 0,
    image_url: withdraw.image_url,
    withdrawed_at: withdraw.withdrawed_at,
    user_id: withdraw.user_id,
    }))

  const handleCancelWithdraws = async (rows) => {
    if (canceling || rows.length === 0) return

    setCanceling(true)
    setWithdrawsError(null)

    try {
      const withdrawalIds = rows.map((row) => row.id)
      let lastLockError = null
      for (let attempt = 0; attempt < 45; attempt += 1) {
        try {
          await apiRequest('/api/withdrawals/cancel', {
            method: 'POST',
            body: JSON.stringify({ withdrawal_ids: withdrawalIds }),
          })
          lastLockError = null
          break
        } catch (err) {
          if (err?.status !== 409) throw err
          lastLockError = err
          await new Promise((resolve) => window.setTimeout(resolve, 2_000))
        }
      }
      if (lastLockError) throw lastLockError

      setActiveWithdraws((prev) => prev.filter((row) => !rows.some((canceledRow) => canceledRow.id === row.id)))
      window.dispatchEvent(new CustomEvent('wallet:updated'))
    } catch (err) {
      notifications.withdrawalCancelFailed(err?.message)
    } finally {
      setCanceling(false)
    }
  }

  const handleSupportedItemCheck = async (event) => {
    event.preventDefault()

    const searchedName = itemSearchName.trim()
    if (!searchedName) {
      notifications.error('Enter an item name to check.')
      return
    }

    setCheckingItem(true)

    try {
      const escapedName = searchedName.replace(/[\\%_]/g, '\\$&')
      const { data, error } = await supabase
        .from('items')
        .select('name')
        .eq('type', botConfig.itemType)
        .ilike('name', escapedName)
        .limit(1)

      if (error) throw error

      const supportedItem = data?.[0]
      if (supportedItem) {
        notifications.success(`${supportedItem.name} is supported!`)
      } else {
        notifications.error(`${searchedName} is not supported.`)
      }
    } catch (err) {
      console.error('[DepositModal] failed to check supported item', err)
      notifications.error('Unable to check item support. Please try again.')
    } finally {
      setCheckingItem(false)
    }
  }

  const isWithdrawalsView = view === 'withdrawals'
  const isGamePickerView = view === 'games'
  const goBack = () => setView(view === 'bots' ? 'games' : 'bots')

  return createPortal(
    <div
      className={isWithdrawalsView ? '_blurbg_ei49y_17' : '_blurbg_13k1a_17'}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className={`${isWithdrawalsView ? '_modalbackgrounddeposit_ei49y_51' : '_modalbackgrounddeposit_13k1a_51'}${isGamePickerView ? ' deposit-game-picker-modal' : ''}`}
        style={{ '--deposit-accent': botConfig.accent, '--deposit-accent-rgb': botConfig.accentRgb }}
        role="dialog"
        aria-modal="true"
        aria-label={isWithdrawalsView ? 'Active withdrawals' : isGamePickerView ? 'Choose a deposit game' : 'Deposit bots'}
      >
        <button
          className={isWithdrawalsView ? '_closeButton_ei49y_137' : '_closeButton_13k1a_137'}
          type="button"
          aria-label="Close"
          onClick={onClose}
        >
          <CloseIcon />
        </button>

        <div className={isWithdrawalsView ? '_modalContent_ei49y_183' : '_modalContent_13k1a_183'}>
          {view !== 'games' ? <button type="button" className="deposit-view-back" onClick={goBack} aria-label={view === 'bots' ? 'Choose another game' : 'Back to deposit bots'}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg><span>Back</span></button> : null}
          {view === 'games' ? (
            <>
              <h1 className="_depositTitle_13k1a_197">DEPOSIT</h1>
              <div className="deposit-game-picker-list">
                {Object.entries(BOT_CONFIGS).map(([mode, config]) => (
                  <button
                    type="button"
                    className="deposit-game-picker-card"
                    key={mode}
                    style={{
                      '--deposit-accent': config.accent,
                      '--deposit-accent-rgb': config.accentRgb,
                      '--deposit-card-surface': config.surface,
                    }}
                    onClick={() => {
                      setSelectedGameMode(mode)
                      setView('bots')
                    }}
                  >
                    <span className="deposit-game-picker-icon"><img src={config.icon} alt="" draggable={false} /></span>
                    <span className="deposit-game-picker-copy"><strong>{config.fullLabel}</strong><small>View available deposit bots</small></span>
                    <svg className="deposit-game-picker-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
                  </button>
                ))}
              </div>
            </>
          ) : view === 'withdrawals' ? (
            <>
              <div className="_botContainer_ei49y_477 _botContainerVisible_ei49y_493 deposit-view-content">
                {withdrawsLoading ? (
                  <p className="_noBots_ei49y_883">Loading withdrawals...</p>
                ) : withdrawsError ? (
                  <p className="_noBots_ei49y_883">{withdrawsError}</p>
                ) : withdrawCards.length === 0 ? (
                  <p className="_noBots_ei49y_883">No Active Withdrawals</p>
                ) : (
                  <>
                    <div className="withdrawal-wallet-grid" ref={withdrawalScrollRef} tabIndex="0" aria-label="Active withdrawal items">
                      {withdrawCards.map((item) => (
                        <AmpItemCard
                          key={item.displayKey}
                          item={item}
                          footer={(
                            <button
                              className="withdrawal-cancel-button _btnDanger_sd554_163"
                              type="button"
                              disabled={canceling}
                              onClick={() => {
                                const row = activeWithdraws.find((withdraw) => withdraw.id === item.id)
                                if (row) void handleCancelWithdraws([row])
                              }}
                            >
                              Cancel
                            </button>
                          )}
                        />
                      ))}
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <button
                        className="_dangerBtn_ei49y_1309 _btnDanger_sd554_163"
                        type="button"
                        disabled={canceling}
                        onClick={() => void handleCancelWithdraws(activeWithdraws)}
                      >
                        Cancel All
                      </button>
                    </div>
                  </>
                )}
              </div>
              <div className="_footer_ei49y_895">
                <p>If you cancel, items return to your inventory.</p>
              </div>
            </>
          ) : view === 'supported' ? (
            <>
              <div className="_botContainer_13k1a_477 _botContainerVisible_13k1a_493 deposit-view-content">
                <form
                  className="_searchFormWrapper_10ldz_163"
                  onSubmit={handleSupportedItemCheck}
                >
                  <div className="_searchWrapper_10ldz_170">
                    <input
                      type="text"
                      className="_searchInput_10ldz_177"
                      placeholder={`Type item name (e.g. "${botConfig.example}")`}
                      value={itemSearchName}
                      onChange={(event) => setItemSearchName(event.target.value)}
                      disabled={checkingItem}
                      autoComplete="off"
                    />
                    <div className="_searchHint_10ldz_197">
                      Press <b>Enter</b> or click <b>Check</b> to see if the item is supported.
                    </div>
                  </div>
                  <button
                    className="_joinbutton_13k1a_931 _supportedCheck_10ldz_local"
                    type="submit"
                    disabled={checkingItem}
                  >
                    {checkingItem ? 'Checking...' : 'Check'}
                  </button>
                </form>
              </div>
              <div className="_footer_13k1a_895">
                <p>Use the exact in-game item name to check if it is supported.</p>
              </div>
            </>
          ) : (
            <>
              <div className="_bannerWrapper_13k1a_227">
                <div className="_card_13k1a_253 group _depositBotCard_13k1a_local">
                  <div className="_depositBotGame_13k1a_local">
                    <div className="_cardIconWrap_13k1a_329">
                      <img src={botConfig.icon} alt="" aria-hidden="true" className="_cardIconGlow_13k1a_371" draggable={false} />
                      <img src={botConfig.icon} alt={botConfig.label} className="_cardIcon_13k1a_329" draggable={false} />
                    </div>
                    <div className="_cardText_13k1a_419">
                      <div>
                        <span className="_cardTitle_13k1a_441">{botConfig.label}</span>
                      </div>
                      <span className="_cardSubtitle_13k1a_455">2 Available Bots</span>
                    </div>
                  </div>

                  <div className="_depositBotActions_13k1a_local">
                    <button
                      className="_joinbutton_13k1a_931 _activeWithdrawals_13k1a_local"
                      type="button"
                      onClick={() => setView('withdrawals')}
                    >
                      Active Withdrawals
                    </button>
                    <button className="_joinbutton_13k1a_931 _helpButton_13k1a_local" type="button" aria-label="Supported items" onClick={() => setView('supported')}>
                      ?
                    </button>
                  </div>
                </div>
              </div>

              <div className="_botContainer_13k1a_477 _botContainerVisible_13k1a_493">
                <ul className="_botList_13k1a_503">
                  {botConfig.bots.map((bot) => (
                    <BotRow bot={bot} key={bot.name} />
                  ))}
                </ul>
              </div>

              <div className="_footer_13k1a_895">
                <p>Always be careful for fake bots. Verify usernames carefully!</p>
              </div>
            </>
          )}
        </div>

        <style>{AMP_MODAL_STYLES}</style>
        <style>{`
          @keyframes _fadeIn_ei49y_1 {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          @keyframes _modalOpen_ei49y_1 {
            from { opacity: 0; transform: scale(.96) translateY(12px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }

          ._blurbg_ei49y_17 {
            position: fixed;
            inset: 0;
            z-index: 10001;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, .5);
            animation: _fadeIn_ei49y_1 .3s ease-out;
          }

          ._modalbackgrounddeposit_ei49y_51 {
            --danger: #ff4d4d;
            --danger-light: #ff6b6b;
            --danger-dark: #e03131;
            --danger-gradient: linear-gradient(180deg, var(--danger-light) 0%, var(--danger) 45%, var(--danger-dark) 100%);
            --radius-sm: 6px;
            --font-size-btn: .9rem;
            --font-weight-btn: 600;
            --btn-height: 40px;
            --btn-min-width: 120px;
            --btn-pad-x: 20px;
            --dur-fast: .13s;
            --dur-base: .14s;
            --ease-out: cubic-bezier(.22, 1, .36, 1);
            --press-scale: .98;
            position: relative;
            width: min(90%, 600px);
            max-height: 90vh;
            overflow-y: auto;
            padding: 16px;
            box-sizing: border-box;
            border: 1px solid #181a28;
            border-radius: 10px;
            background: #131520;
            font-family: Poppins, sans-serif;
            animation: _modalOpen_ei49y_1 .25s ease forwards;
          }

          ._modalbackgrounddeposit_ei49y_51 *,
          ._modalbackgrounddeposit_ei49y_51 *::before,
          ._modalbackgrounddeposit_ei49y_51 *::after {
            box-sizing: border-box;
            font-family: Poppins, sans-serif;
          }

          ._modalbackgrounddeposit_ei49y_51::-webkit-scrollbar { width: 8px; }
          ._modalbackgrounddeposit_ei49y_51::-webkit-scrollbar-track { background: transparent; }
          ._modalbackgrounddeposit_ei49y_51::-webkit-scrollbar-thumb {
            background: #2a2e44;
            border-radius: 999px;
          }
          ._modalbackgrounddeposit_ei49y_51::-webkit-scrollbar-thumb:hover { background: #32385a; }

          ._closeButton_ei49y_137 {
            position: absolute;
            top: 8px;
            right: 10px;
            z-index: 2;
            padding: 0;
            border: none;
            background: none;
            color: #fff;
            font-size: 24px;
            line-height: 1;
            cursor: pointer;
            opacity: .8;
            transition: opacity .3s ease;
          }

          ._closeButton_ei49y_137:hover { opacity: 1; }

          ._modalContent_ei49y_183 {
            display: flex;
            flex-direction: column;
            color: #e1e4f2;
            text-align: left;
          }

          ._depositTitle_ei49y_197 {
            margin: 0 40px 6px 0;
            color: #fff;
            font-size: 1.35rem;
            font-weight: 600;
            line-height: 1.2;
            letter-spacing: .6px;
            text-align: left;
            text-transform: uppercase;
          }

          ._botContainer_ei49y_477 {
            max-height: 0;
            margin-top: 10px;
            overflow: hidden;
            opacity: 0;
            transition: max-height .45s ease, opacity .35s ease, margin-top .35s ease;
          }

          ._botContainerVisible_ei49y_493 {
            max-height: 1000px;
            opacity: 1;
          }

          ._noBots_ei49y_883 {
            margin-top: 10px;
            color: #aaa;
            font-size: 14px;
          }

          ._footer_ei49y_895 {
            margin-top: 20px;
            color: #aaa;
            font-size: 13px;
            text-align: center;
          }

          ._footer_ei49y_895 p {
            margin-top: 5px;
            color: #aaa;
            font-size: 12px;
            line-height: 1.5;
          }

          ._scrollRow_v8lrd_1 {
            display: flex;
            gap: 8px;
            padding: 6px 2px 10px;
            overflow-x: auto;
            scroll-snap-type: x mandatory;
            scrollbar-width: none;
            -ms-overflow-style: none;
          }

          ._scrollRow_v8lrd_1::-webkit-scrollbar { display: none; }

          .withdrawal-wallet-grid {
            display: flex;
            gap: 12px;
            padding: 6px 2px 10px;
            overflow-x: auto;
            overflow-y: hidden;
            overscroll-behavior-x: contain;
            scroll-snap-type: x proximity;
            scrollbar-width: thin;
            scrollbar-color: #353945 transparent;
          }
          .withdrawal-wallet-grid::-webkit-scrollbar { height: 6px; }
          .withdrawal-wallet-grid::-webkit-scrollbar-thumb { border-radius: 999px; background: #353945; }
          .withdrawal-wallet-grid .amp-item-card { display: flex; width: 160px; min-width: 160px; min-height: 238px; flex: 0 0 160px; flex-direction: column; scroll-snap-align: start; }
          .withdrawal-wallet-grid .amp-item-image-wrap { height: 104px; }
          .withdrawal-wallet-grid .amp-item-image { width: 94px; height: 94px; }
          .withdrawal-wallet-grid .amp-item-footer { display: block; margin-top: auto; padding-top: 10px; }
          .withdrawal-cancel-button { width: 100%; min-width: 0; height: 30px; padding: 0; font-size: 12px; }

          ._itemBox_v8lrd_22 {
            position: relative;
            display: flex;
            flex: 0 0 auto;
            flex-direction: column;
            justify-content: flex-start;
            width: 160px;
            height: 200px;
            padding: 8px;
            border: none;
            border-radius: 6px;
            scroll-snap-align: start;
            transition: transform .2s ease;
          }

          ._itemBox_v8lrd_22::before {
            content: "";
            position: absolute;
            inset: 0;
            z-index: 0;
            padding: 2px;
            border-radius: 6px;
            background: linear-gradient(
              to bottom,
              transparent 0%,
              var(--item-border-side, rgba(255, 79, 163, .25)) 55%,
              var(--item-border-bottom, rgba(255, 79, 163, .7)) 100%
            );
            -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
            mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
            -webkit-mask-composite: xor;
            mask-composite: exclude;
            pointer-events: none;
          }

          ._itemBox_v8lrd_22:hover { transform: scale(1.03); }

          ._imageWrapper_v8lrd_67 {
            position: relative;
            z-index: 1;
            width: 100%;
            height: 125px;
            margin-bottom: 5px;
            overflow: hidden;
            border-radius: 8px;
          }

          ._itemImage_v8lrd_77 {
            position: absolute;
            top: 0;
            left: 0;
            z-index: 1;
            width: 100%;
            height: 100%;
            border-radius: 8px;
            object-fit: contain;
          }

          ._normalImage_v8lrd_88 { z-index: 1; }

          ._blurritem_v8lrd_93 {
            position: absolute;
            top: 50%;
            left: 50%;
            z-index: 0;
            width: 80%;
            height: 80%;
            object-fit: contain;
            opacity: .35;
            filter: blur(18px);
            transform: translate(-50%, -60%);
            pointer-events: none;
          }

          ._itemDetails_v8lrd_108 {
            position: relative;
            z-index: 1;
            margin-top: 0;
            text-align: center;
          }

          ._itemName_v8lrd_115 {
            margin: 0;
            overflow: hidden;
            color: #ccd9fa;
            font-size: 12px;
            font-weight: 600;
            line-height: normal;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          ._itemPrice_v8lrd_124 {
            margin: 0;
            color: #fff;
            font-size: 13px;
            font-weight: 600;
            line-height: normal;
          }

          ._itemPriceInner_v8lrd_local {
            display: inline-flex;
            align-items: center;
          }

          ._itemPriceInner_v8lrd_local img {
            width: 13px;
            height: 13px;
            margin-right: 5px;
            flex-shrink: 0;
          }

          ._itemPriceText_v8lrd_130 {
            color: #fff;
            font-size: 13px;
            font-weight: 600;
          }

          ._cancelFooter_v8lrd_137 {
            position: relative;
            z-index: 1;
            width: 100%;
            margin-top: auto;
          }

          ._btnDanger_sd554_163 {
            position: relative;
            isolation: isolate;
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: var(--btn-min-width);
            height: var(--btn-height);
            padding: 0 var(--btn-pad-x);
            overflow: hidden;
            box-sizing: border-box;
            border: none;
            border-radius: var(--radius-sm);
            background: var(--danger-gradient);
            color: #fff;
            font-size: var(--font-size-btn);
            font-weight: var(--font-weight-btn);
            letter-spacing: .01em;
            cursor: pointer;
            transform-origin: center;
            transition: transform var(--dur-fast) var(--ease-out), filter var(--dur-base) ease;
          }

          ._btnDanger_sd554_163:hover:not(:disabled) { filter: brightness(1.07); }
          ._btnDanger_sd554_163:active:not(:disabled) { transform: scale(var(--press-scale)); }
          ._btnDanger_sd554_163:focus-visible {
            outline: 2px solid var(--danger-light);
            outline-offset: 2px;
          }
          ._btnDanger_sd554_163:disabled {
            opacity: .6;
            cursor: not-allowed;
            transform: none;
            filter: none;
          }

          ._cancelBtn_v8lrd_144._cancelBtn_v8lrd_144 {
            width: 100%;
            min-width: 0;
            height: 30px;
            padding: 0;
            font-size: 12px;
          }

          ._dangerBtn_ei49y_1309._dangerBtn_ei49y_1309 {
            width: 100%;
            min-width: 0;
          }

          @keyframes _fadeIn_13k1a_1 { from { opacity: 0; } to { opacity: 1; } }
          @keyframes _modalOpen_13k1a_1 { from { transform: scale(.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
          @keyframes _glowOnline_13k1a_1 { 0%, 100% { transform: scale(1); opacity: .85; } 50% { transform: scale(1.12); opacity: 1; } }
          @keyframes _glowOffline_13k1a_1 { 0%, 100% { transform: scale(1); opacity: .8; } 50% { transform: scale(1.08); opacity: 1; } }

          ._blurbg_13k1a_17 {
            position: fixed;
            inset: 0;
            z-index: 10001;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0,0,0,.5);
            animation: _fadeIn_13k1a_1 .3s ease-out;
          }

          ._modalbackgrounddeposit_13k1a_51 {
            position: relative;
            width: min(90%, 600px);
            max-height: 90vh;
            overflow-y: auto;
            padding: 16px;
            border-radius: 10px;
            border: 1px solid #181a28;
            background: #131520;
            animation: _modalOpen_13k1a_1 .25s ease forwards;
            box-sizing: border-box;
          }

          ._modalbackgrounddeposit_13k1a_51::-webkit-scrollbar { width: 8px; }
          ._modalbackgrounddeposit_13k1a_51::-webkit-scrollbar-track { background: transparent; }
          ._modalbackgrounddeposit_13k1a_51::-webkit-scrollbar-thumb { background: #2a2e44; border-radius: 999px; }
          ._modalbackgrounddeposit_13k1a_51::-webkit-scrollbar-thumb:hover { background: #32385a; }

          ._closeButton_13k1a_137 {
            position: absolute;
            top: 8px;
            right: 10px;
            background: none;
            border: none;
            color: #fff;
            font-size: 24px;
            line-height: 1;
            cursor: pointer;
            opacity: .8;
            transition: opacity .3s ease;
          }

          ._closeButton_13k1a_137:hover { opacity: 1; }

          ._modalContent_13k1a_183 {
            display: flex;
            flex-direction: column;
            text-align: left;
            color: #e1e4f2;
          }

          ._depositTitle_13k1a_197 {
            margin: 0 40px 6px 0;
            color: #fff;
            font-size: 1.35rem;
            line-height: 1.2;
            font-weight: 600;
            letter-spacing: .6px;
            text-transform: uppercase;
            text-align: left;
          }

          ._bannerWrapper_13k1a_227 {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            margin: 16px 0;
          }

          ._card_13k1a_253 {
            position: relative;
            display: flex;
            align-items: center;
            gap: 10px;
            width: 100%;
            min-height: 64px;
            padding: 10px 12px;
            overflow: hidden;
            cursor: pointer;
            border-radius: 12px;
            border: 1px solid transparent;
            background: linear-gradient(#1b1f2e,#1b1f2e) padding-box, linear-gradient(180deg, rgba(255,79,163,.6), rgba(255,79,163,.1)) border-box;
            transition: transform .18s ease, background .25s ease, box-shadow .25s ease;
          }

          ._card_13k1a_253:hover {
            background: linear-gradient(#20222f,#20222f) padding-box, linear-gradient(180deg, rgba(255,79,163,.95), rgba(255,79,163,.2)) border-box;
          }

          ._card_13k1a_253:active { transform: scale(.985); }

          ._depositBotCard_13k1a_local {
            justify-content: space-between;
            padding-right: 12px;
          }

          ._depositBotGame_13k1a_local,
          ._depositBotActions_13k1a_local {
            display: flex;
            align-items: center;
            gap: 10px;
          }

          ._depositBotActions_13k1a_local { gap: 6px; }

          ._cardIconWrap_13k1a_329 {
            position: relative;
            width: 42px;
            height: 42px;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          ._cardIcon_13k1a_329 {
            position: relative;
            z-index: 2;
            width: 42px;
            height: 42px;
            border-radius: 8px;
            object-fit: cover;
            transition: transform .22s ease;
          }

          ._cardIconGlow_13k1a_371 {
            position: absolute;
            inset: 0;
            z-index: 1;
            width: 42px;
            height: 42px;
            border-radius: 8px;
            object-fit: cover;
            filter: blur(14px) saturate(1.4);
            opacity: 0;
            pointer-events: none;
            transition: opacity .25s ease, transform .25s ease, filter .25s ease;
          }

          ._card_13k1a_253:hover ._cardIcon_13k1a_329 { transform: rotate(-5deg) scale(1.06); }
          ._card_13k1a_253:hover ._cardIconGlow_13k1a_371 { opacity: .75; transform: scale(1.25); filter: blur(18px) saturate(1.5); }

          ._cardText_13k1a_419 {
            position: relative;
            z-index: 2;
            display: flex;
            flex-direction: column;
            justify-content: center;
            text-align: left;
            user-select: none;
          }

          ._cardTitle_13k1a_441 {
            color: #fff;
            font-size: 15px;
            font-weight: 700;
            line-height: 1.15;
          }

          ._cardSubtitle_13k1a_455 {
            color: rgb(224, 224, 255);
            font-size: 12px;
            line-height: 1.25;
            margin-top: 2px;
          }

          ._botContainer_13k1a_477 {
            max-height: 0;
            opacity: 0;
            overflow: hidden;
            margin-top: 10px;
            transition: max-height .45s ease, opacity .35s ease, margin-top .35s ease;
          }

          ._botContainerVisible_13k1a_493 { max-height: 1000px; opacity: 1; }

          ._botList_13k1a_503 {
            display: flex;
            flex-direction: column;
            list-style: none;
            gap: 6px;
            padding: 0;
            margin: 0;
          }

          ._botItem_13k1a_521 {
            display: flex;
            align-items: center;
            width: 100%;
          }

          ._botDetails_13k1a_543 {
            position: relative;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            width: 100%;
            min-height: 52px;
            padding: 8px 12px;
            border-radius: 8px;
            border: none;
            background: #1b1f2e;
          }

          ._statusWrapper_13k1a_575 {
            display: flex;
            align-items: center;
            gap: 10px;
            min-width: 0;
          }

          ._botPfp_13k1a_597 {
            width: 38px;
            height: 38px;
            flex-shrink: 0;
            object-fit: cover;
            border-radius: 50%;
            border: 2px solid #252839;
            cursor: pointer;
            transition: border-color .2s ease, transform .18s ease;
          }

          ._botPfp_13k1a_597:hover { border-color: #ff4fa3; transform: scale(1.03); }

          ._botNameWrap_13k1a_local {
            display: flex;
            align-items: center;
            gap: 8px;
            min-width: 0;
            flex: 1 1 auto;
          }

          ._botName_13k1a_633 {
            color: #fff;
            font-size: 14px;
            font-weight: 700;
            line-height: 1.2;
            margin-left: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          ._circle_holder_13k1a_663 {
            position: relative;
            width: 12px;
            height: 12px;
            display: flex;
            justify-content: center;
            align-items: center;
            border-radius: 50%;
            flex-shrink: 0;
          }

          ._online_circle_active_13k1a_687,
          ._online_circle_inactive_13k1a_689 {
            position: absolute;
            inset: 0;
            border-radius: 50%;
          }

          ._online_circle_active_13k1a_687 {
            background-color: #39ff14;
            border: 2px solid #39ff14;
            opacity: .85;
            animation: _glowOnline_13k1a_1 1.15s infinite ease-in-out;
            box-shadow: 0 0 4px rgba(57,255,20,.8), 0 0 7px rgba(57,255,20,.5), inset 0 0 6px rgba(57,255,20,.4);
          }

          ._online_circle_inactive_13k1a_689 {
            background-color: #ba2b45;
            border: 2px solid #ba2b45;
            opacity: .8;
            animation: _glowOffline_13k1a_1 1.3s infinite ease-in-out;
            box-shadow: 0 0 4px rgba(186,43,69,.8), 0 0 7px rgba(186,43,69,.5), inset 0 0 6px rgba(186,43,69,.4);
          }

          ._inner_circle_active_13k1a_745,
          ._inner_circle_inactive_13k1a_747 {
            position: absolute;
            width: 6px;
            height: 6px;
            border-radius: 50%;
          }

          ._inner_circle_active_13k1a_745 { background-color: #39ff14; box-shadow: 0 0 4px rgba(57,255,20,.9), inset 0 0 5px rgba(57,255,20,.65); }
          ._inner_circle_inactive_13k1a_747 { background-color: #ba2b45; box-shadow: 0 0 4px rgba(186,43,69,.9), inset 0 0 5px rgba(186,43,69,.65); }

          ._footer_13k1a_895 {
            margin-top: 20px;
            text-align: center;
            color: #aaa;
            font-size: 13px;
          }

          ._noBots_13k1a_883 {
            margin-top: 10px;
            color: #aaa;
            font-size: 14px;
          }

          ._searchFormWrapper_10ldz_163 {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            width: 100%;
            margin: 0;
          }

          ._searchWrapper_10ldz_170 {
            display: flex;
            flex: 1 1 auto;
            min-width: 0;
            flex-direction: column;
            gap: 7px;
          }

          ._searchInput_10ldz_177 {
            width: 100%;
            height: 40px;
            box-sizing: border-box;
            border: 2px solid #323240;
            border-radius: 7px;
            background: #1c1f2e;
            color: #fff;
            padding: 0 12px;
            font-size: 13px;
            outline: none;
          }

          ._searchInput_10ldz_177::placeholder {
            color: #8f96b8;
          }

          ._searchHint_10ldz_197 {
            color: #9ea8ce;
            font-size: 12px;
            line-height: 1.4;
          }

          ._searchHint_10ldz_197 b {
            color: #e1e4f2;
            font-weight: 800;
          }

          ._supportedCheck_10ldz_local {
            height: 36px;
            padding: 0 16px;
            font-size: 13px;
            font-weight: 800;
            white-space: nowrap;
            border-radius: 7px;
            background: linear-gradient(135deg, rgba(255,79,163,.95), rgba(64,56,192,.95));
            border-color: rgba(255,79,163,.6);
            box-shadow: 0 2px 8px rgba(255,79,163,.25);
          }

          ._footer_13k1a_895 p {
            margin-top: 5px;
            color: #aaa;
            font-size: 12px;
            line-height: 1.5;
          }

          ._joinbutton_13k1a_931 {
            position: relative;
            z-index: 10;
            min-width: 88px;
            height: 32px;
            padding: 0 16px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            border-radius: 8px;
            border: 1px solid rgba(255,79,163,.4);
            outline: none;
            background: linear-gradient(135deg,#ff4fa3,#f43f8f);
            color: #fff;
            font-size: 13.5px;
            font-weight: 600;
            line-height: 32px;
            white-space: nowrap;
            box-shadow: 0 2px 8px rgba(255,79,163,.25);
            cursor: pointer;
            transition: none;
            pointer-events: auto;
          }

          ._joinbutton_13k1a_931:hover { opacity: .92; }
          ._joinbutton_13k1a_931:active { transform: scale(.97); }

          ._activeWithdrawals_13k1a_local {
            height: 34px;
            padding: 0 10px;
            font-size: 12.5px;
            font-weight: 700;
            border-radius: 7px;
            background: linear-gradient(135deg, rgba(255,79,163,.95), rgba(64,56,192,.95));
            border-color: rgba(255,79,163,.6);
          }

          ._helpButton_13k1a_local {
            width: 34px;
            min-width: 34px;
            height: 34px;
            padding: 0;
            font-size: 18px;
            font-weight: 700;
            line-height: 34px;
            border-radius: 7px;
            background: linear-gradient(135deg, rgba(255,79,163,.95), rgba(64,56,192,.95));
            border-color: rgba(255,79,163,.6);
          }

          /* Keep deposit and withdrawal surfaces aligned with the wallet modal. */
          ._blurbg_13k1a_17,
          ._blurbg_ei49y_17 {
            padding: 12px;
            box-sizing: border-box;
            background: rgba(4,5,8,.76);
            -webkit-backdrop-filter: blur(9px);
            backdrop-filter: blur(9px);
          }

          ._modalbackgrounddeposit_13k1a_51,
          ._modalbackgrounddeposit_ei49y_51 {
            width: calc(100vw - 24px);
            max-width: 600px;
            max-height: min(760px,calc(100dvh - 24px));
            padding: 20px;
            border: 1px solid rgba(255,255,255,.08);
            border-radius: 12px;
            color: #f4f5f8;
            background: #191c24;
            box-shadow: 0 26px 80px rgba(0,0,0,.55);
            scrollbar-width: thin;
            scrollbar-color: #353945 transparent;
          }

          ._modalbackgrounddeposit_13k1a_51 *,
          ._modalbackgrounddeposit_ei49y_51 * {
            box-sizing: border-box;
            font-family: Poppins,sans-serif;
          }

          ._modalbackgrounddeposit_13k1a_51::-webkit-scrollbar,
          ._modalbackgrounddeposit_ei49y_51::-webkit-scrollbar { width: 6px; }
          ._modalbackgrounddeposit_13k1a_51::-webkit-scrollbar-thumb,
          ._modalbackgrounddeposit_ei49y_51::-webkit-scrollbar-thumb { background: #353945; }

          ._closeButton_13k1a_137,
          ._closeButton_ei49y_137 {
            top: 12px;
            right: 14px;
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
            opacity: 1;
            transition: color .15s ease,background-color .15s ease;
          }
          ._closeButton_13k1a_137:hover,
          ._closeButton_ei49y_137:hover { color: #b3b8c3; background: #282c37; }
          ._closeButton_13k1a_137 svg,
          ._closeButton_ei49y_137 svg { width: 14px; height: 14px; }

          ._modalContent_13k1a_183,
          ._modalContent_ei49y_183 { color: #f4f5f8; }
          ._depositTitle_13k1a_197,
          ._depositTitle_ei49y_197 {
            min-height: 30px;
            margin: 0 42px 10px 0;
            color: #f4f5f8;
            font-size: 17px;
            font-weight: 700;
            line-height: 24px;
            letter-spacing: 0;
          }

          ._card_13k1a_253 {
            border-color: rgba(255,255,255,.07);
            background: #151820;
            box-shadow: none;
          }
          ._card_13k1a_253:hover { border-color: rgba(255,255,255,.1); background: #171a22; }
          ._cardIcon_13k1a_329,
          ._cardIconGlow_13k1a_371 { object-fit: contain; }
          ._cardTitle_13k1a_441 { color: #f4f5f8; font-size: 14px; }
          ._cardSubtitle_13k1a_455 { color: #8e94a2; font-size: 11px; font-weight: 600; }
          ._botDetails_13k1a_543 { background: #20242e; }
          ._botPfp_13k1a_597 { border-color: #2c313d; object-fit: contain; background: #151820; }
          ._botPfp_13k1a_597:hover { border-color: #353b48; }
          ._botName_13k1a_633 { color: #f4f5f8; font-size: 13px; font-weight: 600; }

          ._joinbutton_13k1a_931,
          ._activeWithdrawals_13k1a_local,
          ._helpButton_13k1a_local,
          ._supportedCheck_10ldz_local {
            border: 0;
            border-radius: 7px;
            color: #111319;
            background: #ff4fa3;
            box-shadow: none;
            font-weight: 700;
          }
          ._joinbutton_13k1a_931:hover { opacity: .9; }
          ._searchInput_10ldz_177 {
            border: 1px solid rgba(255,255,255,.07);
            background: #151820;
            color: #f4f5f8;
            font-size: 12px;
            font-weight: 500;
          }
          ._searchInput_10ldz_177::placeholder,
          ._searchHint_10ldz_197,
          ._footer_13k1a_895 p,
          ._footer_ei49y_895 p,
          ._noBots_13k1a_883,
          ._noBots_ei49y_883 { color: #8e94a2; }
          ._searchHint_10ldz_197 b { color: #f4f5f8; }

          .deposit-view-back {
            display: inline-flex;
            width: fit-content;
            height: 30px;
            align-items: center;
            gap: 5px;
            margin: 0 0 5px;
            padding: 0 9px 0 7px;
            border: 1px solid rgba(255,255,255,.07);
            border-radius: 6px;
            color: #a8aeb9;
            background: #20242e;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            transition: color .15s ease,background-color .15s ease,border-color .15s ease;
          }
          .deposit-view-back:hover { color: #f4f5f8; border-color: rgba(255,255,255,.1); background: #282c37; }
          .deposit-view-back svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

          .deposit-game-picker-modal { max-width: 896px; }
          .deposit-game-picker-list { display: flex; flex-direction: column; gap: 12px; overflow: auto; }
          .deposit-game-picker-card {
            position: relative;
            isolation: isolate;
            display: flex;
            width: 100%;
            min-height: 96px;
            align-items: center;
            gap: 28px;
            overflow: hidden;
            padding: 16px 24px;
            border: 1px solid rgba(var(--deposit-accent-rgb),.22);
            border-radius: 8px;
            color: #f4f5f8;
            background:
              linear-gradient(90deg,rgba(var(--deposit-accent-rgb),.2) 0%,rgba(var(--deposit-accent-rgb),.075) 36%,rgba(21,24,32,.94) 72%,#151820 100%),
              var(--deposit-card-surface,#151820);
            box-shadow:
              inset 0 1px 0 rgba(255,255,255,.025),
              inset 0 -1px 0 rgba(0,0,0,.28);
            text-align: left;
            cursor: pointer;
            transition: border-color .25s ease,background-color .25s ease,transform .2s cubic-bezier(.22,1,.36,1);
          }
          .deposit-game-picker-card::before {
            content: '';
            position: absolute;
            inset: 0;
            z-index: -1;
            background: radial-gradient(circle,rgba(4,5,8,.43) 0 2.1px,transparent 2.35px) 0 0/16px 16px;
            mask-image: linear-gradient(90deg,#000 0%,rgba(0,0,0,.92) 26%,transparent 55%);
            -webkit-mask-image: linear-gradient(90deg,#000 0%,rgba(0,0,0,.92) 26%,transparent 55%);
            opacity: .72;
            pointer-events: none;
          }
          .deposit-game-picker-card::after {
            content: '';
            position: absolute;
            inset: 0;
            z-index: -1;
            background:
              radial-gradient(ellipse at 13% 51%,rgba(var(--deposit-accent-rgb),.25),transparent 38%),
              linear-gradient(90deg,transparent 0%,rgba(4,5,8,.08) 58%,rgba(4,5,8,.22) 100%);
            pointer-events: none;
          }
          .deposit-game-picker-card:hover { border-color: var(--deposit-accent); transform: translateY(-1px); }
          .deposit-game-picker-card:active { transform: scale(.995); }
          .deposit-game-picker-icon {
            position: relative;
            display: flex;
            width: 64px;
            height: 64px;
            flex: 0 0 64px;
            align-items: center;
            justify-content: center;
            transition: transform .3s cubic-bezier(.22,1,.36,1);
          }
          .deposit-game-picker-icon::before { content: ''; position: absolute; inset: 9px; z-index: -1; border-radius: 50%; background: rgba(var(--deposit-accent-rgb),.32); filter: blur(22px); }
          .deposit-game-picker-icon img { display: block; width: 100%; height: 100%; object-fit: contain; }
          .deposit-game-picker-card:hover .deposit-game-picker-icon { transform: scale(1.08); }
          .deposit-game-picker-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 3px; }
          .deposit-game-picker-copy strong { color: #f4f5f8; font-size: 15px; font-weight: 600; line-height: 21px; }
          .deposit-game-picker-copy small { color: #8e94a2; font-size: 11px; font-weight: 500; line-height: 16px; }
          .deposit-game-picker-arrow { width: 18px; height: 18px; flex: 0 0 18px; fill: none; stroke: var(--deposit-accent); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; opacity: .78; transition: transform .2s ease,opacity .2s ease; }
          .deposit-game-picker-card:hover .deposit-game-picker-arrow { opacity: 1; transform: translateX(3px); }

          .deposit-view-back + ._bannerWrapper_13k1a_227,
          ._bannerWrapper_13k1a_227 { margin-top: 3px; margin-bottom: 9px; }
          ._bannerWrapper_13k1a_227 + ._botContainer_13k1a_477 { margin-top: 0; }
          .deposit-view-back + .deposit-view-content { margin-top: 3px; }

          @media (max-width: 640px) {
            ._modalbackgrounddeposit_ei49y_51 {
              width: calc(100% - 20px);
              max-height: 92vh;
              padding: 14px;
            }

            ._modalbackgrounddeposit_13k1a_51 {
              width: calc(100% - 20px);
              max-height: 92vh;
              padding: 14px;
            }

            ._bannerWrapper_13k1a_227 { flex-direction: column; }
            ._card_13k1a_253 { min-height: 60px; }
            ._depositBotCard_13k1a_local {
              align-items: flex-start;
              flex-direction: column;
            }
            ._depositBotActions_13k1a_local { width: 100%; }
            ._activeWithdrawals_13k1a_local { flex: 1 1 auto; }
            ._botDetails_13k1a_543 {
              align-items: center;
              gap: 10px;
              min-height: 48px;
              padding: 8px 10px;
            }
            ._botName_13k1a_633 {
              max-width: 130px;
              font-size: 13.5px;
            }
            ._joinbutton_13k1a_931 {
              min-width: 80px;
              padding: 0 12px;
              font-size: 12.5px;
            }
            ._searchFormWrapper_10ldz_163 {
              flex-direction: column;
            }
            ._supportedCheck_10ldz_local {
              width: 100%;
            }
            .deposit-game-picker-modal { width: calc(100% - 20px); }
            .deposit-game-picker-card { min-height: 80px; gap: 16px; padding: 12px 15px; }
            .deposit-game-picker-icon { width: 52px; height: 52px; flex-basis: 52px; }
            .deposit-game-picker-copy strong { font-size: 13px; }
            .deposit-game-picker-copy small { font-size: 10px; }
          }
        `}</style>
      </div>
    </div>,
    document.body,
  )
}
