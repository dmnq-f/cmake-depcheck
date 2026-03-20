# This is a fetched dependency's own CMakeLists — should NOT be scanned
cmake_minimum_required(VERSION 3.14)
project(googletest)

FetchContent_Declare(
  fake_transitive_dep
  GIT_REPOSITORY https://github.com/example/fake.git
  GIT_TAG        v0.0.1
)
