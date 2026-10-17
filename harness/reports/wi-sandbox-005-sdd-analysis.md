# WI-SANDBOX-005 — SDD analysis

Date: 2026-10-12  
Status: `SPEC_VERIFIED`; no product code or infrastructure changed.  
Configured model: GPT-6 Luna / high; served model: unknown.

## Findings

- `WorkspaceManager.createWorkspace` creates the host-owned execution root with mode `0700`; the PHP runner uses `sandbox` UID/GID 10001. The VM smoke observed that UID 10001 could neither read nor write the workspace. The failure is consistent with the permissions mismatch.
- A narrowly scoped ACL for UID 10001 is plausible without changing the HTTP contract, `SDD 2.1`, `SYSTEM-2.2`, `INTEROP-2.8`, or the PHP container identity. It must preserve host-side access for evidence and cleanup, and isolation between workspaces.
- The container runs untrusted project code. Code that owns a descendant directory may change its mode/ACL and interfere with host traversal or cleanup. Tests must exercise that adversarial case and avoid claiming ACLs make the workspace tamper-proof.
- The current VM does not have `setfacl`; the Linux `acl` utility is an operational prerequisite. Installing it is an external VM change and is outside WI-SANDBOX-005; no installation was performed or authorized.
- `DEC-INF-001` blocks provisioning remote infrastructure, not this local code change. `DEC-VAL-001` blocks enterprise-code ingestion/evidence, not a repository the user controls for the pilot.
- There is no `harness/work-items.json` in this repository; Sandbox tracks one active item in `harness/state.json`.
- `spec/constitution/delivery-workflow.md` requires every commit to cite existing `HU...` IDs and forbids a commit when no applicable HU can be identified. User approval for `storyIds: []` does not authorize inventing a story or silently changing that policy.

## Acceptance checks for the technical cut

1. UID 10001 can read the extracted PHP project and write installation/test outputs in its own workspace.
2. The host service can inspect evidence and remove the workspace after ordinary execution.
3. Another execution UID/workspace receives no access; no world-writable permissions or root PHP execution are introduced.
4. The behavior is tested with nested snapshot paths, artifact materialization, and a container-owned path whose mode is changed adversarially; cleanup limitations/failures remain observable and safe.
5. Missing or ineffective ACL support fails closed; the service must not silently proceed with an inaccessible workspace.
6. No contracts, VM configuration, firewall, or package installation changes are included.

## Blocker

The code cut can proceed under the user's explicit scope approval, but a commit and any publication are blocked until the project resolves how to trace a no-HU technical WI under the current commit rule. Do not invent a HU or make a WI-only commit under the current policy.

## Recommended next step

Implement the ACL setup and focused tests locally, including the adversarial cleanup case. Keep the VM package prerequisite separate. Before creating a commit, ask the user whether to associate the cut with an existing HU or amend the canonical delivery traceability rule for technical WIs without a HU.
