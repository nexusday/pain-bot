import { crearReaccionDelirius } from '../lib/reacciones-delirius.js'

const handler = crearReaccionDelirius({
  tipo: 'pat',
  comandos: ['pat', 'acariciar', 'caricia'],
  texto: (remitente, objetivo) => `${remitente} le dio unas caricias a ${objetivo} 🥰`,
})

export default handler
