const MARKER_PREFIX = '<!-- cmake-depcheck:edit:';
const MARKER_SUFFIX = ' -->';

/**
 * Build an HTML comment marker storing the exact text written to the file.
 * Appended to the PR body so the updater knows what to search for on the PR branch.
 */
export function buildEditMarker(editNewText: string): string {
  return `${MARKER_PREFIX}${editNewText}${MARKER_SUFFIX}`;
}

/**
 * Extract the previously written edit text from a PR body's edit marker.
 * Returns null if the marker is not found.
 */
export function extractEditText(prBody: string): string | null {
  const start = prBody.indexOf(MARKER_PREFIX);
  if (start === -1) return null;
  const valueStart = start + MARKER_PREFIX.length;
  const end = prBody.indexOf(MARKER_SUFFIX, valueStart);
  if (end === -1) return null;
  return prBody.substring(valueStart, end);
}
