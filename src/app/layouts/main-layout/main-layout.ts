import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { ActivityService } from '../../core/services/activity.service';
import { AuthService } from '../../core/services/auth.service';
import { HateoasService } from '../../core/services/hateoas.service';

interface DashboardLiveDto {
  liveAlerts: {
    severity: string;
    level: string;
    timestamp: string;
    title: string;
    source: string;
    destination: string;
  }[];
}

export interface NotificationVM {
  severity: string;
  level: string;
  title: string;
  source: string;
  time: string;
  at: number;
}

@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.scss',
})
export class MainLayoutComponent implements OnInit, OnDestroy {
  private static readonly REFRESH_MS = 20000;
  private static readonly SEEN_KEY = 'aegis-notif-seen';

  private readonly activity = inject(ActivityService);
  private readonly auth = inject(AuthService);
  private readonly hateoas = inject(HateoasService);
  private readonly router = inject(Router);

  private timer?: ReturnType<typeof setInterval>;

  notifications: NotificationVM[] = [];
  notifOpen = false;
  unreadCount = 0;

  get operatorName(): string {
    return this.auth.account?.fullName || this.auth.account?.username || 'Operator';
  }

  ngOnInit(): void {
    // Record real in-app navigation for the Profile activity log.
    this.activity.start();
    void this.refreshNotifications();
    this.timer = setInterval(
      () => void this.refreshNotifications(),
      MainLayoutComponent.REFRESH_MS,
    );
  }

  ngOnDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  logout(): void {
    void this.auth.logout();
  }

  // ── Notifications ─────────────────────────────────────────────────────────
  toggleNotifications(event: MouseEvent): void {
    event.stopPropagation();
    this.notifOpen = !this.notifOpen;
    if (this.notifOpen) {
      this.markAllSeen();
    }
  }

  /** Close the dropdown on any click outside it. */
  @HostListener('document:click')
  closeNotifications(): void {
    this.notifOpen = false;
  }

  goToIncidents(): void {
    this.notifOpen = false;
    void this.router.navigate(['/app/incidents']);
  }

  private async refreshNotifications(): Promise<void> {
    try {
      const res = await this.hateoas.follow<DashboardLiveDto>('console-dashboard');
      const alerts = res?.data?.liveAlerts ?? [];
      this.notifications = alerts
        .map((a) => ({
          severity: a.severity,
          level: a.level,
          title: a.title,
          source: a.source,
          at: this.toEpoch(a.timestamp),
          time: this.relative(a.timestamp),
        }))
        .slice(0, 8);
      this.recomputeUnread();
    } catch {
      /* keep last */
    }
  }

  private recomputeUnread(): void {
    const seen = Number(localStorage.getItem(MainLayoutComponent.SEEN_KEY) ?? '0');
    this.unreadCount = this.notifications.filter((n) => n.at > seen).length;
  }

  private markAllSeen(): void {
    const newest = this.notifications.reduce((m, n) => Math.max(m, n.at), 0);
    if (newest > 0) {
      localStorage.setItem(MainLayoutComponent.SEEN_KEY, String(newest));
    }
    this.unreadCount = 0;
  }

  private toEpoch(ts?: string): number {
    if (!ts) {
      return 0;
    }
    const t = new Date(ts).getTime();
    return Number.isNaN(t) ? 0 : t;
  }

  private relative(ts?: string): string {
    const t = this.toEpoch(ts);
    if (!t) {
      return '';
    }
    const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (mins < 1) {
      return 'just now';
    }
    if (mins < 60) {
      return `${mins}m ago`;
    }
    const hrs = Math.round(mins / 60);
    return hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`;
  }
}
