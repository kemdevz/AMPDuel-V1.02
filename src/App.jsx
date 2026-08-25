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
    '': <Coinflip />,
    coinflip: <Coinflip />,
    mines: <Mines />,
  }
  const page = pages[routeName]

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
