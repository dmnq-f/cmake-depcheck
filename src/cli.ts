import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command } from 'commander';
import { VERSION } from './index.js';
import { parseCMakeContent } from './parser/index.js';
import { scanDirectory } from './scanner/index.js';
import { FetchContentDependency } from './parser/types.js';

function printResults(deps: FetchContentDependency[], basePath: string): void {
  if (deps.length === 0) {
    console.log('No dependencies found.');
    return;
  }

  const fileSet = new Set(deps.map((d) => d.location.file));
  console.log(`Found ${deps.length} dependencies in ${fileSet.size} file(s):\n`);

  const nameWidth = Math.max(...deps.map((d) => d.name.length));
  const typeWidth = 3; // 'git' or 'url'

  for (const dep of deps) {
    const version = dep.sourceType === 'git' ? (dep.gitTag ?? '') : (dep.url ?? '');
    const relFile = path.relative(basePath, dep.location.file);
    const location = `${relFile}:${dep.location.startLine}`;

    console.log(
      `  ${dep.name.padEnd(nameWidth)}  ${dep.sourceType.padEnd(typeWidth)}  ${version.padEnd(50)}  ${location}`,
    );
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
    .action((options: { path: string; exclude: string[] }) => {
      const targetPath = path.resolve(options.path);
      const stat = fs.statSync(targetPath);
      const customExcludes = options.exclude.map((p) => new RegExp(p));

      let allDeps: FetchContentDependency[] = [];
      let basePath: string;

      if (stat.isDirectory()) {
        basePath = targetPath;
        const files = scanDirectory(targetPath, customExcludes);
        for (const file of files) {
          const content = fs.readFileSync(file, 'utf-8');
          allDeps = allDeps.concat(parseCMakeContent(content, file));
        }
      } else {
        basePath = path.dirname(targetPath);
        const content = fs.readFileSync(targetPath, 'utf-8');
        allDeps = parseCMakeContent(content, targetPath);
      }

      printResults(allDeps, basePath);
    });

  return program;
}

function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

if (require.main === module) {
  createProgram().parse();
}
