import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';

interface Mechanic {
  icon: string;
  title: string;
  desc: string;
}

interface DocCard {
  icon: string;
  kind: string;
  title: string;
  desc: string;
  route?: string;
}

interface Policy {
  id: string;
  status: 'ACTIVE' | 'DRAFT';
}

interface MatrixRow {
  area: string;
  role: string;
  scope: string;
  freq: string;
  freqTone: 'primary' | 'secondary';
}

interface EscalationStep {
  n: number;
  tone: 'primary' | 'warning' | 'error';
  title: string;
  items: string[];
}

interface Contact {
  initials: string;
  role: string;
  email: string;
  tone: 'primary' | 'secondary';
}

interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
}

@Component({
  selector: 'app-support-page',
  imports: [RouterLink],
  templateUrl: './support.html',
  styleUrl: './support.scss',
})
export class SupportPageComponent implements OnInit {
  private static readonly STORE_KEY = 'aegis-readiness';

  readonly runbookVersion = 'v1.4';
  readonly escalationLevels = 3;
  readonly policyReview = 'Monthly';

  readonly mechanics: Mechanic[] = [
    {
      icon: 'router',
      title: 'OpenWrt Monitoring',
      desc: 'Continuous telemetry gathering from deployed edge devices running custom OpenWrt firmware.',
    },
    {
      icon: 'rule_folder',
      title: 'Local Rule Detection',
      desc: 'On-device evaluation of network traffic against deployed detection rulesets (pulled from the backend).',
    },
    {
      icon: 'database',
      title: 'Metadata Ingestion',
      desc: 'Encrypted HTTPS pipelines transmitting alert and traffic metadata to the central SOC backend.',
    },
    {
      icon: 'troubleshoot',
      title: 'Investigation Flow',
      desc: 'Structured correlation of alerts with topology data for rapid triage and root-cause analysis.',
    },
  ];

  readonly docs: DocCard[] = [
    {
      icon: 'architecture',
      kind: 'TOPOLOGY',
      title: 'Architecture Guide',
      desc: 'High-level overview of node deployment, pipelines, and central backend systems.',
      route: '/app/topology',
    },
    {
      icon: 'gavel',
      kind: 'RULES',
      title: 'Router Rules Guide',
      desc: 'Syntax and deployment procedures for pushing localized detection signatures.',
      route: '/app/rules',
    },
    {
      icon: 'healing',
      kind: 'INCIDENTS',
      title: 'Incident Handling',
      desc: 'Standard operating procedures for triaging and responding to active threats.',
      route: '/app/incidents',
    },
  ];

  readonly policies: Policy[] = [
    { id: 'POL-EDGE-001', status: 'ACTIVE' },
    { id: 'POL-RULE-002', status: 'ACTIVE' },
    { id: 'POL-LOG-003', status: 'DRAFT' },
    { id: 'POL-INC-004', status: 'ACTIVE' },
    { id: 'POL-DATA-005', status: 'ACTIVE' },
  ];

  readonly matrix: MatrixRow[] = [
    {
      area: 'Edge Router Config',
      role: 'Network Admin',
      scope: 'OpenWrt deployment, network interfaces',
      freq: 'Quarterly',
      freqTone: 'secondary',
    },
    {
      area: 'Router Detection Rules',
      role: 'SOC Engineer',
      scope: 'Signature tuning, false-positive reduction',
      freq: 'Weekly',
      freqTone: 'secondary',
    },
    {
      area: 'Incident Review',
      role: 'L2 Analyst',
      scope: 'Alert triage, escalation, resolution',
      freq: 'Continuous',
      freqTone: 'primary',
    },
    {
      area: 'Documentation',
      role: 'Platform Owner',
      scope: 'Runbooks, architecture diagrams',
      freq: 'Biannual',
      freqTone: 'secondary',
    },
    {
      area: 'Data Governance',
      role: 'Compliance Officer',
      scope: 'Retention, privacy, metadata handling',
      freq: 'Annual',
      freqTone: 'secondary',
    },
  ];

  readonly escalation: EscalationStep[] = [
    {
      n: 1,
      tone: 'primary',
      title: 'Analyst Review',
      items: [
        'Verify initial severity rating',
        'Cross-reference historical logs',
        'Identify affected network path',
      ],
    },
    {
      n: 2,
      tone: 'warning',
      title: 'Technical Investigation',
      items: [
        'Inspect specific edge router state',
        'Validate triggered detection rules',
        'Construct incident timeline',
      ],
    },
    {
      n: 3,
      tone: 'error',
      title: 'Governance Review',
      items: [
        'Confirm final severity assessment',
        'Update post-mortem documentation',
        'Initiate rule tuning procedures',
      ],
    },
  ];

  readonly contacts: Contact[] = [
    { initials: 'SO', role: 'Security Owner', email: 'sec-ops@aegis.local', tone: 'primary' },
    { initials: 'PO', role: 'Platform Owner', email: 'infra@aegis.local', tone: 'secondary' },
  ];

  checklist: ChecklistItem[] = [
    { key: 'agents', label: 'OpenWrt agents documented and mapped', done: true },
    { key: 'runbook', label: 'L1/L2 Runbook available and versioned', done: true },
    { key: 'retention', label: 'Log retention policies clearly defined', done: true },
    { key: 'pentest', label: 'Quarterly penetration test results reviewed', done: false },
  ];

  ngOnInit(): void {
    const saved = this.readSaved();
    if (saved) {
      this.checklist = this.checklist.map((c) => ({ ...c, done: saved[c.key] ?? c.done }));
    }
  }

  /** Platform readiness = share of completed checklist items (real, derived). */
  get readiness(): number {
    const done = this.checklist.filter((c) => c.done).length;
    return Math.round((done / this.checklist.length) * 100);
  }

  toggle(item: ChecklistItem): void {
    item.done = !item.done;
    this.persist();
  }

  private persist(): void {
    try {
      const map: Record<string, boolean> = {};
      this.checklist.forEach((c) => (map[c.key] = c.done));
      localStorage.setItem(SupportPageComponent.STORE_KEY, JSON.stringify(map));
    } catch {
      /* storage unavailable — keep in-memory */
    }
  }

  private readSaved(): Record<string, boolean> | null {
    try {
      const raw = localStorage.getItem(SupportPageComponent.STORE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : null;
    } catch {
      return null;
    }
  }
}
