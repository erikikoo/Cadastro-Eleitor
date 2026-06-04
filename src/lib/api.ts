/**
 * Custom API URL helper to dynamically resolve endpoints in sub-folder or sub-directory environments (e.g. Hostgator / cPanel)
 */
export function getApiUrl(subPath: string): string {
  if (typeof window === 'undefined') {
    return `/api/${subPath.replace(/^\//, '')}`;
  }

  let basePath = window.location.pathname;

  // Strip known client-side routing and page prefixes
  basePath = basePath
    .split('/registrations')[0]
    .split('/profiles')[0];

  // Strip index.html if present
  basePath = basePath.replace(/\/index\.html$/, '');

  // Strip any trailing slashes
  basePath = basePath.replace(/\/+$/, '');

  const origin = window.location.origin;
  const targetPath = `/api/${subPath.replace(/^\//, '')}`;

  return `${origin}${basePath}${targetPath}`;
}
