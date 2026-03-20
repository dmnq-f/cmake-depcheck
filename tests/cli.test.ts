import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VERSION } from '../src/index.js';
import { createProgram } from '../src/cli.js';

const FIXTURES = path.join(__dirname, 'fixtures');

let logLines: string[];
let errorLines: string[];
let origLog: typeof console.log;
let origError: typeof console.error;

beforeEach(() => {
  logLines = [];
  errorLines = [];
  origLog = console.log;
  origError = console.error;
  console.log = (msg: string) => logLines.push(msg);
  console.error = (msg: string) => errorLines.push(msg);
});

afterEach(() => {
  console.log = origLog;
  console.error = origError;
});

async function runScan(...args: string[]) {
  const program = createProgram();
  program.exitOverride();
  await program.parseAsync(['node', 'cmake-depcheck', 'scan', ...args]);
}

describe('cli', () => {
  it('exports a version string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('scan command outputs found dependencies', async () => {
    await runScan('--path', path.join(FIXTURES, 'basic-git'));
    expect(logLines[0]).toMatch(/Found 2 dependencies in 1 file/);
  });

  it('scan command reports no dependencies for empty project', async () => {
    await runScan('--path', path.join(FIXTURES, 'no-fetchcontent'));
    expect(logLines[0]).toBe('No dependencies found.');
  });

  it('--ignore excludes dependencies by name', async () => {
    await runScan('--path', path.join(FIXTURES, 'basic-git'), '--ignore', 'googletest');
    expect(logLines[0]).toMatch(/Found 1 dependencies in 1 file/);
    const output = logLines.join('\n');
    expect(output).toMatch(/fmt/);
    expect(output).not.toMatch(/googletest/);
  });

  it('chain-basic: finds 3 deps across 3 files', async () => {
    await runScan('--path', path.join(FIXTURES, 'chain-basic', 'CMakeLists.txt'));
    expect(logLines[0]).toMatch(/Found 3 dependencies in 3 file/);
  });

  it('chain-unresolvable: finds 2 deps + 2 warnings', async () => {
    await runScan('--path', path.join(FIXTURES, 'chain-unresolvable', 'CMakeLists.txt'));
    expect(logLines[0]).toMatch(/Found 2 dependencies in 2 file/);
    expect(errorLines).toHaveLength(2);
  });

  it('chain-nested: finds 3 deps with correct relative resolution', async () => {
    await runScan('--path', path.join(FIXTURES, 'chain-nested', 'CMakeLists.txt'));
    expect(logLines[0]).toMatch(/Found 3 dependencies/);
    const output = logLines.join('\n');
    expect(output).toMatch(/engine.*deps\.cmake/);
  });

  it('chain-variable-deps: resolves variables in dependency fields', async () => {
    await runScan('--path', path.join(FIXTURES, 'chain-variable-deps', 'CMakeLists.txt'));
    expect(logLines[0]).toMatch(/Found 1 dependencies/);
    const output = logLines.join('\n');
    expect(output).toMatch(/v1\.17\.0/);
    expect(output).not.toMatch(/\$\{GTEST_VERSION\}/);
  });

  it('cmake-variables: resolves GIT_TAG variable in chain mode', async () => {
    await runScan('--path', path.join(FIXTURES, 'cmake-variables', 'CMakeLists.txt'));
    const output = logLines.join('\n');
    expect(output).toMatch(/v1\.17\.0/);
    expect(output).not.toMatch(/\$\{GTEST_VERSION\}/);
  });
});
