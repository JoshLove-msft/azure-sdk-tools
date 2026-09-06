import { describe, expect, it } from 'vitest';
import { getSdkChanges } from '../../src/types/SdkChanges';
import { getSwaggerToSdkConfig } from '../../src/types/SwaggerToSdkConfig';

describe('SDK changes output contract', () => {
  it.each([true, false])('accepts the boolean breaking flag %s without changing the raw result', hasBreakingChange => {
    const output = {
      changes: '### Breaking Changes\n\n- Removed a method.\n',
      hasBreakingChange,
      apiChanges: [{ kind: 'removed', oldApi: 'Example.Method', diagnostics: ['CP0002'] }],
      diagnostics: [{ severity: 'warning', message: 'An ambiguous change requires review.' }],
      metadata: { baseline: '1.0.0', candidate: '2.0.0' },
    };

    expect(getSdkChanges(output)).toBe(output);
  });

  it('accepts an empty markdown string when there are no changes', () => {
    expect(getSdkChanges({ changes: '', hasBreakingChange: false })).toEqual({ changes: '', hasBreakingChange: false });
  });

  it.each([true, false])('preserves finalized .NET details without interpreting them (common flag=%s)', hasBreakingChange => {
    const details = {
      baselineVersion: '1.0.0',
      apiChanges: [
        {
          kind: 'removed',
          symbol: 'Example.Client.OldMethod',
          description: 'Removed a public method.',
          isBreaking: true,
          diagnosticId: 'CP0002',
          targetFramework: 'net8.0',
        },
        {
          kind: 'added',
          symbol: 'Example.Client.NewMethod',
          description: 'Added a public method.',
          isBreaking: false,
        },
      ],
      diagnostics: [],
      limitations: [],
    };
    const output = { changes: 'SDK changes.', hasBreakingChange, details };

    const parsed = getSdkChanges(output);

    expect(parsed).toBe(output);
    expect(parsed.details).toBe(details);
    expect(parsed.hasBreakingChange).toBe(hasBreakingChange);
  });

  it.each([
    { name: 'undefined', value: undefined },
    { name: 'null', value: null },
    { name: 'an array', value: [] },
    { name: 'a string', value: 'not a result' },
    { name: 'a boolean', value: false },
    { name: 'an empty object', value: {} },
    { name: 'an error response', value: { error: 'Compatibility could not be checked.' } },
    { name: 'missing changes', value: { hasBreakingChange: false } },
    { name: 'missing breaking flag', value: { changes: 'Changes' } },
    { name: 'null changes', value: { changes: null, hasBreakingChange: false } },
    { name: 'numeric changes', value: { changes: 1, hasBreakingChange: false } },
    { name: 'array changes', value: { changes: [], hasBreakingChange: false } },
    { name: 'string false', value: { changes: '', hasBreakingChange: 'false' } },
    { name: 'string true', value: { changes: '', hasBreakingChange: 'true' } },
    { name: 'numeric flag', value: { changes: '', hasBreakingChange: 0 } },
    { name: 'null flag', value: { changes: '', hasBreakingChange: null } },
  ])('rejects $name instead of defaulting to a clean result', ({ value }) => {
    expect(() => getSdkChanges(value)).toThrow('Invalid getSdkChangesScript output');
  });
});

describe('getSdkChangesScript configuration', () => {
  it('leaves the detector disabled when it is not configured', () => {
    expect(getSwaggerToSdkConfig({}).packageOptions.getSdkChangesScript).toBeUndefined();
  });

  it.each([
    { command: 'node detector.js --output {OutputJsonFile}' },
    { path: 'eng\\Get-Sdk-Changes.ps1' },
    { command: 'node detector.js', path: 'eng\\fallback.ps1' },
  ])('accepts the common CLI configuration %j', script => {
    expect(getSwaggerToSdkConfig({ packageOptions: { getSdkChangesScript: script } }).packageOptions.getSdkChangesScript)
      .toMatchObject(script);
  });

  it.each([{}, null, '', { command: '' }, { path: ' ' }, { command: ' ', path: '' }])(
    'rejects an unusable configured detector %j',
    script => {
      expect(() => getSwaggerToSdkConfig({ packageOptions: { getSdkChangesScript: script } }))
        .toThrow('getSdkChangesScript');
    },
  );
});
