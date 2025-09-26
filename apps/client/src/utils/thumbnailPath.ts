/**
 * Ensure thumbnail path starts with /files
 * This is a common requirement across the application
 * Expected format: /files/library/:dataset-id/...
 */
export function getThumbnailPath(path: string | undefined | null): string {
  if (!path) return '/no-image.png';

  // Normalize /library/... to /files/library/...
  if (path.startsWith('/library/')) return `/files${path}`;

  // Legacy support: /files/ prefix remains accessible
  if (path.startsWith('/files/')) return path;

  // If starts with library/ (without leading slash), expose as /files/library/...
  if (path.startsWith('library/')) return `/files/${path}`;

  // Legacy support: files/ without leading slash
  if (path.startsWith('files/')) return `/${path}`;

  // If path looks like /:dataset-id/..., prepend /files/library
  if (path.match(/^\/\d+\//)) return `/files/library${path}`;

  // For other cases, return as is (assuming it's already a valid path)
  return path;
}
