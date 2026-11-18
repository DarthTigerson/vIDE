import { resolve } from 'path'
import { readFileSync } from 'fs'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const { version } = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')) as { version: string }

export default defineConfig({
  // main/preload: electron-vite 6 externalizes `dependencies` by default
  // (build.externalizeDeps, default true), replacing externalizeDepsPlugin().
  main: {
    build: {
      // chokidar 5+ is ESM-only. The main bundle is CJS, so leaving it external
      // would mean require(esm) at runtime — from inside app.asar once packaged.
      // Bundling it (and its one dep, readdirp) sidesteps that entirely.
      externalizeDeps: { exclude: ['chokidar'] },
      lib: {
        entry: {
          index: 'electron/main.ts',
          todoMcpServer: 'electron/mcp/todoMcpServer.ts',
          notesMcpServer: 'electron/mcp/notesMcpServer.ts',
          browserMcpServer: 'electron/mcp/browserMcpServer.ts',
          scriptsMcpServer: 'electron/mcp/scriptsMcpServer.ts',
          docsMcpServer: 'electron/mcp/docsMcpServer.ts',
          appsMcpServer: 'electron/mcp/appsMcpServer.ts',
          todoEnforcerHookMain: 'electron/mcp/todoEnforcerHookMain.ts',
        },
      }
    }
  },
  preload: {
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
    plugins: [react(), tailwindcss()],
    // The running version, for the Update page's "You have vX" (VIDE-142).
    define: { __APP_VERSION__: JSON.stringify(version) },
    build: {
      rolldownOptions: {
        input: resolve(__dirname, 'index.html')
      }
    }
  }
})
