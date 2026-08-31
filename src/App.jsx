import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, useNavigate, usePathname } from './lib/router'
import Layout from './components/Layout'
import Coinflip from './pages/Coinflip'
import Mines from './pages/Mines'
import { useAuth } from './store/auth'
import NotificationCenter from './components/Notifications'

function AppRoutes({ onInitialReady, onInitialWalletReady }) {
  const pathname = usePathname()
  const navigate = useNavigate()
  const routeName = pathname.replace(/^\/+|\/+$/g, '')
  const pages = {
    coinflip: <Coinflip onInitialReady={onInitialReady} />,
    mines: <Mines onInitialReady={onInitialReady} />,
  }
  const page = pages[routeName]

  useEffect(() => {
    if (!page) navigate('/coinflip', { replace: true })
  }, [navigate, page])

  return (
    <Layout onInitialWalletReady={onInitialWalletReady}>
      {page || <Coinflip onInitialReady={onInitialReady} />}
    </Layout>
  )
}

export default function App() {
  const bootstrap = useAuth((s) => s.bootstrap)
  const loading = useAuth((s) => s.loading)
  const [initialPageReady, setInitialPageReady] = useState(false)
  const [initialWalletReady, setInitialWalletReady] = useState(false)
  const handleInitialPageReady = useCallback(() => setInitialPageReady(true), [])
  const handleInitialWalletReady = useCallback(() => setInitialWalletReady(true), [])

  // Restore session + connect socket once on mount.
  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  return (
    <>
      <BrowserRouter>
        <AppRoutes
          onInitialReady={handleInitialPageReady}
          onInitialWalletReady={handleInitialWalletReady}
        />
      </BrowserRouter>
      <NotificationCenter />
      {(loading || !initialPageReady || !initialWalletReady) && (
        <div className="loading-screen" role="status" aria-label="Loading BloxDice">
          <div className="loading-screen-content">
            <img
              src="/bloxdice-logo.png"
              alt=""
              aria-hidden="true"
              className="loading-screen-logo"
              fetchPriority="high"
              decoding="sync"
            />
            <div className="loading-screen-track" aria-hidden="true">
              <span className="loading-screen-progress" />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
