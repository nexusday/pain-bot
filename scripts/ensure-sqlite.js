import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SQLITE3_VERSION = '5.1.7'
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

function ejecutarNode(argumentos, cwd = root, stdio = 'pipe') {
  return spawnSync(process.execPath, argumentos, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    stdio,
  })
}

function ejecutarNpm(argumentos) {
  const npmExecPath = process.env.npm_execpath
  if (npmExecPath) {
    return ejecutarNode([npmExecPath, ...argumentos], root, 'inherit')
  }
  if (process.platform === 'win32') {
    throw new Error('Ejecuta el bot mediante "npm start" para preparar sqlite3 automáticamente.')
  }
  return spawnSync('npm', argumentos, { cwd: root, stdio: 'inherit' })
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

function instalarVersionCompatible() {
  const packageJson = join(root, 'node_modules', 'sqlite3', 'package.json')
  let instalada
  try {
    instalada = JSON.parse(fs.readFileSync(packageJson, 'utf8')).version
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  if (instalada === SQLITE3_VERSION) return

  console.log(`[sqlite3] Instalando sqlite3@${SQLITE3_VERSION} para el runtime del servidor...`)
  const resultado = ejecutarNpm([
    'install',
    '--no-save',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    `sqlite3@${SQLITE3_VERSION}`,
  ])
  if (!resultadoCorrecto(resultado)) {
    if (resultado.error) throw resultado.error
    throw new Error(`No se pudo instalar sqlite3@${SQLITE3_VERSION} (código ${resultado.status ?? 'desconocido'}).`)
  }
}

function main() {
  instalarVersionCompatible()
  const inicial = probarSqlite()
  if (inicial.ok) return

  console.warn(`[sqlite3] El binario de sqlite3@${SQLITE3_VERSION} no funciona en este contenedor: ${inicial.diagnostico}`)
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
  fs.rmSync(join(sqlitePackage, 'build', 'Release', 'node_sqlite3.node'), { force: true })
  const compilado = ejecutarNode([nodeGyp, 'rebuild'], sqlitePackage, 'inherit')
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
