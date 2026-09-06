export interface SdkChanges {
  changes: string;
  hasBreakingChange: boolean;
  [key: string]: unknown;
}

function isSdkChanges(value: unknown): value is SdkChanges {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    'changes' in value && typeof value.changes === 'string' &&
    'hasBreakingChange' in value && typeof value.hasBreakingChange === 'boolean';
}

export function getSdkChanges(value: unknown): SdkChanges {
  // The configuration validator coerces types; detector results must not be coerced or defaulted.
  if (!isSdkChanges(value)) {
    throw new Error('Invalid getSdkChangesScript output: expected an object with a string "changes" and a boolean "hasBreakingChange".');
  }
  return value;
}
