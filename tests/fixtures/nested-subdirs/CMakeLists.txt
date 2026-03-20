cmake_minimum_required(VERSION 3.14)
project(nested)

include(FetchContent)

FetchContent_Declare(
  googletest
  GIT_REPOSITORY https://github.com/google/googletest.git
  GIT_TAG        v1.17.0
)

add_subdirectory(libs/networking)
add_subdirectory(libs/graphics)

FetchContent_MakeAvailable(googletest)
