import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const hook = fileURLToPath(new URL('../.claude/hooks/check-subagent-title.mjs', import.meta.url));
const run = (description) => spawnSync(process.execPath, [hook], {
  input: JSON.stringify({ tool_input: { description } }),
  encoding: 'utf8',
});

test('acepta un título con el formato completo', () => {
  assert.equal(run('[implementer::Haiku 5.5] · WI-SANDBOX-015 · Regenerar tipos').status, 0);
});

test('rechaza un ID completo con formato incorrecto', () => {
  const result = run('[implementer] WI-SANDBOX-015 regenerar tipos');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Titulo de subagente invalido/);
});

test('rechaza menciones abreviadas de WI (antes pasaban sin validar)', () => {
  assert.equal(run('[implementer] WI-015 regenerar tipos').status, 2);
  assert.equal(run('[reviewer::Sonnet 5.5] · WI-015 · Revisión').status, 2);
});

test('no exige formato cuando la descripción no menciona un WI', () => {
  assert.equal(run('explorar el repositorio').status, 0);
});

test('entrada no JSON no bloquea', () => {
  const result = spawnSync(process.execPath, [hook], { input: 'no json', encoding: 'utf8' });
  assert.equal(result.status, 0);
});
