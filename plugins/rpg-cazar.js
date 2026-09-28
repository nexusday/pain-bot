import { tr } from '../lib/lang.js'

const espera = 3 * 60 * 1000

const presas = [
  { rareza: 'comun', peso: 10, emoji: '🐇', min: 150, max: 240, es: 'Conejo', en: 'Rabbit', pt: 'Coelho' },
  { rareza: 'comun', peso: 10, emoji: '🐦', min: 140, max: 220, es: 'Paloma', en: 'Dove', pt: 'Pomba' },
  { rareza: 'comun', peso: 9, emoji: '🐿️', min: 160, max: 250, es: 'Ardilla', en: 'Squirrel', pt: 'Esquilo' },
  { rareza: 'comun', peso: 8, emoji: '🦆', min: 170, max: 260, es: 'Pato', en: 'Duck', pt: 'Pato' },
  { rareza: 'comun', peso: 8, emoji: '🐸', min: 130, max: 210, es: 'Rana', en: 'Frog', pt: 'Rã' },
  { rareza: 'comun', peso: 7, emoji: '🐁', min: 120, max: 200, es: 'Ratón de campo', en: 'Field mouse', pt: 'Rato do campo' },
  { rareza: 'poco', peso: 6, emoji: '🦊', min: 280, max: 420, es: 'Zorro', en: 'Fox', pt: 'Raposa' },
  { rareza: 'poco', peso: 6, emoji: '🦝', min: 260, max: 400, es: 'Mapache', en: 'Raccoon', pt: 'Guaxinim' },
  { rareza: 'poco', peso: 5, emoji: '🦉', min: 300, max: 450, es: 'Búho', en: 'Owl', pt: 'Coruja' },
  { rareza: 'poco', peso: 5, emoji: '🦡', min: 320, max: 470, es: 'Tejón', en: 'Badger', pt: 'Texugo' },
  { rareza: 'poco', peso: 5, emoji: '🦫', min: 300, max: 440, es: 'Castor', en: 'Beaver', pt: 'Castor' },
  { rareza: 'raro', peso: 4, emoji: '🦌', min: 420, max: 620, es: 'Ciervo', en: 'Deer', pt: 'Veado' },
  { rareza: 'raro', peso: 4, emoji: '🐗', min: 480, max: 700, es: 'Jabalí', en: 'Boar', pt: 'Javali' },
  { rareza: 'raro', peso: 3, emoji: '🐆', min: 520, max: 760, es: 'Leopardo', en: 'Leopard', pt: 'Leopardo' },
  { rareza: 'raro', peso: 3, emoji: '🦅', min: 500, max: 740, es: 'Águila', en: 'Eagle', pt: 'Águia' },
  { rareza: 'epico', peso: 2, emoji: '🐺', min: 700, max: 980, es: 'Lobo', en: 'Wolf', pt: 'Lobo' },
  { rareza: 'epico', peso: 2, emoji: '🐻', min: 760, max: 1050, es: 'Oso', en: 'Bear', pt: 'Urso' },
  { rareza: 'epico', peso: 1, emoji: '🐊', min: 800, max: 1100, es: 'Cocodrilo', en: 'Crocodile', pt: 'Crocodilo' },
  { rareza: 'legendario', peso: 1, emoji: '🐉', min: 1200, max: 1800, es: 'Dragón del bosque', en: 'Forest dragon', pt: 'Dragão da floresta' },
  { rareza: 'legendario', peso: 1, emoji: '🦄', min: 1100, max: 1700, es: 'Unicornio', en: 'Unicorn', pt: 'Unicórnio' },
  { rareza: 'legendario', peso: 1, emoji: '🦁', min: 1000, max: 1550, es: 'León blanco', en: 'White lion', pt: 'Leão branco' }
]

const fallos = [
  { es: 'El bosque estaba vacío', en: 'The woods were empty', pt: 'O bosque estava vazio' },
  { es: 'La presa te olió y huyó', en: 'The prey smelled you and ran', pt: 'A presa cheirou-te e fugiu' },
  { es: 'La trampa estaba vacía', en: 'The trap was empty', pt: 'A armadilha estava vazia' },
  { es: 'Llovió y no salió nada', en: 'It rained and nothing came out', pt: 'Choveu e não saiu nada' },
  { es: 'Pisaste una rama y se espantó', en: 'You stepped on a branch and it spooked', pt: 'Pisaste um ramo e assustou-se' },
  { es: 'El arco se mojó y fallaste el tiro', en: 'The bow got wet and you missed', pt: 'O arco molhou-se e falhaste o tiro' },
  { es: 'Un zorro se comió el cebo', en: 'A fox ate the bait', pt: 'Uma raposa comeu o isco' },
  { es: 'Te perdiste y volviste sin nada', en: 'You got lost and came back empty', pt: 'Perdeste-te e voltaste sem nada' }
]

const rarezaTxt = {
  comun: ['común', 'common', 'comum'],
  poco: ['poco común', 'uncommon', 'pouco comum'],
  raro: ['raro', 'rare', 'raro'],
  epico: ['épico', 'epic', 'épico'],
  legendario: ['legendario', 'legendary', 'lendário']
}

function entre(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function elegir(lista) {
  const total = lista.reduce((suma, item) => suma + item.peso, 0)
  let tiro = Math.random() * total
  for (const item of lista) {
    tiro -= item.peso
    if (tiro <= 0) return item
  }
  return lista[lista.length - 1]
}

function usuarioDe(m) {
  let usuario = global.db.data.users[m.sender]
  if (!usuario) {
    global.db.data.users[m.sender] = { coins: 100, exp: 0, level: 0, registered: true }
    usuario = global.db.data.users[m.sender]
  }
  if (!Number.isFinite(usuario.coins)) usuario.coins = 0
  return usuario
}

let handler = async (m, { conn }) => {
  const usuario = usuarioDe(m)
  const falta = espera - (Date.now() - (usuario.lastCazar || 0))
  if (falta > 0) {
    const minutos = Math.floor(falta / 60000)
    const segundos = Math.floor((falta % 60000) / 1000)
    return conn.sendMessage(m.chat, {
      text: tr(conn,
        `[❗] Debes esperar *${minutos}m ${segundos}s* para volver a cazar.`,
        `[❗] Wait *${minutos}m ${segundos}s* before hunting again.`,
        `[❗] Espera *${minutos}m ${segundos}s* para voltares a caçar.`
      ),
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  usuario.lastCazar = Date.now()
  const moneda = global.moneda || 'USD'
  const saldo = tr(conn, 'saldo', 'balance', 'saldo')

  if (Math.random() < 0.16) {
    const fallo = fallos[Math.floor(Math.random() * fallos.length)]
    return conn.sendMessage(m.chat, {
      text: `\`*˚   ✩    ✦    ✩   ˚*\`\n\n╭─ ✧\n┊ *${tr(conn, 'cazar', 'hunt', 'caçar')}*\n╰─ ✧  ✩\n┊ ${tr(conn, fallo.es, fallo.en, fallo.pt)}\n┊ +0 ${moneda}\n┊ ${saldo}  ·  \`${usuario.coins}\`\n╰─────────`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const presa = elegir(presas)
  const valor = entre(presa.min, presa.max)
  usuario.coins += valor
  const rango = tr(conn, ...rarezaTxt[presa.rareza])

  await conn.sendMessage(m.chat, {
    text: `\`*˚   ✩    ✦    ✩   ˚*\`\n\n╭─ ✧\n┊ *${tr(conn, 'cazar', 'hunt', 'caçar')}*\n╰─ ✧  ✩\n┊ ${presa.emoji} ${tr(conn, presa.es, presa.en, presa.pt)}\n┊ ${tr(conn, 'rareza', 'rarity', 'raridade')}  ·  \`${rango}\`\n┊ +${valor} ${moneda}\n┊ ${saldo}  ·  \`${usuario.coins}\`\n╰─────────`,
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

handler.command = ['cazar', 'hunt']
handler.tags = ['rpg']
handler.help = ['cazar']
handler.group = true

export default handler
