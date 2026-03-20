cmake_minimum_required(VERSION 3.14)
project(case_test)

include(FetchContent)

# All lowercase
fetchcontent_declare(
  spdlog
  GIT_REPOSITORY https://github.com/gabime/spdlog.git
  GIT_TAG        v1.17.0
)

# ALL CAPS
FETCHCONTENT_DECLARE(
  googletest
  GIT_REPOSITORY https://github.com/google/googletest.git
  GIT_TAG        v1.17.0
)

# Mixed case keywords
FetchContent_Declare(
  fmt
  git_repository https://github.com/fmtlib/fmt.git
  git_tag        12.1.0
)

FetchContent_MakeAvailable(spdlog googletest fmt)
