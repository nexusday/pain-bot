const manos = {
  piedra: 'piedra',
  papel: 'papel',
  tijera: 'tijera',
  piedra1: 'piedra',
  rock: 'piedra',
  paper: 'papel',
  tijeras: 'tijera',
  scissors: 'tijera'
}

const gana = { piedra: 'tijera', papel: 'piedra', tijera: 'papel' }
const emoji = { piedra: '✊', papel: '✋', tijera: '✌️' }

function usuarioDe(m) {
  let usuario = global.db.data.users[m.sender]
  if (!usuario) {
    global.db.data.users[m.sender] = { coins: 100, exp: 0, level: 0, registered: true }
    usuario = global.db.data.users[m.sender]
  }
  if (!Number.isFinite(usuario.coins)) usuario.coins = 0
  return usuario
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  const jugada = manos[String(args[0] || '').toLowerCase()]
  if (!jugada) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Elige una mano.\n\n> *Ejemplo:* ${usedPrefix}${command} piedra`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const bot = ['piedra', 'papel', 'tijera'][Math.floor(Math.random() * 3)]
  const usuario = usuarioDe(m)
  let resultado = 'Empate'
  let delta = 0
  if (jugada !== bot) {
    if (gana[jugada] === bot) {
      resultado = 'Ganaste'
      delta = 150
      usuario.coins += delta
    } else {
      resultado = 'Perdiste'
      delta = -80
      usuario.coins = Math.max(0, usuario.coins + delta)
    }
  }

  const signo = delta > 0 ? `+${delta}` : `${delta}`
  await conn.sendMessage(m.chat, {
    text: `\`*˚   ✩    ✦    ✩   ˚*\`\n\n╭─ ✧\n┊ *piedra papel tijera*\n╰─ ✧  ✩\n┊ tú  ·  ${emoji[jugada]} ${jugada}\n┊ bot  ·  ${emoji[bot]} ${bot}\n┊ ${resultado}\n┊ ${signo} monedas\n┊ saldo  ·  \`${usuario.coins}\`\n╰─────────`,
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

handler.command = ['ppt', 'suit']
handler.tags = ['rpg']
handler.help = ['ppt piedra|papel|tijera']

export default handler
