# Changelog

## [1.3.0](https://github.com/dmnq-f/cmake-depcheck/compare/v1.2.0...v1.3.0) (2026-03-23)


### Features

* Add PR creation functionality to action ([5b4ca72](https://github.com/dmnq-f/cmake-depcheck/commit/5b4ca728a5c6b04874d3262dc2a3c3748e8544ed))
* Add support for FetchContent_Populate declarations. ([de0e497](https://github.com/dmnq-f/cmake-depcheck/commit/de0e4976af6f4141f526e3795317ee2d5db53d44))
* Store VariableInfo for resolved version variables, allow for later backrefs ([b9088d7](https://github.com/dmnq-f/cmake-depcheck/commit/b9088d7e9d6fd2946ec2f30cbcfe6f68a293cc13))


### Bug Fixes

* Add missing node shebang to cli.ts, preventing dist builds to execute ([7a5747d](https://github.com/dmnq-f/cmake-depcheck/commit/7a5747d48ecf88864e5078ba34a621fdaca34fa1))
* Bound version replacement search to declaration block range ([2650994](https://github.com/dmnq-f/cmake-depcheck/commit/265099442d68d828300a58f23627841162b22265))
* Fix CLI crash with swallowed errors on npx symlink invocation ([ae6fd1a](https://github.com/dmnq-f/cmake-depcheck/commit/ae6fd1ac01cb931410c6c3ca8672aaa125188255))
* Fix missing PR summary write, improve path handling and asserts ([c0b0534](https://github.com/dmnq-f/cmake-depcheck/commit/c0b05345d3039bd72c96c9f837eaffa36b18280a))
* Improve version replacement behavior (line-scoped) ([2a0bf1d](https://github.com/dmnq-f/cmake-depcheck/commit/2a0bf1df7a9c1005f5632b7a8507b6f26f4d8bbe))
