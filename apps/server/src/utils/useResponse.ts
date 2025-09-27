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
  return c.json({ error: getMessage(status, data) }, status);
}

function getMessage(status: number, data: unknown) {
  switch (status) {
    case 500:
      return 'Internal Error';
    case 404:
      return 'Not found';
    default:
      return data && typeof data === 'string' ? data : '';
  }
}
