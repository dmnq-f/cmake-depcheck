# CMake Dependency Checker

[![CI](https://github.com/dmnq-f/cmake-depcheck/actions/workflows/ci.yml/badge.svg)](https://github.com/dmnq-f/cmake-depcheck/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/cmake-depcheck)](https://www.npmjs.com/package/cmake-depcheck)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Scans CMake files for `FetchContent_Declare` calls, checks upstream repositories for newer versions, and reports what's out of date. Think `npm outdated`, but for CMake's FetchContent dependencies.

## Quick Start

Point it at your top-level `CMakeLists.txt`:

```bash
npx cmake-depcheck scan --path ./CMakeLists.txt
```

```
Found 4 dependencies in 3 file(s):

  Name        Current  Latest   Status        Location
  googletest  v1.17.0  v1.17.0  up to date    CMakeLists.txt:7
  fmt         10.2.1   12.1.0   major update  cmake/deps.cmake:2
  spdlog      v1.13.0  v1.17.0  minor update  libs/logging/CMakeLists.txt:4
  json        v3.11.3  v3.12.0  minor update  CMakeLists.txt:19
```

This follows the chain of `include()` and `add_subdirectory()` calls from your entry file, checks each dependency for newer tags, and reports the result. Both git-based and GitHub URL-based dependencies are checked.

## Installation

Requires Node.js 24+.

```bash
npm install -g cmake-depcheck
```

Or run directly with `npx`:

```bash
npx cmake-depcheck scan --path ./CMakeLists.txt
```

## Usage

### Scan from a CMakeLists.txt (recommended)

When given a file, cmake-depcheck follows the chain of `include()` and `add_subdirectory()` calls to discover all related CMake files and their dependencies. This mirrors how CMake itself traverses your project and gives the most accurate results.

```bash
cmake-depcheck scan --path ./CMakeLists.txt
```

Chain resolution handles:
- `include(cmake/deps.cmake)` — resolved relative to the file containing the call
- `include(cmake/deps)` — `.cmake` extension appended automatically
- `add_subdirectory(libs/networking)` — looks for `CMakeLists.txt` in the subdirectory
- `${CMAKE_CURRENT_SOURCE_DIR}`, `${CMAKE_CURRENT_LIST_DIR}`, `${PROJECT_SOURCE_DIR}`, and other variables set via `set()` are resolved automatically
- Generator expressions (`$<...>`) and variables that can't be resolved produce a warning on stderr

### Scan a directory

Alternatively, scan an entire directory tree. This recursively finds all `CMakeLists.txt` and `.cmake` files and parses them for FetchContent declarations.

```bash
cmake-depcheck scan --path ./my-project
```

Build directories (`build*/`, `cmake-build-*/`, `_deps/`) and hidden directories are excluded by default. Add custom exclusions with `--exclude`:

```bash
cmake-depcheck scan --path . --exclude "^vendor$" --exclude "^third_party$"
```

Exclusion patterns are regular expressions matched against directory names.

Directory mode is useful for a quick overview or when your project structure doesn't follow standard `add_subdirectory()` patterns.

### Scan only (no update check)

By default, the scan command checks upstream repositories for newer versions. Use `--scan-only` to skip network calls and just list what's declared:

```bash
cmake-depcheck scan --path ./CMakeLists.txt --scan-only
```

### Ignoring dependencies

Use `--ignore` to exclude specific dependencies from the output by name (repeatable, case-insensitive). Names are matched exactly by default; use regex syntax for patterns:

```bash
cmake-depcheck scan --path . --ignore ominous-dep --ignore "stb.*"
```

Ignored dependencies are still parsed but omitted from the results. The summary line indicates how many were filtered.

### JSON output

Use `--json` to get machine-readable output instead of the human-readable table. All JSON goes to stdout; warnings and progress go to stderr.

```bash
cmake-depcheck scan --path ./CMakeLists.txt --json
```

The JSON output includes dependency details, update check results, scan metadata, and aggregate summary counts.

Combine with `--scan-only` to get a machine-readable inventory without hitting the network:

```bash
cmake-depcheck scan --path . --scan-only --json
```

### Failing on updates

Use `--fail-on-updates` to exit with code 1 when any dependency has an available update. Works with both human-readable and JSON output:

```bash
cmake-depcheck scan --path . --fail-on-updates
cmake-depcheck scan --path . --json --fail-on-updates
```

## Limitations

- **Limited variable expansion.** When scanning from a specific file (chain mode), cmake-depcheck tracks `set()` calls and resolves `${VAR}` references in both file paths and dependency declarations. This covers common patterns like `set(GTEST_VERSION "v1.14.0")` followed by `GIT_TAG ${GTEST_VERSION}`. However, `CACHE` variables, `PARENT_SCOPE`, environment variables, and values computed via `string()`, `list()`, or `math()` are not resolved. In directory scan mode, no variable resolution is performed.
- **No conditional evaluation.** Declarations inside `if()` blocks are always included regardless of the condition.
- **No cross-file include resolution in directory mode.** Directory scanning finds files by walking the filesystem, not by tracing `include()` calls. Use file mode for precise chain-following.
- **Best-effort version comparison.** Semver tags (with or without `v` prefix) are compared accurately. Non-semver tags (e.g., `VER-2-14-0`) use prefix-based heuristics. SHA-pinned dependencies are reported as `pinned` but not checked for updates.
- **URL dependency support is GitHub-only.** URL-based dependencies pointing to GitHub releases or archives are checked for updates using the same tag comparison as git deps. Non-GitHub URLs (e.g., custom mirrors, GitLab) are reported as `unsupported`.

## Building from Source

```bash
git clone https://github.com/dmnq-f/cmake-depcheck.git
cd cmake-depcheck
npm install
npm run build
npm test
```

Development without a build step:

```bash
npm run dev -- scan --path ./CMakeLists.txt
```
