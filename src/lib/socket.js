import { io } from 'socket.io-client'

const DEFAULT_SERVER_URL = 'http://localhost:4000'
const CONFIGURED_SERVER_URL = (import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_SERVER_URL || '').replace(/\/+$/,'')

let socket = null

export function getSocket() {
  return socket
}

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
    // Start with HTTP polling so restrictive mobile networks can connect, then
    // let Socket.IO upgrade to WebSocket when it is available.
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  })
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

/** Reconnect the existing socket so its handshake picks up a changed session cookie. */
export function refreshSocketAuthentication() {
  if (!socket) return connectSocket()
  socket.disconnect()
  socket.connect()
  return socket
}

import { useEffect, useState } from 'react'

export function useSocket() {
  const [socketInstance, setSocketInstance] = useState(socket)

  useEffect(() => {
    if (!socket) {
      const newSocket = connectSocket()
      setSocketInstance(newSocket)
    } else {
      setSocketInstance(socket)
    }

    const handleConnect = () => {
      setSocketInstance(socket)
    }

    const handleDisconnect = () => {
      setSocketInstance(null)
    }

    if (socket) {
      socket.on('connect', handleConnect)
      socket.on('disconnect', handleDisconnect)
    }

    return () => {
      if (socket) {
        socket.off('connect', handleConnect)
        socket.off('disconnect', handleDisconnect)
      }
    }
  }, [])

  return socketInstance
}
