import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { HealthStatus } from '../models/health-status.model';

@Injectable({
  providedIn: 'root',
})
export class HealthService {
  private readonly http = inject(HttpClient);
  private readonly healthUrl = environment.apiBaseUrl.replace(/\/api$/, '') + '/actuator/health';

  check(): Observable<HealthStatus> {
    return this.http.get<HealthStatus>(this.healthUrl);
  }
}
