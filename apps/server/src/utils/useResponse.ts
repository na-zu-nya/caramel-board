import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export function useResponse<T>(c: Context, data: T, status = 200) {
  const responseStatus = toContentfulStatusCode(status);
  if (process.env.ENVIRONMENT !== 'production') {
    console.log('response:', responseStatus, data);
  }

  // 2xx系のステータスコードは成功レスポンス
  if (responseStatus >= 200 && responseStatus < 300) {
    return c.json(data, responseStatus);
  }

  // それ以外はエラーレスポンス
  return c.json(resolveErrorPayload(responseStatus, data), responseStatus);
}

function toContentfulStatusCode(status: number): ContentfulStatusCode {
  if (status === 204 || status === 205 || status === 304) return 200;
  if (status >= 100 && status <= 599) return status as ContentfulStatusCode;
  return 500;
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
