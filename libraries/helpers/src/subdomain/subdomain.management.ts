import { parse } from 'tldts';

export function getCookieUrlFromDomain(domain: string) {
  if (process.env.POSTIZ_LOCAL_ONLY === 'true') return undefined;
  const url = parse(domain);
  return url.domain! ? '.' + url.domain! : url.hostname!;
}
