import { createRequire } from 'module'
import { existsSync, mkdirSync, chmodSync, createWriteStream, copyFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { pipeline } from 'stream/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'

const require = createRequire(import.meta.url)
const { create, constants } = require('youtube-dl-exec')
const execFileAsync = promisify(execFile)

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const binLocal = join(root, 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')

let instancia = null
let asegurando = null

function urlBinarioOficial() {
  if (process.platform === 'win32') {
    return 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
  }
  return 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp'
}

async function probarComando(cmd) {
  try {
    await execFileAsync(cmd, ['--version'], { timeout: 8000, windowsHide: true })
    return true
  } catch {
    return false
  }
}

async function descargarBinario(destino) {
  mkdirSync(dirname(destino), { recursive: true })
  const res = await fetch(urlBinarioOficial(), { redirect: 'follow' })
  if (!res.ok || !res.body) {
    throw new Error(`No se pudo descargar yt-dlp (HTTP ${res.status})`)
  }
  await pipeline(res.body, createWriteStream(destino))
  try { chmodSync(destino, 0o755) } catch {}
}

async function resolverYtDlp() {
  if (instancia) return instancia
  if (asegurando) return asegurando

  asegurando = (async () => {
    const candidatos = [
      'yt-dlp',
      'yt-dlp.exe',
      binLocal,
      constants.YOUTUBE_DL_PATH,
    ]

    for (const cmd of candidatos) {
      if (await probarComando(cmd)) {
        instancia = create(cmd)
        return instancia
      }
    }

    await descargarBinario(binLocal)
    try {
      mkdirSync(dirname(constants.YOUTUBE_DL_PATH), { recursive: true })
      copyFileSync(binLocal, constants.YOUTUBE_DL_PATH)
      chmodSync(constants.YOUTUBE_DL_PATH, 0o755)
    } catch {}

    if (!(await probarComando(binLocal))) {
      throw new Error('yt-dlp no está disponible en el servidor.')
    }

    instancia = create(binLocal)
    return instancia
  })()

  try {
    return await asegurando
  } finally {
    asegurando = null
  }
}

export async function ejecutarYtDlp(url, flags = {}, opts = {}) {
  const ytdl = await resolverYtDlp()
  return ytdl(url, flags, opts)
}

export { resolverYtDlp }
