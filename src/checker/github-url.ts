export type GitHubUrlPattern = 'releases-download' | 'archive-refs-tags' | 'archive';

export interface GitHubUrlInfo {
  /** Inferred git repository URL for ls-remote */
  repoUrl: string;
  /** Tag extracted from the URL path */
  tag: string;
  /** Which URL pattern was matched */
  pattern: GitHubUrlPattern;
  /** GitHub owner */
  owner: string;
  /** GitHub repo name */
  repo: string;
  /** Original filename (releases-download only) */
  filename?: string;
  /** Archive extension including dot (archive patterns only, e.g. '.tar.gz') */
  archiveExt?: string;
}

const COMPOUND_EXTENSIONS = ['.tar.gz', '.tar.bz2', '.tar.xz'];

/**
 * Extract the archive extension from a filename, handling compound extensions.
 */
function extractArchiveExt(filename: string): string | null {
  for (const ext of COMPOUND_EXTENSIONS) {
    if (filename.endsWith(ext)) return ext;
  }
  const dot = filename.lastIndexOf('.');
  if (dot === -1) return null;
  return filename.slice(dot);
}

/**
 * Attempt to extract GitHub repository and tag from a download URL.
 * Returns null for non-GitHub URLs or unrecognized path patterns.
 */
export function extractGitHubUrlInfo(url: string): GitHubUrlInfo | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.hostname !== 'github.com' && parsed.hostname !== 'www.github.com') {
    return null;
  }

  // Split pathname into segments, filtering empty strings from leading/trailing slashes
  const segments = parsed.pathname.split('/').filter(Boolean);

  // Need at least owner + repo + something
  if (segments.length < 3) return null;

  const owner = segments[0];
  const repo = segments[1];
  const repoUrl = `https://github.com/${owner}/${repo}.git`;

  // Pattern: /owner/repo/releases/download/tag/filename
  if (segments.length >= 6 && segments[2] === 'releases' && segments[3] === 'download') {
    const tag = segments[4];
    const filename = segments.slice(5).join('/');
    return { repoUrl, tag, pattern: 'releases-download', owner, repo, filename };
  }

  // Pattern: /owner/repo/archive/refs/tags/tag.ext
  if (
    segments.length === 6 &&
    segments[2] === 'archive' &&
    segments[3] === 'refs' &&
    segments[4] === 'tags'
  ) {
    const fileWithExt = segments[5];
    const ext = extractArchiveExt(fileWithExt);
    if (!ext) return null;
    const tag = fileWithExt.slice(0, -ext.length);
    if (!tag) return null;
    return { repoUrl, tag, pattern: 'archive-refs-tags', owner, repo, archiveExt: ext };
  }

  // Pattern: /owner/repo/archive/tag.ext
  if (segments.length === 4 && segments[2] === 'archive') {
    const fileWithExt = segments[3];
    const ext = extractArchiveExt(fileWithExt);
    if (!ext) return null;
    const tag = fileWithExt.slice(0, -ext.length);
    if (!tag) return null;
    return { repoUrl, tag, pattern: 'archive', owner, repo, archiveExt: ext };
  }

  return null;
}

/**
 * Construct the download URL for a different tag.
 * For releases-download, replaces occurrences of the old tag in the filename.
 */
export function buildUpdatedUrl(info: GitHubUrlInfo, newTag: string): string {
  const base = `https://github.com/${info.owner}/${info.repo}`;

  switch (info.pattern) {
    case 'releases-download': {
      const filename = info.filename!.replaceAll(info.tag, newTag);
      return `${base}/releases/download/${newTag}/${filename}`;
    }
    case 'archive-refs-tags':
      return `${base}/archive/refs/tags/${newTag}${info.archiveExt}`;
    case 'archive':
      return `${base}/archive/${newTag}${info.archiveExt}`;
  }
}

/**
 * Verify that a URL is reachable via HTTP HEAD.
 * Returns true for 2xx, false for 404/410, throws on network errors.
 */
export async function verifyUrlExists(url: string): Promise<boolean> {
  const response = await fetch(url, {
    method: 'HEAD',
    signal: AbortSignal.timeout(10_000),
  });

  if (response.ok) return true;
  if (response.status === 404 || response.status === 410) return false;

  throw new Error(`Unexpected HTTP status ${response.status} for ${url}`);
}
