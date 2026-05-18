# Changelog

## [4.0.0](https://github.com/dmnq-f/cmake-depcheck/compare/v3.0.1...v4.0.0) (2026-05-18)


### ⚠ BREAKING CHANGES

* SHA-pinned `GIT_TAG` deps are now network-checked by default and may flip from `'pinned'` to `'update-available'`, which can trigger `--fail-on-updates` gates or auto-PR creation that previously ignored them. Set `--no-resolve-sha` (CLI), or `resolve-sha: 'false'` (action input) to restore prior behavior.
* PR lifecycle management (update-in-place, stale cleanup) ([#15](https://github.com/dmnq-f/cmake-depcheck/issues/15))

### Features

* add --update-types filter for scan results ([d90a133](https://github.com/dmnq-f/cmake-depcheck/commit/d90a13306274d21f659941a62e5d84a9f0ce7583))
* Add PR creation functionality to action ([5b4ca72](https://github.com/dmnq-f/cmake-depcheck/commit/5b4ca728a5c6b04874d3262dc2a3c3748e8544ed))
* Add support for FetchContent_Populate declarations. ([de0e497](https://github.com/dmnq-f/cmake-depcheck/commit/de0e4976af6f4141f526e3795317ee2d5db53d44))
* Enable update checking on SHA-pinned dependencies ([#50](https://github.com/dmnq-f/cmake-depcheck/issues/50)) ([e8498bd](https://github.com/dmnq-f/cmake-depcheck/commit/e8498bdf499d510bb733fcd666b00c72c44e5670))
* include upstream release notes in auto-update PRs ([9f1be33](https://github.com/dmnq-f/cmake-depcheck/commit/9f1be33d4a15ff9ad42d16acb932eb743c966998))
* PR lifecycle management (update-in-place, stale cleanup) ([#15](https://github.com/dmnq-f/cmake-depcheck/issues/15)) ([1c6c690](https://github.com/dmnq-f/cmake-depcheck/commit/1c6c690d84c09e6aadb2f9e0157222dd881ba7ce))
* Store VariableInfo for resolved version variables, allow for later backrefs ([b9088d7](https://github.com/dmnq-f/cmake-depcheck/commit/b9088d7e9d6fd2946ec2f30cbcfe6f68a293cc13))


### Bug Fixes

* Add missing node shebang to cli.ts, preventing dist builds to execute ([7a5747d](https://github.com/dmnq-f/cmake-depcheck/commit/7a5747d48ecf88864e5078ba34a621fdaca34fa1))
* Bound version replacement search to declaration block range ([2650994](https://github.com/dmnq-f/cmake-depcheck/commit/265099442d68d828300a58f23627841162b22265))
* Correct line numbers and PR edits for SHA-pinned variable deps ([300be34](https://github.com/dmnq-f/cmake-depcheck/commit/300be3454ea33dbf89050994facc763f63947cf9))
* Fix CLI crash with swallowed errors on npx symlink invocation ([ae6fd1a](https://github.com/dmnq-f/cmake-depcheck/commit/ae6fd1ac01cb931410c6c3ca8672aaa125188255))
* Fix missing PR summary write, improve path handling and asserts ([c0b0534](https://github.com/dmnq-f/cmake-depcheck/commit/c0b05345d3039bd72c96c9f837eaffa36b18280a))
* Improve version replacement behavior (line-scoped) ([2a0bf1d](https://github.com/dmnq-f/cmake-depcheck/commit/2a0bf1df7a9c1005f5632b7a8507b6f26f4d8bbe))
* Recompute gitTagIsSha after chain variable resolution ([abd0f32](https://github.com/dmnq-f/cmake-depcheck/commit/abd0f32a92361da496143368de88a43246c341fe))

## [3.0.1](https://github.com/dmnq-f/cmake-depcheck/compare/v3.0.0...v3.0.1) (2026-05-18)


### Bug Fixes

* Correct line numbers and PR edits for SHA-pinned variable deps ([300be34](https://github.com/dmnq-f/cmake-depcheck/commit/300be3454ea33dbf89050994facc763f63947cf9))

## [3.0.0](https://github.com/dmnq-f/cmake-depcheck/compare/v2.0.1...v3.0.0) (2026-05-18)


### ⚠ BREAKING CHANGES

* SHA-pinned `GIT_TAG` deps are now network-checked by default and may flip from `'pinned'` to `'update-available'`, which can trigger `--fail-on-updates` gates or auto-PR creation that previously ignored them. Set `--no-resolve-sha` (CLI), or `resolve-sha: 'false'` (action input) to restore prior behavior.

### Features

* Enable update checking on SHA-pinned dependencies ([#50](https://github.com/dmnq-f/cmake-depcheck/issues/50)) ([e8498bd](https://github.com/dmnq-f/cmake-depcheck/commit/e8498bdf499d510bb733fcd666b00c72c44e5670))

## [2.0.1](https://github.com/dmnq-f/cmake-depcheck/compare/v2.0.0...v2.0.1) (2026-04-14)


### Bug Fixes

* Recompute gitTagIsSha after chain variable resolution ([abd0f32](https://github.com/dmnq-f/cmake-depcheck/commit/abd0f32a92361da496143368de88a43246c341fe))

## [2.0.0](https://github.com/dmnq-f/cmake-depcheck/compare/v1.3.0...v2.0.0) (2026-03-26)


### ⚠ BREAKING CHANGES

* PR lifecycle management (update-in-place, stale cleanup) ([#15](https://github.com/dmnq-f/cmake-depcheck/issues/15))

### Features

* add --update-types filter for scan results ([d90a133](https://github.com/dmnq-f/cmake-depcheck/commit/d90a13306274d21f659941a62e5d84a9f0ce7583))
* include upstream release notes in auto-update PRs ([9f1be33](https://github.com/dmnq-f/cmake-depcheck/commit/9f1be33d4a15ff9ad42d16acb932eb743c966998))
* PR lifecycle management (update-in-place, stale cleanup) ([#15](https://github.com/dmnq-f/cmake-depcheck/issues/15)) ([1c6c690](https://github.com/dmnq-f/cmake-depcheck/commit/1c6c690d84c09e6aadb2f9e0157222dd881ba7ce))

## [1.3.0](https://github.com/dmnq-f/cmake-depcheck/compare/v1.2.0...v1.3.0) (2026-03-24)


### Features

* add --update-types filter for scan results ([d90a133](https://github.com/dmnq-f/cmake-depcheck/commit/d90a13306274d21f659941a62e5d84a9f0ce7583))
* include upstream release notes in auto-update PRs ([9f1be33](https://github.com/dmnq-f/cmake-depcheck/commit/9f1be33d4a15ff9ad42d16acb932eb743c966998))
