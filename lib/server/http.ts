import { getChatGPTUser } from '../../app/chatgpt-auth';
import { ZodError } from 'zod';
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
export async function authorize(request: Request, mutation = false) {
  if (mutation) {
    const origin = request.headers.get('origin');
    if (!origin || origin !== new URL(request.url).origin)
      throw new HttpError(403, '请从本网站重新操作');
  }
  const user = await getChatGPTUser();
  if (!user) throw new HttpError(401, '请先登录，再使用你的私人衣橱');
  return user.userId;
}
export function route(fn: (request: Request, context?: any) => Promise<Response>) {
  return async (request: Request, context?: any) => {
    try {
      return await fn(request, context);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      if (error instanceof ZodError)
        return json({ error: error.issues[0]?.message ?? '信息格式不正确' }, 400);
      console.error('[wardrobe]', error instanceof Error ? error.message : 'unknown error');
      return json({ error: '暂时无法完成操作，信息已保留，请稍后重试' }, 500);
    }
  };
}
