import { DecimalPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';

import { HateoasService } from '../../core/services/hateoas.service';
import { SkeletonComponent } from '../../core/skeleton/skeleton';

interface ClientDto {
  name: string | null;
  ip: string;
  mac: string;
  online: boolean;
  lastSeen: string;
  queryCount: number;
  topDestination: string;
}

interface ClientsViewDto {
  summary: { total: number; online: number };
  clients: ClientDto[];
}

interface SummaryVM {
  total: number;
  online: number;
}

interface ClientVM {
  name: string | null;
  ip: string;
  mac: string;
  online: boolean;
  lastSeen: string;
  queryCount: number;
  topDestination: string;
}

@Component({
  selector: 'app-clients-page',
  imports: [SkeletonComponent, DecimalPipe],
  templateUrl: './clients.html',
  styleUrl: './clients.scss',
})
export class ClientsPageComponent implements OnInit, OnDestroy {
  private static readonly REFRESH_MS = 15000;
  private readonly hateoas = inject(HateoasService);
  private timer?: ReturnType<typeof setInterval>;

  loaded = false;
  hasData = false;
  summary: SummaryVM = { total: 0, online: 0 };
  clients: ClientVM[] = [];

  async ngOnInit(): Promise<void> {
    await this.refresh();
    this.timer = setInterval(() => void this.refresh(), ClientsPageComponent.REFRESH_MS);
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
      total: view.summary.total,
      online: view.summary.online,
    };

    this.clients = view.clients.map((c) => ({
      name: c.name,
      ip: c.ip,
      mac: c.mac,
      online: c.online,
      lastSeen: this.timeOf(c.lastSeen),
      queryCount: c.queryCount,
      topDestination: c.topDestination,
    }));

    this.hasData = this.summary.total > 0 || this.clients.length > 0;
    this.loaded = true;
  }

  private async fetchView(): Promise<ClientsViewDto | null> {
    try {
      const res = await this.hateoas.follow<ClientsViewDto>('console-clients');
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
