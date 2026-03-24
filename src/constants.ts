/** Matches a 40-character hex string (git SHA-1 commit hash) */
export const SHA_PATTERN = /^[0-9a-f]{40}$/i;

/** Valid values for the --update-types filter */
export const VALID_UPDATE_TYPES = new Set(['major', 'minor', 'patch', 'unknown']);
