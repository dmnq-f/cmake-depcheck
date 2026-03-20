import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveChain, resolveDependencyVariables } from '../../src/scanner/chain-resolver.js';
import { parseCMakeContent } from '../../src/parser/cmake-parser.js';
import { FetchContentDependency } from '../../src/parser/types.js';

const FIXTURES = path.join(__dirname, '..', 'fixtures');

function scanFile(fixtureName: string, entryFile = 'CMakeLists.txt') {
  const entryPath = path.join(FIXTURES, fixtureName, entryFile);
  const { files, warnings, vars } = resolveChain(entryPath);

  const deps: FetchContentDependency[] = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    deps.push(...parseCMakeContent(content, file));
  }

  resolveDependencyVariables(deps, vars);

  return { deps, warnings };
}

describe('scan integration (chain mode)', () => {
  it('chain-basic: finds 3 deps across 3 files', () => {
    const { deps, warnings } = scanFile('chain-basic');

    expect(deps).toHaveLength(3);
    expect(warnings).toHaveLength(0);

    const names = deps.map((d) => d.name).sort();
    expect(names).toEqual(['fmt', 'googletest', 'spdlog']);

    const fmtDep = deps.find((d) => d.name === 'fmt')!;
    expect(fmtDep.location.file).toMatch(/dependencies\.cmake$/);

    const spdlogDep = deps.find((d) => d.name === 'spdlog')!;
    expect(spdlogDep.location.file).toMatch(/networking.*CMakeLists\.txt$/);
  });

  it('chain-unresolvable: finds 2 deps + 2 warnings', () => {
    const { deps, warnings } = scanFile('chain-unresolvable');

    expect(deps).toHaveLength(2);
    expect(warnings).toHaveLength(2);

    const names = deps.map((d) => d.name).sort();
    expect(names).toEqual(['fmt', 'googletest']);
  });

  it('chain-nested: finds 3 deps with correct relative resolution', () => {
    const { deps } = scanFile('chain-nested');

    expect(deps).toHaveLength(3);
    const names = deps.map((d) => d.name).sort();
    expect(names).toEqual(['fmt', 'googletest', 'spdlog']);

    const fmtDep = deps.find((d) => d.name === 'fmt')!;
    expect(fmtDep.location.file).toMatch(/engine.*deps\.cmake$/);
  });

  it('chain-variable-deps: resolves variables in dependency fields', () => {
    const { deps, warnings } = scanFile('chain-variable-deps');

    expect(deps).toHaveLength(1);
    expect(warnings).toHaveLength(0);

    expect(deps[0].name).toBe('googletest');
    expect(deps[0].gitRepository).toBe('https://github.com/google/googletest.git');
    expect(deps[0].gitTag).toBe('v1.17.0');
  });

  it('cmake-variables: resolves GIT_TAG variable in chain mode', () => {
    const { deps } = scanFile('cmake-variables');

    expect(deps).toHaveLength(1);
    expect(deps[0].name).toBe('googletest');
    expect(deps[0].gitTag).toBe('v1.17.0');
  });
});
