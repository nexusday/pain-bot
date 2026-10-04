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

function resultadoCorrecto(resultado) {
  if (resultado.error) return false
  return resultado.status === 0
}

function main() {
  if (probarSqlite()) return

  console.warn('[sqlite3] El binario nativo no corresponde a este contenedor; reconstruyéndolo aquí...')
  const prebuild = join(root, 'node_modules', 'prebuild-install', 'bin.js')
  const nodeGyp = join(root, 'node_modules', 'node-gyp', 'bin', 'node-gyp.js')
  const prebuilt = ejecutarNode([prebuild, '-r', 'napi'])
  if (!resultadoCorrecto(prebuilt)) {
    console.warn('[sqlite3] No se pudo descargar un binario precompilado; compilando desde código fuente...')
    const compilado = ejecutarNode([nodeGyp, 'rebuild'])
    if (!resultadoCorrecto(compilado)) {
      if (compilado.error) throw compilado.error
      throw new Error(`node-gyp terminó con código ${compilado.status ?? 'desconocido'}.`)
    }
  }
  if (!probarSqlite()) {
    throw new Error('sqlite3 sigue sin cargar después de instalar o compilar su binario para esta plataforma.')
  }
}

try {
  main()
} catch (error) {
  console.error('[sqlite3] No se pudo preparar SQLite para este contenedor:', error?.message || error)
  process.exitCode = 1
}
