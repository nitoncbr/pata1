/**
 * HTTP tests for waitlist routes with mocked Supabase.
 * Set env before requiring the route module.
 */
process.env.SUPABASE_URL = 'http://test.local';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

const mockFrom = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: mockFrom })),
}));

const request = require('supertest');
const express = require('express');
const waitlistRoutes = require('../routes/waitlist');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.set('trust proxy', 1);
  app.use('/api/waitlist', waitlistRoutes);
  return app;
}

describe('GET /api/waitlist/position', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  test('400 when ref query missing', async () => {
    const res = await request(makeApp()).get('/api/waitlist/position');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/ref/i);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('200 returns position when code matches', async () => {
    const chain = {};
    chain.select = jest.fn(() => chain);
    chain.eq = jest.fn(() => chain);
    chain.single = jest.fn().mockResolvedValue({
      data: { position: 42, referral_code: 'ABC123' },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const res = await request(makeApp()).get('/api/waitlist/position?ref=abc123');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ position: 42, referral_code: 'ABC123' });
    expect(mockFrom).toHaveBeenCalledWith('waitlist');
  });

  test('404 when not found', async () => {
    const chain = {};
    chain.select = jest.fn(() => chain);
    chain.eq = jest.fn(() => chain);
    chain.single = jest.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST116' },
    });
    mockFrom.mockReturnValue(chain);

    const res = await request(makeApp()).get('/api/waitlist/position?ref=ZZZZZZ');

    expect(res.status).toBe(404);
  });
});

describe('GET /api/waitlist/count', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  test('returns count from Supabase', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn(() => Promise.resolve({ count: 123, error: null })),
    });

    const res = await request(makeApp()).get('/api/waitlist/count');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 123 });
  });
});

describe('POST /api/waitlist', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  test('400 when email invalid', async () => {
    const res = await request(makeApp())
      .post('/api/waitlist')
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/valid email/i);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('400 when disposable email', async () => {
    const res = await request(makeApp())
      .post('/api/waitlist')
      .send({ email: 'x@mailinator.com' });

    expect(res.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('200 with verify_email pending signup', async () => {
    mockFrom.mockImplementation((table) => {
      if (table === 'waitlist') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: null, error: { code: 'PGRST116' } }),
            }),
          }),
        };
      }
      if (table === 'waitlist_pending') {
        return {
          upsert: () =>
            Promise.resolve({ data: {}, error: null }),
        };
      }
      return { select: () => ({}) };
    });

    const res = await request(makeApp())
      .post('/api/waitlist')
      .send({ email: 'real@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.verify_email).toBe(true);
    expect(res.body.message).toMatch(/check your email/i);
  });
});
