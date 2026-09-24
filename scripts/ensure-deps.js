/**
 * Al arrancar: detecta yt-dlp / ffmpeg y completa lo que falte.
 * En Linux/Ptero (Ubuntu) usa scripts/ensure-deps.sh.
 * En Windows usa la misma lógica en Node.
 */
import { spawnSync } from 'child_process'
import { createWriteStream, existsSync, mkdirSync, chmodSync, copyFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { pipeline } from 'stream/promises'
import { promisify } from 'util'
import { execFile } from 'child_process'

const execFileAsync = promisify(execFile)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const binDir = join(root, 'bin')
const ytdlpLocal = join(binDir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
const ytdlpNpm = join(
  root,
  'node_modules',
  'youtube-dl-exec',
  'bin',
  process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
)

function log(msg) {
  console.log(`[deps] ${msg}`)
}

async function comandoOk(cmd, args = ['--version']) {
  try {
    await execFileAsync(cmd, args, { timeout: 10000, windowsHide: true })
    return true
  } catch {
    return false
  }
}

function urlYtDlp() {
  return process.platform === 'win32'
    ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
    : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp'
}

async function descargarYtDlp(destino) {
  mkdirSync(dirname(destino), { recursive: true })
  const res = await fetch(urlYtDlp(), { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
  const tmp = `${destino}.part`
  await pipeline(res.body, createWriteStream(tmp))
  try {
    const { renameSync, unlinkSync } = await import('fs')
    try { unlinkSync(destino) } catch {}
    renameSync(tmp, destino)
  } catch {
    copyFileSync(tmp, destino)
  }
  try { chmodSync(destino, 0o755) } catch {}
}

async function ensureNode() {
  log(`comprobando dependencias (${process.platform}/${process.arch})...`)

  if (await comandoOk('ffmpeg', ['-version'])) {
    log('✓ ffmpeg')
  } else {
    log('✗ ffmpeg no encontrado (stickers/audio pueden fallar)')
  }

  let ytdlp = null
  for (const c of ['yt-dlp', 'yt-dlp.exe', ytdlpLocal, ytdlpNpm]) {
    if (await comandoOk(c)) {
      ytdlp = c
      break
    }
  }

  if (ytdlp) {
    log(`✓ yt-dlp (${ytdlp})`)
  } else {
    log('✗ yt-dlp — descargando binario oficial...')
    try {
      await descargarYtDlp(ytdlpLocal)
      if (await comandoOk(ytdlpLocal)) {
        log(`✓ yt-dlp en ${ytdlpLocal}`)
        ytdlp = ytdlpLocal
        try {
          mkdirSync(dirname(ytdlpNpm), { recursive: true })
          copyFileSync(ytdlpLocal, ytdlpNpm)
          chmodSync(ytdlpNpm, 0o755)
        } catch {}
      } else {
        log('! yt-dlp no ejecuta tras descargar')
      }
    } catch (e) {
      log(`! no se pudo descargar yt-dlp: ${e.message || e}`)
    }
  }

  if (!existsSync(join(root, 'node_modules', 'youtube-dl-exec'))) {
    log('✗ falta npm youtube-dl-exec — instalando...')
    const r = spawnSync('npm', ['install', 'youtube-dl-exec', '--no-fund', '--no-audit'], {
      cwd: root,
      stdio: 'inherit',
      shell: true,
    })
    if (r.status === 0) log('✓ youtube-dl-exec')
    else log('! npm install youtube-dl-exec falló')
  } else {
    log('✓ npm youtube-dl-exec')
    if (ytdlp && ytdlp !== ytdlpNpm && !existsSync(ytdlpNpm)) {
      try {
        mkdirSync(dirname(ytdlpNpm), { recursive: true })
        copyFileSync(typeof ytdlp === 'string' && existsSync(ytdlp) ? ytdlp : ytdlpLocal, ytdlpNpm)
        chmodSync(ytdlpNpm, 0o755)
      } catch {}
    }
  }

  log('listo')
}

function runBash() {
  const sh = join(root, 'scripts', 'ensure-deps.sh')
  if (!existsSync(sh)) return false
  try { chmodSync(sh, 0o755) } catch {}
  const r = spawnSync('bash', [sh], { cwd: root, stdio: 'inherit', env: process.env })
  return r.status === 0 || r.status === null
}

async function main() {
  if (process.platform !== 'win32') {
    const ok = runBash()
    if (ok) return
    log('bash falló o no disponible — usando fallback Node')
  }
  await ensureNode()
}

main().catch((e) => {
  console.error('[deps] error:', e?.message || e)
})
