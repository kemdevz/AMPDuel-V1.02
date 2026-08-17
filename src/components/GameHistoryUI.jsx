export function AllGamesIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

export function GameHistoryStatusBadge({ status }) {
  const variants = {
    WON: 'bg-[rgba(34,197,94,.15)] text-[#34d399]',
    LOST: 'bg-[rgba(239,68,68,.15)] text-[#f87171]',
    CANCELLED: 'bg-[rgba(156,163,175,.15)] text-[#9ca3af]',
    PUSH: 'bg-[rgba(167,139,250,.15)] text-[#c4b5fd]',
    TIE: 'bg-[rgba(167,139,250,.15)] text-[#c4b5fd]',
  }

  return (
    <span className={`inline-flex items-center justify-center whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-extrabold tracking-[.05em] ${variants[status] || variants.CANCELLED}`}>
      {status}
    </span>
  )
}
