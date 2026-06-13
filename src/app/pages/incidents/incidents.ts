import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../core/services/api.service';
import { SkeletonComponent } from '../../core/skeleton/skeleton';

/** Pre-computed incident row from the backend console view. */
interface IncidentRowDto {
  id: string;
  incId: string;
  timestamp: string;
  severity: string;
  title: string;
  source: string;
  target: string;
  category: string;
  status: string;
  statusIcon: string;
  assignee: string;
  acknowledged: boolean;
  confidence: number;
  anomalyScore: string;
  packetRate: string;
  volume: string;
  targetPort: number;
  protocol: string;
}

interface IncidentsViewDto {
  kpis: {
    open: number;
    openDelta: string;
    critical: number;
    investigating: number;
    resolved: number;
    uniqueSources: number;
  };
  timeline: { height: number; level: string }[];
  queue: IncidentRowDto[];
  severity: { critical: number; high: number; medium: number; low: number; total: number };
  assets: { name: string; ip: string; icon: string; level: string }[];
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
  confidence: number;
  anomaly: string;
  packetRate: string;
  bytes: string;
  raw: { destinationPort: number; protocol: string };
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

const STATUS_CLS: Record<string, string> = {
  Resolved: 'closed',
  Investigating: 'investigating',
  New: 'new',
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
    const view = await this.fetchView();
    if (!view) {
      this.loaded = true;
      return;
    }
    this.applyKpis(view.kpis);
    this.timeline = view.timeline.map((b) => ({ h: b.height, cls: b.level }));
    this.applyQueue(view.queue);
    this.applySeverity(view.severity);
    this.assets = view.assets.map((a) => ({ name: a.name, ip: a.ip, icon: a.icon, cls: a.level }));
    this.loaded = true;
  }

  private async fetchView(): Promise<IncidentsViewDto | null> {
    try {
      const res = await firstValueFrom(this.api.get<IncidentsViewDto>('/console/incidents'));
      return res?.data ?? null;
    } catch {
      return null;
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
    this.confidence = row.confidence;
    this.anomaly = row.anomaly;
    this.packetRate = row.packetRate;
    this.bytes = row.bytes;
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

  private applyKpis(k: IncidentsViewDto['kpis']): void {
    this.kpiOpen = `${k.open}`;
    this.kpiOpenDelta = k.openDelta;
    this.kpiCritical = `${k.critical}`;
    this.kpiInvestigating = `${k.investigating}`;
    this.kpiResolved = `${k.resolved}`;
    this.kpiSources = `${k.uniqueSources}`;
  }

  private applyQueue(queue: IncidentRowDto[]): void {
    this.allRows = queue.map((r) => this.toVm(r));
    this.applyFilter();
    if (!this.selected || !this.allRows.find((r) => r.id === this.selected?.id)) {
      const top =
        this.allRows.find((r) => r.severity === 'CRITICAL') ??
        this.allRows.find((r) => !r.acknowledged) ??
        this.allRows[0] ??
        null;
      if (top) {
        this.select(top);
      } else {
        this.selected = null;
      }
    }
  }

  private toVm(r: IncidentRowDto): IncidentVM {
    return {
      id: r.id,
      incId: r.incId,
      time: this.timeOf(r.timestamp),
      severity: r.severity,
      sevCls: r.severity.toLowerCase(),
      title: r.title,
      source: r.source,
      target: r.target,
      category: r.category,
      status: r.status,
      statusCls: STATUS_CLS[r.status] ?? 'new',
      statusIcon: r.statusIcon,
      assignee: r.assignee,
      acknowledged: r.acknowledged,
      confidence: r.confidence,
      anomaly: r.anomalyScore,
      packetRate: r.packetRate,
      bytes: r.volume,
      raw: { destinationPort: r.targetPort, protocol: r.protocol },
    };
  }

  private applySeverity(s: IncidentsViewDto['severity']): void {
    this.sevCritical = s.critical;
    this.sevHigh = s.high;
    this.sevMedium = s.medium;
    this.sevLow = s.low;
    this.sevTotal = s.total;

    const total = Math.max(1, s.total);
    const segs = [
      { cls: 'crit', v: s.critical },
      { cls: 'high', v: s.high },
      { cls: 'warn', v: s.medium },
      { cls: 'info', v: s.low },
    ];
    let offset = 0;
    this.donut = segs
      .filter((x) => x.v > 0)
      .map((x) => {
        const len = (x.v / total) * 100;
        const d = { cls: x.cls, dash: `${len} ${100 - len}`, offset: -offset };
        offset += len;
        return d;
      });
  }

  private timeOf(ts?: string): string {
    if (!ts) {
      return '';
    }
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour12: false });
  }
}
