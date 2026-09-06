import { Controller, Get } from '@nestjs/common';
import { AppHttpException } from '../common/http/app-http-exception.js';
import type {
  HealthLiveResponse,
  HealthReadyResponse,
} from './health-responses.js';
import { HealthService } from './health.service.js';

/**
 * Sin `BearerAuthGuard`: los probes de infraestructura (orquestador de
 * containers, balanceador) deben poder consultarlos sin el token
 * service-to-service. No ejecutan código del proyecto ni exponen secretos.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  live(): HealthLiveResponse {
    return this.healthService.live();
  }

  @Get('ready')
  async ready(): Promise<HealthReadyResponse> {
    const result = await this.healthService.ready();
    if (result.status === 'not_ready') {
      throw new AppHttpException(
        503,
        'SANDBOX_NOT_READY',
        'Sandbox is not ready to accept executions.',
        result.checks,
      );
    }
    return result;
  }
}
