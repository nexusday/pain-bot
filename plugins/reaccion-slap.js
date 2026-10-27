import { crearReaccionDelirius } from '../lib/reacciones-delirius.js'

const handler = crearReaccionDelirius({
  tipo: 'slap',
  comandos: ['bang', 'bofetada', 'slap'],
  texto: (remitente, objetivo) => `${remitente} le dio una bofetada fuerte a ${objetivo} 👊`,
})

export default handler
