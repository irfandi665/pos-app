'use strict';

const fs = require('fs');
const path = require('path');

const STATUS_LABELS = {
  passed: 'PASS',
  failed: 'FAIL',
  pending: 'SKIP',
  skipped: 'SKIP',
  todo: 'TODO'
};

function escapeCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return '-';
  return `${(ms / 1000).toFixed(2)}s`;
}

function codeBlock(value) {
  return ['```text', String(value || '').trim(), '```'].join('\n');
}

class MarkdownReporter {
  constructor(globalConfig) {
    this.rootDir = globalConfig.rootDir;
    this.outputDir = path.join(this.rootDir, 'test-results');
    this.startedAt = new Date();
  }

  onRunStart() {
    this.startedAt = new Date();
  }

  onRunComplete(_contexts, results) {
    fs.mkdirSync(this.outputDir, { recursive: true });

    const fileName = this.resolveFileName(results);
    const content = this.buildMarkdown(results);

    fs.writeFileSync(path.join(this.outputDir, fileName), content, 'utf8');
    fs.writeFileSync(path.join(this.outputDir, 'latest.md'), content, 'utf8');
  }

  resolveFileName(results) {
    const files = results.testResults.map((suite) => suite.testFilePath || '');
    const allUnit = files.length > 0 && files.every((file) => file.includes(`${path.sep}tests${path.sep}unit${path.sep}`));
    const allIntegration = files.length > 0 && files.every((file) => file.includes(`${path.sep}tests${path.sep}integration${path.sep}`));

    if (allUnit) return 'phase-1-unit.md';
    if (allIntegration) return 'phase-2-integration.md';
    return 'latest-run.md';
  }

  buildMarkdown(results) {
    const finishedAt = new Date();
    const total = results.numTotalTests || 0;
    const passed = results.numPassedTests || 0;
    const failed = results.numFailedTests || 0;
    const skipped = results.numPendingTests || 0;
    const duration = finishedAt.getTime() - this.startedAt.getTime();
    const status = failed > 0 ? 'FAILED' : 'PASSED';

    const lines = [
      '# Automated Test Report',
      '',
      `- **Status:** ${status}`,
      `- **Generated:** ${finishedAt.toISOString()}`,
      `- **Duration:** ${formatDuration(duration)}`,
      `- **Suites:** ${results.numTotalTestSuites || 0}`,
      `- **Node:** ${process.version}`,
      `- **Platform:** ${process.platform}/${process.arch}`,
      '',
      '## Summary',
      '',
      '| Metric | Value |',
      '|---|---:|',
      `| Total tests | ${total} |`,
      `| Passed | ${passed} |`,
      `| Failed | ${failed} |`,
      `| Skipped | ${skipped} |`,
      ''
    ];

    if (results.coverageMap && typeof results.coverageMap.getCoverageSummary === 'function') {
      const coverage = results.coverageMap.getCoverageSummary();
      lines.push('## Coverage', '', '| Metric | Covered | Total | % |', '|---|---:|---:|---:|');
      for (const metricName of ['statements', 'branches', 'functions', 'lines']) {
        const metric = coverage[metricName];
        lines.push(`| ${metricName} | ${metric.covered} | ${metric.total} | ${metric.pct}% |`);
      }
      lines.push('');
    }

    lines.push(
      '## Test Cases',
      '',
      '| Suite | Test | Status | Duration |',
      '|---|---|---|---:|'
    );

    const failures = [];

    for (const suite of results.testResults) {
      const suiteName = path.relative(this.rootDir, suite.testFilePath || suite.name || '').replace(/\\/g, '/');
      const assertions = suite.assertionResults || suite.testResults || [];

      if (!assertions || assertions.length === 0) {
        const message = (suite.failureMessage || 'Suite failed before tests could run').trim();
        lines.push(`| ${escapeCell(suiteName)} | _suite error_ | FAIL | - |`);
        failures.push({ suite: suiteName, test: '(suite error)', message });
        continue;
      }

      for (const test of assertions) {
        const statusLabel = STATUS_LABELS[test.status] || test.status.toUpperCase();
        const testName = [...(test.ancestorTitles || []), test.title].join(' > ');
        const testDuration = Array.isArray(test.duration) ? test.duration[0] : test.duration;
        lines.push(
          `| ${escapeCell(suiteName)} | ${escapeCell(testName)} | ${statusLabel} | ${formatDuration(testDuration)} |`
        );

        if (test.status === 'failed') {
          const message = (test.failureMessages || []).join('\n\n') || 'Unknown failure';
          failures.push({ suite: suiteName, test: testName, message });
        }
      }
    }

    if (failures.length > 0) {
      lines.push('', '## Failures', '');
      for (const failure of failures) {
        lines.push(`### ${failure.suite} :: ${failure.test}`, '', codeBlock(failure.message), '');
      }
    }

    return `${lines.join('\n').trim()}\n`;
  }
}

module.exports = MarkdownReporter;
