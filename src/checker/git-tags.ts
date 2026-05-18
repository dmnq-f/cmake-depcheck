import { execFile } from 'node:child_process';

/**
 * A tag from `git ls-remote --tags` paired with its commit SHA.
 *
 * For annotated tags the commit SHA is the dereferenced (`refs/tags/X^{}`)
 * SHA — the commit users land on after `git clone --branch X` — not the
 * tag-object SHA. For lightweight tags it's the only SHA present.
 */
export interface TagInfo {
  /** Tag name with the `refs/tags/` prefix and any `^{}` suffix stripped. */
  tag: string;
  /** Commit SHA the tag points to (40-char hex). */
  commitSha: string;
}

/**
 * Parse raw `git ls-remote --tags` output into tag/commit-SHA pairs.
 *
 * For each tag, the dereferenced (`refs/tags/X^{}`) entry wins over the bare
 * `refs/tags/X` entry — annotated tags report the tag-object SHA on the bare
 * ref, but we want the commit SHA. Lightweight tags only have the bare entry,
 * which is already a commit SHA.
 */
export function parseGitLsRemoteOutput(raw: string): TagInfo[] {
  if (!raw.trim()) return [];

  const order: string[] = [];
  const byTag = new Map<string, { commitSha: string; dereferenced: boolean }>();

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length < 2) continue;
    const sha = parts[0];
    const ref = parts[1];
    if (!ref.startsWith('refs/tags/')) continue;
    const dereferenced = ref.endsWith('^{}');
    const tag = ref.replace('refs/tags/', '').replace(/\^\{\}$/, '');

    const existing = byTag.get(tag);
    if (!existing) {
      byTag.set(tag, { commitSha: sha, dereferenced });
      order.push(tag);
    } else if (dereferenced) {
      existing.commitSha = sha;
      existing.dereferenced = true;
    }
  }

  return order.map((tag) => ({ tag, commitSha: byTag.get(tag)!.commitSha }));
}

/**
 * Fetch all tags (paired with commit SHAs) from a remote git repository via
 * `git ls-remote --tags`. Times out after 15 seconds.
 */
export function fetchRemoteTags(repoUrl: string): Promise<TagInfo[]> {
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
