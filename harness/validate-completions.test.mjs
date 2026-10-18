import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const validator = path.resolve('harness/validate-completions.mjs');
const id = 'WI-SANDBOX-999';
const item = { id, component: 'SANDBOX', workItemType: 'HARNESS', status: 'W-DONE', sprint: 'Test', storyIds: ['HU01'], taskIds: ['ST-SANDBOX-999'], caseIds: [], specPaths: [], contractImpact: false, publishesContract: false };
const checkpointNames = ['start', 'implementation-delivery', 'before-review', 'before-done'];
const completion = {
  ...item,
  closedAt: '2026-09-24T00:04:00.000Z',
  decisionGate: { checked: true, blockingDecisionIds: [] },
  execution: { leaderAgent: 'leader', implementationAgent: 'implementer', reviewAgent: 'reviewer', reviewCycles: 0, handoffs: [{ agent: 'reviewer', status: 'APPROVED', evidence: ['harness/reports/closure.md'] }] },
  gates: Object.fromEntries([
    ...['sddVerified', 'implementationCompleted', 'independentReviewPassed', 'technicalChecksPassed', 'interopSyncChecked', 'noBlockingDecisions', 'retryLimitRespected'].map((gate) => [gate, 'G-PASSED']),
    ...['contractReviewed', 'canonicalContractSynced', 'contractSyncPublished'].map((gate) => [gate, 'G-NOT_APPLICABLE']),
  ]),
  gateEvidence: Object.fromEntries(['sddVerified', 'implementationCompleted', 'independentReviewPassed', 'technicalChecksPassed', 'interopSyncChecked', 'noBlockingDecisions', 'retryLimitRespected'].map((gate) => [gate, ['harness/reports/closure.md']])),
  coordination: { contractImpact: false, publishesContract: false, publishedSyncIds: [], pendingRelevantSyncIds: [], pullCheckpoints: checkpointNames.map((checkpoint, index) => ({ checkpoint, workItem: id, relevantPendingSyncIds: [], checkedAt: `2026-09-24T00:0${index}:00.000Z` })) },
  evidence: ['harness/reports/closure.md'],
};

function run(completions, inboxEvents = [], outboxEvents = [], registryItems = [item]) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tjc-completion-test-'));
  try {
    fs.mkdirSync(path.join(directory, 'harness'));
    fs.mkdirSync(path.join(directory, 'harness/reports'));
    fs.mkdirSync(path.join(directory, 'harness/contract-sync/inbox'), { recursive: true });
    fs.mkdirSync(path.join(directory, 'harness/contract-sync/outbox'), { recursive: true });
    for (const [index, event] of inboxEvents.entries()) fs.writeFileSync(path.join(directory, 'harness/contract-sync/inbox', `CS-test-${index}.yaml`), event);
    for (const event of outboxEvents) {
      const eventId = event.match(/^id:\s*(.+)$/m)?.[1]?.trim();
      fs.writeFileSync(path.join(directory, 'harness/contract-sync/outbox', `${eventId}.yaml`), event);
    }
    fs.writeFileSync(path.join(directory, 'harness/reports/closure.md'), 'Verified test fixture.\n');
    fs.writeFileSync(path.join(directory, 'harness/state.json'), JSON.stringify({ completedWorkItems: completions }));
    fs.writeFileSync(path.join(directory, 'harness/work-items.json'), JSON.stringify({ workItems: registryItems }));
    return spawnSync(process.execPath, [validator], { cwd: directory, encoding: 'utf8' });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function runPublishedEvent(syncId, includeSourceWorkItem = true) {
  const publishingItem = { ...item, id: 'WI-SANDBOX-998', taskIds: ['ST-SANDBOX-998'], contractImpact: true, publishesContract: true };
  const record = structuredClone(completion);
  Object.assign(record, publishingItem);
  record.execution.handoffs.push({ agent: 'contract-reviewer', status: 'APPROVED', evidence: ['harness/reports/closure.md'] });
  for (const gate of ['contractReviewed', 'canonicalContractSynced', 'contractSyncPublished']) {
    record.gates[gate] = 'G-PASSED';
    record.gateEvidence[gate] = ['harness/reports/closure.md'];
  }
  record.coordination.contractImpact = true;
  record.coordination.publishesContract = true;
  record.coordination.publishedSyncIds = [syncId];
  record.coordination.pullCheckpoints = record.coordination.pullCheckpoints.map((checkpoint) => ({ ...checkpoint, workItem: publishingItem.id }));
  const sourceWorkItem = includeSourceWorkItem ? `sourceWorkItem: ${publishingItem.id}\n` : '';
  const event = `id: ${syncId}\nsource: sandbox\n${sourceWorkItem}targets: [core]\n`;
  return run([record], [], [event], [publishingItem]);
}

test('W-DONE cannot omit its closure snapshot', () => {
  const result = run([]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /without a completion record/);
});

test('W-DONE needs an independent approved review', () => {
  assert.equal(run([completion]).status, 0);
  const tampered = structuredClone(completion);
  tampered.execution.handoffs = [];
  const result = run([tampered]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /reviewer handoff/);
});

test('W-DONE accepts the human reviewer as the independent reviewer', () => {
  const humanReviewed = structuredClone(completion);
  humanReviewed.execution.reviewAgent = 'human-reviewer';
  humanReviewed.execution.handoffs[0].agent = 'human-reviewer';
  assert.equal(run([humanReviewed]).status, 0);
});

test('W-DONE is rejected when a relevant inbox event is merely acknowledged', () => {
  const event = 'type: CONTRACT_SYNC\nid: CS-CORE-20260924-998\nsource: core\ntargets: [sandbox]\nstatus: C-ACKNOWLEDGED\n';
  const result = run([completion], [event]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unresolved relevant CONTRACT_SYNC/);
});

test('a Contract Sync imported after closure does not rewrite an immutable completion snapshot', () => {
  const event = [
    'type: CONTRACT_SYNC',
    'id: CS-CORE-20260926-001',
    'source: core',
    'sourceWorkItem: WI-CORE-003',
    'targets: [sandbox]',
    'scopePaths: [*]',
    'status: C-PENDING',
    'consumerImportedAt: 2026-09-26T07:48:21.433Z',
    '',
  ].join('\n');
  assert.equal(run([completion], [event]).status, 0);
});

test('a Contract Sync known before closure still blocks a completion snapshot', () => {
  const event = [
    'type: CONTRACT_SYNC',
    'id: CS-CORE-20260923-001',
    'source: core',
    'sourceWorkItem: WI-CORE-002',
    'targets: [sandbox]',
    'scopePaths: [*]',
    'status: C-ACKNOWLEDGED',
    'consumerImportedAt: 2026-09-23T07:48:21.433Z',
    '',
  ].join('\n');
  const result = run([completion], [event]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unresolved relevant CONTRACT_SYNC/);
});

test('W-DONE accepts a namespaced SANDBOX Contract Sync with its sourceWorkItem', () => {
  const result = runPublishedEvent('CS-SANDBOX-20260925-998');
  assert.equal(result.status, 0, result.stderr);
});

test('W-DONE preserves a legacy Contract Sync without rewriting its historical payload', () => {
  const result = runPublishedEvent('CS-20260924-998', false);
  assert.equal(result.status, 0, result.stderr);
});

test('W-DONE rejects a new namespaced SANDBOX event without sourceWorkItem', () => {
  const result = runPublishedEvent('CS-SANDBOX-20260925-999', false);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires a matching sourceWorkItem/);
});
