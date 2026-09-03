import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Content-Security-Policy for the served SPA. Every directive here is load
// bearing for something this app does, so the reasons are recorded:
//
//   script-src 'self'    no inline or third-party script. Google Sign-In needs
//                        https://accounts.google.com added when it is enabled;
//                        the air-gapped install cannot reach it anyway.
//   style-src  'unsafe-inline'  the editor and the risk overlay set element
//                        styles directly. Removing this needs those rewritten
//                        to classes first.
//   img-src/frame-src blob:  the original contract document is fetched with
//                        auth and handed to the viewer as an object URL.
//   worker-src blob:     pdf.js runs its worker, which Vite emits as a blob.
//   object-src 'none' + frame-ancestors 'none'  no plugins, no framing.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob:",
  "worker-src 'self' blob:",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
  // `vite preview` serves the built bundle. The browser E2E specs run against
  // this rather than the dev server on purpose: the failures they exist to
  // catch were build artefacts (a worker emitted as .mjs that the server had
  // no MIME type for), and the dev server cannot reproduce them.
  preview: {
    port: 4173,
    proxy: {
      '/api': 'http://localhost:8000',
    },
    // The same Content-Security-Policy nginx serves in production (see
    // docs/DEPLOYMENT.md). Set here so the browser E2E specs run under it and
    // a policy that breaks the app fails CI rather than the deployment — a CSP
    // is only safe to add if something proves the app still works beneath it.
    headers: { 'Content-Security-Policy': CSP },
  },
  test: {
    // Unit tests live beside the code. e2e/ is Playwright — it imports
    // @playwright/test, which vitest cannot resolve, so it must not be
    // collected here.
    include: ['src/**/*.{test,spec}.{js,jsx}'],
  },
})
