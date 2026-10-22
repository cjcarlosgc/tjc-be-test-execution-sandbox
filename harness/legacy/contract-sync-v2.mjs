import fs from 'node:fs';
import path from 'node:path';

const root = 'harness/contract-sync';
const inbox = path.join(root, 'inbox');
const outbox = path.join(root, 'outbox');
const checkpoints = new Set(['start', 'before-implementation-delivery', 'before-review', 'before-done']);
const areas = new Set(['executions', 'dto', 'phase', 'executionProfile', 'auth', 'headers', 'idempotency', 'statuses', 'evidence']);
const states = new Set(['PENDING', 'ACKNOWLEDGED', 'RESOLVED']);
const args = process.argv.slice(2), command = args.shift();
const value = (key) => { const i = args.indexOf(`--${key}`); return i < 0 ? undefined : args[i + 1]; };
const fail = (message) => { throw new Error(`CONTRACT_SYNC: ${message}`); };
const mkdir = () => [inbox, outbox].forEach((dir) => fs.mkdirSync(dir, { recursive: true }));
const validate = (event) => {
  for (const key of ['id', 'source', 'targets', 'changedContractAreas', 'requiredActions', 'sourceRevision', 'status', 'createdAt']) if (event?.[key] === undefined || event[key] === '') fail(`missing ${key}`);
  if (!/^CS-[A-Z0-9][A-Z0-9-]*$/.test(event.id) || !['core', 'sandbox'].includes(event.source)) fail('invalid id or source');
  if (!Array.isArray(event.targets) || !event.targets.every((x) => ['core', 'sandbox'].includes(x))) fail('invalid targets');
  if (!Array.isArray(event.changedContractAreas) || !event.changedContractAreas.length || !event.changedContractAreas.every((x) => areas.has(x))) fail('invalid changedContractAreas');
  if (!Array.isArray(event.requiredActions) || !event.requiredActions.length || !event.requiredActions.every((x) => typeof x === 'string' && x.trim())) fail('invalid requiredActions');
  if (!states.has(event.status) || Number.isNaN(Date.parse(event.createdAt))) fail('invalid status or createdAt'); return event;
};
const read = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => validate(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))));
mkdir();
if (command === 'publish') {
  const event = validate({ id: value('id'), source: 'sandbox', targets: value('targets')?.split(',').filter(Boolean), changedContractAreas: value('areas')?.split(',').filter(Boolean), requiredActions: value('actions')?.split('|').filter(Boolean), sourceRevision: value('source-revision'), status: 'PENDING', createdAt: new Date().toISOString(), breaking: value('breaking') === 'true' });
  const target = path.join(outbox, `${event.id}.json`); if (fs.existsSync(target)) fail(`outbox already has ${event.id}`); fs.writeFileSync(target, `${JSON.stringify(event, null, 2)}\n`); console.log(JSON.stringify({ status: 'PUBLISHED', id: event.id, path: target }));
} else if (command === 'import') {
  const source = value('file'); if (!source || !fs.existsSync(source)) fail('existing --file required'); const event = validate(JSON.parse(fs.readFileSync(source, 'utf8'))); const target = path.join(inbox, `${event.id}.json`); if (fs.existsSync(target)) fail(`inbox already has ${event.id}`); fs.copyFileSync(source, target); console.log(JSON.stringify({ status: 'IMPORTED', id: event.id }));
} else if (command === 'check') {
  const checkpoint = value('checkpoint'), workItem = value('work-item'); if (!checkpoints.has(checkpoint) || !workItem) fail('valid --checkpoint and --work-item required'); const pending = read(inbox).filter((e) => e.status === 'PENDING' && e.targets.includes('sandbox') && e.changedContractAreas.some((a) => areas.has(a))); console.log(JSON.stringify({ status: pending.length ? 'BLOCKED' : 'PASSED', checkpoint, workItem, relevantPendingSyncIds: pending.map((e) => e.id), checkedAt: new Date().toISOString() })); process.exitCode = pending.length ? 2 : 0;
} else if (command === 'acknowledge') {
  const id = value('id'), status = value('status'), evidence = value('evidence'); if (!id || !['ACKNOWLEDGED', 'RESOLVED'].includes(status) || !evidence) fail('--id, --status and --evidence required'); const target = path.join(inbox, `${id}.json`); if (!fs.existsSync(target)) fail(`inbox does not have ${id}`); const event = validate(JSON.parse(fs.readFileSync(target, 'utf8'))); event.status = status; event.acknowledgedAt = new Date().toISOString(); event.acknowledgementEvidence = evidence; fs.writeFileSync(target, `${JSON.stringify(validate(event), null, 2)}\n`); console.log(JSON.stringify({ status, id }));
} else fail('use publish, import, check or acknowledge');
