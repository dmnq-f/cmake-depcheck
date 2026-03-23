import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VERSION } from '../src/index.js';
import { createProgram } from '../src/cli.js';

vi.mock('../src/checker/version-checker.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    checkForUpdates: vi.fn(actual.checkForUpdates as (...args: unknown[]) => unknown),
  };
});

import { checkForUpdates } from '../src/checker/version-checker.js';
import { UpdateCheckResult } from '../src/checker/types.js';

const mockedCheckForUpdates = vi.mocked(checkForUpdates);

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
  vi.resetAllMocks();
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

  describe('--scan-only', () => {
    it('outputs found dependencies', async () => {
      await runScan('--path', path.join(FIXTURES, 'basic-git'), '--scan-only');
      expect(logLines[0]).toMatch(/Found 2 dependencies in 1 file/);
    });

    it('reports no dependencies for empty project', async () => {
      await runScan('--path', path.join(FIXTURES, 'no-fetchcontent'), '--scan-only');
      expect(logLines[0]).toBe('No dependencies found.');
    });

    it('--ignore excludes dependencies by name', async () => {
      await runScan(
        '--path',
        path.join(FIXTURES, 'basic-git'),
        '--ignore',
        'googletest',
        '--scan-only',
      );
      expect(logLines[0]).toMatch(/Found 1 dependencies in 1 file/);
      const output = logLines.join('\n');
      expect(output).toMatch(/fmt/);
      expect(output).not.toMatch(/googletest/);
    });

    it('does not call checkForUpdates', async () => {
      await runScan('--path', path.join(FIXTURES, 'basic-git'), '--scan-only');
      expect(mockedCheckForUpdates).not.toHaveBeenCalled();
    });
  });

  describe('chain mode with --scan-only', () => {
    it('chain-basic: finds 3 deps across 3 files', async () => {
      await runScan('--path', path.join(FIXTURES, 'chain-basic', 'CMakeLists.txt'), '--scan-only');
      expect(logLines[0]).toMatch(/Found 3 dependencies in 3 file/);
    });

    it('chain-unresolvable: finds 2 deps + 2 warnings', async () => {
      await runScan(
        '--path',
        path.join(FIXTURES, 'chain-unresolvable', 'CMakeLists.txt'),
        '--scan-only',
      );
      expect(logLines[0]).toMatch(/Found 2 dependencies in 2 file/);
      expect(errorLines).toHaveLength(2);
    });

    it('chain-nested: finds 3 deps with correct relative resolution', async () => {
      await runScan('--path', path.join(FIXTURES, 'chain-nested', 'CMakeLists.txt'), '--scan-only');
      expect(logLines[0]).toMatch(/Found 3 dependencies/);
      const output = logLines.join('\n');
      expect(output).toMatch(/engine.*deps\.cmake/);
    });

    it('chain-variable-deps: resolves variables in dependency fields', async () => {
      await runScan(
        '--path',
        path.join(FIXTURES, 'chain-variable-deps', 'CMakeLists.txt'),
        '--scan-only',
      );
      expect(logLines[0]).toMatch(/Found 1 dependencies/);
      const output = logLines.join('\n');
      expect(output).toMatch(/v1\.17\.0/);
      expect(output).not.toMatch(/\$\{GTEST_VERSION\}/);
    });

    it('cmake-variables: resolves GIT_TAG variable in chain mode', async () => {
      await runScan(
        '--path',
        path.join(FIXTURES, 'cmake-variables', 'CMakeLists.txt'),
        '--scan-only',
      );
      const output = logLines.join('\n');
      expect(output).toMatch(/v1\.17\.0/);
      expect(output).not.toMatch(/\$\{GTEST_VERSION\}/);
    });
  });

  describe('update checking (default)', () => {
    it('shows update columns when checking for updates', async () => {
      mockedCheckForUpdates.mockImplementation(async (deps) => {
        return deps.map(
          (dep): UpdateCheckResult => ({
            dep,
            status: 'up-to-date',
          }),
        );
      });

      await runScan('--path', path.join(FIXTURES, 'basic-git'));
      const output = logLines.join('\n');
      expect(output).toMatch(/Name/);
      expect(output).toMatch(/Current/);
      expect(output).toMatch(/Latest/);
      expect(output).toMatch(/Status/);
      expect(output).toMatch(/up to date/);
    });

    it('shows update-available status with latest version', async () => {
      mockedCheckForUpdates.mockImplementation(async (deps) => {
        return deps.map(
          (dep): UpdateCheckResult => ({
            dep,
            status: 'update-available',
            latestVersion: 'v99.0.0',
            updateType: 'major',
          }),
        );
      });

      await runScan('--path', path.join(FIXTURES, 'basic-git'));
      const output = logLines.join('\n');
      expect(output).toMatch(/v99\.0\.0/);
      expect(output).toMatch(/major update/);
    });

    it('prints check-failed errors to stderr', async () => {
      mockedCheckForUpdates.mockImplementation(async (deps) => {
        return deps.map(
          (dep): UpdateCheckResult => ({
            dep,
            status: 'check-failed',
            error: 'network error',
          }),
        );
      });

      await runScan('--path', path.join(FIXTURES, 'basic-git'));
      expect(errorLines.some((l) => l.includes('network error'))).toBe(true);
    });
  });
});
