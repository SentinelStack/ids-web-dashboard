import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { HalResource, linkHref } from '../../core/models/hateoas';
import { ApiService } from '../../core/services/api.service';
import { HateoasService } from '../../core/services/hateoas.service';

type Tone = 'primary' | 'secondary' | 'error' | 'warning' | 'muted';

interface RuleDto extends HalResource {
  ruleId: string;
  name: string;
  signal: string;
  category: string;
  interfaceScope: string;
  severity: string;
  mode: string;
  enabled: boolean;
  version: string;
  targetDeviceId: string;
  logic: string[];
  actions: string[];
  thresholds: Record<string, number>;
  cpuImpact: string;
  memImpact: string;
  evalMs: number;
  matches: number;
  deployedAt?: string;
}

interface RulesKpis {
  activeRouterRules: number;
  agentsSynced: string;
  rulesTriggeredToday: number;
  avgEvaluationMs: number;
  localMitigations: number;
}

interface TriggerDto {
  at: string;
  ruleId: string;
  deviceId: string;
  interfaceScope: string;
  signal: string;
  value: string;
  tone: string;
}

interface DeviceDto extends HalResource {
  deviceId: string;
  name: string;
  ipAddress: string;
  status: string;
}

interface TriggerVM {
  time: string;
  ruleId: string;
  deviceId: string;
  interfaceScope: string;
  signal: string;
  value: string;
  tone: Tone;
}

interface Category {
  label: string;
  value: string | null;
}

const CATEGORIES: Category[] = [
  { label: 'All', value: null },
  { label: 'DDoS', value: 'DDOS' },
  { label: 'SYN Flood', value: 'SYN_FLOOD' },
  { label: 'Port Scan', value: 'PORT_SCAN' },
  { label: 'DNS', value: 'DNS' },
  { label: 'Outbound', value: 'OUTBOUND' },
];

@Component({
  selector: 'app-rules-page',
  imports: [FormsModule],
  templateUrl: './rules.html',
  styleUrl: './rules.scss',
})
export class RulesPageComponent implements OnInit, OnDestroy {
  private static readonly REFRESH_MS = 8000;
  private readonly hateoas = inject(HateoasService);
  private readonly api = inject(ApiService);
  private feedTimer?: ReturnType<typeof setInterval>;

  loaded = false;
  busy = false;

  kpis: RulesKpis = {
    activeRouterRules: 0,
    agentsSynced: '—',
    rulesTriggeredToday: 0,
    avgEvaluationMs: 0,
    localMitigations: 0,
  };
  triggers: TriggerVM[] = [];

  rules: RuleDto[] = [];
  devices: DeviceDto[] = [];
  selected: RuleDto | null = null;

  readonly categories = CATEGORIES;
  readonly interfaceScopes = ['wan', 'br-lan', 'eth0', 'wlan0'];

  // Composable filters — router, interface, category and search all narrow the table together.
  selectedDeviceId: string | null = null;
  selectedInterface: string | null = null;
  activeCategory: string | null = null;
  search = '';

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadRules(), this.loadDevices(), this.loadConsole()]);
    this.loaded = true;
    this.feedTimer = setInterval(() => void this.loadConsole(), RulesPageComponent.REFRESH_MS);
  }

  ngOnDestroy(): void {
    if (this.feedTimer) {
      clearInterval(this.feedTimer);
    }
  }

  // ── Derived view ────────────────────────────────────────────────────────
  /** True if rule `r` is effective on `deviceId` (its target, or global). */
  private onDevice(r: RuleDto, deviceId: string): boolean {
    return r.targetDeviceId === deviceId || r.targetDeviceId === '';
  }

  get visibleRules(): RuleDto[] {
    const q = this.search.trim().toLowerCase();
    return this.rules.filter((r) => {
      const matchDevice = !this.selectedDeviceId || this.onDevice(r, this.selectedDeviceId);
      const matchIface = !this.selectedInterface || r.interfaceScope === this.selectedInterface;
      const matchCat = !this.activeCategory || r.category === this.activeCategory;
      const matchSearch =
        !q || r.name.toLowerCase().includes(q) || r.ruleId.toLowerCase().includes(q);
      return matchDevice && matchIface && matchCat && matchSearch;
    });
  }

  /** Any filter active? Drives the "Clear filters" affordance. */
  get hasActiveFilter(): boolean {
    return !!(
      this.selectedDeviceId ||
      this.selectedInterface ||
      this.activeCategory ||
      this.search
    );
  }

  /** How many rules are effective on a router — shown as a count chip. */
  rulesOnDevice(deviceId: string): number {
    return this.rules.filter((r) => this.onDevice(r, deviceId)).length;
  }

  /** How many rules bind to an interface — shown under the chip. */
  rulesOnInterface(iface: string): number {
    return this.rules.filter((r) => r.interfaceScope === iface).length;
  }

  /** A short, readable router label (UUID device ids get truncated). */
  routerLabel(d: DeviceDto): string {
    if (d.name && d.name.trim() && !/^openwrt edge agent$/i.test(d.name)) {
      return d.name;
    }
    return d.deviceId.length > 18
      ? d.deviceId.slice(0, 8) + '…' + d.deviceId.slice(-4)
      : d.deviceId;
  }

  // ── Loaders ─────────────────────────────────────────────────────────────
  private async loadRules(): Promise<void> {
    try {
      const res = await this.hateoas.follow<{ content: RuleDto[] }>('rules');
      this.rules = res?.data?.content ?? [];
      if (!this.selected && this.rules.length) {
        this.selected = this.rules[0];
      } else if (this.selected) {
        this.selected =
          this.rules.find((r) => r.ruleId === this.selected!.ruleId) ?? this.rules[0] ?? null;
      }
    } catch {
      this.rules = [];
    }
  }

  private async loadDevices(): Promise<void> {
    try {
      const res = await this.hateoas.follow<{ content: DeviceDto[] }>('devices');
      this.devices = res?.data?.content ?? [];
    } catch {
      this.devices = [];
    }
  }

  private async loadConsole(): Promise<void> {
    try {
      const res = await this.hateoas.follow<{ kpis: RulesKpis; triggers: TriggerDto[] }>(
        'console-rules',
      );
      const v = res?.data;
      if (v) {
        this.kpis = v.kpis;
        this.triggers = v.triggers.map((t) => ({
          time: this.timeOf(t.at),
          ruleId: t.ruleId,
          deviceId: t.deviceId,
          interfaceScope: t.interfaceScope,
          signal: t.signal,
          value: t.value,
          tone: this.asTone(t.tone),
        }));
      }
    } catch {
      /* keep last */
    }
  }

  // ── Interaction ─────────────────────────────────────────────────────────
  select(rule: RuleDto): void {
    this.selected = rule;
  }

  /** Toggle the router filter (click the selected one again to clear it). */
  selectRouter(deviceId: string | null): void {
    this.selectedDeviceId = this.selectedDeviceId === deviceId ? null : deviceId;
  }

  /** Toggle the interface filter. */
  selectInterface(iface: string): void {
    this.selectedInterface = this.selectedInterface === iface ? null : iface;
  }

  setCategory(value: string | null): void {
    this.activeCategory = value;
  }

  clearFilters(): void {
    this.selectedDeviceId = null;
    this.selectedInterface = null;
    this.activeCategory = null;
    this.search = '';
  }

  /** Deploy the selected rule to its router (records deployedAt server-side). */
  async deploy(): Promise<void> {
    await this.act('deploy');
  }

  /** Flip enabled state via the rule's state-aware HATEOAS link. */
  async toggleEnabled(): Promise<void> {
    await this.act(this.selected?.enabled ? 'disable' : 'enable');
  }

  private async act(rel: string): Promise<void> {
    if (!this.selected || this.busy) {
      return;
    }
    const href = linkHref(this.selected, rel);
    if (!href) {
      return;
    }
    this.busy = true;
    try {
      const res = await firstValueFrom(this.api.post<unknown, RuleDto>(href, {}));
      // Refresh the list so the row + details reflect the new server state.
      await this.loadRules();
      await this.loadConsole();
      const updated = (res as { data?: RuleDto } | null)?.data;
      if (updated?.ruleId) {
        this.selected = this.rules.find((r) => r.ruleId === updated.ruleId) ?? this.selected;
      }
    } catch {
      /* ignore — the row keeps its prior state */
    } finally {
      this.busy = false;
    }
  }

  deviceStatusTone(status: string): Tone {
    switch (status) {
      case 'ONLINE':
        return 'primary';
      case 'QUARANTINED':
      case 'OFFLINE':
        return 'warning';
      default:
        return 'secondary';
    }
  }

  severityTone(severity: string): Tone {
    switch (severity) {
      case 'CRITICAL':
        return 'error';
      case 'HIGH':
        return 'secondary';
      case 'MEDIUM':
        return 'warning';
      default:
        return 'muted';
    }
  }

  modeLabel(mode: string): string {
    return mode === 'IDS_IPS' ? 'IDS + IPS' : mode;
  }

  actionLabel(action: string): string {
    return action.replace(/_/g, ' ');
  }

  isMitigation(action: string): boolean {
    return action === 'RATE_LIMIT' || action === 'DROP_TRAFFIC';
  }

  thresholdEntries(rule: RuleDto): { key: string; value: number }[] {
    return Object.entries(rule.thresholds ?? {}).map(([key, value]) => ({ key, value }));
  }

  private timeOf(at?: string): string {
    if (!at) {
      return '';
    }
    const d = new Date(at);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour12: false });
  }

  private asTone(tone: string): Tone {
    const allowed: Tone[] = ['primary', 'secondary', 'error', 'warning', 'muted'];
    return (allowed as string[]).includes(tone) ? (tone as Tone) : 'muted';
  }
}
