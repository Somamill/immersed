/** Production app bundles declare their stable HTTPS API origin in the manifest. */
export function configuredServiceOrigin(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new Error('Invalid language service origin');
  const url = new URL(value);
  if (url.username || url.password || url.hash || url.search || url.pathname !== '/' ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))))
    throw new Error('The production language service requires an HTTPS origin');
  return url.origin;
}
