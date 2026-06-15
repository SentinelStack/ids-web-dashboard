import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AuthService } from '../services/auth.service';

/**
 * Attaches the JWT to API calls and, on a 401, clears the session and bounces
 * to the login page. Must run innermost (last in the chain) so its error
 * handler sees the raw HttpErrorResponse status.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const token = localStorage.getItem(AuthService.TOKEN_KEY);
  const isAuthCall = req.url.includes('/auth/login') || req.url.includes('/auth/register');

  const authed =
    token && !isAuthCall ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authed).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !isAuthCall) {
        localStorage.removeItem(AuthService.TOKEN_KEY);
        localStorage.removeItem(AuthService.ACCOUNT_KEY);
        void router.navigate(['/login']);
      }
      return throwError(() => error);
    }),
  );
};
