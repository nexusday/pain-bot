import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

/** Config local del servidor: no debe bloquear git pull */
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

/** Limpia el estado de git para archivos de config antes del pull */
function unblockPreserveFilesForPull(backed) {
  for (const rel of PRESERVE_ON_UPDATE) {
    const full = path.join(process.cwd(), rel)
    const bak = full + '.updatebak'

    if (backed[rel]) {
      try {
        fs.mkdirSync(path.dirname(full), { recursive: true })
        fs.writeFileSync(bak, backed[rel])
      } catch {}
    }

    // 1) Sacar del índice (sigue en disco)
    runIgnore(`git rm --cached -f "${rel}"`)

    // 2) Stash si git lo tiene trackeado con cambios
    runIgnore(`git stash push -m "pain-update-${path.basename(rel)}" -- "${rel}"`)

    // 3) Volver al estado del último commit de git
    runIgnore(`git restore --staged --worktree "${rel}"`)
    runIgnore(`git checkout -f HEAD -- "${rel}"`)

    // 4) Quitar del disco un momento (ya está guardado en memoria y .updatebak)
    if (fs.existsSync(full)) {
      try { fs.unlinkSync(full) } catch {}
    }

    // 5) Ignorar restos en el índice
    runIgnore(`git update-index --assume-unchanged "${rel}"`)
  }
}

function afterPullPreserveFiles(backed) {
  for (const rel of PRESERVE_ON_UPDATE) {
    runIgnore(`git update-index --no-assume-unchanged "${rel}"`)
    runIgnore(`git rm --cached -f "${rel}"`)
    runIgnore(`git reset HEAD -- "${rel}"`)

    const full = path.join(process.cwd(), rel)
    const bak = full + '.updatebak'
    try {
      if (fs.existsSync(bak)) fs.unlinkSync(bak)
    } catch {}
  }

  restorePreserveFiles(backed)
}

function gitPull(extraArgs = '') {
  const tries = [
    `git pull --autostash${extraArgs}`,
    `git fetch origin && git pull --autostash${extraArgs}`,
    `git fetch origin && git merge --no-edit -X ours origin/HEAD${extraArgs}`
  ]

  let lastError
  for (const cmd of tries) {
    try {
      return run(cmd)
    } catch (e) {
      lastError = e
    }
  }
  throw lastError
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
  unblockPreserveFilesForPull(backed)

  try {
    const pullArgs = m.fromMe && text ? ' ' + text : ''
    const stdout = gitPull(pullArgs)
    afterPullPreserveFiles(backed)

    let reply = stdout.toString().trim()
    if (Object.keys(backed).length) {
      reply += '\n\n> ✅ Config local preservada (`maxsubs.json`).'
    }

    await conn.reply(m.chat, reply || '[✅] Actualización completada.', m, rcanal)
    await m.react('✅')
  } catch (error) {
    afterPullPreserveFiles(backed)
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
