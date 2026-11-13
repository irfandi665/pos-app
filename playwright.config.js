'use strict';

const { defineConfig } = require('@playwright/test');

const PORT = process.env.E2E_PORT || '3100';
const BASE_URL = process.env.E2E_BASE_URL || `http://127.0.0.1:${PORT}`;

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  outputDir: 'test-results/playwright-artifacts',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'test-results/playwright-report', open: 'never' }],
    ['./tests/reporters/playwright-markdown-reporter.js']
  ],
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  webServer: process.env.E2E_SKIP_WEBSERVER
    ? undefined
    : {
        command: 'node tests/e2e/start-server.js',
        url: `${BASE_URL}/api/health`,
        reuseExistingServer: false,
        timeout: 120_000
      }
});
