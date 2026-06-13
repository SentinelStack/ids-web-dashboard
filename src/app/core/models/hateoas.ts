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
 * Resolve a link href by relation, stripping any RFC 6570 URI-template suffix
 * (e.g. `…{&severity,protocol}`). Returns undefined when the rel is absent —
 * i.e. the action/relation is not currently available on the resource.
 */
export function linkHref(
  resource: HalResource | null | undefined,
  rel: string,
): string | undefined {
  const href = resource?.links?.find((l) => l.rel === rel)?.href;
  if (!href) {
    return undefined;
  }
  const brace = href.indexOf('{');
  return brace >= 0 ? href.slice(0, brace) : href;
}

/** True when the resource advertises the given relation. */
export function hasLink(resource: HalResource | null | undefined, rel: string): boolean {
  return !!linkHref(resource, rel);
}
