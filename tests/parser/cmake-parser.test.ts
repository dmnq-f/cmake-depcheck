import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseCMakeContent } from '../../src/parser/cmake-parser.js';

const FIXTURES = path.join(__dirname, '..', 'fixtures');

function parseFixture(fixtureName: string, fileName = 'CMakeLists.txt') {
  const filePath = path.join(FIXTURES, fixtureName, fileName);
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseCMakeContent(content, filePath);
}

describe('cmake-parser', () => {
  describe('basic git dependencies', () => {
    it('parses two git dependencies with semver tags', () => {
      const deps = parseFixture('basic-git');
      expect(deps).toHaveLength(2);

      expect(deps[0].name).toBe('googletest');
      expect(deps[0].sourceType).toBe('git');
      expect(deps[0].gitRepository).toBe('https://github.com/google/googletest.git');
      expect(deps[0].gitTag).toBe('v1.17.0');
      expect(deps[0].gitTagIsSha).toBe(false);

      expect(deps[1].name).toBe('fmt');
      expect(deps[1].sourceType).toBe('git');
      expect(deps[1].gitRepository).toBe('https://github.com/fmtlib/fmt.git');
      expect(deps[1].gitTag).toBe('12.1.0');
      expect(deps[1].gitTagIsSha).toBe(false);
    });
  });

  describe('URL-based dependencies', () => {
    it('parses URL source with hash', () => {
      const deps = parseFixture('basic-url');
      expect(deps).toHaveLength(1);

      expect(deps[0].name).toBe('json');
      expect(deps[0].sourceType).toBe('url');
      expect(deps[0].url).toBe(
        'https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz',
      );
      expect(deps[0].urlHash).toBe('SHA256=d6c65aca6b1ed68e7a182f4757257b107ae403032760ed6ef121c9d55e81757d');
      expect(deps[0].gitRepository).toBeUndefined();
    });
  });

  describe('commit SHA detection', () => {
    it('identifies 40-char hex strings as SHAs', () => {
      const deps = parseFixture('commit-sha');
      expect(deps).toHaveLength(2);

      expect(deps[0].name).toBe('fmt');
      expect(deps[0].gitTag).toBe('407c905e45ad75fc29bf0f9bb7c5c2fd3475976f');
      expect(deps[0].gitTagIsSha).toBe(true);
      expect(deps[0].sourceSubdir).toBe('cmake');

      expect(deps[1].name).toBe('spdlog');
      expect(deps[1].gitTag).toBe('79524ddd08a4ec981b7fea76afd08ee05f83755d');
      expect(deps[1].gitTagIsSha).toBe(true);
    });
  });

  describe('case-insensitive matching', () => {
    it('parses declarations regardless of function/keyword casing', () => {
      const deps = parseFixture('case-variations');
      expect(deps).toHaveLength(3);

      expect(deps[0].name).toBe('spdlog');
      expect(deps[0].gitRepository).toBe('https://github.com/gabime/spdlog.git');
      expect(deps[0].gitTag).toBe('v1.17.0');

      expect(deps[1].name).toBe('googletest');
      expect(deps[1].gitRepository).toBe('https://github.com/google/googletest.git');
      expect(deps[1].gitTag).toBe('v1.17.0');

      expect(deps[2].name).toBe('fmt');
      expect(deps[2].gitRepository).toBe('https://github.com/fmtlib/fmt.git');
      expect(deps[2].gitTag).toBe('12.1.0');
    });
  });

  describe('messy formatting', () => {
    it('handles one-liners, excessive indentation, and split parens', () => {
      const deps = parseFixture('messy-formatting');
      expect(deps).toHaveLength(3);

      expect(deps[0].name).toBe('googletest');
      expect(deps[0].gitRepository).toBe('https://github.com/google/googletest.git');
      expect(deps[0].gitTag).toBe('v1.17.0');

      expect(deps[1].name).toBe('fmt');
      expect(deps[1].gitRepository).toBe('https://github.com/fmtlib/fmt.git');
      expect(deps[1].gitTag).toBe('12.1.0');

      expect(deps[2].name).toBe('spdlog');
      expect(deps[2].gitRepository).toBe('https://github.com/gabime/spdlog.git');
      expect(deps[2].gitTag).toBe('v1.17.0');
    });
  });

  describe('quoted arguments', () => {
    it('strips quotes from argument values', () => {
      const deps = parseFixture('quoted-args');
      expect(deps).toHaveLength(1);

      expect(deps[0].name).toBe('fmt');
      expect(deps[0].gitRepository).toBe('https://github.com/fmtlib/fmt.git');
      expect(deps[0].gitTag).toBe('12.1.0');
    });
  });

  describe('cmake variables', () => {
    it('preserves variable references as-is without resolving', () => {
      const deps = parseFixture('cmake-variables');
      expect(deps).toHaveLength(1);

      expect(deps[0].name).toBe('googletest');
      expect(deps[0].gitTag).toBe('${GTEST_VERSION}');
      expect(deps[0].gitTagIsSha).toBe(false);
    });
  });

  describe('no fetchcontent', () => {
    it('returns empty array for files without FetchContent_Declare', () => {
      const deps = parseFixture('no-fetchcontent');
      expect(deps).toHaveLength(0);
    });
  });

  describe('mixed sources', () => {
    it('handles git and URL deps in one file, ignoring unknown keywords', () => {
      const deps = parseFixture('mixed-sources');
      expect(deps).toHaveLength(3);

      expect(deps[0].name).toBe('googletest');
      expect(deps[0].sourceType).toBe('git');

      expect(deps[1].name).toBe('json');
      expect(deps[1].sourceType).toBe('url');
      expect(deps[1].urlHash).toBe('SHA256=d6c65aca6b1ed68e7a182f4757257b107ae403032760ed6ef121c9d55e81757d');

      expect(deps[2].name).toBe('lexy');
      expect(deps[2].sourceType).toBe('url');
      expect(deps[2].url).toBe('https://lexy.foonathan.net/download/lexy-src.zip');
      expect(deps[2].urlHash).toBeUndefined();
    });
  });

  describe('location tracking', () => {
    it('records correct start and end lines', () => {
      const deps = parseFixture('basic-git');

      expect(deps[0].location.startLine).toBe(6);
      expect(deps[0].location.endLine).toBe(10);
      expect(deps[1].location.startLine).toBe(12);
      expect(deps[1].location.endLine).toBe(16);
    });
  });
});
