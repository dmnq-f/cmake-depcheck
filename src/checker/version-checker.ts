import { FetchContentDependency } from '../parser/types.js';
import { UpdateCheckResult } from './types.js';
import { fetchRemoteTags } from './git-tags.js';
import { findLatestVersion } from './version-compare.js';
import {
  extractGitHubUrlInfo,
  buildUpdatedUrl,
  verifyUrlExists,
  GitHubUrlInfo,
} from './github-url.js';

const SHA_PATTERN = /^[0-9a-f]{40}$/i;

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

  // Track GitHub URL info for URL deps that need checking
  const urlGitHubInfo = new Map<FetchContentDependency, GitHubUrlInfo>();

  // Pre-classify deps that don't need a network check
  const needsCheck: FetchContentDependency[] = [];
  for (const dep of deps) {
    if (dep.sourceType === 'url') {
      const ghInfo = dep.url ? extractGitHubUrlInfo(dep.url) : null;
      if (!ghInfo) {
        results.set(dep, { dep, status: 'unsupported' });
      } else if (SHA_PATTERN.test(ghInfo.tag)) {
        results.set(dep, { dep, status: 'pinned', resolvedVersion: ghInfo.tag });
      } else {
        urlGitHubInfo.set(dep, ghInfo);
        needsCheck.push(dep);
      }
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
    const ghInfo = urlGitHubInfo.get(dep);
    const url = ghInfo ? ghInfo.repoUrl : dep.gitRepository!;
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
    const ghInfo = urlGitHubInfo.get(dep);
    const repoUrl = ghInfo ? ghInfo.repoUrl : dep.gitRepository!;
    const currentTag = ghInfo ? ghInfo.tag : dep.gitTag!;

    const error = repoErrors.get(repoUrl);
    if (error) {
      results.set(dep, {
        dep,
        status: 'check-failed',
        error,
        ...(ghInfo && { resolvedVersion: ghInfo.tag }),
      });
      continue;
    }

    const tags = repoTags.get(repoUrl) ?? [];
    const versionResult = findLatestVersion(currentTag, tags);

    if (!versionResult) {
      results.set(dep, {
        dep,
        status: 'check-failed',
        error: 'No comparable tags found',
        ...(ghInfo && { resolvedVersion: ghInfo.tag }),
      });
      continue;
    }

    if (versionResult.latest === currentTag) {
      results.set(dep, {
        dep,
        status: 'up-to-date',
        latestVersion: versionResult.latest,
        ...(ghInfo && { resolvedVersion: ghInfo.tag }),
      });
    } else if (ghInfo) {
      // URL dep with an available update — build the updated URL
      const candidateUrl = buildUpdatedUrl(ghInfo, versionResult.latest);

      // Validate releases-download URLs with HEAD request
      if (ghInfo.pattern === 'releases-download') {
        try {
          const exists = await verifyUrlExists(candidateUrl);
          if (!exists) {
            results.set(dep, {
              dep,
              status: 'check-failed',
              error: `Release asset not found at expected URL for ${versionResult.latest}`,
              resolvedVersion: ghInfo.tag,
            });
            continue;
          }
        } catch (err) {
          results.set(dep, {
            dep,
            status: 'check-failed',
            error: err instanceof Error ? err.message : String(err),
            resolvedVersion: ghInfo.tag,
          });
          continue;
        }
      }

      results.set(dep, {
        dep,
        status: 'update-available',
        latestVersion: versionResult.latest,
        updateType: versionResult.updateType,
        updatedUrl: candidateUrl,
        resolvedVersion: ghInfo.tag,
      });
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
