import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FetchContentDependency } from '../../src/parser/types.js';

vi.mock('../../src/checker/git-tags.js', () => ({
  fetchRemoteTags: vi.fn(),
  parseGitLsRemoteOutput: vi.fn(),
}));

vi.mock('../../src/checker/github-url.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    verifyUrlExists: vi.fn(actual.verifyUrlExists as (...args: unknown[]) => unknown),
  };
});

import { checkForUpdates } from '../../src/checker/version-checker.js';
import { fetchRemoteTags } from '../../src/checker/git-tags.js';
import { verifyUrlExists } from '../../src/checker/github-url.js';

const mockedFetchRemoteTags = vi.mocked(fetchRemoteTags);
const mockedVerifyUrlExists = vi.mocked(verifyUrlExists);

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

  it('includes intermediateTags on update-available results', async () => {
    mockedFetchRemoteTags.mockResolvedValue(['v1.0.0', 'v1.1.0', 'v2.0.0']);

    const results = await checkForUpdates([makeDep({ gitTag: 'v1.0.0' })]);

    expect(results[0].status).toBe('update-available');
    expect(results[0].intermediateTags).toEqual(['v2.0.0', 'v1.1.0']);
  });

  it('reports up-to-date when current is latest', async () => {
    mockedFetchRemoteTags.mockResolvedValue(['v1.0.0', 'v1.1.0']);

    const results = await checkForUpdates([makeDep({ gitTag: 'v1.1.0' })]);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('up-to-date');
    expect(results[0].intermediateTags).toBeUndefined();
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

  describe('GitHub URL deps', () => {
    function makeUrlDep(
      url: string,
      overrides: Partial<FetchContentDependency> = {},
    ): FetchContentDependency {
      return makeDep({
        sourceType: 'url',
        gitRepository: undefined,
        gitTag: undefined,
        url,
        ...overrides,
      });
    }

    it('non-GitHub URL dep gets unsupported status', async () => {
      const dep = makeUrlDep('https://example.com/lib.tar.gz');
      const results = await checkForUpdates([dep]);
      expect(results[0].status).toBe('unsupported');
      expect(results[0].resolvedVersion).toBeUndefined();
      expect(mockedFetchRemoteTags).not.toHaveBeenCalled();
    });

    it('GitHub URL dep with SHA ref gets pinned status with resolvedVersion', async () => {
      const sha = 'a'.repeat(40);
      const dep = makeUrlDep(`https://github.com/owner/repo/archive/${sha}.tar.gz`);
      const results = await checkForUpdates([dep]);
      expect(results[0].status).toBe('pinned');
      expect(results[0].resolvedVersion).toBe(sha);
      expect(mockedFetchRemoteTags).not.toHaveBeenCalled();
    });

    it('archive pattern: detects up-to-date with resolvedVersion', async () => {
      mockedFetchRemoteTags.mockResolvedValue(['v1.2.3']);
      const dep = makeUrlDep('https://github.com/owner/repo/archive/v1.2.3.tar.gz');
      const results = await checkForUpdates([dep]);
      expect(results[0].status).toBe('up-to-date');
      expect(results[0].resolvedVersion).toBe('v1.2.3');
    });

    it('archive pattern: detects update-available with updatedUrl and resolvedVersion', async () => {
      mockedFetchRemoteTags.mockResolvedValue(['v1.2.3', 'v1.3.0']);
      const dep = makeUrlDep('https://github.com/owner/repo/archive/v1.2.3.tar.gz');
      const results = await checkForUpdates([dep]);
      expect(results[0].status).toBe('update-available');
      expect(results[0].latestVersion).toBe('v1.3.0');
      expect(results[0].updatedUrl).toBe('https://github.com/owner/repo/archive/v1.3.0.tar.gz');
      expect(results[0].resolvedVersion).toBe('v1.2.3');
      // No HEAD validation for archive patterns
      expect(mockedVerifyUrlExists).not.toHaveBeenCalled();
    });

    it('includes intermediateTags on update-available URL deps', async () => {
      mockedFetchRemoteTags.mockResolvedValue(['v1.2.3', 'v1.2.5', 'v1.3.0']);
      const dep = makeUrlDep('https://github.com/owner/repo/archive/v1.2.3.tar.gz');
      const results = await checkForUpdates([dep]);
      expect(results[0].intermediateTags).toBeDefined();
      expect(results[0].intermediateTags).toContain('v1.3.0');
    });

    it('releases-download pattern: update-available with valid HEAD', async () => {
      mockedFetchRemoteTags.mockResolvedValue(['v3.11.3', 'v3.12.0']);
      mockedVerifyUrlExists.mockResolvedValue(true);
      const dep = makeUrlDep(
        'https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz',
      );
      const results = await checkForUpdates([dep]);
      expect(results[0].status).toBe('update-available');
      expect(results[0].updatedUrl).toBe(
        'https://github.com/nlohmann/json/releases/download/v3.12.0/json.tar.xz',
      );
      expect(results[0].resolvedVersion).toBe('v3.11.3');
      expect(mockedVerifyUrlExists).toHaveBeenCalledTimes(1);
    });

    it('releases-download pattern: 404 HEAD results in check-failed with resolvedVersion', async () => {
      mockedFetchRemoteTags.mockResolvedValue(['v3.11.3', 'v3.12.0']);
      mockedVerifyUrlExists.mockResolvedValue(false);
      const dep = makeUrlDep(
        'https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz',
      );
      const results = await checkForUpdates([dep]);
      expect(results[0].status).toBe('check-failed');
      expect(results[0].error).toContain('Release asset not found');
      expect(results[0].error).toContain('v3.12.0');
      expect(results[0].resolvedVersion).toBe('v3.11.3');
    });

    it('releases-download pattern: HEAD network error results in check-failed', async () => {
      mockedFetchRemoteTags.mockResolvedValue(['v3.11.3', 'v3.12.0']);
      mockedVerifyUrlExists.mockRejectedValue(new Error('network timeout'));
      const dep = makeUrlDep(
        'https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz',
      );
      const results = await checkForUpdates([dep]);
      expect(results[0].status).toBe('check-failed');
      expect(results[0].error).toContain('network timeout');
    });

    it('updatedUrl and resolvedVersion not present on git-type deps', async () => {
      mockedFetchRemoteTags.mockResolvedValue(['v1.0.0', 'v2.0.0']);
      const dep = makeDep({ gitTag: 'v1.0.0' });
      const results = await checkForUpdates([dep]);
      expect(results[0].status).toBe('update-available');
      expect(results[0].updatedUrl).toBeUndefined();
      expect(results[0].resolvedVersion).toBeUndefined();
    });

    it('GitHub URL dep shares fetchRemoteTags call with git dep pointing to same repo', async () => {
      mockedFetchRemoteTags.mockResolvedValue(['v1.0.0', 'v2.0.0']);
      mockedVerifyUrlExists.mockResolvedValue(true);

      const gitDep = makeDep({
        name: 'git-dep',
        gitRepository: 'https://github.com/owner/repo.git',
        gitTag: 'v1.0.0',
      });
      const urlDep = makeUrlDep(
        'https://github.com/owner/repo/releases/download/v1.0.0/file.tar.gz',
        { name: 'url-dep' },
      );

      const results = await checkForUpdates([gitDep, urlDep]);

      expect(mockedFetchRemoteTags).toHaveBeenCalledTimes(1);
      expect(results[0].status).toBe('update-available');
      expect(results[1].status).toBe('update-available');
      expect(results[1].updatedUrl).toBeDefined();
    });
  });
});
