import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveChain } from '../../src/scanner/chain-resolver.js';
import { parseCMakeContent } from '../../src/parser/cmake-parser.js';
import { FetchContentDependency } from '../../src/parser/types.js';

const FIXTURES = path.join(__dirname, '..', 'fixtures');

function scanFile(fixtureName: string, entryFile = 'CMakeLists.txt') {
  const entryPath = path.join(FIXTURES, fixtureName, entryFile);
  const { files, warnings } = resolveChain(entryPath);

  const deps: FetchContentDependency[] = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    deps.push(...parseCMakeContent(content, file));
  }

  return { deps, warnings };
}

describe('scan integration (chain mode)', () => {
  it('chain-basic: finds 3 deps across 3 files', () => {
    const { deps, warnings } = scanFile('chain-basic');

    expect(deps).toHaveLength(3);
    expect(warnings).toHaveLength(0);

    const names = deps.map((d) => d.name).sort();
    expect(names).toEqual(['fmt', 'googletest', 'spdlog']);

    // Verify location.file is correct for each dep
    const fmtDep = deps.find((d) => d.name === 'fmt')!;
    expect(fmtDep.location.file).toMatch(/dependencies\.cmake$/);

    const spdlogDep = deps.find((d) => d.name === 'spdlog')!;
    expect(spdlogDep.location.file).toMatch(/networking.*CMakeLists\.txt$/);
  });

  it('chain-unresolvable: finds 2 deps + 3 warnings', () => {
    const { deps, warnings } = scanFile('chain-unresolvable');

    expect(deps).toHaveLength(2);
    expect(warnings).toHaveLength(3);

    const names = deps.map((d) => d.name).sort();
    expect(names).toEqual(['fmt', 'googletest']);
  });

  it('chain-nested: finds 3 deps with correct relative resolution', () => {
    const { deps } = scanFile('chain-nested');

    expect(deps).toHaveLength(3);
    const names = deps.map((d) => d.name).sort();
    expect(names).toEqual(['fmt', 'googletest', 'spdlog']);

    // The fmt and spdlog deps should come from libs/engine/cmake/deps.cmake
    const fmtDep = deps.find((d) => d.name === 'fmt')!;
    expect(fmtDep.location.file).toMatch(/engine.*deps\.cmake$/);
  });
});
