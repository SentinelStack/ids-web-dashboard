import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { HalResource, linkHref } from '../../core/models/hateoas';
import { HateoasService } from '../../core/services/hateoas.service';
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
  downloadHref: string;
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
  private readonly hateoas = inject(HateoasService);
  // The reports meta resource carries the preview/download/curated links.
  private metaLinks: HalResource | null = null;

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
    // Discover the reports resource from the index, then follow its links.
    this.meta = await this.fetchMeta();
    this.curated = await this.fetchCurated();
    if (this.meta?.dateRange.min) {
      this.filters.from = this.meta.dateRange.min;
    }
    if (this.meta?.dateRange.max) {
      this.filters.to = this.meta.dateRange.max;
    }
    this.loaded = true;
  }

  private async fetchMeta(): Promise<FilterMeta | null> {
    try {
      const res = await this.hateoas.follow<FilterMeta & HalResource>('reports');
      this.metaLinks = res?.data ?? null;
      return res?.data ?? null;
    } catch {
      this.metaLinks = null;
      return null;
    }
  }

  private async fetchCurated(): Promise<CuratedReport[]> {
    const href = linkHref(this.metaLinks, 'curated');
    if (!href) {
      return [];
    }
    try {
      // CollectionModel of EntityModels — each item carries its own download link.
      const res = await this.hateoas.followHref<{ content: (CuratedReport & HalResource)[] }>(href);
      return (res.data?.content ?? []).map((item) => ({
        key: item.key,
        label: item.label,
        description: item.description,
        downloadHref: linkHref(item, 'download') ?? '',
      }));
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
      const base = linkHref(this.metaLinks, 'preview');
      if (!base) {
        throw new Error('preview link unavailable');
      }
      const res = await this.hateoas.followHref<PreviewResponse>(`${base}?${this.queryString()}`);
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
      const base = linkHref(this.metaLinks, 'download');
      if (base) {
        await this.streamDownload(
          `${base}?${this.queryString()}&format=${format}`,
          `sentinel-alerts.${format}`,
        );
      }
    } finally {
      this.downloading = false;
    }
  }

  async downloadCurated(report: CuratedReport, format: 'csv' | 'json' = 'csv'): Promise<void> {
    if (this.curatedBusy || !report.downloadHref) {
      return;
    }
    this.curatedBusy = report.key;
    try {
      // Follow the item's own download link.
      await this.streamDownload(
        `${report.downloadHref}?format=${format}`,
        `sentinel-${report.key}.${format}`,
      );
    } finally {
      this.curatedBusy = null;
    }
  }

  private async streamDownload(href: string, fallbackName: string): Promise<void> {
    try {
      const blob = await this.hateoas.downloadHref(href);
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
