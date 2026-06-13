import { ActivatedRouteSnapshot, DetachedRouteHandle, RouteReuseStrategy } from '@angular/router';

/**
 * Keeps page components alive across navigations instead of destroying and
 * re-creating them. Returning to a page is then instant (no ngOnInit, no
 * re-fetch), and because the component stays alive its background polling keeps
 * the data fresh while it is off-screen.
 */
export class CachedRouteReuseStrategy implements RouteReuseStrategy {
  private readonly handlers = new Map<string, DetachedRouteHandle>();

  private key(route: ActivatedRouteSnapshot): string | null {
    if (!route.routeConfig?.path || !route.routeConfig.component) {
      return null;
    }
    return route.pathFromRoot
      .map((r) => r.routeConfig?.path ?? '')
      .filter((p) => p.length > 0)
      .join('/');
  }

  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    return this.key(route) !== null;
  }

  store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): void {
    const key = this.key(route);
    if (!key) {
      return;
    }
    if (handle) {
      this.handlers.set(key, handle);
    } else {
      this.handlers.delete(key);
    }
  }

  shouldAttach(route: ActivatedRouteSnapshot): boolean {
    const key = this.key(route);
    return key !== null && this.handlers.has(key);
  }

  retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    const key = this.key(route);
    return key ? (this.handlers.get(key) ?? null) : null;
  }

  shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    return future.routeConfig === curr.routeConfig;
  }
}
