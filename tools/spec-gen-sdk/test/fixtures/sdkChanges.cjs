const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const getArgument = (name) => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
const mode = getArgument('--mode') ?? 'breaking';

if (mode === 'build-failure') {
  console.error('Build failed: unrelated compiler error.');
  process.exitCode = 1;
} else if (mode === 'analyzer-failure') {
  console.log('error CS0001: unrelated analyzer diagnostic.');
} else if (mode === 'changelog') {
  console.log('### Breaking Changes\n\n- Removed an API.\n');
} else {
  const sdkRepoPath = getArgument('--sdk-repo');
  const packagePath = getArgument('--package');
  const outputJsonFile = getArgument('--output');
  if (![sdkRepoPath, packagePath, outputJsonFile].every(value => value && path.isAbsolute(value))) {
    throw new Error('The SDK, package and output paths must all be absolute.');
  }
  if (process.cwd() !== packagePath) {
    throw new Error('The working directory must be the package directory.');
  }
  if (fs.existsSync(outputJsonFile)) {
    throw new Error('The detector must not receive a stale output file.');
  }
  if (mode !== 'missing') {
    const input = path.join(packagePath, 'detector-result.json');
    const result = {
      changes: mode === 'clean'
        ? '### Features Added\n\n- Added an API.\n'
        : '### Breaking Changes\n\n- Removed an API.\n\n### Features Added\n\n- Added an API.\n',
      hasBreakingChange: mode !== 'clean',
      apiChanges: [{ kind: mode === 'clean' ? 'added' : 'removed', symbol: 'Example.Client.Method' }],
      diagnostics: [{ id: 'CP0002', message: 'Compatibility diagnostic' }],
      sdkRepoPath,
      packagePath,
      workingDirectory: process.cwd(),
    };
    fs.writeFileSync(outputJsonFile, fs.existsSync(input) ? fs.readFileSync(input) : JSON.stringify(result));
  }
  if (mode === 'failure') {
    console.error('SDK compatibility detection failed.');
    process.exitCode = 7;
  } else if (mode === 'script-error') {
    console.log('error: SDK compatibility detection failed.');
  } else if (mode === 'warning') {
    console.error('Warning: additional compatibility diagnostics are available.');
  }
  const errorStream = getArgument('--error-stream');
  if (errorStream) {
    const stream = errorStream === 'stdout' ? process.stdout : process.stderr;
    const newline = getArgument('--error-output') === 'newline' ? '\n' : '';
    stream.write(`error: detector failed${newline}`);
  }
}
