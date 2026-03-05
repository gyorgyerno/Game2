#!/usr/bin/env node

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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const baseUrl = (args.baseUrl || process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
  const username = args.username || process.env.ADMIN_USERNAME;
  const password = args.password || process.env.ADMIN_PASSWORD;
  const allowWarnings = args.allowWarnings === 'true' || args.allowWarnings === '1';
  const allowCritical = args.allowCritical === 'true' || args.allowCritical === '1';

  assert(username && password, 'Missing admin credentials (use --username/--password or ADMIN_USERNAME/ADMIN_PASSWORD).');

  const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const loginText = await loginRes.text();
  assert(loginRes.ok, `Login failed (${loginRes.status}): ${loginText}`);
  const token = JSON.parse(loginText).token;
  assert(typeof token === 'string' && token.length > 20, 'Invalid admin token response.');

  const headers = { Authorization: `Bearer ${token}` };
  const healthRes = await fetch(`${baseUrl}/api/admin/simulated-players/health`, { headers });
  const healthText = await healthRes.text();
  assert(healthRes.ok, `Health endpoint failed (${healthRes.status}): ${healthText}`);
  const health = JSON.parse(healthText);

  const alertsRes = await fetch(`${baseUrl}/api/admin/simulated-players/alerts`, { headers });
  const alertsText = await alertsRes.text();
  assert(alertsRes.ok, `Alerts endpoint failed (${alertsRes.status}): ${alertsText}`);
  const alertsPayload = JSON.parse(alertsText);

  assert(health.runtimeMetrics && typeof health.runtimeMetrics.eventLoopLagMs === 'number', 'Missing runtime metrics in health payload.');
  assert(health.generators?.activityFeed && health.generators?.botChat, 'Missing generator status in health payload.');
  assert(Array.isArray(alertsPayload.alerts), 'Alerts payload is invalid.');

  const warnCount = alertsPayload.summary?.warnCount ?? 0;
  const criticalCount = alertsPayload.summary?.criticalCount ?? 0;

  if (!allowWarnings && warnCount > 0) {
    throw new Error(`Selfcheck failed: warnCount=${warnCount} (use --allowWarnings true to ignore).`);
  }
  if (!allowCritical && criticalCount > 0) {
    throw new Error(`Selfcheck failed: criticalCount=${criticalCount} (use --allowCritical true to ignore).`);
  }

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    warnCount,
    criticalCount,
    eventLoopLagMs: health.runtimeMetrics.eventLoopLagMs,
    eventLoopLagP95Ms: health.runtimeMetrics.eventLoopLagP95Ms,
    activityDecisionP95Ms: health.generators.activityFeed.p95DecisionCpuMs,
    botChatDecisionP95Ms: health.generators.botChat.p95DecisionCpuMs,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
