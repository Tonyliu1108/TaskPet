import { cp, mkdir, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(repositoryRoot, 'node_modules/@mediapipe/tasks-vision/wasm')
const destination = resolve(repositoryRoot, 'public/mediapipe')

await rm(destination, { recursive: true, force: true })
await mkdir(dirname(destination), { recursive: true })
await cp(source, destination, { recursive: true })
console.log('Copied MediaPipe browser runtime to public/mediapipe')
