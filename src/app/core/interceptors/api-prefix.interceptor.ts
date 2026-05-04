import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { API_BASE_URL } from '../tokens/api-base-url.token';

export const apiPrefixInterceptor: HttpInterceptorFn = (req, next) => {
  const apiBaseUrl = inject(API_BASE_URL);

  if (/^https?:\/\//.test(req.url)) {
    return next(req);
  }

  const normalizedPath = req.url.startsWith('/') ? req.url : `/${req.url}`;
  const url = `${apiBaseUrl}${normalizedPath}`;

  return next(req.clone({ url }));
};
