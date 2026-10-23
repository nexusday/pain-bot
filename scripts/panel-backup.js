import '../config.js'
import fs from 'node:fs'
import path from 'node:path'
import { cargarConfigPanel } from '../lib/webpanel/panel-config.js'
import { readStagedBackup, restoreBackup,recoverBackup } from '../lib/webpanel/backups.js'

const command = process.argv[2],
  id = process.argv[process.argv.indexOf('--id') + 1]
if (!['restore','recover'].includes(command) || !process.argv.includes('--id')) {
  console.error(
    'Uso: node scripts/panel-backup.js restore --id IDENTIFICADOR\nDetén primero el bot, sus workers y la web.'
  )
  process.exitCode = 1
} else {
  try {
    const config = cargarConfigPanel()
    if(command==='recover'){
      const result=await recoverBackup(config,id)
      console.log(`Recuperación finalizada: ${result.status}. ${result.recovery}`)
      process.exit(0)
    }
    const
      data = await readStagedBackup(config, id),
      result = await restoreBackup(config, data)
    try{await fs.promises.unlink(path.join(config.dataDir,'restore-pending',`${id}.painbackup`))}catch{console.warn('No se pudo retirar la preparación usada; conserva el identificador para revisarla.')}
    console.log(
      `Restauración completa. Usuarios del panel: ${result.users}. Base global: ${result.global ? 'sí' : 'no'}.`
    )
    console.log(`Recuperación anterior: ${result.recovery}`)
    console.log(
      'Configura PAIN_WEB_ADMIN_USER con el principal restaurado y PAIN_WEB_ADMIN_RESET=0. Ya puedes iniciar el bot.'
    )
  } catch (error) {
    console.error('No se restauró la copia:', error.message)
    process.exitCode = 1
  }
}
