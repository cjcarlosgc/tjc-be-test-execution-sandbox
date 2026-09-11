# Roadmap

## Sprint 1
Meta acumulada aproximada: 35%. Esqueleto NestJS, Execution API, Object Storage access, workspace seguro, Docker smoke execution y primer adapter Jest/Vitest.

## Sprint 2 / PI1
Meta acumulada: 80%. Integración real con RAG Core, materialización CREATE/MERGE, instalación, compilación, Jest/Vitest estructurado, failure evidence, batch validation y cleanup robusto. Soporta HU08-HU19.

## Puerta de investigación posterior al núcleo de Sprint 2

Mutation score/StrykerJS (`DEC-MET-001`) es una mejora próxima deseada, pero permanece PENDING hasta investigar aislamiento, costo, tiempo y contrato de resultados coordinado. No bloquea el núcleo de Sprint 2; solo bloquea el work item futuro que intente ejecutar mutation testing.

## Sprint 3
Meta acumulada: 90%. Endurecimiento de límites, observabilidad y confiabilidad. HU23/autorreparación está descartada; un retry manual de Core es simplemente una nueva ejecución neutral con identidad propia.

## Sprint 4
Meta: 100%. Estabilización, rendimiento, pruebas de estrés acotadas, políticas de cleanup y soporte opcional de coverage si se aprueba como métrica secundaria.

HU27-HU29 no requieren cambios funcionales en el Sandbox: trazas, autenticación por propietario y experiencia GitHub mock pertenecen a Core/Developer Console. La demo GitHub no está bloqueada por este servicio y no invoca `/executions`; cualquier ejecución futura originada por GitHub mantendrá el contrato neutral vigente.

La validación final en empresa queda sujeta a `DEC-VAL-001`; ninguna prueba local o simulada sustituye esa ejecución real.
