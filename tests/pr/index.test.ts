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
const mockBranchName = vi.fn();
vi.mock('../../src/pr/github.js', () => ({
  createUpdatePr: (...args: unknown[]) => mockCreateUpdatePr(...args),
  ensureLabel: (...args: unknown[]) => mockEnsureLabel(...args),
  branchName: (...args: unknown[]) => mockBranchName(...args),
}));

// Mock cleanup.js exports
const mockListDepcheckPrs = vi.fn();
const mockExtractDepName = vi.fn();
const mockCloseStalePr = vi.fn();
vi.mock('../../src/pr/cleanup.js', () => ({
  listDepcheckPrs: (...args: unknown[]) => mockListDepcheckPrs(...args),
  extractDepName: (...args: unknown[]) => mockExtractDepName(...args),
  closeStalePr: (...args: unknown[]) => mockCloseStalePr(...args),
}));

// Mock updater.js exports
const mockUpdateExistingPr = vi.fn();
vi.mock('../../src/pr/updater.js', () => ({
  updateExistingPr: (...args: unknown[]) => mockUpdateExistingPr(...args),
}));

// Mock edit-marker.js exports
const mockExtractEditText = vi.fn();
vi.mock('../../src/pr/edit-marker.js', () => ({
  extractEditText: (...args: unknown[]) => mockExtractEditText(...args),
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

const mockPaginate = vi.fn();

describe('createPullRequests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureLabel.mockResolvedValue(undefined);
    mockListDepcheckPrs.mockResolvedValue([]);
    mockCloseStalePr.mockResolvedValue(undefined);
    mockBranchName.mockImplementation(
      (dep: string, _file: string, line: number) =>
        `cmake-depcheck/update-${dep}-${String(line).padStart(8, '0')}`,
    );
    mockGetOctokit.mockReturnValue({
      paginate: mockPaginate,
      rest: {
        repos: { get: mockReposGet },
        pulls: { list: vi.fn() },
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

  it('creates new PR when no existing PR matches', async () => {
    const results = [makeResult({ dep: makeDep({ name: 'fmt' }) })];

    mockCreateUpdatePr.mockResolvedValueOnce({
      name: 'fmt',
      action: 'created',
      prNumber: 1,
      prUrl: 'url1',
    });

    const prResults = await createPullRequests(results, undefined, 'fake-token');
    expect(prResults).toHaveLength(1);
    expect(prResults[0].action).toBe('created');
    expect(mockCreateUpdatePr).toHaveBeenCalledTimes(1);
  });

  it('only processes update-available results', async () => {
    const results = [
      makeResult({ dep: makeDep({ name: 'fmt' }), status: 'update-available' }),
      makeResult({ dep: makeDep({ name: 'spdlog' }), status: 'up-to-date' }),
      makeResult({ dep: makeDep({ name: 'json' }), status: 'update-available' }),
    ];

    mockCreateUpdatePr
      .mockResolvedValueOnce({ name: 'fmt', action: 'created', prNumber: 1, prUrl: 'url1' })
      .mockResolvedValueOnce({ name: 'json', action: 'created', prNumber: 2, prUrl: 'url2' });

    const prResults = await createPullRequests(results, undefined, 'fake-token');
    expect(prResults).toHaveLength(2);
    expect(mockCreateUpdatePr).toHaveBeenCalledTimes(2);
  });

  it('reports skipped when computeEdit returns null', async () => {
    const dep = makeDep({
      sourceType: 'url',
      gitTag: undefined,
      url: 'https://example.com/a.tar.gz',
    });
    const results = [makeResult({ dep, updatedUrl: undefined })];

    const prResults = await createPullRequests(results, undefined, 'fake-token');
    expect(prResults).toHaveLength(1);
    expect(prResults[0].action).toBe('skipped');
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
      .mockResolvedValueOnce({ name: 'spdlog', action: 'created', prNumber: 2, prUrl: 'url2' });

    const prResults = await createPullRequests(results, undefined, 'fake-token');
    expect(prResults).toHaveLength(2);
    expect(prResults[0].action).toBe('error');
    expect(prResults[0].error).toBe('API rate limit');
    expect(prResults[1].prNumber).toBe(2);
  });

  it('returns dry-run results for new PRs without calling createUpdatePr', async () => {
    const results = [makeResult({ dep: makeDep({ name: 'fmt', gitTag: '10.2.1' }) })];

    const prResults = await createPullRequests(results, undefined, 'fake-token', true);
    expect(prResults).toHaveLength(1);
    expect(prResults[0].action).toBe('created');
    expect(prResults[0].dryRun).toBe(true);
    expect(prResults[0].skipped).toBeUndefined();
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

    mockCreateUpdatePr.mockResolvedValueOnce({
      name: 'fmt',
      action: 'created',
      prNumber: 1,
      prUrl: 'url',
    });

    const prResults = await createPullRequests(results, vars, 'fake-token');
    expect(prResults).toHaveLength(1);

    const editArg = mockCreateUpdatePr.mock.calls[0][3];
    expect(editArg.file).toContain('versions.cmake');
  });

  describe('update-in-place', () => {
    it('updates existing PR when marker shows different version', async () => {
      const branch = 'cmake-depcheck/update-fmt-00000010';
      mockBranchName.mockReturnValue(branch);
      mockListDepcheckPrs.mockResolvedValue([
        {
          number: 42,
          branch,
          title: 'chore(deps): update fmt to 11.0.0',
          body: '<!-- cmake-depcheck:edit:v11.0.0 -->',
          url: 'https://github.com/testowner/testrepo/pull/42',
        },
      ]);
      mockExtractEditText.mockReturnValue('v11.0.0');
      mockUpdateExistingPr.mockResolvedValue({
        name: 'fmt',
        action: 'updated',
        prNumber: 42,
        prUrl: 'https://github.com/testowner/testrepo/pull/42',
      });

      const results = [makeResult()];
      const prResults = await createPullRequests(results, undefined, 'fake-token');

      expect(prResults).toHaveLength(1);
      expect(prResults[0].action).toBe('updated');
      expect(prResults[0].prNumber).toBe(42);
      expect(mockUpdateExistingPr).toHaveBeenCalledTimes(1);
      expect(mockCreateUpdatePr).not.toHaveBeenCalled();
    });

    it('skips when existing PR already targets the latest version', async () => {
      const branch = 'cmake-depcheck/update-fmt-00000010';
      mockBranchName.mockReturnValue(branch);
      mockListDepcheckPrs.mockResolvedValue([
        {
          number: 42,
          branch,
          title: 'chore(deps): update fmt to 12.1.0',
          body: '<!-- cmake-depcheck:edit:v12.1.0 -->',
          url: 'url',
        },
      ]);
      // edit.newText for this dep would be v12.1.0 (aligned from latestVersion 12.1.0)
      mockExtractEditText.mockReturnValue('v12.1.0');

      const results = [makeResult()];
      const prResults = await createPullRequests(results, undefined, 'fake-token');

      expect(prResults).toHaveLength(1);
      expect(prResults[0].action).toBe('skipped');
      expect(prResults[0].skipped).toBe('already up to date');
      expect(mockUpdateExistingPr).not.toHaveBeenCalled();
      expect(mockCreateUpdatePr).not.toHaveBeenCalled();
    });

    it('skips when edit marker is missing from PR body', async () => {
      const branch = 'cmake-depcheck/update-fmt-00000010';
      mockBranchName.mockReturnValue(branch);
      mockListDepcheckPrs.mockResolvedValue([
        { number: 42, branch, title: 'title', body: 'no marker here', url: 'url' },
      ]);
      mockExtractEditText.mockReturnValue(null);

      const results = [makeResult()];
      const prResults = await createPullRequests(results, undefined, 'fake-token');

      expect(prResults).toHaveLength(1);
      expect(prResults[0].action).toBe('skipped');
      expect(prResults[0].skipped).toContain('edit marker');
    });

    it('logs dry-run for update-in-place without mutating', async () => {
      const branch = 'cmake-depcheck/update-fmt-00000010';
      mockBranchName.mockReturnValue(branch);
      mockListDepcheckPrs.mockResolvedValue([
        {
          number: 42,
          branch,
          title: 'chore(deps): update fmt to 11.0.0',
          body: '<!-- cmake-depcheck:edit:v11.0.0 -->',
          url: 'url',
        },
      ]);
      mockExtractEditText.mockReturnValue('v11.0.0');

      const results = [makeResult()];
      const prResults = await createPullRequests(results, undefined, 'fake-token', true);

      expect(prResults).toHaveLength(1);
      expect(prResults[0].action).toBe('updated');
      expect(prResults[0].dryRun).toBe(true);
      expect(prResults[0].skipped).toBeUndefined();
      expect(mockUpdateExistingPr).not.toHaveBeenCalled();
    });
  });

  describe('stale PR cleanup', () => {
    it('closes stale PR when dep was scanned but no longer updatable', async () => {
      const fmtBranch = 'cmake-depcheck/update-fmt-00000010';
      mockBranchName.mockReturnValue(fmtBranch);

      mockListDepcheckPrs.mockResolvedValue([
        {
          number: 99,
          branch: 'cmake-depcheck/update-old-dep-abcd1234',
          title: 'chore(deps): update old-dep to 1.0.0',
          body: '<!-- cmake-depcheck:edit:v1.0.0 -->',
          url: 'url99',
        },
      ]);
      mockExtractDepName.mockReturnValue('old-dep');
      mockCloseStalePr.mockResolvedValue(undefined);

      // fmt is updatable (so we pass the early return), old-dep is stale
      mockCreateUpdatePr.mockResolvedValueOnce({
        name: 'fmt',
        action: 'created',
        prNumber: 1,
        prUrl: 'url1',
      });

      const results = [makeResult({ dep: makeDep({ name: 'fmt' }) })];
      const scannedDepNames = new Set(['fmt', 'old-dep']);
      const prResults = await createPullRequests(
        results,
        undefined,
        'fake-token',
        false,
        scannedDepNames,
      );

      const staleResult = prResults.find((r) => r.name === 'old-dep');
      expect(staleResult).toBeDefined();
      expect(staleResult!.action).toBe('closed-stale');
      expect(staleResult!.closedPrNumber).toBe(99);
      expect(mockCloseStalePr).toHaveBeenCalledTimes(1);
    });

    it('leaves unmatched PR alone when dep is NOT in scan scope', async () => {
      const fmtBranch = 'cmake-depcheck/update-fmt-00000010';
      mockBranchName.mockReturnValue(fmtBranch);

      mockListDepcheckPrs.mockResolvedValue([
        {
          number: 99,
          branch: 'cmake-depcheck/update-out-of-scope-abcd1234',
          title: 'title',
          body: '',
          url: 'url',
        },
      ]);
      mockExtractDepName.mockReturnValue('out-of-scope');

      mockCreateUpdatePr.mockResolvedValueOnce({
        name: 'fmt',
        action: 'created',
        prNumber: 1,
        prUrl: 'url1',
      });

      const results = [makeResult({ dep: makeDep({ name: 'fmt' }) })];
      const scannedDepNames = new Set(['fmt']); // out-of-scope NOT in set
      const prResults = await createPullRequests(
        results,
        undefined,
        'fake-token',
        false,
        scannedDepNames,
      );

      expect(prResults.find((r) => r.name === 'out-of-scope')).toBeUndefined();
      expect(mockCloseStalePr).not.toHaveBeenCalled();
    });

    it('handles legacy branch names (closed as stale)', async () => {
      const fmtBranch = 'cmake-depcheck/update-fmt-00000010';
      mockBranchName.mockReturnValue(fmtBranch);

      // Legacy branch won't match any computed branch name
      mockListDepcheckPrs.mockResolvedValue([
        {
          number: 50,
          branch: 'cmake-depcheck/update-fmt-12.1.0',
          title: 'chore(deps): update fmt to 12.1.0',
          body: '',
          url: 'url50',
        },
      ]);
      mockExtractDepName.mockReturnValue('fmt');
      mockCloseStalePr.mockResolvedValue(undefined);

      mockCreateUpdatePr.mockResolvedValueOnce({
        name: 'fmt',
        action: 'created',
        prNumber: 1,
        prUrl: 'url1',
      });

      const results = [makeResult({ dep: makeDep({ name: 'fmt' }) })];
      const scannedDepNames = new Set(['fmt']);
      const prResults = await createPullRequests(
        results,
        undefined,
        'fake-token',
        false,
        scannedDepNames,
      );

      const staleResult = prResults.find((r) => r.closedPrNumber === 50);
      expect(staleResult).toBeDefined();
      expect(staleResult!.action).toBe('closed-stale');
    });

    it('dry-run logs stale closure without closing', async () => {
      const fmtBranch = 'cmake-depcheck/update-fmt-00000010';
      mockBranchName.mockReturnValue(fmtBranch);

      mockListDepcheckPrs.mockResolvedValue([
        {
          number: 99,
          branch: 'cmake-depcheck/update-stale-dep-abcd1234',
          title: 'title',
          body: '',
          url: 'url',
        },
      ]);
      mockExtractDepName.mockReturnValue('stale-dep');

      const results = [makeResult({ dep: makeDep({ name: 'fmt' }) })];
      const scannedDepNames = new Set(['fmt', 'stale-dep']);
      const prResults = await createPullRequests(
        results,
        undefined,
        'fake-token',
        true,
        scannedDepNames,
      );

      const staleResult = prResults.find((r) => r.name === 'stale-dep');
      expect(staleResult).toBeDefined();
      expect(staleResult!.action).toBe('closed-stale');
      expect(staleResult!.dryRun).toBe(true);
      expect(staleResult!.skipped).toBeUndefined();
      expect(mockCloseStalePr).not.toHaveBeenCalled();
    });
  });

  describe('branch naming', () => {
    it('computes branch name with repo-relative path', async () => {
      mockCreateUpdatePr.mockResolvedValueOnce({
        name: 'fmt',
        action: 'created',
        prNumber: 1,
        prUrl: 'url',
      });

      const results = [makeResult()];
      await createPullRequests(results, undefined, 'fake-token');

      // branchName should have been called with repo-relative path, not absolute
      expect(mockBranchName).toHaveBeenCalledWith('fmt', 'CMakeLists.txt', 10);
    });

    it('separate hashes for multiple declarations of same dep', async () => {
      // Two declarations of "fmt" at different lines
      const dep1 = makeDep({
        name: 'fmt',
        location: { file: `${process.cwd()}/CMakeLists.txt`, startLine: 10, endLine: 14 },
      });
      const dep2 = makeDep({
        name: 'fmt',
        location: { file: `${process.cwd()}/CMakeLists.txt`, startLine: 30, endLine: 34 },
      });

      mockBranchName
        .mockReturnValueOnce('cmake-depcheck/update-fmt-aaaa0010')
        .mockReturnValueOnce('cmake-depcheck/update-fmt-aaaa0030');

      mockCreateUpdatePr
        .mockResolvedValueOnce({ name: 'fmt', action: 'created', prNumber: 1, prUrl: 'url1' })
        .mockResolvedValueOnce({ name: 'fmt', action: 'created', prNumber: 2, prUrl: 'url2' });

      const results = [makeResult({ dep: dep1 }), makeResult({ dep: dep2 })];
      const prResults = await createPullRequests(results, undefined, 'fake-token');

      expect(prResults).toHaveLength(2);
      expect(mockBranchName).toHaveBeenCalledTimes(2);
      // Different line numbers → different branches
      expect(mockBranchName.mock.calls[0][2]).toBe(10);
      expect(mockBranchName.mock.calls[1][2]).toBe(30);
    });
  });
});
