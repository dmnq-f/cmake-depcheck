import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createUpdatePr, type GitHubContext } from '../../src/pr/github.js';
import type { UpdateCheckResult } from '../../src/checker/types.js';
import type { FileEdit } from '../../src/pr/edit-compute.js';
import type { FetchContentDependency } from '../../src/parser/types.js';

function makeDep(overrides: Partial<FetchContentDependency> = {}): FetchContentDependency {
  return {
    name: 'fmt',
    sourceType: 'git',
    gitRepository: 'https://github.com/fmtlib/fmt.git',
    gitTag: 'v10.2.1',
    location: {
      file: '/project/CMakeLists.txt',
      startLine: 10,
      endLine: 14,
    },
    ...overrides,
  };
}

function makeUpdateResult(overrides: Partial<UpdateCheckResult> = {}): UpdateCheckResult {
  return {
    dep: makeDep(),
    status: 'update-available',
    latestVersion: '12.1.0',
    updateType: 'major',
    ...overrides,
  };
}

const ctx: GitHubContext = {
  owner: 'testowner',
  repo: 'testrepo',
  defaultBranch: 'main',
};

const edit: FileEdit = {
  file: 'CMakeLists.txt',
  oldText: 'v10.2.1',
  newText: 'v12.1.0',
};

function createMockOctokit() {
  return {
    rest: {
      git: {
        getRef: vi.fn(),
        createRef: vi.fn(),
      },
      repos: {
        getContent: vi.fn(),
        createOrUpdateFileContents: vi.fn(),
      },
      pulls: {
        create: vi.fn(),
      },
      issues: {
        getLabel: vi.fn(),
        createLabel: vi.fn(),
        addLabels: vi.fn(),
      },
    },
  };
}

type MockOctokit = ReturnType<typeof createMockOctokit>;

describe('createUpdatePr', () => {
  let octokit: MockOctokit;

  beforeEach(() => {
    octokit = createMockOctokit();
  });

  it('skips when branch already exists', async () => {
    octokit.rest.git.getRef.mockResolvedValue({ data: { object: { sha: 'abc123' } } });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await createUpdatePr(octokit as any, ctx, makeUpdateResult(), edit);

    expect(result).toEqual({ name: 'fmt', skipped: 'branch exists' });
    expect(octokit.rest.repos.getContent).not.toHaveBeenCalled();
  });

  it('creates branch, commits, and opens PR on happy path', async () => {
    // Branch doesn't exist
    octokit.rest.git.getRef
      .mockRejectedValueOnce({ status: 404 }) // branch check
      .mockResolvedValueOnce({ data: { object: { sha: 'base-sha-123' } } }); // default branch HEAD

    // File content
    const content = Buffer.from('GIT_TAG v10.2.1\n').toString('base64');
    octokit.rest.repos.getContent.mockResolvedValue({
      data: { content, sha: 'file-sha-456' },
    });

    // Branch creation
    octokit.rest.git.createRef.mockResolvedValue({});

    // File update
    octokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});

    // Label
    octokit.rest.issues.getLabel.mockResolvedValue({});
    octokit.rest.issues.addLabels.mockResolvedValue({});

    // PR creation
    octokit.rest.pulls.create.mockResolvedValue({
      data: { number: 42, html_url: 'https://github.com/testowner/testrepo/pull/42' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await createUpdatePr(octokit as any, ctx, makeUpdateResult(), edit);

    expect(result).toEqual({
      name: 'fmt',
      prNumber: 42,
      prUrl: 'https://github.com/testowner/testrepo/pull/42',
    });

    // Verify branch was created from default branch HEAD
    expect(octokit.rest.git.createRef).toHaveBeenCalledWith({
      owner: 'testowner',
      repo: 'testrepo',
      ref: 'refs/heads/cmake-depcheck/update-fmt-12.1.0',
      sha: 'base-sha-123',
    });

    // Verify file was updated with correct content
    expect(octokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'CMakeLists.txt',
        branch: 'cmake-depcheck/update-fmt-12.1.0',
        sha: 'file-sha-456',
      }),
    );

    // Verify PR was opened
    expect(octokit.rest.pulls.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'chore(deps): update fmt to 12.1.0',
        head: 'cmake-depcheck/update-fmt-12.1.0',
        base: 'main',
      }),
    );
  });

  it('returns error when old text not found in file content', async () => {
    octokit.rest.git.getRef
      .mockRejectedValueOnce({ status: 404 })
      .mockResolvedValueOnce({ data: { object: { sha: 'base-sha' } } });

    const content = Buffer.from('GIT_TAG v9.9.9\n').toString('base64');
    octokit.rest.repos.getContent.mockResolvedValue({
      data: { content, sha: 'file-sha' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await createUpdatePr(octokit as any, ctx, makeUpdateResult(), edit);

    expect(result.error).toMatch(/Could not find/);
    expect(octokit.rest.git.createRef).not.toHaveBeenCalled();
  });

  it('returns error when file content cannot be read', async () => {
    octokit.rest.git.getRef
      .mockRejectedValueOnce({ status: 404 })
      .mockResolvedValueOnce({ data: { object: { sha: 'base-sha' } } });

    // Directory listing instead of file content
    octokit.rest.repos.getContent.mockResolvedValue({
      data: [{ name: 'file1' }],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await createUpdatePr(octokit as any, ctx, makeUpdateResult(), edit);

    expect(result.error).toMatch(/Could not read file/);
  });

  it('creates label when it does not exist', async () => {
    octokit.rest.git.getRef
      .mockRejectedValueOnce({ status: 404 })
      .mockResolvedValueOnce({ data: { object: { sha: 'base-sha' } } });

    const content = Buffer.from('GIT_TAG v10.2.1\n').toString('base64');
    octokit.rest.repos.getContent.mockResolvedValue({
      data: { content, sha: 'file-sha' },
    });
    octokit.rest.git.createRef.mockResolvedValue({});
    octokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
    octokit.rest.issues.getLabel.mockRejectedValue({ status: 404 });
    octokit.rest.issues.createLabel.mockResolvedValue({});
    octokit.rest.issues.addLabels.mockResolvedValue({});
    octokit.rest.pulls.create.mockResolvedValue({
      data: { number: 1, html_url: 'https://github.com/testowner/testrepo/pull/1' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createUpdatePr(octokit as any, ctx, makeUpdateResult(), edit);

    expect(octokit.rest.issues.createLabel).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'dependencies' }),
    );
  });
});
