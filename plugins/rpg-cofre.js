import { tr } from '../lib/lang.js'

const espera = 10 * 60 * 1000

const premios = [
  { rareza: 'vacio', peso: 8, gana: 0, es: 'El cofre estaba vacío y con telarañas', en: 'The chest was empty and full of cobwebs', pt: 'O baú estava vazio e cheio de teias' },
  { rareza: 'vacio', peso: 6, gana: 0, es: 'Solo había una nota: "llegaste tarde"', en: 'There was only a note: "you\'re late"', pt: 'Só havia um bilhete: "chegaste tarde"' },
  { rareza: 'vacio', peso: 5, gana: 0, es: 'Alguien lo abrió antes que tú', en: 'Someone opened it before you', pt: 'Alguém abriu-o antes de ti' },

  { rareza: 'comun', peso: 9, min: 180, max: 320, es: 'Había unas monedas sueltas', en: 'There were a few loose coins', pt: 'Havia umas moedas soltas' },
  { rareza: 'comun', peso: 8, min: 200, max: 360, es: 'Encontraste un anillo viejo', en: 'You found an old ring', pt: 'Encontraste um anel velho' },
  { rareza: 'comun', peso: 8, min: 160, max: 300, es: 'Una bolsa de cobre, nada más', en: 'A pouch of copper, nothing else', pt: 'Uma bolsa de cobre, mais nada' },
  { rareza: 'comun', peso: 7, min: 220, max: 400, es: 'Una daga oxidada que igual vendiste', en: 'A rusty dagger you sold anyway', pt: 'Uma adaga ferrugenta que mesmo assim vendeste' },
  { rareza: 'comun', peso: 7, min: 190, max: 340, es: 'Botones de oro falsos, pero algo valían', en: 'Fake gold buttons, but they were worth something', pt: 'Botões de ouro falso, mas valiam alguma coisa' },

  { rareza: 'poco', peso: 6, min: 420, max: 700, es: 'Un mapa corto te llevó a un escondite', en: 'A short map led you to a stash', pt: 'Um mapa curto levou-te a um esconderijo' },
  { rareza: 'poco', peso: 5, min: 480, max: 780, es: 'Una copa de plata', en: 'A silver cup', pt: 'Um copo de prata' },
  { rareza: 'poco', peso: 5, min: 450, max: 740, es: 'Pergaminos que un mercader te compró', en: 'Scrolls a merchant bought from you', pt: 'Pergaminhos que um mercador te comprou' },
  { rareza: 'poco', peso: 4, min: 500, max: 820, es: 'Un collar con una piedra opaca', en: 'A necklace with a dull stone', pt: 'Um colar com uma pedra baça' },

  { rareza: 'raro', peso: 4, min: 800, max: 1200, es: 'Una llave de oro y un cofre más chico adentro', en: 'A gold key and a smaller chest inside', pt: 'Uma chave de ouro e um baú mais pequeno lá dentro' },
  { rareza: 'raro', peso: 3, min: 900, max: 1350, es: 'Gemas sueltas entre el polvo', en: 'Loose gems in the dust', pt: 'Gemas soltas no pó' },
  { rareza: 'raro', peso: 3, min: 850, max: 1280, es: 'La corona de un rey menor', en: 'A minor king\'s crown', pt: 'A coroa de um rei menor' },
  { rareza: 'raro', peso: 2, min: 950, max: 1400, es: 'Un huevo de dragón frío, pero caro', en: 'A cold dragon egg, but expensive', pt: 'Um ovo de dragão frio, mas caro' },

  { rareza: 'epico', peso: 2, min: 1300, max: 1900, es: 'El mapa completo de un tesoro enterrado', en: 'The full map of a buried treasure', pt: 'O mapa completo de um tesouro enterrado' },
  { rareza: 'epico', peso: 1, min: 1500, max: 2100, es: 'Una espada con el filo todavía brillante', en: 'A sword with the edge still bright', pt: 'Uma espada com o fio ainda a brilhar' },

  { rareza: 'legendario', peso: 1, min: 2200, max: 3200, es: 'El cofre del rey. Esto no pasa seguido', en: 'The king\'s chest. This does not happen often', pt: 'O baú do rei. Isto não acontece muitas vezes' },
  { rareza: 'legendario', peso: 1, min: 2000, max: 2900, es: 'Un diamante del tamaño de una nuez', en: 'A diamond the size of a walnut', pt: 'Um diamante do tamanho de uma noz' },

  { rareza: 'trampa', peso: 4, min: 180, max: 420, es: 'Salieron murciélagos y se te cayó la bolsa', en: 'Bats flew out and you dropped your bag', pt: 'Saíram morcegos e deixaste cair a bolsa' },
  { rareza: 'trampa', peso: 3, min: 250, max: 550, es: 'Una trampa de agujas te hizo soltar monedas', en: 'A needle trap made you drop coins', pt: 'Uma armadilha de agulhas fez-te largar moedas' },
  { rareza: 'trampa', peso: 3, min: 200, max: 480, es: 'El cofre era maldito y te cobró el peaje', en: 'The chest was cursed and charged you a toll', pt: 'O baú era amaldiçoado e cobrou-te a portagem' },
  { rareza: 'trampa', peso: 2, min: 400, max: 800, es: 'Un mimético se comió parte de tu oro', en: 'A mimic ate part of your gold', pt: 'Um mímico comeu parte do teu ouro' },
  { rareza: 'desastre', peso: 1, min: 700, max: 1200, es: 'Explotó. Saliste vivo, pero más pobre', en: 'It blew up. You lived, but poorer', pt: 'Explodiu. Saíste vivo, mas mais pobre' }
]

const rarezaTxt = {
  vacio: ['vacío', 'empty', 'vazio'],
  comun: ['común', 'common', 'comum'],
  poco: ['poco común', 'uncommon', 'pouco comum'],
  raro: ['raro', 'rare', 'raro'],
  epico: ['épico', 'epic', 'épico'],
  legendario: ['legendario', 'legendary', 'lendário'],
  trampa: ['trampa', 'trap', 'armadilha'],
  desastre: ['desastre', 'disaster', 'desastre']
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
  const falta = espera - (Date.now() - (usuario.lastCofre || 0))
  if (falta > 0) {
    const minutos = Math.ceil(falta / 60000)
    return conn.sendMessage(m.chat, {
      text: tr(conn,
        `[❗] Debes esperar *${minutos} minuto${minutos !== 1 ? 's' : ''}* para abrir otro cofre.`,
        `[❗] Wait *${minutos} minute${minutos !== 1 ? 's' : ''}* before opening another chest.`,
        `[❗] Espera *${minutos} minuto${minutos !== 1 ? 's' : ''}* para abrires outro baú.`
      ),
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const premio = elegir(premios)
  const monto = premio.gana === 0 ? 0 : premio.min ? entre(premio.min, premio.max) : 0
  const pierde = premio.rareza === 'trampa' || premio.rareza === 'desastre'
  usuario.lastCofre = Date.now()
  usuario.coins = Math.max(0, usuario.coins + (pierde ? -monto : monto))

  const signo = pierde ? `-${monto}` : `+${monto}`
  const rango = tr(conn, ...rarezaTxt[premio.rareza])
  const moneda = tr(conn, 'monedas', 'coins', 'moedas')

  await conn.sendMessage(m.chat, {
    text: `\`*˚   ✩    ✦    ✩   ˚*\`\n\n╭─ ✧\n┊ *${tr(conn, 'cofre', 'chest', 'baú')}*\n╰─ ✧  ✩\n┊ ${tr(conn, premio.es, premio.en, premio.pt)}\n┊ ${tr(conn, 'rareza', 'rarity', 'raridade')}  ·  \`${rango}\`\n┊ ${signo} ${moneda}\n┊ ${tr(conn, 'saldo', 'balance', 'saldo')}  ·  \`${usuario.coins}\`\n╰─────────`,
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

handler.command = ['cofre', 'chest']
handler.tags = ['rpg']
handler.help = ['cofre']
handler.group = true

export default handler
