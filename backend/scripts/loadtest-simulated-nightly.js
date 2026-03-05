#!/usr/bin/env node

const { spawn } = require('child_process');
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

function resolveArg(args, key, fallback) {
  return args[key] ?? fallback;
}

function main() {
  const args = parseArgs(process.argv);

  const username = resolveArg(args, 'username', process.env.ADMIN_USERNAME);
  const password = resolveArg(args, 'password', process.env.ADMIN_PASSWORD);
  const baseUrl = resolveArg(args, 'baseUrl', process.env.BASE_URL || 'http://localhost:4000');
  const durationSec = resolveArg(args, 'durationSec', '600');
  const intervalMs = resolveArg(args, 'intervalMs', '2000');
  const outputPrefix = resolveArg(args, 'outputPrefix', 'loadtest-simulated-nightly');

  if (!username || !password) {
    console.error('Missing admin credentials. Set ADMIN_USERNAME and ADMIN_PASSWORD env vars or pass --username/--password.');
    process.exit(1);
  }

  const scriptPath = path.join(__dirname, 'loadtest-simulated-metrics.js');
  const childArgs = [
    scriptPath,
    '--baseUrl', String(baseUrl),
    '--username', String(username),
    '--password', String(password),
    '--durationSec', String(durationSec),
    '--intervalMs', String(intervalMs),
    '--outputPrefix', String(outputPrefix),
  ];

  const child = spawn(process.execPath, childArgs, { stdio: 'inherit' });

  child.on('exit', (code) => {
    process.exit(code ?? 1);
  });

  child.on('error', (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

main();
