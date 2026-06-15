import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ActivityService } from '../../core/services/activity.service';

interface Notification {
  key: string;
  label: string;
  on: boolean;
}

interface Session {
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
}

@Component({
  selector: 'app-profile-page',
  imports: [FormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class ProfilePageComponent implements OnInit {
  private static readonly PREFS_KEY = 'aegis-prefs';
  private readonly activitySvc = inject(ActivityService);

  // Static operator identity (single-operator console — no user backend).
  readonly user = {
    name: 'George Lupu',
    username: '@george.lupu',
    email: 'george.lupu@aegis.local',
    role: 'SOC Analyst',
    phone: '+40 700 000 000',
    language: 'English (UK)',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Bucharest',
    accountId: 'USR-0142',
  };

  // Static security reference (no MFA/session backend in this console).
  readonly security = {
    mfa: 'Enabled',
    passwordChanged: '18 days ago',
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

  // Persisted preferences (real, stored in localStorage).
  prefs = {
    theme: 'Dark',
    density: 'Compact',
    landing: 'Overview',
    timeFormat: '24-hour',
    autoRefresh: true,
  };

  notifications: Notification[] = [
    { key: 'critical', label: 'Critical Security Alerts', on: true },
    { key: 'incident', label: 'Incident Updates', on: true },
    { key: 'weekly', label: 'Weekly Summary', on: true },
    { key: 'email', label: 'Email Notifications', on: true },
    { key: 'push', label: 'Mobile Push Notifications', on: false },
    { key: 'maint', label: 'Maintenance Notices', on: true },
  ];

  sessions: Session[] = [];
  activity: ActivityRow[] = [];

  ngOnInit(): void {
    this.loadPrefs();
    this.security.trustedDevice = this.activitySvc.device();
    this.sessions = [
      {
        device: this.activitySvc.device(),
        meta: `${this.user.timezone} · this browser`,
        icon: this.activitySvc.device().includes('iPhone') ? 'smartphone' : 'laptop_mac',
        current: true,
        lastActive: 'now',
      },
      {
        device: 'iPhone',
        meta: `${this.user.timezone} · Mobile App`,
        icon: 'smartphone',
        current: false,
        lastActive: '8 mins ago',
      },
    ];
    this.refreshActivity();
  }

  // ── Derived KPIs (real where possible) ──────────────────────────────────
  get activeSessions(): number {
    return this.sessions.length;
  }

  get notificationsEnabled(): boolean {
    return this.notifications.some((n) => n.on);
  }

  get lastLogin(): string {
    const recs = this.activitySvc.recent();
    if (!recs.length) {
      return 'this session';
    }
    const oldest = new Date(recs[recs.length - 1].at).getTime();
    const mins = Math.max(0, Math.round((Date.now() - oldest) / 60000));
    return mins < 1 ? 'now' : `${mins}m ago`;
  }

  // ── Interaction ─────────────────────────────────────────────────────────
  toggleAutoRefresh(): void {
    this.prefs.autoRefresh = !this.prefs.autoRefresh;
    this.savePrefs();
  }

  toggleNotification(n: Notification): void {
    n.on = !n.on;
    this.savePrefs();
  }

  signOutOthers(): void {
    this.sessions = this.sessions.filter((s) => s.current);
  }

  /** Export the operator's account data (preferences + activity) as JSON. */
  downloadAccountData(): void {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            user: this.user,
            preferences: this.prefs,
            notifications: this.notifications,
            activity: this.activitySvc.recent(),
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    this.download(blob, `account-data-${Date.now()}.json`);
  }

  /** Export the full activity history as CSV. */
  downloadHistory(): void {
    const rows = [
      ['time', 'activity', 'device'],
      ...this.activitySvc.recent().map((r) => [r.at, r.label, r.device]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    this.download(new Blob([csv], { type: 'text/csv' }), `account-activity-${Date.now()}.csv`);
  }

  refreshActivity(): void {
    this.activity = this.activitySvc
      .recent()
      .slice(0, 8)
      .map((r) => ({
        time: this.timeOf(r.at),
        label: r.label,
        device: r.device,
      }));
  }

  private download(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  private timeOf(at: string): string {
    const d = new Date(at);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour12: false });
  }

  private savePrefs(): void {
    try {
      const notif: Record<string, boolean> = {};
      this.notifications.forEach((n) => (notif[n.key] = n.on));
      localStorage.setItem(
        ProfilePageComponent.PREFS_KEY,
        JSON.stringify({ ...this.prefs, notif }),
      );
    } catch {
      /* storage unavailable */
    }
  }

  private loadPrefs(): void {
    try {
      const raw = localStorage.getItem(ProfilePageComponent.PREFS_KEY);
      if (!raw) {
        return;
      }
      const saved = JSON.parse(raw) as Partial<typeof this.prefs> & {
        notif?: Record<string, boolean>;
      };
      this.prefs = {
        theme: saved.theme ?? this.prefs.theme,
        density: saved.density ?? this.prefs.density,
        landing: saved.landing ?? this.prefs.landing,
        timeFormat: saved.timeFormat ?? this.prefs.timeFormat,
        autoRefresh: saved.autoRefresh ?? this.prefs.autoRefresh,
      };
      if (saved.notif) {
        this.notifications = this.notifications.map((n) => ({
          ...n,
          on: saved.notif![n.key] ?? n.on,
        }));
      }
    } catch {
      /* ignore corrupt storage */
    }
  }
}
