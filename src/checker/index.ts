export type { UpdateCheckResult } from './types.js';
export { parseGitLsRemoteOutput, fetchRemoteTags } from './git-tags.js';
export { findLatestVersion } from './version-compare.js';
export { checkForUpdates } from './version-checker.js';
export { extractGitHubUrlInfo, buildUpdatedUrl, verifyUrlExists } from './github-url.js';
export type { GitHubUrlInfo, GitHubUrlPattern } from './github-url.js';
