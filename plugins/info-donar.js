import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { construirBotonSoporte, obtenerLinkSoporte } from '../lib/soporte.js'
import { esModoIos } from '../lib/menu-modo.js'
import { tr } from '../lib/lang.js'

const PAYPAL = 'https://www.paypal.com/ncp/payment/8AKBYTD78LL6W'
const BINANCE = '539248699'

function textoDonar(conn) {
  return tr(
    conn,
    `\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *donar*
╰─ ✧  ✩
┊ *BINANCE*
┊ ID  ·  \`${BINANCE}\`
┊
┊ *PAYPAL*
┊ tarjeta  ·  apple  ·  paypal
┊ ${PAYPAL}
╰─────────

Gracias por aportar tu granito de arena.
*PAIN BOT MD* y sus sub-bots son completamente gratis.
No tenemos sub-bots premium como otros bots.
Ofrecemos el sub-bot completamente gratis.
Puedes convertirte en sub-bot en cualquier momento.
También está actualizado y con buen soporte, ya que cada semana o cada pocos días agregamos algo nuevo.`,
    `\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *donate*
╰─ ✧  ✩
┊ *BINANCE*
┊ ID  ·  \`${BINANCE}\`
┊
┊ *PAYPAL*
┊ card  ·  apple  ·  paypal
┊ ${PAYPAL}
╰─────────

Thank you for chipping in.
*PAIN BOT MD* and its sub-bots are completely free.
We do not have premium sub-bots like other bots.
We offer the sub-bot completely free.
You can become a sub-bot at any time.
It stays updated and well supported, because every week, or every few days, we add something new.`,
    `\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *doar*
╰─ ✧  ✩
┊ *BINANCE*
┊ ID  ·  \`${BINANCE}\`
┊
┊ *PAYPAL*
┊ cartão  ·  apple  ·  paypal
┊ ${PAYPAL}
╰─────────

Obrigado por dares o teu grão de areia.
*PAIN BOT MD* e os sub-bots são completamente grátis.
Não temos sub-bots premium como outros bots.
Oferecemos o sub-bot completamente grátis.
Podes tornar-te sub-bot a qualquer momento.
Também está atualizado e com bom suporte, porque todas as semanas ou de poucos em poucos dias acrescentamos algo novo.`,
  )
}

function rutaBinance() {
  const candidatas = [
    join(process.cwd(), 'storage', 'img', 'binance.png'),
    join(process.cwd(), 'img', 'binance.png')
  ]
  return candidatas.find((ruta) => existsSync(ruta)) || ''
}

let handler = async (m, { conn }) => {
  const texto = textoDonar(conn)
  const boton = construirBotonSoporte(conn)
  const enlace = obtenerLinkSoporte(conn)
  const ruta = rutaBinance()
  const imagen = ruta ? readFileSync(ruta) : null
  const ios = esModoIos(conn)
  const pie = ios && enlace ? `\n\n┊ soporte  ·  ${enlace}` : ''
  const leyenda = `${texto}${pie}`

  const enviarFoto = () => conn.sendMessage(m.chat, imagen
    ? {
        image: imagen,
        caption: leyenda,
        contextInfo: { ...(global.rcanal?.contextInfo || {}) }
      }
    : {
        text: leyenda,
        contextInfo: { ...(global.rcanal?.contextInfo || {}) }
      }, { quoted: m })

  try {
    if (imagen && !ios && boton && typeof conn.sendMessageLia === 'function') {
      await conn.sendMessageLia(m.chat, {
        image: imagen,
        caption: texto,
        footer: global.namebot || 'PAIN BOT MD',
        nativeFlow: [boton]
      }, { quoted: m, keepQuoted: true })
      return
    }

    await enviarFoto()
  } catch (error) {
    console.error('[donar]', error)
    await enviarFoto().catch(() => {})
  }
}

handler.help = ['donar', 'apoyar']
handler.tags = ['info']
handler.command = ['donar', 'apoyar', 'donate']

export default handler
