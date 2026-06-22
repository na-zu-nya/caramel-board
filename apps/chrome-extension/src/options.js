import {
  API_CANDIDATES,
  authDataset,
  getSettings,
  saveSettings,
  setDatasetAuthorization,
  syncDatasets,
  t,
  testConnection,
} from './shared.js';

const settingsForm = document.querySelector('#settingsForm');
const apiBaseUrlInput = document.querySelector('#apiBaseUrl');
const clipperApiKeyInput = document.querySelector('#clipperApiKey');
const basicAuthUsernameInput = document.querySelector('#basicAuthUsername');
const basicAuthPasswordInput = document.querySelector('#basicAuthPassword');
const detectButton = document.querySelector('#detectButton');
const testButton = document.querySelector('#testButton');
const syncButton = document.querySelector('#syncButton');
const datasetsContainer = document.querySelector('#datasets');
const datasetCount = document.querySelector('#datasetCount');
const statusText = document.querySelector('#status');

const applyLocalization = () => {
  document.documentElement.lang =
    globalThis.chrome?.i18n?.getUILanguage?.() || navigator.language || 'ja';
  document.title = t('optionsPageTitle');

  for (const element of document.querySelectorAll('[data-i18n]')) {
    const key = element.getAttribute('data-i18n');
    if (key) element.textContent = t(key);
  }

  for (const element of document.querySelectorAll('[data-i18n-placeholder]')) {
    const key = element.getAttribute('data-i18n-placeholder');
    if (key) element.setAttribute('placeholder', t(key));
  }
};

const setStatus = (message) => {
  statusText.textContent = message;
};

const setBusy = (busy) => {
  for (const button of [detectButton, testButton, syncButton]) {
    button.disabled = busy;
  }
  for (const control of datasetsContainer.querySelectorAll(
    '.dataset-auth input, .dataset-auth button'
  )) {
    if (control instanceof HTMLInputElement || control instanceof HTMLButtonElement) {
      control.disabled = busy;
    }
  }
};

const fillForm = (settings) => {
  apiBaseUrlInput.value = settings.apiBaseUrl;
  clipperApiKeyInput.value = settings.clipperApiKey;
  basicAuthUsernameInput.value = settings.basicAuthUsername;
  basicAuthPasswordInput.value = settings.basicAuthPassword;
};

const collectForm = () => ({
  apiBaseUrl: apiBaseUrlInput.value,
  clipperApiKey: clipperApiKeyInput.value.trim(),
  basicAuthUsername: basicAuthUsernameInput.value.trim(),
  basicAuthPassword: basicAuthPasswordInput.value,
});

const renderDatasets = (datasets) => {
  datasetCount.textContent = String(datasets.length);
  datasetsContainer.replaceChildren();

  if (datasets.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = t('emptyLibraries');
    datasetsContainer.append(empty);
    return;
  }

  for (const dataset of datasets) {
    const isAuthorized = dataset.isProtected && dataset.authorized === true;
    const row = document.createElement('div');
    row.className = isAuthorized ? 'dataset-row is-authorized' : 'dataset-row';

    const meta = document.createElement('div');
    meta.className = 'dataset-meta';

    const name = document.createElement('div');
    name.className = 'dataset-name';
    name.textContent = dataset.icon ? `${dataset.icon} ${dataset.name}` : dataset.name;
    meta.append(name);

    if (dataset.isProtected) {
      const badge = document.createElement('span');
      badge.className = isAuthorized ? 'authorized' : 'protected';
      badge.textContent = isAuthorized ? t('authorizedBadge') : t('unauthorizedBadge');
      meta.append(badge);
    }

    row.append(meta);

    if (dataset.isProtected && !isAuthorized) {
      const auth = document.createElement('form');
      auth.className = 'dataset-auth';
      auth.dataset.datasetId = String(dataset.id);

      const password = document.createElement('input');
      password.type = 'password';
      password.placeholder = t('passwordPlaceholder');
      password.autocomplete = 'current-password';
      auth.append(password);

      const button = document.createElement('button');
      button.className = 'secondary-button';
      button.type = 'submit';
      button.textContent = t('authorizeButton');
      auth.append(button);

      row.append(auth);
    }

    datasetsContainer.append(row);
  }
};

const refreshView = async () => {
  const settings = await getSettings();
  fillForm(settings);
  renderDatasets(settings.datasets);
};

const saveCurrentSettings = async () => {
  await saveSettings(collectForm());
};

const getErrorMessage = (error, fallbackKey) => {
  return error instanceof Error ? error.message : t(fallbackKey);
};

const syncDatasetsIfClipperKeyExists = async () => {
  if (!collectForm().clipperApiKey) return null;
  const datasets = await syncDatasets();
  renderDatasets(datasets);
  return datasets;
};

settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setBusy(true);
  try {
    await saveCurrentSettings();
    try {
      const datasets = await syncDatasetsIfClipperKeyExists();
      setStatus(
        datasets ? t('saveSuccessWithDatasets', { count: datasets.length }) : t('saveSuccess')
      );
    } catch (error) {
      setStatus(
        t('saveSuccessSyncFailure', { message: getErrorMessage(error, 'syncLibrariesFailure') })
      );
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('saveFailure'));
  } finally {
    setBusy(false);
  }
});

testButton.addEventListener('click', async () => {
  setBusy(true);
  try {
    await saveCurrentSettings();
    await testConnection();
    try {
      const datasets = await syncDatasetsIfClipperKeyExists();
      setStatus(
        datasets
          ? t('connectionSuccessWithDatasets', { count: datasets.length })
          : t('connectionSuccess')
      );
    } catch (error) {
      setStatus(
        t('connectionSuccessSyncFailure', {
          message: getErrorMessage(error, 'syncLibrariesFailure'),
        })
      );
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('connectionTestFailure'));
  } finally {
    setBusy(false);
  }
});

syncButton.addEventListener('click', async () => {
  setBusy(true);
  try {
    await saveCurrentSettings();
    const datasets = await syncDatasets();
    renderDatasets(datasets);
    setStatus(t('datasetsLoaded', { count: datasets.length }));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('syncLibrariesFailure'));
  } finally {
    setBusy(false);
  }
});

detectButton.addEventListener('click', async () => {
  setBusy(true);
  try {
    const current = collectForm();
    for (const apiBaseUrl of API_CANDIDATES) {
      await saveSettings({ ...current, apiBaseUrl });
      try {
        await testConnection();
        const datasets = current.clipperApiKey ? await syncDatasets() : [];
        await refreshView();
        setStatus(
          current.clipperApiKey
            ? t('apiDetectedWithDatasets', { apiBaseUrl, count: datasets.length })
            : t('apiDetected', { apiBaseUrl })
        );
        return;
      } catch {}
    }
    await saveSettings(current);
    setStatus(t('apiNotDetected'));
  } finally {
    setBusy(false);
  }
});

clipperApiKeyInput.addEventListener('paste', () => {
  setTimeout(() => {
    void (async () => {
      setBusy(true);
      try {
        await saveCurrentSettings();
        try {
          const datasets = await syncDatasetsIfClipperKeyExists();
          setStatus(
            datasets
              ? t('clipperKeySavedWithDatasets', { count: datasets.length })
              : t('clipperKeySaved')
          );
        } catch (error) {
          setStatus(
            t('clipperKeySavedSyncFailure', {
              message: getErrorMessage(error, 'syncLibrariesFailure'),
            })
          );
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : t('saveFailure'));
      } finally {
        setBusy(false);
      }
    })();
  }, 0);
});

datasetsContainer.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  const datasetId = Number(form.dataset.datasetId);
  const passwordInput = form.querySelector('input[type="password"]');
  if (!datasetId || !(passwordInput instanceof HTMLInputElement)) return;

  setBusy(true);
  try {
    await saveCurrentSettings();
    await authDataset(datasetId, passwordInput.value);
    passwordInput.value = '';
    const datasets = await setDatasetAuthorization(datasetId, true);
    renderDatasets(datasets);
    setStatus(t('datasetAuthorized'));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('datasetAuthFailure'));
  } finally {
    setBusy(false);
  }
});

applyLocalization();
void refreshView();
