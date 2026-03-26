import type { getOctokit } from '@actions/github';
import type { GitHubContext } from './github.js';

type Octokit = ReturnType<typeof getOctokit>;

const BRANCH_PREFIX = 'cmake-depcheck/update-';

export interface ExistingPr {
  number: number;
  branch: string;
  title: string;
  body: string;
  url: string;
}

/**
 * List all open PRs whose head branch starts with `cmake-depcheck/update-`.
 */
export async function listDepcheckPrs(octokit: Octokit, ctx: GitHubContext): Promise<ExistingPr[]> {
  const allPrs = await octokit.paginate(octokit.rest.pulls.list, {
    owner: ctx.owner,
    repo: ctx.repo,
    state: 'open',
    per_page: 100,
  });

  return allPrs
    .filter((pr) => pr.head.ref.startsWith(BRANCH_PREFIX))
    .map((pr) => ({
      number: pr.number,
      branch: pr.head.ref,
      title: pr.title,
      body: pr.body ?? '',
      url: pr.html_url,
    }));
}

/**
 * Extract the dep name from a cmake-depcheck branch name.
 *
 * New-style: `cmake-depcheck/update-<depname>-<8 hex chars>`
 * Legacy:    `cmake-depcheck/update-<depname>-<version>`
 *
 * For new-style branches, the last segment is always exactly 8 hex characters.
 * For legacy branches (no 8-char hex suffix), the dep name is everything between
 * the prefix and the last `-<version>` segment.
 */
export function extractDepName(branch: string): string | null {
  if (!branch.startsWith(BRANCH_PREFIX)) return null;

  const rest = branch.slice(BRANCH_PREFIX.length);
  const lastDash = rest.lastIndexOf('-');
  if (lastDash === -1) return null;

  const name = rest.slice(0, lastDash);
  if (!name) return null;

  return name;
}

/**
 * Close a PR with a comment and delete its branch.
 * Branch deletion is best-effort (may already be deleted).
 */
export async function closeStalePr(
  octokit: Octokit,
  ctx: GitHubContext,
  pr: ExistingPr,
  reason: string,
  replacementPrUrl?: string,
): Promise<void> {
  let commentBody = `This PR is no longer tracked by cmake-depcheck.\n\n${reason}`;
  if (replacementPrUrl) {
    commentBody += `\n\nReplaced by ${replacementPrUrl}`;
  }

  await octokit.rest.issues.createComment({
    owner: ctx.owner,
    repo: ctx.repo,
    issue_number: pr.number,
    body: commentBody,
  });

  await octokit.rest.pulls.update({
    owner: ctx.owner,
    repo: ctx.repo,
    pull_number: pr.number,
    state: 'closed',
  });

  try {
    await octokit.rest.git.deleteRef({
      owner: ctx.owner,
      repo: ctx.repo,
      ref: `heads/${pr.branch}`,
    });
  } catch {
    // Branch may already be deleted — not fatal
  }
}
