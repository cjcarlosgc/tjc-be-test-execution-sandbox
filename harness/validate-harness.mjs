import fs from 'node:fs';

const roles = ['leader.md', 'sdd-analyst.md', 'implementer.md', 'contract-reviewer.md', 'reviewer.md'];
const gates = ['sddVerified', 'implementationCompleted', 'contractReviewed', 'independentReviewPassed', 'technicalChecksPassed', 'executionEvidencePassed', 'interopSyncChecked', 'isolationChecksPassed', 'noBlockingDecisions', 'retryLimitRespected'];
const values = new Set(['PASSED', 'FAILED', 'NOT_RUN', 'NOT_APPLICABLE']);
const requiredHandoff = ['status', 'findings', 'blockers', 'filesAffected', 'evidence', 'recommendedNextStep'];
const checkpoints = ['start', 'before-implementation-delivery', 'before-review', 'before-done'];
const state = JSON.parse(fs.readFileSync('harness/state.json', 'utf8'));
const example = JSON.parse(fs.readFileSync('harness/examples/fan-out-fan-in.json', 'utf8'));
const work = state.activeWorkItem;
let ok = state.schemaVersion === 3 && state.allowedStatuses.includes('DECISION_REQUIRED') && roles.every((role) => fs.existsSync(`harness/roles/${role}`)) && !fs.existsSync('harness/roles/analyst.md') && Array.isArray(example.sequence?.[3]) && example.sequence[3].includes('reviewer') && example.sequence[3].includes('contract-reviewer') && JSON.stringify(example.pullCheckpoints) === JSON.stringify(checkpoints) && fs.existsSync('harness/contract-sync/inbox') && fs.existsSync('harness/contract-sync/outbox');
if (work) {
  const execution = work.execution ?? {}, coordination = work.coordination ?? {}, workGates = work.gates ?? {};
  ok &&= execution.leaderAgent === 'leader' && Number.isInteger(execution.reviewCycles) && Number.isInteger(execution.maxReviewCycles) && execution.maxReviewCycles === 2 && execution.reviewCycles <= execution.maxReviewCycles && Array.isArray(execution.handoffs) && execution.handoffs.every((handoff) => requiredHandoff.every((field) => Object.hasOwn(handoff, field))) && gates.every((gate) => values.has(workGates[gate])) && Array.isArray(coordination.pullCheckpoints) && Array.isArray(coordination.pendingRelevantSyncIds) && Array.isArray(work.evidence);
  if (work.status === 'DONE') {
    ok &&= checkpoints.every((checkpoint) => coordination.pullCheckpoints.some((entry) => entry.checkpoint === checkpoint)) && gates.filter((gate) => !['contractReviewed', 'executionEvidencePassed', 'isolationChecksPassed'].includes(gate)).every((gate) => workGates[gate] === 'PASSED') && coordination.pendingRelevantSyncIds.length === 0;
  }
  if (coordination.contractImpact || coordination.pendingRelevantSyncIds.length) ok &&= workGates.contractReviewed === 'PASSED';
  if (coordination.executionImpact) ok &&= workGates.executionEvidencePassed === 'PASSED' && workGates.isolationChecksPassed === 'PASSED';
  if (work.status === 'BLOCKED' || work.status === 'DECISION_REQUIRED') ok &&= typeof work.blockedReason === 'string' && work.blockedReason.trim().endsWith('?');
}
if (!ok) { console.error('Harness V2 validation failed.'); process.exitCode = 1; } else console.log('Harness V2 validation passed.');
