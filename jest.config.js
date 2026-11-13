'use strict';

module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/unit', '<rootDir>/tests/integration'],
  testMatch: ['**/*.test.js'],
  clearMocks: true,
  restoreMocks: true,
  testTimeout: 15000,
  collectCoverageFrom: [
    'server/services/**/*.js',
    'server/auth.js'
  ],
  coverageDirectory: '<rootDir>/test-results/coverage',
  coverageReporters: ['text-summary', 'lcov'],
  reporters: [
    'default',
    '<rootDir>/tests/reporters/markdown-reporter.js'
  ]
};
