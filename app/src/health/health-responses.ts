export interface HealthLiveResponse {
  status: 'ok';
  timestamp: string;
}

export type HealthCheckStatus = 'ok' | 'unavailable';

export interface HealthCheckDetail {
  status: HealthCheckStatus;
  message: string | null;
}

export interface HealthReadyChecks {
  docker: HealthCheckDetail;
  downloadPolicy: HealthCheckDetail;
  workspace: HealthCheckDetail;
}

export interface HealthReadyResponse {
  status: 'ready' | 'not_ready';
  timestamp: string;
  checks: HealthReadyChecks;
}
