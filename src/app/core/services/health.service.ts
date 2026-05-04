import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiResponse } from '../models/api-response.model';
import { HealthStatus } from '../models/health-status.model';
import { ApiService } from './api.service';

@Injectable({
  providedIn: 'root'
})
export class HealthService {
  private readonly api = inject(ApiService);

  check(): Observable<ApiResponse<HealthStatus>> {
    return this.api.get<HealthStatus>('/health');
  }
}
