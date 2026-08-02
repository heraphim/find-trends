import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Repo name — required so asset URLs resolve under
  // https://heraphim.github.io/find-trends/
  base: '/find-trends/',
  plugins: [react()],
})
