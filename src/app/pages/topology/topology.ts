import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';

import { HateoasService } from '../../core/services/hateoas.service';

interface Kpi {
  label: string;
  value: string;
  unit: string;
  tone: 'primary' | 'neutral' | 'secondary' | 'error';
}

interface Detection {
  label: string;
  level: 'critical' | 'warning';
}

interface NodeDetail {
  name: string;
  id: string;
  category: Category;
  status: string;
  statusTone: 'ok' | 'warn' | 'error';
  load: string;
  risk: string;
  riskTone: 'ok' | 'warn' | 'error';
  ip: string;
  activity: string;
  detections: Detection[];
}

interface Dependency {
  label: string;
  pct: number;
  tone: 'primary' | 'secondary' | 'error';
}

type FeedTone = 'primary' | 'secondary' | 'error' | 'warning' | 'muted';

interface FeedEvent {
  time: string;
  kind: string;
  message: string;
  tone: FeedTone;
}

/** GET /api/console/topology/events — real domain events. */
interface TopologyEventDto {
  at: string;
  kind: string;
  message: string;
  tone: string;
}

/** GET /api/console/topology/logs — the backend's own runtime log lines. */
interface RuntimeLogDto {
  at: string;
  level: string;
  logger: string;
  message: string;
}

type FeedMode = 'events' | 'logs';
type Category = 'edge' | 'backend' | 'kafka' | 'storage';

@Component({
  selector: 'app-topology-page',
  templateUrl: './topology.html',
  styleUrl: './topology.scss',
})
export class TopologyPageComponent implements OnInit, OnDestroy {
  private static readonly REFRESH_MS = 6000;
  private readonly hateoas = inject(HateoasService);
  private readonly router = inject(Router);
  private feedTimer?: ReturnType<typeof setInterval>;

  loaded = false;
  feedMode: FeedMode = 'events';
  feedError = false;
  refreshing = false;

  /** Toolbar/inspector toggles. */
  showIncidentPath = true;
  private readonly quarantined = new Set<string>();

  readonly kpis: Kpi[] = [
    { label: 'Active Edge Agents', value: '12', unit: '11H / 1D', tone: 'primary' },
    { label: 'Protected Assets', value: '48', unit: 'MONITORED', tone: 'neutral' },
    { label: 'Event Streams', value: '7', unit: 'LIVE', tone: 'secondary' },
    { label: 'High-Risk Nodes', value: '3', unit: 'CRITICAL', tone: 'error' },
    { label: 'Proc. Latency', value: '184', unit: 'ms (AVG)', tone: 'neutral' },
  ];

  readonly filters = ['All Nodes', 'Edge', 'Backend', 'Kafka', 'Storage'];
  activeFilter = 'All Nodes';

  readonly dependencies: Dependency[] = [
    { label: 'Edge → Ingestion', pct: 90, tone: 'primary' },
    { label: 'Ingestion → Kafka', pct: 85, tone: 'primary' },
    { label: 'Kafka → Flink', pct: 40, tone: 'error' },
    { label: 'Storage → AI_Mod', pct: 98, tone: 'primary' },
    { label: 'Alert → Dashboard', pct: 95, tone: 'secondary' },
  ];

  feed: FeedEvent[] = [];

  private readonly nodes: Record<string, NodeDetail> = {
    'edge-router': {
      name: 'OpenWrt Edge Gateway',
      id: 'EDGE-ROUTER-01',
      category: 'edge',
      status: 'Degraded',
      statusTone: 'error',
      load: '68% CPU / 72% RAM',
      risk: 'High',
      riskTone: 'error',
      ip: '192.168.1.1',
      activity: '18.4k pkt/s | 920 events/min',
      detections: [
        { label: 'DDoS UDP Spike', level: 'critical' },
        { label: 'SYN/ACK Imbalance', level: 'critical' },
        { label: 'Unusual source diversity', level: 'warning' },
      ],
    },
    ingestion: {
      name: 'Ingestion Service',
      id: 'SVC-INGEST-01',
      category: 'backend',
      status: 'Healthy',
      statusTone: 'ok',
      load: '41% CPU / 55% RAM',
      risk: 'Low',
      riskTone: 'ok',
      ip: '10.0.2.10',
      activity: '14.0k pkt/s | 1.1k events/min',
      detections: [],
    },
    kafka: {
      name: 'Kafka Broker',
      id: 'MSG-KAFKA-01',
      category: 'kafka',
      status: 'Degraded',
      statusTone: 'warn',
      load: '63% CPU / 70% RAM',
      risk: 'Medium',
      riskTone: 'warn',
      ip: '10.0.3.20',
      activity: '3 topics | traffic.anomalies hot',
      detections: [{ label: 'Consumer lag on traffic.anomalies', level: 'warning' }],
    },
    flink: {
      name: 'Flink Processor',
      id: 'PROC-FLINK-01',
      category: 'kafka',
      status: 'Healthy',
      statusTone: 'ok',
      load: '58% CPU / 61% RAM',
      risk: 'Low',
      riskTone: 'ok',
      ip: '10.0.3.40',
      activity: '1.2k events/s',
      detections: [],
    },
    'op-db': {
      name: 'Operational Store',
      id: 'STORE-OP-DB',
      category: 'storage',
      status: 'Healthy',
      statusTone: 'ok',
      load: '37% CPU / 64% RAM',
      risk: 'Low',
      riskTone: 'ok',
      ip: '10.0.4.10',
      activity: '2.4k writes/s',
      detections: [],
    },
    'ai-sum': {
      name: 'AI Summarizer',
      id: 'CONS-AI-SUM',
      category: 'storage',
      status: 'Healthy',
      statusTone: 'ok',
      load: '49% CPU / 58% RAM',
      risk: 'Low',
      riskTone: 'ok',
      ip: '10.0.4.55',
      activity: '320 inferences/min',
      detections: [],
    },
  };

  selectedId = 'edge-router';
  selected: NodeDetail = this.nodes['edge-router'];

  async ngOnInit(): Promise<void> {
    this.loaded = true;
    await this.loadFeed();
    this.feedTimer = setInterval(() => void this.loadFeed(), TopologyPageComponent.REFRESH_MS);
  }

  ngOnDestroy(): void {
    if (this.feedTimer) {
      clearInterval(this.feedTimer);
    }
  }

  select(id: string): void {
    const node = this.nodes[id];
    if (node) {
      this.selectedId = id;
      this.selected = node;
    }
  }

  // ── Filter chips (All / Edge / Backend / Kafka / Storage) ───────────────
  setFilter(label: string): void {
    this.activeFilter = label;
  }

  /** Is a given canvas node category visible under the active filter? */
  showCat(cat: Category): boolean {
    return this.activeFilter === 'All Nodes' || this.activeFilter.toLowerCase() === cat;
  }

  // ── Toolbar: Refresh / Export / View Path ───────────────────────────────
  async refresh(): Promise<void> {
    this.refreshing = true;
    await this.loadFeed();
    // Restart the poll cycle so the next auto-refresh is a full interval away.
    if (this.feedTimer) {
      clearInterval(this.feedTimer);
    }
    this.feedTimer = setInterval(() => void this.loadFeed(), TopologyPageComponent.REFRESH_MS);
    this.refreshing = false;
  }

  /** Toggle the highlighted incident (DDoS) path overlay on the canvas. */
  toggleIncidentPath(): void {
    this.showIncidentPath = !this.showIncidentPath;
  }

  /** Download the current topology + feed as a JSON snapshot. */
  exportSnapshot(): void {
    const snapshot = {
      exportedAt: new Date().toISOString(),
      filter: this.activeFilter,
      kpis: this.kpis,
      nodes: Object.values(this.nodes).map((n) => ({
        ...n,
        quarantined: this.quarantined.has(this.idForNode(n)),
      })),
      dependencies: this.dependencies,
      feedMode: this.feedMode,
      feed: this.feed,
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `topology-snapshot-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Inspector: Quarantine / Path View / Forensics ───────────────────────
  isQuarantined(id: string): boolean {
    return this.quarantined.has(id);
  }

  /** Contain the selected node: mark it quarantined and log it to the feed. */
  quarantine(): void {
    if (this.isQuarantined(this.selectedId)) {
      return;
    }
    this.quarantined.add(this.selectedId);
    this.selected.status = 'Quarantined';
    this.selected.statusTone = 'warn';
    this.selected.risk = 'Contained';
    this.selected.riskTone = 'ok';
    this.selected.detections = [];
    const event: FeedEvent = {
      time: new Date().toLocaleTimeString('en-GB', { hour12: false }),
      kind: 'CONTAINMENT',
      message: `${this.selected.name} (${this.selected.id}) quarantined by operator`,
      tone: 'primary',
    };
    this.feed = [event, ...this.feed].slice(0, 50);
  }

  /** Jump to the incidents/forensics console for the flagged traffic. */
  openForensics(): void {
    void this.router.navigate(['/app/incidents']);
  }

  private idForNode(n: NodeDetail): string {
    return Object.keys(this.nodes).find((k) => this.nodes[k] === n) ?? n.id;
  }

  setMode(mode: FeedMode): void {
    if (mode !== this.feedMode) {
      this.feedMode = mode;
      void this.loadFeed();
    }
  }

  /** Pull the live feed for the active mode (real domain events or raw logs). */
  private async loadFeed(): Promise<void> {
    try {
      this.feed = this.feedMode === 'events' ? await this.loadEvents() : await this.loadLogs();
      this.feedError = false;
    } catch {
      this.feedError = true;
    }
  }

  private async loadEvents(): Promise<FeedEvent[]> {
    const res = await this.hateoas.follow<{ content: TopologyEventDto[] }>('topology-events');
    return (res?.data?.content ?? []).map((e) => ({
      time: this.timeOf(e.at),
      kind: e.kind,
      message: e.message,
      tone: this.asTone(e.tone),
    }));
  }

  private async loadLogs(): Promise<FeedEvent[]> {
    const res = await this.hateoas.follow<{ content: RuntimeLogDto[] }>('topology-logs');
    return (res?.data?.content ?? []).map((l) => ({
      time: this.timeOf(l.at),
      kind: l.level,
      message: `${l.logger} — ${l.message}`,
      tone: this.toneOfLevel(l.level),
    }));
  }

  private timeOf(at?: string): string {
    if (!at) {
      return '';
    }
    const d = new Date(at);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour12: false });
  }

  private asTone(tone: string): FeedTone {
    const allowed: FeedTone[] = ['primary', 'secondary', 'error', 'warning', 'muted'];
    return (allowed as string[]).includes(tone) ? (tone as FeedTone) : 'muted';
  }

  private toneOfLevel(level: string): FeedTone {
    switch (level.toUpperCase()) {
      case 'ERROR':
        return 'error';
      case 'WARN':
        return 'warning';
      case 'INFO':
        return 'primary';
      default:
        return 'muted';
    }
  }
}
