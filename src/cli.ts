import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command, CommanderError } from 'commander';
import { VERSION } from './index.js';
import { parseCMakeContent } from './parser/index.js';
import { scanDirectory, resolveChain, resolveDependencyVariables } from './scanner/index.js';
import { FetchContentDependency } from './parser/types.js';
import { checkForUpdates } from './checker/index.js';
import { UpdateCheckResult } from './checker/types.js';
import { formatJsonOutput } from './formatter/index.js';

const STATUS_LABELS: Record<UpdateCheckResult['status'], string> = {
  'up-to-date': 'up to date',
  'update-available': 'update available',
  'pinned': 'pinned',
  'unpinned': 'unpinned',
  'url-source': 'url source',
  'check-failed': 'check failed',
  'unresolved-variable': 'unresolved var',
};

function statusLabel(result: UpdateCheckResult): string {
  if (result.status === 'update-available' && result.updateType) {
    return `${result.updateType} update`;
  }
  return STATUS_LABELS[result.status];
}

function currentLabel(dep: FetchContentDependency, result?: UpdateCheckResult): string {
  if (result) {
    if (result.status === 'url-source') return '(url)';
    if (result.status === 'unpinned') return '(none)';
  }
  return dep.sourceType === 'git' ? (dep.gitTag ?? '') : (dep.url ?? '');
}

function printResults(
  deps: FetchContentDependency[],
  basePath: string,
  ignoredCount: number,
  updateResults?: UpdateCheckResult[],
): void {
  if (deps.length === 0) {
    console.log('No dependencies found.');
    return;
  }

  const fileSet = new Set(deps.map((d) => d.location.file));
  let summary = `Found ${deps.length} dependencies in ${fileSet.size} file(s)`;
  if (ignoredCount > 0) {
    summary += ` (${ignoredCount} omitted due to ignore configuration)`;
  }
  console.log(summary + ':\n');

  if (updateResults) {
    const resultMap = new Map<FetchContentDependency, UpdateCheckResult>();
    for (const r of updateResults) {
      resultMap.set(r.dep, r);
    }

    // Build rows sorted by actionability: updates first, then up-to-date, then skipped
    const STATUS_ORDER: Record<UpdateCheckResult['status'], number> = {
      'update-available': 0,
      'check-failed': 1,
      'unresolved-variable': 2,
      'up-to-date': 3,
      pinned: 4,
      unpinned: 5,
      'url-source': 6,
    };

    const rows = deps
      .map((dep) => {
        const result = resultMap.get(dep)!;
        const relFile = path.relative(basePath, dep.location.file);
        return {
          name: dep.name,
          current: currentLabel(dep, result),
          latest: result.latestVersion ?? '\u2014',
          status: statusLabel(result),
          location: `${relFile}:${dep.location.startLine}`,
          sortKey: STATUS_ORDER[result.status],
        };
      })
      .sort((a, b) => a.sortKey - b.sortKey);

    const nameW = Math.max('Name'.length, ...rows.map((r) => r.name.length));
    const currentW = Math.max('Current'.length, ...rows.map((r) => r.current.length));
    const latestW = Math.max('Latest'.length, ...rows.map((r) => r.latest.length));
    const statusW = Math.max('Status'.length, ...rows.map((r) => r.status.length));

    console.log(
      `  ${'Name'.padEnd(nameW)}  ${'Current'.padEnd(currentW)}  ${'Latest'.padEnd(latestW)}  ${'Status'.padEnd(statusW)}  Location`,
    );

    for (const row of rows) {
      console.log(
        `  ${row.name.padEnd(nameW)}  ${row.current.padEnd(currentW)}  ${row.latest.padEnd(latestW)}  ${row.status.padEnd(statusW)}  ${row.location}`,
      );
    }

    // Print errors to stderr
    for (const result of updateResults) {
      if (result.status === 'check-failed' && result.error) {
        console.error(`Error checking ${result.dep.name}: ${result.error}`);
      }
    }
  } else {
    // Scan-only mode: original format
    const nameWidth = Math.max(...deps.map((d) => d.name.length));
    const typeWidth = 3;

    for (const dep of deps) {
      const version = dep.sourceType === 'git' ? (dep.gitTag ?? '') : (dep.url ?? '');
      const relFile = path.relative(basePath, dep.location.file);
      const location = `${relFile}:${dep.location.startLine}`;

      console.log(
        `  ${dep.name.padEnd(nameWidth)}  ${dep.sourceType.padEnd(typeWidth)}  ${version.padEnd(50)}  ${location}`,
      );
    }
  }
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name('cmake-depcheck')
    .description('Check for updates to CMake FetchContent dependencies')
    .version(VERSION);

  program
    .command('scan')
    .description('Scan CMake files for FetchContent dependencies')
    .requiredOption('--path <path>', 'Path to CMakeLists.txt or project root')
    .option(
      '--exclude <pattern>',
      'Additional directory exclusion pattern (repeatable)',
      collect,
      [],
    )
    .option('--ignore <name>', 'Exclude a dependency by name (repeatable)', collect, [])
    .option('--scan-only', 'List dependencies without checking for updates')
    .option('--json', 'Emit JSON to stdou (suppresses standard CLI output)')
    .option('--fail-on-updates', 'Exit with code 1 if any updates are available')
    .action(
      async (options: {
        path: string;
        exclude: string[];
        ignore: string[];
        scanOnly?: boolean;
        json?: boolean;
        failOnUpdates?: boolean;
      }) => {
        if (options.failOnUpdates && options.scanOnly) {
          console.error(
            'Warning: --fail-on-updates has no effect with --scan-only (no update checks performed)',
          );
        }

        const targetPath = path.resolve(options.path);
        const stat = fs.statSync(targetPath);
        const customExcludes = options.exclude.map((p) => new RegExp(p));

        let allDeps: FetchContentDependency[] = [];
        let basePath: string;
        let scanMode: 'directory' | 'chain';
        let filesScanned: string[];
        let chainWarnings: string[] = [];

        if (stat.isDirectory()) {
          scanMode = 'directory';
          basePath = targetPath;
          filesScanned = scanDirectory(targetPath, customExcludes);
          for (const file of filesScanned) {
            const content = fs.readFileSync(file, 'utf-8');
            allDeps = allDeps.concat(parseCMakeContent(content, file));
          }
        } else {
          scanMode = 'chain';
          basePath = path.dirname(targetPath);
          const { files, warnings, vars } = resolveChain(targetPath);
          filesScanned = files;
          chainWarnings = warnings;
          if (!options.json) {
            for (const warning of warnings) {
              console.error(warning);
            }
          }
          for (const file of files) {
            const content = fs.readFileSync(file, 'utf-8');
            allDeps = allDeps.concat(parseCMakeContent(content, file));
          }
          resolveDependencyVariables(allDeps, vars);
        }

        let ignoredCount = 0;
        if (options.ignore.length > 0) {
          const patterns = options.ignore.map((p) => new RegExp(`^${p}$`, 'i'));
          const before = allDeps.length;
          allDeps = allDeps.filter((d) => !patterns.some((p) => p.test(d.name)));
          ignoredCount = before - allDeps.length;
        }

        let updateResults: UpdateCheckResult[] | undefined;

        if (options.scanOnly) {
          if (!options.json) {
            printResults(allDeps, basePath, ignoredCount);
          }
        } else {
          const onProgress =
            !options.json && process.stderr.isTTY
              ? (completed: number, total: number) => {
                  process.stderr.write(
                    `Checking for updates... (${completed}/${total})\r`,
                  );
                }
              : undefined;

          updateResults = await checkForUpdates(allDeps, onProgress);

          if (!options.json && process.stderr.isTTY) {
            process.stderr.write('\r' + ' '.repeat(40) + '\r');
          }

          if (!options.json) {
            printResults(allDeps, basePath, ignoredCount, updateResults);
          }
        }

        if (options.json) {
          const output = formatJsonOutput({
            deps: allDeps,
            basePath,
            ignoredCount,
            scanMode,
            entryPath: options.path,
            filesScanned,
            warnings: chainWarnings,
            updateResults,
          });
          process.stdout.write(JSON.stringify(output, null, 2) + '\n');
        }

        if (
          options.failOnUpdates &&
          updateResults?.some((r) => r.status === 'update-available')
        ) {
          throw new CommanderError(1, 'cmake-depcheck.updates_available', '');
        }
      },
    );

  return program;
}

function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

if (require.main === module) {
  createProgram().parse();
}
