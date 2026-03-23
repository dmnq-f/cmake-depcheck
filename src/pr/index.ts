import * as path from 'node:path';
import * as core from '@actions/core';
import { getOctokit, context } from '@actions/github';
import type { UpdateCheckResult } from '../checker/types.js';
import type { VariableInfo } from '../scanner/chain-resolver.js';
import { computeEdit } from './edit-compute.js';
import { createUpdatePr, ensureLabel, type GitHubContext, type PrResult } from './github.js';

export type { PrResult } from './github.js';

export async function createPullRequests(
  results: UpdateCheckResult[],
  vars?: Map<string, VariableInfo>,
  token?: string,
  dryRun?: boolean,
): Promise<PrResult[]> {
  const updatable = results.filter((r) => r.status === 'update-available');

  if (updatable.length === 0) return [];

  if (!token) {
    core.warning('No token provided for PR creation — skipping');
    return [];
  }

  const octokit = getOctokit(token);

  // Determine repo context
  const { data: repo } = await octokit.rest.repos.get({
    owner: context.repo.owner,
    repo: context.repo.repo,
  });

  const ctx: GitHubContext = {
    owner: context.repo.owner,
    repo: context.repo.repo,
    defaultBranch: repo.default_branch,
  };

  // Ensure 'dependencies' label exists once, before creating any PRs
  if (!dryRun) {
    await ensureLabel(octokit, ctx);
  }

  const prResults: PrResult[] = [];

  for (const result of updatable) {
    const edit = computeEdit(result, vars);

    if (!edit) {
      prResults.push({ name: result.dep.name, skipped: 'cannot compute edit' });
      continue;
    }

    if (dryRun) {
      core.info(
        `[dry-run] Would create PR for ${result.dep.name}: ` +
          `${edit.oldText} → ${edit.newText} in ${edit.file}`,
      );
      prResults.push({ name: result.dep.name, skipped: 'dry-run' });
      continue;
    }

    try {
      // Convert absolute file path to repo-relative path for the GitHub API
      const repoRelativePath = path.relative(process.cwd(), edit.file);
      const apiEdit = { ...edit, file: repoRelativePath };

      const prResult = await createUpdatePr(octokit, ctx, result, apiEdit);
      prResults.push(prResult);

      if (prResult.prNumber) {
        core.info(`Created PR #${prResult.prNumber} for ${result.dep.name}`);
      } else if (prResult.skipped) {
        core.info(`Skipped ${result.dep.name}: ${prResult.skipped}`);
      } else if (prResult.error) {
        core.warning(`Failed to create PR for ${result.dep.name}: ${prResult.error}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      core.warning(`Failed to create PR for ${result.dep.name}: ${message}`);
      prResults.push({ name: result.dep.name, error: message });
    }
  }

  return prResults;
}
