import * as core from '@actions/core';
import type { getOctokit } from '@actions/github';
import { extractGitHubOwnerRepo } from '../checker/github-url.js';

type Octokit = ReturnType<typeof getOctokit>;

const MAX_RELEASES = 5;
const MAX_BODY_LENGTH = 2000;

interface ReleaseInfo {
  tag: string;
  name: string | null;
  body: string;
  htmlUrl: string;
}

/**
 * Fetch release notes for intermediate versions and format as markdown.
 *
 * Determines owner/repo from the provided repository or download URL using
 * the generalized `extractGitHubOwnerRepo` function. This means it works for
 * both git deps (gitRepository URL) and URL deps (download URL pointing to GitHub).
 *
 * Returns a markdown string with collapsible <details> blocks for each release,
 * a compare link, and a truncation notice if applicable.
 * Returns an empty string if no release info can be gathered.
 */
export async function fetchReleaseNotes(
  octokit: Octokit,
  repoUrl: string,
  currentTag: string,
  latestTag: string,
  intermediateTags: string[],
): Promise<string> {
  const ownerRepo = extractGitHubOwnerRepo(repoUrl);
  if (!ownerRepo) return '';

  const { owner, repo } = ownerRepo;
  const compareUrl = `https://github.com/${owner}/${repo}/compare/${currentTag}...${latestTag}`;

  const tagsToFetch = intermediateTags.slice(0, MAX_RELEASES);
  const releases: ReleaseInfo[] = [];

  for (const tag of tagsToFetch) {
    try {
      const { data } = await octokit.rest.repos.getReleaseByTag({ owner, repo, tag });
      let body = data.body?.trim() ?? '';
      if (!body) continue;
      if (body.length > MAX_BODY_LENGTH) {
        body = body.slice(0, MAX_BODY_LENGTH) + `\u2026 [see full release](${data.html_url})`;
      }
      releases.push({
        tag,
        name: data.name ?? null,
        body,
        htmlUrl: data.html_url,
      });
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'status' in err && err.status === 404) {
        continue;
      }
      core.warning(
        `Failed to fetch release for tag ${tag}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const parts: string[] = [];

  if (releases.length > 0) {
    parts.push('### Release Notes', '');
    for (const release of releases) {
      const summaryName =
        release.name && release.name !== release.tag ? ` \u2014 ${release.name}` : '';
      parts.push(
        `<details><summary><code>${release.tag}</code>${summaryName}</summary>`,
        '',
        release.body,
        '',
        '</details>',
        '',
      );
    }

    if (intermediateTags.length > MAX_RELEASES) {
      parts.push(
        `> **Note:** Showing ${MAX_RELEASES} of ${intermediateTags.length} releases. See the [full changelog](${compareUrl}) for all changes.`,
        '',
      );
    }
  }

  parts.push(`[Full changelog](${compareUrl})`);

  return parts.join('\n');
}
