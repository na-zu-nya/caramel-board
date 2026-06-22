import type { AuthorLink } from '@/types';

export const MAX_AUTHOR_LINKS = 5;

type KnownProvider = 'pixiv' | 'x' | 'fanbox' | 'youtube' | 'niconico' | 'custom';

const PROVIDER_LABELS: Partial<Record<KnownProvider, string>> = {
  pixiv: 'Pixiv',
  x: 'X',
  fanbox: 'FANBOX',
  youtube: 'YouTube',
  niconico: 'ニコニコ',
};

const normalizeHost = (host: string) => host.toLowerCase().replace(/^www\./, '');

const parseAuthorLinkUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
};

const cleanPathSegments = (url: URL) =>
  url.pathname
    .split('/')
    .map((segment) => {
      const trimmed = segment.trim();
      try {
        return decodeURIComponent(trimmed);
      } catch {
        return trimmed;
      }
    })
    .filter((segment) => segment.length > 0);

function detectAuthorLink(url: URL): {
  provider: KnownProvider;
  label: string;
  externalLabel: string;
} {
  const host = normalizeHost(url.hostname);
  const segments = cleanPathSegments(url);
  let provider: KnownProvider = 'custom';
  let externalLabel = host;

  if (host === 'pixiv.net' || host.endsWith('.pixiv.net')) {
    provider = 'pixiv';
    const usersIndex = segments.findIndex((segment) => segment.toLowerCase() === 'users');
    externalLabel =
      usersIndex >= 0 ? (segments[usersIndex + 1] ?? host) : (url.searchParams.get('id') ?? host);
  } else if (
    host === 'x.com' ||
    host.endsWith('.x.com') ||
    host === 'twitter.com' ||
    host.endsWith('.twitter.com')
  ) {
    provider = 'x';
    const handle = segments[0];
    externalLabel = handle && !['i', 'home', 'search', 'share'].includes(handle) ? handle : host;
  } else if (host === 'fanbox.cc' || host.endsWith('.fanbox.cc')) {
    provider = 'fanbox';
    if (host.endsWith('.fanbox.cc') && host !== 'fanbox.cc') {
      externalLabel = host.slice(0, -'.fanbox.cc'.length);
    } else {
      const first = segments[0];
      externalLabel = first?.startsWith('@') ? first.slice(1) : (first ?? host);
    }
  } else if (host === 'youtube.com' || host === 'youtu.be' || host.endsWith('.youtube.com')) {
    provider = 'youtube';
    const first = segments[0];
    externalLabel = first?.startsWith('@')
      ? first.slice(1)
      : ['channel', 'user', 'c'].includes(first ?? '')
        ? (segments[1] ?? host)
        : (first ?? host);
  } else if (host.endsWith('nicovideo.jp') || host === 'nico.ms') {
    provider = 'niconico';
    const userIndex = segments.findIndex((segment) => segment.toLowerCase() === 'user');
    const illustIndex = segments.findIndex((segment) => segment.toLowerCase() === 'illust');
    externalLabel =
      userIndex >= 0
        ? (segments[userIndex + 1] ?? host)
        : illustIndex >= 0
          ? (segments[illustIndex + 1] ?? host)
          : (segments[0] ?? host);
  }

  return {
    provider,
    label: provider === 'custom' ? host : (PROVIDER_LABELS[provider] ?? provider),
    externalLabel,
  };
}

export function getAuthorLinkPreview(value: string) {
  const url = parseAuthorLinkUrl(value);
  if (!url) return null;
  return detectAuthorLink(url);
}

export function getAuthorLinkLabel(link: Pick<AuthorLink, 'provider' | 'url'>) {
  const knownProvider =
    link.provider === 'pixiv' ||
    link.provider === 'x' ||
    link.provider === 'fanbox' ||
    link.provider === 'youtube' ||
    link.provider === 'niconico'
      ? link.provider
      : null;
  if (knownProvider) return PROVIDER_LABELS[knownProvider] ?? knownProvider;

  const url = parseAuthorLinkUrl(link.url);
  return url ? normalizeHost(url.hostname) : link.url;
}

export function getAuthorLinkExternalLabel(link: Pick<AuthorLink, 'externalId' | 'url'>) {
  if (link.externalId) return link.externalId;
  try {
    return normalizeHost(new URL(link.url).hostname);
  } catch {
    return link.url;
  }
}

export function getAuthorLinkTone(provider: AuthorLink['provider']) {
  switch (provider) {
    case 'pixiv':
      return 'bg-blue-50 text-blue-700 border-blue-100';
    case 'x':
      return 'bg-neutral-900 text-white border-neutral-900';
    case 'fanbox':
      return 'bg-cyan-50 text-cyan-700 border-cyan-100';
    case 'youtube':
      return 'bg-red-50 text-red-700 border-red-100';
    case 'niconico':
      return 'bg-gray-100 text-gray-800 border-gray-200';
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200';
  }
}
