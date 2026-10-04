import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const probe = `
const sqlite3 = require('sqlite3')
const db = new sqlite3.Database(':memory:', (error) => {
  if (error) throw error
  db.get('SELECT sqlite_version() AS version', (queryError, row) => {
    if (queryError) throw queryError
    console.log('[sqlite3] nativo listo; SQLite ' + row.version)
    db.close((closeError) => {
      if (closeError) throw closeError
    })
  })
})
`

function ejecutarNode(argumentos) {
  return spawnSync(process.execPath, argumentos, {
    cwd: root,
    stdio: 'inherit',
  })
}

function probarSqlite() {
  const resultado = ejecutarNode(['-e', probe])
  return resultado.status === 0
}

function main() {
  if (probarSqlite()) return

  console.warn('[sqlite3] El binario nativo no corresponde a este contenedor; reconstruyéndolo aquí...')
  const argumentos = [
    'rebuild',
    'sqlite3',
    '--foreground-scripts',
    '--no-audit',
    '--no-fund',
  ]
  const npmExecPath = process.env.npm_execpath
  if (!npmExecPath && process.platform === 'win32') {
    throw new Error('Ejecuta el bot con "npm start" para poder reconstruir sqlite3 automáticamente.')
  }
  const rebuild = npmExecPath
    ? ejecutarNode([npmExecPath, ...argumentos])
    : spawnSync('npm', argumentos, { cwd: root, stdio: 'inherit' })
  if (rebuild.error) throw rebuild.error
  if (rebuild.status !== 0) {
    throw new Error(`npm rebuild sqlite3 terminó con código ${rebuild.status ?? 'desconocido'}.`)
  }
  if (!probarSqlite()) {
    throw new Error('sqlite3 sigue sin cargar después de reconstruirlo en esta plataforma.')
  }
}

try {
  main()
} catch (error) {
  console.error('[sqlite3] No se pudo preparar SQLite para este contenedor:', error?.message || error)
  process.exitCode = 1
}
