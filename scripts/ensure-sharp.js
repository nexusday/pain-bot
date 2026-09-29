/**
 * Prepara sharp antes de cargar plugins.
 * En Termux/Android no hay binarios nativos: usa sharp + @img/sharp-wasm32.
 */
import { spawnSync } from 'child_process'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function isTermuxOrAndroid() {
  return (
    process.platform === 'android' ||
    Boolean(process.env.TERMUX_VERSION) ||
    Boolean(process.env.PREFIX?.includes?.('com.termux')) ||
    Boolean(process.env.PREFIX?.includes?.('/data/data/com.termux'))
  )
}

async function canUseSharp() {
  try {
    const sharp = (await import('sharp')).default
    await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 0, g: 0, b: 0 } }
    })
      .png()
      .toBuffer()
    return true
  } catch {
    return false
  }
}

function runNpm(args) {
  const result = spawnSync('npm', args, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      npm_config_cpu: 'wasm32',
      npm_config_fund: 'false',
      npm_config_audit: 'false'
    }
  })
  return result.status === 0
}

async function main() {
  if (await canUseSharp()) {
    console.log('[sharp] listo')
    return
  }

  if (!isTermuxOrAndroid()) {
    console.log('[sharp] no cargó. En Pterodactyl el bot sigue sin reinstalar paquetes.')
    console.log('[sharp] las imágenes pueden fallar hasta que sharp esté bien instalado en este sistema.')
    return
  }

  console.log('[sharp] no carga en Termux/android. Instalando soporte WebAssembly...')

  const ok = runNpm([
    'install',
    'sharp@0.34.1',
    '@img/sharp-wasm32@0.34.1',
    '--cpu=wasm32',
    '--no-bin-links'
  ])

  if (!ok) {
    console.error('[sharp] instalación WASM falló')
    console.error('[sharp] ejecuta a mano en Termux:')
    console.error('  cd ~/pain-bot')
    console.error('  npm install --cpu=wasm32 sharp@0.34.1 @img/sharp-wasm32@0.34.1 --no-bin-links')
    if (isTermuxOrAndroid()) {
      console.error('[sharp] el bot arrancará, pero plugins de imagen (ocr, stickers, hd…) pueden fallar')
    }
    return
  }

  // invalidar cache de módulos de la carga fallida anterior no aplica en proceso hijo;
  // el arranque real es un proceso nuevo vía npm start.
  if (await canUseSharp()) {
    console.log('[sharp] WASM instalado y funcionando')
  } else {
    console.error('[sharp] sigue fallando tras WASM. Revisa espacio y red, luego:')
    console.error('  npm install --cpu=wasm32 sharp @img/sharp-wasm32 --no-bin-links')
  }
}

main().catch((e) => {
  console.error('[sharp] setup error:', e?.message || e)
})
