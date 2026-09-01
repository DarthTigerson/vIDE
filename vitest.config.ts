import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') }
  },
  test: {
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [
      ['src/components/**/__tests__/**/*.test.tsx', 'jsdom'],
      ['src/__tests__/**/*.test.tsx', 'jsdom'],
      ['src/hooks/__tests__/**/*.test.tsx', 'jsdom'],
    ],
    include: [
      'src/stores/__tests__/**/*.test.ts',
      'src/lib/__tests__/**/*.test.ts',
      'src/components/**/__tests__/**/*.test.ts',
      'src/components/**/__tests__/**/*.test.tsx',
      'src/hooks/__tests__/**/*.test.ts',
      'src/hooks/__tests__/**/*.test.tsx',
      'src/__tests__/**/*.test.ts',
      'src/__tests__/**/*.test.tsx',
      'electron/__tests__/**/*.test.ts',
      'electron/**/__tests__/**/*.test.ts'
    ],
    setupFiles: ['./vitest.setup.ts']
  }
})
