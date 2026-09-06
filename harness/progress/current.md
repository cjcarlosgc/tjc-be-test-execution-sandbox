# Progreso actual

SDD 1.2 / SYSTEM-1.1 / INTEROP-1.0 sincronizada. No existe implementación en `app/` todavía.

SDD 1.6 queda homologada como línea base conjunta de los tres repositorios y formaliza la entrega Git común: cada commit es un cambio coherente con `Refs: HU...`; cada work item conserva su revisión y, antes del push de cierre de sprint, el reviewer debe aprobar y documentar el rango acumulado exacto que se publicará. `SYSTEM-*` e `INTEROP-*` conservan versionado propio. Commit y push continúan requiriendo solicitud humana explícita.

SDD 1.7 / SYSTEM-1.2 aprueba como entorno temporal de desarrollo y prevalidación la MacBook encendida con Docker Desktop y su VM Linux. El destino previsto continúa siendo una VM Linux remota, pero `DEC-INF-001` mantiene `PENDING` la selección del proveedor, priorizando opciones gratuitas sin asumir que cumplen capacidad, disponibilidad o seguridad. INTEROP-1.0 no cambia.

SDD 1.8 / SYSTEM-1.3 / INTEROP-1.1 elimina el acceso directo del Sandbox a Supabase. Core entrega `EphemeralDownloadRef` con signed URLs cortas e integridad; el host Sandbox descarga y descarta la capacidad, ejecuta sin secretos y devuelve evidencia acotada para persistencia en Core. Se detallan límites mínimos, defensas ZIP, aislamiento del host y separación de red entre descarga/instalación y tests. `DEC-SBX-001`, `DEC-SBX-002`, `DEC-INF-001`, `DEC-MET-001` y `DEC-VAL-001` conservan su alcance.

Quedaron aprobados el alcance TypeScript-only, la neutralidad experimental del Sandbox, Supabase Storage como infraestructura exclusiva de RAG Core y las restricciones para validación empresarial. `DEC-INT-001` queda aprobado mediante el contrato asíncrono universal; `DEC-SBX-001` aún bloquea el scaffold hasta elegir package manager y `DEC-SBX-002` bloquea la instalación de dependencias del proyecto hasta fijar compatibilidad. Mutation score/StrykerJS permanece PENDING y no bloquea Jest/Vitest ordinario.

SDD 1.9 no cambia el contrato neutral del Sandbox ni le traslada la implementación del agente generalista, embeddings o chunking de Core. El único ajuste operativo local confirma Docker Desktop como entorno suficiente de desarrollo/prevalidación durante Sprint 2-4; `DEC-INF-001` sigue PENDING y la selección de proveedor remoto se revisita después de Sprint 4, sin fallback automático. `DEC-SBX-001` y `DEC-SBX-002` permanecen sin resolver y conservan exactamente sus bloqueos locales.
