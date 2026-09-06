import * as path from 'node:path';
import { marked } from 'marked';
import { RunOptions } from '../types/SwaggerToSdkConfig';
import { removeAnsiEscapeCodes } from './utils';

function splitCommand(command: string): string[] {
  const args: string[] = [];
  let argument = '';
  let quote: string | undefined;
  let started = false;
  for (let index = 0; index < command.length; index++) {
    const char = command[index];
    if (char === '\\' && quote && command[index + 1] === quote) {
      argument += command[++index];
    } else if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        argument += char;
      }
    } else if (char === '"' || char === "'") {
      quote = char;
      started = true;
    } else if (/\s/.test(char)) {
      if (started) {
        args.push(argument);
        argument = '';
        started = false;
      }
    } else {
      argument += char;
      started = true;
    }
  }
  if (quote) {
    throw new Error('Invalid getSdkChangesScript command: unterminated quote.');
  }
  if (started) {
    args.push(argument);
  }
  if (!args[0]) {
    throw new Error('Invalid getSdkChangesScript command: an executable is required.');
  }
  return args;
}

export function getSdkChangesCommandLine(
  options: RunOptions,
  sdkRepoPath: string,
  packagePath: string,
  outputJsonFile: string,
): string[] {
  if (options.command?.trim()) {
    const parameters: Record<string, string> = {
      sdkrepopath: sdkRepoPath,
      packagepath: packagePath,
      outputjsonfile: outputJsonFile,
    };
    // Substitute after tokenizing so paths, including spaces and quotes, remain single arguments.
    return splitCommand(options.command).map(argument =>
      argument.replace(/\{(SdkRepoPath|PackagePath|OutputJsonFile)\}/gi, (_, name: string) => parameters[name.toLowerCase()]),
    );
  }
  if (options.path?.trim()) {
    return [
      'pwsh', '-NoProfile', '-NonInteractive', '-File', path.resolve(sdkRepoPath, options.path),
      '-SdkRepoPath', sdkRepoPath,
      '-PackagePath', packagePath,
      '-OutputJsonFile', outputJsonFile,
    ];
  }
  throw new Error('getSdkChangesScript requires a non-empty command or script path.');
}

function normalizeChangelog(markdown: string): string {
  return removeAnsiEscapeCodes(markdown).replace(/^(?:cmdout|cmderr)\t\[[^\r\n]*?\] /gm, '');
}

export function getSdkBreakingChangeItems(markdown: string): string[] {
  const items: string[] = [];
  let breakingSectionDepth: number | undefined;
  for (const token of marked.lexer(normalizeChangelog(markdown))) {
    if (token.type === 'heading') {
      if (/^breaking changes$/i.test(token.text.trim())) {
        breakingSectionDepth = token.depth;
      } else if (breakingSectionDepth !== undefined && token.depth <= breakingSectionDepth) {
        breakingSectionDepth = undefined;
      }
    } else if (breakingSectionDepth !== undefined && token.type !== 'space') {
      if (token.type === 'list') {
        items.push(...token.items.map(item => item.text.trim()));
      } else {
        items.push(token.raw.trim());
      }
    }
  }
  return [...new Set(items.filter(Boolean))];
}

export function mergeSdkChangelogs(changelogs: string[], changes: string): string[] {
  if (!changes.trim()) {
    return changelogs;
  }
  const sections = new Map<string, { heading: string; blocks: Map<string, string> }>();
  const references = new Map<string, string>();
  for (const markdown of [normalizeChangelog(changelogs.join('\n')), changes]) {
    const tokens = marked.lexer(markdown);
    for (const [name, reference] of Object.entries(tokens.links)) {
      if (!references.has(name)) {
        references.set(name, `[${name}]: <${reference.href}>${reference.title ? ` ${JSON.stringify(reference.title)}` : ''}`);
      }
    }
    let sectionKey = '';
    for (const token of tokens) {
      if (token.type === 'heading') {
        sectionKey = `${token.depth}:${token.text.trim().toLowerCase()}`;
      }
      if (!sections.has(sectionKey)) {
        sections.set(sectionKey, { heading: '', blocks: new Map() });
      }
      const section = sections.get(sectionKey)!;
      if (token.type === 'heading') {
        section.heading ||= token.raw.trim();
      } else if (token.type === 'list') {
        for (const item of token.items) {
          const key = item.text.trim();
          if (!section.blocks.has(key)) {
            section.blocks.set(key, item.raw.trimEnd());
          }
        }
      } else if (token.type !== 'space') {
        const block = token.raw.trim();
        section.blocks.set(block, block);
      }
    }
  }
  return [
    ...[...sections.values()].map(section => [section.heading, ...section.blocks.values()].filter(Boolean).join('\n\n')),
    ...references.values(),
  ].filter(Boolean).join('\n\n').split('\n');
}
