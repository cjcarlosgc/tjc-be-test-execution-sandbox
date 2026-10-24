import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Dockerode from 'dockerode';
import { DOCKER_CLIENT } from './docker-client.provider.js';

/** Nombre de los contenedores que crea `ContainerRunner`: `sandbox-<executionId UUID>-<sufijo>`. */
const SANDBOX_CONTAINER_NAME = /^\/sandbox-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/;

/**
 * Al arrancar, elimina los contenedores `sandbox-*` que dejó un proceso anterior (caída, reinicio o despliegue en
 * mitad de una ejecución). El estado se recarga de disco (`FileExecutionRepository`) y toda ejecución no terminal
 * restaurada se marca `FAILED` con `SANDBOX_RESTARTED`, así que al iniciar no hay ejecuciones en curso reales y
 * cualquier contenedor de ese tipo es huérfano. Nunca bloquea el arranque ni lanza.
 * Se desactiva con `SANDBOX_RECONCILE_ORPHANS_ON_START=false`.
 */
@Injectable()
export class OrphanContainerReconciler implements OnModuleInit {
  private readonly logger = new Logger(OrphanContainerReconciler.name);

  constructor(
    @Inject(DOCKER_CLIENT) private readonly docker: Dockerode,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    if (String(this.configService.get('SANDBOX_RECONCILE_ORPHANS_ON_START') ?? 'true') === 'false') return;
    void this.reconcile();
  }

  /** Devuelve cuántos contenedores huérfanos se eliminaron. */
  async reconcile(): Promise<number> {
    try {
      const containers = await this.docker.listContainers({ all: true });
      const orphans = containers.filter((info) => (info.Names ?? []).some((name) => SANDBOX_CONTAINER_NAME.test(name)));
      let removed = 0;
      for (const info of orphans) {
        try {
          await this.docker.getContainer(info.Id).remove({ force: true });
          removed += 1;
        } catch (error) {
          this.logger.warn(`No se pudo eliminar el contenedor huérfano ${info.Id.slice(0, 12)}: ${(error as Error).message}`);
        }
      }
      if (removed > 0) this.logger.warn(`Reconciliación de arranque: ${removed} contenedor(es) huérfano(s) eliminado(s).`);
      return removed;
    } catch (error) {
      this.logger.warn(`Reconciliación de contenedores omitida (Docker no disponible): ${(error as Error).message}`);
      return 0;
    }
  }
}
