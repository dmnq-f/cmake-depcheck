import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/pr/release-notes.js', () => ({
  fetchReleaseNotes: vi.fn(),
}));

import { createUpdatePr, type GitHubContext } from '../../src/pr/github.js';
import { fetchReleaseNotes } from '../../src/pr/release-notes.js';
import type { UpdateCheckResult } from '../../src/checker/types.js';
import type { FileEdit } from '../../src/pr/edit-compute.js';
import type { FetchContentDependency } from '../../src/parser/types.js';

const mockedFetchReleaseNotes = vi.mocked(fetchReleaseNotes);

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
  line: 1,
  endLine: 4,
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
    mockedFetchReleaseNotes.mockReset();
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

    // File content — GIT_TAG is on line 3, after the FetchContent_Declare start (edit.line=1)
    const content = Buffer.from(
      'FetchContent_Declare(\n  freetype\n  GIT_TAG v10.2.1\n)\n',
    ).toString('base64');
    octokit.rest.repos.getContent.mockResolvedValue({
      data: { content, sha: 'file-sha-456' },
    });

    // Branch creation
    octokit.rest.git.createRef.mockResolvedValue({});

    // File update
    octokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});

    // Label
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

  it('finds GIT_TAG on a line after startLine within the block', async () => {
    octokit.rest.git.getRef
      .mockRejectedValueOnce({ status: 404 })
      .mockResolvedValueOnce({ data: { object: { sha: 'base-sha' } } });

    // GIT_TAG is on line 4, but edit.line (startLine) is 1
    const fileContent = [
      'FetchContent_Declare(',
      '  freetype',
      '  GIT_REPOSITORY https://github.com/freetype/freetype.git',
      '  GIT_TAG VER-2-14-2',
      ')',
    ].join('\n');
    const content = Buffer.from(fileContent).toString('base64');
    octokit.rest.repos.getContent.mockResolvedValue({
      data: { content, sha: 'file-sha' },
    });
    octokit.rest.git.createRef.mockResolvedValue({});
    octokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
    octokit.rest.issues.addLabels.mockResolvedValue({});
    octokit.rest.pulls.create.mockResolvedValue({
      data: { number: 10, html_url: 'https://github.com/testowner/testrepo/pull/10' },
    });

    const depEdit: FileEdit = {
      file: 'CMakeLists.txt',
      line: 1,
      endLine: 5,
      oldText: 'VER-2-14-2',
      newText: 'VER-2-14-3',
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await createUpdatePr(octokit as any, ctx, makeUpdateResult(), depEdit);

    expect(result.prNumber).toBe(10);

    // Verify the committed content has the replacement on the correct line
    const committedContent = Buffer.from(
      octokit.rest.repos.createOrUpdateFileContents.mock.calls[0][0].content,
      'base64',
    ).toString('utf-8');
    expect(committedContent).toContain('GIT_TAG VER-2-14-3');
    expect(committedContent).not.toContain('VER-2-14-2');
  });

  it('does not match version string outside the block range', async () => {
    octokit.rest.git.getRef
      .mockRejectedValueOnce({ status: 404 })
      .mockResolvedValueOnce({ data: { object: { sha: 'base-sha' } } });

    // Version "1.2.3" appears on line 1 (a comment), but the block is lines 3-6.
    // The search should NOT match the comment.
    const fileContent = [
      '# Using version 1.2.3 of somelib', // line 1
      '', // line 2
      'FetchContent_Declare(', // line 3
      '  somelib', // line 4
      '  GIT_REPOSITORY https://x.git', // line 5
      '  GIT_TAG 1.2.3', // line 6
      ')', // line 7
    ].join('\n');
    const content = Buffer.from(fileContent).toString('base64');
    octokit.rest.repos.getContent.mockResolvedValue({
      data: { content, sha: 'file-sha' },
    });
    octokit.rest.git.createRef.mockResolvedValue({});
    octokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
    octokit.rest.issues.addLabels.mockResolvedValue({});
    octokit.rest.pulls.create.mockResolvedValue({
      data: { number: 11, html_url: 'url' },
    });

    const depEdit: FileEdit = {
      file: 'CMakeLists.txt',
      line: 3,
      endLine: 7,
      oldText: '1.2.3',
      newText: '2.0.0',
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await createUpdatePr(octokit as any, ctx, makeUpdateResult(), depEdit);
    expect(result.prNumber).toBe(11);

    // The comment on line 1 should be untouched
    const committedContent = Buffer.from(
      octokit.rest.repos.createOrUpdateFileContents.mock.calls[0][0].content,
      'base64',
    ).toString('utf-8');
    expect(committedContent).toContain('# Using version 1.2.3 of somelib');
    expect(committedContent).toContain('GIT_TAG 2.0.0');
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

    expect(result.error).toMatch(/Could not find.*between lines/);
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

  it('does not call ensureLabel (handled by orchestrator)', async () => {
    octokit.rest.git.getRef
      .mockRejectedValueOnce({ status: 404 })
      .mockResolvedValueOnce({ data: { object: { sha: 'base-sha' } } });

    const content = Buffer.from('GIT_TAG v10.2.1\n').toString('base64');
    octokit.rest.repos.getContent.mockResolvedValue({
      data: { content, sha: 'file-sha' },
    });
    octokit.rest.git.createRef.mockResolvedValue({});
    octokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
    octokit.rest.issues.addLabels.mockResolvedValue({});
    octokit.rest.pulls.create.mockResolvedValue({
      data: { number: 1, html_url: 'https://github.com/testowner/testrepo/pull/1' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createUpdatePr(octokit as any, ctx, makeUpdateResult(), edit);

    expect(octokit.rest.issues.getLabel).not.toHaveBeenCalled();
    expect(octokit.rest.issues.createLabel).not.toHaveBeenCalled();
  });

  describe('release notes in PR body', () => {
    function setupHappyPath(octokit: MockOctokit) {
      octokit.rest.git.getRef
        .mockRejectedValueOnce({ status: 404 })
        .mockResolvedValueOnce({ data: { object: { sha: 'base-sha' } } });

      const content = Buffer.from('GIT_TAG v10.2.1\n').toString('base64');
      octokit.rest.repos.getContent.mockResolvedValue({
        data: { content, sha: 'file-sha' },
      });
      octokit.rest.git.createRef.mockResolvedValue({});
      octokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({});
      octokit.rest.issues.addLabels.mockResolvedValue({});
      octokit.rest.pulls.create.mockResolvedValue({
        data: { number: 99, html_url: 'https://github.com/testowner/testrepo/pull/99' },
      });
    }

    it('includes release notes when intermediateTags is present', async () => {
      setupHappyPath(octokit);
      mockedFetchReleaseNotes.mockResolvedValueOnce('### Release Notes\n\nSome notes');

      const dep = makeUpdateResult({ intermediateTags: ['v12.1.0', 'v11.0.0'] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await createUpdatePr(octokit as any, ctx, dep, edit);

      const body = octokit.rest.pulls.create.mock.calls[0][0].body as string;
      expect(body).toContain('### Release Notes');
      expect(body).toContain('Some notes');
    });

    it('body is unchanged when intermediateTags is absent', async () => {
      setupHappyPath(octokit);

      const dep = makeUpdateResult();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await createUpdatePr(octokit as any, ctx, dep, edit);

      const body = octokit.rest.pulls.create.mock.calls[0][0].body as string;
      expect(body).not.toContain('Release Notes');
      expect(mockedFetchReleaseNotes).not.toHaveBeenCalled();
    });

    it('body is unchanged when fetchReleaseNotes returns empty string', async () => {
      setupHappyPath(octokit);
      mockedFetchReleaseNotes.mockResolvedValueOnce('');

      const dep = makeUpdateResult({ intermediateTags: ['v12.1.0'] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await createUpdatePr(octokit as any, ctx, dep, edit);

      const body = octokit.rest.pulls.create.mock.calls[0][0].body as string;
      expect(body).not.toContain('Release Notes');
      // No extra blank lines between table and footer
      expect(body).toContain('|\n\n---');
    });

    it('PR creation succeeds when fetchReleaseNotes throws', async () => {
      setupHappyPath(octokit);
      mockedFetchReleaseNotes.mockRejectedValueOnce(new Error('unexpected'));

      const dep = makeUpdateResult({ intermediateTags: ['v12.1.0'] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await createUpdatePr(octokit as any, ctx, dep, edit);

      expect(result.prNumber).toBe(99);
    });
  });

  it('ensureLabel creates label when it does not exist', async () => {
    const { ensureLabel } = await import('../../src/pr/github.js');

    octokit.rest.issues.getLabel.mockRejectedValue({ status: 404 });
    octokit.rest.issues.createLabel.mockResolvedValue({});

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ensureLabel(octokit as any, ctx);

    expect(octokit.rest.issues.createLabel).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'dependencies' }),
    );
  });
});
