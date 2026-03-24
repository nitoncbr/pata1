let redis = null;

if (process.env.UPSTASH_REDIS_URL && 
    process.env.UPSTASH_REDIS_URL !== 'fill_later') {
  const { Redis } = require('@upstash/redis');
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_URL,
    token: process.env.UPSTASH_REDIS_TOKEN,
  });
}

module.exports = { redis };

