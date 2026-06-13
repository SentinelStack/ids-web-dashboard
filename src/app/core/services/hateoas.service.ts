import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiResponse } from '../models/api-response.model';
import { HalResource, linkHref } from '../models/hateoas';
import { API_BASE_URL } from '../tokens/api-base-url.token';
import { ApiService } from './api.service';

/**
 * Hypermedia entry point for the app. Bootstraps once from the API index
 * (`GET /api` — the single hardcoded URL), then every navigation is done by
 * following links, never by constructing paths.
 */
@Injectable({ providedIn: 'root' })
export class HateoasService {
  private readonly api = inject(ApiService);
  private readonly root = inject(API_BASE_URL);
  private bootstrap: Promise<HalResource | null> | null = null;

  /** Load (and cache) the API index. */
  index(): Promise<HalResource | null> {
    if (!this.bootstrap) {
      this.bootstrap = firstValueFrom(this.api.get<HalResource>(this.root))
        .then((r) => r?.data ?? null)
        .catch(() => null);
    }
    return this.bootstrap;
  }

  /** Resolve a top-level relation's href from the index. */
  async hrefOf(rel: string): Promise<string | undefined> {
    return linkHref(await this.index(), rel);
  }

  /** Follow a top-level relation from the index. */
  async follow<T>(rel: string): Promise<ApiResponse<T> | null> {
    const href = await this.hrefOf(rel);
    return href ? firstValueFrom(this.api.get<T>(href)) : null;
  }

  /** GET an absolute link href (e.g. taken from another resource's links). */
  followHref<T>(href: string): Promise<ApiResponse<T>> {
    return firstValueFrom(this.api.get<T>(href));
  }

  /** Download an absolute link href as a blob. */
  downloadHref(href: string): Promise<Blob> {
    return firstValueFrom(this.api.getBlob(href));
  }
}
