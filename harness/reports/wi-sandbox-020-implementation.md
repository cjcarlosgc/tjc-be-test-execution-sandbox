Modelo: implementer · configurado claude-haiku-5-5 · atendido unknown · esfuerzo low

# WI-SANDBOX-020 - Implementación (sincronización espejo de contratos)

## 1. Regeneración de contratos

- Comando: `pnpm contracts:generate` (en `app/`). Resultado: "Contratos generados en src/contracts/generated (5 esquemas)".
- Archivos cambiados: solo `app/src/contracts/generated/contract-schemas.ts` (+760) y `app/src/contracts/generated/contract-types.ts` (+196).
- Diff: solo adiciones (0 líneas eliminadas).
- Tipos nuevos (todos del esquema `github-webhook-event`): `GithubId`, `NullableGithubId`, `NullableString`, `WebhookDeliveryId`, `WebhookEventName`, `WebhookAction`, `WebhookReceivedAt`, `WebhookCreatedAtUtc`, `GithubRepositoryOwner`, `GithubPullRequestNumber`, `GithubWebhookEvent` (unión), `GithubRepositoryRef`, `GithubRepositoryWithOwner`, `GithubRefAndSha`, `GithubPullRequest`, `GithubAccount`, `GithubWebhookPullRequestData`, `GithubWebhookInstallationData`, `GithubWebhookInstallationRepositoriesData`, `GithubWebhookRepositoryData`, `GithubWebhookMemberData`, `GithubWebhookMembershipData`, `GithubWebhookOrganizationData`, `GithubWebhookTeamData`, `GithubWebhookIgnoredData`, y las interfaces `GithubWebhook*Event` y `GitHubWebhookAcceptedResponse`.
- No cambiaron `sandbox-execution` ni `error-envelope` (ningún tipo o validador de esos esquemas aparece modificado; el diff no contiene eliminaciones).
- Nota: el manifest y `sandbox-result.failed.json` no generan código en `generated/` (sin cambio en el diff), por lo que no arrastran cambios de tipos.

## 2. Ajustes de pruebas/fixtures

- `git grep` en `app/` (excluyendo `src/contracts/generated/`):
  - `COMPOSER_INSTALL_FAILED`: 0 coincidencias.
  - `sandbox-result.failed.json`: 0 coincidencias.
  - `DEPENDENCY_INSTALL_FAILED`: `src/common/errors/sandbox-fact-error.ts:87` (producción, no tocada), `src/executions/execution-pipeline.service.spec.ts:626` y `:839` (ya esperan `DEPENDENCY_INSTALL_FAILED`).
- Conclusión: no hay pruebas ni fixtures que dependan del código viejo. **No se modificó ningún archivo de prueba o fixture.** Producción no se tocó.

## 3. Resultados (comandos reales)

| Comando | Exit | Resultado |
|---|---|---|
| `pnpm lint` (oxlint src/ test/) | 0 | sin errores |
| `pnpm build` (nest build) | 0 | OK |
| `pnpm contracts:check` | 0 | OK |
| `pnpm test` (vitest run) | 0 | Test Files 36 passed, 1 skipped (37); Tests 319 passed, 5 skipped (324) |
| `pnpm test:e2e` | 0 | Test Files 2 passed, 1 skipped (3); Tests 15 passed, 6 skipped (21) |
| vitest explícito: executions.contract-real.spec.ts, core-client.contract.spec.ts, executions.contract.spec.ts, http-exception.filter.generic.spec.ts | 0 | Test Files 4 passed (4); Tests 35 passed, 1 skipped (36) |

- Nota: el proyecto usa Vitest (no Jest); el comando explícito se ejecutó con `pnpm exec vitest run`.
- Docker no estaba disponible en la sesión (`docker info` falló); los specs contract-real pasaron igualmente.
- `app/.env` no fue leído ni tocado.

## 4. Estado

- Sin commit ni push. Cambios en el árbol: `app/src/contracts/generated/contract-schemas.ts` y `app/src/contracts/generated/contract-types.ts`, más este reporte.
- Pendiente: revisión independiente (`reviewer`) antes de dar `W-DONE`.

## Nota del leader (espejo final)
Este informe se redactó cuando el espejo apuntaba a 2.20/2.15. Cross avisó después de `CS-CORE-20261024-004` (SYSTEM-2.16 / INTEROP-2.21), que supera a -002 en INTEROP/SYSTEM con el mismo árbol de esquemas (`8079ab73…`): el espejo final se tomó del commit `2318b9df` de Core. Los tipos regenerados no cambian porque dependen solo de los esquemas (idénticos); el leader volvió a ejecutar `pnpm contracts:check`, `pnpm lint` y `pnpm test` (319 pasan, 5 omitidos) contra el espejo final.
