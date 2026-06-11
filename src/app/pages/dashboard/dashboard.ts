import { Component, OnInit, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../core/services/api.service';
import { GeoService } from '../../core/services/geo.service';
import { ThreatMapComponent } from './threat-map/threat-map';

interface AlertItem {
  alertId?: string;
  type?: string;
  severity?: string;
  sourceIp?: string;
  destinationIp?: string;
  timestamp?: string;
}

interface PagedData {
  content?: AlertItem[];
  totalElements?: number;
}

interface AlertVM {
  cls: string;
  tag: string;
  time: string;
  title: string;
  lines: string[];
}

interface OriginVM {
  name: string;
  pct: number;
  cls: string;
}

interface BarVM {
  h: number;
  hot: boolean;
}

@Component({
  selector: 'app-dashboard-page',
  imports: [ThreatMapComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly geo = inject(GeoService);

  liveAlerts: AlertVM[] = [];
  origins: OriginVM[] = [];
  bars: BarVM[] = [];

  totalAlerts = '0';
  sourceIps = '0';
  systemHealth = '—';
  volumeDelta = '';
  loaded = false;

  async ngOnInit(): Promise<void> {
    const alerts = await this.fetchAlerts();
    this.buildLiveAlerts(alerts);
    this.buildKpis(alerts);
    this.buildVolume(alerts);
    await this.buildHealth();
    await this.buildOrigins(alerts);
    this.loaded = true;
  }

  private async fetchAlerts(): Promise<AlertItem[]> {
    try {
      const res = await firstValueFrom(
        this.api.get<PagedData>('/alerts?size=500&sortBy=timestamp&direction=desc'),
      );
      this.totalAlerts = (res?.data?.totalElements ?? res?.data?.content?.length ?? 0).toLocaleString();
      return res?.data?.content ?? [];
    } catch {
      return [];
    }
  }

  private severityClass(sev?: string): { cls: string; tag: string } {
    switch ((sev ?? '').toUpperCase()) {
      case 'CRITICAL':
        return { cls: 'critical', tag: 'CRITICAL' };
      case 'HIGH':
        return { cls: 'critical', tag: 'HIGH' };
      case 'MEDIUM':
        return { cls: 'warning', tag: 'MEDIUM' };
      default:
        return { cls: 'info', tag: 'LOW' };
    }
  }

  private humanizeType(type?: string): string {
    if (!type) {
      return 'Alert';
    }
    return type
      .toLowerCase()
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  private timeOf(ts?: string): string {
    if (!ts) {
      return '';
    }
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) {
      return '';
    }
    return d.toLocaleTimeString('en-GB', { hour12: false });
  }

  private buildLiveAlerts(alerts: AlertItem[]): void {
    this.liveAlerts = alerts.slice(0, 6).map((a) => {
      const sev = this.severityClass(a.severity);
      return {
        cls: sev.cls,
        tag: sev.tag,
        time: this.timeOf(a.timestamp),
        title: this.humanizeType(a.type),
        lines: [`SRC: ${a.sourceIp ?? '—'}`, `DST: ${a.destinationIp ?? '—'}`],
      };
    });
  }

  private buildKpis(alerts: AlertItem[]): void {
    const ips = new Set<string>();
    for (const a of alerts) {
      if (a.sourceIp) {
        ips.add(a.sourceIp);
      }
    }
    this.sourceIps = ips.size.toLocaleString();
  }

  private buildVolume(alerts: AlertItem[]): void {
    const buckets = new Array<number>(24).fill(0);
    const now = Date.now();
    const dayAgo = now - 24 * 3600 * 1000;
    let recent = 0;
    let previous = 0;

    for (const a of alerts) {
      if (!a.timestamp) {
        continue;
      }
      const t = new Date(a.timestamp).getTime();
      if (Number.isNaN(t)) {
        continue;
      }
      if (t >= dayAgo) {
        const hoursAgo = Math.floor((now - t) / (3600 * 1000));
        const idx = 23 - Math.min(23, hoursAgo);
        buckets[idx]++;
        recent++;
      } else if (t >= dayAgo - 24 * 3600 * 1000) {
        previous++;
      }
    }

    const max = Math.max(1, ...buckets);
    const threshold = max * 0.75;
    this.bars = buckets.map((v) => ({ h: Math.round((v / max) * 100), hot: v >= threshold && v > 0 }));

    if (previous > 0) {
      const delta = Math.round(((recent - previous) / previous) * 1000) / 10;
      this.volumeDelta = `${delta >= 0 ? '+' : ''}${delta}% vs Yesterday`;
    } else {
      this.volumeDelta = `${recent} in last 24h`;
    }
  }

  private async buildHealth(): Promise<void> {
    try {
      const res = await firstValueFrom(this.api.get<PagedData & { content?: { status?: string }[] }>('/devices?size=200'));
      const devices = (res?.data?.content ?? []) as { status?: string }[];
      if (devices.length === 0) {
        this.systemHealth = 'No devices';
        return;
      }
      const online = devices.filter((d) => (d.status ?? '').toUpperCase() === 'ONLINE').length;
      this.systemHealth = `${Math.round((online / devices.length) * 1000) / 10}%`;
    } catch {
      this.systemHealth = '—';
    }
  }

  private async buildOrigins(alerts: AlertItem[]): Promise<void> {
    const ips = [...new Set(alerts.map((a) => a.sourceIp).filter((ip): ip is string => !!ip))];
    const counts = new Map<string, number>();
    let total = 0;

    for (const ip of ips) {
      const point = await this.geo.locate(ip);
      const country = point?.isLocal ? 'Local network' : (point?.label.split(', ').pop() ?? 'Unknown');
      counts.set(country, (counts.get(country) ?? 0) + 1);
      total++;
    }

    if (total === 0) {
      this.origins = [];
      return;
    }

    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 4);
    const otherCount = sorted.slice(4).reduce((s, [, c]) => s + c, 0);
    const classes = ['r', 'p', 'c', 'c2'];

    this.origins = top.map(([name, count], i) => ({
      name,
      pct: Math.round((count / total) * 1000) / 10,
      cls: classes[i] ?? 'g',
    }));

    if (otherCount > 0) {
      this.origins.push({ name: 'Other', pct: Math.round((otherCount / total) * 1000) / 10, cls: 'g' });
    }
  }
}
