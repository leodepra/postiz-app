// Match the original path, not a decoded/lowercased approximation of it.
// Express also accepts case and trailing-slash aliases; the local API does not.
const id = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const postId = `(?:${id}|c[a-z0-9]{24})`;
const exact: Record<string, Set<string>> = {
  GET: new Set([
    '/auth/can-register', '/user/self', '/user/personal', '/user/organizations',
    '/integrations', '/integrations/list', '/integrations/social/youtube',
    '/media', '/media/local-file', '/posts', '/posts/tags', '/posts/find-slot',
    '/posts/list', '/posts/old', '/notifications', '/notifications/list',
    '/sets', '/signatures', '/signatures/default',
  ]),
  POST: new Set([
    '/auth/login', '/user/personal', '/user/logout',
    '/integrations/social-connect/youtube', '/integrations/function',
    '/integrations/disable', '/integrations/enable',
    '/media/upload-server', '/media/upload-simple', '/media/information',
    '/posts', '/posts/valid', '/posts/tags', '/posts/should-shortlink',
    '/sets', '/signatures',
  ]),
  PUT: new Set(['/sets']),
  DELETE: new Set(['/integrations']),
};
const patterns: Record<string, RegExp[]> = {
  GET: [
    new RegExp(`^/integrations/${id}$`),
    new RegExp(`^/media/${id}/status$`),
    new RegExp(`^/posts/${postId}(?:/missing|/release-url)?$`),
    new RegExp(`^/posts/(?:group|find-slot)/${id}$`),
  ],
  POST: [
    new RegExp(`^/integrations/provider/${id}/connect$`),
    new RegExp(`^/integrations/${id}/(?:settings|nickname|time)$`),
  ],
  PUT: [new RegExp(`^/posts/${postId}/date$`), new RegExp(`^/(?:posts/tags|signatures)/${id}$`)],
  DELETE: [new RegExp(`^/(?:media|posts|posts/tags|sets|signatures)/${id}$`)],
};

export function isLocalRouteAllowed(method: string, path: string): boolean {
  return !!exact[method]?.has(path) || !!patterns[method]?.some(pattern => pattern.test(path));
}

export function isAuthenticationAttempt(method: string, url: string): boolean {
  return method === 'POST' && /^\/auth\/(?:login|forgot|register)\/?(?:\?|$)/i.test(url);
}
