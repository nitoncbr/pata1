/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  clearMocks: true,
  collectCoverageFrom: [
    'routes/waitlist.utils.js',
    'routes/waitlist.js',
    'config/site.js',
  ],
  coveragePathIgnorePatterns: ['/node_modules/'],
};
