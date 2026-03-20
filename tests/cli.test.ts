import * as path from 'node:path';
import { describe, it, expect } from 'vitest';
import { VERSION } from '../src/index.js';
import { createProgram } from '../src/cli.js';

const FIXTURES = path.join(__dirname, 'fixtures');

describe('cli', () => {
  it('exports a version string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('scan command outputs found dependencies', async () => {
    const lines: string[] = [];
    const log = console.log;
    console.log = (msg: string) => {
      lines.push(msg);
    };

    const program = createProgram();
    program.exitOverride();
    await program.parseAsync([
      'node',
      'cmake-depcheck',
      'scan',
      '--path',
      path.join(FIXTURES, 'basic-git'),
    ]);

    console.log = log;
    expect(lines[0]).toMatch(/Found 2 dependencies in 1 file/);
  });

  it('scan command reports no dependencies for empty project', async () => {
    const lines: string[] = [];
    const log = console.log;
    console.log = (msg: string) => {
      lines.push(msg);
    };

    const program = createProgram();
    program.exitOverride();
    await program.parseAsync([
      'node',
      'cmake-depcheck',
      'scan',
      '--path',
      path.join(FIXTURES, 'no-fetchcontent'),
    ]);

    console.log = log;
    expect(lines[0]).toBe('No dependencies found.');
  });

  it('--ignore excludes dependencies by name', async () => {
    const lines: string[] = [];
    const log = console.log;
    console.log = (msg: string) => {
      lines.push(msg);
    };

    const program = createProgram();
    program.exitOverride();
    await program.parseAsync([
      'node',
      'cmake-depcheck',
      'scan',
      '--path',
      path.join(FIXTURES, 'basic-git'),
      '--ignore',
      'googletest',
    ]);

    console.log = log;
    expect(lines[0]).toMatch(/Found 1 dependencies in 1 file/);
    expect(lines.join('\n')).toMatch(/fmt/);
    expect(lines.join('\n')).not.toMatch(/googletest/);
  });
});
