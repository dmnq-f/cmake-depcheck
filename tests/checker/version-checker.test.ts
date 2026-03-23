import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FetchContentDependency } from '../../src/parser/types.js';

vi.mock('../../src/checker/git-tags.js', () => ({
  fetchRemoteTags: vi.fn(),
  parseGitLsRemoteOutput: vi.fn(),
}));

import { checkForUpdates } from '../../src/checker/version-checker.js';
import { fetchRemoteTags } from '../../src/checker/git-tags.js';

const mockedFetchRemoteTags = vi.mocked(fetchRemoteTags);

function makeDep(overrides: Partial<FetchContentDependency> = {}): FetchContentDependency {
  return {
    name: 'test-dep',
    sourceType: 'git',
    gitRepository: 'https://github.com/test/repo.git',
    gitTag: 'v1.0.0',
    location: { file: '/test/CMakeLists.txt', startLine: 1, endLine: 5 },
    ...overrides,
  };
}

describe('checkForUpdates', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('detects an update-available dependency', async () => {
    mockedFetchRemoteTags.mockResolvedValue(['v1.0.0', 'v1.1.0', 'v2.0.0']);

    const results = await checkForUpdates([makeDep({ gitTag: 'v1.0.0' })]);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('update-available');
    expect(results[0].latestVersion).toBe('v2.0.0');
    expect(results[0].updateType).toBe('major');
  });

  it('reports up-to-date when current is latest', async () => {
    mockedFetchRemoteTags.mockResolvedValue(['v1.0.0', 'v1.1.0']);

    const results = await checkForUpdates([makeDep({ gitTag: 'v1.1.0' })]);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('up-to-date');
  });

  it('skips URL-source deps without network call', async () => {
    const dep = makeDep({
      sourceType: 'url',
      gitRepository: undefined,
      gitTag: undefined,
      url: 'https://example.com/lib.tar.gz',
    });

    const results = await checkForUpdates([dep]);

    expect(results[0].status).toBe('unsupported');
    expect(mockedFetchRemoteTags).not.toHaveBeenCalled();
  });

  it('skips SHA-pinned deps without network call', async () => {
    const dep = makeDep({
      gitTag: 'a'.repeat(40),
      gitTagIsSha: true,
    });

    const results = await checkForUpdates([dep]);

    expect(results[0].status).toBe('pinned');
    expect(mockedFetchRemoteTags).not.toHaveBeenCalled();
  });

  it('skips deps with no gitTag', async () => {
    const dep = makeDep({ gitTag: undefined });

    const results = await checkForUpdates([dep]);

    expect(results[0].status).toBe('unpinned');
    expect(mockedFetchRemoteTags).not.toHaveBeenCalled();
  });

  it('skips deps with unresolved variables', async () => {
    const dep = makeDep({ gitTag: '${SOME_VERSION}' });

    const results = await checkForUpdates([dep]);

    expect(results[0].status).toBe('unresolved-variable');
    expect(mockedFetchRemoteTags).not.toHaveBeenCalled();
  });

  it('deduplicates fetches for same repository', async () => {
    mockedFetchRemoteTags.mockResolvedValue(['v1.0.0', 'v2.0.0']);

    const dep1 = makeDep({ name: 'dep1', gitTag: 'v1.0.0' });
    const dep2 = makeDep({ name: 'dep2', gitTag: 'v1.0.0' });

    const results = await checkForUpdates([dep1, dep2]);

    expect(mockedFetchRemoteTags).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('update-available');
    expect(results[1].status).toBe('update-available');
  });

  it('handles fetch errors gracefully', async () => {
    mockedFetchRemoteTags.mockRejectedValue(new Error('network error'));

    const results = await checkForUpdates([makeDep()]);

    expect(results[0].status).toBe('check-failed');
    expect(results[0].error).toContain('network error');
  });

  it('handles mixed deps: some skip, some check', async () => {
    mockedFetchRemoteTags.mockResolvedValue(['v1.0.0', 'v1.1.0']);

    const deps = [
      makeDep({ name: 'git-dep', gitTag: 'v1.0.0' }),
      makeDep({
        name: 'url-dep',
        sourceType: 'url',
        gitRepository: undefined,
        gitTag: undefined,
        url: 'https://example.com/lib.tar.gz',
      }),
      makeDep({ name: 'pinned', gitTag: 'a'.repeat(40), gitTagIsSha: true }),
    ];

    const results = await checkForUpdates(deps);

    expect(results).toHaveLength(3);
    expect(results[0].status).toBe('update-available');
    expect(results[1].status).toBe('unsupported');
    expect(results[2].status).toBe('pinned');
  });

  it('preserves original dep order', async () => {
    mockedFetchRemoteTags.mockResolvedValue(['v1.0.0']);

    const deps = [
      makeDep({ name: 'pinned', gitTag: 'a'.repeat(40), gitTagIsSha: true }),
      makeDep({ name: 'git-dep', gitTag: 'v1.0.0' }),
      makeDep({ name: 'unpinned', gitTag: undefined }),
    ];

    const results = await checkForUpdates(deps);

    expect(results[0].dep.name).toBe('pinned');
    expect(results[1].dep.name).toBe('git-dep');
    expect(results[2].dep.name).toBe('unpinned');
  });

  it('calls progress callback with correct counts', async () => {
    mockedFetchRemoteTags.mockResolvedValue(['v1.0.0']);

    const dep1 = makeDep({ name: 'dep1', gitRepository: 'https://repo1.git', gitTag: 'v1.0.0' });
    const dep2 = makeDep({ name: 'dep2', gitRepository: 'https://repo2.git', gitTag: 'v1.0.0' });

    const progressCalls: [number, number][] = [];
    await checkForUpdates([dep1, dep2], (completed, total) => {
      progressCalls.push([completed, total]);
    });

    expect(progressCalls).toHaveLength(2);
    expect(progressCalls[0][1]).toBe(2);
    expect(progressCalls[1][1]).toBe(2);
    // Both should complete (order may vary due to concurrency)
    const completedValues = progressCalls.map((c) => c[0]).sort();
    expect(completedValues).toEqual([1, 2]);
  });
});
