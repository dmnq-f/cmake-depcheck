cmake_minimum_required(VERSION 3.14)
project(sha_example)

include(FetchContent)

FetchContent_Declare(
  fmt
  GIT_REPOSITORY https://github.com/fmtlib/fmt.git
  GIT_TAG        407c905e45ad75fc29bf0f9bb7c5c2fd3475976f # 12.1.0
  SOURCE_SUBDIR  cmake
)

FetchContent_Declare(
  spdlog
  GIT_REPOSITORY https://github.com/gabime/spdlog.git
  GIT_TAG        79524ddd08a4ec981b7fea76afd08ee05f83755d
)

FetchContent_MakeAvailable(fmt spdlog)
