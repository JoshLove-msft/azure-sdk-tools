const fs = require('node:fs');
const path = require('node:path');

const [mode, inputJsonFile, outputJsonFile] = process.argv.slice(2);
const input = JSON.parse(fs.readFileSync(inputJsonFile, 'utf8'));

if (mode === 'init') {
  fs.writeFileSync(outputJsonFile, '{}');
} else {
  const packagePath = 'sdk/generated/Example.Generated.Package';
  fs.mkdirSync(path.resolve(packagePath), { recursive: true });
  const packageResult = {
    packageName: 'Example.Generated.Package',
    path: [packagePath, 'sdk/generated/ci.mgmt.yml'],
    result: mode === 'named-failure' ? 'failed' : 'warning',
    version: '1.0.0',
    language: '.Net',
    typespecProject: input.relatedTypeSpecProjectFolder,
    artifacts: [],
    apiViewArtifact: '',
    changelog: { content: '', hasBreakingChange: false, breakingChangeItems: [] },
  };
  const anonymousFailure = { result: 'failed', path: [''] };
  const warning = mode === 'build-warning' || mode === 'analyzer-warning';
  console.log(warning
    ? `[WARNING] Unrelated ${mode === 'build-warning' ? 'build' : 'analyzer'} failure.`
    : '[ERROR] Generation reported a failure.');

  if (mode === 'malformed-output') {
    fs.writeFileSync(outputJsonFile, '{"packages":');
  } else if (mode !== 'missing-output') {
    const packages = mode === 'anonymous-failure'
      ? [anonymousFailure]
      : mode === 'mixed-failure' ? [anonymousFailure, packageResult] : [packageResult];
    fs.writeFileSync(outputJsonFile, JSON.stringify({ packages }));
  }
  process.exitCode = warning ? 0 : 1;
}
