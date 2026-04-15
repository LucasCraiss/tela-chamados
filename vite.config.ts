import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/

function normalizeOctadeskHost(raw: string | undefined): string {
  let h = (raw || 'o224871-e68.api002.octadesk.services').trim()
  h = h.replace(/^https?:\/\//i, '')
  h = h.split('/')[0] || 'o224871-e68.api002.octadesk.services'
  return h
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const octaHost = normalizeOctadeskHost(env.OCTADESK_API_HOST)
  /** Chave da API Octadesk (header `X-API-KEY`). Só variáveis de servidor — não use URL/host como chave. */

  const octaApiKey = (
    env.OCTADESK_X_API_KEY ||
    env.OCTADESK_API_TOKEN ||
    '').trim()
  /** E-mail de um agente cadastrado no Octadesk (header `octa-agent-email`). */
  const octaAgentEmail = (env.OCTADESK_AGENT_EMAIL || '').trim()
  const octadeskProxyReady = Boolean(octaApiKey && octaAgentEmail)


  return {
    plugins: [
      tailwindcss(),
      vue(),
      vueDevTools(),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      },
    },

    server: {
      proxy: octadeskProxyReady
        ? {
            '/octadesk-api': {
              target: `https://${octaHost}`,
              changeOrigin: true,
              secure: true,
              rewrite: (path) => path.replace(/^\/octadesk-api/, ''),
              configure: (proxy) => {
                proxy.on('proxyReq', (proxyReq) => {
                  proxyReq.setHeader('X-API-KEY', octaApiKey)
                  proxyReq.setHeader('octa-agent-email', octaAgentEmail)
                  proxyReq.setHeader('Content-Type', 'application/json')
                  proxyReq.setHeader('Accept', 'application/json')
                  proxyReq.setHeader('Authorization', `Bearer ${octaApiKey}`)
                  
                })
              },
            },
          }
        : undefined,
    },
  }
})


