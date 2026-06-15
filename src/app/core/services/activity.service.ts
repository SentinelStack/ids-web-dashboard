import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

export interface ActivityRecord {
  at: string;
  label: string;
  device: string;
}

/**
 * Records the operator's real in-app navigation into localStorage so the
 * Profile page can show genuine "recent account activity" (what you actually
 * did in this console), not mock data. Capped to the most recent entries.
 */
@Injectable({ providedIn: 'root' })
export class ActivityService {
  private static readonly KEY = 'aegis-activity';
  private static readonly CAP = 60;

  private readonly router = inject(Router);

  /** Call once (from the shell) to begin recording navigation. */
  start(): void {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.record(this.labelFor(e.urlAfterRedirects)));
  }

  recent(): ActivityRecord[] {
    try {
      return JSON.parse(localStorage.getItem(ActivityService.KEY) ?? '[]') as ActivityRecord[];
    } catch {
      return [];
    }
  }

  /** A friendly label for the current device, parsed from the user agent. */
  device(): string {
    const ua = navigator.userAgent;
    let os = 'Device';
    if (/iPhone/.test(ua)) os = 'iPhone';
    else if (/iPad/.test(ua)) os = 'iPad';
    else if (/Android/.test(ua)) os = 'Android';
    else if (/Macintosh|Mac OS/.test(ua)) os = 'Mac';
    else if (/Windows/.test(ua)) os = 'Windows';
    else if (/Linux/.test(ua)) os = 'Linux';

    let browser = '';
    if (/Edg\//.test(ua)) browser = 'Edge';
    else if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) browser = 'Chrome';
    else if (/Firefox\//.test(ua)) browser = 'Firefox';
    else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = 'Safari';

    return browser ? `${os} · ${browser}` : os;
  }

  private record(label: string): void {
    if (!label) {
      return;
    }
    const list = this.recent();
    // Skip consecutive duplicates of the same view.
    if (list.length && list[0].label === label) {
      return;
    }
    list.unshift({ at: new Date().toISOString(), label, device: this.device() });
    try {
      localStorage.setItem(ActivityService.KEY, JSON.stringify(list.slice(0, ActivityService.CAP)));
    } catch {
      /* storage unavailable */
    }
  }

  private labelFor(url: string): string {
    const path = url.split('?')[0];
    const map: Record<string, string> = {
      '/app/dashboard': 'Viewed dashboard overview',
      '/app/traffic': 'Viewed traffic analysis',
      '/app/incidents': 'Viewed incidents',
      '/app/topology': 'Viewed network topology',
      '/app/rules': 'Viewed detection rules',
      '/app/logs': 'Opened Log Viewer',
      '/app/reports': 'Opened data export',
      '/app/support': 'Opened Support center',
      '/app/profile': 'Viewed account profile',
    };
    return map[path] ?? '';
  }
}
