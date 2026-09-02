import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const PROJECT_TMP = join(__dirname, '../tmp')

const DEFAULT_MAX_AGE_MS = 3 * 60 * 1000
const DEFAULT_INTERVAL_MS = 45 * 1000

export function initProjectTmp() {
  if (!existsSync(PROJECT_TMP)) {
    mkdirSync(PROJECT_TMP, { recursive: true })
  }
  process.env.TMPDIR = PROJECT_TMP
  process.env.TEMP = PROJECT_TMP
  process.env.TMP = PROJECT_TMP
  return PROJECT_TMP
}

export function getTmpDirs() {
  const dirs = new Set([PROJECT_TMP])
  const systemTmp = tmpdir()
  if (systemTmp) dirs.add(systemTmp)
  return [...dirs]
}

export function cleanupTmpFiles(options = {}) {
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS
  const dirs = options.dirs ?? getTmpDirs()
  const now = Date.now()
  let cleaned = 0

  for (const dir of dirs) {
    if (!existsSync(dir)) continue

    let entries = []
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }

    for (const entry of entries) {
      const filePath = join(dir, entry)
      try {
        const stats = statSync(filePath)
        if (!stats.isFile()) continue
        if (now - stats.mtimeMs < maxAgeMs) continue
        unlinkSync(filePath)
        cleaned++
      } catch {}
    }
  }

  return cleaned
}

export function startTmpCleanupInterval(options = {}) {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS
  const verbose = options.verbose ?? false

  return setInterval(() => {
    const cleaned = cleanupTmpFiles({ maxAgeMs })
    if (verbose && cleaned > 0) {
      console.log(`[TMP] ${cleaned} archivo(s) temporal(es) eliminado(s).`)
    }
  }, intervalMs)
}

initProjectTmp()
