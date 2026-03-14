#!/usr/bin/env node

import { runCli } from './run.js';

const exitCode = await runCli(process.argv.slice(2));

if (exitCode !== 0) {
  process.exitCode = exitCode;
}
