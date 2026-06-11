import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject } from '@angular/core';
import * as L from 'leaflet';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../../core/services/api.service';
import { GeoPoint, GeoService } from '../../../core/services/geo.service';

interface AlertItem {
  alertId?: string;
  type?: string;
  severity?: string;
  sourceIp?: string;
  destinationIp?: string;
}

interface PagedContent {
  content?: AlertItem[];
}

@Component({
  selector: 'app-threat-map',
  standalone: true,
  templateUrl: './threat-map.html',
  styleUrl: './threat-map.scss',
})
export class ThreatMapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;

  private readonly api = inject(ApiService);
  private readonly geo = inject(GeoService);

  private map?: L.Map;
  private layer?: L.LayerGroup;
  private timer?: ReturnType<typeof setInterval>;

  stats = { sources: 0, arcs: 0, local: 0 };

  ngAfterViewInit(): void {
    this.initMap();
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), 30000);
  }

  ngOnDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.map?.remove();
  }

  private initMap(): void {
    this.map = L.map(this.mapEl.nativeElement, {
      center: [25, 10],
      zoom: 2,
      minZoom: 2,
      worldCopyJump: true,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 8,
    }).addTo(this.map);

    L.control.zoom({ position: 'bottomright' }).addTo(this.map);
    this.layer = L.layerGroup().addTo(this.map);

    setTimeout(() => this.map?.invalidateSize(), 0);
  }

  private severityColor(severity?: string): string {
    switch ((severity ?? '').toUpperCase()) {
      case 'CRITICAL':
        return '#ff4d6d';
      case 'HIGH':
        return '#ff7a45';
      case 'MEDIUM':
        return '#c792ea';
      default:
        return '#29d8ff';
    }
  }

  private arcPoints(from: GeoPoint, to: GeoPoint, bend = 0.25): L.LatLngExpression[] {
    const x0 = from.lng;
    const y0 = from.lat;
    const x2 = to.lng;
    const y2 = to.lat;
    const mx = (x0 + x2) / 2;
    const my = (y0 + y2) / 2;
    const dx = x2 - x0;
    const dy = y2 - y0;
    const cx = mx - dy * bend;
    const cy = my + dx * bend;

    const points: L.LatLngExpression[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x2;
      const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y2;
      points.push([y, x]);
    }
    return points;
  }

  private async refresh(): Promise<void> {
    if (!this.map || !this.layer) {
      return;
    }

    let alerts: AlertItem[] = [];
    try {
      const res = await firstValueFrom(
        this.api.get<PagedContent>('/alerts?size=200&sortBy=timestamp&direction=desc'),
      );
      alerts = res?.data?.content ?? [];
    } catch {
      alerts = [];
    }

    this.layer.clearLayers();
    this.addDevice();

    const seenSources = new Set<string>();
    let arcs = 0;
    let local = 0;

    for (const alert of alerts) {
      const src = alert.sourceIp;
      const dst = alert.destinationIp;
      if (!src || !dst) {
        continue;
      }

      const [sp, dp] = await Promise.all([this.geo.locate(src), this.geo.locate(dst)]);
      if (!sp || !dp) {
        continue;
      }
      if (sp.isLocal && dp.isLocal) {
        local++;
        continue;
      }

      const color = this.severityColor(alert.severity);

      L.polyline(this.arcPoints(sp, dp), {
        color,
        weight: 1.5,
        opacity: 0.75,
        className: 'threat-arc',
      }).addTo(this.layer);

      if (!seenSources.has(src)) {
        seenSources.add(src);
        L.circleMarker([sp.lat, sp.lng], {
          radius: 4,
          color,
          weight: 1,
          fillColor: color,
          fillOpacity: 0.9,
        })
          .bindTooltip(`${src} → ${dst}<br>${alert.type ?? ''} · ${alert.severity ?? ''}`, {
            className: 'threat-tip',
          })
          .addTo(this.layer);
      }

      L.circleMarker([dp.lat, dp.lng], {
        radius: 2.5,
        weight: 0,
        fillColor: '#7fefff',
        fillOpacity: 0.6,
      }).addTo(this.layer);

      arcs++;
    }

    this.stats = { sources: seenSources.size, arcs, local };
  }

  private addDevice(): void {
    if (!this.layer) {
      return;
    }
    const d = this.geo.deviceLocation;
    L.circleMarker([d.lat, d.lng], {
      radius: 6,
      color: '#29d8ff',
      weight: 2,
      fillColor: '#29d8ff',
      fillOpacity: 0.5,
      className: 'threat-device',
    })
      .bindTooltip('Sentinel device · local network', { className: 'threat-tip' })
      .addTo(this.layer);
  }
}
