# Tech stack

**Estado:** aprobado salvo PENDING explícitos

- NestJS + TypeScript.
- Docker Engine/API mediante `dockerode`.
- Jest y Vitest adapters.
- JSON estructurado de runner cuando esté disponible; stdout/stderr como evidencia secundaria.
- HTTP interno desde RAG Core.
- Object Storage para descargar `source.zip`.
- **PENDING:** package manager del propio servicio y proveedor concreto de Object Storage.
- Imagen/runtime Node seleccionable/configurable; no fijar una sola versión global para todos los proyectos.
