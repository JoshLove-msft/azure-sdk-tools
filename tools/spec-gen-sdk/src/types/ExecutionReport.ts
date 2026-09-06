import { SDKAutomationState } from '../automation/sdkAutomationState';
import { requireJsonc } from '../utils/requireJsonc';
import { getTypeTransformer } from './validator';
import { SdkChanges } from './SdkChanges';

export const executionReportSchema = requireJsonc(__dirname + '/ExecutionReportSchema.json');

export type ExecutionReport = {
  packages: PackageReport[];
  executionResult: SDKAutomationState;
  fullLogPath: string;
  filteredLogPath?: string;
  vsoLogPath?: string;
  stagedArtifactsFolder?: string;
  sdkArtifactFolder?: string;
  sdkApiViewArtifactFolder?: string;
  isSdkConfigDuplicated?: boolean;
  generateFromTypeSpec?: boolean;
};

export type PackageReport = {
  serviceName?: string;
  packageName?: string;
  result: SDKAutomationState;
  artifactPaths?: string[];
  readmeMd?: string[];
  typespecProject?: string[]
  version?: string;
  apiViewArtifact?: string;
  language?: string;
  hasBreakingChange?: boolean;
  sdkChanges?: SdkChanges;
  sdkChangesArtifactPath?: string;
  breakingChangeLabel?: string;
  shouldLabelBreakingChange: boolean;
  areBreakingChangeSuppressed?: boolean;
  presentBreakingChangeSuppressions?: string[];
  absentBreakingChangeSuppressions?: string[];
  installInstructions?: string;
};

export const getExecutionReport = getTypeTransformer<ExecutionReport>(executionReportSchema, 'ExecutionReport');
