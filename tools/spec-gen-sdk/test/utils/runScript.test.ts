import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusContainer, setSdkAutoStatus, isLineMatch, runSdkAutoCustomScript, listenOnStream } from '../../src/utils/runScript';
import { SDKAutomationState } from '../../src/automation/sdkAutomationState';
import { once } from 'node:events';
import { PassThrough, Readable } from 'stream';
import { WorkflowContext } from '../../src/types/Workflow';

describe('runScript utils', () => {
  describe('setSdkAutoStatus', () => {
    it('should maintain status hierarchy', () => {
      const testCases: [SDKAutomationState, SDKAutomationState, SDKAutomationState][] = [
        ['failed', 'warning', 'failed'],
        ['warning', 'succeeded', 'warning'],
        ['succeeded', 'failed', 'failed'],
        ['inProgress', 'failed', 'failed'],
        ['pending', 'warning', 'warning'],
        ['notEnabled', 'warning', 'notEnabled'],
        ['succeeded', 'notEnabled', 'notEnabled'],
      ];

      testCases.forEach(([initial, newStatus, expected]) => {
        const container: StatusContainer = { status: initial };
        setSdkAutoStatus(container, newStatus);
        expect(container.status).toBe(expected);
      });
    });
  });

  describe('isLineMatch', () => {
    it('should handle undefined and boolean filters', () => {
      const testLine = 'This is a test error line with number 123';
      expect(isLineMatch(testLine, undefined)).toBe(false);
      expect(isLineMatch(testLine, true)).toBe(true);
      expect(isLineMatch(testLine, false)).toBe(false);
    });

    it('should handle RegExp patterns', () => {
      const showInCommentRegExp = /\[AUTOREST\]/;
      const scriptErrorRegExp = /\[ERROR\]/;
      const scriptWarningRegExp = /\[WARNING\]/;
      expect(isLineMatch('[AUTOREST] this is a message', showInCommentRegExp)).toBe(true);
      expect(isLineMatch('[ERROR] this is a message', scriptErrorRegExp)).toBe(true);
      expect(isLineMatch('[WARNING] this is a message', scriptWarningRegExp)).toBe(true);
    });
  });

  describe('listenOnStream', () => {
    let mockContext: WorkflowContext;
    let result: StatusContainer;
    let vsoLogErrors: string[];

    beforeEach(() => {
      mockContext = ({
        logger: {
          log: vi.fn(),
        },
        config: { runEnv: 'local' },
      } as unknown) as WorkflowContext;
      result = { status: 'succeeded' };
      vsoLogErrors = [];
    });

    it('should process stream data correctly', async () => {
      const stream = new Readable();
      stream.push('test line 1\n');
      stream.push('test line 2\n');
      stream.push(null);

      listenOnStream(mockContext, result, '[test]', vsoLogErrors, stream, undefined, 'cmdout');

      await new Promise<void>((resolve) => {
        stream.on('end', () => {
          expect(mockContext.logger.log).toHaveBeenCalledWith('cmdout', '[test] test line 1', expect.any(Object));
          expect(mockContext.logger.log).toHaveBeenCalledWith('cmdout', '[test] test line 2', expect.any(Object));
          resolve();
        });
      });
    });

    it('should handle error patterns', async () => {
      const stream = new Readable();
      stream.push('error: something went wrong\n');
      stream.push(null);

      listenOnStream(mockContext, result, '[test]', vsoLogErrors, stream, { scriptError: /error:/ }, 'cmderr');

      await new Promise<void>((resolve) => {
        stream.on('end', () => {
          expect(result.status).toBe('failed');
          resolve();
        });
      });
    });

    it('should handle warning patterns', async () => {
      const stream = new Readable();
      stream.push('warning: potential issue\n');
      stream.push(null);

      listenOnStream(mockContext, result, '[test]', vsoLogErrors, stream, { scriptWarning: /warning:/ }, 'cmdout');

      await new Promise<void>((resolve) => {
        stream.on('end', () => {
          expect(result.status).toBe('warning');
          resolve();
        });
      });
    });

    it('should collect VSO errors in Azure DevOps environment', async () => {
      mockContext.config.runEnv = 'azureDevOps';
      const stream = new Readable();
      stream.push('error: critical failure\n');
      stream.push(null);

      listenOnStream(mockContext, result, '[test]', vsoLogErrors, stream, { scriptError: /error:/ }, 'cmderr');

      await new Promise<void>((resolve) => {
        stream.on('end', () => {
          expect(vsoLogErrors).toContain('error: critical failure');
          resolve();
        });
      });
    });

    describe.each(['cmdout', 'cmderr'] as const)('%s buffered chunks', logType => {
      it.each([
        {
          name: 'an unterminated error line',
          chunks: ['error: detector failed'],
          lines: ['error: detector failed'],
        },
        {
          name: 'an error prefix followed by a newline-terminated chunk',
          chunks: ['error:', ' detector failed\n'],
          lines: ['error: detector failed'],
        },
        {
          name: 'an error pattern split across unterminated chunks',
          chunks: ['err', 'or:', ' detector failed'],
          lines: ['error: detector failed'],
        },
        {
          name: 'a cached prefix after a complete line',
          chunks: ['info\nerr', 'or:', ' detector failed\n'],
          lines: ['info', 'error: detector failed'],
        },
        {
          name: 'a cached error and multiple unterminated continuation chunks',
          chunks: ['info\nerror:', ' detector ', 'failed'],
          lines: ['info', 'error: detector failed'],
        },
        {
          name: 'the newline-terminated control',
          chunks: ['error: detector failed\n'],
          lines: ['error: detector failed'],
        },
        {
          name: 'multiple errors, blank lines and an unterminated tail',
          chunks: ['progress\nerr', 'or: first failure\n\n', 'info\nerror:', ' second failure'],
          lines: ['progress', 'error: first failure', 'info', 'error: second failure'],
        },
      ])('preserves and classifies $name', async ({ chunks, lines }) => {
        mockContext.config.runEnv = 'azureDevOps';
        const stream = new PassThrough();
        const receivedChunks: string[] = [];
        stream.on('data', data => receivedChunks.push(data.toString()));
        listenOnStream(mockContext, result, '[test]', vsoLogErrors, stream, { scriptError: /error:/ }, logType);
        const ended = once(stream, 'end');

        for (const chunk of chunks) {
          stream.write(chunk);
        }
        if (chunks.every(chunk => !chunk.includes('\n'))) {
          expect(mockContext.logger.log).not.toHaveBeenCalled();
          expect(result.status).toBe('succeeded');
        }
        stream.end();
        await ended;

        expect(receivedChunks).toEqual(chunks);
        expect(result.status).toBe('failed');
        expect(vsoLogErrors).toEqual(lines.filter(line => line.includes('error:')));
        expect(mockContext.logger.log).toHaveBeenCalledTimes(lines.length);
        lines.forEach((line, index) => {
          const isError = line.includes('error:');
          expect(mockContext.logger.log).toHaveBeenNthCalledWith(index + 1, logType, `[test] ${line}`, {
            showInComment: isError,
            lineResult: isError ? 'failed' : 'succeeded',
          });
        });
      });

      it('flushes buffered text without inferring an unconfigured error policy', async () => {
        const stream = new PassThrough();
        listenOnStream(mockContext, result, '[test]', vsoLogErrors, stream, undefined, logType);
        const ended = once(stream, 'end');
        stream.write('error:');
        stream.end(' just a logged message');
        await ended;

        expect(result.status).toBe('succeeded');
        expect(vsoLogErrors).toEqual([]);
        expect(mockContext.logger.log).toHaveBeenCalledExactlyOnceWith(logType, '[test] error: just a logged message', {
          showInComment: false,
          lineResult: 'succeeded',
        });
      });
    });
  });

  describe('runSdkAutoCustomScript', () => {
    const mockContext: WorkflowContext = ({
      logger: {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      tmpFolder: '/tmp',
      config: { runEnv: 'local' },
      scriptEnvs: {},
    } as unknown) as WorkflowContext;

    const baseOptions = {
      cwd: process.cwd(),
      statusContext: { status: 'succeeded' as SDKAutomationState },
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should skip execution when status is failed', async () => {
      const options = {
        ...baseOptions,
        statusContext: { status: 'failed' as SDKAutomationState },
      };

      const result = await runSdkAutoCustomScript(mockContext, { path: 'echo test' }, options);

      expect(result).toBe('failed');
      expect(mockContext.logger.warn).toHaveBeenCalled();
    });

    it('should handle custom environment variables', async () => {
      const originalEnv = process.env.TEST_VAR;
      process.env.TEST_VAR = 'test_value';
      const mockRunOptions = {
        path: process.platform === 'win32' ? 'cmd /c echo %TEST_VAR%' : 'sh -c "echo $TEST_VAR"',
        envs: ['TEST_VAR'],
      };
      try {
        const result = await runSdkAutoCustomScript(mockContext, mockRunOptions, baseOptions);

        expect(result).toBe('succeeded');
      } finally {
        if (originalEnv === undefined) {
          delete process.env.TEST_VAR;
        } else {
          process.env.TEST_VAR = originalEnv;
        }
      }
    });

    it('should handle script execution errors', async () => {
      const mockRunOptions = {
        path: process.platform === 'win32' ? 'cmd /c not_a_real_command' : 'sh -c "not_a_real_command"',
        exitCode: { result: 'error' as 'error', showInComment: true },
      };
      const result = await runSdkAutoCustomScript(mockContext, mockRunOptions, baseOptions);

      expect(result).toBe('failed');
    });

    it('should handle warning exit codes', async () => {
      const mockRunOptions = {
        path: process.platform === 'win32' ? 'cmd /c exit 1' : 'sh -c "exit 1"',
        exitCode: { result: 'warning' as 'warning', showInComment: true },
      };
      const result = await runSdkAutoCustomScript(mockContext, mockRunOptions, baseOptions);

      expect(result).toBe('failed');
    });

    it('should handle continueOnFailed option', async () => {
      const mockRunOptions = {
        path: process.platform === 'win32' ? 'cmd /c echo test' : 'sh -c "echo test"',
        envs: ['TEST_VAR'],
      };
      const result = await runSdkAutoCustomScript(mockContext, mockRunOptions, {
        ...baseOptions,
        statusContext: { status: 'failed' },
        continueOnFailed: true,
      });

      expect(result).toBe('succeeded');
    });

    it('should throw exception when path is not provided in RunOptions', async () => {
      const mockRunOptions = {
        command: 'some command',
        envs: ['TEST_VAR'],
      };

      await expect(runSdkAutoCustomScript(mockContext, mockRunOptions, baseOptions))
        .rejects
        .toThrow('Script path is not provided in run options.');
    });
  });
});
