# Protección de administradores en los antis

Los antis de enlaces, imágenes, stickers, vídeo, audio, documentos, contactos,
menciones, longitud, palabras prohibidas, spam, bots, estados y ver-una-vez usan
una comprobación común antes de borrar mensajes o expulsar al remitente.

## Identidad y rol

- Se comprueba la metadata actual del grupo, no solo el `isAdmin` calculado al
  inicio del procesamiento ni una lista almacenada antes de un ascenso.
- Se reconocen `admin`, `superadmin`, `admin: true` y el propietario verificado
  que indique la metadata del grupo.
- El teléfono (PN) y el LID se relacionan mediante la metadata, los campos
  alternativos del remitente o el mapeo oficial de Baileys. Nunca se considera
  que un teléfono y un LID sean la misma persona solo por compartir dígitos.
- Mencionar o citar a un administrador no concede inmunidad al remitente.
- Los eventos de ascenso, descenso, alta y baja admiten tanto JIDs como objetos
  de participantes. Se invalidan los índices y la cache del grupo al cambiarlos.

## Fallos de WhatsApp

Si no se puede obtener metadata actual o identificar al remitente, se omite esa
sanción automática. No se borra ni se expulsa a ciegas y **no** se concede por eso
ningún permiso de administrador para comandos. Las reglas siguen activadas;
otro mensaje vuelve a comprobar el rol.

Los antis de un mismo mensaje comparten la consulta y las consultas simultáneas
del mismo grupo se agrupan. Los mapeos de identidad se cachean de forma limitada,
pero no se usa esa cache como prueba de un rol actual. Las expulsiones automáticas
vuelven a proteger a los administradores en la última comprobación del objetivo.

Los modos `del` y `all` se conservan para miembros normales. Los prefijos se
comprueban al inicio del texto: un punto o una barra de una URL no convierte un
mensaje normal en comando ni desactiva la detección de enlaces.

Esto no modifica la restauración de mensajes de anti-delete ni la política de
mensajes privados de anti-pv. Tras desplegar cambios en estos módulos y en el
handler, reinicia los procesos del bot para no mantener imports antiguos.
