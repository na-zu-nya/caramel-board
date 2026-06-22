import {
  getSettings,
  importUrl,
  inferFileName,
  isHttpUrl,
  isRejectedVideoUrl,
  normalizeApiBaseUrl,
  saveSettings,
  syncDatasets,
  t,
  uploadBlob,
} from './shared.js';

const MENU_ROOT_ID = 'caramel-board:add';
const MENU_REFRESH_ID = 'caramel-board:refresh-libraries';
const MENU_OPTIONS_ID = 'caramel-board:open-options';
const MENU_DATASET_PREFIX = 'caramel-board:dataset:';
const MEDIA_CONTEXTS = ['image', 'video'];
const HTTP_TARGET_PATTERNS = ['http://*/*', 'https://*/*'];
const TOAST_SCRIPT_FILE = 'src/page-toast.js';
const TOAST_MESSAGE_TYPE = 'caramel-board:toast';
const BADGE_COLORS = {
  info: '#C7743C',
  progress: '#C7743C',
  success: '#C7743C',
  error: '#a13434',
};
const DEFAULT_DATASET_COLOR = '#C7743C';

const openOptions = () => {
  chrome.runtime.openOptionsPage();
};

const getDataset = ({ settings, datasetId }) => {
  const numericDatasetId = asPositiveInteger(datasetId);
  return settings.datasets.find((item) => item.id === numericDatasetId) || null;
};

const getDatasetThemeColor = ({ settings, datasetId }) => {
  const dataset = getDataset({ settings, datasetId });
  return dataset?.themeColor || DEFAULT_DATASET_COLOR;
};

const getDatasetName = ({ settings, datasetId }) => {
  const dataset = getDataset({ settings, datasetId });
  return dataset?.name || t('fallbackLibraryName', { id: datasetId });
};

const showBadgeFallback = (tone, accentColor = DEFAULT_DATASET_COLOR) => {
  if (!chrome.action?.setBadgeText) return;
  const text = tone === 'success' ? 'OK' : tone === 'error' ? '!' : '...';
  chrome.action.setBadgeBackgroundColor({
    color: accentColor || BADGE_COLORS[tone] || BADGE_COLORS.info,
  });
  chrome.action.setBadgeText({ text });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '' });
  }, 1800);
};

const injectToastScript = (tabId) =>
  new Promise((resolve) => {
    if (!chrome.scripting?.executeScript) {
      resolve(false);
      return;
    }
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files: [TOAST_SCRIPT_FILE],
      },
      () => {
        if (chrome.runtime.lastError) {
          console.warn('Toast script injection failed:', chrome.runtime.lastError.message);
          resolve(false);
          return;
        }
        resolve(true);
      }
    );
  });

const sendToastMessage = (tabId, payload) =>
  new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: TOAST_MESSAGE_TYPE, payload }, () => {
      if (chrome.runtime.lastError) {
        console.warn('Toast message failed:', chrome.runtime.lastError.message);
        resolve(false);
        return;
      }
      resolve(true);
    });
  });

const showToast = async ({
  tabId,
  message,
  tone = 'info',
  thumbnailUrl = '',
  stackUrl = '',
  accentColor = DEFAULT_DATASET_COLOR,
}) => {
  if (!Number.isInteger(tabId) || tabId < 0) {
    console.info(message);
    return;
  }

  const injected = await injectToastScript(tabId);
  const sent = injected
    ? await sendToastMessage(tabId, { message, tone, thumbnailUrl, stackUrl, accentColor })
    : false;
  if (!sent) {
    showBadgeFallback(tone, accentColor);
  }
};

const createMenu = (properties) => {
  chrome.contextMenus.create(properties, () => {
    if (chrome.runtime.lastError) {
      console.warn('Context menu creation failed:', chrome.runtime.lastError.message);
    }
  });
};

const removeAllMenus = () =>
  new Promise((resolve) => {
    chrome.contextMenus.removeAll(resolve);
  });

const getDatasetMenuId = (datasetId) => `${MENU_DATASET_PREFIX}${datasetId}`;

const parseDatasetMenuId = (menuItemId) => {
  const raw = String(menuItemId);
  if (!raw.startsWith(MENU_DATASET_PREFIX)) return null;
  const id = Number(raw.slice(MENU_DATASET_PREFIX.length));
  return Number.isInteger(id) && id > 0 ? id : null;
};

const rebuildMenus = async () => {
  const settings = await getSettings();
  await removeAllMenus();

  createMenu({
    id: MENU_ROOT_ID,
    title: t('contextMenuAdd'),
    contexts: MEDIA_CONTEXTS,
    targetUrlPatterns: HTTP_TARGET_PATTERNS,
  });

  if (settings.datasets.length > 0) {
    for (const dataset of settings.datasets) {
      createMenu({
        id: getDatasetMenuId(dataset.id),
        parentId: MENU_ROOT_ID,
        title: dataset.icon ? `${dataset.icon} ${dataset.name}` : dataset.name,
        contexts: MEDIA_CONTEXTS,
        targetUrlPatterns: HTTP_TARGET_PATTERNS,
      });
    }
    createMenu({
      id: 'caramel-board:separator',
      parentId: MENU_ROOT_ID,
      type: 'separator',
      contexts: MEDIA_CONTEXTS,
      targetUrlPatterns: HTTP_TARGET_PATTERNS,
    });
  }

  createMenu({
    id: MENU_REFRESH_ID,
    parentId: MENU_ROOT_ID,
    title: t('contextMenuRefreshLibraries'),
    contexts: MEDIA_CONTEXTS,
    targetUrlPatterns: HTTP_TARGET_PATTERNS,
  });
  createMenu({
    id: MENU_OPTIONS_ID,
    parentId: MENU_ROOT_ID,
    title: t('contextMenuOpenOptions'),
    contexts: MEDIA_CONTEXTS,
    targetUrlPatterns: HTTP_TARGET_PATTERNS,
  });
};

const refreshDatasets = async ({ tabId } = {}) => {
  try {
    const datasets = await syncDatasets();
    await rebuildMenus();
    if (Number.isInteger(tabId)) {
      await showToast({
        tabId,
        message: t('datasetsLoaded', { count: datasets.length }),
        tone: 'success',
      });
    }
  } catch (error) {
    if (Number.isInteger(tabId)) {
      await showToast({
        tabId,
        message: error instanceof Error ? error.message : t('connectionFailure'),
        tone: 'error',
      });
    }
  }
};

const fetchTargetBlob = async ({ url, mediaType }) => {
  const response = await fetch(url, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(t('httpFetchFailure', { status: response.status }));
  }

  const contentType = response.headers.get('content-type') || '';
  const contentDisposition = response.headers.get('content-disposition') || '';
  if (mediaType === 'video' && /mpegurl|dash\+xml/i.test(contentType)) {
    throw new Error(t('streamingUnsupported'));
  }

  const blob = await response.blob();
  if (blob.size <= 0) {
    throw new Error(t('emptyFile'));
  }

  return {
    blob,
    fileName: inferFileName(url, contentType || blob.type, contentDisposition, mediaType),
  };
};

const getTargetUrl = (info) => {
  if (typeof info.srcUrl === 'string' && info.srcUrl.length > 0) return info.srcUrl;
  return '';
};

const getMediaType = (info) => (info.mediaType === 'video' ? 'video' : 'image');

const summarizeUrlImport = (result, datasetName) => {
  const first = Array.isArray(result?.results) ? result.results[0] : null;
  if (!first) return t('urlImportCompleted');
  if (first.status === 'created' || first.status === 'added') {
    return t('addedToLibraryName', { libraryName: datasetName });
  }
  if (first.status === 'skipped') return first.message || t('duplicateSkipped');
  return first.message || t('urlImportFailure');
};

const asPositiveInteger = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

const getStackIdFromStack = (stack) => {
  if (!stack || typeof stack !== 'object') return null;
  return asPositiveInteger(stack.id);
};

const getFirstImportResult = (result) => {
  const first = Array.isArray(result?.results) ? result.results[0] : null;
  return first && typeof first === 'object' ? first : null;
};

const getStackIdFromImportResult = (result) => {
  const first = getFirstImportResult(result);
  return first ? asPositiveInteger(first.stackId) : null;
};

const getToneFromImportResult = (result) => {
  const first = getFirstImportResult(result);
  if (!first) return 'success';
  if (first.status === 'error') return 'error';
  if (first.status === 'skipped') return 'info';
  return 'success';
};

const buildStackUrl = ({ apiBaseUrl, datasetId, stackId }) => {
  const normalizedDatasetId = asPositiveInteger(datasetId);
  const normalizedStackId = asPositiveInteger(stackId);
  if (!normalizedDatasetId || !normalizedStackId) return '';
  const baseUrl = normalizeApiBaseUrl(apiBaseUrl);
  return `${baseUrl}/library/${normalizedDatasetId}/stacks/${normalizedStackId}`;
};

const toAbsoluteApiUrl = ({ apiBaseUrl, value }) => {
  if (!value) return '';
  try {
    return new URL(String(value), `${normalizeApiBaseUrl(apiBaseUrl)}/`).toString();
  } catch {
    return '';
  }
};

const getStackThumbnailUrl = ({ apiBaseUrl, mediaType, sourceUrl, stack }) => {
  if (mediaType === 'image' && isHttpUrl(sourceUrl)) return sourceUrl;
  const firstAsset = Array.isArray(stack?.assets) ? stack.assets[0] : null;
  return toAbsoluteApiUrl({
    apiBaseUrl,
    value: stack?.thumbnail || firstAsset?.thumbnail || firstAsset?.file || '',
  });
};

const uploadByUrl = async ({ datasetId, url, mediaType }) => {
  const { blob, fileName } = await fetchTargetBlob({ url, mediaType });
  return uploadBlob({ blob, fileName, datasetId, mediaType });
};

const addToDataset = async ({ datasetId, info, tabId }) => {
  const url = getTargetUrl(info);
  const mediaType = getMediaType(info);
  const settings = await getSettings();
  const datasetName = getDatasetName({ settings, datasetId });
  const accentColor = getDatasetThemeColor({ settings, datasetId });
  if (!url) {
    await showToast({
      tabId,
      message: t('targetUrlMissing'),
      tone: 'error',
      accentColor,
    });
    return;
  }
  if (mediaType === 'video' && isRejectedVideoUrl(url)) {
    await showToast({ tabId, message: t('directVideoOnly'), tone: 'error', accentColor });
    return;
  }

  await showToast({
    tabId,
    message: t('addingToCaramelBoard'),
    tone: 'progress',
    accentColor,
  });
  try {
    const stack = await uploadByUrl({ datasetId, url, mediaType });
    const stackId = getStackIdFromStack(stack);
    await showToast({
      tabId,
      message: t('addedToLibraryName', { libraryName: datasetName }),
      tone: 'success',
      thumbnailUrl: getStackThumbnailUrl({
        apiBaseUrl: settings.apiBaseUrl,
        mediaType,
        sourceUrl: url,
        stack,
      }),
      stackUrl: buildStackUrl({ apiBaseUrl: settings.apiBaseUrl, datasetId, stackId }),
      accentColor,
    });
    return;
  } catch (uploadError) {
    console.warn('Blob upload failed; trying URL import:', uploadError);
  }

  if (!isHttpUrl(url)) {
    await showToast({ tabId, message: t('fileFetchFailure'), tone: 'error', accentColor });
    return;
  }

  try {
    const result = await importUrl({ url, datasetId, mediaType });
    const stackId = getStackIdFromImportResult(result);
    await showToast({
      tabId,
      message: summarizeUrlImport(result, datasetName),
      tone: getToneFromImportResult(result),
      thumbnailUrl: mediaType === 'image' && isHttpUrl(url) ? url : '',
      stackUrl: buildStackUrl({ apiBaseUrl: settings.apiBaseUrl, datasetId, stackId }),
      accentColor,
    });
  } catch (error) {
    await showToast({
      tabId,
      message: error instanceof Error ? error.message : t('addFailure'),
      tone: 'error',
      accentColor,
    });
  }
};

chrome.runtime.onInstalled.addListener(() => {
  void refreshDatasets().then(rebuildMenus);
});

chrome.runtime.onStartup.addListener(() => {
  void refreshDatasets().then(rebuildMenus);
});

chrome.action.onClicked.addListener(openOptions);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes.datasets || changes.apiBaseUrl) {
    void rebuildMenus();
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const tabId = tab?.id;
  if (info.menuItemId === MENU_OPTIONS_ID) {
    openOptions();
    return;
  }
  if (info.menuItemId === MENU_REFRESH_ID) {
    void refreshDatasets({ tabId });
    return;
  }

  const datasetId = parseDatasetMenuId(info.menuItemId);
  if (!datasetId) return;
  void addToDataset({ datasetId, info, tabId });
});

void getSettings().then(async (settings) => {
  if (!settings.apiBaseUrl) {
    await saveSettings({ apiBaseUrl: 'http://127.0.0.1:6777' });
  }
  await rebuildMenus();
});
