import type { getOctokit } from '@actions/github';
import type { UpdateCheckResult } from '../checker/types.js';
import type { FileEdit } from './edit-compute.js';
import { fetchReleaseNotes } from './release-notes.js';

type Octokit = ReturnType<typeof getOctokit>;

export interface GitHubContext {
  owner: string;
  repo: string;
  defaultBranch: string;
}

export interface PrResult {
  /** Dependency name */
  name: string;
  /** PR number if created */
  prNumber?: number;
  /** PR URL if created */
  prUrl?: string;
  /** Reason if skipped */
  skipped?: string;
  /** Error message if failed */
  error?: string;
}

function branchName(depName: string, version: string): string {
  return `cmake-depcheck/update-${depName}-${version}`;
}

function updateTypeLabel(type?: 'major' | 'minor' | 'patch'): string {
  return type ?? 'unknown';
}

async function branchExists(
  octokit: Octokit,
  ctx: GitHubContext,
  branch: string,
): Promise<boolean> {
  try {
    await octokit.rest.git.getRef({
      owner: ctx.owner,
      repo: ctx.repo,
      ref: `heads/${branch}`,
    });
    return true;
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'status' in err && err.status === 404) {
      return false;
    }
    throw err;
  }
}

export async function ensureLabel(octokit: Octokit, ctx: GitHubContext): Promise<void> {
  try {
    await octokit.rest.issues.getLabel({
      owner: ctx.owner,
      repo: ctx.repo,
      name: 'dependencies',
    });
  } catch {
    try {
      await octokit.rest.issues.createLabel({
        owner: ctx.owner,
        repo: ctx.repo,
        name: 'dependencies',
        color: '0366d6',
        description: 'Dependency updates',
      });
    } catch {
      // Label creation denied (e.g. insufficient permissions) — not fatal
    }
  }
}

export async function createUpdatePr(
  octokit: Octokit,
  ctx: GitHubContext,
  dep: UpdateCheckResult,
  edit: FileEdit,
): Promise<PrResult> {
  const name = dep.dep.name;
  const version = dep.latestVersion!;
  const branch = branchName(name, version);

  // 1. Check if branch already exists
  if (await branchExists(octokit, ctx, branch)) {
    return { name, skipped: 'branch exists' };
  }

  // 2. Get default branch HEAD SHA
  const { data: refData } = await octokit.rest.git.getRef({
    owner: ctx.owner,
    repo: ctx.repo,
    ref: `heads/${ctx.defaultBranch}`,
  });
  const baseSha = refData.object.sha;

  // 3. Read target file content via API
  const { data: fileData } = await octokit.rest.repos.getContent({
    owner: ctx.owner,
    repo: ctx.repo,
    path: edit.file,
    ref: ctx.defaultBranch,
  });

  if (!('content' in fileData) || !('sha' in fileData)) {
    return { name, error: `Could not read file ${edit.file} from repository` };
  }

  const content = Buffer.from(fileData.content, 'base64').toString('utf-8');

  // 4. Apply line-scoped text replacement
  // Search within [edit.line, edit.endLine] for the line containing the old text.
  // For variable edits line === endLine (exact). For literal GIT_TAG/URL edits the
  // range spans the FetchContent_Declare block.
  const lines = content.split('\n');
  const searchStart = edit.line - 1;
  const searchEnd = Math.min(edit.endLine, lines.length);
  let matchIdx = -1;
  for (let i = searchStart; i < searchEnd; i++) {
    if (lines[i].includes(edit.oldText)) {
      matchIdx = i;
      break;
    }
  }

  if (matchIdx === -1) {
    return {
      name,
      error: `Could not find "${edit.oldText}" in ${edit.file} between lines ${edit.line}–${edit.endLine} (file may have been modified)`,
    };
  }

  lines[matchIdx] = lines[matchIdx].replace(edit.oldText, edit.newText);
  const newContent = lines.join('\n');

  // 5. Create branch
  await octokit.rest.git.createRef({
    owner: ctx.owner,
    repo: ctx.repo,
    ref: `refs/heads/${branch}`,
    sha: baseSha,
  });

  // 6. Update file on the new branch
  await octokit.rest.repos.createOrUpdateFileContents({
    owner: ctx.owner,
    repo: ctx.repo,
    path: edit.file,
    message: `chore(deps): update ${name} to ${version}`,
    content: Buffer.from(newContent).toString('base64'),
    sha: fileData.sha,
    branch,
  });

  // 7. Open PR
  const currentVersion = dep.dep.gitTag ?? dep.resolvedVersion ?? 'unknown';
  const repoUrl = dep.dep.gitRepository ?? dep.dep.url ?? '';

  // 7b. Fetch release notes (non-fatal)
  let releaseNotesSection = '';
  const currentTag = dep.dep.gitTag ?? dep.resolvedVersion ?? '';
  if (dep.intermediateTags && dep.intermediateTags.length > 0 && currentTag) {
    try {
      releaseNotesSection = await fetchReleaseNotes(
        octokit,
        repoUrl,
        currentTag,
        version,
        dep.intermediateTags,
      );
    } catch {
      // Release notes are best-effort — don't fail the PR
    }
  }

  const bodyParts = [
    `## Dependency Update`,
    ``,
    `| | |`,
    `|---|---|`,
    `| **Package** | ${name} |`,
    `| **Current** | \`${currentVersion}\` |`,
    `| **Latest** | \`${version}\` |`,
    `| **Update type** | ${updateTypeLabel(dep.updateType)} |`,
    `| **Repository** | ${repoUrl} |`,
    `| **File** | \`${edit.file}\` |`,
    ``,
  ];

  if (releaseNotesSection) {
    bodyParts.push(releaseNotesSection, ``);
  }

  bodyParts.push(
    `---`,
    `*This PR was automatically created by [cmake-depcheck](https://github.com/dmnq-f/cmake-depcheck).*`,
  );

  const body = bodyParts.join('\n');

  const { data: pr } = await octokit.rest.pulls.create({
    owner: ctx.owner,
    repo: ctx.repo,
    title: `chore(deps): update ${name} to ${version}`,
    body,
    head: branch,
    base: ctx.defaultBranch,
  });

  // Try to add label (non-fatal if it fails)
  try {
    await octokit.rest.issues.addLabels({
      owner: ctx.owner,
      repo: ctx.repo,
      issue_number: pr.number,
      labels: ['dependencies'],
    });
  } catch {
    // Label assignment failed — not fatal
  }

  return { name, prNumber: pr.number, prUrl: pr.html_url };
}
