(() => {
  const globalKey = '__caramelBoardClipperToastReadyV3';
  if (globalThis[globalKey]) return;
  globalThis[globalKey] = true;

  const legacyHostId = 'caramel-board-clipper-toast-root';
  const previousHostId = 'caramel-board-clipper-toast-root-v2';
  const hostId = 'caramel-board-clipper-toast-root-v3';
  let hideTimer = 0;

  const t = (key, substitutions = {}) => {
    const rawMessage = globalThis.chrome?.i18n?.getMessage?.(key) || '';
    const message = rawMessage || key;
    return Object.entries(substitutions).reduce((current, [name, value]) => {
      return current.replaceAll(`{${name}}`, String(value));
    }, message);
  };

  const createRoot = () => {
    document.getElementById(legacyHostId)?.remove();
    document.getElementById(previousHostId)?.remove();
    const existing = document.getElementById(hostId);
    if (existing?.shadowRoot) return existing.shadowRoot;

    const host = document.createElement('div');
    host.id = hostId;
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host {
        all: initial;
        position: fixed;
        top: 18px;
        right: 18px;
        z-index: 2147483647;
        pointer-events: none;
      }

      .toast {
        --accent: #27272a;
        all: initial;
        display: grid;
        grid-template-columns: 2px minmax(0, 1fr);
        align-items: center;
        column-gap: 12px;
        min-height: 62px;
        max-width: min(380px, calc(100vw - 32px));
        box-sizing: border-box;
        border-radius: 8px;
        background:
          linear-gradient(90deg, color-mix(in srgb, var(--accent) 7%, #fff) 0%, #fff 48%),
          #fff;
        box-shadow:
          0 18px 44px rgb(24 24 27 / 16%),
          0 2px 8px rgb(24 24 27 / 8%);
        color: #18181b;
        font: 700 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
        opacity: 0;
        padding: 10px 12px;
        pointer-events: none;
        transform: translateY(-6px);
        transition:
          opacity 140ms ease,
          transform 140ms ease;
        white-space: normal;
      }

      .toast.has-thumbnail {
        grid-template-columns: 2px 42px minmax(0, 1fr);
      }

      .toast.is-clickable {
        cursor: pointer;
      }

      .toast.is-clickable:hover {
        box-shadow:
          0 20px 48px rgb(24 24 27 / 20%),
          0 3px 10px rgb(24 24 27 / 10%);
      }

      .toast:focus-visible {
        outline: 2px solid color-mix(in srgb, var(--accent) 65%, white);
        outline-offset: 3px;
      }

      .toast.is-visible {
        opacity: 1;
        transform: translateY(0);
      }

      .toast.is-visible.is-clickable {
        pointer-events: auto;
      }

      .accent-line {
        width: 2px;
        height: 42px;
        border-radius: 999px;
        background: var(--accent);
      }

      .thumbnail {
        display: block;
        width: 42px;
        height: 42px;
        min-width: 42px;
        max-width: 42px;
        min-height: 42px;
        max-height: 42px;
        box-sizing: border-box;
        border-radius: 6px;
        background-color: #f4f4f5;
        background-position: center;
        background-repeat: no-repeat;
        background-size: cover;
        contain: strict;
        overflow: hidden;
      }

      .thumbnail.is-hidden {
        display: none;
      }

      .message {
        min-width: 0;
        overflow-wrap: anywhere;
      }

      @media (max-width: 560px) {
        :host {
          left: 12px;
          right: 12px;
          top: 12px;
        }

        .toast {
          max-width: none;
        }
      }
    `;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    shadow.append(style, toast);
    document.documentElement.append(host);
    return shadow;
  };

  const showToast = ({ message, tone, thumbnailUrl, stackUrl, accentColor }) => {
    const shadow = createRoot();
    const toast = shadow.querySelector('.toast');
    if (!toast) return;

    if (accentColor) {
      toast.style.setProperty('--accent', String(accentColor));
    } else {
      toast.style.removeProperty('--accent');
    }

    const accentLine = document.createElement('div');
    accentLine.className = 'accent-line';
    accentLine.setAttribute('aria-hidden', 'true');

    const thumbnail = document.createElement('div');
    thumbnail.className = thumbnailUrl ? 'thumbnail' : 'thumbnail is-hidden';
    if (thumbnailUrl) {
      thumbnail.style.backgroundImage = `url(${JSON.stringify(String(thumbnailUrl))})`;
      thumbnail.setAttribute('aria-hidden', 'true');
    }

    const text = document.createElement('div');
    text.className = 'message';
    text.textContent = String(message || '');

    toast.removeAttribute('aria-hidden');
    toast.replaceChildren(accentLine, thumbnail, text);
    toast.dataset.tone = tone || 'info';
    toast.classList.toggle('has-thumbnail', Boolean(thumbnailUrl));
    if (stackUrl) {
      toast.dataset.stackUrl = String(stackUrl);
      toast.classList.add('is-clickable');
      toast.tabIndex = 0;
      toast.title = t('openStackTitle');
      toast.setAttribute('role', 'button');
      toast.setAttribute('aria-label', t('openStackAriaLabel', { message: String(message || '') }));
    } else {
      delete toast.dataset.stackUrl;
      toast.classList.remove('is-clickable');
      toast.removeAttribute('tabindex');
      toast.removeAttribute('title');
      toast.setAttribute('role', 'status');
      toast.removeAttribute('aria-label');
    }
    toast.classList.add('is-visible');
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(
      () => {
        toast.classList.remove('is-visible');
        toast.setAttribute('aria-hidden', 'true');
        toast.removeAttribute('tabindex');
      },
      tone === 'progress' ? 1400 : 2000
    );
  };

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== 'caramel-board:toast') return;
    showToast(message.payload || {});
  });

  document.addEventListener('click', (event) => {
    const path = event.composedPath();
    const toast = path.find(
      (node) => node instanceof HTMLElement && node.classList.contains('toast')
    );
    if (!(toast instanceof HTMLElement)) return;
    const stackUrl = toast.dataset.stackUrl;
    if (!stackUrl) return;
    window.open(stackUrl, '_blank', 'noopener');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const path = event.composedPath();
    const toast = path.find(
      (node) => node instanceof HTMLElement && node.classList.contains('toast')
    );
    if (!(toast instanceof HTMLElement)) return;
    const stackUrl = toast.dataset.stackUrl;
    if (!stackUrl) return;
    event.preventDefault();
    window.open(stackUrl, '_blank', 'noopener');
  });
})();
