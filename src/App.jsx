import { useEffect } from 'react'
import { BrowserRouter, useNavigate, usePathname } from './lib/router'
import Layout from './components/Layout'
import Coinflip from './pages/Coinflip'
import Mines from './pages/Mines'
import { useAuth } from './store/auth'

function AppRoutes() {
  const pathname = usePathname()
  const navigate = useNavigate()
  const routeName = pathname.replace(/^\/+|\/+$/g, '')
  const pages = {
    coinflip: <Coinflip />,
    mines: <Mines />,
  }
  const page = pages[routeName]

  useEffect(() => {
    if (!page) navigate('/coinflip', { replace: true })
  }, [navigate, page])

  return <Layout>{page || <Coinflip />}</Layout>
}

export default function App() {
  const bootstrap = useAuth((s) => s.bootstrap)
  const loading = useAuth((s) => s.loading)

  // Restore session + connect socket once on mount.
  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  if (loading) {
    return (
      <div className="loading-screen" role="status" aria-label="Loading AMPDUEL">
        <div className="loading-screen-content">
          <img
            src="/Logo.svg"
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
    )
  }

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
