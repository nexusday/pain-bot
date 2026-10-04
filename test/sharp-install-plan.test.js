import test from 'node:test'
import assert from 'node:assert/strict'
import { sharpInstallPlan } from '../lib/sharp-install-plan.js'

test('installs optional native Sharp runtime for the current host', () => {
  const plan = sharpInstallPlan(false)

  assert.deepEqual(plan.args, [
    'install',
    '--no-save',
    '--package-lock=false',
    '--include=optional',
    '--no-audit',
    '--no-fund',
    'sharp@0.34.1'
  ])
  assert.deepEqual(plan.env, {})
})

test('keeps the wasm-only install plan for Android and Termux', () => {
  const plan = sharpInstallPlan(true)

  assert.ok(plan.args.includes('sharp@0.34.1'))
  assert.ok(plan.args.includes('@img/sharp-wasm32@0.34.1'))
  assert.ok(plan.args.includes('--cpu=wasm32'))
  assert.equal(plan.env.npm_config_cpu, 'wasm32')
  assert.ok(plan.args.includes('--include=optional'))
  assert.ok(plan.args.includes('--package-lock=false'))
})
