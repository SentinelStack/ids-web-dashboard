export interface HealthStatus {
  status: 'UP' | 'DOWN';
  service: string;
  checkedAt: string;
}
