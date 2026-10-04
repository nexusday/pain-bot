/**
 * Prepara y valida sharp antes de cargar plugins.
 * Termux/Android usa WebAssembly; el resto instala el runtime nativo de su plataforma.
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sharpInstallPlan } from '../lib/sharp-install-plan.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pruebaSharp = `
import sharp from 'sharp'
await sharp({
  create: { width: 8, height: 8, channels: 3, background: { r: 0, g: 0, b: 0 } }
}).png().toBuffer()
`

function isTermuxOrAndroid() {
  return (
    process.platform === 'android' ||
    Boolean(process.env.TERMUX_VERSION) ||
    Boolean(process.env.PREFIX?.includes?.('com.termux')) ||
    Boolean(process.env.PREFIX?.includes?.('/data/data/com.termux'))
  )
}

async function canUseSharp() {
  const resultado = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', pruebaSharp],
    { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 }
  )
  if (!resultado.error && resultado.status === 0) return true

  const causa = resultado.stderr?.trim().split(/\r?\n/)[0] ||
    resultado.error?.message ||
    `proceso de prueba terminó con código ${resultado.status ?? 'desconocido'}`
  console.warn(`[sharp] No se pudo cargar/probar sharp: ${causa}`)
  return false
}

function ejecutarNpm(args, overridesEnv) {
  const npmArgs = args
  const env = {
    ...process.env,
    ...overridesEnv,
    npm_config_fund: 'false',
    npm_config_audit: 'false'
  }
  if (!Object.hasOwn(overridesEnv, 'npm_config_cpu')) delete env.npm_config_cpu

  const npmExecPath = process.env.npm_execpath
  const resultado = npmExecPath
    ? spawnSync(process.execPath, [npmExecPath, ...npmArgs], { cwd: root, stdio: 'inherit', env })
    : spawnSync('npm', npmArgs, {
        cwd: root,
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env
      })

  if (resultado.error) throw resultado.error
  return resultado.status === 0
}

async function main() {
  if (await canUseSharp()) {
    console.log('[sharp] listo')
    return
  }

  const android = isTermuxOrAndroid()
  const { args, env: npmEnv } = sharpInstallPlan(android)
  console.log(android
    ? '[sharp] instalando soporte WebAssembly para Termux/Android...'
    : `[sharp] instalando sharp y sus dependencias opcionales para ${process.platform}-${process.arch}...`
  )

  if (!ejecutarNpm(args, npmEnv)) {
    throw new Error('npm no pudo instalar sharp y sus dependencias para esta plataforma.')
  }

  if (!(await canUseSharp())) {
    throw new Error('sharp sigue sin funcionar después de instalar las dependencias de la plataforma.')
  }

  console.log(android ? '[sharp] WASM instalado y funcionando' : '[sharp] runtime instalado y funcionando')
}

main().catch((error) => {
  console.error('[sharp] No se pudo preparar la dependencia:', error?.message || error)
  process.exitCode = 1
})
