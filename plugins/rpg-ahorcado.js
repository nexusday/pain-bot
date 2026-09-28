const PALABRAS = [
  'gatobot', 'whatsapp', 'cofre', 'dragón', 'pirata', 'nube', 'llave',
  'brújula', 'castillo', 'relámpago', 'bosque', 'tesoro', 'máscara', 'cometa'
]

const juegos = new Map()

function plano(letra) {
  return String(letra).normalize('NFD').replace(/\p{M}/gu, '')
}

function tablero(juego) {
  const huecos = [...juego.palabra].map(letra => {
    if (letra === ' ') return ' '
    return juego.letras.has(plano(letra)) ? letra : '_'
  }).join(' ')
  return `\`*˚   ✩    ✦    ✩   ˚*\`\n\n╭─ ✧\n┊ *ahorcado*\n╰─ ✧  ✩\n┊ ${huecos}\n┊ fallos  ·  \`${juego.fallos}/6\`\n┊ letras  ·  \`${[...juego.letras].join(' ') || '—'}\`\n╰─────────`
}

function nuevo(chat) {
  const palabra = PALABRAS[Math.floor(Math.random() * PALABRAS.length)]
  const juego = { palabra, letras: new Set(), fallos: 0 }
  juegos.set(chat, juego)
  return juego
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  const accion = String(args[0] || '').toLowerCase()
  let juego = juegos.get(m.chat)

  if (!accion || accion === 'nuevo' || accion === 'start') {
    juego = nuevo(m.chat)
    return conn.sendMessage(m.chat, {
      text: `${tablero(juego)}\n> ${usedPrefix}${command} a`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  if (!juego) {
    return conn.sendMessage(m.chat, {
      text: `[❗] No hay partida.\n\n> *Ejemplo:* ${usedPrefix}${command}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const letra = accion.normalize('NFD').replace(/\p{M}/gu, '').slice(0, 1)
  if (!/^[a-zñ]$/i.test(letra)) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Manda una letra.\n\n> *Ejemplo:* ${usedPrefix}${command} a`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const normal = plano(juego.palabra)
  juego.letras.add(letra)
  if (!normal.includes(letra)) juego.fallos += 1

  const gano = [...normal].every(c => c === ' ' || juego.letras.has(c))
  if (gano || juego.fallos >= 6) {
    juegos.delete(m.chat)
    const estado = gano ? `Ganaron. Era *${juego.palabra}*` : `Perdieron. Era *${juego.palabra}*`
    return conn.sendMessage(m.chat, {
      text: `\`*˚   ✩    ✦    ✩   ˚*\`\n\n╭─ ✧\n┊ *ahorcado*\n╰─ ✧  ✩\n┊ ${estado}\n┊ fallos  ·  \`${juego.fallos}/6\`\n╰─────────`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  await conn.sendMessage(m.chat, {
    text: tablero(juego),
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

handler.command = ['ahorcado']
handler.tags = ['rpg']
handler.help = ['ahorcado', 'ahorcado <letra>']
handler.group = true

export default handler
