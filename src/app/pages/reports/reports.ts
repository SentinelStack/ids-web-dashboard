import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../core/services/api.service';
import { SkeletonComponent } from '../../core/skeleton/skeleton';

interface FilterMeta {
  severities: string[];
  types: string[];
  protocols: string[];
  formats: string[];
  dateRange: { min: string | null; max: string | null };
  totalRows: number;
  maxRows: number;
}

interface PreviewResponse {
  returned: number;
  limit: number;
  hasMore: boolean;
  columns: string[];
  rows: Record<string, string>[];
}

interface CuratedReport {
  key: string;
  label: string;
  description: string;
}

interface Filters {
  search: string;
  from: string;
  to: string;
  severity: string;
  type: string;
  protocol: string;
  sourceIp: string;
  destinationIp: string;
  deviceId: string;
  sourcePort: string;
  destinationPort: string;
  minPacketCount: string;
  maxPacketCount: string;
  minBytes: string;
  maxBytes: string;
  minWindowSeconds: string;
  alertId: string;
  acknowledged: string;
  limit: string;
}

const EMPTY_FILTERS: Filters = {
  search: '',
  from: '',
  to: '',
  severity: '',
  type: '',
  protocol: '',
  sourceIp: '',
  destinationIp: '',
  deviceId: '',
  sourcePort: '',
  destinationPort: '',
  minPacketCount: '',
  maxPacketCount: '',
  minBytes: '',
  maxBytes: '',
  minWindowSeconds: '',
  alertId: '',
  acknowledged: '',
  limit: '50000',
};

@Component({
  selector: 'app-reports-page',
  imports: [FormsModule, SkeletonComponent],
  templateUrl: './reports.html',
  styleUrl: './reports.scss',
})
export class ReportsPageComponent implements OnInit {
  private readonly api = inject(ApiService);

  loaded = false;
  meta: FilterMeta | null = null;
  curated: CuratedReport[] = [];

  filters: Filters = { ...EMPTY_FILTERS };

  preview: PreviewResponse | null = null;
  previewing = false;
  previewError = '';
  downloading = false;
  curatedBusy: string | null = null;

  async ngOnInit(): Promise<void> {
    const [meta, curated] = await Promise.all([this.fetchMeta(), this.fetchCurated()]);
    this.meta = meta;
    this.curated = curated;
    if (meta?.dateRange.min) {
      this.filters.from = meta.dateRange.min;
    }
    if (meta?.dateRange.max) {
      this.filters.to = meta.dateRange.max;
    }
    this.loaded = true;
  }

  private async fetchMeta(): Promise<FilterMeta | null> {
    try {
      return (await firstValueFrom(this.api.get<FilterMeta>('/reports/meta'))).data ?? null;
    } catch {
      return null;
    }
  }

  private async fetchCurated(): Promise<CuratedReport[]> {
    try {
      // HATEOAS CollectionModel — the reports are under data.content.
      const res = await firstValueFrom(
        this.api.get<{ content: CuratedReport[] }>('/reports/curated'),
      );
      return res.data?.content ?? [];
    } catch {
      return [];
    }
  }

  /** Build the query string shared by preview and download. */
  private queryString(): string {
    const f = this.filters;
    const p = new URLSearchParams();
    const add = (k: string, v: string) => {
      if (v && v.trim()) {
        p.set(k, v.trim());
      }
    };
    add('search', f.search);
    add('from', f.from);
    add('to', f.to);
    add('severity', f.severity);
    add('type', f.type);
    add('protocol', f.protocol);
    add('sourceIp', f.sourceIp);
    add('destinationIp', f.destinationIp);
    add('deviceId', f.deviceId);
    add('sourcePort', f.sourcePort);
    add('destinationPort', f.destinationPort);
    add('minPacketCount', f.minPacketCount);
    add('maxPacketCount', f.maxPacketCount);
    add('minBytes', f.minBytes);
    add('maxBytes', f.maxBytes);
    add('minWindowSeconds', f.minWindowSeconds);
    add('alertId', f.alertId);
    if (f.acknowledged === 'true' || f.acknowledged === 'false') {
      p.set('acknowledged', f.acknowledged);
    }
    add('limit', f.limit);
    return p.toString();
  }

  resetFilters(): void {
    this.filters = {
      ...EMPTY_FILTERS,
      from: this.meta?.dateRange.min ?? '',
      to: this.meta?.dateRange.max ?? '',
    };
    this.preview = null;
    this.previewError = '';
  }

  async runPreview(): Promise<void> {
    if (this.previewing) {
      return;
    }
    this.previewing = true;
    this.previewError = '';
    try {
      const qs = this.queryString();
      const res = await firstValueFrom(
        this.api.get<PreviewResponse>(`/reports/alerts/preview?${qs}`),
      );
      this.preview = res.data ?? null;
    } catch {
      this.preview = null;
      this.previewError = 'Preview failed — check your filters and try again.';
    } finally {
      this.previewing = false;
    }
  }

  async download(format: 'csv' | 'json'): Promise<void> {
    if (this.downloading) {
      return;
    }
    this.downloading = true;
    try {
      const qs = this.queryString();
      await this.streamDownload(
        `/reports/alerts/download?${qs}&format=${format}`,
        `sentinel-alerts.${format}`,
      );
    } finally {
      this.downloading = false;
    }
  }

  async downloadCurated(report: CuratedReport, format: 'csv' | 'json' = 'csv'): Promise<void> {
    if (this.curatedBusy) {
      return;
    }
    this.curatedBusy = report.key;
    try {
      await this.streamDownload(
        `/reports/curated/${report.key}/download?format=${format}`,
        `sentinel-${report.key}.${format}`,
      );
    } finally {
      this.curatedBusy = null;
    }
  }

  private async streamDownload(path: string, fallbackName: string): Promise<void> {
    try {
      const blob = await firstValueFrom(this.api.getBlob(path));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = fallbackName.replace('.', `-${stamp}.`);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // ignore; the disabled state resets
    }
  }
}
