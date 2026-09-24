import util from 'util'
import { exec } from 'child_process'
import { promisify } from 'util'
import { findGroupParticipant, findBotParticipant } from '../lib/group-participant.js'

const execAsync = promisify(exec)
const MAX_OUT = 3500

function formatear(valor) {
  if (typeof valor === 'string') return valor
  try {
    return util.inspect(valor, {
      depth: 4,
      colors: false,
      maxArrayLength: 50,
      maxStringLength: 800,
    })
  } catch {
    return String(valor)
  }
}

function recortar(texto) {
  const s = String(texto ?? '')
  if (s.length <= MAX_OUT) return s
  return s.slice(0, MAX_OUT) + '\n… (cortado)'
}

function ayudaEval() {
  return `☾. *Owner eval*

\`\`\`
=> m.chat
=> m.sender
=> m.mtype
=> antiSticker
=> antiImg
=> botGroups
=> part?.admin
=> botPart?.admin
> await conn.getName(m.sender)
$ dir
\`\`\`

> \`=>\` expresión (retorno)
> \`>\` código async
> \`$\` shell

Vars útiles: *m*, *conn*, *participants*, *antiSticker*, *antiImg*, *botGroups*, *modoSub*, *part*, *botPart*`
}

let handler = async () => {}

handler.all = async function (m, { conn, isOwner, isROwner, participants, groupMetadata }) {
  try {
    if ((!isOwner && !isROwner) || m.fromMe) return
    if (!m.text || m.isBaileys) return

    const texto = String(m.text).trim()
    const match = texto.match(/^(=>|>|\$)\s?([\s\S]*)$/)
    if (!match) return

    m.commandExecuted = true

    const tipo = match[1]
    const code = match[2] ?? ''

    if (!String(code).trim()) {
      await conn.sendMessage(m.chat, {
        text: ayudaEval(),
        contextInfo: { ...(global.rcanal?.contextInfo || {}) },
      }, { quoted: m })
      return
    }

    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {})

    // Vars en scope local → disponibles dentro de eval
    const antiSticker = global.db?.data?.antiSticker?.[m.chat]
    const antiImg = global.db?.data?.antiImg?.[m.chat]
    const antiVideo = global.db?.data?.antiVideo?.[m.chat]
    const antiAudio = global.db?.data?.antiAudio?.[m.chat]
    const botGroups = global.db?.data?.botGroups?.[m.chat]
    const modoSub = global.db?.data?.modoSub?.[m.chat]
    const part = findGroupParticipant(participants || [], m, conn)
    const botPart = findBotParticipant(participants || [], conn)
    const meta = groupMetadata || {}
    const db = global.db?.data

    let resultado

    if (tipo === '$') {
      const { stdout, stderr } = await execAsync(code, {
        timeout: 60_000,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      })
      resultado = [stdout, stderr].filter(Boolean).join('\n') || '(sin salida)'
    } else if (tipo === '=>') {
      resultado = await eval(`(async () => (${code}\n))()`)
    } else {
      resultado = await eval(`(async () => { ${code}\n })()`)
    }

    // Referencias para que el bundler/linter no las quite del scope de eval
    void (
      antiSticker ?? antiImg ?? antiVideo ?? antiAudio ?? botGroups ?? modoSub ??
      part ?? botPart ?? meta ?? db ?? participants ?? groupMetadata ?? conn ?? m
    )

    const salida = recortar(formatear(resultado === undefined ? 'undefined' : resultado))
    await conn.sendMessage(m.chat, {
      text: salida,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })

    await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
  } catch (e) {
    const msg = e?.stack || e?.message || String(e)
    await conn.sendMessage(m.chat, {
      text: `*[❌] Error*\n\`\`\`\n${recortar(msg)}\n\`\`\``,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m }).catch(() => {})
    await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
  }
}

handler.help = ['=> expr', '> async', '$ shell']
handler.tags = ['owner']
handler.command = ['__ownereval__']
handler.rowner = true

export default handler
