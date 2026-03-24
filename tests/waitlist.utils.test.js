const {
  normalizeEmailForDedup,
  shouldBlockReferralCredit,
  getClientIp,
  isDisposable,
  isMissingSignupIpColumn,
} = require('../routes/waitlist.utils');

describe('normalizeEmailForDedup', () => {
  test('lowercases and trims', () => {
    expect(normalizeEmailForDedup('  Test@Example.COM  ')).toBe('test@example.com');
  });

  test('strips Gmail +tags and dots', () => {
    expect(normalizeEmailForDedup('a.b.c+tag@gmail.com')).toBe('abc@gmail.com');
    expect(normalizeEmailForDedup('a.b.c+tag@googlemail.com')).toBe('abc@gmail.com');
  });

  test('does not strip dots on non-Gmail domains', () => {
    expect(normalizeEmailForDedup('a.b@company.com')).toBe('a.b@company.com');
  });

  test('handles malformed @ edge', () => {
    expect(normalizeEmailForDedup('@nodomain')).toBe('@nodomain');
  });
});

describe('shouldBlockReferralCredit', () => {
  test('blocks when IPs match', () => {
    expect(
      shouldBlockReferralCredit({ signup_ip: '203.0.113.1' }, '203.0.113.1'),
    ).toBe(true);
  });

  test('allows when referrer has no signup_ip', () => {
    expect(shouldBlockReferralCredit({ signup_ip: null }, '203.0.113.1')).toBe(false);
    expect(shouldBlockReferralCredit({}, '203.0.113.1')).toBe(false);
  });

  test('allows when client IP missing', () => {
    expect(shouldBlockReferralCredit({ signup_ip: '1.1.1.1' }, '')).toBe(false);
    expect(shouldBlockReferralCredit({ signup_ip: '1.1.1.1' }, null)).toBe(false);
  });

  test('allows different IPs', () => {
    expect(
      shouldBlockReferralCredit({ signup_ip: '10.0.0.1' }, '10.0.0.2'),
    ).toBe(false);
  });
});

describe('getClientIp', () => {
  test('uses req.ip', () => {
    expect(getClientIp({ ip: '192.168.1.1' })).toBe('192.168.1.1');
  });

  test('strips IPv4-mapped IPv6 prefix', () => {
    expect(getClientIp({ ip: '::ffff:127.0.0.1' })).toBe('127.0.0.1');
  });

  test('falls back to connection remoteAddress', () => {
    expect(
      getClientIp({ ip: undefined, connection: { remoteAddress: '10.0.0.5' } }),
    ).toBe('10.0.0.5');
  });
});

describe('isDisposable', () => {
  test('detects known disposable domain', () => {
    expect(isDisposable('x@mailinator.com')).toBe(true);
  });

  test('allows normal domain', () => {
    expect(isDisposable('x@gmail.com')).toBe(false);
  });
});

describe('isMissingSignupIpColumn', () => {
  test('detects signup_ip in message', () => {
    expect(isMissingSignupIpColumn({ message: 'column signup_ip does not exist' })).toBe(
      true,
    );
  });

  test('false when unrelated error', () => {
    expect(isMissingSignupIpColumn({ message: 'connection refused' })).toBe(false);
    expect(isMissingSignupIpColumn(null)).toBe(false);
  });
});
