export const AUTHOR_LINK_PROVIDERS = [
  'pixiv',
  'x',
  'fanbox',
  'youtube',
  'niconico',
  'custom',
] as const;
export const MAX_AUTHOR_LINKS = 5;

export type AuthorLinkProvider = (typeof AUTHOR_LINK_PROVIDERS)[number];

const AUTHOR_LINK_PROVIDER_SET = new Set<string>(AUTHOR_LINK_PROVIDERS);

export interface AuthorLinkInput {
  id?: number;
  label?: string | null;
  url: string;
}

export interface NormalizedAuthorLink {
  id?: number;
  provider: AuthorLinkProvider;
  label: string;
  url: string;
  externalId: string | null;
  sortOrder: number;
}

const PROVIDER_LABELS: Record<AuthorLinkProvider, string> = {
  pixiv: 'Pixiv',
  x: 'X',
  fanbox: 'FANBOX',
  youtube: 'YouTube',
  niconico: 'ニコニコ',
  custom: 'Link',
};

const normalizeUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('URL is required');
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withScheme);
  parsed.hash = '';
  return parsed.toString();
};

const cleanPathSegments = (url: URL) =>
  url.pathname
    .split('/')
    .map((segment) => decodeURIComponent(segment.trim()))
    .filter((segment) => segment.length > 0);

const hostWithoutWww = (url: URL) => url.hostname.toLowerCase().replace(/^www\./, '');

const inferCustomLabel = (url: URL) => {
  const host = hostWithoutWww(url);
  return host || PROVIDER_LABELS.custom;
};

export function normalizeAuthorLinkProvider(
  provider: string | null | undefined
): AuthorLinkProvider {
  return provider && AUTHOR_LINK_PROVIDER_SET.has(provider)
    ? (provider as AuthorLinkProvider)
    : 'custom';
}

export function detectAuthorLink(value: string, label?: string | null) {
  const normalizedUrl = normalizeUrl(value);
  const url = new URL(normalizedUrl);
  const host = hostWithoutWww(url);
  const segments = cleanPathSegments(url);
  let provider: AuthorLinkProvider = 'custom';
  let externalId: string | null = null;

  if (host === 'pixiv.net' || host.endsWith('.pixiv.net')) {
    const usersIndex = segments.findIndex((segment) => segment.toLowerCase() === 'users');
    provider = 'pixiv';
    externalId =
      usersIndex >= 0 ? (segments[usersIndex + 1] ?? null) : (url.searchParams.get('id') ?? null);
  } else if (host === 'x.com' || host === 'twitter.com') {
    provider = 'x';
    const handle = segments[0];
    externalId = handle && !['i', 'home', 'search', 'share'].includes(handle) ? handle : null;
  } else if (host === 'fanbox.cc' || host.endsWith('.fanbox.cc')) {
    provider = 'fanbox';
    if (host.endsWith('.fanbox.cc') && host !== 'fanbox.cc') {
      externalId = host.slice(0, -'.fanbox.cc'.length);
    } else {
      const first = segments[0];
      externalId = first?.startsWith('@') ? first.slice(1) : (first ?? null);
    }
  } else if (host === 'youtube.com' || host === 'youtu.be' || host.endsWith('.youtube.com')) {
    provider = 'youtube';
    const first = segments[0];
    externalId = first?.startsWith('@')
      ? first.slice(1)
      : ['channel', 'user', 'c'].includes(first ?? '')
        ? (segments[1] ?? null)
        : (first ?? null);
  } else if (host.endsWith('nicovideo.jp') || host === 'nico.ms') {
    provider = 'niconico';
    const userIndex = segments.findIndex((segment) => segment.toLowerCase() === 'user');
    const illustIndex = segments.findIndex((segment) => segment.toLowerCase() === 'illust');
    externalId =
      userIndex >= 0
        ? (segments[userIndex + 1] ?? null)
        : illustIndex >= 0
          ? (segments[illustIndex + 1] ?? null)
          : (segments[0] ?? null);
  }

  const trimmedLabel = label?.trim();
  return {
    provider,
    label:
      trimmedLabel || (provider === 'custom' ? inferCustomLabel(url) : PROVIDER_LABELS[provider]),
    url: normalizedUrl,
    externalId,
  };
}

export function normalizeAuthorLinks(inputs: AuthorLinkInput[]): NormalizedAuthorLink[] {
  if (inputs.length > MAX_AUTHOR_LINKS) {
    throw new Error(`Author links can contain at most ${MAX_AUTHOR_LINKS} entries`);
  }

  return inputs.map((input, index) => ({
    id: input.id,
    ...detectAuthorLink(input.url, input.label),
    sortOrder: index,
  }));
}
