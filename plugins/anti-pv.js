import { antipvActivo, establecerAntipv, esOwnerDeEsteBot } from '../lib/Antis/anti-pv.js'
import { tr } from '../lib/lang.js'

function avisar(conn, m, texto) {
  return conn.sendMessage(m.chat, {
    text: texto,
    contextInfo: {
      ...(global.rcanal?.contextInfo || {}),
      mentionedJid: m?.sender ? [m.sender] : [],
    },
  }, { quoted: m })
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  if (!esOwnerDeEsteBot(conn, m)) {
    return avisar(conn, m, tr(
      conn,
      '[❗] Solo el owner de este bot puede usar este comando.',
      '[❗] Only this bot\'s owner can use this command.',
      '[❗] Só o dono deste bot pode usar este comando.'
    ))
  }

  const accion = String(args?.[0] || '').toLowerCase().trim()
  const quien = `@${String(m.sender || '').split('@')[0]}`

  if (accion === 'ver' || accion === 'status' || accion === 'estado') {
    const estado = antipvActivo(conn) ? 'ON' : 'OFF'
    return avisar(conn, m, tr(
      conn,
      `ִֶָ☾. *Anti privado*\n> Estado: ${estado}`,
      `ִֶָ☾. *Anti private*\n> Status: ${estado}`,
      `ִֶָ☾. *Anti privado*\n> Estado: ${estado}`
    ))
  }

  if (accion === 'on' || accion === 'activar' || accion === 'enable') {
    if (!establecerAntipv(conn, true)) {
      return avisar(conn, m, tr(
        conn,
        '[❌] Ocurrió un error al configurar el anti.',
        '[❌] Something went wrong while setting this anti.',
        '[❌] Ocorreu um erro ao configurar o anti.'
      ))
    }
    return avisar(conn, m, tr(
      conn,
      `ִֶָ☾. *Anti privado activado*\n> Por: ${quien}`,
      `ִֶָ☾. *Anti private enabled*\n> By: ${quien}`,
      `ִֶָ☾. *Anti privado ativado*\n> Por: ${quien}`
    ))
  }

  if (accion === 'off' || accion === 'desactivar' || accion === 'disable') {
    if (!establecerAntipv(conn, false)) {
      return avisar(conn, m, tr(
        conn,
        '[❌] Ocurrió un error al configurar el anti.',
        '[❌] Something went wrong while setting this anti.',
        '[❌] Ocorreu um erro ao configurar o anti.'
      ))
    }
    return avisar(conn, m, tr(
      conn,
      `ִֶָ☾. *Anti privado desactivado correctamente*\n> Por: ${quien}`,
      `ִֶָ☾. *Anti private disabled*\n> By: ${quien}`,
      `ִֶָ☾. *Anti privado desativado corretamente*\n> Por: ${quien}`
    ))
  }

  return avisar(conn, m, tr(
    conn,
    `[❗] Debes poner una acción.\n\n> *Ejemplo:* ${usedPrefix}${command} on\n> *Ejemplo:* ${usedPrefix}${command} off`,
    `[❗] You need to choose an action.\n\n> *Example:* ${usedPrefix}${command} on\n> *Example:* ${usedPrefix}${command} off`,
    `[❗] Você precisa escolher uma ação.\n\n> *Exemplo:* ${usedPrefix}${command} on\n> *Exemplo:* ${usedPrefix}${command} off`
  ))
}

handler.help = ['#antipv on/off']
handler.tags = ['owner']
handler.command = ['antipv', 'antiprivado']
handler.owner = true

export default handler
