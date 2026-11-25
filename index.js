console.log('⧉ Inicializando Pain...')

import { mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { ArchivoSqliteCompartido } from './lib/db-sqlite.js'
import { acquireSingleInstance } from './lib/single-instance.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Caché de compilación de módulos (Node 22.8+). Los procesos hijos heredan
// NODE_COMPILE_CACHE, así que el parseo de plugins se reutiliza al reiniciar.
try {
  const rutaCache = join(__dirname, 'storage', '.compile-cache')
  mkdirSync(rutaCache, { recursive: true })
  if (!process.env.NODE_COMPILE_CACHE) process.env.NODE_COMPILE_CACHE = rutaCache
  const { enableCompileCache } = await import('node:module')
  enableCompileCache?.(rutaCache)
} catch {}

try {
  const { default: cfonts } = await import('cfonts')
  cfonts.say('PAIN\nBOT', { font: 'block', align: 'center', gradient: ['cyan', 'blue'] })
  cfonts.say('WhatsApp Multi-Bot-Official', { font: 'simple', align: 'center', gradient: ['blue', 'white'] })
} catch {
  console.log('PAIN BOT')
}

await import('./config.js')
try {
  acquireSingleInstance(join(__dirname, 'storage'), 'supervisor')
} catch (error) {
  console.error(`[supervisor] ${error.message}`)
  process.exit(1)
}

console.log('Verificando base compartida antes de iniciar los procesos...')
const verificadorDb = new ArchivoSqliteCompartido(
  join(__dirname, 'storage', 'databases', 'database.sqlite'),
  join(__dirname, 'storage', 'databases', 'database.json')
)
await verificadorDb.read()
await verificadorDb.close()
console.log('Base compartida lista.')

// Un único proceso `main.js` hospeda el bot principal y todos los sub-bots.
// Los plugins se cargan una vez y no hay coordinación entre procesos.
const { startSingleSupervisor } = await import('./lib/supervisor-single.js')
await startSingleSupervisor()
