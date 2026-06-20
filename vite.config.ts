import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const isGithubPages = process.env.GITHUB_ACTIONS === 'true'

// GitHub Pages project sites are served from /<repo>/.
// Local dev and other hosts keep root-relative routing.
export default defineConfig({
  base: isGithubPages ? '/CRM/' : '/',
  plugins: [react()],
})
