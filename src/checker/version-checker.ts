import { FetchContentDependency } from '../parser/types.js';
import { UpdateCheckResult } from './types.js';
import { fetchRemoteTags } from './git-tags.js';
import { findLatestVersion } from './version-compare.js';

async function pool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const executing = new Set<Promise<void>>();
  for (const item of items) {
    const p = fn(item).then(() => {
      executing.delete(p);
    });
    executing.add(p);
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}

/**
 * Check all dependencies for available updates.
 * Pre-classifies skip cases, deduplicates by repo URL, and fetches tags concurrently.
 */
export async function checkForUpdates(
  deps: FetchContentDependency[],
  onProgress?: (completed: number, total: number) => void,
): Promise<UpdateCheckResult[]> {
  const results = new Map<FetchContentDependency, UpdateCheckResult>();

  // Pre-classify deps that don't need a network check
  const needsCheck: FetchContentDependency[] = [];
  for (const dep of deps) {
    if (dep.sourceType === 'url') {
      results.set(dep, { dep, status: 'unsupported' });
    } else if (!dep.gitTag) {
      results.set(dep, { dep, status: 'unpinned' });
    } else if (dep.gitTagIsSha) {
      results.set(dep, { dep, status: 'pinned' });
    } else if (dep.gitTag.includes('${')) {
      results.set(dep, { dep, status: 'unresolved-variable' });
    } else if (!dep.gitRepository) {
      results.set(dep, { dep, status: 'check-failed', error: 'No git repository URL' });
    } else {
      needsCheck.push(dep);
    }
  }

  // Deduplicate by repo URL
  const repoToDeps = new Map<string, FetchContentDependency[]>();
  for (const dep of needsCheck) {
    const url = dep.gitRepository!;
    const group = repoToDeps.get(url);
    if (group) {
      group.push(dep);
    } else {
      repoToDeps.set(url, [dep]);
    }
  }

  // Fetch tags for each unique repo with concurrency limit
  const repoTags = new Map<string, string[]>();
  const repoErrors = new Map<string, string>();
  let completed = 0;
  const totalRepos = repoToDeps.size;

  await pool([...repoToDeps.keys()], 4, async (repoUrl) => {
    try {
      const tags = await fetchRemoteTags(repoUrl);
      repoTags.set(repoUrl, tags);
    } catch (err) {
      repoErrors.set(repoUrl, err instanceof Error ? err.message : String(err));
    }
    completed++;
    onProgress?.(completed, totalRepos);
  });

  // Map results back to each dependency
  for (const dep of needsCheck) {
    const url = dep.gitRepository!;
    const error = repoErrors.get(url);
    if (error) {
      results.set(dep, { dep, status: 'check-failed', error });
      continue;
    }

    const tags = repoTags.get(url) ?? [];
    const versionResult = findLatestVersion(dep.gitTag!, tags);

    if (!versionResult) {
      results.set(dep, { dep, status: 'check-failed', error: 'No comparable tags found' });
      continue;
    }

    // String equality works here: findLatestVersion returns the original currentTag
    // verbatim when up-to-date, and normalizes prefix style (v/no-v) to match it on updates.
    if (versionResult.latest === dep.gitTag) {
      results.set(dep, { dep, status: 'up-to-date', latestVersion: versionResult.latest });
    } else {
      results.set(dep, {
        dep,
        status: 'update-available',
        latestVersion: versionResult.latest,
        updateType: versionResult.updateType,
      });
    }
  }

  // Preserve original dep order
  return deps.map((dep) => results.get(dep)!);
}
