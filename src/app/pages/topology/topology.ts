import { Component, OnDestroy, OnInit } from '@angular/core';

interface Kpi {
  label: string;
  value: string;
  unit: string;
  tone: 'primary' | 'neutral' | 'secondary' | 'error';
}

interface Detection {
  label: string;
  level: 'critical' | 'warning';
}

interface NodeDetail {
  name: string;
  id: string;
  status: string;
  statusTone: 'ok' | 'warn' | 'error';
  load: string;
  risk: string;
  riskTone: 'ok' | 'warn' | 'error';
  ip: string;
  activity: string;
  detections: Detection[];
}

interface Dependency {
  label: string;
  pct: number;
  tone: 'primary' | 'secondary' | 'error';
}

interface FeedEvent {
  time: string;
  kind: string;
  message: string;
  tone: 'primary' | 'secondary' | 'error' | 'warning' | 'muted';
}

@Component({
  selector: 'app-topology-page',
  templateUrl: './topology.html',
  styleUrl: './topology.scss',
})
export class TopologyPageComponent implements OnInit, OnDestroy {
  private feedTimer?: ReturnType<typeof setInterval>;

  loaded = false;

  readonly kpis: Kpi[] = [
    { label: 'Active Edge Agents', value: '12', unit: '11H / 1D', tone: 'primary' },
    { label: 'Protected Assets', value: '48', unit: 'MONITORED', tone: 'neutral' },
    { label: 'Event Streams', value: '7', unit: 'LIVE', tone: 'secondary' },
    { label: 'High-Risk Nodes', value: '3', unit: 'CRITICAL', tone: 'error' },
    { label: 'Proc. Latency', value: '184', unit: 'ms (AVG)', tone: 'neutral' },
  ];

  readonly filters = ['All Nodes', 'Edge', 'Backend', 'Kafka', 'Storage'];
  activeFilter = 'All Nodes';

  readonly dependencies: Dependency[] = [
    { label: 'Edge → Ingestion', pct: 90, tone: 'primary' },
    { label: 'Ingestion → Kafka', pct: 85, tone: 'primary' },
    { label: 'Kafka → Flink', pct: 40, tone: 'error' },
    { label: 'Storage → AI_Mod', pct: 98, tone: 'primary' },
    { label: 'Alert → Dashboard', pct: 95, tone: 'secondary' },
  ];

  feed: FeedEvent[] = [
    {
      time: '14:22:01',
      kind: 'NODE_UP',
      message: 'Edge-Agent-09 registered on 10.0.4.122',
      tone: 'primary',
    },
    {
      time: '14:22:05',
      kind: 'ANOMALY_DETECTION',
      message: 'Rapid SYN packets detected on EDGE-ROUTER-01',
      tone: 'error',
    },
    {
      time: '14:22:08',
      kind: 'STREAM_PROC',
      message: 'Batch analytics for spark.job_882 completed',
      tone: 'secondary',
    },
    {
      time: '14:22:12',
      kind: 'LATENCY_SPIKE',
      message: 'Edge-to-Ingestion latency exceeded 500ms for L1 segment',
      tone: 'error',
    },
    {
      time: '14:22:15',
      kind: 'POLICY_SYNC',
      message: "Applied 'Zero Trust Policy v4' to 18 assets",
      tone: 'primary',
    },
    {
      time: '14:22:19',
      kind: 'HEARTBEAT',
      message: 'All 12 Edge Agents responding...',
      tone: 'muted',
    },
    {
      time: '14:22:24',
      kind: 'DEVICE_WARN',
      message: 'OpenWrt-GW (192.168.1.1) reporting high resource pressure',
      tone: 'warning',
    },
  ];

  private readonly nodes: Record<string, NodeDetail> = {
    'edge-router': {
      name: 'OpenWrt Edge Gateway',
      id: 'EDGE-ROUTER-01',
      status: 'Degraded',
      statusTone: 'error',
      load: '68% CPU / 72% RAM',
      risk: 'High',
      riskTone: 'error',
      ip: '192.168.1.1',
      activity: '18.4k pkt/s | 920 events/min',
      detections: [
        { label: 'DDoS UDP Spike', level: 'critical' },
        { label: 'SYN/ACK Imbalance', level: 'critical' },
        { label: 'Unusual source diversity', level: 'warning' },
      ],
    },
    ingestion: {
      name: 'Ingestion Service',
      id: 'SVC-INGEST-01',
      status: 'Healthy',
      statusTone: 'ok',
      load: '41% CPU / 55% RAM',
      risk: 'Low',
      riskTone: 'ok',
      ip: '10.0.2.10',
      activity: '14.0k pkt/s | 1.1k events/min',
      detections: [],
    },
    kafka: {
      name: 'Kafka Broker',
      id: 'MSG-KAFKA-01',
      status: 'Degraded',
      statusTone: 'warn',
      load: '63% CPU / 70% RAM',
      risk: 'Medium',
      riskTone: 'warn',
      ip: '10.0.3.20',
      activity: '3 topics | traffic.anomalies hot',
      detections: [{ label: 'Consumer lag on traffic.anomalies', level: 'warning' }],
    },
    flink: {
      name: 'Flink Processor',
      id: 'PROC-FLINK-01',
      status: 'Healthy',
      statusTone: 'ok',
      load: '58% CPU / 61% RAM',
      risk: 'Low',
      riskTone: 'ok',
      ip: '10.0.3.40',
      activity: '1.2k events/s',
      detections: [],
    },
    'op-db': {
      name: 'Operational Store',
      id: 'STORE-OP-DB',
      status: 'Healthy',
      statusTone: 'ok',
      load: '37% CPU / 64% RAM',
      risk: 'Low',
      riskTone: 'ok',
      ip: '10.0.4.10',
      activity: '2.4k writes/s',
      detections: [],
    },
    'ai-sum': {
      name: 'AI Summarizer',
      id: 'CONS-AI-SUM',
      status: 'Healthy',
      statusTone: 'ok',
      load: '49% CPU / 58% RAM',
      risk: 'Low',
      riskTone: 'ok',
      ip: '10.0.4.55',
      activity: '320 inferences/min',
      detections: [],
    },
  };

  selectedId = 'edge-router';
  selected: NodeDetail = this.nodes['edge-router'];

  ngOnInit(): void {
    this.loaded = true;
    this.feedTimer = setInterval(() => this.tickFeed(), 6000);
  }

  ngOnDestroy(): void {
    if (this.feedTimer) {
      clearInterval(this.feedTimer);
    }
  }

  select(id: string): void {
    const node = this.nodes[id];
    if (node) {
      this.selectedId = id;
      this.selected = node;
    }
  }

  private tickFeed(): void {
    const now = new Date();
    const time = now.toLocaleTimeString('en-GB', { hour12: false });
    const beat: FeedEvent = {
      time,
      kind: 'HEARTBEAT',
      message: 'All 12 Edge Agents responding...',
      tone: 'muted',
    };
    this.feed = [beat, ...this.feed].slice(0, 30);
  }
}
