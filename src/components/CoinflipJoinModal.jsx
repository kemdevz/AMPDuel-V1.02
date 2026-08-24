import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../store/auth'
import DepositModal from './DepositModal'
import { getInventoryItemCardStyle } from './InventoryItemCard'
import SortDirectionIcon from './SortDirectionIcon'
import { notifications } from './Notifications'
import { formatPriceValue, parsePriceValue } from '../Utils/FormatPriceValues'

const BOBUX_ICON = '/bobux.png'
const HEADS_ICON = '/heads.webp'
const TAILS_ICON = '/tails.webp'
const SEARCH_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAASDSURBVGhD7ZnJbh1FFIa76ibECSuww6BcJglCJthkCwRWCCkIIR4hXDACiUeI8gAskDLbeYpEUVhBYMEGkBIRxwTEEBkwg80KE7i5Xfx/53fLPdzurh7gLvxJ1j2n5K6qv+vUqaGDTSYMo99WeOeIm5cZcfyceV1m5zQS8tYgvOSC4KB1wT3WmZ6KE4TGjfC3agLz+ak5+5KKW6eWkNlBuNgLzW487PU8RLvbNlw8M9fbp6LW8OrI7GD08ZbQPgOz0UhS0Mi6T07P2UMqakzlDmEUlreE5n65rXDbumWIeVBuIyoJwVxYQyhtl5thZNyt0LqbxpnfMF9+ZFlogr4zbsaG5uGeM1PRP+aAkVnD3Llbbm1KhRSJwBv9Cm90j9xCEJZXEZZPyU3QhphCIePCCQJWTp81OwNjEO4eOGdm33C/o857VRKDJIAw69UOM6vfDHcmdlbE0IYLGIUZbxEEz+DZadRxXSUxGK0H8OI+kuvNWCHKTgkoAqlzv9zaMP2irkW5MQjh52R6kyuE6wR+EmHHcGpDxDqoay/qXJUbgQbNm4PRNble5ArhYiczJpoTLYM6Z2TGIBL2yvQiI4TbDr4ZuRFRGNSZE2WgTmY+eRFsG324KLcyGSHo7UGZMQwDma2Tl77z+lBGRgg3gDIjuNjJ7Ix0G+jDtMzK5AhJ7mK5YsvsDLSxJDNi3E66iISQ9HmCcNshszPQxi8yY/L6UkRmRNJgmH+S2RlttFEqBCQyWEd4h1KaUiHYxbayzS4CbTQ+HiSE5J2xsRVvfSFMgzYyQnzP+5kR4RlbZgTPEzI7A208JDMCfRjKrEyOkOAPmRFFh6I2YHZCG9vkRqAPmSxWRkYIZvZnMmO0ieyEYS98VmYMstgXMiuTEcIrG2wREvsqnEue5KFIbnugzq0jm9igMrRPzttX5FYmI4TwykZmDE92MlsDda7IjIGQKzK9GPuW3z7iEKqZXfB1HorkNoLhGo30BjDm4Yl5/+0JyR0RwnsnmTFbcVbAwSdzTPUlTwQJA+e9fV9nrBBsrw/hrLAsNwZi9qAjK7XmDC8fBuFqnghyedfCazK9Ke0MDjl/4sS4Q26CoXU3zszZ3E5thCmW2Sk9sdMwyVzof7/jh2OPeR8dKr3VIjFEF3RL2MX+itS5fkG3Cyv2fVzs0utEERTzYf/a1MKxA/+oqBKVw2N2MPqZVzZyO4ViPnj66+3fvLv7bxWVMnaOpOHlGebM5fQaUwdmJ/7c8bLg7ZoXrz7x1+Pv36g8kpWFECSA50+cM5b3W3UEUQDm1RWm2POYC0V1+IqpHFp58LYDPeGHnumCDz1DzJdV44JPT83bV1Uc8cjR76YOLz26xk6rKAPFVgmzRkLS1Pn0tu/ol3e9sLT/VpmYsmzWqpC6VBEDHMNxnJiJEEKaipkYIaSJGK+s1TVcBLkYFmUzYF5Ggui/dzPx8WmihBCK4cQuE3N4sf+t7IiJE0IYNkUjw091WNMStzsTNUfS5M2Zcd8bJ1oI2SimrS/A/xvcAXDTKneTTf47guBfRB/4oi5eINMAAAAASUVORK5CYII='

const formatNumber = (value) => {
  const numericValue = Number(value ?? 0)
  return Number.isFinite(numericValue) ? numericValue.toLocaleString() : '0'
}

const compactValue = (value) => {
  return formatPriceValue(value)
}

const parseRoomValue = (room) => {
  return parsePriceValue(room?.value)
}

function findAutoSelectedItems(items, minValue, targetValue, maxValue) {
  const candidates = items
    .filter((item) => item?.displayKey && Number(item?.value) > 0)
    .map((item) => ({ key: item.displayKey, value: Number(item.value) }))
    .sort((a, b) => b.value - a.value)

  if (!candidates.length) return []
  if (!targetValue) return [candidates[0].key]

  let states = new Map([[0, []]])
  let best = null

  for (const item of candidates) {
    const additions = []
    for (const [sum, keys] of states) {
      const nextSum = sum + item.value
      if (nextSum > maxValue || states.has(nextSum)) continue
      additions.push([nextSum, [...keys, item.key]])
    }

    additions.forEach(([sum, keys]) => {
      states.set(sum, keys)
      if (sum >= minValue && sum <= maxValue) {
        const distance = Math.abs(targetValue - sum)
        if (!best || distance < best.distance || (distance === best.distance && keys.length < best.keys.length)) {
          best = { distance, keys }
        }
      }
    })

    if (best?.distance === 0) break

    if (states.size > 3500) {
      states = new Map(
        [...states.entries()]
          .sort(([sumA], [sumB]) => {
            const scoreA = sumA >= minValue ? Math.abs(targetValue - sumA) : (minValue - sumA) + targetValue
            const scoreB = sumB >= minValue ? Math.abs(targetValue - sumB) : (minValue - sumB) + targetValue
            return scoreA - scoreB
          })
          .slice(0, 2500),
      )
    }
  }

  return best?.keys || []
}

function BagIcon() {
  return (
    <svg viewBox="0 0 260 320" width="20" height="20" aria-hidden="true">
      <path fill="#ff4fa3" d="M50 110c0-40 30-90 80-90s80 50 80 90v150c0 25-20 45-45 45H95c-25 0-45-20-45-45V110z" />
      <path fill="#7A72FF" d="M60 180h140v75c0 20-15 35-35 35H95c-20 0-35-15-35-35v-75z" />
      <path fill="#4A43C9" d="M110 40h40c8 0 12 10 12 20v10H98V60c0-10 4-20 12-20z" />
    </svg>
  )
}

function AutoSelectIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 9V19.4C3 20.3 3.7 21 4.6 21H15M17 8L13 12L11 10M7 13.8V6.2C7 4.4 8.4 3 10.2 3H17.8C19.6 3 21 4.4 21 6.2V13.8C21 15.6 19.6 17 17.8 17H10.2C8.4 17 7 15.6 7 13.8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SortIcon({ ascending = false }) {
  return <SortDirectionIcon ascending={ascending} />
}

function coinflipJoinItemMatchesMode(item, gameMode) {
  if (!gameMode) return true
  const name = String(item?.name || '')
  return gameMode === 'gems_only'
    ? /\bgems?\b/i.test(name)
    : /\b(?:gargantuan|titanic|gems?)\b/i.test(name)
}

function JoinItemCard({ item, selected, onToggle }) {
  return (
    <button
      type="button"
      className={`cfjItem${selected ? ' cfjItemSelected' : ''}`}
      onClick={onToggle}
      style={getInventoryItemCardStyle(item, selected)}
    >
      <span className="cfjSelectedDot" />
      <img src={item.image_url || BOBUX_ICON} alt="" className="cfjItemBlur" draggable={false} />
      <div className="cfjItemImageWrap">
        <img src={item.image_url || BOBUX_ICON} alt={item.name || 'Item'} className="cfjItemImage" draggable={false} />
      </div>
      <p className="cfjItemName">{item.name || 'Unnamed item'}</p>
      <p className="cfjItemValue">
        <img src={BOBUX_ICON} alt="" />
        {formatNumber(item.value)}
      </p>
    </button>
  )
}

export default function CoinflipJoinModal({ room, onClose, onJoin }) {
  const user = useAuth((state) => state.user)
  const [inventoryItems, setInventoryItems] = useState([])
  const [selectedItems, setSelectedItems] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('Highest to Lowest')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [depositOpen, setDepositOpen] = useState(false)
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !depositOpen) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [depositOpen, onClose])

  useEffect(() => {
    let mounted = true

    const loadInventory = async () => {
      setLoading(true)
      setError(null)

      const ownerIds = [user?.profile_id, user?.id].filter(Boolean).map(String)

      try {
        const { data: sessionData } = await supabase.auth.getSession()
        if (sessionData?.session?.user?.id) ownerIds.push(String(sessionData.session.user.id))
        const { data: userData } = await supabase.auth.getUser()
        if (userData?.user?.id) ownerIds.push(String(userData.user.id))
      } catch (err) {
        console.warn('[CoinflipJoinModal] failed to collect owner ids', err)
      }

      const uniqueOwnerIds = [...new Set(ownerIds)]
      if (uniqueOwnerIds.length === 0) {
        if (mounted) {
          setInventoryItems([])
          setError(null)
          notifications.error('Please sign in to load your inventory.')
          setLoading(false)
        }
        return
      }

      const { data, error: inventoryError } = await supabase
        .from('inventory_items')
        .select('*')
        .in('user_id', uniqueOwnerIds)
        .order('created_at', { ascending: false })

      if (!mounted) return

      if (inventoryError) {
        setInventoryItems([])
        setError(null)
        notifications.error(inventoryError.message || 'Failed to load inventory.')
      } else {
        setInventoryItems(data ?? [])
      }
      setLoading(false)
    }

    void loadInventory()
    return () => {
      mounted = false
    }
  }, [user?.id, user?.profile_id])

  const inventoryRows = useMemo(
    () => inventoryItems.map((item) => ({ ...item, displayKey: item.id || item.name || 'inventory' })),
    [inventoryItems],
  )
  const gameMode = String(room?.game_mode || '').trim().toLowerCase()
  const eligibleInventoryRows = useMemo(
    () => inventoryRows.filter((item) => coinflipJoinItemMatchesMode(item, gameMode)),
    [gameMode, inventoryRows],
  )

  const sortedRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const filtered = eligibleInventoryRows.filter((item) => query === '' || String(item.name || '').toLowerCase().includes(query))

    return filtered.slice().sort((a, b) => {
      const aSelected = selectedItems.includes(a.displayKey)
      const bSelected = selectedItems.includes(b.displayKey)
      if (aSelected !== bSelected) return aSelected ? -1 : 1
      if (sortBy === 'Highest to Lowest') return Number(b.value ?? 0) - Number(a.value ?? 0)
      if (sortBy === 'Lowest to Highest') return Number(a.value ?? 0) - Number(b.value ?? 0)
      return new Date(b.created_at || 0) - new Date(a.created_at || 0)
    })
  }, [eligibleInventoryRows, searchQuery, selectedItems, sortBy])

  const selectedRows = eligibleInventoryRows.filter((item) => selectedItems.includes(item.displayKey))
  const selectedValue = selectedRows.reduce((sum, item) => sum + Number(item.value ?? 0), 0)
  const targetValue = parseRoomValue(room)
  const minValue = targetValue * 0.9
  const maxValue = targetValue * 1.1
  const rangeLabel = room?.range || `${compactValue(minValue)} - ${compactValue(maxValue)}`
  const creatorSide = String(room?.creator_side || room?.creatorSide || 'heads').toLowerCase() === 'tails'
    ? 'tails'
    : 'heads'
  const storedOpponentSide = String(room?.opponent_side || room?.opponentSide || '').toLowerCase()
  const joinSide = storedOpponentSide === 'heads' || storedOpponentSide === 'tails'
    ? storedOpponentSide
    : creatorSide === 'heads' ? 'tails' : 'heads'
  const canJoin = selectedRows.length > 0 && (!targetValue || (selectedValue >= minValue && selectedValue <= maxValue))

  const toggleSelectAll = () => {
    if (selectedItems.length === eligibleInventoryRows.length) {
      setSelectedItems([])
      return
    }
    setSelectedItems(eligibleInventoryRows.map((item) => item.displayKey))
  }

  const autoSelect = () => {
    const keys = findAutoSelectedItems(eligibleInventoryRows, minValue, targetValue, maxValue)
    if (!keys.length) {
      notifications.error('No item combination fits this coinflip value range.')
      return
    }
    setSelectedItems(keys)
  }

  const handleJoin = async () => {
    if (!canJoin || joining) return
    setJoining(true)
    try {
      const opponentAvatarUrl = user?.avatar_headshot_url || user?.avatar_url || null
      const payload = {
        roomId: room?.id || room?.room_id || null,
        opponent_uuid: String(user?.profile_id || user?.id || ''),
        opponent_username: user?.username || user?.email || 'user',
        opponent_side: joinSide,
        opponent_items: selectedRows.map((it) => ({ id: it.id, name: it.name, image_url: it.image_url || null, value: Number(it.value ?? 0) })),
        opponent_avatar_url: opponentAvatarUrl,
        opponent_avatar: opponentAvatarUrl,
        item_ids: selectedRows.map((it) => it.id).filter(Boolean),
      }

      const res = await fetch('/api/coinflip/join', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const text = await res.text()
      let json = null
      if (text) {
        try { json = JSON.parse(text) } catch { json = null }
      }

      if (!res.ok) {
        console.error('[CoinflipJoinModal] join failed', json || text)
        notifications.error(json?.error || text || 'Unable to join coinflip')
        setJoining(false)
        return
      }

      try { window.dispatchEvent(new CustomEvent('wallet:updated')) } catch (e) {}
      try {
        onJoin?.({
          room,
          updatedRoom: json?.data || null,
          selectedItems: selectedRows,
          selectedValue,
          side: joinSide,
        })
      } catch (e) {}
      notifications.joinedGame()
      onClose()
    } catch (err) {
      console.error('[CoinflipJoinModal] join error', err)
      notifications.error(err?.message || 'Unable to join coinflip')
      setJoining(false)
    }
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      <DepositModal isOpen={depositOpen} onClose={() => setDepositOpen(false)} />
      <div className="cfjBackdrop" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}>
        <div className="cfjModal" role="dialog" aria-modal="true" aria-label="Join coinflip">
          <button type="button" className="cfjClose" onClick={onClose} aria-label="Close">&times;</button>

          <div className="cfjHeader">
            <div className="cfjSearchWrap">
              <input
                type="text"
                placeholder="Search for an item..."
                className="cfjSearch"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              <img src={SEARCH_ICON} alt="" className="cfjSearchIcon" />
            </div>
            <button
              type="button"
              className="cfjSort"
              aria-label={`Sort items: ${sortBy}`}
              title={sortBy}
              onClick={() => setSortBy((current) => current === 'Highest to Lowest' ? 'Lowest to Highest' : 'Highest to Lowest')}
            >
              <SortIcon ascending={sortBy === 'Lowest to Highest'} />
            </button>
          </div>

          <div className="cfjItemsWrap">
            <div className="cfjStats">
              <div className="cfjStat">
                <img src={BOBUX_ICON} alt="" />
                <div>
                  <span>VALUE</span>
                  <strong>{formatNumber(eligibleInventoryRows.reduce((sum, item) => sum + Number(item.value ?? 0), 0))}</strong>
                </div>
              </div>
              <div className="cfjStat">
                <BagIcon />
                <div>
                  <span>ITEMS</span>
                  <strong>{formatNumber(eligibleInventoryRows.length)}</strong>
                </div>
              </div>
              <button className="cfjPlus" type="button" onClick={() => setDepositOpen(true)}>+</button>
            </div>

            <div className="cfjGrid">
              {loading ? (
                <div className="cfjEmpty">
                  <h1>Loading...</h1>
                  <p>Fetching your inventory...</p>
                </div>
              ) : error ? (
                <div className="cfjEmpty">
                  <h1>No items!</h1>
                  <p>{error}</p>
                  <button type="button" className="cfjDeposit" onClick={() => setDepositOpen(true)}>Deposit</button>
                </div>
              ) : sortedRows.length === 0 ? (
                <div className="cfjEmpty">
                  <h1>No items!</h1>
                  <p>No items were found...</p>
                  <button type="button" className="cfjDeposit" onClick={() => setDepositOpen(true)}>Deposit</button>
                </div>
              ) : (
                sortedRows.map((item) => (
                  <JoinItemCard
                    key={item.displayKey}
                    item={item}
                    selected={selectedItems.includes(item.displayKey)}
                    onToggle={() => setSelectedItems((current) =>
                      current.includes(item.displayKey)
                        ? current.filter((key) => key !== item.displayKey)
                        : [...current, item.displayKey],
                    )}
                  />
                ))
              )}
            </div>
          </div>

          <div className="cfjFooter">
            <span className="cfjRange">{rangeLabel}</span>
            <img src={joinSide === 'heads' ? HEADS_ICON : TAILS_ICON} alt={joinSide} className="cfjCoin" />
            <button
              className="cfjIconBtn"
              type="button"
              disabled={eligibleInventoryRows.length === 0 || loading || joining}
              onClick={autoSelect}
              aria-label="Automatically select items"
            >
              <AutoSelectIcon />
            </button>
            <button className="cfjFlatBtn" type="button" disabled={eligibleInventoryRows.length === 0} onClick={toggleSelectAll}>
              {selectedItems.length === eligibleInventoryRows.length ? 'Unselect All' : 'Select all'}
            </button>
            <button
              className={`cfjJoinBtn${joining ? ' cfjJoinBtnPressed' : ''}`}
              type="button"
              disabled={!canJoin || joining}
              onClick={() => { void handleJoin() }}
            >
              <strong>
                <span>Join</span>
                <span style={{ marginLeft: 5 }}>|</span>
              </strong>
              <img src={BOBUX_ICON} alt="" />
              <span>{formatNumber(selectedValue)}</span>
            </button>
          </div>
        </div>
      </div>

      <style>{`
.cfjBackdrop{position:fixed;inset:0;background:#00000080;display:flex;align-items:center;justify-content:center;z-index:999;animation:cfjFade .2s ease-out}
.cfjModal{position:relative;width:90%;max-width:1200px;background:#131520;border:1px solid #181a28;border-radius:10px;padding:15px;color:#fff;animation:cfjOpen .22s ease-out;box-sizing:border-box}
.cfjClose{position:absolute;top:5px;right:10px;background:none;border:0;color:#fff;font-size:24px;cursor:pointer;opacity:.8;z-index:5}
.cfjClose:hover{opacity:1}
.cfjHeader{display:flex;align-items:center;gap:6px;margin:5px 36px 10px 0}
.cfjSearchWrap{position:relative;display:flex;width:min(340px,100%)}
.cfjSearch{width:100%;height:40px;padding:10px 18px 10px 40px;border-radius:5px;background:#1c1f2e;border:2px solid #323240;color:#fff;box-shadow:0 10px 7.8px #00000026;font-size:.9rem;box-sizing:border-box;outline:none}
.cfjSearchIcon{position:absolute;left:12px;top:50%;width:18px;height:18px;transform:translateY(-50%);pointer-events:none}
.cfjSort,.cfjIconBtn{width:40px;height:40px;border:0;border-radius:6px;background:#20222f;color:#e1e4f2;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0}
.cfjItemsWrap{height:350px;background:#1c1f2e;border-radius:6px;padding:12px;margin-top:15px;overflow:auto;position:relative;box-sizing:border-box}
.cfjStats{display:flex;gap:15px;align-items:center;margin:-5px 0 12px}
.cfjStat{display:flex;align-items:center;gap:6px}
.cfjStat img,.cfjStat svg{width:20px;height:20px;flex-shrink:0}
.cfjStat div{display:flex;flex-direction:column;gap:1px}
.cfjStat span{font-size:10px;font-weight:700;color:#ffffff59;letter-spacing:.06em}
.cfjStat strong{font-size:17px;line-height:1;color:#f6f6f6}
.cfjPlus,.cfjDeposit,.cfjJoinBtn{border:1px solid rgba(255,79,163,.4);background:linear-gradient(135deg,#ff4fa3,#f43f8f);color:#fff;box-shadow:0 2px 8px #ff4fa333;cursor:pointer}
.cfjPlus{width:34px;height:34px;border-radius:8px;font-size:22px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}
.cfjGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}
.cfjItem{position:relative;height:170px;border:0;border-radius:6px;padding:8px;overflow:hidden;background:linear-gradient(to top,rgba(54,123,255,.18),rgba(54,123,255,0)),rgb(39,45,70);cursor:pointer;color:inherit;transition:transform .15s;text-align:center}
.cfjItem:before{content:"";position:absolute;inset:0;border-radius:6px;padding:2px;background:linear-gradient(to bottom,transparent 0%,var(--item-border-side) 55%,var(--item-border-bottom) 100%);-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}
.cfjItem:hover,.cfjItemSelected{transform:scale(1.03)}
.cfjSelectedDot{position:absolute;top:10px;right:10px;width:12px;height:12px;border-radius:3px;background:var(--item-dot-color);opacity:0;z-index:3}
.cfjItemSelected .cfjSelectedDot{opacity:1}
.cfjItemBlur{position:absolute;top:50%;left:50%;width:80%;height:80%;opacity:.35;filter:blur(18px);object-fit:contain;transform:translate(-50%,-60%);pointer-events:none}
.cfjItemImageWrap{position:relative;height:118px;border-radius:8px;overflow:hidden;z-index:1}
.cfjItemImage{width:100%;height:100%;object-fit:contain}
.cfjItemName{position:relative;z-index:2;margin:4px 0 2px;color:#ccd9fa;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cfjItemValue{position:relative;z-index:2;margin:0;display:flex;align-items:center;justify-content:center;gap:6px;color:#fff;font-size:13px;font-weight:600}
.cfjItemValue img{width:15px;height:15px}
.cfjEmpty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.cfjEmpty h1{font-size:20px;font-weight:700;color:#ddd;margin:0 0 8px}
.cfjEmpty p{color:#aaa;margin:0 0 15px}
.cfjDeposit{border-radius:8px;padding:10px 24px;font-weight:600;font-size:16px}
.cfjFooter{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:15px}
.cfjRange{margin-right:auto;color:#e1e4f2;font-size:15px;font-weight:600;white-space:nowrap}
.cfjCoin{width:38px;height:38px;border-radius:50%;box-shadow:0 8px 6px #00000026;flex-shrink:0}
.cfjIconBtn{width:42px;padding:0}
.cfjFlatBtn{min-height:42px;min-width:140px;padding:0 16px;border:0;border-radius:8px;background:#2a2e44;color:#e1e4f2;font-weight:600;cursor:pointer}
.cfjFlatBtn:disabled,.cfjIconBtn:disabled,.cfjJoinBtn:disabled{opacity:.6;cursor:not-allowed}
.cfjJoinBtn{min-height:42px;min-width:190px;padding:0 16px;border-radius:8px;font-size:14px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:transform .13s cubic-bezier(.22,1,.36,1),filter .14s ease,opacity .14s ease}
.cfjJoinBtn:active:not(:disabled),.cfjJoinBtnPressed{transform:scale(.98) translateY(1px);filter:brightness(.9)}
.cfjJoinBtn img{width:15px;height:15px}
@media (max-width:640px){.cfjBackdrop{align-items:flex-end}.cfjModal{width:100%;height:100dvh;border-radius:0;border:0;display:flex;flex-direction:column;overflow:hidden}.cfjHeader{margin-top:18px}.cfjSearchWrap{width:100%}.cfjItemsWrap{flex:1;height:auto;min-height:0;margin-top:0}.cfjGrid{grid-template-columns:repeat(2,1fr);gap:6px}.cfjFooter{flex-wrap:wrap;justify-content:center}.cfjRange{width:100%;text-align:center;margin:0}.cfjFlatBtn{flex:1 1 120px;min-width:0}.cfjJoinBtn{width:100%;order:10}.cfjCoin{width:28px;height:28px}}
@keyframes cfjFade{from{opacity:0}to{opacity:1}}
@keyframes cfjOpen{from{transform:scale(.85);opacity:0}to{transform:scale(1);opacity:1}}
      `}</style>
    </>,
    document.body,
  )
}
