import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'

// Node 25 ships an experimental Web Storage global that shadows jsdom's
// localStorage (every store then fails with "localStorage.getItem is not a
// function"). Turn it off for the test workers, but only where Node knows the
// flag: older versions reject an unknown --no-* option at startup.
const execArgv = process.allowedNodeEnvironmentFlags.has('--no-experimental-webstorage')
  ? ['--no-experimental-webstorage']
  : []

const include = [
  'src/apps/__tests__/**/*.test.ts',
  'src/apps/__tests__/**/*.test.tsx',
  'src/stores/__tests__/**/*.test.ts',
  'src/lib/__tests__/**/*.test.ts',
  'src/lib/**/__tests__/**/*.test.ts',
  'src/components/**/__tests__/**/*.test.ts',
  'src/components/**/__tests__/**/*.test.tsx',
  'src/hooks/__tests__/**/*.test.ts',
  'src/hooks/__tests__/**/*.test.tsx',
  'src/__tests__/**/*.test.ts',
  'src/__tests__/**/*.test.tsx',
  'electron/__tests__/**/*.test.ts',
  'electron/**/__tests__/**/*.test.ts'
]

// Files that need a DOM. Everything else in `include` runs in plain node.
// (Replaces vitest 2's `environmentMatchGlobs`, removed in vitest 4.)
const jsdomFiles = [
  'src/components/**/__tests__/**/*.test.tsx',
  'src/__tests__/**/*.test.tsx',
  'src/hooks/__tests__/**/*.test.tsx',
  // createMobileApi runs only in a real browser (window.location.reload
  // on disconnect) — jsdom so tests can exercise that path.
  'src/lib/mobileApiShim/__tests__/**/*.test.ts',
  // attachCurrentLineBlame renders via a Monaco content widget's DOM node
  // (document.createElement), not JSX, so it stays a .test.ts — but still
  // needs jsdom's `document` global.
  'src/components/Editor/__tests__/currentLineBlame.test.ts',
]

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') }
  },
  test: {
    globals: true,
    execArgv,
    setupFiles: ['./vitest.setup.ts'],
    // Lets a test import the real monaco-editor (ESM with CSS imports) — see
    // src/lib/__tests__/editorFindController.monaco.test.ts
    server: { deps: { inline: [/monaco-editor/] } },
    projects: [
      {
        extends: true,
        test: { name: 'node', environment: 'node', include, exclude: jsdomFiles }
      },
      {
        extends: true,
        test: { name: 'jsdom', environment: 'jsdom', include: jsdomFiles }
      }
    ]
  }
})
