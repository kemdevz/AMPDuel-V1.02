import { useEffect, useState } from 'react'
import { BrowserRouter, useNavigate, usePathname } from './lib/router'
import Layout from './components/Layout'
import LoadingScreen from './components/LoadingScreen'
import Home from './pages/Home'
import Coinflip from './pages/Coinflip'
import SummerEvent from './pages/SummerEvent'
import Cases from './pages/Cases'
import Jackpot from './pages/Jackpot'
import Placeholder from './pages/Placeholder'
import { useAuth } from './store/auth'

function AppRoutes() {
  const pathname = usePathname()
  const navigate = useNavigate()
  const routeName = pathname.replace(/^\/+|\/+$/g, '')
  const pages = {
    '': <Home />,
    coinflip: <Coinflip />,
    events: <SummerEvent />,
    cases: <Cases />,
    jackpot: <Jackpot />,
  }
  const page = pages[routeName]

  useEffect(() => {
    if (!page) navigate('/', { replace: true })
  }, [navigate, page])

  return <Layout>{page || <Home />}</Layout>
}

export default function App() {
  const [isLoading, setIsLoading] = useState(true)
  const bootstrap = useAuth((s) => s.bootstrap)

  // Restore session + connect socket once on mount.
  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsLoading(false)
    }, 2000)

    return () => window.clearTimeout(timer)
  }, [])

  return (
    <BrowserRouter>
      {isLoading ? <LoadingScreen /> : null}
      <AppRoutes />
    </BrowserRouter>
  )
}
