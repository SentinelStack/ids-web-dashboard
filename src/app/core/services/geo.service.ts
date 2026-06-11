import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface GeoPoint {
  lat: number;
  lng: number;
  label: string;
  isLocal: boolean;
}

interface IpWhoIsResponse {
  success?: boolean;
  latitude?: number;
  longitude?: number;
  city?: string;
  country?: string;
}

@Injectable({ providedIn: 'root' })
export class GeoService {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<string, GeoPoint | null>();

  // Location used for private/LAN addresses (the monitored router/device).
  // Adjust to the real device location if needed.
  readonly deviceLocation: GeoPoint = {
    lat: 44.4268,
    lng: 26.1025,
    label: 'Local network',
    isLocal: true,
  };

  isPrivate(ip: string): boolean {
    if (!ip || ip === 'unknown' || ip === '0.0.0.0') {
      return true;
    }
    return /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  }

  async locate(ip: string): Promise<GeoPoint | null> {
    if (!ip) {
      return null;
    }
    if (this.isPrivate(ip)) {
      return this.deviceLocation;
    }
    if (this.cache.has(ip)) {
      return this.cache.get(ip) ?? null;
    }

    try {
      // Same-origin proxy (nginx forwards to ipwho.is server-side); calling
      // ipwho.is directly from the browser is rejected with 403.
      const base = typeof window !== 'undefined' ? window.location.origin : '';
      const res = await firstValueFrom(this.http.get<IpWhoIsResponse>(`${base}/geo/${ip}`));
      if (res?.success && typeof res.latitude === 'number' && typeof res.longitude === 'number') {
        const point: GeoPoint = {
          lat: res.latitude,
          lng: res.longitude,
          label: [res.city, res.country].filter(Boolean).join(', ') || ip,
          isLocal: false,
        };
        this.cache.set(ip, point);
        return point;
      }
    } catch {
      // Geolocation failed (rate limit, network); treat as unknown.
    }

    this.cache.set(ip, null);
    return null;
  }
}
