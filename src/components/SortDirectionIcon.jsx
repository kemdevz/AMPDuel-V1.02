const SORT_ICON_PATH = 'M13 12.208V7h-2v5.137l-1.086-1.086L8.5 12.466 12.036 16l3.535-3.535-1.414-1.415L13 12.208zM8 6H0v2h8V6zm6-3H0v2h14V3zm2-3H0v2h16V0zM6 9H0v2h6V9zm-2 3H0v2h4v-2z'

export default function SortDirectionIcon({ ascending = false, rotation, className = '' }) {
  const degrees = Number.isFinite(Number(rotation)) ? Number(rotation) : ascending ? 180 : 0

  return (
    <svg
      className={`sort-direction-icon ${className}`.trim()}
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
      style={{
        transform: `rotate(${degrees}deg)`,
        transformOrigin: 'center',
        transition: 'transform .2s ease',
      }}
    >
      <path fillRule="evenodd" d={SORT_ICON_PATH} />
    </svg>
  )
}
