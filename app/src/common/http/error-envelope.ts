export interface ErrorEnvelope {
  statusCode: number;
  code: string;
  message: string;
  details: unknown | null;
  correlationId: string;
  timestamp: string;
  path: string;
}
