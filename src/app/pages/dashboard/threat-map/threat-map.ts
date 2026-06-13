import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import * as L from 'leaflet';

/** Pre-geolocated threat arc, computed server-side by the backend console view. */
export interface ThreatArc {
  lat: number;
  lng: number;
  sourceIp: string;
  country: string;
  level: string;
}

interface LatLng {
  lat: number;
  lng: number;
}

const ARC_COLOR: Record<string, string> = {
  critical: '#ff4d6d',
  medium: '#c792ea',
  low: '#29d8ff',
};

@Component({
  selector: 'app-threat-map',
  standalone: true,
  templateUrl: './threat-map.html',
  styleUrl: './threat-map.scss',
})
export class ThreatMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;

  @Input() arcs: ThreatArc[] = [];
  @Input() deviceLat = 0;
  @Input() deviceLng = 0;

  private map?: L.Map;
  private layer?: L.LayerGroup;
  private ready = false;

  stats = { sources: 0, arcs: 0 };

  ngAfterViewInit(): void {
    this.initMap();
    this.ready = true;
    this.draw();
  }

  ngOnChanges(): void {
    if (this.ready) {
      this.draw();
    }
  }

  ngOnDestroy(): void {
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

  private arcPoints(from: LatLng, to: LatLng, bend = 0.25): L.LatLngExpression[] {
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

  private draw(): void {
    if (!this.map || !this.layer) {
      return;
    }
    this.layer.clearLayers();
    const device: LatLng = { lat: this.deviceLat, lng: this.deviceLng };
    this.addDevice(device);

    const seenSources = new Set<string>();
    for (const arc of this.arcs) {
      const color = ARC_COLOR[arc.level] ?? '#29d8ff';
      const src: LatLng = { lat: arc.lat, lng: arc.lng };

      L.polyline(this.arcPoints(src, device), {
        color,
        weight: 1.5,
        opacity: 0.75,
        className: 'threat-arc',
      }).addTo(this.layer);

      if (!seenSources.has(arc.sourceIp)) {
        seenSources.add(arc.sourceIp);
        L.circleMarker([src.lat, src.lng], {
          radius: 4,
          color,
          weight: 1,
          fillColor: color,
          fillOpacity: 0.9,
        })
          .bindTooltip(`${arc.sourceIp}<br>${arc.country} · ${arc.level}`, {
            className: 'threat-tip',
          })
          .addTo(this.layer);
      }
    }

    this.stats = { sources: seenSources.size, arcs: this.arcs.length };
  }

  private addDevice(device: LatLng): void {
    if (!this.layer || (device.lat === 0 && device.lng === 0)) {
      return;
    }
    L.circleMarker([device.lat, device.lng], {
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
