cmake_minimum_required(VERSION 3.14)
project(quoted)

include(FetchContent)

FetchContent_Declare(
  fmt
  GIT_REPOSITORY "https://github.com/fmtlib/fmt.git"
  GIT_TAG "12.1.0"
)

FetchContent_MakeAvailable(fmt)
