
import { useEffect, useState } from 'react'
import Header from './Header'
import Sidebar from './Sidebar'
import ChatPanel from './ChatPanel'
import ProfileModal from './ProfileModal'
import LeaderboardModal from './LeaderboardModal'
import Notifications from './Notifications'
import { useAuth } from '../store/auth'
import { Home, Menu, MessageSquare } from 'lucide-react'
import { NavLink } from '../lib/router'

export default function Layout({ children }) {
  const user = useAuth((s) => s.user)
  const touchSessionActivity = useAuth((s) => s.touchSessionActivity)
  const isLoggedIn = Boolean(user)
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [leaderboardModalOpen, setLeaderboardModalOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [mobileChatOpen, setMobileChatOpen] = useState(false)

  useEffect(() => {
    const handleOpenProfileModal = () => {
      setProfileModalOpen(true)
    }

    window.addEventListener('profile:open', handleOpenProfileModal)
    return () => {
      window.removeEventListener('profile:open', handleOpenProfileModal)
    }
  }, [])

  useEffect(() => {
    if (!user) return undefined

    let lastTouch = 0
    const touchActivity = () => {
      const now = Date.now()
      if (now - lastTouch < 15000) return
      lastTouch = now
      touchSessionActivity()
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') touchActivity()
    }

    touchActivity()
    const heartbeat = window.setInterval(touchActivity, 30000)
    window.addEventListener('focus', touchActivity)
    window.addEventListener('pointerdown', touchActivity)
    window.addEventListener('keydown', touchActivity)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(heartbeat)
      window.removeEventListener('focus', touchActivity)
      window.removeEventListener('pointerdown', touchActivity)
      window.removeEventListener('keydown', touchActivity)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [touchSessionActivity, user])

  useEffect(() => {
    if (!mobileNavOpen) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setMobileNavOpen(false)
    }
    const handleResize = () => {
      if (window.innerWidth >= 1024) setMobileNavOpen(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleResize)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleResize)
    }
  }, [mobileNavOpen])

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#171925]">
      <Header
        onOpenProfileModal={() => setProfileModalOpen(true)}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar
          isLoggedIn={isLoggedIn}
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
          onOpenProfileModal={() => setProfileModalOpen(true)}
          onOpenLeaderboardModal={() => setLeaderboardModalOpen(true)}
        />

        <main
          className="main-bg no-scrollbar page-scroll-container relative z-0 box-border min-w-0 flex-[1_1_auto] overscroll-contain overflow-x-hidden overflow-y-auto pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:rounded-t-[0.5rem] lg:pb-0"
          style={{
            background:
              'linear-gradient(rgba(29, 32, 47, 0.88), rgb(29, 32, 47)), url("https://i.ibb.co/v4wP9pPK/summer-bg.png") center center / cover',
          }}
        >
          {children}
        </main>

        <ChatPanel mobileOpen={mobileChatOpen} onMobileOpenChange={setMobileChatOpen} />
      </div>

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-[130] grid h-[calc(4.5rem+env(safe-area-inset-bottom))] grid-cols-3 border-t border-white/[0.06] bg-[#151722] pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <button
          type="button"
          className={`relative flex flex-col items-center justify-center gap-1 border-0 bg-transparent text-[11px] font-semibold ${mobileNavOpen ? 'text-[#766dff]' : 'text-[#969dc8]'}`}
          onClick={() => {
            setMobileChatOpen(false)
            setMobileNavOpen((open) => !open)
          }}
        >
          {mobileNavOpen ? <span className="absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-[#6c63ff]" /> : null}
          <Menu className="h-6 w-6" strokeWidth={2.4} />
          <span>Menu</span>
        </button>

        <NavLink
          to="/"
          end
          onClick={() => {
            setMobileNavOpen(false)
            setMobileChatOpen(false)
          }}
          className={({ isActive }) => `relative flex flex-col items-center justify-center gap-1 text-[11px] font-semibold no-underline ${isActive && !mobileNavOpen && !mobileChatOpen ? 'text-[#766dff]' : 'text-[#969dc8]'}`}
        >
          <Home className="h-6 w-6" fill="currentColor" strokeWidth={1.8} />
          <span>Home</span>
        </NavLink>

        <button
          type="button"
          className={`relative flex flex-col items-center justify-center gap-1 border-0 bg-transparent text-[11px] font-semibold ${mobileChatOpen ? 'text-[#766dff]' : 'text-[#969dc8]'}`}
          onClick={() => {
            setMobileNavOpen(false)
            setMobileChatOpen(true)
          }}
        >
          {mobileChatOpen ? <span className="absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-[#6c63ff]" /> : null}
          <MessageSquare className="h-6 w-6" fill="currentColor" strokeWidth={1.8} />
          <span>Chat</span>
        </button>
      </nav>

      <ProfileModal
        isOpen={profileModalOpen}
        initialTab="profile"
        onClose={() => setProfileModalOpen(false)}
      />

      <LeaderboardModal
        isOpen={leaderboardModalOpen}
        onClose={() => setLeaderboardModalOpen(false)}
      />

      <Notifications />
    </div>
  )
}
