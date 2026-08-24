import { useState } from 'react'
import { NavLink } from '../lib/router'
import { navSections } from '../data'

function NavItem({ icon: Icon, name, path, isCollapsed, isLoggedIn, onNavigate, onOpenProfileModal, onOpenLeaderboardModal, onOpenTermsModal }) {
  const requiresLogin = path === 'sessions' || path === 'profile'
  const itemClass = `group relative flex w-full items-center gap-3 rounded-[7px] px-1 py-2.5 text-sm font-medium leading-[18px] transition-colors duration-100 before:absolute before:-left-3 before:top-0 before:h-full before:w-[2px] before:bg-[#ff4fa3] before:opacity-0 before:transition-opacity before:duration-100 hover:before:opacity-100 ${
    isCollapsed ? 'justify-center' : ''
  }`
  const iconClass = 'h-[18px] w-[18px] shrink-0 transition-colors duration-100'

  if (path === 'leaderboard') {
    return (
      <li>
        <button
          type="button"
          onClick={() => {
            onOpenLeaderboardModal?.()
            onNavigate?.()
          }}
          className={`${itemClass} text-[#aeb4dd] hover:text-[#cbd3f2]`}
          title={isCollapsed ? name : ''}
        >
          <Icon className={`${iconClass} text-[#8f96c8]`} />
          {!isCollapsed && <span className="whitespace-nowrap">{name}</span>}
        </button>
      </li>
    )
  }

  if (path === 'tos') {
    return (
      <li>
        <button
          type="button"
          onClick={() => {
            onOpenTermsModal?.()
            onNavigate?.()
          }}
          className={`${itemClass} text-[#aeb4dd] hover:text-[#cbd3f2]`}
          title={isCollapsed ? name : ''}
        >
          <Icon className={`${iconClass} text-[#8f96c8]`} />
          {!isCollapsed && <span className="whitespace-nowrap">{name}</span>}
        </button>
      </li>
    )
  }

  if (requiresLogin) {
    const disabled = !isLoggedIn
    return (
      <li>
        <button
          type="button"
          disabled={disabled}
          onClick={(event) => {
            if (disabled) return
            if (path === 'profile') {
              event.preventDefault()
              onOpenProfileModal?.()
            }
            onNavigate?.()
          }}
          className={`${itemClass} ${
            disabled
              ? 'cursor-not-allowed text-[#626982] opacity-60'
              : 'text-[#aeb4dd] hover:text-[#cbd3f2]'
          }`}
          title={isCollapsed ? (disabled ? `Login to access ${name.toLowerCase()}` : name) : ''}
        >
          <Icon
            className={`${iconClass} ${
              disabled ? 'text-[#626982]' : 'text-[#8f96c8]'
            }`}
          />
          {!isCollapsed && <span className="whitespace-nowrap">{name}</span>}
        </button>
      </li>
    )
  }

  return (
    <li>
      <NavLink
        to={`/${path}`}
        onClick={onNavigate}
        className={({ isActive }) =>
          `${itemClass} ${
            isActive
              ? 'text-[#E1E4F2] before:opacity-100'
              : 'text-[#aeb4dd] hover:text-[#cbd3f2]'
          }`
        }
        title={isCollapsed ? name : ''}
      >
        {() => (
          <>
            <Icon className={`${iconClass} text-[#8f96c8]`} />
            {!isCollapsed && <span className="whitespace-nowrap">{name}</span>}
          </>
        )}
      </NavLink>
    </li>
  )
}

function SectionLabel({ children, isCollapsed }) {
  if (isCollapsed) {
    return (
      <div className="flex min-h-5 justify-center py-1">
        <div className="h-1 w-5 rounded-full bg-[#ff4fa3] opacity-90"></div>
      </div>
    )
  }
  return (
    <p className="flex min-h-5 items-center font-[Poppins] text-[14px] font-[500] uppercase leading-5 tracking-normal text-[#aeb4dd]">
      {children}
    </p>
  )
}

export default function Sidebar({ isLoggedIn, mobileOpen = false, onMobileClose, onOpenProfileModal, onOpenLeaderboardModal, onOpenTermsModal }) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  return (
    <>
      <aside
        aria-label="Primary navigation"
        className={`fixed bottom-0 left-0 top-[calc(5rem+env(safe-area-inset-top))] z-[120] flex w-full shrink-0 flex-col overflow-hidden bg-[hsl(227_17%_11%)] pb-[calc(5rem+env(safe-area-inset-bottom))] transition-[width,transform] duration-300 ease-out sm:top-20 xl:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-[105%]'
        }`}
        style={{
          '--sidebar-width': isCollapsed ? '64px' : '220px',
        }}
      >
      <div className="relative flex h-full flex-col overflow-hidden transition-[width,transform,opacity] duration-500 ease-out">

        <div className="hidden h-20 w-full shrink-0 items-center px-3 lg:flex">
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden h-8 w-[35px] shrink-0 items-center justify-center rounded-[7px] bg-[#1b1f2e] text-[#aeb4dd] transition-colors duration-200 hover:bg-[#353a52] hover:text-white lg:flex"
          title={isCollapsed ? 'Expand' : 'Collapse'}
        >
          <svg
            aria-hidden="true"
            className="h-7 w-7 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M5 17H13M5 12H19M11 7H19" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
      </div>

      <nav className="scroll-cool no-scrollbar flex min-h-0 w-full flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto px-3 pb-3 transition-all duration-300 ease-out sm:px-8 lg:px-3">
        {navSections.map((section) => (
          <div key={section.label} className={`flex flex-col rounded-md bg-[#1b1f2e] px-3 py-2 ${isCollapsed ? 'gap-1 !px-2' : 'gap-2'}`}>
            <SectionLabel isCollapsed={isCollapsed}>{section.label}</SectionLabel>
            <ul>
              {section.items
                .filter((item) => item.enabled !== false)
                .filter((item) => section.label !== 'Games' || ['coinflip', 'upgrader'].includes(item.path))
                .map((item) => (
                <NavItem
                  key={item.name}
                  icon={item.icon}
                  name={item.name}
                  path={item.path}
                  isCollapsed={isCollapsed}
                  isLoggedIn={isLoggedIn}
                  onNavigate={onMobileClose}
                  onOpenProfileModal={onOpenProfileModal}
                  onOpenLeaderboardModal={onOpenLeaderboardModal}
                  onOpenTermsModal={onOpenTermsModal}
                />
                ))}
            </ul>
          </div>
        ))}

      </nav>
    </div>
      </aside>
    </>
  )
}
