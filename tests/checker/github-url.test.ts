import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractGitHubUrlInfo, buildUpdatedUrl, verifyUrlExists } from '../../src/checker/github-url.js';

describe('extractGitHubUrlInfo', () => {
  describe('releases-download pattern', () => {
    it('extracts info from a standard releases URL', () => {
      const info = extractGitHubUrlInfo(
        'https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz',
      );
      expect(info).toEqual({
        repoUrl: 'https://github.com/nlohmann/json.git',
        tag: 'v3.11.3',
        pattern: 'releases-download',
        owner: 'nlohmann',
        repo: 'json',
        filename: 'json.tar.xz',
      });
    });

    it('works with www.github.com', () => {
      const info = extractGitHubUrlInfo(
        'https://www.github.com/owner/repo/releases/download/v1.0/file.tar.gz',
      );
      expect(info).not.toBeNull();
      expect(info!.owner).toBe('owner');
      expect(info!.tag).toBe('v1.0');
    });

    it('handles tags without v prefix', () => {
      const info = extractGitHubUrlInfo(
        'https://github.com/owner/repo/releases/download/1.2.3/file.zip',
      );
      expect(info!.tag).toBe('1.2.3');
    });

    it('handles non-semver tags', () => {
      const info = extractGitHubUrlInfo(
        'https://github.com/owner/repo/releases/download/release-2.0/file.tar.gz',
      );
      expect(info!.tag).toBe('release-2.0');
    });
  });

  describe('archive-refs-tags pattern', () => {
    it('extracts info with .tar.gz extension', () => {
      const info = extractGitHubUrlInfo(
        'https://github.com/owner/repo/archive/refs/tags/v1.2.3.tar.gz',
      );
      expect(info).toEqual({
        repoUrl: 'https://github.com/owner/repo.git',
        tag: 'v1.2.3',
        pattern: 'archive-refs-tags',
        owner: 'owner',
        repo: 'repo',
        archiveExt: '.tar.gz',
      });
    });

    it('handles .tar.bz2 extension', () => {
      const info = extractGitHubUrlInfo(
        'https://github.com/owner/repo/archive/refs/tags/v1.2.3.tar.bz2',
      );
      expect(info!.archiveExt).toBe('.tar.bz2');
    });

    it('handles .tar.xz extension', () => {
      const info = extractGitHubUrlInfo(
        'https://github.com/owner/repo/archive/refs/tags/v1.2.3.tar.xz',
      );
      expect(info!.archiveExt).toBe('.tar.xz');
    });
  });

  describe('archive pattern', () => {
    it('extracts info with .zip extension', () => {
      const info = extractGitHubUrlInfo(
        'https://github.com/owner/repo/archive/v1.2.3.zip',
      );
      expect(info).toEqual({
        repoUrl: 'https://github.com/owner/repo.git',
        tag: 'v1.2.3',
        pattern: 'archive',
        owner: 'owner',
        repo: 'repo',
        archiveExt: '.zip',
      });
    });

    it('extracts SHA ref from archive URL', () => {
      const sha = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
      const info = extractGitHubUrlInfo(
        `https://github.com/owner/repo/archive/${sha}.tar.gz`,
      );
      expect(info!.tag).toBe(sha);
      expect(info!.pattern).toBe('archive');
    });
  });

  describe('should return null', () => {
    it('non-GitHub URL', () => {
      expect(extractGitHubUrlInfo('https://example.com/some/file.tar.gz')).toBeNull();
    });

    it('GitLab URL', () => {
      expect(
        extractGitHubUrlInfo('https://gitlab.com/owner/repo/archive/v1.0.tar.gz'),
      ).toBeNull();
    });

    it('GitHub blob URL (not a download pattern)', () => {
      expect(
        extractGitHubUrlInfo('https://github.com/owner/repo/blob/main/README.md'),
      ).toBeNull();
    });

    it('GitHub repo page (no tag)', () => {
      expect(extractGitHubUrlInfo('https://github.com/owner/repo')).toBeNull();
    });

    it('empty string', () => {
      expect(extractGitHubUrlInfo('')).toBeNull();
    });

    it('malformed URL', () => {
      expect(extractGitHubUrlInfo('not-a-url')).toBeNull();
    });
  });
});

describe('buildUpdatedUrl', () => {
  it('releases-download: updates tag in path and filename', () => {
    const info = extractGitHubUrlInfo(
      'https://github.com/nlohmann/json/releases/download/v3.11.3/json-v3.11.3.tar.xz',
    )!;
    const url = buildUpdatedUrl(info, 'v3.12.0');
    expect(url).toBe(
      'https://github.com/nlohmann/json/releases/download/v3.12.0/json-v3.12.0.tar.xz',
    );
  });

  it('releases-download: preserves version-independent filename', () => {
    const info = extractGitHubUrlInfo(
      'https://github.com/nlohmann/json/releases/download/v3.11.3/source.tar.xz',
    )!;
    const url = buildUpdatedUrl(info, 'v3.12.0');
    expect(url).toBe(
      'https://github.com/nlohmann/json/releases/download/v3.12.0/source.tar.xz',
    );
  });

  it('archive-refs-tags: replaces tag and preserves extension', () => {
    const info = extractGitHubUrlInfo(
      'https://github.com/owner/repo/archive/refs/tags/v1.2.3.tar.gz',
    )!;
    const url = buildUpdatedUrl(info, 'v1.3.0');
    expect(url).toBe('https://github.com/owner/repo/archive/refs/tags/v1.3.0.tar.gz');
  });

  it('archive: replaces tag and preserves extension', () => {
    const info = extractGitHubUrlInfo(
      'https://github.com/owner/repo/archive/v1.2.3.zip',
    )!;
    const url = buildUpdatedUrl(info, 'v1.3.0');
    expect(url).toBe('https://github.com/owner/repo/archive/v1.3.0.zip');
  });

  it('preserves multi-part extensions (.tar.bz2)', () => {
    const info = extractGitHubUrlInfo(
      'https://github.com/owner/repo/archive/refs/tags/v1.0.tar.bz2',
    )!;
    const url = buildUpdatedUrl(info, 'v2.0');
    expect(url).toBe('https://github.com/owner/repo/archive/refs/tags/v2.0.tar.bz2');
  });
});

describe('verifyUrlExists', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns true for 200 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    expect(await verifyUrlExists('https://example.com/file')).toBe(true);
  });

  it('returns false for 404 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    expect(await verifyUrlExists('https://example.com/file')).toBe(false);
  });

  it('returns false for 410 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 410 });
    expect(await verifyUrlExists('https://example.com/file')).toBe(false);
  });

  it('throws on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'));
    await expect(verifyUrlExists('https://example.com/file')).rejects.toThrow('network error');
  });

  it('throws on unexpected status code', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(verifyUrlExists('https://example.com/file')).rejects.toThrow(
      'Unexpected HTTP status 500',
    );
  });

  it('uses HEAD method with timeout', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    globalThis.fetch = mockFetch;
    await verifyUrlExists('https://example.com/file');
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/file', {
      method: 'HEAD',
      signal: expect.any(AbortSignal),
    });
  });
});
