require('./register.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateYoutubeUploadDestination } = require('../../libraries/helpers/src/security/youtube-upload.ts');

test('resumed uploads only attach credentials to the Google upload endpoint', () => {
  assert.doesNotThrow(() => validateYoutubeUploadDestination('https://www.googleapis.com/upload/youtube/v3/videos?upload_id=synthetic'));
  for (const url of [
    'http://www.googleapis.com/upload/youtube/v3/videos',
    'https://www.googleapis.com.evil.test/upload/youtube/v3/videos',
    'https://user:pass@www.googleapis.com/upload/youtube/v3/videos',
    'https://www.googleapis.com:444/upload/youtube/v3/videos',
    'https://127.0.0.1/upload/youtube/v3/videos',
    'https://www.googleapis.com/other',
    'https://www.googleapis.com/upload/youtube/../../other',
  ]) assert.throws(() => validateYoutubeUploadDestination(url));
});
