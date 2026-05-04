import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiResponse } from '../models/api-response.model';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly http = inject(HttpClient);

  get<T>(path: string): Observable<ApiResponse<T>> {
    return this.http.get<ApiResponse<T>>(path);
  }

  post<TBody, TResponse>(path: string, body: TBody): Observable<ApiResponse<TResponse>> {
    return this.http.post<ApiResponse<TResponse>>(path, body);
  }

  put<TBody, TResponse>(path: string, body: TBody): Observable<ApiResponse<TResponse>> {
    return this.http.put<ApiResponse<TResponse>>(path, body);
  }

  delete<T>(path: string): Observable<ApiResponse<T>> {
    return this.http.delete<ApiResponse<T>>(path);
  }
}
