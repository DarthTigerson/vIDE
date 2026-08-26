import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: { entry: { index: 'electron/main.ts', todoMcpServer: 'electron/mcp/todoMcpServer.ts', notesMcpServer: 'electron/mcp/notesMcpServer.ts' } }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: { entry: { index: 'electron/preload.ts' } }
    }
  },
  renderer: {
    root: resolve(__dirname),
    resolve: {
      alias: { '@': resolve(__dirname, 'src') }
    },
    server: {
      port: 55055,
      strictPort: true
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'index.html')
      }
    }
  }
})
