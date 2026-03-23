import { FetchContentDependency } from '../parser/types.js';

export interface UpdateCheckResult {
  dep: FetchContentDependency;
  status:
    | 'up-to-date'
    | 'update-available'
    | 'pinned'
    | 'unpinned'
    | 'unsupported'
    | 'check-failed'
    | 'unresolved-variable';
  latestVersion?: string;
  updateType?: 'major' | 'minor' | 'patch';
  error?: string;
  /** Replacement download URL when a URL-type dep has an update available */
  updatedUrl?: string;
  /** Version/tag resolved from the dep's URL (GitHub URL deps only) */
  resolvedVersion?: string;
}
