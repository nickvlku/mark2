#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tsx = join(__dirname, '..', 'node_modules', '.bin', 'tsx');
const cli = join(__dirname, 'cli.ts');

spawn(tsx, [cli, ...process.argv.slice(2)], { stdio: 'inherit' })
  .on('exit', (code) => process.exit(code ?? 0));
