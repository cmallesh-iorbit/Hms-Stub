import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The backend is a DIFFERENT ORIGIN, and it rejects browser CORS preflights with
 * `403 Invalid CORS request` (Spring Security's CORS filter has no CorsConfigurationSource
 * bean -- see README section 10). A browser therefore cannot call it directly at all.
 *
 * The dev proxy is what makes this app work: every request goes to our own origin
 * (localhost:5173) and Vite forwards it to the backend from Node, server-to-server,
 * where CORS does not apply. Application code only ever uses relative paths, so the
 * server hostname lives here and nowhere else.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_PROXY_TARGET || 'http://139.59.46.163:8085'

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/auth': { target, changeOrigin: true },
        '/fhir': { target, changeOrigin: true },
      },
    },
  }
})
