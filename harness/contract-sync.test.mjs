import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const script = path.resolve('harness/contract-sync.mjs');
const tagBySource = { core: 'CORE', console: 'CONSOLE', sandbox: 'SANDBOX', 'github-integration': 'GH' };
const fixtures = [
  ['CS-CORE-20260925-001', 'core'],
  ['CS-CONSOLE-20260925-002', 'console'],
  ['CS-SANDBOX-20260925-003', 'sandbox'],
  ['CS-20260923-004', 'core'],
];

function makeEvent(id, source, sourceWorkItem = undefined) {
  return [
    'type: CONTRACT_SYNC', `id: ${id}`, `source: ${source}`,
    ...(sourceWorkItem ? [`sourceWorkItem: ${sourceWorkItem}`] : []),
    'targets: [sandbox]',
    'scopePaths: [spec/contracts/system-contract.md]',
    'breaking: false', 'changed:', '  - Contract fixture.', 'requiredAction:',
    '  - Review the affected API.', 'sourceRevision: test', 'status: C-PENDING', '',
  ].join('\n');
}

function prepareCheckRoot(directory) {
  fs.mkdirSync(path.join(directory, 'harness/contract-sync/inbox'), { recursive: true });
  fs.mkdirSync(path.join(directory, 'harness/contract-sync/outbox'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'harness/work-items.json'), JSON.stringify({
    schemaVersion: 1,
    component: 'SANDBOX',
    workItems: [{
      id: 'WI-SANDBOX-999', component: 'SANDBOX', workItemType: 'PRODUCT', status: 'W-SELECTED',
      storyIds: ['HU02'], taskIds: ['ST-SANDBOX-999'], caseIds: [], sprint: 'Test',
      dependsOn: [], contractImpact: true, publishesContract: false,
      specPaths: ['spec/contracts/system-contract.md'],
    }],
  }));
  fs.writeFileSync(path.join(directory, 'harness/state.json'), JSON.stringify({
    planningBaseline: '2026-09-24-core-console-transition',
    activeWorkItem: {
      id: 'WI-SANDBOX-999', status: 'W-SELECTED',
      coordination: { pullCheckpoints: [] },
    },
  }));
}

for (const [id, source] of fixtures) {
  test(`import/check reconoce ${id}`, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tjc-gh-contract-sync-'));
    try {
      prepareCheckRoot(directory);
      const externalOutbox = path.join(directory, 'external-outbox');
      fs.mkdirSync(externalOutbox);
      const sourceWorkItem = id.includes('-20260925-') ? `WI-${tagBySource[source]}-001` : undefined;
      fs.writeFileSync(path.join(externalOutbox, `${id}.yaml`), makeEvent(id, source, sourceWorkItem));

      const imported = spawnSync(process.execPath, [script, 'import', '--from', externalOutbox], { cwd: directory, encoding: 'utf8' });
      assert.equal(imported.status, 0, imported.stderr);
      assert.equal(JSON.parse(imported.stdout).imported, 1);
      const checked = spawnSync(process.execPath, [script, 'check', '--checkpoint', 'start', '--work-item', 'WI-SANDBOX-999'], { cwd: directory, encoding: 'utf8' });
      assert.equal(checked.status, 2, checked.stderr);
      assert.deepEqual(JSON.parse(checked.stdout).relevantPendingSyncIds, [id]);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
}

test('import y check rechazan namespace discordante, sourceWorkItem ausente y legacy reciente', () => {
  const invalidEvents = [
    ['CS-CORE-20260925-101', 'console', 'WI-CONSOLE-001', /namespace CORE/],
    ['CS-SANDBOX-20260925-102', 'sandbox', undefined, /sourceWorkItem/],
    ['CS-20260925-103', 'core', undefined, /historical data/],
  ];

  for (const [id, source, sourceWorkItem, issue] of invalidEvents) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tjc-gh-contract-sync-invalid-'));
    try {
      prepareCheckRoot(directory);
      const externalOutbox = path.join(directory, 'external-outbox');
      fs.mkdirSync(externalOutbox);
      const body = makeEvent(id, source, sourceWorkItem);
      fs.writeFileSync(path.join(externalOutbox, `${id}.yaml`), body);
      const imported = spawnSync(process.execPath, [script, 'import', '--from', externalOutbox], { cwd: directory, encoding: 'utf8' });
      assert.equal(imported.status, 1);
      assert.match(imported.stderr, issue);

      fs.writeFileSync(path.join(directory, 'harness/contract-sync/inbox', `${id}.yaml`), body);
      const checked = spawnSync(process.execPath, [script, 'check', '--checkpoint', 'start', '--work-item', 'WI-SANDBOX-999'], { cwd: directory, encoding: 'utf8' });
      assert.equal(checked.status, 1);
      assert.match(checked.stderr, issue);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
});

test('publish emite sourceWorkItem y rechaza IDs simples incluso si su fecha parece histórica', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tjc-gh-contract-sync-publish-'));
  try {
    const outbox = path.join(directory, 'harness/contract-sync/outbox');
    fs.mkdirSync(outbox, { recursive: true });
    fs.writeFileSync(path.join(directory, 'harness/work-items.json'), JSON.stringify({
      schemaVersion: 1,
      component: 'SANDBOX',
      workItems: [{ id: 'WI-SANDBOX-003', component: 'SANDBOX', contractImpact: true, publishesContract: true }],
    }));
    const args = ['publish', '--work-item', 'WI-SANDBOX-003', '--targets', 'core', '--scope-paths', 'spec/contracts/system-contract.md', '--breaking', 'false', '--changed', 'approved contract change', '--required-action', 'review compatibility', '--source-revision', 'abc123'];
    const published = spawnSync(process.execPath, [script, ...args, '--id', 'CS-SANDBOX-20260925-001'], { cwd: directory, encoding: 'utf8' });
    assert.equal(published.status, 0, published.stderr);
    const event = fs.readFileSync(path.join(outbox, 'CS-SANDBOX-20260925-001.yaml'), 'utf8');
    assert.match(event, /^source: sandbox$/m);
    assert.match(event, /^sourceWorkItem: WI-SANDBOX-003$/m);

    const legacy = spawnSync(process.execPath, [script, ...args, '--id', 'CS-20260924-002'], { cwd: directory, encoding: 'utf8' });
    assert.equal(legacy.status, 1);
    assert.match(legacy.stderr, /must use the SANDBOX-namespaced/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('import registra hora local y los consumers pueden acknowledge/resolve con evidencia', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tjc-gh-contract-sync-lifecycle-'));
  try {
    prepareCheckRoot(directory);
    const registryPath = path.join(directory, 'harness/work-items.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    registry.workItems[0].status = 'W-IN_PROGRESS';
    fs.writeFileSync(registryPath, JSON.stringify(registry));
    const statePath = path.join(directory, 'harness/state.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    state.activeWorkItem.status = 'W-IN_PROGRESS';
    state.activeWorkItem.gates = { implementationCompleted: 'G-PASSED' };
    state.activeWorkItem.gateEvidence = { implementationCompleted: ['harness/reports/implementation.md'] };
    fs.writeFileSync(statePath, JSON.stringify(state));
    fs.mkdirSync(path.join(directory, 'harness/reports'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'harness/reports/review.md'), 'Reviewed API and compatibility.\n');
    fs.writeFileSync(path.join(directory, 'harness/reports/implementation.md'), 'Verified the consumer code.\n');

    const externalOutbox = path.join(directory, 'external-outbox');
    fs.mkdirSync(externalOutbox);
    const sourceEvent = makeEvent('CS-CORE-20260926-998', 'core', 'WI-CORE-003');
    fs.writeFileSync(path.join(externalOutbox, 'CS-CORE-20260926-998.yaml'), sourceEvent);
    const imported = spawnSync(process.execPath, [script, 'import', '--from', externalOutbox], { cwd: directory, encoding: 'utf8' });
    assert.equal(imported.status, 0, imported.stderr);
    const inboxPath = path.join(directory, 'harness/contract-sync/inbox/CS-CORE-20260926-998.yaml');
    assert.match(fs.readFileSync(inboxPath, 'utf8'), /^consumerImportedAt: \d{4}-\d\d-\d\dT/m);

    const ack = spawnSync(process.execPath, [script, 'acknowledge', '--id', 'CS-CORE-20260926-998', '--work-item', 'WI-SANDBOX-999', '--evidence', 'harness/reports/review.md'], { cwd: directory, encoding: 'utf8' });
    assert.equal(ack.status, 0, ack.stderr);
    assert.match(fs.readFileSync(inboxPath, 'utf8'), /^status: C-ACKNOWLEDGED$/m);
    const resolved = spawnSync(process.execPath, [script, 'resolve', '--id', 'CS-CORE-20260926-998', '--work-item', 'WI-SANDBOX-999', '--evidence', 'harness/reports/implementation.md'], { cwd: directory, encoding: 'utf8' });
    assert.equal(resolved.status, 0, resolved.stderr);
    assert.match(fs.readFileSync(inboxPath, 'utf8'), /^status: C-RESOLVED$/m);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
