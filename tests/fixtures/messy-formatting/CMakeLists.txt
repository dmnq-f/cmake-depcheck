cmake_minimum_required(VERSION 3.14)
project(messy)

include(FetchContent)

# Everything on one line
FetchContent_Declare(googletest GIT_REPOSITORY https://github.com/google/googletest.git GIT_TAG v1.17.0)

# Excessive indentation and blank lines between args
FetchContent_Declare(
        fmt
        GIT_REPOSITORY
            https://github.com/fmtlib/fmt.git
        GIT_TAG
            12.1.0
)

# Opening paren on next line (uncommon but valid)
FetchContent_Declare
(
  spdlog
  GIT_REPOSITORY https://github.com/gabime/spdlog.git
  GIT_TAG        v1.17.0
)

FetchContent_MakeAvailable(googletest fmt spdlog)
