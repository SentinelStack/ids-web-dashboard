/** A HATEOAS link as returned by the backend (Spring HATEOAS). */
export interface HalLink {
  rel: string;
  href: string;
}

/** Any resource that carries HATEOAS links. */
export interface HalResource {
  links?: HalLink[];
}

/**
 * Resolve a link href by relation. Strips RFC 6570 *query* templates
 * (`{?…}`/`{&…}`) so callers can append their own query string, but keeps
 * *path* templates (`{alertId}`) for {@link expand} to fill. Returns undefined
 * when the rel is absent — i.e. the action is not available on the resource.
 */
export function linkHref(
  resource: HalResource | null | undefined,
  rel: string,
): string | undefined {
  const href = resource?.links?.find((l) => l.rel === rel)?.href;
  return href === undefined ? undefined : href.replace(/\{[?&][^}]*\}/g, '');
}

/** True when the resource advertises the given relation. */
export function hasLink(resource: HalResource | null | undefined, rel: string): boolean {
  return !!linkHref(resource, rel);
}

/**
 * Expand an RFC 6570 link template: substitute `{name}` path params and drop any
 * `{?…}`/`{&…}` query template (callers append their own query string).
 */
export function expand(template: string, params: Record<string, string> = {}): string {
  return template
    .replace(/\{[?&][^}]*\}/g, '')
    .replace(/\{(\w+)\}/g, (_, key) => encodeURIComponent(params[key] ?? ''));
}
