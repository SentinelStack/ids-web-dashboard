import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { MainLayoutComponent } from './layouts/main-layout/main-layout';
import { DashboardPageComponent } from './pages/dashboard/dashboard';
import { DestinationsPageComponent } from './pages/destinations/destinations';
import { IncidentsPageComponent } from './pages/incidents/incidents';
import { LogViewerPageComponent } from './pages/log-viewer/log-viewer';
import { LoginPageComponent } from './pages/login/login';
import { ProfilePageComponent } from './pages/profile/profile';
import { ReportsPageComponent } from './pages/reports/reports';
import { RulesPageComponent } from './pages/rules/rules';
import { SupportPageComponent } from './pages/support/support';
import { TopologyPageComponent } from './pages/topology/topology';
import { TrafficPageComponent } from './pages/traffic/traffic';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', component: LoginPageComponent },
  {
    path: 'app',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', component: DashboardPageComponent },
      { path: 'traffic', component: TrafficPageComponent },
      { path: 'destinations', component: DestinationsPageComponent },
      { path: 'incidents', component: IncidentsPageComponent },
      { path: 'reports', component: ReportsPageComponent },
      { path: 'topology', component: TopologyPageComponent },
      { path: 'rules', component: RulesPageComponent },
      { path: 'logs', component: LogViewerPageComponent },
      { path: 'support', component: SupportPageComponent },
      { path: 'profile', component: ProfilePageComponent },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
