import { execFile } from 'node:child_process';

/**
 * Parse raw `git ls-remote --tags` output into an array of tag names.
 * Filters out `^{}` dereference entries and deduplicates.
 */
export function parseGitLsRemoteOutput(raw: string): string[] {
  if (!raw.trim()) return [];

  const tags = new Set<string>();
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length < 2) continue;
    const ref = parts[1];
    if (!ref.startsWith('refs/tags/')) continue;
    if (ref.endsWith('^{}')) continue;
    tags.add(ref.replace('refs/tags/', ''));
  }

  return [...tags];
}

/**
 * Fetch all tags from a remote git repository via `git ls-remote --tags`.
 * Times out after 15 seconds.
 */
export function fetchRemoteTags(repoUrl: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    execFile(
      'git',
      ['ls-remote', '--tags', repoUrl],
      { signal: controller.signal },
      (err, stdout) => {
        clearTimeout(timeout);
        if (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            reject(new Error('git executable not found in PATH'));
          } else if (err.killed || controller.signal.aborted) {
            reject(new Error(`Timed out fetching tags from ${repoUrl}`));
          } else {
            reject(new Error(`Failed to fetch tags from ${repoUrl}: ${err.message}`));
          }
          return;
        }
        resolve(parseGitLsRemoteOutput(stdout));
      },
    );
  });
}
