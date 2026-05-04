import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

export const errorInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const fallbackMessage = 'Unexpected API error.';
      const message = error.error?.message ?? error.message ?? fallbackMessage;

      return throwError(() => new Error(message));
    })
  );
