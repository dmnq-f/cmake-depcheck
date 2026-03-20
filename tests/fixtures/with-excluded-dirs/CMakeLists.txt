cmake_minimum_required(VERSION 3.14)
project(excluded)

include(FetchContent)

FetchContent_Declare(
  spdlog
  GIT_REPOSITORY https://github.com/gabime/spdlog.git
  GIT_TAG        v1.17.0
)

FetchContent_MakeAvailable(spdlog)
