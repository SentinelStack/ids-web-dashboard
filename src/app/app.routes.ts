import { Routes } from '@angular/router';

import { MainLayoutComponent } from './layouts/main-layout/main-layout';
import { DashboardPageComponent } from './pages/dashboard/dashboard';
import { IncidentsPageComponent } from './pages/incidents/incidents';
import { LogViewerPageComponent } from './pages/log-viewer/log-viewer';
import { LoginPageComponent } from './pages/login/login';
import { ReportsPageComponent } from './pages/reports/reports';
import { RulesPageComponent } from './pages/rules/rules';
import { TopologyPageComponent } from './pages/topology/topology';
import { TrafficPageComponent } from './pages/traffic/traffic';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', component: LoginPageComponent },
  {
    path: 'app',
    component: MainLayoutComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', component: DashboardPageComponent },
      { path: 'traffic', component: TrafficPageComponent },
      { path: 'incidents', component: IncidentsPageComponent },
      { path: 'reports', component: ReportsPageComponent },
      { path: 'topology', component: TopologyPageComponent },
      { path: 'rules', component: RulesPageComponent },
      { path: 'logs', component: LogViewerPageComponent },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
