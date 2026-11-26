# Rendimiento con muchos sub-bots

- **Envío sin red:** la cita "verificada" se arma en local con el `pushName`.
  La foto de perfil sale solo de una caché (24 h) que se descarga en segundo
  plano; el envío nunca espera a WhatsApp ni a un HTTP.
- **Auth en memoria:** cada sesión mantiene credenciales y claves Signal en RAM
  y las persiste con un diario (`auth-keys.ndjson`) + snapshot
  (`auth-keys.json`). La compactación del snapshot se hace en un worker thread.
- **Base de datos incremental:** solo se serializan los usuarios/chats tocados.
  Sin escaneos completos periódicos. Los comandos ya no esperan a un volcado
  de toda la base.
- **Carriles (PAIN_LANES):** los sub-bots se reparten entre N procesos. Cada
  proceso tiene su propia base de datos SQLite (sin contención de locks).
  El panel agrega las sesiones de todos los carriles.
- **Tiers:** `PAIN_TIER=free|premium|vip`. Cada tier tiene un perfil de
  recursos (memoria, cachés, keepalive). VIP está en desarrollo.
- **Cachés compartidas:** metadata de grupos en una caché global y mensajes en
  un LRU por proceso. Se podan chats y metadata inactivos.
- **Disco:** se limita el media de anti-delete, se podan logs viejos.
- **Catálogo de personajes:** se libera tras 10 min sin uso.

Diagnóstico: `/mem`, `/diag` y `/mem limpiar`.

| Variable | Por defecto | Para qué |
|---|---|---|
| `PAIN_LANES` | `3` | Número de procesos (carriles). `1` = un solo proceso. |
| `PAIN_TIER` | `free` | Tier del servidor: `free`, `premium` o `vip`. |
| `PAIN_SINGLE_HEAP_MB` | sin límite (V8 automático) | Solo si quieres fijar un tope de heap |
| `PAIN_START_CONCURRENCY` | `8` | Sesiones que se abren a la vez al arrancar |
| `PAIN_START_GAP_MS` | `100` | Pausa entre inicios de sesión |
| `PAIN_RECONNECT_BASE_MS` | `0` | Espera base antes de reintentar una sesión caída |
| `PAIN_RECONNECT_MAX_MS` | `5000` | Espera máxima del backoff de reconexión |
| `PAIN_DB_FLUSH_MS` | `1500` | Debounce del guardado incremental |
| `PAIN_DB_COMMIT_MS` | `5000` | Commit ligero de colecciones pequeñas |
| `PAIN_DB_FULL_SCAN_MS` | `0` (nunca) | Escaneo completo de seguridad (0 = nunca) |
| `PAIN_AUTH_CREDS_MS` | `250` | Debounce de `creds.json` |
| `PAIN_AUTH_JOURNAL_MS` | `500` | Debounce del diario de claves |
| `PAIN_AUTH_COMPACT_MS` | `7200000` | Cada cuánto se compacta el diario (en un worker) |
| `PAIN_AUTH_JOURNAL_MB` | `16` | Tamaño del diario que fuerza la compactación |
| `PAIN_AUTH_WORKERS` | `2` | Hilos de compactación (1–4) |
| `PAIN_MAX_MESSAGE_AGE_MS` | `10000` | Descarta mensajes más viejos que esto (ms) |
| `PAIN_QUOTED_AVATAR` | `1` | `0` = cita sin foto (cero red en el envío) |
| `PAIN_AVATAR_TTL_MS` | `86400000` | Vida de la foto cacheada |
| `PAIN_AVATAR_QUEUE` | `500` | Descargas de fotos en cola como máximo |
| `PAIN_ANTIDELETE_MEDIA_MB` | `512` | Tope global de media de anti-delete |
| `PAIN_DISK_FREE_PERCENT` | `10` | Aviso de disco libre |
| `PAIN_CATALOG_IDLE_MS` | `600000` | Libera el catálogo tras ese tiempo sin uso |
| `PAIN_GROUP_META_TTL_MS` | `1800000` | Antigüedad máxima de la metadata de un grupo |

### Tiers

| Tier | Memoria | Cachés | Keepalive | DB | Descripción |
|---|---|---|---|---|---|
| `free` | 512 MB | Reducidas | 60 s | Compartida | Optimizado para bajo consumo. Límite de ~30 subbots por servidor. |
| `premium` | 2048 MB | Normales | 30 s | Compartida o aislada | Hasta 50 conexiones por servidor. DB aislada opcional para mejor rendimiento. |
| `vip` | Próximamente | — | — | — | Servidores dedicados con DB aislada, prioridad en reconexión y soporte prioritario. |
