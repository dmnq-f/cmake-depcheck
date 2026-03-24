import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchReleaseNotes } from '../../src/pr/release-notes.js';

vi.mock('@actions/core', () => ({
  warning: vi.fn(),
}));

function createMockOctokit() {
  return {
    rest: {
      repos: {
        getReleaseByTag: vi.fn(),
      },
    },
  };
}

type MockOctokit = ReturnType<typeof createMockOctokit>;

function makeRelease(tag: string, body: string, name?: string) {
  return {
    data: {
      tag_name: tag,
      name: name ?? tag,
      body,
      html_url: `https://github.com/owner/repo/releases/tag/${tag}`,
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asOctokit = (mock: MockOctokit) => mock as any;

describe('fetchReleaseNotes', () => {
  let octokit: MockOctokit;

  beforeEach(() => {
    octokit = createMockOctokit();
    vi.resetAllMocks();
  });

  it('returns markdown with details blocks for each release (happy path)', async () => {
    octokit.rest.repos.getReleaseByTag
      .mockResolvedValueOnce(makeRelease('v1.3.0', 'Notes for 1.3'))
      .mockResolvedValueOnce(makeRelease('v1.2.0', 'Notes for 1.2'))
      .mockResolvedValueOnce(makeRelease('v1.1.0', 'Notes for 1.1'));

    const result = await fetchReleaseNotes(
      asOctokit(octokit),
      'https://github.com/owner/repo.git',
      'v1.0.0',
      'v1.3.0',
      ['v1.3.0', 'v1.2.0', 'v1.1.0'],
    );

    expect(result).toContain('### Release Notes');
    expect(result).toContain('<code>v1.3.0</code>');
    expect(result).toContain('<code>v1.2.0</code>');
    expect(result).toContain('<code>v1.1.0</code>');
    expect(result).toContain('Notes for 1.3');
    expect(result).toContain('Notes for 1.2');
    expect(result).toContain('Notes for 1.1');
    expect(result).toContain(
      '[Full changelog](https://github.com/owner/repo/compare/v1.0.0...v1.3.0)',
    );
  });

  it('skips 404 releases and shows the rest', async () => {
    octokit.rest.repos.getReleaseByTag
      .mockResolvedValueOnce(makeRelease('v1.3.0', 'Notes for 1.3'))
      .mockRejectedValueOnce({ status: 404 })
      .mockResolvedValueOnce(makeRelease('v1.1.0', 'Notes for 1.1'));

    const result = await fetchReleaseNotes(
      asOctokit(octokit),
      'https://github.com/owner/repo.git',
      'v1.0.0',
      'v1.3.0',
      ['v1.3.0', 'v1.2.0', 'v1.1.0'],
    );

    expect(result).toContain('### Release Notes');
    expect(result).toContain('<code>v1.3.0</code>');
    expect(result).not.toContain('<code>v1.2.0</code>');
    expect(result).toContain('<code>v1.1.0</code>');
  });

  it('returns only compare link when all releases are 404', async () => {
    octokit.rest.repos.getReleaseByTag
      .mockRejectedValueOnce({ status: 404 })
      .mockRejectedValueOnce({ status: 404 });

    const result = await fetchReleaseNotes(
      asOctokit(octokit),
      'https://github.com/owner/repo.git',
      'v1.0.0',
      'v1.2.0',
      ['v1.2.0', 'v1.1.0'],
    );

    expect(result).not.toContain('### Release Notes');
    expect(result).toContain(
      '[Full changelog](https://github.com/owner/repo/compare/v1.0.0...v1.2.0)',
    );
  });

  it('shows truncation notice when more than 5 intermediate tags', async () => {
    const tags = ['v1.7.0', 'v1.6.0', 'v1.5.0', 'v1.4.0', 'v1.3.0', 'v1.2.0', 'v1.1.0'];

    for (let i = 0; i < 5; i++) {
      octokit.rest.repos.getReleaseByTag.mockResolvedValueOnce(
        makeRelease(tags[i], `Notes for ${tags[i]}`),
      );
    }

    const result = await fetchReleaseNotes(
      asOctokit(octokit),
      'https://github.com/owner/repo.git',
      'v1.0.0',
      'v1.7.0',
      tags,
    );

    expect(result).toContain('Showing 5 of 7 releases');
    expect(result).toContain('[full changelog]');
    expect(octokit.rest.repos.getReleaseByTag).toHaveBeenCalledTimes(5);
  });

  it('truncates long release bodies with a link', async () => {
    const longBody = 'x'.repeat(2500);
    octokit.rest.repos.getReleaseByTag.mockResolvedValueOnce(makeRelease('v2.0.0', longBody));

    const result = await fetchReleaseNotes(
      asOctokit(octokit),
      'https://github.com/owner/repo.git',
      'v1.0.0',
      'v2.0.0',
      ['v2.0.0'],
    );

    expect(result).not.toContain('x'.repeat(2500));
    expect(result).toContain('see full release');
  });

  it('returns empty string for non-GitHub URL', async () => {
    const result = await fetchReleaseNotes(
      asOctokit(octokit),
      'https://gitlab.com/owner/repo',
      'v1.0.0',
      'v2.0.0',
      ['v2.0.0'],
    );

    expect(result).toBe('');
    expect(octokit.rest.repos.getReleaseByTag).not.toHaveBeenCalled();
  });

  it('skips releases with empty or null body', async () => {
    octokit.rest.repos.getReleaseByTag
      .mockResolvedValueOnce(makeRelease('v1.2.0', ''))
      .mockResolvedValueOnce({
        data: { tag_name: 'v1.1.0', name: 'v1.1.0', body: null, html_url: 'url' },
      });

    const result = await fetchReleaseNotes(
      asOctokit(octokit),
      'https://github.com/owner/repo.git',
      'v1.0.0',
      'v1.2.0',
      ['v1.2.0', 'v1.1.0'],
    );

    expect(result).not.toContain('### Release Notes');
    expect(result).not.toContain('<details>');
    expect(result).toContain('[Full changelog]');
  });

  it('skips non-404 API errors and shows remaining releases', async () => {
    octokit.rest.repos.getReleaseByTag
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockResolvedValueOnce(makeRelease('v1.1.0', 'Notes for 1.1'));

    const result = await fetchReleaseNotes(
      asOctokit(octokit),
      'https://github.com/owner/repo.git',
      'v1.0.0',
      'v1.2.0',
      ['v1.2.0', 'v1.1.0'],
    );

    expect(result).toContain('### Release Notes');
    expect(result).not.toContain('<code>v1.2.0</code>');
    expect(result).toContain('<code>v1.1.0</code>');
  });

  it('includes release name in summary when it differs from tag', async () => {
    octokit.rest.repos.getReleaseByTag.mockResolvedValueOnce(
      makeRelease('v2.0.0', 'Big release', 'Version 2.0 - The Big One'),
    );

    const result = await fetchReleaseNotes(
      asOctokit(octokit),
      'https://github.com/owner/repo.git',
      'v1.0.0',
      'v2.0.0',
      ['v2.0.0'],
    );

    expect(result).toContain('Version 2.0 - The Big One');
  });
});
