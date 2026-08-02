import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { NavLink } from '../lib/router'
import { navSections } from '../data'
import { XIcon, DiscordIcon } from './icons'

function NavItem({ icon: Icon, name, path, isCollapsed, isLoggedIn, onNavigate, onOpenProfileModal }) {
  const requiresLogin = path === 'sessions' || path === 'profile'

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

export default function Sidebar({ isLoggedIn, mobileOpen = false, onMobileClose, onOpenProfileModal }) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  return (
    <>
      <button
        type="button"
        aria-label="Close navigation"
        className={`fixed inset-0 z-[110] bg-black/60 backdrop-blur-[2px] transition-opacity duration-300 md:hidden ${
          mobileOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onMobileClose}
      />
      <aside
        aria-label="Primary navigation"
        className={`fixed inset-y-0 left-0 z-[120] flex w-[min(86vw,320px)] shrink-0 flex-col overflow-hidden rounded-r-[8px] transition-[width,transform] duration-300 ease-out md:relative md:inset-auto md:z-auto md:mx-3 md:w-[var(--sidebar-width)] md:translate-x-0 md:rounded-b-none md:rounded-t-[8px] md:duration-500 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-[105%]'
        }`}
        style={{
          '--sidebar-width': isCollapsed ? '82px' : '286px',
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          background:
            'linear-gradient(180deg, rgb(27, 31, 46) 0px, rgb(25, 28, 42) 360px, rgb(23, 25, 37) 760px, rgb(23, 25, 37) 100%)',
        }}
      >
      <div className="relative flex h-full flex-col overflow-hidden transition-[width,transform,opacity] duration-500 ease-out">

        <div className={`w-full ${isCollapsed ? 'px-2 pt-0' : 'px-3 pt-0'}`}>
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={`hidden h-12 w-full items-center gap-4 rounded-lg px-4 text-[15.5px] font-medium text-slate-400 transition-all duration-300 ease-out hover:bg-white/[0.05] hover:text-slate-200 md:flex ${
            isCollapsed ? 'justify-center' : ''
          }`}
          title={isCollapsed ? 'Expand' : 'Collapse'}
        >
          <Menu className="-ml-1 h-[22px] w-[22px] shrink-0" />
          {!isCollapsed && <span>Menu</span>}
        </button>
        <div className="flex h-14 items-center justify-between border-b border-white/[0.06] px-2 md:hidden">
          <span className="text-[15px] font-semibold text-white">Menu</span>
          <button
            type="button"
            className="grid h-10 w-10 place-content-center rounded-lg text-slate-400 hover:bg-white/[0.06] hover:text-white"
            aria-label="Close menu"
            onClick={onMobileClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <nav className="scroll-cool no-scrollbar w-full flex-1 min-h-0 overflow-x-hidden overflow-y-auto px-3 py-3 transition-all duration-300 ease-out">
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
