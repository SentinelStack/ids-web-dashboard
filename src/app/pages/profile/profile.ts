import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AccountView, AuthService } from '../../core/services/auth.service';
import {
  AccountService,
  AuditView,
  MfaSetup,
  SessionView,
} from '../../core/services/account.service';

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

  // ── Edit states ───────────────────────────────────────────────────────────
  readonly themeOptions = ['Dark', 'Light', 'System'];
  readonly densityOptions = ['Compact', 'Comfortable', 'Spacious'];
  readonly landingOptions = ['Overview', 'Traffic', 'Incidents', 'Topology', 'Rules'];
  readonly timeFormatOptions = ['24-hour', '12-hour'];

  editingProfile = false;
  profileForm = { fullName: '', email: '', phone: '', language: '', timezone: '' };
  profileErrors: Record<string, string> = {};
  profileServerError = '';

  editingPrefs = false;
  prefsForm = { theme: 'Dark', density: 'Compact', landing: 'Overview', timeFormat: '24-hour' };

  showPasswordModal = false;
  pwForm = { current: '', next: '', confirm: '' };
  pwErrors: Record<string, string> = {};
  pwServerError = '';
  pwSuccess = false;

  showMfaModal = false;
  mfaMode: 'setup' | 'disable' = 'setup';
  mfaSetupData: MfaSetup | null = null;
  mfaCode = '';
  mfaError = '';

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

  // ── Profile edit state ────────────────────────────────────────────────────
  startEditProfile(): void {
    this.profileForm = {
      fullName: this.user.name,
      email: this.user.email,
      phone: this.user.phone,
      language: this.user.language,
      timezone: this.user.timezone,
    };
    this.profileErrors = {};
    this.profileServerError = '';
    this.editingProfile = true;
  }

  cancelEditProfile(): void {
    this.editingProfile = false;
    this.profileErrors = {};
    this.profileServerError = '';
  }

  async saveProfile(): Promise<void> {
    if (this.busy) {
      return;
    }
    if (!this.validateProfile()) {
      return;
    }
    this.busy = true;
    this.profileServerError = '';
    try {
      const account = await this.accountSvc.updateProfile({
        fullName: this.profileForm.fullName.trim(),
        email: this.profileForm.email.trim(),
        phone: this.profileForm.phone.trim(),
        language: this.profileForm.language.trim(),
        timezone: this.profileForm.timezone.trim(),
      });
      this.applyAccount(account);
      this.auth.updateCachedAccount(account);
      this.editingProfile = false;
    } catch (e) {
      this.profileServerError = this.serverMessage(e, 'Could not save profile.');
    } finally {
      this.busy = false;
    }
  }

  private validateProfile(): boolean {
    const errs: Record<string, string> = {};
    const f = this.profileForm;

    const name = f.fullName.trim();
    if (!name) {
      errs['fullName'] = 'Full name is required.';
    } else if (name.length < 2 || name.length > 80) {
      errs['fullName'] = 'Full name must be 2–80 characters.';
    }

    const email = f.email.trim();
    if (!email) {
      errs['email'] = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs['email'] = 'Enter a valid email address.';
    }

    const phone = f.phone.trim();
    if (phone && !/^[+]?[\d\s()-]{7,20}$/.test(phone)) {
      errs['phone'] = 'Enter a valid phone number (7–20 digits).';
    }

    if (!f.language.trim()) {
      errs['language'] = 'Language is required.';
    }
    if (!f.timezone.trim()) {
      errs['timezone'] = 'Timezone is required.';
    }

    this.profileErrors = errs;
    return Object.keys(errs).length === 0;
  }

  // ── Preferences edit state ──────────────────────────────────────────────────
  startEditPrefs(): void {
    this.prefsForm = {
      theme: this.prefs.theme,
      density: this.prefs.density,
      landing: this.prefs.landing,
      timeFormat: this.prefs.timeFormat,
    };
    this.editingPrefs = true;
  }

  cancelEditPrefs(): void {
    this.editingPrefs = false;
  }

  async savePrefs(): Promise<void> {
    if (this.busy) {
      return;
    }
    this.busy = true;
    try {
      const account = await this.accountSvc.updatePreferences({
        theme: this.prefsForm.theme,
        density: this.prefsForm.density,
        landingPage: this.prefsForm.landing,
        timeFormat: this.prefsForm.timeFormat,
      });
      this.applyAccount(account);
      this.auth.updateCachedAccount(account);
      this.editingPrefs = false;
    } catch {
      await this.refresh();
    } finally {
      this.busy = false;
    }
  }

  // ── Password modal ──────────────────────────────────────────────────────────
  openPassword(): void {
    this.pwForm = { current: '', next: '', confirm: '' };
    this.pwErrors = {};
    this.pwServerError = '';
    this.pwSuccess = false;
    this.showPasswordModal = true;
  }

  closePassword(): void {
    this.showPasswordModal = false;
  }

  async savePassword(): Promise<void> {
    if (this.busy) {
      return;
    }
    if (!this.validatePassword()) {
      return;
    }
    this.busy = true;
    this.pwServerError = '';
    try {
      await this.accountSvc.changePassword(this.pwForm.current, this.pwForm.next);
      this.pwSuccess = true;
      await this.refresh();
      this.showPasswordModal = false;
    } catch (e) {
      this.pwServerError = this.serverMessage(
        e,
        'Could not change password — check your current one.',
      );
    } finally {
      this.busy = false;
    }
  }

  private validatePassword(): boolean {
    const errs: Record<string, string> = {};
    const f = this.pwForm;

    if (!f.current) {
      errs['current'] = 'Enter your current password.';
    }
    if (!f.next) {
      errs['next'] = 'Enter a new password.';
    } else if (f.next.length < 8 || f.next.length > 128) {
      errs['next'] = 'Password must be 8–128 characters.';
    } else if (!/^(?=.*[A-Za-z])(?=.*\d).+$/.test(f.next)) {
      errs['next'] = 'Use at least one letter and one number.';
    } else if (f.next === f.current) {
      errs['next'] = 'New password must differ from the current one.';
    }
    if (!f.confirm) {
      errs['confirm'] = 'Re-enter the new password.';
    } else if (f.confirm !== f.next) {
      errs['confirm'] = 'Passwords do not match.';
    }

    this.pwErrors = errs;
    return Object.keys(errs).length === 0;
  }

  /** Pull a human message out of an HttpErrorResponse-ish thrown value. */
  private serverMessage(e: unknown, fallback: string): string {
    const err = e as
      | { error?: { message?: string; validationErrors?: Record<string, string> } }
      | undefined;
    const fieldErrors = err?.error?.validationErrors;
    if (fieldErrors && typeof fieldErrors === 'object') {
      const first = Object.values(fieldErrors)[0];
      if (typeof first === 'string' && first) {
        return first;
      }
    }
    return err?.error?.message || fallback;
  }

  // ── Two-factor authentication ───────────────────────────────────────────
  get mfaActive(): boolean {
    return /enabled/i.test(this.security.mfa);
  }

  async openMfa(): Promise<void> {
    this.mfaMode = this.mfaActive ? 'disable' : 'setup';
    this.mfaCode = '';
    this.mfaError = '';
    this.mfaSetupData = null;
    this.showMfaModal = true;
    if (this.mfaMode === 'setup') {
      this.busy = true;
      try {
        this.mfaSetupData = await this.accountSvc.mfaSetup();
      } catch (e) {
        this.mfaError = this.serverMessage(e, 'Could not start 2FA setup.');
      } finally {
        this.busy = false;
      }
    }
  }

  closeMfa(): void {
    this.showMfaModal = false;
  }

  async confirmMfa(): Promise<void> {
    if (this.busy) {
      return;
    }
    if (!/^\d{6}$/.test(this.mfaCode.trim())) {
      this.mfaError = 'Enter the 6-digit code from your authenticator app.';
      return;
    }
    this.busy = true;
    this.mfaError = '';
    try {
      const code = this.mfaCode.trim();
      const account =
        this.mfaMode === 'setup'
          ? await this.accountSvc.mfaEnable(code)
          : await this.accountSvc.mfaDisable(code);
      this.applyAccount(account);
      this.auth.updateCachedAccount(account);
      this.showMfaModal = false;
    } catch (e) {
      this.mfaError = this.serverMessage(e, 'That code is incorrect — try again.');
    } finally {
      this.busy = false;
    }
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
