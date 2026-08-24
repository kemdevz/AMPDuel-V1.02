import { useEffect, useMemo, useState } from 'react'
import { DiscordIcon } from '../components/icons'
import { apiRequest } from '../lib/apiClient'
import { useNavigate } from '../lib/router'
import { useAuth } from '../store/auth'

const FALLBACK_AVATAR =
  'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-7E27815C7C5F72DA623094CFB3768D15-Png/420/420/AvatarHeadshot/Png/noFilter'
const PAGE_SIZE = 10

function formatValue(value) {
  return Math.round(Number(value) || 0).toLocaleString('en-US')
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

function StatCard({ amount, label }) {
  return (
    <div className="flex flex-col rounded border border-[hsl(231_16%_16%)] bg-[rgba(21,23,29,.25)] p-4">
      <div className="flex items-center gap-1 text-xl font-semibold">
        <img src="/currency.svg" alt="currency" width="24" height="24" className="-mt-[3px] h-6 w-6 object-contain" />
        {formatValue(amount)}
      </div>
      <div className="font-medium opacity-60">{label}</div>
    </div>
  )
}

export default function Profile() {
  const user = useAuth((state) => state.user)
  const authLoading = useAuth((state) => state.loading)
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [history, setHistory] = useState([])
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (!authLoading && !user) navigate('/', { replace: true })
  }, [authLoading, navigate, user])

  useEffect(() => {
    if (!user) return undefined
    let active = true

    Promise.all([
      apiRequest('/api/profile', { cache: 'no-store' }),
      apiRequest('/api/profile/game-history', { cache: 'no-store' }),
    ]).then(([profileResult, historyResult]) => {
      if (!active) return
      setProfile(profileResult?.profile || null)
      setHistory(Array.isArray(historyResult?.history) ? historyResult.history : [])
    }).catch((error) => {
      console.warn('[Profile] failed to load self profile', error)
      if (active) {
        setProfile(null)
        setHistory([])
      }
    })

    return () => {
      active = false
    }
  }, [user?.id, user?.profile_id])

  const account = useMemo(() => ({ ...user, ...profile }), [profile, user])
  const stats = useMemo(() => history.reduce((totals, entry) => {
    const amount = Math.max(0, Number(entry?.amount) || 0)
    const profit = Number(entry?.profit) || 0
    totals.totalBet += amount
    totals.profit += profit
    if (String(entry?.status || '').toUpperCase() === 'WON') {
      totals.totalWon += Math.max(0, amount + profit)
    }
    return totals
  }, { totalBet: 0, totalWon: 0, profit: 0 }), [history])
  const totalPages = Math.ceil(history.length / PAGE_SIZE)
  const visibleRows = history.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const username = account?.username || 'User'
  const role = String(account?.role || 'user')
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1)
  const avatar = account?.avatar_headshot_url || account?.avatar_url || FALLBACK_AVATAR

  useEffect(() => {
    if (totalPages > 0 && page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  if (authLoading || !user) return null

  return (
    <div className="w-full overflow-auto text-white">
      <div className="flex w-full flex-col px-4 pb-32 pt-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-8">
            <span className="relative flex h-28 w-28 shrink-0 overflow-hidden rounded-full border-2 border-[#ff4fa3] bg-[#171920] sm:h-36 sm:w-36">
              <img
                src={avatar}
                alt={`${username} thumbnail`}
                className="absolute inset-0 h-full w-full object-cover"
                draggable={false}
                referrerPolicy="no-referrer"
                onError={(event) => { event.currentTarget.src = FALLBACK_AVATAR }}
              />
            </span>
            <div className="mt-8">
              <div className="text-xl font-semibold">
                {username}
                <div className="mt-2 flex items-center gap-1 text-base font-medium">
                  <div className="grid">
                    <span className="col-span-full row-span-full">{roleLabel}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              className="inline-flex h-10 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-[#ff4fa3] bg-[rgba(11,248,148,.1)] px-4 py-2 text-sm font-semibold text-[#ff4fa3] transition-colors hover:bg-[rgba(11,248,148,.2)] focus-visible:outline-none"
            >
              <DiscordIcon className="mr-2 h-5 w-5" size={20} />
              Link Discord
            </button>
          </div>
        </div>

        <div className="mt-6">
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard amount={stats.totalBet} label="Total Bet" />
            <StatCard amount={stats.totalWon} label="Total Won" />
            <StatCard amount={stats.profit} label="Profit" />
          </div>

          <div className="mt-6">
            <div className="relative rounded border border-[hsl(231_16%_16%)] bg-[rgba(21,23,29,.25)]">
              <div className="flex justify-evenly py-4 opacity-40 md:hidden">
                <p>Type, date and time</p>
                <p>ID, amount</p>
              </div>
              <div className="relative w-full overflow-auto">
                <table className="h-full w-full caption-bottom text-sm">
                  <thead className="hidden opacity-40 md:table-header-group">
                    <tr className="border-none">
                      <th className="h-12 px-4 text-left align-middle font-medium">Type</th>
                      <th className="h-12 px-4 text-left align-middle font-medium">ID</th>
                      <th className="h-12 px-4 text-left align-middle font-medium">Date and Time</th>
                      <th className="h-12 px-4 text-left align-middle font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((entry) => (
                      <tr key={entry.id} className="border-t border-[hsl(231_16%_16%)]">
                        <td className="h-12 whitespace-nowrap px-4 font-medium">{entry.game || 'Game'}</td>
                        <td className="h-12 max-w-[220px] truncate px-4 text-white/60">{entry.id}</td>
                        <td className="h-12 whitespace-nowrap px-4 text-white/60">{formatDate(entry.date)}</td>
                        <td className="h-12 px-4">
                          <span className="inline-flex items-center gap-1 font-medium">
                            <img src="/currency.svg" alt="" className="h-4 w-4 object-contain" />
                            {formatValue(entry.amount)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <nav role="navigation" aria-label="pagination" className="mx-auto mt-3 flex w-full justify-center">
              <ul className="flex w-full flex-row items-center justify-between gap-1">
                <li>
                  <button
                    type="button"
                    aria-label="Go to previous page"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    className="inline-flex h-10 items-center justify-center gap-1 whitespace-nowrap rounded-md px-4 py-2 pl-2.5 text-sm font-medium transition-colors hover:bg-[hsl(231_16%_17%)] disabled:pointer-events-none disabled:opacity-0"
                  >
                    <ChevronLeft />
                    <span>Previous</span>
                  </button>
                </li>
                <li className="text-sm opacity-60">Page {page} of {totalPages}</li>
                <li>
                  <button
                    type="button"
                    aria-label="Go to next page"
                    disabled={totalPages === 0 || page >= totalPages}
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    className="inline-flex h-10 items-center justify-center gap-1 whitespace-nowrap rounded-md px-4 py-2 pr-2.5 text-sm font-medium transition-colors hover:bg-[hsl(231_16%_17%)] disabled:pointer-events-none disabled:opacity-0"
                  >
                    <span>Next</span>
                    <ChevronRight />
                  </button>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      </div>
    </div>
  )
}
