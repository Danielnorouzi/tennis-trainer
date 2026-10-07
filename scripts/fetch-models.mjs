// Optional: download the pose models into public/mediapipe/models so tracking works fully offline.
// Without this, models load from Google's public MediaPipe model bucket on first use.
//   npm run fetch-models
import { mkdir, writeFile } from 'node:fs/promises'

const MODELS = {
  'pose_landmarker_full.task':
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task',
  'pose_landmarker_lite.task':
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
}

const dir = new URL('../public/mediapipe/models/', import.meta.url)
await mkdir(dir, { recursive: true })
for (const [file, url] of Object.entries(MODELS)) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`)
  const data = Buffer.from(await res.arrayBuffer())
  await writeFile(new URL(file, dir), data)
  console.log(`saved public/mediapipe/models/${file} (${(data.length / 1e6).toFixed(1)} MB)`)
}
