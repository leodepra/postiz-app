import { cookies } from 'next/headers';
import { customFetch } from '@gitroom/helpers/utils/custom.fetch.func';

export const internalFetch = async (url: string, options: RequestInit = {}) => {
  const cookieStore = await cookies();
  if (process.env.POSTIZ_LOCAL_ONLY === 'true') {
    const headers = new Headers(options.headers);
    headers.set('x-local-internal', process.env.LOCAL_INTERNAL_SECRET!);
    headers.set('origin', new URL(process.env.FRONTEND_URL!).origin);
    const forwardedHeaders: Record<string, string> = {};
    headers.forEach((value, name) => { forwardedHeaders[name] = value; });
    options = { ...options, headers: forwardedHeaders };
  }
  return customFetch(
    { baseUrl: process.env.BACKEND_INTERNAL_URL! },
    cookieStore?.get('auth')?.value!,
    cookieStore?.get('showorg')?.value!
  )(url, options);
};
