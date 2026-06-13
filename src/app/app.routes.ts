import { Routes } from '@angular/router';

import { MainLayoutComponent } from './layouts/main-layout/main-layout';
import { DashboardPageComponent } from './pages/dashboard/dashboard';
import { IncidentsPageComponent } from './pages/incidents/incidents';
import { LoginPageComponent } from './pages/login/login';
import { ReportsPageComponent } from './pages/reports/reports';
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
    ],
  },
  { path: '**', redirectTo: 'login' },
];
