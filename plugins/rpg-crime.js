import { tr } from '../lib/lang.js'

const espera = 8 * 60 * 1000

const casos = [
  { ok: true, rareza: 'comun', peso: 8, min: 400, max: 900, es: 'Robaste una tienda de noche y saliste sin que te vieran', en: 'You robbed a shop at night and nobody saw you', pt: 'Roubaste uma loja de noite e ninguém te viu' },
  { ok: true, rareza: 'comun', peso: 8, min: 450, max: 950, es: 'Le quitaste la cartera a un turista distraído', en: 'You lifted a distracted tourist\'s wallet', pt: 'Tiraste a carteira a um turista distraído' },
  { ok: true, rareza: 'comun', peso: 7, min: 380, max: 880, es: 'Vendiste mercancía robada en el callejón', en: 'You sold stolen goods in the alley', pt: 'Vendeste mercadoria roubada no beco' },
  { ok: true, rareza: 'comun', peso: 7, min: 420, max: 980, es: 'Entraste a una casa de veraneo vacía', en: 'You broke into an empty summer house', pt: 'Entraste numa casa de férias vazia' },
  { ok: true, rareza: 'comun', peso: 6, min: 500, max: 1000, es: 'El auto estaba con las llaves puestas', en: 'The car had the keys still in it', pt: 'O carro estava com as chaves na ignição' },
  { ok: true, rareza: 'comun', peso: 6, min: 360, max: 820, es: 'Vaciaste la caja de una feria', en: 'You emptied a fair stall\'s cash box', pt: 'Esvaziaste a caixa de uma feira' },
  { ok: true, rareza: 'comun', peso: 6, min: 480, max: 1050, es: 'Hackeaste un cajero viejo y sacaste un fajo', en: 'You cracked an old ATM and pulled a stack', pt: 'Hackeaste um multibanco velho e tiraste um maço' },
  { ok: true, rareza: 'poco', peso: 5, min: 700, max: 1400, es: 'Le quitaste la bolsa a un mafioso distraído', en: 'You snatched a distracted mobster\'s bag', pt: 'Tiraste a mala a um mafioso distraído' },
  { ok: true, rareza: 'poco', peso: 5, min: 750, max: 1500, es: 'Abriste un almacén del puerto de madrugada', en: 'You opened a dock warehouse before dawn', pt: 'Abriste um armazém do porto de madrugada' },
  { ok: true, rareza: 'poco', peso: 4, min: 800, max: 1550, es: 'Te llevaste un reloj de un coleccionista', en: 'You took a watch from a collector', pt: 'Levaste um relógio a um colecionador' },
  { ok: true, rareza: 'poco', peso: 4, min: 720, max: 1450, es: 'Falsificaste la apuesta y te quedaste el bote', en: 'You rigged the bet and kept the pot', pt: 'Viciaste a aposta e ficaste com o pote' },
  { ok: true, rareza: 'poco', peso: 4, min: 680, max: 1380, es: 'Robaste el cuadro chico de una galería', en: 'You stole the small painting from a gallery', pt: 'Roubaste o quadro pequeno de uma galeria' },
  { ok: true, rareza: 'raro', peso: 3, min: 1100, max: 1900, es: 'El furgón de valores se detuvo y lo abriste', en: 'The cash van stopped and you cracked it', pt: 'O furgão de valores parou e tu abriste-o' },
  { ok: true, rareza: 'raro', peso: 3, min: 1200, max: 2000, es: 'Vendiste los datos de un ricachón', en: 'You sold a rich guy\'s data', pt: 'Vendeste os dados de um ricaço' },
  { ok: true, rareza: 'raro', peso: 2, min: 1300, max: 2100, es: 'Te colaste en un penthouse durante la fiesta', en: 'You slipped into a penthouse during the party', pt: 'Entraste num penthouse durante a festa' },
  { ok: true, rareza: 'epico', peso: 2, min: 1600, max: 2400, es: 'Vaciaron mal el camión blindado y te llevaste una bolsa', en: 'They left the armored truck half open and you took a bag', pt: 'Deixaram o camião blindado mal fechado e levaste um saco' },
  { ok: true, rareza: 'epico', peso: 1, min: 1700, max: 2500, es: 'Entraste a la caja del casino entre el cambio de guardia', en: 'You hit the casino cage during the guard change', pt: 'Entraste na caixa do casino na troca da guarda' },
  { ok: true, rareza: 'legendario', peso: 1, min: 2200, max: 3200, es: 'Abriste la bóveda. Nadie va a creerlo', en: 'You opened the vault. Nobody will believe it', pt: 'Abriste o cofre-forte. Ninguém vai acreditar' },

  { ok: false, rareza: 'fallo', peso: 7, min: 250, max: 700, es: 'La policía te vio y pagaste la fianza', en: 'The police spotted you and you paid bail', pt: 'A polícia viu-te e pagaste a fiança' },
  { ok: false, rareza: 'fallo', peso: 6, min: 200, max: 650, es: 'El dueño te reconoció y te sacó el dinero', en: 'The owner recognized you and took your cash', pt: 'O dono reconheceu-te e tirou-te o dinheiro' },
  { ok: false, rareza: 'fallo', peso: 6, min: 180, max: 600, es: 'Tropezaste al correr y perdiste el botín', en: 'You tripped while running and dropped the loot', pt: 'Tropeçaste a correr e perdeste o saque' },
  { ok: false, rareza: 'fallo', peso: 5, min: 220, max: 680, es: 'La alarma silenciosa sonó y tuviste que huir', en: 'The silent alarm went off and you had to run', pt: 'O alarme silencioso disparou e tiveste de fugir' },
  { ok: false, rareza: 'fallo', peso: 5, min: 240, max: 720, es: 'Un perro te mordió y soltaste todo', en: 'A dog bit you and you dropped everything', pt: 'Um cão mordeu-te e largaste tudo' },
  { ok: false, rareza: 'fallo', peso: 5, min: 260, max: 740, es: 'La cámara te grabó la cara', en: 'The camera caught your face', pt: 'A câmara filmou-te a cara' },
  { ok: false, rareza: 'fallo', peso: 4, min: 300, max: 800, es: 'Tu cómplice te delató a cambio de salir', en: 'Your partner snitched to walk free', pt: 'O teu cúmplice denunciou-te para sair livre' },
  { ok: false, rareza: 'fallo', peso: 4, min: 280, max: 780, es: 'La llave era falsa y pagaste al cerrajero', en: 'The key was fake and you paid the locksmith', pt: 'A chave era falsa e pagaste ao serralheiro' },
  { ok: false, rareza: 'fallo', peso: 4, min: 200, max: 620, es: 'Te persiguió una moto y tiraste el dinero', en: 'A bike chased you and you threw the money', pt: 'Uma mota perseguiu-te e deitaste fora o dinheiro' },
  { ok: false, rareza: 'trampa', peso: 3, min: 500, max: 1100, es: 'Te tendieron una trampa y quedaste en números rojos', en: 'They set a trap and you went into the red', pt: 'Armaram-te uma ratoeira e ficaste no vermelho' },
  { ok: false, rareza: 'trampa', peso: 2, min: 600, max: 1200, es: 'El mapa era falso y gastaste el viaje', en: 'The map was fake and the trip cost you', pt: 'O mapa era falso e a viagem saiu-te cara' },
  { ok: false, rareza: 'trampa', peso: 2, min: 700, max: 1400, es: 'Te quedaste encerrado y pagaste para salir', en: 'You got locked in and paid to get out', pt: 'Ficaste trancado e pagaste para sair' },
  { ok: false, rareza: 'desastre', peso: 1, min: 1000, max: 1700, es: 'Era una redada. Perdiste el botín y la fianza', en: 'It was a raid. You lost the loot and the bail', pt: 'Era uma rusga. Perdeste o saque e a fiança' }
]

const rarezaTxt = {
  comun: ['común', 'common', 'comum'],
  poco: ['poco común', 'uncommon', 'pouco comum'],
  raro: ['raro', 'rare', 'raro'],
  epico: ['épico', 'epic', 'épico'],
  legendario: ['legendario', 'legendary', 'lendário'],
  fallo: ['fallo', 'fail', 'falha'],
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

let handler = async (m, { conn }) => {
  let reclamo
  try {
    reclamo = await global.db.adapter.claimAndUpdate(
      global.db.data,
      `cooldown:crime:${m.sender}`,
      espera,
      (datos, ahora) => {
        if (!datos.users[m.sender]) {
          datos.users[m.sender] = { coins: 100, exp: 0, level: 0, registered: true }
        }
        const usuario = datos.users[m.sender]
        if (!Number.isFinite(usuario.coins)) usuario.coins = 0
        const falta = espera - (ahora - (usuario.lastCrime || 0))
        if (falta > 0) return { claim: false, falta }

        const caso = elegir(casos)
        const monto = entre(caso.min, caso.max)
        usuario.lastCrime = ahora
        if (caso.ok) usuario.coins += monto
        else usuario.coins = Math.max(0, usuario.coins - monto)
        return { caso, monto, coins: usuario.coins }
      }
    )
  } catch (error) {
    if (error?.code !== 'ERR_SQLITE_LOCK_TIMEOUT') throw error
    console.error('[rpg] No se pudo completar el crimen:', error.message)
    await global.db.adapter.refresh(global.db.data)
    const tiempoRestante = espera - (Date.now() - (global.db.data.users[m.sender]?.lastCrime || 0))
    if (tiempoRestante > 0) {
      const minutos = Math.ceil(tiempoRestante / 60000)
      return conn.sendMessage(m.chat, {
        text: tr(conn,
          `[❗] Ya reclamaste el crimen. Debes esperar *${minutos} minuto${minutos !== 1 ? 's' : ''}* para otro.`,
          `[❗] Wait *${minutos} minute${minutos !== 1 ? 's' : ''}* before another crime.`,
          `[❗] Espera *${minutos} minuto${minutos !== 1 ? 's' : ''}* para outro crime.`
        ),
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }
    return conn.sendMessage(m.chat, {
      text: '[❌] No se pudo completar el crimen. Inténtalo de nuevo.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  if (!reclamo.acquired || reclamo.result?.falta > 0) {
    const falta = reclamo.result?.falta || espera
    const minutos = Math.ceil(falta / 60000)
    return conn.sendMessage(m.chat, {
      text: tr(conn,
        `[❗] Ya reclamaste el crimen. Debes esperar *${minutos} minuto${minutos !== 1 ? 's' : ''}* para otro.`,
        `[❗] Wait *${minutos} minute${minutos !== 1 ? 's' : ''}* before another crime.`,
        `[❗] Espera *${minutos} minuto${minutos !== 1 ? 's' : ''}* para outro crime.`
      ),
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const { caso, monto, coins } = reclamo.result

  const signo = caso.ok ? `+${monto}` : `-${monto}`
  const rango = tr(conn, ...rarezaTxt[caso.rareza])
  const moneda = global.moneda || 'USD'
  await conn.sendMessage(m.chat, {
    text: `\`*˚   ✩    ✦    ✩   ˚*\`\n\n╭─ ✧\n┊ *${tr(conn, 'crimen', 'crime', 'crime')}*\n╰─ ✧  ✩\n┊ ${tr(conn, caso.es, caso.en, caso.pt)}\n┊ ${tr(conn, 'rango', 'rank', 'nível')}  ·  \`${rango}\`\n┊ ${signo} ${moneda}\n┊ ${tr(conn, 'saldo', 'balance', 'saldo')}  ·  \`${coins}\`\n╰─────────`,
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })
}

handler.command = ['crimen', 'crime']
handler.tags = ['rpg']
handler.help = ['crimen']
handler.group = true

export default handler
