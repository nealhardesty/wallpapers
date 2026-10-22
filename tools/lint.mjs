#!/usr/bin/env node
// Syntax-check every script with `node --check` and parse every JSON file.
// Covers tracked and untracked files, skipping anything gitignored.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
    .toString().split('\0').filter(Boolean);
const failures = [];
let checked = 0;

for (const file of files) {
    if (/\.(m|c)?js$/.test(file)) {
        checked++;
        const run = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
        if (run.status !== 0) failures.push(`${file}\n${run.stderr.trim()}`);
    } else if (file.endsWith('.json')) {
        checked++;
        try { JSON.parse(readFileSync(file, 'utf8')); } catch (e) { failures.push(`${file}: ${e.message}`); }
    }
}

for (const failure of failures) console.log(failure + '\n');
console.log(failures.length ? `lint ✗ ${failures.length} of ${checked} files` : `lint ✓ ${checked} files`);
process.exitCode = failures.length ? 1 : 0;
