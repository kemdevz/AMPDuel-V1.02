
import { useEffect, useState } from 'react'
import Header from './Header'
import Sidebar from './Sidebar'
import ChatPanel from './ChatPanel'
import ProfileModal from './ProfileModal'
import Notifications from './Notifications'
import { useAuth } from '../store/auth'

export default function Layout({ children }) {
  const user = useAuth((s) => s.user)
  const touchSessionActivity = useAuth((s) => s.touchSessionActivity)
  const isLoggedIn = Boolean(user)
  const [profileModalOpen, setProfileModalOpen] = useState(false)

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

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#171925]">
      <Header onOpenProfileModal={() => setProfileModalOpen(true)} />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar isLoggedIn={isLoggedIn} onOpenProfileModal={() => setProfileModalOpen(true)} />

        <main
          className="main-bg no-scrollbar page-scroll-container relative z-0 box-border min-w-0 flex-[1_1_auto] overflow-x-hidden overflow-y-auto rounded-t-[0.5rem]"
          style={{
            background:
              'linear-gradient(rgba(29, 32, 47, 0.88), rgb(29, 32, 47)), url("https://i.ibb.co/v4wP9pPK/summer-bg.png") center center / cover',
          }}
        >
          {children}
        </main>

        <ChatPanel />
      </div>

      <ProfileModal
        isOpen={profileModalOpen}
        initialTab="profile"
        onClose={() => setProfileModalOpen(false)}
      />

      <Notifications />
    </div>
  )
}
