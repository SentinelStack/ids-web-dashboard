import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { HateoasService } from '../../core/services/hateoas.service';

type Tone = 'primary' | 'secondary' | 'error' | 'warning' | 'muted';

interface LogKpis {
  logsIngested24h: number;
  edgeLogs: number;
  criticalEvents: number;
  warningEvents: number;
  ingestionDelayMs: number;
}

interface LogEntryDto {
  at: string;
  severity: string;
  source: string;
  icon: string;
  device: string;
  eventType: string;
  message: string;
  traceId: string;
  tone: string;
}

interface PipelineComponentDto {
  name: string;
  status: string;
}

interface LogStreamDto {
  kpis: LogKpis;
  entries: LogEntryDto[];
  pipeline: PipelineComponentDto[];
}

interface LogRow {
  time: string;
  at: string;
  severity: string;
  source: string;
  icon: string;
  device: string;
  eventType: string;
  message: string;
  traceId: string;
  tone: Tone;
}

@Component({
  selector: 'app-log-viewer-page',
  imports: [FormsModule],
  templateUrl: './log-viewer.html',
  styleUrl: './log-viewer.scss',
})
export class LogViewerPageComponent implements OnInit, OnDestroy {
  private static readonly REFRESH_MS = 4000;
  private readonly hateoas = inject(HateoasService);
  private timer?: ReturnType<typeof setInterval>;

  loaded = false;
  liveTail = true;

  kpis: LogKpis = {
    logsIngested24h: 0,
    edgeLogs: 0,
    criticalEvents: 0,
    warningEvents: 0,
    ingestionDelayMs: 0,
  };
  rows: LogRow[] = [];
  pipeline: PipelineComponentDto[] = [];
  selected: LogRow | null = null;

  // Filters
  search = '';
  severityFilter = 'ALL';
  readonly severities = ['ALL', 'CRITICAL', 'WARNING', 'INFO'];

  async ngOnInit(): Promise<void> {
    await this.load();
    this.loaded = true;
    this.timer = setInterval(() => {
      if (this.liveTail) {
        void this.load();
      }
    }, LogViewerPageComponent.REFRESH_MS);
  }

  ngOnDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  get visibleRows(): LogRow[] {
    const q = this.search.trim().toLowerCase();
    return this.rows.filter((r) => {
      const matchSev = this.severityFilter === 'ALL' || r.severity === this.severityFilter;
      const matchSearch =
        !q ||
        r.message.toLowerCase().includes(q) ||
        r.device.toLowerCase().includes(q) ||
        r.eventType.toLowerCase().includes(q) ||
        r.traceId.toLowerCase().includes(q);
      return matchSev && matchSearch;
    });
  }

  /** Pipeline propagation stages for the selected trace (architecture flow). */
  get traceStages(): { label: string; icon: string; tone: Tone }[] {
    return [
      { label: 'Edge window closed', icon: 'dns', tone: 'primary' },
      { label: 'Router rule matched', icon: 'gavel', tone: 'error' },
      { label: 'Local alert triggered', icon: 'notification_important', tone: 'warning' },
      { label: 'Event sent (HTTPS)', icon: 'send', tone: 'muted' },
      { label: 'Backend ingested', icon: 'cloud_queue', tone: 'muted' },
      { label: 'Incident created', icon: 'report', tone: 'error' },
    ];
  }

  toggleLiveTail(): void {
    this.liveTail = !this.liveTail;
    if (this.liveTail) {
      void this.load();
    }
  }

  select(row: LogRow): void {
    this.selected = row;
  }

  closeDetail(): void {
    this.selected = null;
  }

  async copyTrace(): Promise<void> {
    if (this.selected && navigator.clipboard) {
      await navigator.clipboard.writeText(this.selected.traceId).catch(() => undefined);
    }
  }

  sevTone(sev: string): Tone {
    switch (sev) {
      case 'CRITICAL':
        return 'error';
      case 'WARNING':
        return 'warning';
      case 'INFO':
        return 'primary';
      default:
        return 'muted';
    }
  }

  statusTone(status: string): Tone {
    return /healthy|ok|online/i.test(status) ? 'primary' : 'warning';
  }

  private async load(): Promise<void> {
    try {
      const res = await this.hateoas.follow<LogStreamDto>('console-logs');
      const d = res?.data;
      if (!d) {
        return;
      }
      this.kpis = d.kpis;
      this.pipeline = d.pipeline;
      this.rows = d.entries.map((e) => ({
        time: this.timeOf(e.at),
        at: e.at,
        severity: e.severity,
        source: e.source,
        icon: e.icon,
        device: e.device,
        eventType: e.eventType,
        message: e.message,
        traceId: e.traceId,
        tone: this.asTone(e.tone),
      }));
      // Keep the selected row in sync if it still exists.
      if (this.selected) {
        this.selected =
          this.rows.find(
            (r) => r.at === this.selected!.at && r.eventType === this.selected!.eventType,
          ) ?? this.selected;
      }
    } catch {
      /* keep last */
    }
  }

  private timeOf(at?: string): string {
    if (!at) {
      return '';
    }
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) {
      return '';
    }
    return (
      d.toLocaleTimeString('en-GB', { hour12: false }) +
      '.' +
      String(d.getMilliseconds()).padStart(3, '0')
    );
  }

  private asTone(tone: string): Tone {
    const allowed: Tone[] = ['primary', 'secondary', 'error', 'warning', 'muted'];
    return (allowed as string[]).includes(tone) ? (tone as Tone) : 'muted';
  }
}
