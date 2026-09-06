import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getSdkBreakingChangeItems, getSdkChangesCommandLine, mergeSdkChangelogs } from '../../src/utils/sdkChanges';

describe('getSdkChangesCommandLine', () => {
  const sdkRepoPath = path.resolve("SDK repo & one's $workspace");
  const packagePath = path.join(sdkRepoPath, 'sdk', 'service (preview)', 'Example.Package');
  const outputJsonFile = path.resolve('artifacts', 'a fresh output.json');

  it('preserves quoted executables, embedded arguments, empty arguments and all placeholder occurrences', () => {
    const command = '"C:\\Program Files\\node.exe" --repo="{SdkRepoPath}" --package {PACKAGEPATH} ' +
      '--output "{OutputJsonFile}" --again {outputjsonfile} --empty "" --literal "two words"';

    expect(getSdkChangesCommandLine({ command }, sdkRepoPath, packagePath, outputJsonFile)).toEqual([
      'C:\\Program Files\\node.exe',
      `--repo=${sdkRepoPath}`, '--package', packagePath,
      '--output', outputJsonFile, '--again', outputJsonFile,
      '--empty', '', '--literal', 'two words',
    ]);
  });

  it('substitutes paths with suffixes and does not recursively expand values or interpret shell characters', () => {
    const repoWithPlaceholder = path.join(sdkRepoPath, '{PackagePath}');
    const command = `"{SdkRepoPath}${path.sep}tools${path.sep}detector" '{PackagePath}' --out={OutputJsonFile}`;

    expect(getSdkChangesCommandLine({ command }, repoWithPlaceholder, packagePath, outputJsonFile)).toEqual([
      `${repoWithPlaceholder}${path.sep}tools${path.sep}detector`,
      packagePath, `--out=${outputJsonFile}`,
    ]);
  });

  it('preserves escaped quotes in a quoted command argument', () => {
    expect(getSdkChangesCommandLine({ command: 'node -e "console.log(\\"hello\\")"' }, sdkRepoPath, packagePath, outputJsonFile))
      .toEqual(['node', '-e', 'console.log("hello")']);
  });

  it.each(['eng\\Get-Sdk-Changes.ps1', path.resolve('scripts with spaces', 'Get-Sdk-Changes.ps1')])(
    'runs PowerShell script %s with absolute paths and named parameters',
    scriptPath => {
      expect(getSdkChangesCommandLine({ path: scriptPath }, sdkRepoPath, packagePath, outputJsonFile)).toEqual([
        'pwsh', '-NoProfile', '-NonInteractive', '-File', path.resolve(sdkRepoPath, scriptPath),
        '-SdkRepoPath', sdkRepoPath,
        '-PackagePath', packagePath,
        '-OutputJsonFile', outputJsonFile,
      ]);
    },
  );

  it('prefers command over path, like the common CLI', () => {
    expect(getSdkChangesCommandLine({ command: 'node detector.js', path: 'unused.ps1' }, sdkRepoPath, packagePath, outputJsonFile))
      .toEqual(['node', 'detector.js']);
  });

  it.each([{}, { command: ' ' }, { path: '' }, { command: 'node "unterminated' }, { command: '"" argument' }])(
    'rejects unusable invocation %j',
    options => {
      expect(() => getSdkChangesCommandLine(options, sdkRepoPath, packagePath, outputJsonFile)).toThrow(/getSdkChangesScript/);
    },
  );
});

describe('SDK changes markdown', () => {
  it('extracts only breaking-change entries, including nested sections and multiline items', () => {
    const markdown = [
      '## Version',
      '### Breaking Changes',
      '- Removed a method.',
      '  With an explanation.',
      '- Removed a method.',
      '  With an explanation.',
      '#### Models',
      '* Changed a model.',
      '### Features Added',
      '- Added a method.',
      '## Other information',
      '- Not a breaking change.',
    ].join('\r\n');

    expect(getSdkBreakingChangeItems(markdown)).toEqual(['Removed a method.\nWith an explanation.', 'Changed a model.']);
  });

  it('handles numbered entries, paragraphs and heading capitalization', () => {
    expect(getSdkBreakingChangeItems('### breaking changes\n\nRemoved a type.\n\n1. Changed a parameter.\n2. Changed a return value.\n'))
      .toEqual(['Removed a type.', 'Changed a parameter.', 'Changed a return value.']);
  });

  it('does not infer breaks from other sections or from a heading inside a code block', () => {
    expect(getSdkBreakingChangeItems('### Features Added\n\n- Added a method.\n\n```\n### Breaking Changes\n- Example only\n```'))
      .toEqual([]);
  });

  it('merges sections without repeating entries or moving new breaks into the features section', () => {
    const existing = '### Breaking Changes\n\n- Removed one.\n\n### Features Added\n\n- Added one.\n';
    const detected = '### Breaking Changes\n\n* Removed one.\n* Removed two.\n\n### Features Added\n\n- Added one.\n- Added two.\n';
    const merged = mergeSdkChangelogs(existing.split('\n'), detected).join('\n');

    expect(getSdkBreakingChangeItems(merged)).toEqual(['Removed one.', 'Removed two.']);
    for (const item of ['Removed one.', 'Removed two.', 'Added one.', 'Added two.', '### Breaking Changes', '### Features Added']) {
      expect(merged.split(item)).toHaveLength(2);
    }
  });

  it('preserves existing diagnostic text and code blocks rather than deduplicating individual code lines', () => {
    const existing = [
      'Generator diagnostics.',
      '',
      '### Breaking Changes',
      '',
      '```csharp',
      'class OldType {',
      '}',
      'class NewType {',
      '}',
      '```',
    ].join('\n');
    const merged = mergeSdkChangelogs(existing.split('\n'), '### Features Added\n\n- New type.').join('\n');

    expect(merged).toContain(existing);
    expect(merged).toContain('### Features Added');
  });

  it('keeps the original changelog when the detector markdown is empty', () => {
    const existing = ['Existing text', '', '- Existing entry'];
    expect(mergeSdkChangelogs(existing, '')).toBe(existing);
  });

  it('deduplicates identical markdown on repeated detection', () => {
    const markdown = '### Breaking Changes\n\n- Removed a method.\n\n### Features Added\n\n- Added a method.\n';
    const once = mergeSdkChangelogs([], markdown);
    expect(mergeSdkChangelogs(once, markdown)).toEqual(once);
  });

  it('recognizes changelog-script capture prefixes and ANSI formatting without duplicating entries', () => {
    const existing = [
      'cmdout\t[Changelog] \u001b[31m### Breaking Changes\u001b[0m',
      'cmderr\t[Custom Changelog] - Removed a method.',
    ];
    const detected = '### Breaking Changes\n\n- Removed a method.\n';

    expect(getSdkBreakingChangeItems(existing.join('\n'))).toEqual(['Removed a method.']);
    const merged = mergeSdkChangelogs(existing, detected).join('\n');
    expect(merged).not.toContain('[Changelog]');
    expect(merged.split('Removed a method.')).toHaveLength(2);
    expect(merged.split('### Breaking Changes')).toHaveLength(2);
  });

  it('retains reference definitions needed by merged markdown links', () => {
    const existing = '### Breaking Changes\n\n- Removed [OldApi][old].\n\n[old]: https://example.com/old "Old API"\n';
    const detected = '### Features Added\n\n- Added [NewApi][new].\n\n[new]: https://example.com/new\n';
    const merged = mergeSdkChangelogs(existing.split('\n'), detected).join('\n');

    expect(merged).toContain('[old]: <https://example.com/old> "Old API"');
    expect(merged).toContain('[new]: <https://example.com/new>');
    expect(mergeSdkChangelogs(merged.split('\n'), detected).join('\n')).toBe(merged);
  });
});
