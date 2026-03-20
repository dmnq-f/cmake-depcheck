import { describe, it, expect } from 'vitest';
import { VERSION } from '../src/index.js';
import { createProgram } from '../src/cli.js';

describe('cli', () => {
  it('exports a version string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('scan command prints the path', async () => {
    let output = '';
    const log = console.log;
    console.log = (msg: string) => {
      output = msg;
    };

    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(['node', 'cmake-depcheck', 'scan', '--path', './CMakeLists.txt']);

    console.log = log;
    expect(output).toBe('Scanning: ./CMakeLists.txt');
  });
});
