import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

/** Config local del servidor: no se pierde al actualizar */
const PRESERVAR_AL_ACTUALIZAR = ['storage/maxsubs.json']

function ejecutar(cmd) {
  return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' })
}

function ejecutarIgnorando(cmd) {
  try {
    execSync(cmd, { stdio: 'ignore' })
  } catch {}
}

function respaldarArchivosPreservar() {
  const datos = {}
  for (const relativo of PRESERVAR_AL_ACTUALIZAR) {
    const completo = path.join(process.cwd(), relativo)
    if (!fs.existsSync(completo)) continue
    try {
      datos[relativo] = fs.readFileSync(completo, 'utf-8')
    } catch {}
  }
  return datos
}

function restaurarArchivosPreservar(datos) {
  for (const [relativo, content] of Object.entries(datos)) {
    const completo = path.join(process.cwd(), relativo)
    try {
      fs.mkdirSync(path.dirname(completo), { recursive: true })
      fs.writeFileSync(completo, content)
    } catch (e) {
      console.error(`No se pudo restaurar ${relativo}:`, e)
    }
  }
}

function obtenerRamaRemota() {
  try {
    const upstream = ejecutar('git rev-parse --abbrev-ref @{u}').trim()
    const barra = upstream.indexOf('/')
    if (barra > 0) {
      return {
        remote: upstream.slice(0, barra),
        branch: upstream.slice(barra + 1)
      }
    }
  } catch {}

  let rama = 'main'
  try {
    rama = ejecutar('git rev-parse --abbrev-ref HEAD').trim() || 'main'
  } catch {}

  return { remote: 'origin', branch: rama }
}

/**
 * Actualiza igual que el repo remoto (sin merge conflictivo).
 * Muestra salida similar a git pull (archivos y commits).
 */
function gitPullForzado() {
  ejecutarIgnorando('git fetch origin')

  const { remote, branch: rama } = obtenerRamaRemota()
  const referencia = `${remote}/${rama}`

  const antes = ejecutar('git rev-parse HEAD').trim()
  let hashRemoto = ''
  try {
    hashRemoto = ejecutar(`git rev-parse ${referencia}`).trim()
  } catch {
    throw new Error(`No se encontró la rama remota ${referencia}`)
  }

  if (antes === hashRemoto) {
    return 'Already up to date.'
  }

  for (const relativo of PRESERVAR_AL_ACTUALIZAR) {
    ejecutarIgnorando(`git rm --cached -f "${relativo}"`)
    ejecutarIgnorando(`git update-index --assume-unchanged "${relativo}"`)
  }

  ejecutar(`git reset --hard ${referencia}`)

  for (const relativo of PRESERVAR_AL_ACTUALIZAR) {
    ejecutarIgnorando(`git update-index --no-assume-unchanged "${relativo}"`)
    ejecutarIgnorando(`git rm --cached -f "${relativo}"`)
  }

  const despues = ejecutar('git rev-parse HEAD').trim()
  const antesCorto = antes.slice(0, 7)
  const despuesCorto = despues.slice(0, 7)

  let out = `Updating ${antesCorto}..${despuesCorto}\nFast-forward\n`

  try {
    const stat = ejecutar(`git diff --stat ${antes}..${despues}`).trim()
    if (stat) out += stat + '\n'
  } catch {}

  try {
    const commits = ejecutar(`git log ${antes}..${despues} --oneline`).trim()
    if (commits) out += '\n' + commits
  } catch {}

  return out.trim()
}

let handler = async (m, { conn, text, isOwner }) => {
  if (!isOwner) {
    return m.reply('*[❗] Solo los dueños pueden usar este comando.*')
  }

  m.react = async emoji => {
    await conn.sendMessage(m.chat, {
      react: { text: emoji, key: m.key }
    })
  }

  await m.react('🕓')

  const respaldado = respaldarArchivosPreservar()

  try {
    const salidaStd = gitPullForzado()
    restaurarArchivosPreservar(respaldado)

    const respuesta = salidaStd.trim()

    await conn.reply(m.chat, respuesta || '[✅] Actualización completada.', m, rcanal)
    await m.react('✅')
  } catch (error) {
    restaurarArchivosPreservar(respaldado)
    console.error('Error ejecutando plugin owner-update.js:', error)
    const msgLocal = error?.stderr?.toString?.() || error?.stdout?.toString?.() || error?.message || String(error)
    await m.reply(`*[❌] Error al actualizar.*\n\n\`\`\`${msgLocal.slice(0, 1500)}\`\`\``)
    await m.react('❌')
  }
}

handler.help = ['update']
handler.tags = ['owner']
handler.command = ['update', 'actualizar', 'fix', 'fixed']
handler.rowner = true

export default handler
