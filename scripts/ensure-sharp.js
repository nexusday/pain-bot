/**
 * Prepara y valida sharp antes de cargar plugins.
 * Termux/Android usa WebAssembly; el resto instala el runtime nativo de su plataforma.
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sharpInstallPlan } from '../lib/sharp-install-plan.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
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

  const causa = resultado.stderr?.trim().slice(0, 2_000) ||
    resultado.error?.message ||
    `proceso de prueba terminó con código ${resultado.status ?? 'desconocido'}`
  console.warn(`[sharp] No se pudo cargar/probar sharp: ${causa}`)
  return false
}

function ejecutarNpm(args, {
  envOverrides = {},
  cwd = root,
  captureOutput = false,
  clearPlatformConfig = false
} = {}) {
  const env = {
    ...process.env,
    ...envOverrides,
    npm_config_fund: 'false',
    npm_config_audit: 'false'
  }
  if (clearPlatformConfig) {
    for (const key of [
      'npm_config_arch', 'npm_config_os', 'npm_config_libc', 'npm_config_cpu', 'npm_config_platform',
      'NPM_CONFIG_ARCH', 'NPM_CONFIG_OS', 'NPM_CONFIG_LIBC', 'NPM_CONFIG_CPU', 'NPM_CONFIG_PLATFORM'
    ]) delete env[key]
  }
  const stdio = captureOutput ? 'pipe' : 'inherit'

  const npmExecPath = process.env.npm_execpath
  const resultado = npmExecPath
    ? spawnSync(process.execPath, [npmExecPath, ...args], {
        cwd,
        stdio,
        encoding: captureOutput ? 'utf8' : undefined,
        env
      })
    : spawnSync('npm', args, {
        cwd,
        stdio,
        encoding: captureOutput ? 'utf8' : undefined,
        shell: process.platform === 'win32',
        env
      })

  if (resultado.error) throw resultado.error
  return resultado
}

async function instalarPaquetesLinux(paquetes) {
  const temporales = await mkdtemp(join(tmpdir(), 'pain-sharp-'))
  const directorioImg = join(root, 'node_modules', '@img')
  await mkdir(directorioImg, { recursive: true })

  try {
    for (const paquete of paquetes) {
      const spec = `@img/${paquete.name}@${paquete.version}`
      const directorioPaquete = join(temporales, paquete.name)
      await mkdir(directorioPaquete)
      console.log(`[sharp] descargando ${spec}...`)
      const empaquetado = ejecutarNpm(
        ['pack', spec, '--pack-destination', directorioPaquete, '--silent', '--ignore-scripts'],
        { cwd: directorioPaquete, captureOutput: true, clearPlatformConfig: true }
      )
      if (empaquetado.status !== 0) {
        const detalle = empaquetado.stderr?.trim() || empaquetado.stdout?.trim() || empaquetado.error?.message
        throw new Error(`npm pack falló para ${spec}${detalle ? `: ${detalle}` : '.'}`)
      }

      const archivo = (await readdir(directorioPaquete)).find((nombre) => nombre.endsWith('.tgz'))
      if (!archivo) throw new Error(`npm pack no generó el archivo de ${spec}.`)
      const destino = join(directorioImg, paquete.name)
      await mkdir(destino, { recursive: true })
      const extraido = spawnSync('tar', [
        '-xzf',
        join(directorioPaquete, archivo),
        '-C',
        destino,
        '--strip-components=1'
      ], { cwd: root, stdio: 'inherit' })
      if (extraido.error) throw extraido.error
      if (extraido.status !== 0) throw new Error(`No se pudo extraer ${spec}.`)

      const archivoRuntime = join(destino, paquete.file)
      let existeRuntime = false
      try {
        const runtime = await stat(archivoRuntime)
        existeRuntime = paquete.file === 'lib' ? runtime.isDirectory() : runtime.isFile()
      } catch {}
      if (!existeRuntime) {
        throw new Error(`${spec} se extrajo, pero falta ${paquete.file}.`)
      }
    }
  } finally {
    await rm(temporales, { recursive: true, force: true })
  }
}

async function main() {
  if (await canUseSharp()) {
    console.log('[sharp] listo')
    return
  }

  const android = isTermuxOrAndroid()
  let libc = ''
  if (process.platform === 'linux') {
    const sharpRequire = createRequire(require.resolve('sharp'))
    libc = sharpRequire('detect-libc').familySync() || ''
  }
  const { args, env: npmEnv, packages } = sharpInstallPlan(android, {
    platform: process.platform,
    arch: process.arch,
    libc
  })

  if (packages.length) {
    console.log(`[sharp] instalando binarios oficiales directamente para ${process.platform}-${process.arch}...`)
    await instalarPaquetesLinux(packages)
  } else {
    if (!args.length) {
      throw new Error(`No hay un runtime Sharp compatible definido para ${process.platform}-${process.arch}.`)
    }
    console.log('[sharp] instalando soporte WebAssembly para Termux/Android...')
    const instalado = ejecutarNpm(args, { envOverrides: npmEnv })
    if (instalado.status !== 0) {
      throw new Error(`npm no pudo instalar Sharp (código ${instalado.status ?? 'desconocido'}).`)
    }
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
