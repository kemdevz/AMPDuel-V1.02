import { io } from 'socket.io-client'

const DEFAULT_SERVER_URL = 'http://localhost:4000'
const CONFIGURED_SERVER_URL = (import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_SERVER_URL || '').replace(/\/+$/,'')

let socket = null

/** Connect (idempotent). Safe to call after login or on app bootstrap. */
export function connectSocket() {
  if (socket) {
    if (!socket.connected) socket.connect()
    return socket
  }
  // Passing no URL makes Socket.IO use the page's origin. This is the correct
  // production default when Express and the frontend are served together.
  const url = import.meta.env.DEV ? DEFAULT_SERVER_URL : CONFIGURED_SERVER_URL || undefined
  socket = io(url, {
    withCredentials: true,
    autoConnect: true,
    // Production can run across more than one application instance. A polling
    // session can land on a different instance between requests and produce an
    // invalid-SID 400, so connect directly over one persistent WebSocket there.
    transports: import.meta.env.PROD ? ['websocket'] : ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  })
  return socket
}

/** Reconnect the existing socket so its handshake picks up a changed session cookie. */
export function refreshSocketAuthentication() {
  if (!socket) return connectSocket()
  socket.disconnect()
  socket.connect()
  return socket
}
