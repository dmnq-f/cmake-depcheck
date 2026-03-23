export interface FetchContentDependency {
  /** Dependency name as given to FetchContent_Declare or FetchContent_Populate (e.g., "googletest") */
  name: string;

  /** Source type — determines which fields are populated */
  sourceType: 'git' | 'url';

  /** Git repository URL (when sourceType is 'git') */
  gitRepository?: string;

  /** Git tag, branch, or commit SHA (when sourceType is 'git') */
  gitTag?: string;

  /** Whether gitTag looks like a commit SHA (40-char hex) vs a tag/branch */
  gitTagIsSha?: boolean;

  /** Archive download URL (when sourceType is 'url') */
  url?: string;

  /** URL hash for verification (e.g. "MD5=..." */
  urlHash?: string;

  /** SOURCE_SUBDIR if specified */
  sourceSubdir?: string;

  /** Original GIT_TAG value before variable resolution, e.g. "${FMT_VERSION}" */
  gitTagRaw?: string;

  /** Original URL value before variable resolution */
  urlRaw?: string;

  /** Location in the source file for potential future auto-fix */
  location: {
    file: string;
    startLine: number;
    endLine: number;
  };
}
