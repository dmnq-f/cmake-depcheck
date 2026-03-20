cmake_minimum_required(VERSION 3.14)
project(vardeps)

set(GTEST_VERSION "v1.17.0")
set(GTEST_REPO "https://github.com/google/googletest.git")

include(FetchContent)

FetchContent_Declare(
  googletest
  GIT_REPOSITORY ${GTEST_REPO}
  GIT_TAG        ${GTEST_VERSION}
)

FetchContent_MakeAvailable(googletest)
