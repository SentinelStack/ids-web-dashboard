import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AccountView, AuthService } from '../../core/services/auth.service';
import { AccountService, AuditView, SessionView } from '../../core/services/account.service';

interface NotificationRow {
  key: string;
  label: string;
  on: boolean;
}

interface SessionRow {
  device: string;
  meta: string;
  icon: string;
  current: boolean;
  lastActive: string;
}

interface ActivityRow {
  time: string;
  label: string;
  device: string;
  status: string;
}

const NOTIFICATION_LABELS: { key: string; label: string }[] = [
  { key: 'critical', label: 'Critical Security Alerts' },
  { key: 'incident', label: 'Incident Updates' },
  { key: 'weekly', label: 'Weekly Summary' },
  { key: 'email', label: 'Email Notifications' },
  { key: 'push', label: 'Mobile Push Notifications' },
  { key: 'maintenance', label: 'Maintenance Notices' },
];

@Component({
  selector: 'app-profile-page',
  imports: [FormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class ProfilePageComponent implements OnInit {
  private readonly accountSvc = inject(AccountService);
  private readonly auth = inject(AuthService);

  user = {
    name: '',
    username: '',
    email: '',
    role: '',
    phone: '',
    language: '',
    timezone: '',
    accountId: '',
  };

  security = {
    mfa: 'Disabled',
    passwordChanged: '—',
    loginAlerts: 'Enabled',
    trustedDevice: '',
    sessionTimeout: '30 minutes',
    apiAccess: 'Disabled',
  };

  readonly privacy = [
    'Traffic visibility is restricted to assigned edge groups.',
    'Processed events are logged for security auditing.',
    'Activity logging is enabled for all session interactions.',
    'Export metadata includes timestamp and source IP.',
  ];

  prefs = {
    theme: 'Dark',
    density: 'Compact',
    landing: 'Overview',
    timeFormat: '24-hour',
    autoRefresh: true,
  };

  notifications: NotificationRow[] = [];
  sessions: SessionRow[] = [];
  activity: ActivityRow[] = [];

  busy = false;

  ngOnInit(): void {
    // Paint instantly from the cached account, then refresh from the backend.
    const cached = this.auth.account;
    if (cached) {
      this.applyAccount(cached);
    }
    void this.refresh();
  }

  // ── KPIs ─────────────────────────────────────────────────────────────────
  get activeSessions(): number {
    return this.sessions.length;
  }

  get notificationsEnabled(): boolean {
    return this.notifications.some((n) => n.on);
  }

  get lastLogin(): string {
    const login = this.activity.find((a) => /sign(ed)?[ -]?in|login/i.test(a.label));
    return login ? login.time : 'this session';
  }

  // ── Mutations (all persisted to the backend) ──────────────────────────────
  async toggleAutoRefresh(): Promise<void> {
    if (this.busy) {
      return;
    }
    const next = !this.prefs.autoRefresh;
    this.prefs.autoRefresh = next;
    await this.guarded(() => this.accountSvc.updatePreferences({ autoRefresh: next }));
  }

  async toggleNotification(n: NotificationRow): Promise<void> {
    if (this.busy) {
      return;
    }
    n.on = !n.on;
    const map: Record<string, boolean> = {};
    this.notifications.forEach((row) => (map[row.key] = row.on));
    await this.guarded(() => this.accountSvc.updateNotifications(map));
  }

  async editProfile(): Promise<void> {
    const fullName = window.prompt('Full name', this.user.name)?.trim();
    if (fullName == null) {
      return;
    }
    const phone = window.prompt('Phone', this.user.phone)?.trim() ?? this.user.phone;
    const email = window.prompt('Email', this.user.email)?.trim() ?? this.user.email;
    await this.guarded(() => this.accountSvc.updateProfile({ fullName, phone, email }));
  }

  async changePassword(): Promise<void> {
    const current = window.prompt('Current password');
    if (!current) {
      return;
    }
    const next = window.prompt('New password (min 8 chars)');
    if (!next) {
      return;
    }
    if (next.length < 8) {
      window.alert('Password must be at least 8 characters.');
      return;
    }
    if (this.busy) {
      return;
    }
    this.busy = true;
    try {
      await this.accountSvc.changePassword(current, next);
      await this.refresh();
      window.alert('Password changed.');
    } catch {
      window.alert('Could not change password — check your current password.');
    } finally {
      this.busy = false;
    }
  }

  async toggleMfa(): Promise<void> {
    const enable = !/enabled/i.test(this.security.mfa);
    await this.guarded(() => this.accountSvc.setMfa(enable));
  }

  async signOutOthers(): Promise<void> {
    if (this.busy) {
      return;
    }
    this.busy = true;
    try {
      await this.accountSvc.revokeOtherSessions();
      this.sessions = await this.loadSessions();
    } catch {
      /* keep current */
    } finally {
      this.busy = false;
    }
  }

  // ── Exports ────────────────────────────────────────────────────────────────
  downloadAccountData(): void {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            user: this.user,
            security: this.security,
            preferences: this.prefs,
            notifications: this.notifications,
            sessions: this.sessions,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    this.download(blob, `account-data-${Date.now()}.json`);
  }

  downloadHistory(): void {
    const rows = [
      ['time', 'activity', 'device', 'status'],
      ...this.activity.map((r) => [r.time, r.label, r.device, r.status]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    this.download(new Blob([csv], { type: 'text/csv' }), `account-activity-${Date.now()}.csv`);
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  private async refresh(): Promise<void> {
    try {
      const [account, sessions, activity] = await Promise.all([
        this.accountSvc.me(),
        this.loadSessions(),
        this.loadActivity(),
      ]);
      this.applyAccount(account);
      this.sessions = sessions;
      this.activity = activity;
    } catch {
      /* keep whatever we already painted */
    }
  }

  private async loadSessions(): Promise<SessionRow[]> {
    const raw = await this.accountSvc.sessions();
    return raw.map((s: SessionView) => ({
      device: s.device,
      meta: `${s.ip || 'unknown IP'} · ${this.timeOf(s.createdAt)}`,
      icon: /iphone|android|mobile/i.test(s.device) ? 'smartphone' : 'laptop_mac',
      current: s.current,
      lastActive: this.relative(s.lastSeenAt),
    }));
  }

  private async loadActivity(): Promise<ActivityRow[]> {
    const raw = await this.accountSvc.activity(8);
    return raw.map((a: AuditView) => ({
      time: this.timeOf(a.at),
      label: a.action,
      device: a.device,
      status: a.status,
    }));
  }

  private applyAccount(a: AccountView): void {
    this.user = {
      name: a.fullName,
      username: `@${a.username}`,
      email: a.email,
      role: a.role,
      phone: a.phone,
      language: a.language,
      timezone: a.timezone,
      accountId: a.accountId,
    };
    this.security = {
      mfa: a.mfaEnabled ? 'Enabled' : 'Disabled',
      passwordChanged: a.passwordChangedAt ? this.relative(a.passwordChangedAt) : '—',
      loginAlerts: 'Enabled',
      trustedDevice: this.sessions.find((s) => s.current)?.device ?? '',
      sessionTimeout: `${a.sessionTimeoutMinutes} minutes`,
      apiAccess: a.apiAccessEnabled ? 'Enabled' : 'Disabled',
    };
    this.prefs = {
      theme: a.preferences.theme,
      density: a.preferences.density,
      landing: a.preferences.landingPage,
      timeFormat: a.preferences.timeFormat,
      autoRefresh: a.preferences.autoRefresh,
    };
    this.notifications = NOTIFICATION_LABELS.map((l) => ({
      key: l.key,
      label: l.label,
      on: a.notifications?.[l.key] ?? false,
    }));
  }

  /** Run a backend mutation, sync the cached account, and refresh derived rows. */
  private async guarded(fn: () => Promise<AccountView>): Promise<void> {
    this.busy = true;
    try {
      const account = await fn();
      this.applyAccount(account);
      this.auth.updateCachedAccount(account);
    } catch {
      await this.refresh();
    } finally {
      this.busy = false;
    }
  }

  private download(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  private timeOf(at?: string): string {
    if (!at) {
      return '';
    }
    const d = new Date(at);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour12: false });
  }

  private relative(at?: string): string {
    if (!at) {
      return '—';
    }
    const t = new Date(at).getTime();
    if (Number.isNaN(t)) {
      return '—';
    }
    const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (mins < 1) {
      return 'now';
    }
    if (mins < 60) {
      return `${mins}m ago`;
    }
    const hrs = Math.round(mins / 60);
    if (hrs < 24) {
      return `${hrs}h ago`;
    }
    return `${Math.round(hrs / 24)}d ago`;
  }
}
