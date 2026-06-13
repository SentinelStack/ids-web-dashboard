import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../core/services/api.service';
import { SkeletonComponent } from '../../core/skeleton/skeleton';

interface Summary {
  totalPackets?: number;
  tcpPackets?: number;
  udpPackets?: number;
  totalBytes?: number;
  tcpPercentage?: number;
  udpPercentage?: number;
}

interface TrafficWindow {
  timestamp?: string;
  totalPackets?: number;
  tcpPackets?: number;
  udpPackets?: number;
}

interface Packet {
  timestamp?: string;
  protocol?: string;
  sourceIp?: string;
  destinationIp?: string;
  destinationPort?: number;
  packetSize?: number;
}

interface Paged<T> {
  content?: T[];
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

const RISKY_PORTS = new Set([22, 23, 3389, 445, 1433, 3306]);
const PORT_NAMES: Record<number, string> = {
  443: 'HTTPS',
  80: 'HTTP',
  53: 'DNS',
  22: 'SSH',
  23: 'Telnet',
  3389: 'RDP',
  8080: 'HTTP-ALT',
};

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
    const [summary, series, packets] = await Promise.all([
      this.fetchSummary(),
      this.fetchSeries(),
      this.fetchPackets(),
    ]);
    this.buildSummary(summary, packets);
    this.buildProtocols(summary);
    this.buildFlow(series);
    this.buildPackets(packets);
    this.buildDistribution(series);
    this.loaded = true;
  }

  private async fetchSummary(): Promise<Summary> {
    try {
      const res = await firstValueFrom(this.api.get<Summary>('/traffic/summary'));
      return res?.data ?? {};
    } catch {
      return {};
    }
  }

  private async fetchSeries(): Promise<TrafficWindow[]> {
    try {
      const dev = await firstValueFrom(
        this.api.get<Paged<{ deviceId?: string }>>(
          '/devices?size=1&sortBy=lastSeenAt&direction=desc',
        ),
      );
      const deviceId = dev?.data?.content?.[0]?.deviceId;
      if (!deviceId) {
        return [];
      }
      const res = await firstValueFrom(
        this.api.get<Paged<TrafficWindow>>(
          `/traffic/stats/by-device/${encodeURIComponent(deviceId)}?size=60`,
        ),
      );
      // API returns newest-first; reverse to chronological for the chart.
      return (res?.data?.content ?? []).slice().reverse();
    } catch {
      return [];
    }
  }

  private async fetchPackets(): Promise<Packet[]> {
    try {
      const res = await firstValueFrom(this.api.get<Paged<Packet>>('/forensics/packets?size=80'));
      return res?.data?.content ?? [];
    } catch {
      return [];
    }
  }

  private buildSummary(summary: Summary, packets: Packet[]): void {
    this.totalPackets = this.formatCount(summary.totalPackets ?? 0);
    this.tcpPct = Math.round(summary.tcpPercentage ?? 0);
    this.udpPct = Math.round(summary.udpPercentage ?? 0);
    const suspicious = packets.filter((p) => RISKY_PORTS.has(p.destinationPort ?? 0)).length;
    const pct = packets.length === 0 ? 0 : (suspicious / packets.length) * 100;
    this.suspiciousPct = `${Math.round(pct * 10) / 10}`;
  }

  private buildProtocols(summary: Summary): void {
    const tcp = Math.round((summary.tcpPercentage ?? 0) * 10) / 10;
    const udp = Math.round((summary.udpPercentage ?? 0) * 10) / 10;
    const icmp = Math.max(0, Math.round((100 - tcp - udp) * 10) / 10);
    this.protocols = [
      { name: 'TCP', pct: tcp, cls: 'tcp' },
      { name: 'UDP', pct: udp, cls: 'udp' },
      { name: 'ICMP', pct: icmp, cls: 'muted' },
    ];
  }

  private buildFlow(series: TrafficWindow[]): void {
    if (series.length < 2) {
      this.flowTcpArea = this.flowTcpLine = this.flowUdpArea = this.flowUdpLine = '';
      return;
    }
    const width = 800;
    const top = 20;
    const bottom = 280;
    const height = bottom - top;
    const max = Math.max(1, ...series.map((s) => Math.max(s.tcpPackets ?? 0, s.udpPackets ?? 0)));
    const x = (i: number) => (i / (series.length - 1)) * width;
    const y = (v: number) => bottom - (v / max) * height;
    const line = (sel: (s: TrafficWindow) => number) =>
      series
        .map((s, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(sel(s)).toFixed(1)}`)
        .join(' ');

    this.flowTcpLine = line((s) => s.tcpPackets ?? 0);
    this.flowUdpLine = line((s) => s.udpPackets ?? 0);
    this.flowTcpArea = `${this.flowTcpLine} L${width},300 L0,300 Z`;
    this.flowUdpArea = `${this.flowUdpLine} L${width},300 L0,300 Z`;
  }

  private buildPackets(packets: Packet[]): void {
    this.packets = packets.slice(0, 12).map((p) => {
      const port = p.destinationPort ?? 0;
      const suspicious = RISKY_PORTS.has(port);
      const proto = (p.protocol ?? 'TCP').toUpperCase();
      return {
        time: this.timeOf(p.timestamp),
        proto: suspicious ? 'SUSPICIOUS' : proto,
        protoCls: suspicious ? 'susp' : proto.toLowerCase(),
        src: p.sourceIp ?? '—',
        dst: p.destinationIp ?? '—',
        port,
        size: this.formatBytes(p.packetSize ?? 0),
        suspicious,
      };
    });

    const portCounts = new Map<number, number>();
    const ipCounts = new Map<string, number>();
    for (const p of packets) {
      if (p.destinationPort != null) {
        portCounts.set(p.destinationPort, (portCounts.get(p.destinationPort) ?? 0) + 1);
      }
      if (p.sourceIp) {
        ipCounts.set(p.sourceIp, (ipCounts.get(p.sourceIp) ?? 0) + 1);
      }
    }

    this.topPorts = [...portCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([port, count]) => ({
        label: `${port}${PORT_NAMES[port] ? ` (${PORT_NAMES[port]})` : ''}`,
        pkts: `${this.formatCount(count)} PKTS`,
        danger: RISKY_PORTS.has(port),
      }));

    this.topIps = [...ipCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([ip]) => {
        const local = this.isPrivate(ip);
        return { ip, tag: local ? 'LOCAL' : 'EXTERNAL', cls: local ? 'ok' : 'err' };
      });
  }

  private buildDistribution(series: TrafficWindow[]): void {
    const buckets = 24;
    if (series.length === 0) {
      this.dist = Array.from({ length: buckets }, () => ({ h: 0, hot: false }));
      return;
    }
    const sums = new Array<number>(buckets).fill(0);
    for (let i = 0; i < series.length; i++) {
      const b = Math.min(buckets - 1, Math.floor((i / series.length) * buckets));
      sums[b] += series[i].totalPackets ?? 0;
    }
    const max = Math.max(1, ...sums);
    const threshold = max * 0.8;
    this.dist = sums.map((v) => ({ h: Math.round((v / max) * 100), hot: v >= threshold && v > 0 }));
  }

  private isPrivate(ip: string): boolean {
    return /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  }

  private timeOf(ts?: string): string {
    if (!ts) {
      return '';
    }
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour12: false });
  }

  private formatCount(n: number): string {
    if (n >= 1_000_000) {
      return `${Math.round(n / 100_000) / 10}M`;
    }
    if (n >= 1000) {
      return `${Math.round(n / 100) / 10}K`;
    }
    return `${n}`;
  }

  private formatBytes(n: number): string {
    if (n >= 1_000_000) {
      return `${Math.round(n / 100_000) / 10} MB`;
    }
    if (n >= 1000) {
      return `${Math.round(n / 100) / 10} KB`;
    }
    return `${n} B`;
  }
}
