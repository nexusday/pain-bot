import moment from 'moment-timezone'

let handler = async (m, { conn }) => {
  let users = Object.entries(global.db.data.users)
    .filter(([_, u]) => u.birth)

  if (!users.length) return conn.reply(m.chat, '《✧》No hay usuarios con cumpleaños registrados en este momento.', m, rcanal)

  let now = moment.tz('America/Lima')
  let lista = []

  for (let [jid, data] of users) {
    let fecha = data.birth
    let [d, m, y] = fecha.split(/[\/\-]/).map(n => parseInt(n))
    if (!y) y = now.year()
    let cumple = moment.tz(`${d}/${m}/${y}`, 'D/M/YYYY', 'America/Lima')
    if (cumple.isBefore(now)) cumple.year(now.year() + 1)

    let diff = moment.duration(cumple.diff(now))
    let dias = Math.floor(diff.asDays())
    let horas = diff.hours()
    let minutos = diff.minutes()
    let segundos = diff.seconds()

    let diaSemana = cumple.format('dddd') 
    let nombre = data.name || `@${jid.split('@')[0]}`

    lista.push({
      tiempo: cumple.valueOf(),
      texto: `♚ ${nombre} » *${diaSemana}, ${d} de ${cumple.format('MMMM')}*\n\t→ _${dias} días${horas ? ` ${horas} horas` : ''}${minutos ? ` ${minutos} minutos` : ''}${segundos ? ` ${segundos} segundos` : ''}_`
    })
  }

  lista.sort((a, b) => a.tiempo - b.tiempo)

  let texto = `「✿」Cumpleaños en *${await conn.getName(m.chat)}*:\n\n` + lista.map(v => v.texto).join('\n\n')

  conn.reply(m.chat, texto, m, rcanal, {
    mentions: users.map(([jid]) => jid)
  })
}

handler.help = ['#allbirthdays • #allbirths\n→ Consulta el calendario de cumpleaños de los usuarios']
handler.tags = ['perfiles']
handler.command = ['allbirthdays', 'allbirths']
export default handler
