import { useState } from 'react'
import { Menu } from 'lucide-react'
import { NavLink } from '../lib/router'
import { navSections } from '../data'
import { XIcon, DiscordIcon } from './icons'

function NavItem({ icon: Icon, name, path, isCollapsed, isLoggedIn, onNavigate, onOpenProfileModal, onOpenLeaderboardModal }) {
  const requiresLogin = path === 'sessions' || path === 'profile'

  if (path === 'leaderboard') {
    return (
      <li>
        <button
          type="button"
          onClick={() => {
            onOpenLeaderboardModal?.()
            onNavigate?.()
          }}
          className={`group flex w-full items-center gap-4 rounded-lg px-4 py-[10px] text-[15.5px] font-medium text-[#aeb4dd] transition-all duration-300 ease-out hover:bg-white/[0.05] hover:text-white ${isCollapsed ? 'justify-center' : ''}`}
          title={isCollapsed ? name : ''}
        >
          <Icon className="h-[22px] w-[22px] shrink-0 text-[#8f96c8] transition-colors duration-300 group-hover:text-white" />
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
          className={`group flex w-full items-center gap-4 rounded-lg px-4 py-[10px] text-[15.5px] font-medium transition-all duration-300 ease-out ${
            disabled
              ? 'cursor-not-allowed text-[#626982] opacity-60'
              : 'text-[#aeb4dd] hover:bg-white/[0.05] hover:text-white'
          } ${isCollapsed ? 'justify-center' : ''}`}
          title={isCollapsed ? (disabled ? `Login to access ${name.toLowerCase()}` : name) : ''}
        >
          <Icon
            className={`h-[22px] w-[22px] shrink-0 transition-colors duration-300 ${
              disabled ? 'text-[#626982]' : 'text-[#8f96c8] group-hover:text-white'
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
          `group flex items-center gap-4 rounded-lg px-4 py-[10px] text-[15.5px] font-medium transition-all duration-300 ease-out ${
            isActive
              ? 'bg-white/[0.06] text-white'
              : 'text-[#aeb4dd] hover:bg-white/[0.05] hover:text-white'
          } ${isCollapsed ? 'justify-center' : ''}`
        }
        title={isCollapsed ? name : ''}
      >
        {({ isActive }) => (
          <>
            <Icon
              className={`h-[22px] w-[22px] shrink-0 transition-colors duration-300 ${
                isActive ? 'text-white' : 'text-[#8f96c8] group-hover:text-white'
              }`}
            />
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
      <div className="flex justify-center px-2 py-2.5">
        <div className="h-[3px] w-10 rounded-full bg-[#6c63ff] opacity-90"></div>
      </div>
    )
  }
  return (
    <p className="px-4 pb-1.5 pt-2.5 text-[12.5px] font-semibold uppercase tracking-normal text-slate-500">
      {children}
    </p>
  )
}

export default function Sidebar({ isLoggedIn, mobileOpen = false, onMobileClose, onOpenProfileModal, onOpenLeaderboardModal }) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  return (
    <>
      <aside
        aria-label="Primary navigation"
        className={`fixed bottom-0 left-0 top-[calc(4.5rem+env(safe-area-inset-top))] z-[120] flex w-full shrink-0 flex-col overflow-hidden pb-[calc(4.5rem+env(safe-area-inset-bottom))] transition-[width,transform] duration-300 ease-out sm:top-[5.25rem] md:top-24 lg:relative lg:inset-auto lg:z-auto lg:mx-3 lg:w-[var(--sidebar-width)] lg:translate-x-0 lg:rounded-b-none lg:rounded-t-[8px] lg:pb-0 lg:duration-500 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-[105%]'
        }`}
        style={{
          '--sidebar-width': isCollapsed ? '82px' : '286px',
          background:
            'linear-gradient(180deg, rgb(27, 31, 46) 0px, rgb(25, 28, 42) 360px, rgb(23, 25, 37) 760px, rgb(23, 25, 37) 100%)',
        }}
      >
      <div className="relative flex h-full flex-col overflow-hidden transition-[width,transform,opacity] duration-500 ease-out">

        <div className={`w-full ${isCollapsed ? 'px-2 pt-0' : 'px-3 pt-0'}`}>
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={`hidden h-12 w-full items-center gap-4 rounded-lg px-4 text-[15.5px] font-medium text-slate-400 transition-all duration-300 ease-out hover:bg-white/[0.05] hover:text-slate-200 lg:flex ${
            isCollapsed ? 'justify-center' : ''
          }`}
          title={isCollapsed ? 'Expand' : 'Collapse'}
        >
          <Menu className="-ml-1 h-[22px] w-[22px] shrink-0" />
          {!isCollapsed && <span>Menu</span>}
        </button>
      </div>

      <nav className="scroll-cool no-scrollbar min-h-0 w-full flex-1 overflow-x-hidden overflow-y-auto px-6 py-5 transition-all duration-300 ease-out sm:px-8 lg:px-3 lg:py-3">
        {navSections.map((section) => (
          <div key={section.label} className="mb-3">
            <SectionLabel isCollapsed={isCollapsed}>{section.label}</SectionLabel>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
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
                />
              ))}
            </ul>
          </div>
        ))}

        <div className="mb-2">
          <SectionLabel isCollapsed={isCollapsed}>Socials</SectionLabel>
          <ul className="space-y-0.5">
            <li>
              <a
                href="#"
                onClick={onMobileClose}
                className={`group flex items-center gap-4 rounded-lg px-4 py-[10px] text-[15.5px] font-medium text-[#aeb4dd] transition-all duration-300 ease-out hover:bg-white/[0.05] hover:text-white ${
                  isCollapsed ? 'justify-center' : ''
                }`}
                title={isCollapsed ? 'X' : ''}
              >
                <XIcon size={19} className="ml-[1px] text-[#8f96c8] transition-colors duration-300 group-hover:text-white" />
                {!isCollapsed && <span className="whitespace-nowrap">X</span>}
              </a>
            </li>
            <li>
              <a
                href="#"
                onClick={onMobileClose}
                className={`group flex items-center gap-4 rounded-lg px-4 py-[10px] text-[15.5px] font-medium text-[#aeb4dd] transition-all duration-300 ease-out hover:bg-white/[0.05] hover:text-white ${
                  isCollapsed ? 'justify-center' : ''
                }`}
                title={isCollapsed ? 'Discord' : ''}
              >
                <DiscordIcon size={22} className="text-[#8f96c8] transition-colors duration-300 group-hover:text-[#5865F2]" />
                {!isCollapsed && <span className="whitespace-nowrap">Discord</span>}
              </a>
            </li>
          </ul>
        </div>
      </nav>
    </div>
      </aside>
    </>
  )
}
