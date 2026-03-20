cmake_minimum_required(VERSION 3.14)
project(mixed)

include(FetchContent)

FetchContent_Declare(
  googletest
  GIT_REPOSITORY https://github.com/google/googletest.git
  GIT_TAG        v1.17.0
  OVERRIDE_FIND_PACKAGE
)

FetchContent_Declare(
  json
  URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz
  URL_HASH SHA256=d6c65aca6b1ed68e7a182f4757257b107ae403032760ed6ef121c9d55e81757d
  DOWNLOAD_EXTRACT_TIMESTAMP TRUE
)

FetchContent_Declare(
  lexy
  URL https://lexy.foonathan.net/download/lexy-src.zip
)

FetchContent_MakeAvailable(googletest json lexy)
