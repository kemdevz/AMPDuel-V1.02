import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // REST → Express
      '/api': {
        target: `http://127.0.0.1:${process.env.PORT || 4000}`,
        changeOrigin: true,
      },
      // Socket.IO (websocket upgrade)
      '/socket.io': {
        target: `http://127.0.0.1:${process.env.PORT || 4000}`,
        ws: true,
        changeOrigin: true,
      },
      '/roblox-users': {
        target: 'https://users.roblox.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/roblox-users/, ''),
      },
      '/roblox-thumbnails': {
        target: 'https://thumbnails.roblox.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/roblox-thumbnails/, ''),
      },
    },
  },
})
