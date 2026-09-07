import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getNumberConfig } from '../common/config/get-number-config.js';
import { WorkspaceManager } from './workspace-manager.js';

const DEFAULT_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Programa `WorkspaceManager.sweepExpired()` periódicamente
 * (timeouts-cleanup / temporary-workspaces transversal: "un sweeper elimina
 * recursos huérfanos por TTL"). El sweeper es idempotente y no interfiere
 * con ejecuciones activas: solo actúa sobre directorios más antiguos que el
 * TTL configurado.
 */
@Injectable()
export class WorkspaceSweeperService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkspaceSweeperService.name);
  private readonly intervalMs: number;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly workspaceManager: WorkspaceManager,
    configService: ConfigService,
  ) {
    this.intervalMs = getNumberConfig(
      configService,
      'SANDBOX_SWEEPER_INTERVAL_MS',
      DEFAULT_SWEEP_INTERVAL_MS,
    );
  }

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.sweep();
    }, this.intervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async sweep(): Promise<string[]> {
    try {
      const removed = await this.workspaceManager.sweepExpired();
      if (removed.length > 0) {
        this.logger.log(
          `sweeper removed ${removed.length} orphaned workspace(s)`,
        );
      }
      return removed;
    } catch (error) {
      this.logger.warn(`sweeper run failed: ${(error as Error).message}`);
      return [];
    }
  }
}
