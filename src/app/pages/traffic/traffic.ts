import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../core/services/api.service';
import { SkeletonComponent } from '../../core/skeleton/skeleton';

interface TrafficViewDto {
  totalPackets: string;
  tcpPct: number;
  udpPct: number;
  suspiciousPct: string;
  protocols: { name: string; pct: number }[];
  flow: { tcp: number; udp: number }[];
  topPorts: { label: string; packets: string; danger: boolean }[];
  topSources: { ip: string; scope: string }[];
  packets: {
    timestamp: string;
    protocol: string;
    source: string;
    destination: string;
    port: number;
    size: string;
    suspicious: boolean;
  }[];
  distribution: { height: number; hot: boolean }[];
}

interface ProtocolVM {
  name: string;
  pct: number;
  cls: string;
}
interface PortVM {
  label: string;
  pkts: string;
  danger: boolean;
}
interface IpVM {
  ip: string;
  tag: string;
  cls: string;
}
interface PacketVM {
  time: string;
  proto: string;
  protoCls: string;
  src: string;
  dst: string;
  port: number;
  size: string;
  suspicious: boolean;
}
interface BarVM {
  h: number;
  hot: boolean;
}

const PROTOCOL_CLS: Record<string, string> = { TCP: 'tcp', UDP: 'udp', ICMP: 'muted' };

@Component({
  selector: 'app-traffic-page',
  imports: [SkeletonComponent],
  templateUrl: './traffic.html',
  styleUrl: './traffic.scss',
})
export class TrafficPageComponent implements OnInit, OnDestroy {
  private static readonly REFRESH_MS = 15000;
  private readonly api = inject(ApiService);
  private timer?: ReturnType<typeof setInterval>;

  loaded = false;
  totalPackets = '0';
  tcpPct = 0;
  udpPct = 0;
  suspiciousPct = '0';
  protocols: ProtocolVM[] = [];
  topPorts: PortVM[] = [];
  topIps: IpVM[] = [];
  packets: PacketVM[] = [];
  dist: BarVM[] = [];

  flowTcpArea = '';
  flowTcpLine = '';
  flowUdpArea = '';
  flowUdpLine = '';

  async ngOnInit(): Promise<void> {
    await this.refresh();
    this.timer = setInterval(() => void this.refresh(), TrafficPageComponent.REFRESH_MS);
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
    this.totalPackets = view.totalPackets;
    this.tcpPct = view.tcpPct;
    this.udpPct = view.udpPct;
    this.suspiciousPct = view.suspiciousPct;
    this.protocols = view.protocols.map((p) => ({
      name: p.name,
      pct: p.pct,
      cls: PROTOCOL_CLS[p.name] ?? 'muted',
    }));
    this.topPorts = view.topPorts.map((p) => ({
      label: p.label,
      pkts: p.packets,
      danger: p.danger,
    }));
    this.topIps = view.topSources.map((s) => ({
      ip: s.ip,
      tag: s.scope,
      cls: s.scope === 'LOCAL' ? 'ok' : 'err',
    }));
    this.packets = view.packets.map((p) => ({
      time: this.timeOf(p.timestamp),
      proto: p.protocol,
      protoCls: p.suspicious ? 'susp' : p.protocol.toLowerCase(),
      src: p.source,
      dst: p.destination,
      port: p.port,
      size: p.size,
      suspicious: p.suspicious,
    }));
    this.dist = view.distribution.map((b) => ({ h: b.height, hot: b.hot }));
    this.buildFlow(view.flow);
    this.loaded = true;
  }

  private async fetchView(): Promise<TrafficViewDto | null> {
    try {
      const res = await firstValueFrom(this.api.get<TrafficViewDto>('/console/traffic'));
      return res?.data ?? null;
    } catch {
      return null;
    }
  }

  /** Pure SVG path geometry from the backend's 0–100 normalised flow points. */
  private buildFlow(flow: { tcp: number; udp: number }[]): void {
    if (flow.length < 2) {
      this.flowTcpArea = this.flowTcpLine = this.flowUdpArea = this.flowUdpLine = '';
      return;
    }
    const width = 800;
    const top = 20;
    const bottom = 280;
    const height = bottom - top;
    const x = (i: number) => (i / (flow.length - 1)) * width;
    const y = (v: number) => bottom - (Math.min(100, Math.max(0, v)) / 100) * height;
    const line = (sel: (p: { tcp: number; udp: number }) => number) =>
      flow
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(sel(p)).toFixed(1)}`)
        .join(' ');

    this.flowTcpLine = line((p) => p.tcp);
    this.flowUdpLine = line((p) => p.udp);
    this.flowTcpArea = `${this.flowTcpLine} L${width},300 L0,300 Z`;
    this.flowUdpArea = `${this.flowUdpLine} L${width},300 L0,300 Z`;
  }

  private timeOf(ts?: string): string {
    if (!ts) {
      return '';
    }
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour12: false });
  }
}
