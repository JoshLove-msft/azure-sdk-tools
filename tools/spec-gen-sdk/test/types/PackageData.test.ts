import { describe, it, expect } from 'vitest';
import { getPackageData } from '../../src/types/PackageData';
import { WorkflowContext } from '../../src/types/Workflow';
import { PackageResult } from '../../src/types/GenerateOutput';

describe('PackageData', () => {
  it.each(['sdk/service/Example.Package', 'sdk\\service\\Example.Package'])(
    'retains package paths from generation output regardless of separators: %s',
    packagePath => {
      const context = {
        config: { branchPrefix: 'test' },
        sdkRepoConfig: {
          integrationRepository: { owner: 'Azure', name: 'azure-sdk-for-net' },
          mainRepository: { owner: 'Azure', name: 'azure-sdk-for-net' },
        },
      } as WorkflowContext;
      const pkg = getPackageData(context, { packageName: 'Example.Package', path: [packagePath], result: 'succeeded' });
      expect(pkg.relativeFolderPath).toBe(packagePath);
    },
  );

  describe('typespecProjectIsManagementPlane detection', () => {
    const mockContext: WorkflowContext = {
      config: {
        branchPrefix: 'test',
        integrationRepository: { owner: 'test', name: 'repo' },
        mainRepository: { owner: 'test', name: 'main' },
      },
      sdkRepoConfig: {
        integrationRepository: { owner: 'test', name: 'repo' },
        mainRepository: { owner: 'test', name: 'main' },
      }
    } as WorkflowContext;

    it('should detect management plane for typespec projects ending with .Management', () => {
      const mockResult: PackageResult = {
        packageName: 'test-package',
        path: ['sdk/test'],
        typespecProject: ['specification/test/.Management'],
        readmeMd: undefined,
        version: '1.0.0',
        language: 'JavaScript',
      } as PackageResult;

      const packageData = getPackageData(mockContext, mockResult);
      
      expect(packageData.isDataPlane).toBe(false);
    });

    it('should detect management plane for typespec projects containing resource-manager', () => {
      const mockResult: PackageResult = {
        packageName: 'test-package',
        path: ['sdk/test'],
        typespecProject: ['specification/test/resource-manager/stable/2021-04-01'],
        readmeMd: undefined,
        version: '1.0.0',
        language: 'JavaScript',
      } as PackageResult;

      const packageData = getPackageData(mockContext, mockResult);
      
      expect(packageData.isDataPlane).toBe(false);
    });

    it('should detect data plane for typespec projects not ending with .Management or containing resource-manager', () => {
      const mockResult: PackageResult = {
        packageName: 'test-package',
        path: ['sdk/test'],
        typespecProject: ['specification/test/data-plane'],
        readmeMd: undefined,
        version: '1.0.0',
        language: 'JavaScript',
      } as PackageResult;

      const packageData = getPackageData(mockContext, mockResult);
      
      expect(packageData.isDataPlane).toBe(true);
    });

    it('should detect management plane when all typespec projects are management plane', () => {
      const mockResult: PackageResult = {
        packageName: 'test-package',
        path: ['sdk/test'],
        typespecProject: [
          'specification/test/.Management',
          'specification/test2/resource-manager/stable/2022-01-01'
        ],
        readmeMd: undefined,
        version: '1.0.0',
        language: 'JavaScript',
      } as PackageResult;

      const packageData = getPackageData(mockContext, mockResult);
      
      expect(packageData.isDataPlane).toBe(false);
    });

    it('should detect data plane when any typespec project is not management plane', () => {
      const mockResult: PackageResult = {
        packageName: 'test-package',
        path: ['sdk/test'],
        typespecProject: [
          'specification/test/.Management',
          'specification/test2/data-plane'
        ],
        readmeMd: undefined,
        version: '1.0.0',
        language: 'JavaScript',
      } as PackageResult;

      const packageData = getPackageData(mockContext, mockResult);
      
      expect(packageData.isDataPlane).toBe(true);
    });
  });
});