import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UpdateCheckResult } from '../../src/checker/types.js';
import type { FetchContentDependency } from '../../src/parser/types.js';
import type { VariableInfo } from '../../src/scanner/chain-resolver.js';

// Mock @actions/core
vi.mock('@actions/core', () => ({
  warning: vi.fn(),
  info: vi.fn(),
}));

// Mock @actions/github
const mockGetOctokit = vi.fn();
const mockReposGet = vi.fn();
vi.mock('@actions/github', () => ({
  getOctokit: (...args: unknown[]) => mockGetOctokit(...args),
  context: {
    repo: { owner: 'testowner', repo: 'testrepo' },
  },
}));

// Mock github.js exports
const mockCreateUpdatePr = vi.fn();
const mockEnsureLabel = vi.fn();
vi.mock('../../src/pr/github.js', () => ({
  createUpdatePr: (...args: unknown[]) => mockCreateUpdatePr(...args),
  ensureLabel: (...args: unknown[]) => mockEnsureLabel(...args),
}));

// Import after mocking
const { createPullRequests } = await import('../../src/pr/index.js');

function makeDep(overrides: Partial<FetchContentDependency> = {}): FetchContentDependency {
  return {
    name: 'fmt',
    sourceType: 'git',
    gitRepository: 'https://github.com/fmtlib/fmt.git',
    gitTag: 'v10.2.1',
    location: {
      file: `${process.cwd()}/CMakeLists.txt`,
      startLine: 10,
      endLine: 14,
    },
    ...overrides,
  };
}

function makeResult(overrides: Partial<UpdateCheckResult> = {}): UpdateCheckResult {
  return {
    dep: makeDep(),
    status: 'update-available',
    latestVersion: '12.1.0',
    updateType: 'major',
    ...overrides,
  };
}

describe('createPullRequests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureLabel.mockResolvedValue(undefined);
    mockGetOctokit.mockReturnValue({
      rest: {
        repos: {
          get: mockReposGet,
        },
      },
    });
    mockReposGet.mockResolvedValue({
      data: { default_branch: 'main' },
    });
  });

  it('returns empty array when no update-available results', async () => {
    const results = [makeResult({ status: 'up-to-date' }), makeResult({ status: 'pinned' })];
    const prResults = await createPullRequests(results, undefined, 'fake-token');
    expect(prResults).toEqual([]);
    expect(mockCreateUpdatePr).not.toHaveBeenCalled();
  });

  it('returns empty array when no token provided', async () => {
    const results = [makeResult()];
    const prResults = await createPullRequests(results, undefined, undefined);
    expect(prResults).toEqual([]);
  });

  it('only processes update-available results', async () => {
    const results = [
      makeResult({ dep: makeDep({ name: 'fmt' }), status: 'update-available' }),
      makeResult({ dep: makeDep({ name: 'spdlog' }), status: 'up-to-date' }),
      makeResult({ dep: makeDep({ name: 'json' }), status: 'update-available' }),
    ];

    mockCreateUpdatePr
      .mockResolvedValueOnce({ name: 'fmt', prNumber: 1, prUrl: 'url1' })
      .mockResolvedValueOnce({ name: 'json', prNumber: 2, prUrl: 'url2' });

    const prResults = await createPullRequests(results, undefined, 'fake-token');
    expect(prResults).toHaveLength(2);
    expect(mockCreateUpdatePr).toHaveBeenCalledTimes(2);
  });

  it('reports skipped when computeEdit returns null', async () => {
    // A dep with no gitTag and no updatedUrl → computeEdit returns null
    const dep = makeDep({
      sourceType: 'url',
      gitTag: undefined,
      url: 'https://example.com/a.tar.gz',
    });
    const results = [makeResult({ dep, updatedUrl: undefined })];

    const prResults = await createPullRequests(results, undefined, 'fake-token');
    expect(prResults).toHaveLength(1);
    expect(prResults[0].skipped).toBe('cannot compute edit');
    expect(mockCreateUpdatePr).not.toHaveBeenCalled();
  });

  it('isolates errors across dependencies', async () => {
    const results = [
      makeResult({ dep: makeDep({ name: 'fmt', gitTag: '10.2.1' }) }),
      makeResult({ dep: makeDep({ name: 'spdlog', gitTag: '1.14.0' }), latestVersion: '1.15.0' }),
    ];

    mockCreateUpdatePr
      .mockRejectedValueOnce(new Error('API rate limit'))
      .mockResolvedValueOnce({ name: 'spdlog', prNumber: 2, prUrl: 'url2' });

    const prResults = await createPullRequests(results, undefined, 'fake-token');
    expect(prResults).toHaveLength(2);
    expect(prResults[0].error).toBe('API rate limit');
    expect(prResults[1].prNumber).toBe(2);
  });

  it('returns dry-run results without calling createUpdatePr', async () => {
    const results = [makeResult({ dep: makeDep({ name: 'fmt', gitTag: '10.2.1' }) })];

    const prResults = await createPullRequests(results, undefined, 'fake-token', true);
    expect(prResults).toHaveLength(1);
    expect(prResults[0].skipped).toBe('dry-run');
    expect(mockCreateUpdatePr).not.toHaveBeenCalled();
  });

  it('passes vars to computeEdit for variable-resolved deps', async () => {
    const dep = makeDep({
      name: 'fmt',
      gitTag: '10.2.1',
      gitTagRaw: '${FMT_VERSION}',
    });
    const vars = new Map<string, VariableInfo>([
      ['FMT_VERSION', { value: '10.2.1', file: `${process.cwd()}/versions.cmake`, line: 5 }],
    ]);
    const results = [makeResult({ dep })];

    mockCreateUpdatePr.mockResolvedValueOnce({ name: 'fmt', prNumber: 1, prUrl: 'url' });

    const prResults = await createPullRequests(results, vars, 'fake-token');
    expect(prResults).toHaveLength(1);

    // The edit should target versions.cmake (from vars), not CMakeLists.txt
    const editArg = mockCreateUpdatePr.mock.calls[0][3];
    expect(editArg.file).toContain('versions.cmake');
  });
});
