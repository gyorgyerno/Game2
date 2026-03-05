#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const parsed = {};
  for (let index = 2; index < argv.length; index += 1) {
    const part = argv[index];
    if (!part.startsWith('--')) continue;
    const key = part.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = 'true';
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function toNumber(value, fallback) {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[index] ?? 0;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help === 'true') {
    console.log(`\nUsage:\n  node scripts/loadtest-simulated-metrics.js [options]\n\nOptions:\n  --baseUrl <url>        API base URL (default: http://localhost:4000)\n  --username <name>      Admin username (or ADMIN_USERNAME env)\n  --password <pass>      Admin password (or ADMIN_PASSWORD env)\n  --durationSec <sec>    Total duration in seconds (default: 300)\n  --intervalMs <ms>      Poll interval in ms (default: 2000)\n  --outputPrefix <name>  Output file prefix (default: loadtest-simulated)\n  --help                 Show this help\n`);
    return;
  }

  const baseUrl = (args.baseUrl || process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
  const username = args.username || process.env.ADMIN_USERNAME;
  const password = args.password || process.env.ADMIN_PASSWORD;
  const durationSec = Math.max(10, toNumber(args.durationSec, 300));
  const intervalMs = Math.max(500, toNumber(args.intervalMs, 2000));
  const outputPrefix = args.outputPrefix || 'loadtest-simulated';

  if (!username || !password) {
    console.error('Missing admin credentials. Use --username/--password or ADMIN_USERNAME/ADMIN_PASSWORD env vars.');
    process.exit(1);
  }

  const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!loginRes.ok) {
    const errText = await loginRes.text();
    console.error(`Admin login failed (${loginRes.status}): ${errText}`);
    process.exit(1);
  }

  const loginBody = await loginRes.json();
  const token = loginBody.token;
  if (!token) {
    console.error('Admin login succeeded but no token returned.');
    process.exit(1);
  }

  const startedAt = Date.now();
  const endsAt = startedAt + durationSec * 1000;
  const samples = [];
  const errors = [];

  console.log(`Running simulated metrics load test for ${durationSec}s @ ${intervalMs}ms interval...`);

  while (Date.now() < endsAt) {
    const pollStartedAt = Date.now();
    try {
      const response = await fetch(`${baseUrl}/api/admin/simulated-players/health`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const err = await response.text();
        errors.push({ ts: new Date().toISOString(), status: response.status, error: err });
      } else {
        const body = await response.json();
        const latencyMs = Date.now() - pollStartedAt;

        samples.push({
          ts: new Date().toISOString(),
          latencyMs,
          runtimeMetrics: body.runtimeMetrics || null,
          generators: body.generators || null,
        });
      }
    } catch (error) {
      errors.push({
        ts: new Date().toISOString(),
        status: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await sleep(intervalMs);
  }

  const latencyValues = samples.map((sample) => sample.latencyMs);
  const eventLoopLagValues = samples
    .map((sample) => sample.runtimeMetrics?.eventLoopLagMs)
    .filter((value) => typeof value === 'number');
  const eventLoopLagP95Values = samples
    .map((sample) => sample.runtimeMetrics?.eventLoopLagP95Ms)
    .filter((value) => typeof value === 'number');
  const activityP95Values = samples
    .map((sample) => sample.generators?.activityFeed?.p95DecisionCpuMs)
    .filter((value) => typeof value === 'number');
  const chatP95Values = samples
    .map((sample) => sample.generators?.botChat?.p95DecisionCpuMs)
    .filter((value) => typeof value === 'number');

  const summary = {
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    durationSec,
    intervalMs,
    sampleCount: samples.length,
    errorCount: errors.length,
    latencyAvgMs: Number(average(latencyValues).toFixed(2)),
    latencyP95Ms: Number(percentile(latencyValues, 0.95).toFixed(2)),
    latencyMaxMs: Number((Math.max(0, ...latencyValues)).toFixed(2)),
    eventLoopLagAvgMs: Number(average(eventLoopLagValues).toFixed(2)),
    eventLoopLagP95Ms: Number(percentile(eventLoopLagP95Values, 0.95).toFixed(2)),
    eventLoopLagMaxMs: Number((Math.max(0, ...eventLoopLagValues)).toFixed(2)),
    activityDecisionP95Ms: Number(percentile(activityP95Values, 0.95).toFixed(2)),
    botChatDecisionP95Ms: Number(percentile(chatP95Values, 0.95).toFixed(2)),
  };

  const output = { summary, samples, errors };
  const logsDir = path.join(__dirname, '..', 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(logsDir, `${outputPrefix}-${timestamp}.json`);
  const mdPath = path.join(logsDir, `${outputPrefix}-${timestamp}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2), 'utf8');

  const markdown = `# Simulated Runtime Load Test\n\n- startedAt: ${summary.startedAt}\n- finishedAt: ${summary.finishedAt}\n- durationSec: ${summary.durationSec}\n- intervalMs: ${summary.intervalMs}\n- sampleCount: ${summary.sampleCount}\n- errorCount: ${summary.errorCount}\n\n## Latency\n- avgMs: ${summary.latencyAvgMs}\n- p95Ms: ${summary.latencyP95Ms}\n- maxMs: ${summary.latencyMaxMs}\n\n## Runtime Metrics\n- eventLoopLagAvgMs: ${summary.eventLoopLagAvgMs}\n- eventLoopLagP95Ms: ${summary.eventLoopLagP95Ms}\n- eventLoopLagMaxMs: ${summary.eventLoopLagMaxMs}\n\n## Generator Decision CPU\n- activityDecisionP95Ms: ${summary.activityDecisionP95Ms}\n- botChatDecisionP95Ms: ${summary.botChatDecisionP95Ms}\n\n## Files\n- JSON: ${jsonPath}\n`;

  fs.writeFileSync(mdPath, markdown, 'utf8');

  console.log('\nLoad test complete.');
  console.log(`JSON report: ${jsonPath}`);
  console.log(`MD report:   ${mdPath}`);
  console.log('Summary:', summary);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
