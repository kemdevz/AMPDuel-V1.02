
import { useEffect, useState } from 'react'
import Header from './Header'
import Sidebar from './Sidebar'
import ChatPanel from './ChatPanel'
import ProfileModal from './ProfileModal'
import LeaderboardModal from './LeaderboardModal'
import { useAuth } from '../store/auth'
import { NavLink, usePathname } from '../lib/router'
import { normalizeCoinflipGameMode } from '../lib/coinflipGameMode'
import ProfileTipManager from './ProfileTipManager'
import TermsModal from './TermsModal'
import HeaderUtilityBar from './HeaderUtilityBar'
import ProvablyFairModal from './ProvablyFairModal'
import { clearPrefetchedApiResponses, prefetchApiRequest } from '../lib/apiClient'
import { LEADERBOARD_ENABLED } from '../features'

export default function Layout({ children, onInitialWalletReady }) {
  const pathname = usePathname()
  const user = useAuth((s) => s.user)
  const touchSessionActivity = useAuth((s) => s.touchSessionActivity)
  const isLoggedIn = Boolean(user)
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [leaderboardModalOpen, setLeaderboardModalOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [mobileChatOpen, setMobileChatOpen] = useState(false)
  const [termsModalOpen, setTermsModalOpen] = useState(false)
  const [fairnessModalOpen, setFairnessModalOpen] = useState(false)
  const activeGameStorageKey = pathname === '/mines' ? 'bloxdice:mines-game' : 'bloxdice:coinflip-game'
  const [activeGameMode, setActiveGameMode] = useState(() => {
    try {
      const storageKey = window.location.pathname === '/mines' ? 'bloxdice:mines-game' : 'bloxdice:coinflip-game'
      return normalizeCoinflipGameMode(window.localStorage.getItem(storageKey), 'mm2')
    } catch {
      return 'mm2'
    }
  })

  useEffect(() => {
    try {
      setActiveGameMode(normalizeCoinflipGameMode(window.localStorage.getItem(activeGameStorageKey), 'mm2'))
    } catch {
      setActiveGameMode('mm2')
    }

    const handleGameModeChange = (event) => {
      if (event?.detail?.storageKey !== activeGameStorageKey) return
      setActiveGameMode(normalizeCoinflipGameMode(event?.detail?.gameMode, 'mm2'))
    }
    window.addEventListener('ampduel:game-mode-changed', handleGameModeChange)
    return () => window.removeEventListener('ampduel:game-mode-changed', handleGameModeChange)
  }, [activeGameStorageKey])

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
    const handleOpenTermsModal = () => setTermsModalOpen(true)

    window.addEventListener('terms:open', handleOpenTermsModal)
    return () => window.removeEventListener('terms:open', handleOpenTermsModal)
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
    if (!user) {
      clearPrefetchedApiResponses()
      return undefined
    }

    const warmCommonViews = () => {
      void Promise.allSettled([
        prefetchApiRequest('/api/inventory'),
        prefetchApiRequest('/api/profile'),
        prefetchApiRequest('/api/sessions'),
      ])
    }
    const idleId = typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback(warmCommonViews, { timeout: 500 })
      : window.setTimeout(warmCommonViews, 0)

    return () => {
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleId)
      else window.clearTimeout(idleId)
    }
  }, [user?.id, user?.profile_id])

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
    <div className="reference-shell flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[hsl(228_17%_12%)]">
      <Sidebar
        isLoggedIn={isLoggedIn}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
        onOpenProfileModal={() => setProfileModalOpen(true)}
        onOpenLeaderboardModal={() => setLeaderboardModalOpen(true)}
        onOpenTermsModal={() => setTermsModalOpen(true)}
      />

      <Header
        onInitialWalletReady={onInitialWalletReady}
        onOpenProfileModal={() => setProfileModalOpen(true)}
        onOpenLeaderboardModal={() => setLeaderboardModalOpen(true)}
        onOpenTermsModal={() => setTermsModalOpen(true)}
      />

      <div className="mt-[72px] flex min-h-0 flex-1 overflow-hidden">
          <ChatPanel gameMode={activeGameMode} mobileOpen={mobileChatOpen} onMobileOpenChange={setMobileChatOpen} />

          <div className="flex min-h-0 min-w-0 flex-[1_1_auto] flex-col">
            <HeaderUtilityBar
              onOpenFairness={() => setFairnessModalOpen(true)}
              onOpenTerms={() => setTermsModalOpen(true)}
            />
            <main
              className="main-bg no-scrollbar page-scroll-container relative z-0 box-border min-h-0 min-w-0 flex-[1_1_auto] touch-pan-y overscroll-contain overflow-x-hidden overflow-y-auto bg-[hsl(228_17%_12%)] pb-[calc(5rem+env(safe-area-inset-bottom))] xl:pb-0"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {children}
            </main>
          </div>
      </div>

      <nav
        aria-label="Mobile navigation"
        className="fixed bottom-0 left-0 z-[130] flex h-[calc(5rem+env(safe-area-inset-bottom))] w-full items-stretch border-t border-white/[0.06] bg-[hsl(227_17%_11%)] pb-[env(safe-area-inset-bottom)] xl:hidden"
      >
        <button
          type="button"
          aria-label="menu"
          className={`flex flex-1 items-center justify-center border-0 border-b-2 bg-transparent text-xl transition ${mobileNavOpen ? 'border-b-[#ff4fa3] text-[#ff4fa3]' : 'border-b-transparent text-white/60'}`}
          onClick={() => {
            setMobileChatOpen(false)
            setMobileNavOpen((open) => !open)
          }}
        >
          <svg viewBox="0 0 576 512" className="h-4 w-4" fill="currentColor" aria-hidden="true"><path d="M575.8 255.5c0 18-15 32.1-32 32.1h-32l.7 160.2c0 2.7-.2 5.4-.5 8.1V472c0 22.1-17.9 40-40 40h-16c-1.1 0-2.2 0-3.3-.1-1.4.1-2.8.1-4.2.1h-56c-22.1 0-40-17.9-40-40v-88c0-17.7-14.3-32-32-32h-64c-17.7 0-32 14.3-32 32v88c0 22.1-17.9 40-40 40h-56c-1.5 0-3-.1-4.5-.2-1.2.1-2.4.2-3.6.2h-16c-22.1 0-40-17.9-40-40V287.6H32c-18 0-32-14-32-32.1 0-9 3-17 10-24L266.4 8c7-7 15-8 22-8s15 2 21 7l255.8 224.5c8 7 12 15 11 24z" /></svg>
        </button>

        <NavLink
          to="/coinflip"
          end
          onClick={() => {
            setMobileNavOpen(false)
            setMobileChatOpen(false)
          }}
          aria-label="games"
          className={({ isActive }) => `flex flex-1 items-center justify-center border-b-2 text-xl transition ${isActive && !mobileNavOpen && !mobileChatOpen ? 'border-b-[#ff4fa3] text-[#ff4fa3]' : 'border-b-transparent text-white/60'}`}
        >
          <svg viewBox="0 0 640 512" className="h-4 w-4" fill="currentColor" aria-hidden="true"><path d="M192 64C86 64 0 150 0 256s86 192 192 192h256c106 0 192-86 192-192S554 64 448 64H192zm304 104a40 40 0 1 1 0 80 40 40 0 1 1 0-80zM392 304a40 40 0 1 1 80 0 40 40 0 1 1-80 0zM168 200c0-13.3 10.7-24 24-24s24 10.7 24 24v32h32c13.3 0 24 10.7 24 24s-10.7 24-24 24h-32v32c0 13.3-10.7 24-24 24s-24-10.7-24-24v-32h-32c-13.3 0-24-10.7-24-24s10.7-24 24-24h32v-32z" /></svg>
        </NavLink>

        <button
          type="button"
          aria-label="chat"
          className={`flex flex-1 items-center justify-center border-0 border-b-2 bg-transparent text-xl transition ${mobileChatOpen ? 'border-b-[#ff4fa3] text-[#ff4fa3]' : 'border-b-transparent text-white/60'}`}
          onClick={() => {
            setMobileNavOpen(false)
            setMobileChatOpen(true)
          }}
        >
          <svg viewBox="0 0 512 512" className="h-4 w-4" fill="currentColor" aria-hidden="true"><path d="M64 0C28.7 0 0 28.7 0 64v288c0 35.3 28.7 64 64 64h96v80c0 6.1 3.4 11.6 8.8 14.3s11.9 2.1 16.8-1.5L309.3 416H448c35.3 0 64-28.7 64-64V64c0-35.3-28.7-64-64-64H64z" /></svg>
        </button>
      </nav>

      <ProfileModal
        isOpen={profileModalOpen}
        initialTab="profile"
        onClose={() => setProfileModalOpen(false)}
      />

      {LEADERBOARD_ENABLED ? <LeaderboardModal
        isOpen={leaderboardModalOpen}
        onClose={() => setLeaderboardModalOpen(false)}
      /> : null}

      <TermsModal
        isOpen={termsModalOpen}
        onClose={() => setTermsModalOpen(false)}
      />

      <ProvablyFairModal
        isOpen={fairnessModalOpen}
        onClose={() => setFairnessModalOpen(false)}
      />

      <ProfileTipManager gameMode={activeGameMode} />
    </div>
  )
}
