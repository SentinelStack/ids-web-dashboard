import { DecimalPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';

import { HateoasService } from '../../core/services/hateoas.service';
import { SkeletonComponent } from '../../core/skeleton/skeleton';

interface DomainDto {
  domain: string;
  count: number;
  category: string;
  tracker: boolean;
}

interface DestinationsViewDto {
  summary: {
    totalQueries: number;
    uniqueDomains: number;
    activeClients: number;
    trackerQueries: number;
  };
  categories: { category: string; count: number }[];
  topDomains: DomainDto[];
  byClient: {
    clientIp: string;
    queryCount: number;
    topDomain: string;
    domains: DomainDto[];
  }[];
  recent: {
    timestamp: string;
    clientIp: string;
    domain: string;
    count: number;
    category: string;
    tracker: boolean;
  }[];
}

interface SummaryVM {
  totalQueries: number;
  uniqueDomains: number;
  activeClients: number;
  trackerQueries: number;
}
interface CategoryVM {
  category: string;
  count: number;
  pct: number;
  icon: string;
  color: string;
}
interface DomainVM {
  domain: string;
  count: number;
  category: string;
  tracker: boolean;
  pct: number;
  icon: string;
  color: string;
}
interface ClientVM {
  clientIp: string;
  queryCount: number;
  topDomain: string;
  topCategory: string;
  topColor: string;
  topIcon: string;
  chips: { category: string; count: number; color: string; icon: string }[];
}
interface RecentVM {
  time: string;
  clientIp: string;
  domain: string;
  count: number;
  category: string;
  tracker: boolean;
  color: string;
}

interface CategoryStyle {
  icon: string;
  color: string;
}

/** Maps each server-side category to a Material Symbol + accent colour. */
const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  'Ads & Trackers': { icon: 'block', color: '#ffb4ab' },
  Social: { icon: 'groups', color: '#00d1ff' },
  Video: { icon: 'smart_display', color: '#ff8fc7' },
  Search: { icon: 'search', color: '#2ee6a6' },
  Apple: { icon: 'devices', color: '#c3cfde' },
  Google: { icon: 'travel_explore', color: '#7ee787' },
  Shopping: { icon: 'shopping_cart', color: '#f5c451' },
  CDN: { icon: 'cloud', color: '#9aa7bd' },
  Other: { icon: 'language', color: '#a9b6c9' },
};
const FALLBACK_STYLE: CategoryStyle = { icon: 'language', color: '#a9b6c9' };

function styleOf(category: string): CategoryStyle {
  return CATEGORY_STYLES[category] ?? FALLBACK_STYLE;
}

@Component({
  selector: 'app-destinations-page',
  imports: [SkeletonComponent, DecimalPipe],
  templateUrl: './destinations.html',
  styleUrl: './destinations.scss',
})
export class DestinationsPageComponent implements OnInit, OnDestroy {
  private static readonly REFRESH_MS = 15000;
  private readonly hateoas = inject(HateoasService);
  private timer?: ReturnType<typeof setInterval>;

  loaded = false;
  hasData = false;
  summary: SummaryVM = {
    totalQueries: 0,
    uniqueDomains: 0,
    activeClients: 0,
    trackerQueries: 0,
  };
  categories: CategoryVM[] = [];
  topDomains: DomainVM[] = [];
  byClient: ClientVM[] = [];
  recent: RecentVM[] = [];

  async ngOnInit(): Promise<void> {
    await this.refresh();
    this.timer = setInterval(() => void this.refresh(), DestinationsPageComponent.REFRESH_MS);
  }

  ngOnDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async refresh(): Promise<void> {
    const view = await this.fetchView();
    if (!view) {
      this.hasData = false;
      this.loaded = true;
      return;
    }

    this.summary = {
      totalQueries: view.summary.totalQueries,
      uniqueDomains: view.summary.uniqueDomains,
      activeClients: view.summary.activeClients,
      trackerQueries: view.summary.trackerQueries,
    };

    const catMax = Math.max(1, ...view.categories.map((c) => c.count));
    this.categories = view.categories.map((c) => {
      const s = styleOf(c.category);
      return {
        category: c.category,
        count: c.count,
        pct: Math.round((c.count / catMax) * 100),
        icon: s.icon,
        color: s.color,
      };
    });

    const domMax = Math.max(1, ...view.topDomains.map((d) => d.count));
    this.topDomains = view.topDomains.map((d) => {
      const s = styleOf(d.category);
      return {
        domain: d.domain,
        count: d.count,
        category: d.category,
        tracker: d.tracker,
        pct: Math.round((d.count / domMax) * 100),
        icon: s.icon,
        color: s.color,
      };
    });

    this.byClient = view.byClient.map((c) => {
      const top = styleOf(c.domains[0]?.category ?? 'Other');
      const chips = c.domains.slice(0, 4).map((d) => {
        const s = styleOf(d.category);
        return { category: d.category, count: d.count, color: s.color, icon: s.icon };
      });
      return {
        clientIp: c.clientIp,
        queryCount: c.queryCount,
        topDomain: c.topDomain,
        topCategory: c.domains[0]?.category ?? 'Other',
        topColor: top.color,
        topIcon: top.icon,
        chips,
      };
    });

    this.recent = view.recent.map((r) => ({
      time: this.timeOf(r.timestamp),
      clientIp: r.clientIp,
      domain: r.domain,
      count: r.count,
      category: r.category,
      tracker: r.tracker,
      color: styleOf(r.category).color,
    }));

    this.hasData =
      this.summary.totalQueries > 0 || this.recent.length > 0 || this.topDomains.length > 0;
    this.loaded = true;
  }

  private async fetchView(): Promise<DestinationsViewDto | null> {
    try {
      const res = await this.hateoas.follow<DestinationsViewDto>('console-destinations');
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
