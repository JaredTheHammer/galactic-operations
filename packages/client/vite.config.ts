import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/galactic-operations/' : '/',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  resolve: {
    alias: {
      '@engine': path.resolve(__dirname, '../engine/src'),
      '@data': path.resolve(__dirname, '../../data'),
    }
  }
}))
