import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { RouteReuseStrategy, provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { CachedRouteReuseStrategy } from './core/cached-route-reuse.strategy';
import { apiPrefixInterceptor } from './core/interceptors/api-prefix.interceptor';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    // Order matters: apiPrefix rewrites the URL, then errorInterceptor wraps,
    // then authInterceptor runs innermost so it adds the Bearer token and sees
    // raw 401s before they're converted to generic errors.
    provideHttpClient(withInterceptors([apiPrefixInterceptor, errorInterceptor, authInterceptor])),
    { provide: RouteReuseStrategy, useClass: CachedRouteReuseStrategy },
  ],
};
