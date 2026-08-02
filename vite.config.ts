import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// ISO date of the latest git commit (author/committer date of HEAD).
// Evaluated at build time — locally and in CI (checkout keeps HEAD).
function gitCommitDate(): string {
  try {
    return execSync('git log -1 --format=%cI').toString().trim()
  } catch {
    return ''
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Repo name — required so asset URLs resolve under
  // https://heraphim.github.io/find-trends/
  base: '/find-trends/',
  define: {
    // Last commit date, and the moment this bundle was built. On GitHub
    // Pages the build runs inside the deploy job, so build time ≈ deploy time.
    __COMMIT_DATE__: JSON.stringify(gitCommitDate()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [react(), tailwindcss()],
})
