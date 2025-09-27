/**
 * Clipboard helpers with graceful fallback for non-secure contexts.
 * - Prefers Async Clipboard API on secure contexts (HTTPS/localhost)
 * - Falls back to document.execCommand('copy') on HTTP or older browsers
 *
 * 必ずユーザー操作（click など）直後に呼び出してください。
 */

export function canUseAsyncClipboard(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      (window as any).isSecureContext === true &&
      typeof navigator !== 'undefined' &&
      !!navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    );
  } catch {
    return false;
  }
}

/**
 * Copy text to clipboard. Returns true on success.
 * Tries Async Clipboard first; if unavailable or fails, uses execCommand fallback.
 */
export async function copyText(text: string): Promise<boolean> {
  // Prefer modern API on secure contexts
  if (canUseAsyncClipboard()) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy path
    }
  }

  // Legacy fallback for non-secure contexts / older browsers
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
