#!/usr/bin/env node
/**
 * Rellena hp / maxHp / power en characters-catalog.json según el precio.
 * Uso: node scripts/enrich-characters-combat.js
 */
import { loadCatalog, enrichCatalogCombatStats, flushCatalog, catalogCount } from '../lib/characters/store.js'

const store = loadCatalog()
console.log(`[combat] Catálogo: ${catalogCount(store)} personajes`)
const changed = enrichCatalogCombatStats(store)
flushCatalog()
console.log(`[combat] Actualizados: ${changed}`)
console.log('[combat] Listo.')
