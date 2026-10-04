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

function ejecutarNode(argumentos, cwd = root) {
  return spawnSync(process.execPath, argumentos, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  })
}

function probarSqlite() {
  const resultado = ejecutarNode(['-e', probe])
  if (resultado.status === 0) {
    const salida = resultado.stdout.trim()
    if (salida) console.log(salida)
    return { ok: true }
  }
  const diagnostico = `${resultado.stderr || ''}\n${resultado.error?.message || ''}`
    .split(/\r?\n/)
    .find((linea) => /Error:|GLIBC_|invalid ELF|ERR_DLOPEN_FAILED/i.test(linea))
    ?.trim()
  return { ok: false, diagnostico: diagnostico || 'No se pudo cargar el módulo nativo.' }
}

function resultadoCorrecto(resultado) {
  return !resultado.error && resultado.status === 0
}

function main() {
  const inicial = probarSqlite()
  if (inicial.ok) return

  console.warn(`[sqlite3] El binario nativo no funciona en este contenedor: ${inicial.diagnostico}`)
  const sqlitePackage = join(root, 'node_modules', 'sqlite3')
  const prebuild = join(root, 'node_modules', 'prebuild-install', 'bin.js')
  const nodeGyp = join(root, 'node_modules', 'node-gyp', 'bin', 'node-gyp.js')
  console.log('[sqlite3] Probando un binario precompilado para este sistema...')
  const prebuildResult = ejecutarNode([prebuild, '-r', 'napi'], sqlitePackage)
  if (!resultadoCorrecto(prebuildResult)) {
    const diagnostico = prebuildResult.stderr?.trim() || prebuildResult.error?.message
    if (diagnostico) console.warn(`[sqlite3] No se pudo usar el precompilado: ${diagnostico.split(/\r?\n/)[0]}`)
  }
  const precompilado = probarSqlite()
  if (precompilado.ok) return

  console.warn(
    `[sqlite3] El binario precompilado no es compatible (${precompilado.diagnostico}); ` +
    'se compilará SQLite desde el código fuente del contenedor.'
  )
  const compilado = ejecutarNode([nodeGyp, 'rebuild'], sqlitePackage)
  if (!resultadoCorrecto(compilado)) {
    if (compilado.error) throw compilado.error
    throw new Error(`node-gyp terminó con código ${compilado.status ?? 'desconocido'}.`)
  }

  const verificado = probarSqlite()
  if (!verificado.ok) {
    throw new Error(
      `sqlite3 sigue sin funcionar después de compilarlo para este contenedor: ${verificado.diagnostico}`
    )
  }
}

try {
  main()
} catch (error) {
  console.error('[sqlite3] No se pudo preparar SQLite para este contenedor:', error?.message || error)
  process.exitCode = 1
}
