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

function toPositiveInt(value, fallback) {
  if (value == null) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return fallback;
  return n;
}

function main() {
  const args = parseArgs(process.argv);
  const days = toPositiveInt(args.days, 14);
  const dryRun =
    args.dryRun === 'true' ||
    args['dry-run'] === 'true' ||
    args.dryrun === 'true';
  const logsDir = path.join(__dirname, '..', 'logs');

  const prefixes = [
    'loadtest-simulated-',
    'loadtest-simulated-nightly-',
    'loadtest-simulated-nightly-smoke-',
  ];

  if (!fs.existsSync(logsDir)) {
    console.log(`Logs directory not found: ${logsDir}`);
    process.exit(0);
  }

  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const entries = fs.readdirSync(logsDir, { withFileTypes: true });

  const candidates = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => prefixes.some((prefix) => name.startsWith(prefix)))
    .filter((name) => name.endsWith('.json') || name.endsWith('.md'))
    .map((name) => {
      const fullPath = path.join(logsDir, name);
      const stat = fs.statSync(fullPath);
      return { name, fullPath, mtimeMs: stat.mtimeMs, size: stat.size };
    })
    .filter((file) => file.mtimeMs < cutoffMs);

  let deletedCount = 0;
  let deletedBytes = 0;

  for (const file of candidates) {
    if (!dryRun) {
      fs.unlinkSync(file.fullPath);
    }
    deletedCount += 1;
    deletedBytes += file.size;
    console.log(`${dryRun ? '[dry-run] ' : ''}${file.name}`);
  }

  console.log(
    JSON.stringify(
      {
        logsDir,
        days,
        dryRun,
        deletedCount,
        deletedBytes,
      },
      null,
      2,
    ),
  );
}

main();
