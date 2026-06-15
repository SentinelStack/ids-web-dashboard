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
  token?: string;
  account?: AccountView;
  mfaRequired?: boolean;
  mfaToken?: string;
}

/** Outcome of a first-step sign-in: either authenticated, or a 2FA prompt is needed. */
export interface LoginResult {
  mfaRequired: boolean;
  mfaToken?: string;
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

  async login(username: string, password: string): Promise<LoginResult> {
    const res = await firstValueFrom(
      this.api.post<{ username: string; password: string }, LoginResponse>('/auth/login', {
        username,
        password,
      }),
    );
    return this.handleAuth(res?.data);
  }

  /** Second step when the account has 2FA: exchange the challenge + code for a session. */
  async loginMfa(mfaToken: string, code: string): Promise<void> {
    const res = await firstValueFrom(
      this.api.post<{ mfaToken: string; code: string }, LoginResponse>('/auth/mfa', {
        mfaToken,
        code,
      }),
    );
    this.handleAuth(res?.data);
  }

  /** Sign in with a Google ID token; may still return an mfaRequired result. */
  async loginGoogle(idToken: string): Promise<LoginResult> {
    const res = await firstValueFrom(
      this.api.post<{ idToken: string }, LoginResponse>('/auth/google', { idToken }),
    );
    return this.handleAuth(res?.data);
  }

  /** Persist a token+account when present, or surface a 2FA challenge. */
  private handleAuth(data: LoginResponse | undefined): LoginResult {
    if (data?.mfaRequired && data.mfaToken) {
      return { mfaRequired: true, mfaToken: data.mfaToken };
    }
    if (!data?.token) {
      throw new Error('Login failed');
    }
    localStorage.setItem(AuthService.TOKEN_KEY, data.token);
    localStorage.setItem(AuthService.ACCOUNT_KEY, JSON.stringify(data.account));
    return { mfaRequired: false };
  }

  async register(
    username: string,
    password: string,
    email: string,
    fullName: string,
  ): Promise<void> {
    await firstValueFrom(this.api.post('/auth/register', { username, password, email, fullName }));
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
