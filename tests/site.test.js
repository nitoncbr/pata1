const { getPublicSiteUrl } = require('../config/site');

describe('getPublicSiteUrl', () => {
  const original = process.env.PUBLIC_SITE_URL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.PUBLIC_SITE_URL;
    } else {
      process.env.PUBLIC_SITE_URL = original;
    }
  });

  test('trims trailing slashes', () => {
    process.env.PUBLIC_SITE_URL = 'https://example.com/';
    expect(getPublicSiteUrl()).toBe('https://example.com');
  });

  test('defaults when unset', () => {
    delete process.env.PUBLIC_SITE_URL;
    expect(getPublicSiteUrl()).toBe('https://pataqr.com');
  });
});
