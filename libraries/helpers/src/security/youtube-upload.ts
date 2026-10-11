/** Validate persisted resumable destinations before attaching a bearer token. */
export function validateYoutubeUploadDestination(input: string): void {
  const target = new URL(input);
  if (target.protocol !== 'https:' || target.hostname !== 'www.googleapis.com' ||
      target.port || target.username || target.password || target.hash ||
      !target.pathname.startsWith('/upload/youtube/')) {
    throw new Error('Unexpected YouTube upload destination');
  }
}
