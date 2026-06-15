import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AccountView } from './auth.service';
import { ApiService } from './api.service';

export interface SessionView {
  id: string;
  device: string;
  ip: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export interface AuditView {
  at: string;
  action: string;
  device: string;
  ip: string;
  status: string;
}

export interface ProfileUpdate {
  fullName?: string;
  email?: string;
  phone?: string;
  language?: string;
  timezone?: string;
}

export interface PreferencesUpdate {
  theme?: string;
  density?: string;
  landingPage?: string;
  timeFormat?: string;
  autoRefresh?: boolean;
}

/**
 * Reads/writes the authenticated operator's account against /api/account.
 * Sessions and activity come back as Spring HATEOAS CollectionModels, so we
 * unwrap the `_embedded` payload generically.
 */
@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly api = inject(ApiService);

  async me(): Promise<AccountView> {
    const res = await firstValueFrom(this.api.get<AccountView>('/account'));
    return res!.data as AccountView;
  }

  async updateProfile(body: ProfileUpdate): Promise<AccountView> {
    const res = await firstValueFrom(this.api.put<ProfileUpdate, AccountView>('/account/profile', body));
    return res!.data as AccountView;
  }

  async updatePreferences(body: PreferencesUpdate): Promise<AccountView> {
    const res = await firstValueFrom(
      this.api.put<PreferencesUpdate, AccountView>('/account/preferences', body),
    );
    return res!.data as AccountView;
  }

  async updateNotifications(notifications: Record<string, boolean>): Promise<AccountView> {
    const res = await firstValueFrom(
      this.api.put<{ notifications: Record<string, boolean> }, AccountView>('/account/notifications', {
        notifications,
      }),
    );
    return res!.data as AccountView;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await firstValueFrom(
      this.api.post('/account/password', { currentPassword, newPassword }),
    );
  }

  async setMfa(enabled: boolean): Promise<AccountView> {
    const res = await firstValueFrom(this.api.post<{ enabled: boolean }, AccountView>('/account/mfa', { enabled }));
    return res!.data as AccountView;
  }

  async sessions(): Promise<SessionView[]> {
    const res = await firstValueFrom(this.api.get<unknown>('/account/sessions'));
    return this.unwrap<SessionView>(res?.data);
  }

  async revokeOtherSessions(): Promise<void> {
    await firstValueFrom(this.api.post('/account/sessions/revoke-others', {}));
  }

  async activity(limit = 8): Promise<AuditView[]> {
    const res = await firstValueFrom(this.api.get<unknown>(`/account/activity?limit=${limit}`));
    return this.unwrap<AuditView>(res?.data);
  }

  /**
   * Pull the list out of a Spring HATEOAS CollectionModel. The backend renders
   * these as `{ content: [...], links: [...] }`, so read `content` (tolerating
   * a plain array or an empty payload).
   */
  private unwrap<T>(data: unknown): T[] {
    if (Array.isArray(data)) {
      return data as T[];
    }
    const content = (data as { content?: unknown } | null)?.content;
    return Array.isArray(content) ? (content as T[]) : [];
  }
}
