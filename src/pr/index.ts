import * as path from 'node:path';
import * as core from '@actions/core';
import { getOctokit, context } from '@actions/github';
import type { UpdateCheckResult } from '../checker/types.js';
import type { VariableInfo } from '../scanner/chain-resolver.js';
import { computeEdit } from './edit-compute.js';
import { extractEditText } from './edit-marker.js';
import {
  createUpdatePr,
  branchName,
  ensureLabel,
  type GitHubContext,
  type PrResult,
} from './github.js';
import { listDepcheckPrs, extractDepName, closeStalePr } from './cleanup.js';
import { updateExistingPr } from './updater.js';

export type { PrResult } from './github.js';

export async function createPullRequests(
  results: UpdateCheckResult[],
  vars?: Map<string, VariableInfo>,
  token?: string,
  dryRun?: boolean,
  scannedDepNames?: Set<string>,
): Promise<PrResult[]> {
  const updatable = results.filter((r) => r.status === 'update-available');

  if (updatable.length === 0) return [];

  if (!token) {
    core.warning('No token provided for PR creation — skipping');
    return [];
  }

  const octokit = getOctokit(token);

  const { data: repo } = await octokit.rest.repos.get({
    owner: context.repo.owner,
    repo: context.repo.repo,
  });

  const ctx: GitHubContext = {
    owner: context.repo.owner,
    repo: context.repo.repo,
    defaultBranch: repo.default_branch,
  };

  // Fetch all existing cmake-depcheck PRs upfront
  const existingPrs = await listDepcheckPrs(octokit, ctx);
  const matchedBranches = new Set<string>();
  const prResults: PrResult[] = [];

  if (!dryRun) {
    await ensureLabel(octokit, ctx);
  }

  for (const result of updatable) {
    const edit = computeEdit(result, vars);

    if (!edit) {
      prResults.push({ name: result.dep.name, action: 'skipped', skipped: 'cannot compute edit' });
      continue;
    }

    // Convert to repo-relative path BEFORE computing branch name
    const repoRelativePath = path.relative(process.cwd(), edit.file);
    const apiEdit = { ...edit, file: repoRelativePath };
    const branch = branchName(result.dep.name, repoRelativePath, edit.line);
    const existingPr = existingPrs.find((pr) => pr.branch === branch);

    if (existingPr) {
      matchedBranches.add(branch);
      const previousEditText = extractEditText(existingPr.body);

      if (!previousEditText) {
        prResults.push({
          name: result.dep.name,
          action: 'skipped',
          skipped: 'PR body missing edit marker, cannot determine previous edit',
        });
      } else if (apiEdit.newText === previousEditText) {
        prResults.push({
          name: result.dep.name,
          action: 'skipped',
          skipped: 'already up to date',
        });
      } else if (dryRun) {
        core.info(
          `[dry-run] Would update PR #${existingPr.number} for ${result.dep.name}: ` +
            `${previousEditText} → ${apiEdit.newText}`,
        );
        prResults.push({
          name: result.dep.name,
          action: 'updated',
          prNumber: existingPr.number,
          prUrl: existingPr.url,
          dryRun: true,
        });
      } else {
        try {
          const updateResult = await updateExistingPr(octokit, ctx, {
            existingPr,
            edit: apiEdit,
            result,
            previousEditText,
          });
          prResults.push(updateResult);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          core.warning(
            `Failed to update PR #${existingPr.number} for ${result.dep.name}: ${message}`,
          );
          prResults.push({ name: result.dep.name, action: 'error', error: message });
        }
      }
    } else if (dryRun) {
      core.info(
        `[dry-run] Would create PR for ${result.dep.name}: ` +
          `${apiEdit.oldText} → ${apiEdit.newText} in ${apiEdit.file}`,
      );
      prResults.push({ name: result.dep.name, action: 'created', dryRun: true });
    } else {
      try {
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
        prResults.push({ name: result.dep.name, action: 'error', error: message });
      }
    }
  }

  // Close unmatched PRs (scoped to scanned deps).
  // When scannedDepNames is not provided, skip cleanup entirely — callers that
  // don't pass the set shouldn't get surprise stale closures.
  if (!scannedDepNames) return prResults;

  for (const pr of existingPrs) {
    if (matchedBranches.has(pr.branch)) continue;

    const depName = extractDepName(pr.branch);
    if (!depName) continue;

    // Only close if this dep was in scope for the current scan
    if (!scannedDepNames.has(depName)) continue;

    if (dryRun) {
      core.info(`[dry-run] Would close stale PR #${pr.number} (${pr.branch})`);
      prResults.push({
        name: depName,
        action: 'closed-stale',
        closedPrNumber: pr.number,
        dryRun: true,
      });
    } else {
      try {
        await closeStalePr(
          octokit,
          ctx,
          pr,
          'The dependency declaration associated with this PR was not found in the current scan. ' +
            'It may have been removed, moved, or the project structure changed.',
        );
        core.info(`Closed stale PR #${pr.number} (${pr.branch})`);
        prResults.push({
          name: depName,
          action: 'closed-stale',
          closedPrNumber: pr.number,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        core.warning(`Failed to close stale PR #${pr.number}: ${message}`);
        prResults.push({ name: depName, action: 'error', error: message });
      }
    }
  }

  return prResults;
}
