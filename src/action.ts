import * as path from 'node:path';
import * as core from '@actions/core';
import { fileURLToPath } from 'node:url';
import { scan } from './scan.js';
import { UpdateCheckResult } from './checker/types.js';

function parseMultiLineInput(raw: string): string[] {
  return raw
    .split('\n')
    .flatMap((line) => line.split(','))
    .map((s) => s.trim())
    .filter(Boolean);
}

function statusLabel(status: UpdateCheckResult['status']): string {
  switch (status) {
    case 'up-to-date':
      return 'up to date';
    case 'update-available':
      return 'update available';
    case 'check-failed':
      return 'check failed';
    case 'unresolved-variable':
      return 'unresolved variable';
    default:
      return status;
  }
}

function annotate(result: UpdateCheckResult): void {
  const dep = result.dep;
  const file = path.relative(process.cwd(), dep.location.file);
  const startLine = dep.location.startLine;

  switch (result.status) {
    case 'up-to-date':
      break;

    case 'update-available':
      core.warning(
        `${dep.name}: ${dep.gitTag ?? result.resolvedVersion ?? '?'} → ${result.latestVersion} (${result.updateType} update)`,
        { file, startLine },
      );
      break;

    case 'check-failed':
      core.warning(`${dep.name}: update check failed — ${result.error}`, { file, startLine });
      break;

    case 'unresolved-variable':
      core.warning(`${dep.name}: version contains an unresolved CMake variable`, {
        file,
        startLine,
      });
      break;

    case 'pinned':
    case 'unpinned':
    case 'unsupported':
      break;
  }
}

export async function run(): Promise<void> {
  const inputPath = core.getInput('path') || 'CMakeLists.txt';
  const scanOnly = core.getInput('scan-only') === 'true';
  const failOnUpdates = core.getInput('fail-on-updates') === 'true';
  const exclude = parseMultiLineInput(core.getInput('exclude'));
  const ignore = parseMultiLineInput(core.getInput('ignore'));

  const result = await scan({
    path: inputPath,
    scanOnly,
    excludePatterns: exclude.length > 0 ? exclude.map((p) => new RegExp(p)) : undefined,
    ignoreNames: ignore.length > 0 ? ignore : undefined,
  });

  // Annotations
  if (result.updateResults) {
    for (const r of result.updateResults) {
      annotate(r);
    }
  }

  // Job summary
  const rows: {
    name: string;
    current: string;
    latest: string;
    status: string;
    location: string;
  }[] = [];

  if (result.updateResults) {
    for (const r of result.updateResults) {
      const dep = r.dep;
      rows.push({
        name: dep.name,
        current: dep.gitTag ?? r.resolvedVersion ?? '—',
        latest: r.latestVersion ?? '—',
        status: statusLabel(r.status),
        location: `${path.relative(process.cwd(), dep.location.file)}:${dep.location.startLine}`,
      });
    }
  } else {
    for (const dep of result.deps) {
      rows.push({
        name: dep.name,
        current: dep.gitTag ?? '—',
        latest: '—',
        status: 'scan only',
        location: `${path.relative(process.cwd(), dep.location.file)}:${dep.location.startLine}`,
      });
    }
  }

  if (rows.length > 0) {
    await core.summary
      .addHeading('CMake Dependency Check', 3)
      .addTable([
        [
          { data: 'Name', header: true },
          { data: 'Current', header: true },
          { data: 'Latest', header: true },
          { data: 'Status', header: true },
          { data: 'Location', header: true },
        ],
        ...rows.map((r) => [r.name, r.current, r.latest, r.status, r.location]),
      ])
      .write();
  }

  // Outputs
  const updatesAvailable =
    result.updateResults?.filter((r) => r.status === 'update-available').length ?? 0;

  core.setOutput('has-updates', String(updatesAvailable > 0));
  core.setOutput('total', String(result.deps.length));
  core.setOutput('updates-available', String(updatesAvailable));
  core.setOutput('result-json', JSON.stringify(result));

  if (failOnUpdates && updatesAvailable > 0) {
    core.setFailed(`${updatesAvailable} dependency update(s) available`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((error: Error) => {
    core.setFailed(error.message);
  });
}
