import { crearReaccionDelirius } from '../lib/reacciones-delirius.js'

const handler = crearReaccionDelirius({
  tipo: 'kiss',
  comandos: ['kiss', 'beso'],
  texto: (remitente, objetivo) => `${remitente} le dio un beso a ${objetivo} ❤`,
})

export default handler
