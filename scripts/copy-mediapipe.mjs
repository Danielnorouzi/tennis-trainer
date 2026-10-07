// Copies the MediaPipe WASM runtime from node_modules into public/mediapipe/wasm so pose tracking
// works without a CDN (and can be cached by the service worker for offline practice).
// Runs automatically before `npm run dev` and `npm run build`.
import { cp, mkdir, stat } from 'node:fs/promises'

const src = new URL('../node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url)
const dest = new URL('../public/mediapipe/wasm/', import.meta.url)

try {
  await stat(src)
} catch {
  console.warn('[copy-mediapipe] @mediapipe/tasks-vision not installed; skipping (the CDN fallback will be used).')
  process.exit(0)
}
await mkdir(dest, { recursive: true })
await cp(src, dest, { recursive: true })
console.log('[copy-mediapipe] WASM runtime copied to public/mediapipe/wasm')
