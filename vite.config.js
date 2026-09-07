import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Served from https://gerardcrabix.github.io/TE--Analytics---LLM/ (a GitHub
  // Pages project site, not the domain root) — asset URLs need this prefix.
  base: '/TE--Analytics---LLM/',
  plugins: [react()],
})
