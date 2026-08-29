import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

/** Config local: no debe bloquear git pull ni perderse al actualizar */
const PRESERVE_ON_UPDATE = ['storage/maxsubs.json']

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

/** Evita que cambios locales en config bloqueen el merge del pull */
function clearGitConflictsForPreserve() {
  for (const rel of PRESERVE_ON_UPDATE) {
    try {
      execSync(`git rm --cached -f "${rel}"`, { stdio: 'ignore' })
    } catch {}
    try {
      execSync(`git restore --staged --worktree "${rel}"`, { stdio: 'ignore' })
    } catch {
      try {
        execSync(`git checkout -f -- "${rel}"`, { stdio: 'ignore' })
      } catch {}
    }
  }
}

let handler = async (m, { conn, text, isOwner }) => {
  if (!isOwner) {
    return m.reply('*[❗] Solo los dueños pueden usar este comando.*')
  }

  m.react = async emoji => {
    await conn.sendMessage(m.chat, {
      react: {
        text: emoji,
        key: m.key
      }
    })
  }

  await m.react('🕓')

  const backed = backupPreserveFiles()
  clearGitConflictsForPreserve()

  try {
    const pullArgs = m.fromMe && text ? ' ' + text : ''
    const stdout = execSync('git pull' + pullArgs, { encoding: 'utf-8' })
    restorePreserveFiles(backed)
    await conn.reply(m.chat, stdout.toString(), m, rcanal)
    await m.react('✅')
  } catch (error) {
    restorePreserveFiles(backed)
    console.error('Error ejecutando plugin owner-update.js:', error)
    const msg = error?.stderr?.toString?.() || error?.message || String(error)
    await m.reply(`*[❌] Error al actualizar.*\n\n\`\`\`${msg.slice(0, 1500)}\`\`\``)
    await m.react('❌')
  }
}

handler.help = ['update']
handler.tags = ['owner']
handler.command = ['update', 'actualizar', 'fix', 'fixed']
handler.rowner = true

export default handler
