import { Component, OnDestroy, OnInit, inject } from '@angular/core';

import { HateoasService } from '../../core/services/hateoas.service';
import { SkeletonComponent } from '../../core/skeleton/skeleton';
import { ThreatArc, ThreatMapComponent } from './threat-map/threat-map';

interface DashboardViewDto {
  kpis: { totalAlerts: string; uniqueSources: string; systemHealth: string };
  liveAlerts: {
    severity: string;
    level: string;
    timestamp: string;
    title: string;
    source: string;
    destination: string;
  }[];
  volumeDelta: string;
  volume: { height: number; hot: boolean }[];
  origins: { name: string; pct: number; rank: number }[];
  arcs: ThreatArc[];
  deviceLat: number;
  deviceLng: number;
}

interface ThreatVolumeDto {
  delta: string;
  bars: { height: number; hot: boolean }[];
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

const ORIGIN_CLS = ['r', 'p', 'c', 'c2'];

@Component({
  selector: 'app-dashboard-page',
  imports: [ThreatMapComponent, SkeletonComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardPageComponent implements OnInit, OnDestroy {
  private static readonly REFRESH_MS = 15000;
  private timer?: ReturnType<typeof setInterval>;

  private readonly hateoas = inject(HateoasService);

  liveAlerts: AlertVM[] = [];
  origins: OriginVM[] = [];
  bars: BarVM[] = [];

  arcs: ThreatArc[] = [];
  deviceLat = 0;
  deviceLng = 0;

  totalAlerts = '0';
  sourceIps = '0';
  systemHealth = '—';
  volumeDelta = '';
  loaded = false;

  async ngOnInit(): Promise<void> {
    await this.refresh();
    this.timer = setInterval(() => void this.refresh(), DashboardPageComponent.REFRESH_MS);
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

    this.totalAlerts = view.kpis.totalAlerts;
    this.sourceIps = view.kpis.uniqueSources;
    this.systemHealth = view.kpis.systemHealth;
    this.volumeDelta = view.volumeDelta;

    this.liveAlerts = view.liveAlerts.map((a) => ({
      cls: a.level,
      tag: a.severity,
      time: this.timeOf(a.timestamp),
      title: a.title,
      lines: [`SRC: ${a.source}`, `DST: ${a.destination}`],
    }));
    this.bars = view.volume.map((b) => ({ h: b.height, hot: b.hot }));
    this.origins = view.origins.map((o) => ({
      name: o.name,
      pct: o.pct,
      cls: ORIGIN_CLS[o.rank] ?? 'g',
    }));

    this.arcs = view.arcs;
    this.deviceLat = view.deviceLat;
    this.deviceLng = view.deviceLng;

    this.loaded = true;
    // Threat Volume comes from ClickHouse (full history) — the Mongo hot store
    // only holds ~1h, so its 24h histogram would be a single bar.
    await this.loadThreatVolume();
  }

  private async loadThreatVolume(): Promise<void> {
    try {
      const res = await this.hateoas.follow<ThreatVolumeDto>('threat-volume');
      const v = res?.data;
      if (v) {
        this.bars = v.bars.map((b) => ({ h: b.height, hot: b.hot }));
        this.volumeDelta = v.delta;
      }
    } catch {
      // keep the console view's volume as a fallback
    }
  }

  private async fetchView(): Promise<DashboardViewDto | null> {
    try {
      const res = await this.hateoas.follow<DashboardViewDto>('console-dashboard');
      return res?.data ?? null;
    } catch {
      return null;
    }
  }

  private timeOf(ts?: string): string {
    if (!ts) {
      return '';
    }
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour12: false });
  }
}
