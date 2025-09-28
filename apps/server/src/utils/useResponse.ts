import type { Context } from 'hono';

export function useResponse<T>(c: Context, data: T, status = 200) {
  if (process.env.ENVIRONMENT !== 'production') {
    console.log('response:', status, data);
  }

  // 2xx系のステータスコードは成功レスポンス
  if (status >= 200 && status < 300) {
    return c.json(data, status);
  }

  // それ以外はエラーレスポンス
  return c.json(resolveErrorPayload(status, data), status);
}

function resolveErrorPayload(status: number, data: unknown) {
  if (data && typeof data === 'object') {
    const maybeError = (data as { error?: unknown }).error;
    if (typeof maybeError === 'string' && maybeError.trim().length > 0) {
      return { error: maybeError };
    }
  }

  if (typeof data === 'string' && data.trim().length > 0) {
    return { error: data };
  }

  switch (status) {
    case 500:
      return { error: 'Internal Error' };
    case 404:
      return { error: 'Not found' };
    default:
      return { error: '' };
  }
}
