import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The backend port is read from the SAME root .env the backend uses, so the two can never
 * drift apart. Set API_PORT there once and both follow it.
 */
export default defineConfig(({ mode }) => {
  // envDir '..' points at the project root, where .env lives.
  const env = loadEnv(mode, '..', '')
  const apiPort = env.API_PORT || '8000'
  const target = `http://127.0.0.1:${apiPort}`

  console.log(`[vite] proxying /api and /ws to ${target}`)

  return {
    plugins: [react()],
    envDir: '..',
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        // Single-frame detection.
        '/api': { target, changeOrigin: true },
        // Continuous streaming (Phase 5). ws:true upgrades the connection.
        '/ws': { target, ws: true, changeOrigin: true },
      },
    },
  }
})
