import { resolve } from 'path'
import { readFileSync } from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const { version } = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')) as { version: string }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: {
          index: 'electron/main.ts',
          todoMcpServer: 'electron/mcp/todoMcpServer.ts',
          notesMcpServer: 'electron/mcp/notesMcpServer.ts',
          browserMcpServer: 'electron/mcp/browserMcpServer.ts',
          scriptsMcpServer: 'electron/mcp/scriptsMcpServer.ts',
          searchMcpServer: 'electron/mcp/searchMcpServer.ts',
          todoEnforcerHookMain: 'electron/mcp/todoEnforcerHookMain.ts',
        },
      }
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
    // The running version, for the Update page's "You have vX" (VIDE-142).
    define: { __APP_VERSION__: JSON.stringify(version) },
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'index.html')
      }
    }
  }
})
