cmake_minimum_required(VERSION 3.14)
project(vars)

set(GTEST_VERSION "v1.17.0")

include(FetchContent)

FetchContent_Declare(
  googletest
  GIT_REPOSITORY https://github.com/google/googletest.git
  GIT_TAG        ${GTEST_VERSION}
)

FetchContent_MakeAvailable(googletest)
