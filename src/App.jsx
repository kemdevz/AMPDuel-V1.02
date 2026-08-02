import { useEffect } from 'react'
import { BrowserRouter, useNavigate, usePathname } from './lib/router'
import Layout from './components/Layout'
import Home from './pages/Home'
import Coinflip from './pages/Coinflip'
import SummerEvent from './pages/SummerEvent'
import Cases from './pages/Cases'
import Jackpot from './pages/Jackpot'
import Mines from './pages/Mines'
import Roll from './pages/Roll'
import LiveCasino from './pages/LiveCasino'
import LiveCasinoGame from './pages/LiveCasinoGame'
import Placeholder from './pages/Placeholder'
import { useAuth } from './store/auth'

function decodeRouteSegment(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return ''
  }
}

function AppRoutes() {
  const pathname = usePathname()
  const navigate = useNavigate()
  const routeName = pathname.replace(/^\/+|\/+$/g, '')
  const pages = {
    '': <Home />,
    battles: <Placeholder title="Case Battles" />,
    coinflip: <Coinflip />,
    events: <SummerEvent />,
    cases: <Cases />,
    jackpot: <Jackpot />,
    mines: <Mines />,
    roll: <Roll />,
    'live-casino': <LiveCasino />,
  }
  const caseRouteMatch = pathname.match(/^\/cases\/([^/]+)$/)
  const casinoGameRouteMatch = pathname.match(/^\/live-casino\/play\/([^/]+)\/([^/]+)$/)
  const page = caseRouteMatch
    ? <Cases caseSlug={caseRouteMatch[1]} />
    : casinoGameRouteMatch
      ? (
          <LiveCasinoGame
            providerId={decodeRouteSegment(casinoGameRouteMatch[1])}
            gameId={decodeRouteSegment(casinoGameRouteMatch[2])}
          />
        )
      : pages[routeName]

  useEffect(() => {
    if (!page) navigate('/', { replace: true })
  }, [navigate, page])

  return <Layout>{page || <Home />}</Layout>
}

export default function App() {
  const bootstrap = useAuth((s) => s.bootstrap)

  // Restore session + connect socket once on mount.
  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
