import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'api-env-middleware',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/api/env') {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({
              VITE_BACKEND_PORT: Number(process.env.VITE_BACKEND_PORT) || 8080
            }))
            return
          }
          next()
        })
      }
    }
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // build: { // ONLY USE THIS TO CHECK IN LOCAL
  //   outDir: path.resolve(__dirname, "../gateway/dist"),
  //   emptyOutDir: true,
  // },
})