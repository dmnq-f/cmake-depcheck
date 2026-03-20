export interface FetchContentDependency {
  /** Dependency name as given to FetchContent_Declare (e.g., "googletest") */
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

  /** Location in the source file for potential future auto-fix */
  location: {
    file: string;
    startLine: number;
    endLine: number;
  };
}
