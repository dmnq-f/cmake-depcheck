import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listDepcheckPrs,
  extractDepName,
  closeStalePr,
  type ExistingPr,
} from '../../src/pr/cleanup.js';
import type { GitHubContext } from '../../src/pr/github.js';

const ctx: GitHubContext = {
  owner: 'testowner',
  repo: 'testrepo',
  defaultBranch: 'main',
};

function createMockOctokit() {
  return {
    paginate: vi.fn(),
    rest: {
      pulls: {
        list: vi.fn(),
        update: vi.fn(),
      },
      issues: {
        createComment: vi.fn(),
      },
      git: {
        deleteRef: vi.fn(),
      },
    },
  };
}

type MockOctokit = ReturnType<typeof createMockOctokit>;

describe('listDepcheckPrs', () => {
  let octokit: MockOctokit;

  beforeEach(() => {
    octokit = createMockOctokit();
  });

  it('returns PRs filtered by branch prefix, including title and body', async () => {
    octokit.paginate.mockResolvedValue([
      {
        number: 1,
        head: { ref: 'cmake-depcheck/update-fmt-a1b2c3d4' },
        title: 'chore(deps): update fmt to 12.1.0',
        body: '<!-- cmake-depcheck:edit:v12.1.0 -->',
        html_url: 'https://github.com/testowner/testrepo/pull/1',
      },
      {
        number: 2,
        head: { ref: 'feature/something' },
        title: 'Add feature',
        body: 'description',
        html_url: 'https://github.com/testowner/testrepo/pull/2',
      },
      {
        number: 3,
        head: { ref: 'cmake-depcheck/update-spdlog-e5f6a7b8' },
        title: 'chore(deps): update spdlog to 1.15.0',
        body: '<!-- cmake-depcheck:edit:v1.15.0 -->',
        html_url: 'https://github.com/testowner/testrepo/pull/3',
      },
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await listDepcheckPrs(octokit as any, ctx);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      number: 1,
      branch: 'cmake-depcheck/update-fmt-a1b2c3d4',
      title: 'chore(deps): update fmt to 12.1.0',
      body: '<!-- cmake-depcheck:edit:v12.1.0 -->',
      url: 'https://github.com/testowner/testrepo/pull/1',
    });
    expect(result[1].number).toBe(3);
  });

  it('handles empty PR list', async () => {
    octokit.paginate.mockResolvedValue([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await listDepcheckPrs(octokit as any, ctx);
    expect(result).toEqual([]);
  });

  it('handles null body gracefully', async () => {
    octokit.paginate.mockResolvedValue([
      {
        number: 1,
        head: { ref: 'cmake-depcheck/update-fmt-a1b2c3d4' },
        title: 'chore(deps): update fmt to 12.1.0',
        body: null,
        html_url: 'url',
      },
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await listDepcheckPrs(octokit as any, ctx);
    expect(result[0].body).toBe('');
  });

  it('passes correct params to octokit.paginate', async () => {
    octokit.paginate.mockResolvedValue([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await listDepcheckPrs(octokit as any, ctx);

    expect(octokit.paginate).toHaveBeenCalledWith(octokit.rest.pulls.list, {
      owner: 'testowner',
      repo: 'testrepo',
      state: 'open',
      per_page: 100,
    });
  });
});

describe('extractDepName', () => {
  it('parses new-style branch with 8 hex hash', () => {
    expect(extractDepName('cmake-depcheck/update-fmt-a1b2c3d4')).toBe('fmt');
  });

  it('parses legacy branch with version suffix', () => {
    expect(extractDepName('cmake-depcheck/update-fmt-12.1.0')).toBe('fmt');
  });

  it('handles dep names with hyphens (new-style)', () => {
    expect(extractDepName('cmake-depcheck/update-my-lib-a1b2c3d4')).toBe('my-lib');
  });

  it('handles dep names with hyphens (legacy)', () => {
    expect(extractDepName('cmake-depcheck/update-my-lib-12.1.0')).toBe('my-lib');
  });

  it('returns null for non-matching branch', () => {
    expect(extractDepName('feature/something')).toBeNull();
  });

  it('returns null for branch with only prefix and no dep name', () => {
    expect(extractDepName('cmake-depcheck/update-')).toBeNull();
  });

  it('returns null when there is no dash after the dep name', () => {
    expect(extractDepName('cmake-depcheck/update-fmt')).toBeNull();
  });

  it('mismatch on legacy branch with hyphenated pre-release version (known limitation)', () => {
    // Legacy branch: cmake-depcheck/update-v2-compat-1.0.0-rc1
    // lastIndexOf('-') splits at "rc1", extracting "v2-compat-1.0.0" as dep name.
    // The real dep name is "v2-compat" but we can't distinguish without context.
    // This is acceptable: the stale cleanup scoping (scannedDepNames) will
    // simply not match, so the PR is left untouched rather than incorrectly closed.
    expect(extractDepName('cmake-depcheck/update-v2-compat-1.0.0-rc1')).toBe('v2-compat-1.0.0');
  });
});

describe('closeStalePr', () => {
  let octokit: MockOctokit;
  const pr: ExistingPr = {
    number: 42,
    branch: 'cmake-depcheck/update-fmt-a1b2c3d4',
    title: 'chore(deps): update fmt to 12.1.0',
    body: '',
    url: 'https://github.com/testowner/testrepo/pull/42',
  };

  beforeEach(() => {
    octokit = createMockOctokit();
    octokit.rest.issues.createComment.mockResolvedValue({});
    octokit.rest.pulls.update.mockResolvedValue({});
    octokit.rest.git.deleteRef.mockResolvedValue({});
  });

  it('posts comment, closes PR, and deletes branch', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await closeStalePr(octokit as any, ctx, pr, 'Declaration removed.');

    expect(octokit.rest.issues.createComment).toHaveBeenCalledWith({
      owner: 'testowner',
      repo: 'testrepo',
      issue_number: 42,
      body: expect.stringContaining('Declaration removed.'),
    });

    expect(octokit.rest.pulls.update).toHaveBeenCalledWith({
      owner: 'testowner',
      repo: 'testrepo',
      pull_number: 42,
      state: 'closed',
    });

    expect(octokit.rest.git.deleteRef).toHaveBeenCalledWith({
      owner: 'testowner',
      repo: 'testrepo',
      ref: 'heads/cmake-depcheck/update-fmt-a1b2c3d4',
    });
  });

  it('includes replacement PR URL when provided', async () => {
    await closeStalePr(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      octokit as any,
      ctx,
      pr,
      'Moved.',
      'https://github.com/testowner/testrepo/pull/99',
    );

    const comment = octokit.rest.issues.createComment.mock.calls[0][0].body as string;
    expect(comment).toContain('Replaced by https://github.com/testowner/testrepo/pull/99');
  });

  it('gracefully handles branch already deleted', async () => {
    octokit.rest.git.deleteRef.mockRejectedValue({ status: 404 });

    // Should not throw
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await closeStalePr(octokit as any, ctx, pr, 'Gone.');

    expect(octokit.rest.issues.createComment).toHaveBeenCalled();
    expect(octokit.rest.pulls.update).toHaveBeenCalled();
  });
});
