'use strict';

const fs = require('fs');
const path = require('path');

const STATUS_LABELS = {
  passed: 'PASSED',
  failed: 'FAILED',
  timedout: 'TIMED OUT',
  skipped: 'SKIPPED',
  interrupted: 'INTERRUPTED'
};

function escapeCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function stripAnsi(value) {
  // eslint-disable-next-line no-control-regex
  return String(value || '').replace(/\u001b\[[0-9;]*m/g, '');
}

class MarkdownReporter {
  constructor(options = {}) {
    this.outputFile = options.outputFile || path.join('test-results', 'phase-3-e2e.md');
    this.rows = [];
    this.failures = [];
    this.startedAt = null;
    this.totalTests = 0;
  }

  onBegin(config, suite) {
    this.startedAt = new Date();
    this.totalTests = suite.allTests().length;
    const projectUse = config.projects && config.projects[0] && config.projects[0].use;
    this.baseUrl = (config.use && config.use.baseURL)
      || (projectUse && projectUse.baseURL)
      || 'n/a';
  }

  onTestEnd(test, result) {
    const titleParts = test.titlePath().filter(Boolean);
    const title = titleParts[titleParts.length - 1] || test.title;
    const describeParts = titleParts
      .slice(0, -1)
      .filter((part) => part !== test.title && !part.endsWith('.spec.js'));

    const row = {
      suite: describeParts.join(' › ') || path.basename(test.location.file),
      title,
      status: STATUS_LABELS[result.status] || String(result.status).toUpperCase(),
      duration: result.duration
    };
    this.rows.push(row);

    if (result.status === 'failed' || result.status === 'timedout') {
      const errors = result.errors && result.errors.length
        ? result.errors
        : (result.error ? [result.error] : []);
      this.failures.push({
        title: `${row.suite} › ${row.title}`,
        errors: errors.map((error) => stripAnsi(error.message || error.value || 'Unknown error'))
      });
    }
  }

  onEnd(result) {
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - this.startedAt.getTime();
    const passed = this.rows.filter((row) => row.status === 'PASSED').length;
    const failed = this.rows.filter((row) => row.status === 'FAILED' || row.status === 'TIMED OUT').length;
    const skipped = this.rows.filter((row) => row.status === 'SKIPPED').length;

    const lines = [
      '# Automated Test Report — Phase 3 E2E',
      '',
      `- **Status:** ${result.status === 'passed' ? 'PASSED' : 'FAILED'}`,
      `- **Generated:** ${finishedAt.toISOString()}`,
      `- **Duration:** ${(durationMs / 1000).toFixed(2)}s`,
      `- **Base URL:** ${this.baseUrl}`,
      `- **Browser:** Chromium (Playwright)`,
      '',
      '## Summary',
      '',
      '| Metric | Value |',
      '|---|---:|',
      `| Total tests | ${this.rows.length} |`,
      `| Passed | ${passed} |`,
      `| Failed | ${failed} |`,
      `| Skipped | ${skipped} |`,
      '',
      '## Test Cases',
      '',
      '| Suite | Test | Status | Duration |',
      '|---|---|---|---:|'
    ];

    for (const row of this.rows) {
      lines.push(
        `| ${escapeCell(row.suite)} | ${escapeCell(row.title)} | ${row.status} | ${(row.duration / 1000).toFixed(2)}s |`
      );
    }

    if (this.failures.length > 0) {
      lines.push('', '## Failures', '');
      for (const failure of this.failures) {
        lines.push(`### ${failure.title}`, '', '```text', ...failure.errors, '```', '');
      }
    }

    lines.push(
      '',
      '## How to Reproduce',
      '',
      '```bash',
      'npm run test:e2e',
      '```',
      '',
      'The suite starts a disposable seeded SQLite database on port 3100 and',
      'uses the production client build. HTML artifacts are written to',
      '`test-results/playwright-report/`.',
      ''
    );

    fs.mkdirSync(path.dirname(this.outputFile), { recursive: true });
    fs.writeFileSync(this.outputFile, lines.join('\n'), 'utf8');
  }
}

module.exports = MarkdownReporter;
