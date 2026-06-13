import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../core/services/api.service';
import { SkeletonComponent } from '../../core/skeleton/skeleton';

interface Alert {
  alertId?: string;
  deviceId?: string;
  timestamp?: string;
  type?: string;
  severity?: string;
  protocol?: string;
  sourceIp?: string;
  destinationIp?: string;
  sourcePort?: number;
  destinationPort?: number;
  packetCount?: number;
  bytesCount?: number;
  windowSeconds?: number;
  acknowledged?: boolean;
  createdAt?: string;
}

interface Paged<T> {
  content?: T[];
  totalElements?: number;
}

interface IncidentVM {
  id: string;
  incId: string;
  time: string;
  severity: string;
  sevCls: string;
  title: string;
  source: string;
  target: string;
  category: string;
  status: string;
  statusCls: string;
  statusIcon: string;
  assignee: string;
  acknowledged: boolean;
  raw: Alert;
}

interface BarVM {
  h: number;
  cls: string;
}

interface AssetVM {
  name: string;
  ip: string;
  icon: string;
  cls: string;
}

const TITLES: Record<string, string> = {
  UDP_FLOOD_SUSPECTED: 'DDoS Vector Identified',
  PORT_SCAN_SUSPECTED: 'Port Scan Detected',
  TCP_SPIKE_SUSPECTED: 'Traffic Spike Detected',
  HIGH_TRAFFIC_VOLUME: 'Volumetric Anomaly',
};
const CATEGORIES: Record<string, string> = {
  UDP_FLOOD_SUSPECTED: 'DDoS',
  PORT_SCAN_SUSPECTED: 'Recon',
  TCP_SPIKE_SUSPECTED: 'DoS',
  HIGH_TRAFFIC_VOLUME: 'Volumetric',
};

@Component({
  selector: 'app-incidents-page',
  imports: [SkeletonComponent],
  templateUrl: './incidents.html',
  styleUrl: './incidents.scss',
})
export class IncidentsPageComponent implements OnInit, OnDestroy {
  private static readonly REFRESH_MS = 15000;
  private readonly api = inject(ApiService);
  private timer?: ReturnType<typeof setInterval>;

  loaded = false;
  acknowledging = false;

  // KPIs
  kpiOpen = '0';
  kpiOpenDelta = '';
  kpiCritical = '0';
  kpiInvestigating = '0';
  kpiResolved = '0';
  kpiSources = '0';

  // timeline
  timeline: BarVM[] = [];

  // queue
  filter: 'all' | 'critical' | 'pending' = 'all';
  filterText = '';
  private allRows: IncidentVM[] = [];
  rows: IncidentVM[] = [];

  // inspector
  selected: IncidentVM | null = null;
  confidence = 0;
  anomaly = '0.00';
  packetRate = '—';
  bytes = '—';

  // severity distribution
  sevCritical = 0;
  sevHigh = 0;
  sevMedium = 0;
  sevLow = 0;
  sevTotal = 0;
  donut: { cls: string; dash: string; offset: number }[] = [];

  assets: AssetVM[] = [];

  async ngOnInit(): Promise<void> {
    await this.refresh();
    this.timer = setInterval(() => void this.refresh(), IncidentsPageComponent.REFRESH_MS);
  }

  ngOnDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async refresh(): Promise<void> {
    const alerts = await this.fetchAlerts();
    this.buildKpis(alerts);
    this.buildTimeline(alerts);
    this.buildQueue(alerts);
    this.buildSeverity(alerts);
    this.buildAssets(alerts);
    this.loaded = true;
  }

  private async fetchAlerts(): Promise<Alert[]> {
    try {
      const res = await firstValueFrom(
        this.api.get<Paged<Alert>>('/alerts?size=500&sortBy=timestamp&direction=desc'),
      );
      return res?.data?.content ?? [];
    } catch {
      return [];
    }
  }

  setFilter(f: 'all' | 'critical' | 'pending'): void {
    this.filter = f;
    this.applyFilter();
  }

  onFilterText(value: string): void {
    this.filterText = value;
    this.applyFilter();
  }

  private applyFilter(): void {
    const q = this.filterText.trim().toLowerCase();
    this.rows = this.allRows.filter((r) => {
      if (this.filter === 'critical' && r.severity !== 'CRITICAL') {
        return false;
      }
      if (this.filter === 'pending' && r.acknowledged) {
        return false;
      }
      if (q && !`${r.title} ${r.source} ${r.target} ${r.category}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }

  select(row: IncidentVM): void {
    this.selected = row;
    this.buildInspector(row);
  }

  async acknowledge(): Promise<void> {
    const sel = this.selected;
    if (!sel || sel.acknowledged || this.acknowledging) {
      return;
    }
    this.acknowledging = true;
    try {
      await firstValueFrom(this.api.patch(`/alerts/${sel.id}/acknowledge`, {}));
      await this.refresh();
      const updated = this.allRows.find((r) => r.id === sel.id);
      if (updated) {
        this.select(updated);
      }
    } catch {
      // ignore; next poll reflects state
    } finally {
      this.acknowledging = false;
    }
  }

  private buildKpis(alerts: Alert[]): void {
    const open = alerts.filter((a) => !a.acknowledged);
    const critical = alerts.filter((a) => (a.severity ?? '').toUpperCase() === 'CRITICAL');
    const investigating = open.filter((a) => this.isInvestigating(a));
    const resolved = alerts.filter((a) => a.acknowledged);
    const sources = new Set(alerts.map((a) => a.sourceIp).filter(Boolean));
    const lastHour = Date.now() - 3600 * 1000;
    const recent = alerts.filter(
      (a) => new Date(a.createdAt ?? a.timestamp ?? 0).getTime() >= lastHour,
    );

    this.kpiOpen = `${open.length}`;
    this.kpiOpenDelta = `+${recent.length} / 1h`;
    this.kpiCritical = `${critical.length}`;
    this.kpiInvestigating = `${investigating.length}`;
    this.kpiResolved = `${resolved.length}`;
    this.kpiSources = `${sources.size}`;
  }

  private buildTimeline(alerts: Alert[]): void {
    const buckets = 12;
    const slots = Array.from({ length: buckets }, () => ({ total: 0, crit: 0, warn: 0 }));
    const now = Date.now();
    const span = 24 * 3600 * 1000;
    for (const a of alerts) {
      const t = new Date(a.timestamp ?? a.createdAt ?? 0).getTime();
      const ago = now - t;
      if (ago < 0 || ago > span) {
        continue;
      }
      const idx = Math.min(buckets - 1, buckets - 1 - Math.floor((ago / span) * buckets));
      const sev = (a.severity ?? '').toUpperCase();
      slots[idx].total++;
      if (sev === 'CRITICAL') {
        slots[idx].crit++;
      } else if (sev === 'HIGH' || sev === 'MEDIUM') {
        slots[idx].warn++;
      }
    }
    const max = Math.max(1, ...slots.map((s) => s.total));
    this.timeline = slots.map((s) => ({
      h: Math.round((s.total / max) * 100),
      cls: s.crit > 0 ? 'crit' : s.warn > 0 ? 'warn' : 'info',
    }));
  }

  private buildQueue(alerts: Alert[]): void {
    this.allRows = alerts.map((a) => this.toRow(a));
    this.applyFilter();
    if (!this.selected || !this.allRows.find((r) => r.id === this.selected?.id)) {
      const top =
        this.allRows.find((r) => r.severity === 'CRITICAL') ??
        this.allRows.find((r) => !r.acknowledged) ??
        this.allRows[0] ??
        null;
      this.selected = top;
      if (top) {
        this.buildInspector(top);
      }
    }
  }

  private toRow(a: Alert): IncidentVM {
    const sev = (a.severity ?? 'LOW').toUpperCase();
    const type = a.type ?? 'UNKNOWN';
    const status = this.statusOf(a);
    return {
      id: a.alertId ?? '',
      incId: this.incidentId(a),
      time: this.timeOf(a.timestamp),
      severity: sev,
      sevCls: sev.toLowerCase(),
      title: TITLES[type] ?? this.humanize(type),
      source: a.sourceIp ?? '—',
      target: a.destinationIp ?? '—',
      category: CATEGORIES[type] ?? 'Anomaly',
      status: status.label,
      statusCls: status.cls,
      statusIcon: status.icon,
      assignee: a.acknowledged ? 'System' : this.isInvestigating(a) ? 'Analyst' : 'Unassigned',
      acknowledged: !!a.acknowledged,
      raw: a,
    };
  }

  private buildInspector(row: IncidentVM): void {
    const a = row.raw;
    const sev = row.severity;
    const base = sev === 'CRITICAL' ? 0.92 : sev === 'HIGH' ? 0.82 : sev === 'MEDIUM' ? 0.68 : 0.52;
    const jitter = ((a.packetCount ?? 0) % 7) / 100;
    this.confidence = Math.round((base + jitter) * 100);
    this.anomaly = (base + jitter - 0.02).toFixed(2);
    const rate = (a.packetCount ?? 0) / Math.max(1, a.windowSeconds ?? 5);
    this.packetRate =
      rate >= 1000 ? `${(rate / 1000).toFixed(1)}k pkt/s` : `${Math.round(rate)} pkt/s`;
    this.bytes = this.formatBytes(a.bytesCount ?? 0);
  }

  private buildSeverity(alerts: Alert[]): void {
    let c = 0;
    let h = 0;
    let m = 0;
    let l = 0;
    for (const a of alerts) {
      switch ((a.severity ?? '').toUpperCase()) {
        case 'CRITICAL':
          c++;
          break;
        case 'HIGH':
          h++;
          break;
        case 'MEDIUM':
          m++;
          break;
        default:
          l++;
      }
    }
    this.sevCritical = c;
    this.sevHigh = h;
    this.sevMedium = m;
    this.sevLow = l;
    this.sevTotal = c + h + m + l;

    const total = Math.max(1, this.sevTotal);
    const segs = [
      { cls: 'crit', v: c },
      { cls: 'high', v: h },
      { cls: 'warn', v: m },
      { cls: 'info', v: l },
    ];
    let offset = 0;
    this.donut = segs
      .filter((s) => s.v > 0)
      .map((s) => {
        const len = (s.v / total) * 100;
        const d = { cls: s.cls, dash: `${len} ${100 - len}`, offset: -offset };
        offset += len;
        return d;
      });
  }

  private buildAssets(alerts: Alert[]): void {
    const counts = new Map<string, number>();
    for (const a of alerts) {
      if (a.destinationIp) {
        counts.set(a.destinationIp, (counts.get(a.destinationIp) ?? 0) + 1);
      }
    }
    const top = [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3);
    const icons = ['router', 'cloud', 'dns'];
    const classes = ['crit', 'warn', 'info'];
    const names = ['OpenWrt Edge Gateway', 'API Gateway (Public)', 'Core Service Node'];
    this.assets = top.map(([ip], i) => ({
      ip,
      name: names[i] ?? 'Internal Host',
      icon: icons[i] ?? 'lan',
      cls: classes[i] ?? 'info',
    }));
  }

  private isInvestigating(a: Alert): boolean {
    const sev = (a.severity ?? '').toUpperCase();
    return !a.acknowledged && (sev === 'CRITICAL' || sev === 'HIGH');
  }

  private statusOf(a: Alert): { label: string; cls: string; icon: string } {
    if (a.acknowledged) {
      return { label: 'Resolved', cls: 'closed', icon: 'check_circle' };
    }
    if (this.isInvestigating(a)) {
      return { label: 'Investigating', cls: 'investigating', icon: 'search' };
    }
    return { label: 'New', cls: 'new', icon: 'fiber_new' };
  }

  private incidentId(a: Alert): string {
    const d = new Date(a.createdAt ?? a.timestamp ?? Date.now());
    const ymd = `${d.getUTCFullYear()}-${`${d.getUTCMonth() + 1}`.padStart(2, '0')}${`${d.getUTCDate()}`.padStart(2, '0')}`;
    const suffix =
      (a.alertId ?? '')
        .replace(/[^a-z0-9]/gi, '')
        .slice(0, 4)
        .toUpperCase() || '0000';
    return `INC-${ymd}-${suffix}`;
  }

  private humanize(type: string): string {
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
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour12: false });
  }

  private formatBytes(n: number): string {
    if (n >= 1_000_000) {
      return `${(n / 1_000_000).toFixed(1)} MB`;
    }
    if (n >= 1000) {
      return `${(n / 1000).toFixed(1)} KB`;
    }
    return `${n} B`;
  }
}
