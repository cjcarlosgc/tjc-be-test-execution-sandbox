# Esquema del estado del harness V2

`harness/state.json` es checkpoint operativo, no fuente de verdad funcional. IDs y rutas apuntan a SDD canónica; no duplica decisiones ni contratos.

```json
{
  "schemaVersion": 3,
  "sddVersion": "2.1",
  "allowedStatuses": ["SELECTED", "SPEC_VERIFIED", "AWAITING_APPROVAL", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DECISION_REQUIRED", "DONE"],
  "activeWorkItem": {
    "id": "HUxx-slug | T-xxx-harness-v2", "workItemType": "PRODUCT | HARNESS",
    "storyIds": ["HUxx"], "sprint": "Sprint N | T-xxx", "status": "SELECTED",
    "specPaths": ["spec/features/..."], "transversalPaths": ["spec/transversal/..."], "approved": false,
    "decisionGate": { "checked": false, "blockingDecisionIds": [], "nonBlockingDecisionIds": [], "checkedAt": null },
    "execution": { "leaderAgent": "leader", "analysisAgent": "sdd-analyst | null", "implementationAgent": "implementer | null", "contractReviewAgent": "contract-reviewer | null", "reviewAgent": "reviewer | null", "handoffs": [], "reviewCycles": 0, "maxReviewCycles": 2 },
    "gates": { "sddVerified": "NOT_RUN", "implementationCompleted": "NOT_RUN", "contractReviewed": "NOT_APPLICABLE", "independentReviewPassed": "NOT_RUN", "technicalChecksPassed": "NOT_RUN", "executionEvidencePassed": "NOT_APPLICABLE", "interopSyncChecked": "NOT_RUN", "isolationChecksPassed": "NOT_APPLICABLE", "noBlockingDecisions": "NOT_RUN", "retryLimitRespected": "NOT_RUN" },
    "coordination": { "contractImpact": false, "executionImpact": false, "pullCheckpoints": [], "publishedSyncIds": [], "pendingRelevantSyncIds": [] },
    "evidence": [], "createdAt": "ISO-8601", "updatedAt": "ISO-8601", "blockedReason": null
  }
}
```

Cada gate vale `PASSED`, `FAILED`, `NOT_RUN` o `NOT_APPLICABLE`; este último exige justificación en evidencia. `executionEvidencePassed` e `isolationChecksPassed` son obligatorios si `executionImpact=true`; `contractReviewed` si `contractImpact=true` o hay sync relevante. Para DONE, `interopSyncChecked=PASSED` exige los cuatro checkpoints y ningún sync relevante pendiente.

`SPEC_VERIFIED` y estados posteriores requieren decisionGate comprobado, fecha y cero decisiones bloqueantes. Una decisión bloqueante requiere `BLOCKED`/`DECISION_REQUIRED` y pregunta concreta. PRODUCT requiere `approved=true` desde IN_PROGRESS; HARNESS evidencia que no alteró producto/contratos/infraestructura. El validador comprueba roles, gates, reintentos, checkpoints, handoffs y cierre. Al cerrar, `activeWorkItem=null`.
