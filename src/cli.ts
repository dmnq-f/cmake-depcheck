import { Command } from 'commander';
import { VERSION } from './index.js';

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
    .action((options: { path: string }) => {
      console.log(`Scanning: ${options.path}`);
    });

  return program;
}

if (require.main === module) {
  createProgram().parse();
}
