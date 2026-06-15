import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService } from './api.service';

export interface AccountView {
  username: string;
  email: string;
  fullName: string;
  phone: string;
  role: string;
  language: string;
  timezone: string;
  accountId: string;
  mfaEnabled: boolean;
  apiAccessEnabled: boolean;
  sessionTimeoutMinutes: number;
  passwordChangedAt?: string;
  preferences: {
    theme: string;
    density: string;
    landingPage: string;
    timeFormat: string;
    autoRefresh: boolean;
  };
  notifications: Record<string, boolean>;
}

interface LoginResponse {
  token: string;
  account: AccountView;
}

/** Holds the JWT + cached account, and performs login/logout against the backend. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  static readonly TOKEN_KEY = 'aegis-token';
  static readonly ACCOUNT_KEY = 'aegis-account';

  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  get token(): string | null {
    return localStorage.getItem(AuthService.TOKEN_KEY);
  }

  get isAuthenticated(): boolean {
    return !!this.token;
  }

  get account(): AccountView | null {
    try {
      const raw = localStorage.getItem(AuthService.ACCOUNT_KEY);
      return raw ? (JSON.parse(raw) as AccountView) : null;
    } catch {
      return null;
    }
  }

  async login(username: string, password: string): Promise<void> {
    const res = await firstValueFrom(
      this.api.post<{ username: string; password: string }, LoginResponse>('/auth/login', {
        username,
        password,
      }),
    );
    const data = res?.data;
    if (!data?.token) {
      throw new Error('Login failed');
    }
    localStorage.setItem(AuthService.TOKEN_KEY, data.token);
    localStorage.setItem(AuthService.ACCOUNT_KEY, JSON.stringify(data.account));
  }

  async register(username: string, password: string, email: string, fullName: string): Promise<void> {
    await firstValueFrom(
      this.api.post('/auth/register', { username, password, email, fullName }),
    );
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.api.post('/auth/logout', {}));
    } catch {
      /* best effort */
    }
    this.clear();
    void this.router.navigate(['/login']);
  }

  /** Replace the cached account snapshot after a profile/preferences change. */
  updateCachedAccount(account: AccountView): void {
    localStorage.setItem(AuthService.ACCOUNT_KEY, JSON.stringify(account));
  }

  clear(): void {
    localStorage.removeItem(AuthService.TOKEN_KEY);
    localStorage.removeItem(AuthService.ACCOUNT_KEY);
  }
}
