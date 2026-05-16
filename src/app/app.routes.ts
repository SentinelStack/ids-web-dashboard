import { Routes } from '@angular/router';

import { MainLayoutComponent } from './layouts/main-layout/main-layout';
import { DashboardPageComponent } from './pages/dashboard/dashboard';
import { LoginPageComponent } from './pages/login/login';
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
    ],
  },
  { path: '**', redirectTo: 'login' },
];
