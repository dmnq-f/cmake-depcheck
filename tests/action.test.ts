import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ScanResult, ScanOptions } from '../src/scan.js';
import type { UpdateCheckResult } from '../src/checker/types.js';
import type { FetchContentDependency } from '../src/parser/types.js';

// Mock @actions/core
const mockWarning = vi.fn();
const mockNotice = vi.fn();
const mockSetOutput = vi.fn();
const mockSetFailed = vi.fn();
const mockGetInput = vi.fn();
const mockSummaryAddHeading = vi.fn();
const mockSummaryAddTable = vi.fn();
const mockSummaryWrite = vi.fn();

function makeSummaryChain() {
  const chain = {
    addHeading(...args: unknown[]) {
      mockSummaryAddHeading(...args);
      return chain;
    },
    addTable(...args: unknown[]) {
      mockSummaryAddTable(...args);
      return chain;
    },
    write() {
      mockSummaryWrite();
      return Promise.resolve(chain);
    },
  };
  return chain;
}

vi.mock('@actions/core', () => ({
  warning: (...args: unknown[]) => mockWarning(...args),
  notice: (...args: unknown[]) => mockNotice(...args),
  setOutput: (...args: unknown[]) => mockSetOutput(...args),
  setFailed: (...args: unknown[]) => mockSetFailed(...args),
  getInput: (...args: unknown[]) => mockGetInput(...args),
  summary: makeSummaryChain(),
}));

// Mock scan
const mockScan = vi.fn();
vi.mock('../src/scan.js', () => ({
  scan: (...args: unknown[]) => mockScan(...args),
}));

function makeDep(overrides: Partial<FetchContentDependency> = {}): FetchContentDependency {
  return {
    name: 'testlib',
    sourceType: 'git',
    gitRepository: 'https://github.com/test/testlib.git',
    gitTag: 'v1.0.0',
    location: {
      file: `${process.cwd()}/CMakeLists.txt`,
      startLine: 10,
      endLine: 14,
    },
    ...overrides,
  };
}

function makeResult(
  updateResults?: UpdateCheckResult[],
  deps?: FetchContentDependency[],
): ScanResult {
  return {
    deps: deps ?? updateResults?.map((r) => r.dep) ?? [],
    basePath: process.cwd(),
    scanMode: 'chain',
    filesScanned: [`${process.cwd()}/CMakeLists.txt`],
    warnings: [],
    ignoredCount: 0,
    updateResults,
  };
}

// Helper to run the action module
async function runAction(): Promise<void> {
  // Re-import to trigger run() with fresh mocks
  vi.resetModules();
  // Re-apply the mocks after resetModules
  vi.doMock('@actions/core', () => ({
    warning: (...args: unknown[]) => mockWarning(...args),
    notice: (...args: unknown[]) => mockNotice(...args),
    setOutput: (...args: unknown[]) => mockSetOutput(...args),
    setFailed: (...args: unknown[]) => mockSetFailed(...args),
    getInput: (...args: unknown[]) => mockGetInput(...args),
    summary: makeSummaryChain(),
  }));
  vi.doMock('../src/scan.js', () => ({
    scan: (...args: unknown[]) => mockScan(...args),
  }));
  const { run } = await import('../src/action.js');
  await run().catch((error: Error) => {
    mockSetFailed(error.message);
  });
}

describe('action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetInput.mockReturnValue('');
  });

  describe('input parsing', () => {
    it('passes default inputs to scan()', async () => {
      mockScan.mockResolvedValue(makeResult([]));
      await runAction();

      expect(mockScan).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'CMakeLists.txt',
          scanOnly: false,
        }),
      );
    });

    it('passes configured inputs to scan()', async () => {
      mockGetInput.mockImplementation((name: string) => {
        switch (name) {
          case 'path':
            return 'cmake/CMakeLists.txt';
          case 'scan-only':
            return 'true';
          case 'exclude':
            return 'build\nvendor';
          case 'ignore':
            return 'googletest\nfmt';
          case 'fail-on-updates':
            return 'true';
          default:
            return '';
        }
      });
      mockScan.mockResolvedValue(makeResult([]));
      await runAction();

      const call = mockScan.mock.calls[0][0] as ScanOptions;
      expect(call.path).toBe('cmake/CMakeLists.txt');
      expect(call.scanOnly).toBe(true);
      expect(call.excludePatterns).toHaveLength(2);
      expect(call.ignoreNames).toEqual(['googletest', 'fmt']);
    });

    it('handles comma-separated values in multi-line inputs', async () => {
      mockGetInput.mockImplementation((name: string) => {
        switch (name) {
          case 'ignore':
            return 'googletest,fmt';
          default:
            return '';
        }
      });
      mockScan.mockResolvedValue(makeResult([]));
      await runAction();

      const call = mockScan.mock.calls[0][0] as ScanOptions;
      expect(call.ignoreNames).toEqual(['googletest', 'fmt']);
    });

    it('handles mixed newline and comma-separated values', async () => {
      mockGetInput.mockImplementation((name: string) => {
        switch (name) {
          case 'ignore':
            return 'googletest,fmt\nspdlog';
          default:
            return '';
        }
      });
      mockScan.mockResolvedValue(makeResult([]));
      await runAction();

      const call = mockScan.mock.calls[0][0] as ScanOptions;
      expect(call.ignoreNames).toEqual(['googletest', 'fmt', 'spdlog']);
    });
  });

  describe('annotations', () => {
    it('emits warning for update-available', async () => {
      const dep = makeDep({ name: 'fmt', gitTag: 'v10.2.1' });
      const results: UpdateCheckResult[] = [
        { dep, status: 'update-available', latestVersion: '12.1.0', updateType: 'major' },
      ];
      mockScan.mockResolvedValue(makeResult(results));
      await runAction();

      expect(mockWarning).toHaveBeenCalledWith('fmt: v10.2.1 → 12.1.0 (major update)', {
        file: 'CMakeLists.txt',
        startLine: 10,
      });
    });

    it('emits warning for check-failed', async () => {
      const dep = makeDep({ name: 'broken' });
      const results: UpdateCheckResult[] = [
        { dep, status: 'check-failed', error: 'network timeout' },
      ];
      mockScan.mockResolvedValue(makeResult(results));
      await runAction();

      expect(mockWarning).toHaveBeenCalledWith(
        'broken: update check failed — network timeout',
        expect.objectContaining({ file: 'CMakeLists.txt' }),
      );
    });

    it('emits warning for unresolved-variable', async () => {
      const dep = makeDep({ name: 'varlib' });
      const results: UpdateCheckResult[] = [{ dep, status: 'unresolved-variable' }];
      mockScan.mockResolvedValue(makeResult(results));
      await runAction();

      expect(mockWarning).toHaveBeenCalledWith(
        'varlib: version contains an unresolved CMake variable',
        expect.objectContaining({ file: 'CMakeLists.txt' }),
      );
    });

    it('does not annotate pinned, unpinned, unsupported (covered by summary table)', async () => {
      const deps = ['pinned', 'unpinned', 'unsupported'] as const;
      const results: UpdateCheckResult[] = deps.map((status) => ({
        dep: makeDep({ name: `${status}-lib` }),
        status,
      }));
      mockScan.mockResolvedValue(makeResult(results));
      await runAction();

      expect(mockWarning).not.toHaveBeenCalled();
      expect(mockNotice).not.toHaveBeenCalled();
    });

    it('does not annotate up-to-date deps', async () => {
      const results: UpdateCheckResult[] = [{ dep: makeDep(), status: 'up-to-date' }];
      mockScan.mockResolvedValue(makeResult(results));
      await runAction();

      expect(mockWarning).not.toHaveBeenCalled();
      expect(mockNotice).not.toHaveBeenCalled();
    });

    it('uses resolvedVersion when gitTag is absent (URL deps)', async () => {
      const dep = makeDep({ name: 'urlLib', gitTag: undefined, sourceType: 'url' });
      const results: UpdateCheckResult[] = [
        {
          dep,
          status: 'update-available',
          latestVersion: '3.0.0',
          updateType: 'major',
          resolvedVersion: '2.0.0',
        },
      ];
      mockScan.mockResolvedValue(makeResult(results));
      await runAction();

      expect(mockWarning).toHaveBeenCalledWith(
        'urlLib: 2.0.0 → 3.0.0 (major update)',
        expect.any(Object),
      );
    });
  });

  describe('outputs', () => {
    it('sets all outputs correctly when updates exist', async () => {
      const dep1 = makeDep({ name: 'fmt' });
      const dep2 = makeDep({ name: 'spdlog' });
      const results: UpdateCheckResult[] = [
        { dep: dep1, status: 'update-available', latestVersion: '2.0.0', updateType: 'major' },
        { dep: dep2, status: 'up-to-date' },
      ];
      mockScan.mockResolvedValue(makeResult(results));
      await runAction();

      expect(mockSetOutput).toHaveBeenCalledWith('has-updates', 'true');
      expect(mockSetOutput).toHaveBeenCalledWith('total', '2');
      expect(mockSetOutput).toHaveBeenCalledWith('updates-available', '1');
      expect(mockSetOutput).toHaveBeenCalledWith('result-json', expect.any(String));
    });

    it('sets has-updates to false when no updates', async () => {
      const results: UpdateCheckResult[] = [{ dep: makeDep(), status: 'up-to-date' }];
      mockScan.mockResolvedValue(makeResult(results));
      await runAction();

      expect(mockSetOutput).toHaveBeenCalledWith('has-updates', 'false');
      expect(mockSetOutput).toHaveBeenCalledWith('updates-available', '0');
    });
  });

  describe('fail-on-updates', () => {
    it('calls setFailed when fail-on-updates is true and updates exist', async () => {
      mockGetInput.mockImplementation((name: string) => (name === 'fail-on-updates' ? 'true' : ''));
      const results: UpdateCheckResult[] = [
        {
          dep: makeDep(),
          status: 'update-available',
          latestVersion: '2.0.0',
          updateType: 'major',
        },
      ];
      mockScan.mockResolvedValue(makeResult(results));
      await runAction();

      expect(mockSetFailed).toHaveBeenCalledWith('1 dependency update(s) available');
    });

    it('does not call setFailed when fail-on-updates is true but no updates', async () => {
      mockGetInput.mockImplementation((name: string) => (name === 'fail-on-updates' ? 'true' : ''));
      const results: UpdateCheckResult[] = [{ dep: makeDep(), status: 'up-to-date' }];
      mockScan.mockResolvedValue(makeResult(results));
      await runAction();

      expect(mockSetFailed).not.toHaveBeenCalled();
    });

    it('does not call setFailed when fail-on-updates is false', async () => {
      const results: UpdateCheckResult[] = [
        {
          dep: makeDep(),
          status: 'update-available',
          latestVersion: '2.0.0',
          updateType: 'major',
        },
      ];
      mockScan.mockResolvedValue(makeResult(results));
      await runAction();

      expect(mockSetFailed).not.toHaveBeenCalled();
    });
  });

  describe('job summary', () => {
    it('writes a summary table with update results', async () => {
      const dep = makeDep({ name: 'fmt', gitTag: 'v10.2.1' });
      const results: UpdateCheckResult[] = [
        { dep, status: 'update-available', latestVersion: '12.1.0', updateType: 'major' },
      ];
      mockScan.mockResolvedValue(makeResult(results));
      await runAction();

      expect(mockSummaryAddHeading).toHaveBeenCalledWith('CMake Dependency Check', 3);
      expect(mockSummaryAddTable).toHaveBeenCalledWith([
        expect.arrayContaining([expect.objectContaining({ data: 'Name', header: true })]),
        ['fmt', 'v10.2.1', '12.1.0', 'update available', 'CMakeLists.txt:10'],
      ]);
      expect(mockSummaryWrite).toHaveBeenCalled();
    });

    it('writes scan-only summary without update info', async () => {
      const deps = [makeDep({ name: 'fmt', gitTag: 'v10.2.1' })];
      mockScan.mockResolvedValue(makeResult(undefined, deps));
      await runAction();

      expect(mockSummaryAddTable).toHaveBeenCalledWith([
        expect.any(Array),
        ['fmt', 'v10.2.1', '—', 'scan only', 'CMakeLists.txt:10'],
      ]);
    });

    it('does not write summary when no dependencies found', async () => {
      mockScan.mockResolvedValue(makeResult([]));
      await runAction();

      expect(mockSummaryWrite).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('calls setFailed on scan error', async () => {
      mockScan.mockRejectedValue(new Error('File not found: CMakeLists.txt'));
      await runAction();

      expect(mockSetFailed).toHaveBeenCalledWith('File not found: CMakeLists.txt');
    });
  });
});
