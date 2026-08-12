import { useEffect } from 'react'
import { BrowserRouter, useNavigate, usePathname } from './lib/router'
import Layout from './components/Layout'
import Coinflip from './pages/Coinflip'
import SummerEvent from './pages/SummerEvent'
import Cases from './pages/Cases'
import CaseBattle from './pages/CaseBattle'
import Jackpot from './pages/Jackpot'
import Mines from './pages/Mines'
import Roll from './pages/Roll'
import Upgrader from './pages/Upgrader'
import LiveCasino from './pages/LiveCasino'
import LiveCasinoGame from './pages/LiveCasinoGame'
import Blackjack from './pages/Blackjack'
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
    '': <Coinflip />,
    battles: <CaseBattle />,
    coinflip: <Coinflip />,
    events: <SummerEvent />,
    cases: <Cases />,
    jackpot: <Jackpot />,
    mines: <Mines />,
    roll: <Roll />,
    blackjack: <Blackjack />,
    upgrader: <Upgrader />,
    'live-casino': <LiveCasino />,
  }
  const caseRouteMatch = pathname.match(/^\/cases\/([^/]+)$/)
  const battleRouteMatch = pathname.match(/^\/battles\/([^/]+)$/)
  const casinoGameRouteMatch = pathname.match(/^\/live-casino\/play\/([^/]+)\/([^/]+)$/)
  const page = caseRouteMatch
    ? <Cases caseSlug={caseRouteMatch[1]} />
    : battleRouteMatch
      ? <CaseBattle battleId={decodeRouteSegment(battleRouteMatch[1])} />
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

  return <Layout>{page || <Coinflip />}</Layout>
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
