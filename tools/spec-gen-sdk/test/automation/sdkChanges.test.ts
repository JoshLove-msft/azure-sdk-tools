import * as fs from 'node:fs';
import * as path from 'node:path';
import * as winston from 'winston';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommentCaptureTransport, sdkAutoLogLevels } from '../../src/automation/logging';
import { generateReport, saveFilteredLog } from '../../src/automation/reportStatus';
import { workflowMain } from '../../src/automation/workflow';
import { workflowPkgCallGetSdkChangesScript, workflowPkgMain } from '../../src/automation/workflowPackage';
import { PackageResult } from '../../src/types/GenerateOutput';
import { getPackageData, PackageData } from '../../src/types/PackageData';
import { sdkLabels } from '../../src/types/sdks';
import { getSwaggerToSdkConfig } from '../../src/types/SwaggerToSdkConfig';
import { FailureType, WorkflowContext } from '../../src/types/Workflow';
import { SDKSuppressionContentList } from '../../src/utils/handleSuppressionLines';
import * as runScript from '../../src/utils/runScript';

describe('configured SDK changes workflow', () => {
  const fixturePath = path.resolve(__dirname, '..', 'fixtures', 'sdkChanges.cjs');
  let root: string;
  let context: WorkflowContext;
  let pkg: PackageData;

  function detectorCommand(mode = 'breaking'): string {
    return `"${process.execPath}" "${fixturePath}" --sdk-repo "{SdkRepoPath}" --package "{PackagePath}" --output "{OutputJsonFile}" --mode ${mode}`;
  }

  function createPackage(overrides: Partial<PackageResult> = {}, suppressions?: string[]): PackageData {
    const result: PackageResult = {
      packageName: 'Example.Package',
      path: ['sdk/service/Example.Package'],
      result: 'succeeded',
      version: '1.0.0',
      language: '.Net',
      typespecProject: ['specification/service/Service.Management'],
      ...overrides,
    };
    const suppressionContent: SDKSuppressionContentList | undefined = suppressions === undefined ? undefined : new Map([
      [context.specConfigPath!, {
        content: {
          suppressions: {
            [context.config.sdkName]: [{ package: result.packageName!, 'breaking-changes': suppressions }],
          },
        },
        sdkSuppressionFilePath: 'specification/service/Service.Management/sdk-suppressions.yaml',
        errors: [],
      }],
    ]);
    const data = getPackageData(context, result, suppressionContent);
    if (data.relativeFolderPath) {
      fs.mkdirSync(path.resolve(context.config.localSdkRepoPath, data.relativeFolderPath), { recursive: true });
    }
    return data;
  }

  function writeDetectorOutput(content: string): void {
    fs.writeFileSync(path.resolve(context.config.localSdkRepoPath, pkg.relativeFolderPath, 'detector-result.json'), content);
  }

  function prepareGenerationWorkflow(mode: string): void {
    const generationFixture = path.resolve(__dirname, '..', 'fixtures', 'sdkGeneration.cjs');
    fs.copyFileSync(generationFixture, path.join(context.config.localSdkRepoPath, 'generation.cjs'));
    context.config.tspConfigPath = context.specConfigPath;
    context.specRepoConfig.typespecEmitterToSdkRepositoryMapping = {
      '@azure-typespec/http-client-csharp-mgmt': context.config.sdkName,
    };
    const tspConfig = path.resolve(context.config.localSpecRepoPath, context.specConfigPath!);
    fs.mkdirSync(path.dirname(tspConfig), { recursive: true });
    fs.writeFileSync(tspConfig, 'options:\n  "@azure-typespec/http-client-csharp-mgmt": {}\n');
    context.swaggerToSdkConfig.initOptions = {
      initScript: { path: 'node generation.cjs init' },
    };
    context.swaggerToSdkConfig.generateOptions.generateScript = {
      path: `node generation.cjs ${mode}`,
      stdout: { scriptError: /\[ERROR\]/, scriptWarning: /\[WARNING\]/ },
      stderr: { scriptError: /\[ERROR\]/, scriptWarning: /\[WARNING\]/ },
      exitCode: { result: 'error', showInComment: true },
    };
    context.swaggerToSdkConfig.generateOptions.parseGenerateOutput = true;
  }

  function readReport() {
    generateReport(context);
    return JSON.parse(fs.readFileSync(path.join(context.tmpFolder, 'execution-report.json'), 'utf8'));
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(__dirname, 'sdk-changes-'));
    const messages: string[] = [];
    const transport = new CommentCaptureTransport({ extraLevelFilter: ['error', 'warn'], output: messages });
    const sdkRepo = { owner: 'Azure', name: 'azure-sdk-for-net' };
    context = {
      config: {
        specRepo: { owner: 'Azure', name: 'azure-rest-api-specs' },
        sdkName: sdkRepo.name,
        branchPrefix: 'test',
        localSpecRepoPath: path.join(root, 'spec'),
        localSdkRepoPath: path.join(root, "SDK repo & one's"),
        runMode: 'spec-pull-request',
        specCommitSha: 'test-sha',
        specRepoHttpsUrl: 'https://github.com/Azure/azure-rest-api-specs',
        workingFolder: root,
        runEnv: 'test',
        version: 'test',
      },
      logger: winston.createLogger({ levels: sdkAutoLogLevels.levels, level: 'debug', transports: [transport] }),
      fullLogFileName: path.join(root, 'out', 'logs', 'full.log'),
      filteredLogFileName: path.join(root, 'out', 'logs', 'filtered.log'),
      htmlLogFileName: path.join(root, 'out', 'logs', 'report.html'),
      vsoLogFileName: path.join(root, 'out', 'logs', 'vso.log'),
      specRepoConfig: { sdkRepositoryMappings: {}, overrides: {}, typespecEmitterToSdkRepositoryMapping: {} },
      sdkRepoConfig: {
        mainRepository: sdkRepo,
        mainBranch: 'main',
        integrationRepository: sdkRepo,
        integrationBranchPrefix: 'test',
        secondaryRepository: sdkRepo,
        secondaryBranch: 'main',
        configFilePath: 'eng/swagger_to_sdk_config.json',
      },
      swaggerToSdkConfig: getSwaggerToSdkConfig({ packageOptions: { getSdkChangesScript: { command: detectorCommand() } } }),
      isPrivateSpecRepo: false,
      specConfigPath: 'specification/service/Service.Management/tspconfig.yaml',
      pendingPackages: [],
      handledPackages: [],
      status: 'succeeded',
      messages,
      messageCaptureTransport: transport,
      scriptEnvs: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
      tmpFolder: path.join(root, 'tmp'),
      vsoLogs: new Map(),
    };
    fs.mkdirSync(path.join(root, 'out', 'logs'), { recursive: true });
    fs.mkdirSync(context.tmpFolder);
    pkg = createPackage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    context.logger.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('preserves the no-config workflow, including existing breaking-change and suppression information', async () => {
    context.swaggerToSdkConfig.packageOptions.getSdkChangesScript = undefined;
    pkg = createPackage({
      changelog: { content: '### Breaking Changes\n\n- Legacy change.', hasBreakingChange: true, breakingChangeItems: ['Legacy change.'] },
    }, ['Legacy change.']);
    const previousChangelogs = [...pkg.changelogs];

    await workflowPkgMain(context, pkg);
    context.handledPackages = [pkg];
    const report = readReport();

    expect(pkg.status).toBe('succeeded');
    expect(pkg.hasBreakingChange).toBe(true);
    expect(pkg.changelogs).toEqual(previousChangelogs);
    expect(pkg.presentSuppressionLines).toEqual(['Legacy change.']);
    expect(pkg.absentSuppressionLines).toEqual([]);
    expect(pkg.sdkChanges).toBeUndefined();
    expect(pkg.sdkChangesArtifactPath).toBeUndefined();
    expect(fs.existsSync(path.join(root, 'out', 'stagedArtifacts', 'sdk-changes'))).toBe(false);
    expect(report.packages[0]).not.toHaveProperty('sdkChanges');
    expect(report.packages[0]).not.toHaveProperty('sdkChangesArtifactPath');
    expect(report.packages[0]).toMatchObject({ areBreakingChangeSuppressed: true, shouldLabelBreakingChange: false });
  });

  it.each(Object.keys(sdkLabels))('runs for configured language %s without adding a language gate', async sdkName => {
    context.config.sdkName = sdkName;
    context.sdkRepoConfig.mainRepository.name = sdkName;

    await workflowPkgCallGetSdkChangesScript(context, pkg);

    expect(pkg.status).toBe('succeeded');
    expect(pkg.hasBreakingChange).toBe(true);
    expect(pkg.sdkChanges).toMatchObject({
      sdkRepoPath: path.resolve(context.config.localSdkRepoPath),
      packagePath: path.resolve(context.config.localSdkRepoPath, pkg.relativeFolderPath),
      workingDirectory: path.resolve(context.config.localSdkRepoPath, pkg.relativeFolderPath),
    });
    expect(path.isAbsolute(pkg.sdkChangesArtifactPath!)).toBe(true);
  });

  it('runs script paths using named PowerShell arguments rather than positional package arguments', async () => {
    context.swaggerToSdkConfig.packageOptions.getSdkChangesScript = { path: path.join('eng', 'Get SDK Changes.ps1') };
    const execute = vi.spyOn(runScript, 'runSdkAutoCustomScript').mockImplementationOnce(async (_context, _options, invocation) => {
      const commandLine = invocation.commandLine!;
      fs.writeFileSync(commandLine[commandLine.indexOf('-OutputJsonFile') + 1], '{"changes":"","hasBreakingChange":false}');
      return 'succeeded';
    });

    await workflowPkgCallGetSdkChangesScript(context, pkg);

    const invocation = execute.mock.calls[0][2];
    expect(invocation).toMatchObject({
      cwd: path.resolve(context.config.localSdkRepoPath, pkg.relativeFolderPath),
      continueOnFailed: true,
      statusContext: pkg,
    });
    expect(invocation.commandLine).toEqual([
      'pwsh', '-NoProfile', '-NonInteractive', '-File', path.resolve(context.config.localSdkRepoPath, 'eng', 'Get SDK Changes.ps1'),
      '-SdkRepoPath', path.resolve(context.config.localSdkRepoPath),
      '-PackagePath', path.resolve(context.config.localSdkRepoPath, pkg.relativeFolderPath),
      '-OutputJsonFile', pkg.sdkChangesArtifactPath,
    ]);
    expect(pkg.hasBreakingChange).toBe(false);
  });

  it('resolves relative repository and working-folder configuration before invoking the detector', async () => {
    context.config.localSdkRepoPath = path.relative(process.cwd(), context.config.localSdkRepoPath);
    context.config.workingFolder = path.relative(process.cwd(), root);

    await workflowPkgCallGetSdkChangesScript(context, pkg);

    expect(pkg.status).toBe('succeeded');
    expect(path.isAbsolute(pkg.sdkChangesArtifactPath!)).toBe(true);
    expect(pkg.sdkChanges?.sdkRepoPath).toBe(path.resolve(context.config.localSdkRepoPath));
  });

  it('records a clean result and feature markdown without inferring breaks from diagnostics', async () => {
    context.swaggerToSdkConfig.packageOptions.getSdkChangesScript = { command: detectorCommand('clean') };

    await workflowPkgMain(context, pkg);

    expect(pkg.hasBreakingChange).toBe(false);
    expect(pkg.status).toBe('succeeded');
    expect(pkg.changelogs.join('\n')).toContain('Added an API.');
    expect(pkg.sdkChanges?.diagnostics).toEqual([{ id: 'CP0002', message: 'Compatibility diagnostic' }]);
    expect(pkg.breakingChangeItems).toBeUndefined();
    expect(pkg.absentSuppressionLines).toEqual([]);
  });

  it('preserves raw JSON bytes, optional structured details and markdown in existing report paths', async () => {
    const result = {
      changes: '### Breaking Changes\n\n- Removed an API.\n',
      hasBreakingChange: true,
      details: {
        baselineVersion: '1.0.0',
        apiChanges: [
          {
            kind: 'removed',
            symbol: 'Example.Api',
            description: 'Removed an API.',
            isBreaking: true,
            diagnosticId: 'CP0002',
            targetFramework: 'net8.0',
          },
          {
            kind: 'added',
            symbol: 'Example.NewApi',
            description: 'Added an API.',
            isBreaking: false,
          },
        ],
        diagnostics: [],
        limitations: [],
      },
    };
    const raw = `\uFEFF${JSON.stringify(result, null, 4)}\r\n`;
    writeDetectorOutput(raw);
    context.config.pullNumber = '123';
    context.config.tspConfigPath = context.specConfigPath;
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await workflowPkgMain(context, pkg);
    context.handledPackages = [pkg];
    const report = readReport();
    saveFilteredLog(context);

    expect(pkg.sdkChanges).toEqual(result);
    expect(fs.readFileSync(pkg.sdkChangesArtifactPath!, 'utf8')).toBe(raw);
    expect(report.packages[0]).toMatchObject({
      sdkChanges: result,
      sdkChangesArtifactPath: pkg.sdkChangesArtifactPath,
      hasBreakingChange: true,
      shouldLabelBreakingChange: true,
    });
    expect(pkg.artifactPaths).toEqual([]);
    const markdownName = fs.readdirSync(path.join(root, 'out', 'logs')).find(name => name.endsWith('-package-report.md'))!;
    expect(fs.readFileSync(path.join(root, 'out', 'logs', markdownName), 'utf8')).toContain('## SDK Changes\n### Breaking Changes');
    const filtered = JSON.parse(fs.readFileSync(context.filteredLogFileName, 'utf8'));
    expect(filtered.message).toContain('<summary>SDK changes</summary>');
    expect(filtered.message).toContain('Removed an API.');
  });

  it('does not classify opaque .NET details or use them instead of the common breaking flag', async () => {
    const result = {
      changes: '### Features Added\n\n- Added an API.\n',
      hasBreakingChange: false,
      details: {
        baselineVersion: '1.0.0',
        apiChanges: [{
          kind: 'removed',
          symbol: 'Example.Api',
          description: 'A diagnostic retained for later common classification.',
          isBreaking: true,
          diagnosticId: 'CP0002',
          targetFramework: 'net8.0',
        }],
        diagnostics: ['error: diagnostic text is opaque metadata, not script output.'],
        limitations: ['Requires review during common classification.'],
      },
    };
    const raw = JSON.stringify(result);
    writeDetectorOutput(raw);

    await workflowPkgMain(context, pkg);
    context.handledPackages = [pkg];
    const report = readReport();

    expect(pkg.status).toBe('succeeded');
    expect(pkg.hasBreakingChange).toBe(false);
    expect(pkg.breakingChangeItems).toBeUndefined();
    expect(pkg.absentSuppressionLines).toEqual([]);
    expect(fs.readFileSync(pkg.sdkChangesArtifactPath!, 'utf8')).toBe(raw);
    expect(report.packages[0]).toMatchObject({
      sdkChanges: result,
      hasBreakingChange: false,
      shouldLabelBreakingChange: false,
      result: 'succeeded',
    });
    expect(report.packages[0].sdkChanges.details).toEqual(result.details);
  });

  it.each([
    { name: 'malformed JSON', content: '{"changes":' },
    { name: 'an error object', content: '{"error":"Detection failed"}' },
    { name: 'a missing changes field', content: '{"hasBreakingChange":false}' },
    { name: 'a missing breaking flag', content: '{"changes":"No changes"}' },
    { name: 'a coerced boolean', content: '{"changes":"","hasBreakingChange":"false"}' },
    { name: 'an array', content: '[]' },
    { name: 'null', content: 'null' },
    { name: 'empty output', content: '' },
  ])('fails and retains diagnostics for $name without reporting a clean result', async ({ content }) => {
    writeDetectorOutput(content);
    context.config.runEnv = 'azureDevOps';

    await workflowPkgMain(context, pkg);
    context.handledPackages = [pkg];
    const report = readReport();

    expect(pkg.status).toBe('failed');
    expect(pkg.hasBreakingChange).toBeUndefined();
    expect(pkg.sdkChanges).toBeUndefined();
    expect(fs.readFileSync(pkg.sdkChangesArtifactPath!, 'utf8')).toBe(content);
    expect(pkg.messages.join('\n')).toContain('getSdkChangesScript failed');
    expect(context.failureType).toBe(FailureType.CodegenFailed);
    expect(context.vsoLogs.get('GetSdkChanges')?.errors?.join('\n')).toContain('getSdkChangesScript failed');
    expect(report.executionResult).toBe('failed');
    expect(report.packages[0].result).toBe('failed');
    expect(report.packages[0]).not.toHaveProperty('sdkChanges');
  });

  it('fails when a successful process does not write the required output file', async () => {
    context.swaggerToSdkConfig.packageOptions.getSdkChangesScript = { command: detectorCommand('missing') };

    await workflowPkgMain(context, pkg);

    expect(pkg.status).toBe('failed');
    expect(pkg.hasBreakingChange).toBeUndefined();
    expect(pkg.sdkChangesArtifactPath).toBeUndefined();
    expect(pkg.messages.join('\n')).toContain('getSdkChangesScript failed');
  });

  it('does not accept a valid-looking output from a failing script, even with ignore exit-code configuration', async () => {
    pkg.hasBreakingChange = false;
    context.swaggerToSdkConfig.packageOptions.getSdkChangesScript = {
      command: detectorCommand('failure'),
      exitCode: { result: 'ignore', showInComment: false },
    };

    await workflowPkgMain(context, pkg);

    expect(pkg.status).toBe('failed');
    expect(pkg.hasBreakingChange).toBeUndefined();
    expect(pkg.sdkChanges).toBeUndefined();
    expect(fs.existsSync(pkg.sdkChangesArtifactPath!)).toBe(true);
    expect(pkg.messages.join('\n')).toContain('code [7]');
  });

  it.each([true, false])('retains known breaks, not a stale clean flag, after invalid output (previous=%s)', async previous => {
    pkg.hasBreakingChange = previous;
    writeDetectorOutput('not JSON');

    await workflowPkgMain(context, pkg);
    context.handledPackages = [pkg];
    const report = readReport();

    expect(pkg.status).toBe('failed');
    expect(pkg.hasBreakingChange).toBe(previous ? true : undefined);
    expect(report.packages[0].hasBreakingChange).toBe(previous ? true : undefined);
    expect(pkg.sdkChanges).toBeUndefined();
  });

  it('honors configured script error and warning log policies', async () => {
    context.swaggerToSdkConfig.packageOptions.getSdkChangesScript = {
      command: detectorCommand('script-error'),
      stdout: { scriptError: /error:/ },
    };
    await workflowPkgMain(context, pkg);
    expect(pkg.status).toBe('failed');
    expect(pkg.sdkChanges).toBeUndefined();

    const warningPackage = createPackage();
    context.swaggerToSdkConfig.packageOptions.getSdkChangesScript = {
      command: detectorCommand('warning'),
      stderr: { scriptWarning: true },
    };
    await workflowPkgMain(context, warningPackage);
    expect(warningPackage.status).toBe('warning');
    expect(warningPackage.hasBreakingChange).toBe(true);
    expect(warningPackage.sdkChanges).toBeDefined();
  });

  describe.each(['stdout', 'stderr'] as const)('%s detector stream policy', streamName => {
    it.each(['unterminated', 'newline'])('ignores valid clean JSON after an exit-zero %s error', async outputStyle => {
      const raw = JSON.stringify({ changes: '### Features Added\n\n- Added an API.\n', hasBreakingChange: false });
      writeDetectorOutput(raw);
      pkg.hasBreakingChange = false;
      context.config.runEnv = 'azureDevOps';
      context.swaggerToSdkConfig.packageOptions.getSdkChangesScript = {
        command: `${detectorCommand('clean')} --error-stream ${streamName} --error-output ${outputStyle}`,
        [streamName]: { scriptError: /error:/ },
      };
      const log = vi.spyOn(context.logger, 'log');

      await workflowPkgMain(context, pkg);
      context.handledPackages = [pkg];
      const report = readReport();

      expect(pkg.status).toBe('failed');
      expect(log).toHaveBeenCalledWith('error', expect.stringContaining('code [0] signal [null]'), expect.any(Object));
      expect(pkg.sdkChanges).toBeUndefined();
      expect(pkg.hasBreakingChange).toBeUndefined();
      expect(pkg.messages.join('\n')).toContain('error: detector failed');
      expect(fs.readFileSync(pkg.sdkChangesArtifactPath!, 'utf8')).toBe(raw);
      expect([...context.vsoLogs.values()].flatMap(entry => entry.errors ?? [])).toContain('error: detector failed');
      expect(report.executionResult).toBe('failed');
      expect(report.packages[0].result).toBe('failed');
      expect(report.packages[0]).not.toHaveProperty('sdkChanges');
      expect(report.packages[0]).not.toHaveProperty('hasBreakingChange');
      expect(report.packages[0].sdkChangesArtifactPath).toBe(pkg.sdkChangesArtifactPath);
    });
  });

  it('handles asynchronous process-start failures without hanging or returning a clean result', async () => {
    context.swaggerToSdkConfig.packageOptions.getSdkChangesScript = { command: 'nonexistent-sdk-detector-executable' };

    await workflowPkgMain(context, pkg);

    expect(pkg.status).toBe('failed');
    expect(pkg.sdkChanges).toBeUndefined();
    expect(pkg.hasBreakingChange).toBeUndefined();
    expect(pkg.messages.join('\n')).toContain('nonexistent-sdk-detector-executable');
  });

  it('reports invocation exceptions as package failures', async () => {
    vi.spyOn(runScript, 'runSdkAutoCustomScript').mockRejectedValueOnce(new Error('Process could not be started'));

    await workflowPkgMain(context, pkg);

    expect(pkg.status).toBe('failed');
    expect(pkg.messages.join('\n')).toContain('Process could not be started');
    expect(pkg.sdkChanges).toBeUndefined();
  });

  it('does not silently detect against the entire repository when the package path is missing', async () => {
    pkg = createPackage({ path: [] });

    await workflowPkgMain(context, pkg);

    expect(pkg.status).toBe('failed');
    expect(pkg.messages.join('\n')).toContain('requires a package folder');
    expect(pkg.sdkChangesArtifactPath).toBeUndefined();
  });

  it.each(['build-failure', 'analyzer-failure'])('runs after %s while preserving the build failure', async mode => {
    fs.copyFileSync(fixturePath, path.join(context.config.localSdkRepoPath, 'build.cjs'));
    context.swaggerToSdkConfig.packageOptions.buildScript = {
      path: `node build.cjs --mode ${mode}`,
      exitCode: { result: 'error', showInComment: true },
      stdout: { scriptError: /error CS0001/ },
    };

    await workflowPkgMain(context, pkg);

    expect(pkg.status).toBe('failed');
    expect(pkg.hasBreakingChange).toBe(true);
    expect(pkg.sdkChanges?.hasBreakingChange).toBe(true);
    expect(pkg.messages.join('\n')).toContain(mode === 'build-failure' ? 'code [1]' : 'unrelated analyzer diagnostic');
  });

  it('runs for packages already failed by generation without clearing package or workflow failure', async () => {
    context.status = 'failed';
    context.swaggerToSdkConfig.generateOptions.generateScript = { path: 'generation-already-ran' };
    pkg.status = 'failed';

    await workflowPkgMain(context, pkg);

    expect(pkg.sdkChanges?.hasBreakingChange).toBe(true);
    expect(pkg.status).toBe('failed');
    expect(context.status).toBe('failed');
  });

  describe('package selection after generateScript execution', () => {
    it.each([
      { mode: 'build-warning', packageStatus: 'warning', workflowStatus: 'warning' },
      { mode: 'analyzer-warning', packageStatus: 'warning', workflowStatus: 'warning' },
      { mode: 'named-failure', packageStatus: 'failed', workflowStatus: 'failed' },
      { mode: 'mixed-failure', packageStatus: 'warning', workflowStatus: 'failed' },
    ])('dispatches the emitted package through workflowMain after $mode', async ({ mode, packageStatus, workflowStatus }) => {
      prepareGenerationWorkflow(mode);
      const log = vi.spyOn(context.logger, 'log');

      await workflowMain(context);

      expect(context.status).toBe(workflowStatus);
      expect(context.pendingPackages).toEqual([]);
      expect(context.handledPackages).toHaveLength(1);
      const generatedPackage = context.handledPackages[0];
      expect(generatedPackage).not.toBe(pkg);
      expect(generatedPackage).toMatchObject({
        name: 'Example.Generated.Package',
        relativeFolderPath: 'sdk/generated/Example.Generated.Package',
        status: packageStatus,
        hasBreakingChange: true,
        sdkChanges: {
          hasBreakingChange: true,
          packagePath: path.resolve(context.config.localSdkRepoPath, 'sdk', 'generated', 'Example.Generated.Package'),
        },
      });
      expect(fs.existsSync(generatedPackage.sdkChangesArtifactPath!)).toBe(true);
      expect(log).toHaveBeenCalledWith('section', 'Call generateScript');
      expect(log).toHaveBeenCalledWith('section', 'Handle package Example.Generated.Package');
      expect(log).toHaveBeenCalledWith('section', 'Call GetSdkChangesScript');
      const report = readReport();
      expect(report.executionResult).toBe(workflowStatus);
      expect(report.packages[0]).toMatchObject({ result: packageStatus, hasBreakingChange: true });
    });

    it.each(['missing-output', 'malformed-output'])('surfaces the upstream %s gate instead of claiming detection ran', async mode => {
      prepareGenerationWorkflow(mode);
      const log = vi.spyOn(context.logger, 'log');

      await expect(workflowMain(context)).rejects.toThrow('Failed to read generateOutput.json');

      expect(context.status).toBe('failed');
      expect(context.pendingPackages).toEqual([]);
      expect(context.handledPackages).toEqual([]);
      expect(log).not.toHaveBeenCalledWith('section', 'Call GetSdkChangesScript');
      expect(fs.existsSync(path.join(root, 'out', 'stagedArtifacts', 'sdk-changes'))).toBe(false);
    });

    it('does not dispatch anonymous generation failures that lack a package name and path', async () => {
      prepareGenerationWorkflow('anonymous-failure');
      const log = vi.spyOn(context.logger, 'log');

      await workflowMain(context);

      expect(context.status).toBe('failed');
      expect(context.pendingPackages).toEqual([]);
      expect(context.handledPackages).toEqual([]);
      expect(log).not.toHaveBeenCalledWith('section', 'Call GetSdkChangesScript');
      expect(fs.existsSync(path.join(root, 'out', 'stagedArtifacts', 'sdk-changes'))).toBe(false);
      expect(readReport()).toMatchObject({ executionResult: 'failed', packages: [] });
    });
  });

  it('uses independent output paths for packages with the same name', async () => {
    const second = createPackage({ path: ['sdk/other/Example.Package'] });
    await workflowPkgCallGetSdkChangesScript(context, pkg);
    await workflowPkgCallGetSdkChangesScript(context, second);

    expect(pkg.sdkChangesArtifactPath).not.toBe(second.sdkChangesArtifactPath);
    expect(pkg.sdkChanges?.packagePath).toBe(path.resolve(context.config.localSdkRepoPath, pkg.relativeFolderPath));
    expect(second.sdkChanges?.packagePath).toBe(path.resolve(context.config.localSdkRepoPath, second.relativeFolderPath));
    expect(fs.existsSync(pkg.sdkChangesArtifactPath!)).toBe(true);
    expect(fs.existsSync(second.sdkChangesArtifactPath!)).toBe(true);
  });

  it('never reuses stale files or a previous structured result on a failed retry', async () => {
    await workflowPkgCallGetSdkChangesScript(context, pkg);
    const firstOutput = pkg.sdkChangesArtifactPath!;
    context.swaggerToSdkConfig.packageOptions.getSdkChangesScript = { command: detectorCommand('missing') };

    await workflowPkgCallGetSdkChangesScript(context, pkg);

    expect(fs.existsSync(firstOutput)).toBe(true);
    expect(pkg.status).toBe('failed');
    expect(pkg.sdkChanges).toBeUndefined();
    expect(pkg.sdkChangesArtifactPath).toBeUndefined();
    expect(pkg.hasBreakingChange).toBe(true);
  });

  it('preserves existing breaks and suppressions when the detector returns clean', async () => {
    pkg = createPackage({
      changelog: { content: '### Breaking Changes\n\n- Legacy change.', hasBreakingChange: true, breakingChangeItems: ['Legacy change.'] },
    }, ['Legacy change.']);
    context.swaggerToSdkConfig.packageOptions.getSdkChangesScript = { command: detectorCommand('clean') };

    await workflowPkgCallGetSdkChangesScript(context, pkg);

    expect(pkg.hasBreakingChange).toBe(true);
    expect(pkg.sdkChanges?.hasBreakingChange).toBe(false);
    expect(pkg.breakingChangeItems).toEqual(['Legacy change.']);
    expect(pkg.presentSuppressionLines).toEqual(['Legacy change.']);
    expect(pkg.absentSuppressionLines).toEqual([]);
    expect(pkg.changelogs.join('\n')).toContain('Legacy change.');
    expect(pkg.changelogs.join('\n')).toContain('Added an API.');
  });

  it('deduplicates breaks already included by generation and applies existing suppressions', async () => {
    pkg = createPackage({
      changelog: {
        content: '### Breaking Changes\n\n- Removed an API.\n',
        hasBreakingChange: true,
        breakingChangeItems: ['Removed an API.'],
      },
    }, ['Removed an API.']);

    await workflowPkgCallGetSdkChangesScript(context, pkg);
    context.handledPackages = [pkg];
    const report = readReport();

    expect(pkg.breakingChangeItems).toEqual(['Removed an API.']);
    expect(pkg.changelogs.join('\n').split('Removed an API.')).toHaveLength(2);
    expect(pkg.presentSuppressionLines).toEqual(['Removed an API.']);
    expect(pkg.absentSuppressionLines).toEqual([]);
    expect(report.packages[0]).toMatchObject({
      hasBreakingChange: true, areBreakingChangeSuppressed: true, shouldLabelBreakingChange: false,
    });
  });

  it('re-evaluates suppression coverage for the union of existing and newly detected breaks', async () => {
    pkg = createPackage({
      changelog: { content: '### Breaking Changes\n\n- Legacy change.', hasBreakingChange: true, breakingChangeItems: ['Legacy change.'] },
    }, ['Legacy change.']);

    await workflowPkgCallGetSdkChangesScript(context, pkg);
    context.handledPackages = [pkg];
    const report = readReport();

    expect(pkg.breakingChangeItems).toEqual(['Legacy change.', 'Removed an API.']);
    expect(pkg.presentSuppressionLines).toEqual(['Legacy change.']);
    expect(pkg.absentSuppressionLines).toEqual(['+\tRemoved an API.']);
    expect(report.packages[0]).toMatchObject({ areBreakingChangeSuppressed: false, shouldLabelBreakingChange: true });
  });

  it('deduplicates the existing changelog script output and shares its suppression policy', async () => {
    pkg = createPackage({}, ['Removed an API.']);
    fs.copyFileSync(fixturePath, path.join(context.config.localSdkRepoPath, 'changelog.cjs'));
    context.swaggerToSdkConfig.packageOptions.changelogScript = {
      path: 'node changelog.cjs --mode changelog',
      breakingChangeDetect: /Removed an API/,
    };

    await workflowPkgMain(context, pkg);

    expect(pkg.hasBreakingChange).toBe(true);
    expect(pkg.breakingChangeItems).toEqual(['Removed an API.']);
    expect(pkg.changelogs.join('\n').split('Removed an API.')).toHaveLength(2);
    expect(pkg.absentSuppressionLines).toEqual([]);
  });

  it('retains existing suppression parse diagnostics while reporting unsuppressed detector breaks', async () => {
    pkg.parseSuppressionLinesErrors = ['Malformed SDK suppression file.'];

    await workflowPkgMain(context, pkg);
    context.handledPackages = [pkg];
    saveFilteredLog(context);

    expect(pkg.parseSuppressionLinesErrors).toEqual(['Malformed SDK suppression file.']);
    expect(pkg.absentSuppressionLines).toEqual(['+\tRemoved an API.']);
    const filtered = JSON.parse(fs.readFileSync(context.filteredLogFileName, 'utf8'));
    expect(filtered.message).toContain('Malformed SDK suppression file.');
    expect(filtered.message).toContain('Absent SDK breaking changes suppressions');
  });

  it('does not mark new breaks as suppressed when no suppression file exists', async () => {
    await workflowPkgCallGetSdkChangesScript(context, pkg);

    expect(pkg.presentSuppressionLines).toEqual(['No suppression file added.']);
    expect(pkg.absentSuppressionLines).toEqual(['+\tRemoved an API.']);
  });

  it.each(['existing', 'detector'])('keeps unenumerated %s breaks explicitly unsuppressed', async source => {
    pkg = createPackage({
      changelog: {
        content: source === 'existing' ? 'An existing unenumerated break.' : '### Breaking Changes\n\n- Removed an API.',
        hasBreakingChange: true,
        breakingChangeItems: source === 'existing' ? undefined : ['Removed an API.'],
      },
    }, ['Removed an API.']);
    if (source === 'detector') {
      writeDetectorOutput(JSON.stringify({ changes: '', hasBreakingChange: true }));
    }

    await workflowPkgCallGetSdkChangesScript(context, pkg);
    context.handledPackages = [pkg];
    const report = readReport();

    expect(pkg.hasBreakingChange).toBe(true);
    expect(pkg.absentSuppressionLines.join('\n')).toContain('cannot be suppressed');
    expect(report.packages[0]).toMatchObject({ areBreakingChangeSuppressed: false, shouldLabelBreakingChange: true });
  });

  it.each(['beta management', 'data plane'])('keeps existing %s label exclusions', async kind => {
    pkg.isBetaMgmtSdk = kind === 'beta management';
    pkg.isDataPlane = kind === 'data plane';

    await workflowPkgCallGetSdkChangesScript(context, pkg);
    context.handledPackages = [pkg];
    const report = readReport();

    expect(pkg.hasBreakingChange).toBe(true);
    expect(report.packages[0].shouldLabelBreakingChange).toBe(false);
    expect(pkg.status).toBe('succeeded');
    if (pkg.isBetaMgmtSdk) {
      expect(pkg.presentSuppressionLines).toEqual([]);
      expect(pkg.absentSuppressionLines).toEqual([]);
    }
  });

  it('does not change the existing .NET label mapping or override a configured reporting label', async () => {
    const labels = { ...sdkLabels['azure-sdk-for-net'] };
    context.swaggerToSdkConfig.packageOptions.breakingChangesLabel = 'existing-policy-label';
    await workflowPkgCallGetSdkChangesScript(context, pkg);
    context.handledPackages = [pkg];

    expect(readReport().packages[0].breakingChangeLabel).toBe('existing-policy-label');
    expect(sdkLabels['azure-sdk-for-net']).toEqual(labels);
    expect(labels.breakingChange).toBeUndefined();
  });

  it.each([false, true])('isolates suppression and label decisions between packages (reverse=%s)', reverse => {
    const cases = [
      { data: { ...pkg, hasBreakingChange: true, presentSuppressionLines: ['Removed an API.'], absentSuppressionLines: [] }, suppressed: true, label: false },
      { data: { ...pkg, hasBreakingChange: true, presentSuppressionLines: [], absentSuppressionLines: ['+\tOther break.'] }, suppressed: false, label: true },
      { data: { ...pkg, hasBreakingChange: false }, suppressed: false, label: false },
      { data: { ...pkg, hasBreakingChange: true, isBetaMgmtSdk: true }, suppressed: false, label: false },
      { data: { ...pkg, hasBreakingChange: true, isDataPlane: true }, suppressed: false, label: false },
    ];
    if (reverse) {
      cases.reverse();
    }
    context.handledPackages = cases.map(item => item.data);

    const report = readReport();

    expect(report.packages.map(item => ({ suppressed: item.areBreakingChangeSuppressed, label: item.shouldLabelBreakingChange })))
      .toEqual(cases.map(item => ({ suppressed: item.suppressed, label: item.label })));
  });
});
