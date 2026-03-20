import { FetchContentDependency } from './types.js';

const SHA_PATTERN = /^[0-9a-f]{40}$/i;

/** Keywords we extract values for */
const EXTRACT_KEYWORDS = ['GIT_REPOSITORY', 'GIT_TAG', 'URL', 'URL_HASH', 'SOURCE_SUBDIR'] as const;

function findClosingParen(content: string, openIndex: number): number {
  let depth = 1;
  for (let i = openIndex + 1; i < content.length; i++) {
    if (content[i] === '(') depth++;
    else if (content[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function lineNumberAt(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

function stripComments(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('#');
      return idx === -1 ? line : line.substring(0, idx);
    })
    .join('\n');
}

/**
 * Tokenize CMake arguments. Handles quoted and unquoted args,
 * line continuations (backslash at EOL).
 */
function tokenize(body: string): string[] {
  const joined = body.replace(/\\\n/g, ' ');
  const tokens: string[] = [];
  let i = 0;

  while (i < joined.length) {
    if (/\s/.test(joined[i])) {
      i++;
      continue;
    }

    if (joined[i] === '"') {
      let end = i + 1;
      while (end < joined.length && joined[end] !== '"') {
        if (joined[end] === '\\') end++;
        end++;
      }
      tokens.push(joined.substring(i + 1, end));
      i = end + 1;
      continue;
    }

    let end = i;
    while (end < joined.length && !/\s/.test(joined[end]) && joined[end] !== '"') {
      end++;
    }
    tokens.push(joined.substring(i, end));
    i = end;
  }

  return tokens;
}

function parseDeclaration(
  tokens: string[],
  file: string,
  startLine: number,
  endLine: number,
): FetchContentDependency | null {
  if (tokens.length === 0) return null;

  const name = tokens[0];
  const args = new Map<string, string>();

  // Scan for our keywords and grab the token that follows each one
  for (let i = 1; i < tokens.length; i++) {
    const upper = tokens[i].toUpperCase();
    const keyword = EXTRACT_KEYWORDS.find((k) => k === upper);
    if (keyword && i + 1 < tokens.length) {
      args.set(keyword, tokens[i + 1]);
      i++;
    }
  }

  const gitRepository = args.get('GIT_REPOSITORY');
  const gitTag = args.get('GIT_TAG');
  const url = args.get('URL');
  const urlHash = args.get('URL_HASH');
  const sourceSubdir = args.get('SOURCE_SUBDIR');

  const sourceType = gitRepository ? 'git' : 'url';

  const dep: FetchContentDependency = {
    name,
    sourceType,
    location: { file, startLine, endLine },
  };

  if (gitRepository) dep.gitRepository = gitRepository;
  if (gitTag !== undefined) {
    dep.gitTag = gitTag;
    dep.gitTagIsSha = SHA_PATTERN.test(gitTag);
  }
  if (url) dep.url = url;
  if (urlHash) dep.urlHash = urlHash;
  if (sourceSubdir) dep.sourceSubdir = sourceSubdir;

  return dep;
}

export function parseCMakeContent(content: string, filePath: string): FetchContentDependency[] {
  const deps: FetchContentDependency[] = [];
  const pattern = /fetchcontent_declare\s*\(/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const openParenIdx = content.indexOf('(', match.index);
    if (openParenIdx === -1) continue;

    const closeParenIdx = findClosingParen(content, openParenIdx);
    if (closeParenIdx === -1) continue;

    const body = content.substring(openParenIdx + 1, closeParenIdx);
    const tokens = tokenize(stripComments(body));

    const startLine = lineNumberAt(content, match.index);
    const endLine = lineNumberAt(content, closeParenIdx);

    const dep = parseDeclaration(tokens, filePath, startLine, endLine);
    if (dep) deps.push(dep);
  }

  return deps;
}

export async function parseCMakeFile(filePath: string): Promise<FetchContentDependency[]> {
  const fs = await import('node:fs/promises');
  const content = await fs.readFile(filePath, 'utf-8');
  return parseCMakeContent(content, filePath);
}
