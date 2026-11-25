import os from 'node:os'
import { snapshotSesiones } from '../lib/session-registry.js'
import { estadoMemoriaProceso, higieneMemoriaProceso } from '../lib/mem-hygiene.js'
import { estadisticasAuthStores } from '../lib/auth-store.js'
import { estadoDiscoProceso } from '../lib/disk-hygiene.js'

const RAIZ = process.cwd()

function gb(bytes) {
  return ((Number(bytes) || 0) / 1073741824).toFixed(1)
}

function textoNumero(valor) {
  return Number.isFinite(Number(valor)) ? String(Math.round(Number(valor))) : '?'
}

function lineasWorker(status) {
  const conectados = status.sessions.filter((s) => s.connected).length
  const memoria = status.memoria || {}
  const recursos = status.recursos || {}
  const aviso = recursos.modoAhorro ? '  ·  ⚠ ahorro' : ''
  return [
    `┊ ${status.workerId}  ·  \`${textoNumero(memoria.rssMB)} MB\`  ·  \`${conectados}/${status.sessions.length}\`${aviso}`,
    `┊ chats \`${textoNumero(recursos.chats)}\`  ·  msgs \`${textoNumero(recursos.mensajes)}\`  ·  meta \`${textoNumero(recursos.metadata)}\`  ·  heap \`${textoNumero(memoria.heapUsedMB)} MB\``,
  ].join('\n')
}

let handler = async (m, { conn, args, usedPrefix, command, isOwner }) => {
  if (!isOwner) {
    return m.reply('*[❗] Solo los dueños pueden usar este comando.*')
  }

  const accion = String(args[0] || '').toLowerCase()
  const limpiar = ['limpiar', 'gc', 'clean', 'purgar'].includes(accion)
  const propio = estadoMemoriaProceso()
  const higiene = limpiar
    ? higieneMemoriaProceso({ forzarGc: true })
    : null

  let workers = []
  try {
    workers = [{ workerId: 'primary', sessions: snapshotSesiones() }]
  } catch (error) {
    console.error('[mem] No se pudo leer el estado de las sesiones:', error?.message || error)
  }

  const conectados = workers.reduce(
    (total, worker) => total + worker.sessions.filter((s) => s.connected).length,
    0,
  )
  const totalSistema = os.totalmem()
  const usadaSistema = Math.max(0, totalSistema - os.freemem())
  const persistencia = global.db?.estadisticasPersistencia?.() || null
  const auth = estadisticasAuthStores()
  const disco = await estadoDiscoProceso().catch(() => null)
  const lineas = [
    '`*˚   ✩    ✦    ✩   ˚*`',
    '',
    '╭─ ✧',
    `┊ *${command}*`,
    '╰─ ✧  ✩',
    `┊ sistema  ·  \`${gb(usadaSistema)}/${gb(totalSistema)} GB\``,
    `┊ principal  ·  \`${textoNumero(propio.memoria.rssMB)} MB\`  ·  heap \`${textoNumero(propio.memoria.heapUsedMB)} MB\``,
    `┊ chats \`${textoNumero(propio.chats)}\`  ·  msgs \`${textoNumero(propio.mensajes)}\`  ·  meta \`${textoNumero(propio.metadata)}\``,
    ...workers.map(lineasWorker),
    `┊ sub-bots  ·  \`${conectados}\` conectados`,
  ]
  if (persistencia) {
    lineas.push(
      `┊ db  ·  flushes \`${persistencia.flushes}\`  ·  entidades \`${persistencia.entidades}\`  ·  ` +
      `full \`${persistencia.fullScans}\`  ·  último \`${persistencia.ultimoMs} ms\``
    )
  }
  lineas.push(`┊ auth  ·  \`${auth.sesiones}\` sesiones  ·  \`${auth.claves || 0}\` claves  ·  \`${auth.cambiosPendientes}\` cambios`)
  if (disco) {
    lineas.push(`┊ disco  ·  \`${disco.libreMB}/${disco.totalMB} MB\` libres (${disco.porcentajeLibre}%)`)
  }
  if (higiene) {
    const liberados = higiene.chats + higiene.metadata + higiene.yt + higiene.sc + higiene.tt + higiene.descargas
    lineas.push(`┊ higiene  ·  \`${liberados}\` liberados${higiene.gc ? '  ·  GC' : ''}`)
  } else {
    lineas.push(`┊ \`${usedPrefix}${command} limpiar\`  ·  fuerza poda y GC`)
  }
  lineas.push('╰─────────')

  await conn.sendMessage(m.chat, {
    text: lineas.join('\n'),
    contextInfo: { ...(global.rcanal?.contextInfo || {}) },
  }, { quoted: m })
}

handler.command = ['mem', 'memoria', 'ram', 'diag', 'diagnostico']
handler.tags = ['owner']
handler.help = ['mem [limpiar] - Ver o liberar memoria de los procesos']
handler.rowner = true

export default handler
