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
}
