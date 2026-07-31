import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const RouterContext = createContext(null)

function normalizePath(value) {
  const rawPath = String(value || '/')
  if (!rawPath.startsWith('/') || rawPath.includes('\\') || rawPath.startsWith('//')) return '/'
  const pathOnly = rawPath.split(/[?#]/, 1)[0] || '/'
  return pathOnly.length > 1 ? pathOnly.replace(/\/+$/, '') : '/'
}

export function BrowserRouter({ children }) {
  const [pathname, setPathname] = useState(() => normalizePath(window.location.pathname))

  useEffect(() => {
    const handlePopState = () => setPathname(normalizePath(window.location.pathname))
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const value = useMemo(() => ({
    pathname,
    navigate(to, { replace = false } = {}) {
      const nextPath = normalizePath(to)
      if (nextPath === pathname) return
      window.history[replace ? 'replaceState' : 'pushState']({}, '', nextPath)
      setPathname(nextPath)
    },
  }), [pathname])

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

export function usePathname() {
  const router = useContext(RouterContext)
  if (!router) throw new Error('usePathname must be used inside BrowserRouter.')
  return router.pathname
}

export function useNavigate() {
  const router = useContext(RouterContext)
  if (!router) throw new Error('useNavigate must be used inside BrowserRouter.')
  return router.navigate
}

export function Link({ to = '/', replace = false, onClick, children, ...props }) {
  const navigate = useNavigate()
  const safePath = normalizePath(to)

  const handleClick = (event) => {
    onClick?.(event)
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return
    }
    event.preventDefault()
    navigate(safePath, { replace })
  }

  return (
    <a {...props} href={safePath} onClick={handleClick}>
      {children}
    </a>
  )
}

export function NavLink({ to = '/', end = false, className, style, children, ...props }) {
  const pathname = usePathname()
  const safePath = normalizePath(to)
  const isActive = pathname === safePath ||
    (!end && safePath !== '/' && pathname.startsWith(`${safePath}/`))
  const state = { isActive }

  return (
    <Link
      {...props}
      to={safePath}
      className={typeof className === 'function' ? className(state) : className}
      style={typeof style === 'function' ? style(state) : style}
    >
      {typeof children === 'function' ? children(state) : children}
    </Link>
  )
}
