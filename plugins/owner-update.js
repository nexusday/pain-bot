import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

/** Config local del servidor: no se pierde al actualizar */
const PRESERVE_ON_UPDATE = ['storage/maxsubs.json']

function run(cmd) {
  return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' })
}

function runIgnore(cmd) {
  try {
    execSync(cmd, { stdio: 'ignore' })
  } catch {}
}

function backupPreserveFiles() {
  const data = {}
  for (const rel of PRESERVE_ON_UPDATE) {
    const full = path.join(process.cwd(), rel)
    if (!fs.existsSync(full)) continue
    try {
      data[rel] = fs.readFileSync(full, 'utf-8')
    } catch {}
  }
  return data
}

function restorePreserveFiles(data) {
  for (const [rel, content] of Object.entries(data)) {
    const full = path.join(process.cwd(), rel)
    try {
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, content)
    } catch (e) {
      console.error(`No se pudo restaurar ${rel}:`, e)
    }
  }
}

function getRemoteBranch() {
  try {
    const upstream = run('git rev-parse --abbrev-ref @{u}').trim()
    const slash = upstream.indexOf('/')
    if (slash > 0) {
      return {
        remote: upstream.slice(0, slash),
        branch: upstream.slice(slash + 1)
      }
    }
  } catch {}

  let branch = 'main'
  try {
    branch = run('git rev-parse --abbrev-ref HEAD').trim() || 'main'
  } catch {}

  return { remote: 'origin', branch }
}

/**
 * Actualiza igual que el repo remoto (sin merge conflictivo).
 * Evita que queden <<<<<<< en archivos por pulls a medias.
 */
function gitPullHard() {
  runIgnore('git fetch origin')

  const { remote, branch } = getRemoteBranch()
  const ref = `${remote}/${branch}`

  for (const rel of PRESERVE_ON_UPDATE) {
    runIgnore(`git rm --cached -f "${rel}"`)
    runIgnore(`git update-index --assume-unchanged "${rel}"`)
  }

  const resetOut = run(`git reset --hard ${ref}`)
  const logOut = run('git log -1 --oneline')

  for (const rel of PRESERVE_ON_UPDATE) {
    runIgnore(`git update-index --no-assume-unchanged "${rel}"`)
    runIgnore(`git rm --cached -f "${rel}"`)
  }

  return `${resetOut.trim()}\n${logOut.trim()}`
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

  const backed = backupPreserveFiles()

  try {
    const stdout = gitPullHard()
    restorePreserveFiles(backed)

    const reply = stdout.trim()

    await conn.reply(m.chat, reply || '[✅] Actualización completada.', m, rcanal)
    await m.react('✅')
  } catch (error) {
    restorePreserveFiles(backed)
    console.error('Error ejecutando plugin owner-update.js:', error)
    const msg = error?.stderr?.toString?.() || error?.stdout?.toString?.() || error?.message || String(error)
    await m.reply(`*[❌] Error al actualizar.*\n\n\`\`\`${msg.slice(0, 1500)}\`\`\``)
    await m.react('❌')
  }
}

handler.help = ['update']
handler.tags = ['owner']
handler.command = ['update', 'actualizar', 'fix', 'fixed']
handler.rowner = true

export default handler
