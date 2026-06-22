const storageGet = (defaults) =>
  new Promise((resolve) => {
    chrome.storage.local.get(defaults, resolve);
  });

const storageSet = (values) =>
  new Promise((resolve) => {
    chrome.storage.local.set(values, resolve);
  });

export const API_CANDIDATES = [
  'http://127.0.0.1:6777',
  'http://localhost:6777',
  'http://127.0.0.1:6766',
  'http://localhost:6766',
];

export const DEFAULT_SETTINGS = {
  apiBaseUrl: API_CANDIDATES[0],
  clipperApiKey: '',
  basicAuthUsername: '',
  basicAuthPassword: '',
  datasets: [],
};

export const t = (key, substitutions = {}) => {
  const rawMessage = globalThis.chrome?.i18n?.getMessage?.(key) || '';
  const message = rawMessage || key;
  return Object.entries(substitutions).reduce((current, [name, value]) => {
    return current.replaceAll(`{${name}}`, String(value));
  }, message);
};

export const normalizeApiBaseUrl = (value) => {
  const trimmed = String(value || '').trim();
  return trimmed.replace(/\/+$/, '') || DEFAULT_SETTINGS.apiBaseUrl;
};

export const getSettings = async () => {
  const settings = await storageGet(DEFAULT_SETTINGS);
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    apiBaseUrl: normalizeApiBaseUrl(settings.apiBaseUrl),
    datasets: Array.isArray(settings.datasets) ? settings.datasets : [],
  };
};

export const saveSettings = async (patch) => {
  const next = {
    ...patch,
  };
  if (Object.hasOwn(next, 'apiBaseUrl')) {
    next.apiBaseUrl = normalizeApiBaseUrl(next.apiBaseUrl);
  }
  await storageSet(next);
};

const getBasicAuthHeader = (settings) => {
  if (!settings.basicAuthUsername || !settings.basicAuthPassword) return null;
  return `Basic ${btoa(`${settings.basicAuthUsername}:${settings.basicAuthPassword}`)}`;
};

const buildHeaders = (settings, extraHeaders = {}) => {
  const headers = { ...extraHeaders };
  const authHeader = getBasicAuthHeader(settings);
  if (authHeader) {
    headers.Authorization = authHeader;
  }
  if (settings.clipperApiKey) {
    headers['X-Caramel-Clipper-Key'] = settings.clipperApiKey;
  }
  return headers;
};

const normalizeDataset = (dataset) => {
  const isProtected = Boolean(dataset.isProtected);
  return {
    id: Number(dataset.id),
    name: String(dataset.name || t('fallbackLibraryName', { id: dataset.id })),
    icon: dataset.icon ? String(dataset.icon) : '',
    themeColor: dataset.themeColor ? String(dataset.themeColor) : '',
    isProtected,
    authorized: isProtected ? dataset.authorized === true : true,
  };
};

const readErrorMessage = async (response) => {
  const text = await response.text().catch(() => '');
  if (!text) return `${response.status} ${response.statusText}`;
  try {
    const data = JSON.parse(text);
    if (typeof data.error === 'string' && data.error.trim()) return data.error;
    if (typeof data.message === 'string' && data.message.trim()) return data.message;
  } catch {
    return text;
  }
  return `${response.status} ${response.statusText}`;
};

export const apiRequest = async (path, options = {}) => {
  const settings = await getSettings();
  const headers = buildHeaders(settings, options.headers);
  const response = await fetch(`${settings.apiBaseUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return response;
};

export const apiJson = async (path, body) => {
  const response = await apiRequest(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return response.json();
};

export const getDatasets = async () => {
  const datasets = await apiJson('/api/v1/datasets');
  if (!Array.isArray(datasets)) {
    throw new Error(t('invalidDatasetsResponse'));
  }
  return datasets.map(normalizeDataset);
};

export const getDatasetProtectionStatus = async (datasetId) => {
  return apiJson(`/api/v1/datasets/${datasetId}/protection-status`);
};

const attachProtectionStatus = async (dataset) => {
  if (!dataset.isProtected) return { ...dataset, authorized: true };
  try {
    const status = await getDatasetProtectionStatus(dataset.id);
    const isProtected = Boolean(status.isProtected);
    return {
      ...dataset,
      isProtected,
      authorized: isProtected ? Boolean(status.authorized) : true,
    };
  } catch {
    return { ...dataset, authorized: false };
  }
};

export const syncDatasets = async () => {
  const datasets = await getDatasets();
  const datasetsWithProtectionStatus = await Promise.all(datasets.map(attachProtectionStatus));
  await saveSettings({ datasets: datasetsWithProtectionStatus });
  return datasetsWithProtectionStatus;
};

export const testConnection = async () => {
  const response = await apiRequest('/api/v1/health');
  return response.json();
};

export const authDataset = async (datasetId, password) => {
  return apiJson(`/api/v1/datasets/${datasetId}/auth`, { password });
};

export const setDatasetAuthorization = async (datasetId, authorized) => {
  const numericDatasetId = Number(datasetId);
  const settings = await getSettings();
  const datasets = settings.datasets.map((dataset) =>
    dataset.id === numericDatasetId ? { ...dataset, authorized: Boolean(authorized) } : dataset
  );
  await saveSettings({ datasets });
  return datasets;
};

const extensionFromContentType = (contentType) => {
  const normalized = String(contentType || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const mapping = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/avif': '.avif',
    'image/bmp': '.bmp',
    'image/svg+xml': '.svg',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/webm': '.webm',
    'video/x-matroska': '.mkv',
    'video/x-msvideo': '.avi',
    'video/mpeg': '.mpeg',
  };
  return mapping[normalized] || '';
};

const sanitizeFileName = (name) => {
  const sanitized = String(name || '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .split('')
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 0x20 && code !== 0x7f;
    })
    .join('')
    .trim();
  return sanitized.slice(-180);
};

const decodeFileName = (name) => {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
};

const fileNameFromContentDisposition = (contentDisposition) => {
  if (!contentDisposition) return '';
  const encoded = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encoded?.[1]) return decodeFileName(encoded[1]);
  const quoted = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (quoted?.[1]) return decodeFileName(quoted[1]);
  return '';
};

export const inferFileName = (url, contentType, contentDisposition, mediaType) => {
  const headerName = fileNameFromContentDisposition(contentDisposition);
  let name = sanitizeFileName(headerName);
  if (!name) {
    try {
      const parsed = new URL(url);
      name = sanitizeFileName(decodeFileName(parsed.pathname.split('/').filter(Boolean).pop()));
    } catch {
      name = '';
    }
  }

  const fallbackBase = mediaType === 'video' ? 'caramel-video' : 'caramel-image';
  const extension = extensionFromContentType(contentType);
  if (!name) return `${fallbackBase}${extension || ''}`;
  if (!/\.[a-z0-9]{2,5}$/i.test(name) && extension) return `${name}${extension}`;
  return name;
};

export const uploadBlob = async ({ blob, datasetId, mediaType, fileName }) => {
  const formData = new FormData();
  formData.append('file', blob, fileName);
  formData.append('name', fileName);
  formData.append('dataSetId', String(datasetId));
  formData.append('mediaType', mediaType);

  const response = await apiRequest('/api/v1/stacks', {
    method: 'POST',
    body: formData,
  });
  return response.json();
};

export const importUrl = async ({ url, datasetId, mediaType }) => {
  return apiJson('/api/v1/stacks/import-from-urls', {
    urls: [url],
    dataSetId: Number(datasetId),
    mediaType,
  });
};

export const isHttpUrl = (url) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export const isRejectedVideoUrl = (url) => {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    return (
      parsed.protocol !== 'http:' ||
      ['.m3u8', '.mpd'].some((extension) => pathname.endsWith(extension))
    );
  } catch {
    return true;
  }
};
