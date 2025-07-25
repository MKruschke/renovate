import fs from 'fs-extra';
import type { PushResult } from 'simple-git';
import Git from 'simple-git';
import tmp from 'tmp-promise';
import { GlobalConfig } from '../../config/global';
import {
  CONFIG_VALIDATION,
  INVALID_PATH,
  TEMPORARY_ERROR,
  UNKNOWN_ERROR,
} from '../../constants/error-messages';
import { newlineRegex, regEx } from '../regex';
import * as _behindBaseCache from './behind-base-branch-cache';
import * as _conflictsCache from './conflicts-cache';
import * as _modifiedCache from './modified-cache';
import type { FileChange } from './types';
import * as git from '.';
import { setNoVerify } from '.';
import { logger } from '~test/util';

vi.mock('./conflicts-cache');
vi.mock('./behind-base-branch-cache');
vi.mock('./modified-cache');
vi.mock('timers/promises');
vi.mock('../cache/repository');
vi.unmock('.');

const behindBaseCache = vi.mocked(_behindBaseCache);
const conflictsCache = vi.mocked(_conflictsCache);
const modifiedCache = vi.mocked(_modifiedCache);
// Class is no longer exported
const SimpleGit = Git().constructor as { prototype: ReturnType<typeof Git> };

describe('util/git/index', { timeout: 10000 }, () => {
  const masterCommitDate = new Date();
  masterCommitDate.setMilliseconds(0);
  let base: tmp.DirectoryResult;
  let origin: tmp.DirectoryResult;
  let defaultBranch: string;

  beforeAll(async () => {
    base = await tmp.dir({ unsafeCleanup: true });
    const repo = Git(base.path);
    await repo.init();
    defaultBranch = (await repo.raw('branch', '--show-current')).trim();
    await repo.addConfig('user.email', 'Jest@example.com');
    await repo.addConfig('user.name', 'Jest');
    await fs.writeFile(base.path + '/past_file', 'past');
    await repo.addConfig('commit.gpgsign', 'false');
    await repo.add(['past_file']);
    await repo.commit('past message');

    await repo.checkout(['-b', 'renovate/past_branch', defaultBranch]);
    await repo.checkout(['-b', 'develop', defaultBranch]);

    await repo.checkout(defaultBranch);
    await fs.writeFile(base.path + '/master_file', defaultBranch);
    await fs.writeFile(base.path + '/file_to_delete', 'bye');
    await repo.add(['master_file', 'file_to_delete']);
    await repo.commit('master message', [
      '--date=' + masterCommitDate.toISOString(),
    ]);

    await repo.checkout(['-b', 'renovate/future_branch', defaultBranch]);
    await fs.writeFile(base.path + '/future_file', 'future');
    await repo.add(['future_file']);
    await repo.commit('future message');

    await repo.checkoutBranch('renovate/modified_branch', defaultBranch);
    await fs.writeFile(base.path + '/base_file', 'base');
    await repo.add(['base_file']);
    await repo.commit('base message');
    await fs.writeFile(base.path + '/modified_file', 'modified');
    await repo.add(['modified_file']);
    await repo.commit('modification');

    await repo.checkoutBranch('renovate/custom_author', defaultBranch);
    await fs.writeFile(base.path + '/custom_file', 'custom');
    await repo.add(['custom_file']);
    await repo.addConfig('user.email', 'custom@example.com');
    await repo.commit('custom message');

    await repo.checkoutBranch('renovate/nested_files', defaultBranch);
    await fs.mkdirp(base.path + '/bin/');
    await fs.writeFile(base.path + '/bin/nested', 'nested');
    await fs.writeFile(base.path + '/root', 'root');
    await repo.add(['root', 'bin/nested']);
    await repo.addConfig('user.email', 'custom@example.com');
    await repo.commit('nested message');

    await repo.checkoutBranch('renovate/equal_branch', defaultBranch);

    await repo.checkoutBranch(
      'renovate/branch_with_multiple_authors',
      defaultBranch,
    );
    await repo.addConfig('user.email', 'author1@example.com');
    await repo.commit('first commit', undefined, { '--allow-empty': null });
    await repo.addConfig('user.email', 'author2@example.com');
    await repo.commit('second commit', undefined, { '--allow-empty': null });

    await repo.checkout(defaultBranch);

    expect(git.getBranchList()).toBeEmptyArray();
  });

  let tmpDir: tmp.DirectoryResult;

  const OLD_ENV = process.env;

  beforeEach(async () => {
    process.env = { ...OLD_ENV };
    origin = await tmp.dir({ unsafeCleanup: true });
    const repo = Git(origin.path);
    await repo.clone(base.path, '.', ['--bare']);
    await repo.addConfig('commit.gpgsign', 'false');
    tmpDir = await tmp.dir({ unsafeCleanup: true });
    GlobalConfig.set({ localDir: tmpDir.path });
    await git.initRepo({
      url: origin.path,
    });
    git.setUserRepoConfig({ branchPrefix: 'renovate/' });
    git.setGitAuthor('Jest <Jest@example.com>');
    setNoVerify([]);
    await git.syncGit();
    // override some local git settings for better testing
    const local = Git(tmpDir.path);
    await local.addConfig('commit.gpgsign', 'false');
    behindBaseCache.getCachedBehindBaseResult.mockReturnValue(null);
  });

  afterEach(async () => {
    await tmpDir?.cleanup();
    await origin?.cleanup();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    process.env = OLD_ENV;
    await base?.cleanup();
  });

  describe('gitRetry', () => {
    it('returns result if git returns successfully', async () => {
      const gitFunc = vi.fn().mockImplementation((args) => {
        if (args === undefined) {
          return 'some result';
        } else {
          return 'different result';
        }
      });
      expect(await git.gitRetry(() => gitFunc())).toBe('some result');
      expect(await git.gitRetry(() => gitFunc('arg'))).toBe('different result');
      expect(gitFunc).toHaveBeenCalledTimes(2);
    });

    it('retries the func call if ExternalHostError thrown', async () => {
      process.env.NODE_ENV = '';
      const gitFunc = vi
        .fn()
        .mockImplementationOnce(() => {
          throw new Error('The remote end hung up unexpectedly');
        })
        .mockImplementationOnce(() => {
          throw new Error('The remote end hung up unexpectedly');
        })
        .mockImplementationOnce(() => 'some result');
      expect(await git.gitRetry(() => gitFunc())).toBe('some result');
      expect(gitFunc).toHaveBeenCalledTimes(3);
    });

    it('retries the func call up to retry count if ExternalHostError thrown', async () => {
      process.env.NODE_ENV = '';
      const gitFunc = vi.fn().mockImplementation(() => {
        throw new Error('The remote end hung up unexpectedly');
      });
      await expect(git.gitRetry(() => gitFunc())).rejects.toThrow(
        'The remote end hung up unexpectedly',
      );
      expect(gitFunc).toHaveBeenCalledTimes(6);
    });

    it("doesn't retry and throws an Error if non-ExternalHostError thrown by git", async () => {
      const gitFunc = vi.fn().mockImplementationOnce(() => {
        throw new Error('some error');
      });
      await expect(git.gitRetry(() => gitFunc())).rejects.toThrow('some error');
      expect(gitFunc).toHaveBeenCalledTimes(1);
    });
  });

  describe('validateGitVersion()', () => {
    it('has a git version greater or equal to the minimum required', async () => {
      const res = await git.validateGitVersion();
      expect(res).toBeTrue();
    });
  });

  describe('checkoutBranch(branchName)', () => {
    it('sets the base branch as master', async () => {
      await expect(git.checkoutBranch(defaultBranch)).resolves.not.toThrow();
    });

    it('sets non-master base branch', async () => {
      await expect(git.checkoutBranch('develop')).resolves.not.toThrow();
    });

    describe('submodules', () => {
      beforeEach(async () => {
        const repo = Git(base.path);

        const submoduleBasePath = base.path + '/submodule';
        await fs.mkdir(submoduleBasePath);
        const submodule = Git(submoduleBasePath);
        await submodule.init();
        await submodule.addConfig('user.email', 'Jest@example.com');
        await submodule.addConfig('user.name', 'Jest');

        await fs.writeFile(submoduleBasePath + '/init_file', 'init');
        await submodule.add('init_file');
        await submodule.commit('init submodule');

        await repo.submoduleAdd('./submodule', './submodule');
        await repo.commit('add submodule');
        await repo.branch(['stable']);

        await fs.writeFile(submoduleBasePath + '/current_file', 'current');
        await submodule.add('current_file');
        await submodule.commit('update');
        await repo.add('submodule');
        await repo.commit('update submodule');
      });

      it('verifies that the --recurse-submodule flag is needed', async () => {
        const repo = Git(base.path);
        expect((await repo.status()).isClean()).toBeTrue();
        await repo.checkout('stable');
        expect((await repo.status()).isClean()).toBeFalse();
      });

      it('sets non-master base branch with submodule update', async () => {
        await git.initRepo({
          cloneSubmodules: true,
          url: base.path,
        });
        expect((await git.getRepoStatus()).isClean()).toBeTrue();
        await git.checkoutBranch('stable');
        expect((await git.getRepoStatus()).isClean()).toBeTrue();
      });

      afterEach(async () => {
        const repo = Git(base.path);
        const defaultBranch =
          (await repo.getConfig('init.defaultbranch')).value ?? 'master';
        await repo.checkout(defaultBranch);
        await repo.reset(['--hard', 'HEAD~2']);
        await repo.branch(['-D', 'stable']);
        await fs.rm(base.path + '/submodule', { recursive: true });
      });
    });
  });

  describe('getFileList()', () => {
    it('should return the correct files', async () => {
      expect(await git.getFileList()).toEqual([
        'file_to_delete',
        'master_file',
        'past_file',
      ]);
    });

    it('should exclude submodules', async () => {
      const repo = Git(base.path);
      await repo.submoduleAdd(base.path, 'submodule');
      await repo.submoduleAdd(base.path, 'file');
      await repo.commit('Add submodules');
      await git.initRepo({
        cloneSubmodules: true,
        cloneSubmodulesFilter: ['file'],
        url: base.path,
      });
      expect(git.isCloned()).toBeFalse();
      await git.syncGit();
      expect(await fs.pathExists(tmpDir.path + '/.gitmodules')).toBeTruthy();
      expect(await git.getFileList()).toEqual([
        '.gitmodules',
        'file_to_delete',
        'master_file',
        'past_file',
      ]);
      await repo.reset(['--hard', 'HEAD^']);
    });
  });

  describe('branchExists(branchName)', () => {
    it('should return true if found', () => {
      expect(git.branchExists('renovate/future_branch')).toBeTrue();
    });

    it('should return false if not found', () => {
      expect(git.branchExists('not_found')).toBeFalse();
    });
  });

  describe('getBranchList()', () => {
    it('should return all branches', () => {
      const res = git.getBranchList();
      expect(res).toContain('renovate/past_branch');
      expect(res).toContain('renovate/future_branch');
      expect(res).toContain(defaultBranch);
    });
  });

  describe('isBranchBehindBase()', () => {
    it('should return false if same SHA as master', async () => {
      expect(
        await git.isBranchBehindBase('renovate/future_branch', defaultBranch),
      ).toBeFalse();
    });

    it('should return true if SHA different from master', async () => {
      expect(
        await git.isBranchBehindBase('renovate/past_branch', defaultBranch),
      ).toBeTrue();
    });

    it('should return result even if non-default and not under branchPrefix', async () => {
      expect(await git.isBranchBehindBase('develop', defaultBranch)).toBeTrue();
    });

    it('returns cached value', async () => {
      behindBaseCache.getCachedBehindBaseResult.mockReturnValue(true);
      expect(await git.isBranchBehindBase('develop', defaultBranch)).toBeTrue();
      expect(logger.logger.debug).toHaveBeenCalledWith(
        'branch.isBehindBase(): using cached result "true"',
      );
    });
  });

  describe('isBranchModified()', () => {
    beforeEach(() => {
      modifiedCache.getCachedModifiedResult.mockReturnValue(null);
    });

    it('should return false when branch is not found', async () => {
      expect(
        await git.isBranchModified('renovate/not_found', defaultBranch),
      ).toBeFalse();
    });

    it('should return false when author matches', async () => {
      expect(
        await git.isBranchModified('renovate/future_branch', defaultBranch),
      ).toBeFalse();
      expect(
        await git.isBranchModified('renovate/future_branch', defaultBranch),
      ).toBeFalse();
    });

    it('should return false when author is ignored', async () => {
      git.setUserRepoConfig({
        gitIgnoredAuthors: ['custom@example.com'],
      });
      expect(
        await git.isBranchModified('renovate/custom_author', defaultBranch),
      ).toBeFalse();
    });

    it('should return true when non-ignored authors commit followed by an ignored author', async () => {
      git.setUserRepoConfig({
        gitIgnoredAuthors: ['author1@example.com'],
      });
      expect(
        await git.isBranchModified(
          'renovate/branch_with_multiple_authors',
          defaultBranch,
        ),
      ).toBeTrue();
    });

    it('should return false with multiple authors that are each ignored', async () => {
      git.setUserRepoConfig({
        gitIgnoredAuthors: ['author1@example.com', 'author2@example.com'],
      });
      expect(
        await git.isBranchModified(
          'renovate/branch_with_multiple_authors',
          defaultBranch,
        ),
      ).toBeFalse();
    });

    it('should return true when custom author is unknown', async () => {
      expect(
        await git.isBranchModified('renovate/custom_author', defaultBranch),
      ).toBeTrue();
    });

    it('should return value stored in modifiedCacheResult', async () => {
      modifiedCache.getCachedModifiedResult.mockReturnValue(true);
      expect(
        await git.isBranchModified('renovate/future_branch', defaultBranch),
      ).toBeTrue();
    });
  });

  describe('getBranchCommit(branchName)', () => {
    it('should return same value for equal refs', () => {
      const hex = git.getBranchCommit('renovate/equal_branch');
      expect(hex).toBe(git.getBranchCommit(defaultBranch));
      expect(hex).toHaveLength(40);
    });

    it('should return null', () => {
      expect(git.getBranchCommit('not_found')).toBeNull();
    });
  });

  describe('getBranchFiles(branchName)', () => {
    it('detects changed files compared to current base branch', async () => {
      const file: FileChange = {
        type: 'addition',
        path: 'some-new-file',
        contents: 'some new-contents',
      };
      await git.commitFiles({
        branchName: 'renovate/branch_with_changes',
        files: [
          file,
          { type: 'addition', path: 'dummy', contents: null as never },
        ],
        message: 'Create something',
      });
      const branchFiles = await git.getBranchFiles(
        'renovate/branch_with_changes',
      );
      expect(branchFiles).toEqual(['some-new-file']);
    });
  });

  describe('getBranchFilesFromCommit(sha)', () => {
    it('detects changed files compared to the parent commit', async () => {
      const file: FileChange = {
        type: 'addition',
        path: 'some-new-file',
        contents: 'some new-contents',
      };
      const sha = await git.commitFiles({
        branchName: 'renovate/branch_with_changes',
        files: [
          file,
          { type: 'addition', path: 'dummy', contents: null as never },
        ],
        message: 'Create something',
      });
      const branchFiles = await git.getBranchFilesFromCommit(sha!);
      expect(branchFiles).toEqual(['some-new-file']);
    });
  });

  describe('mergeBranch(branchName)', () => {
    it('should perform a branch merge', async () => {
      await git.mergeBranch('renovate/future_branch');
      const merged = await Git(origin.path).branch([
        '--verbose',
        '--merged',
        defaultBranch,
      ]);
      expect(merged.all).toContain('renovate/future_branch');
    });

    it('should throw if branch merge throws', async () => {
      await expect(git.mergeBranch('not_found')).rejects.toThrow();
    });
  });

  describe('mergeToLocal(branchName)', () => {
    it('should perform a branch merge without push', async () => {
      expect(fs.existsSync(`${tmpDir.path}/future_file`)).toBeFalse();
      const pushSpy = vi.spyOn(SimpleGit.prototype, 'push');

      await git.mergeToLocal('renovate/future_branch');

      expect(fs.existsSync(`${tmpDir.path}/future_file`)).toBeTrue();
      expect(pushSpy).toHaveBeenCalledTimes(0);
    });

    it('should throw', async () => {
      await expect(git.mergeToLocal('not_found')).rejects.toThrow();
    });
  });

  describe('deleteBranch(branchName)', () => {
    it('should send delete', async () => {
      await git.deleteBranch('renovate/past_branch');
      const branches = await Git(origin.path).branch({});
      expect(branches.all).not.toContain('renovate/past_branch');
    });

    it('should add no verify flag', async () => {
      const rawSpy = vi.spyOn(SimpleGit.prototype, 'raw');
      await git.deleteBranch('renovate/something');
      expect(rawSpy).toHaveBeenCalledWith([
        'push',
        '--delete',
        'origin',
        'renovate/something',
      ]);
    });

    it('should not add no verify flag', async () => {
      const rawSpy = vi.spyOn(SimpleGit.prototype, 'raw');
      setNoVerify(['push']);
      await git.deleteBranch('renovate/something');
      expect(rawSpy).toHaveBeenCalledWith([
        'push',
        '--delete',
        'origin',
        'renovate/something',
        '--no-verify',
      ]);
    });
  });

  describe('getBranchLastCommitTime', () => {
    it('should return a Date', async () => {
      const time = await git.getBranchLastCommitTime(defaultBranch);
      expect(time).toEqual(masterCommitDate);
    });

    it('handles error', async () => {
      const res = await git.getBranchLastCommitTime('some-branch');
      expect(res).toBeDefined();
    });
  });

  describe('getFile(filePath, branchName)', () => {
    it('gets the file', async () => {
      const res = await git.getFile('master_file');
      expect(res).toBe(defaultBranch);
    });

    it('short cuts 404', async () => {
      const res = await git.getFile('some-missing-path');
      expect(res).toBeNull();
    });

    it('returns null for 404', async () => {
      expect(await git.getFile('some-path', 'some-branch')).toBeNull();
    });
  });

  describe('getFiles(filePath)', () => {
    it('gets the file', async () => {
      const res = await git.getFiles(['master_file', 'some_missing_path']);
      expect(res).toEqual({
        master_file: defaultBranch,
        some_missing_path: null,
      });
    });
  });

  describe('hasDiff(sourceRef, targetRef)', () => {
    it('compare without changes', () => {
      return expect(git.hasDiff('HEAD', 'HEAD')).resolves.toBeFalse();
    });

    it('compare with changes', () => {
      return expect(
        git.hasDiff('origin/master', 'origin/renovate/future_branch'),
      ).resolves.toBeTrue();
    });
  });

  describe('commitFiles({branchName, files, message})', () => {
    it('creates file', async () => {
      const file: FileChange = {
        type: 'addition',
        path: 'some-new-file',
        contents: 'some new-contents',
      };
      const commit = await git.commitFiles({
        branchName: 'renovate/past_branch',
        files: [file],
        message: 'Create something',
      });
      expect(commit).not.toBeNull();
    });

    it('link file', async () => {
      const file: FileChange = {
        type: 'addition',
        path: 'future_link',
        contents: 'past_file',
        isSymlink: true,
      };
      const commit = await git.commitFiles({
        branchName: 'renovate/future_branch',
        files: [file],
        message: 'Create a link',
      });
      expect(commit).toBeString();
      const tmpGit = Git(tmpDir.path);
      const lsTree = await tmpGit.raw(['ls-tree', commit!]);
      const files = lsTree
        .trim()
        .split(newlineRegex)
        .map((x) => x.split(regEx(/\s/)))
        .map(([mode, type, _hash, name]) => [mode, type, name]);
      expect(files).toContainEqual(['100644', 'blob', 'past_file']);
      expect(files).toContainEqual(['120000', 'blob', 'future_link']);
    });

    it('deletes file', async () => {
      const file: FileChange = {
        type: 'deletion',
        path: 'file_to_delete',
      };
      const commit = await git.commitFiles({
        branchName: 'renovate/something',
        files: [file],
        message: 'Delete something',
      });
      expect(commit).not.toBeNull();
    });

    it('updates multiple files', async () => {
      const files: FileChange[] = [
        {
          type: 'addition',
          path: 'some-existing-file',
          contents: 'updated content',
        },
        {
          type: 'addition',
          path: 'some-other-existing-file',
          contents: 'other updated content',
        },
      ];
      const commit = await git.commitFiles({
        branchName: 'renovate/something',
        files,
        message: 'Update something',
      });
      expect(commit).not.toBeNull();
    });

    it('uses right commit SHA', async () => {
      const files: FileChange[] = [
        {
          type: 'addition',
          path: 'some-existing-file',
          contents: 'updated content',
        },
        {
          type: 'addition',
          path: 'some-other-existing-file',
          contents: 'other updated content',
        },
      ];
      const commitConfig = {
        baseBranch: 'renovate/something',
        branchName: 'renovate/something',
        files,
        message: 'Update something',
      };
      const commitSha = await git.commitFiles(commitConfig);
      const remoteSha = await git.fetchBranch(commitConfig.branchName);
      expect(commitSha).toEqual(remoteSha);
    });

    it('updates git submodules', async () => {
      const files: FileChange[] = [
        {
          type: 'addition',
          path: '.',
          contents: 'some content',
        },
      ];
      const commit = await git.commitFiles({
        branchName: 'renovate/something',
        files,
        message: 'Update something',
      });
      expect(commit).toBeNull();
    });

    it('does not push when no diff', async () => {
      const files: FileChange[] = [
        {
          type: 'addition',
          path: 'future_file',
          contents: 'future',
        },
      ];
      const commit = await git.commitFiles({
        branchName: 'renovate/future_branch',
        files,
        message: 'No change update',
      });
      expect(commit).toBeNull();
    });

    it('does not pass --no-verify', async () => {
      const commitSpy = vi.spyOn(SimpleGit.prototype, 'commit');
      const pushSpy = vi.spyOn(SimpleGit.prototype, 'push');

      const files: FileChange[] = [
        {
          type: 'addition',
          path: 'some-new-file',
          contents: 'some new-contents',
        },
      ];

      await git.commitFiles({
        branchName: 'renovate/something',
        files,
        message: 'Pass no-verify',
      });

      expect(commitSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.not.objectContaining({ '--no-verify': null }),
      );
      expect(pushSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.not.objectContaining({ '--no-verify': null }),
      );
    });

    it('passes --no-verify to commit', async () => {
      const commitSpy = vi.spyOn(SimpleGit.prototype, 'commit');
      const pushSpy = vi.spyOn(SimpleGit.prototype, 'push');

      const files: FileChange[] = [
        {
          type: 'addition',
          path: 'some-new-file',
          contents: 'some new-contents',
        },
      ];
      setNoVerify(['commit']);

      await git.commitFiles({
        branchName: 'renovate/something',
        files,
        message: 'Pass no-verify',
      });

      expect(commitSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ '--no-verify': null }),
      );
      expect(pushSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.not.objectContaining({ '--no-verify': null }),
      );
    });

    it('passes --no-verify to push', async () => {
      const commitSpy = vi.spyOn(SimpleGit.prototype, 'commit');
      const pushSpy = vi.spyOn(SimpleGit.prototype, 'push');

      const files: FileChange[] = [
        {
          type: 'addition',
          path: 'some-new-file',
          contents: 'some new-contents',
        },
      ];
      setNoVerify(['push']);

      await git.commitFiles({
        branchName: 'renovate/something',
        files,
        message: 'Pass no-verify',
      });

      expect(commitSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.not.objectContaining({ '--no-verify': null }),
      );
      expect(pushSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ '--no-verify': null }),
      );
    });

    it('creates file with the executable bit', async () => {
      const file: FileChange = {
        type: 'addition',
        path: 'some-executable',
        contents: 'some new-contents',
        isExecutable: true,
      };
      const commit = await git.commitFiles({
        branchName: 'renovate/past_branch',
        files: [file],
        message: 'Create something',
      });
      expect(commit).not.toBeNull();

      const repo = Git(tmpDir.path);
      const result = await repo.raw(['ls-tree', 'HEAD', 'some-executable']);
      expect(result).toStartWith('100755');
    });
  });

  describe('getCommitMessages()', () => {
    it('returns commit messages', async () => {
      expect(await git.getCommitMessages()).toEqual([
        'master message',
        'past message',
      ]);
    });
  });

  describe('Storage.getUrl()', () => {
    const getUrl = git.getUrl;

    it('returns https url', () => {
      expect(
        getUrl({
          protocol: 'https',
          auth: 'user:pass',
          hostname: 'host',
          repository: 'some/repo',
        }),
      ).toBe('https://user:pass@host/some/repo.git');
      expect(
        getUrl({
          auth: 'user:pass',
          hostname: 'host',
          repository: 'some/repo',
        }),
      ).toBe('https://user:pass@host/some/repo.git');
    });

    it('returns ssh url', () => {
      expect(
        getUrl({
          protocol: 'ssh',
          auth: 'user:pass',
          hostname: 'host',
          repository: 'some/repo',
        }),
      ).toBe('git@host:some/repo.git');
    });
  });

  describe('initRepo())', () => {
    it('should fetch latest', async () => {
      const repo = Git(base.path);
      await repo.checkout(['-b', 'test', defaultBranch]);
      await fs.writeFile(base.path + '/test', 'lorem ipsum');
      await repo.add(['test']);
      await repo.commit('past message2');
      await repo.checkout(defaultBranch);

      expect(git.branchExists('test')).toBeFalsy();

      expect(await git.getCommitMessages()).toEqual([
        'master message',
        'past message',
      ]);

      await git.checkoutBranch('develop');

      await git.initRepo({
        url: base.path,
      });

      expect(git.branchExists('test')).toBeTruthy();

      await git.checkoutBranch('test');

      const msg = await git.getCommitMessages();
      expect(msg).toEqual(['past message2', 'master message', 'past message']);
      expect(msg).toContain('past message2');
    });

    it('should set branch prefix', async () => {
      const repo = Git(base.path);
      await repo.checkout(['-b', 'renovate/test', defaultBranch]);
      await fs.writeFile(base.path + '/test', 'lorem ipsum');
      await repo.add(['test']);
      await repo.commit('past message2');
      await repo.checkout(defaultBranch);

      await git.initRepo({
        url: base.path,
      });

      git.setUserRepoConfig({ branchPrefix: 'renovate/' });
      expect(git.branchExists('renovate/test')).toBeTrue();

      await git.initRepo({
        url: base.path,
      });

      await repo.checkout('renovate/test');
      await repo.commit('past message3', ['--amend']);

      git.setUserRepoConfig({ branchPrefix: 'renovate/' });
      expect(git.branchExists('renovate/test')).toBeTrue();
    });

    it('should fail clone ssh submodule', async () => {
      const repo = Git(base.path);
      await fs.writeFile(
        base.path + '/.gitmodules',
        '[submodule "test"]\npath=test\nurl=ssh://0.0.0.0',
      );
      await repo.add('.gitmodules');
      await repo.raw([
        'update-index',
        '--add',
        '--cacheinfo',
        '160000',
        '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
        'test',
      ]);
      await repo.commit('Add submodule');
      await git.initRepo({
        cloneSubmodules: true,
        url: base.path,
      });
      await git.syncGit();
      expect(await fs.pathExists(tmpDir.path + '/.gitmodules')).toBeTruthy();
      await repo.reset(['--hard', 'HEAD^']);
    });

    it('should use extra clone configuration', async () => {
      await fs.emptyDir(tmpDir.path);
      await git.initRepo({
        url: origin.path,
        extraCloneOpts: {
          '-c': 'extra.clone.config=test-extra-config-value',
        },
        fullClone: true,
      });
      git.getBranchCommit(defaultBranch);
      await git.syncGit();
      const repo = Git(tmpDir.path);
      const res = (await repo.raw(['config', 'extra.clone.config'])).trim();
      expect(res).toBe('test-extra-config-value');
    });
  });

  describe('setGitAuthor()', () => {
    it('throws for invalid', () => {
      expect(() => git.setGitAuthor('invalid')).toThrow(CONFIG_VALIDATION);
    });
  });

  describe('isBranchConflicted', () => {
    beforeAll(async () => {
      const repo = Git(base.path);
      await repo.init();

      await repo.checkout(['-b', 'renovate/conflicted_branch', defaultBranch]);
      await repo.checkout([
        '-b',
        'renovate/non_conflicted_branch',
        defaultBranch,
      ]);

      await repo.checkout(defaultBranch);
      await fs.writeFile(base.path + '/one_file', 'past (updated)');
      await repo.add(['one_file']);
      await repo.commit('past (updated) message');

      await repo.checkout('renovate/conflicted_branch');
      await fs.writeFile(base.path + '/one_file', 'past (updated branch)');
      await repo.add(['one_file']);
      await repo.commit('past (updated branch) message');

      await repo.checkout('renovate/non_conflicted_branch');
      await fs.writeFile(base.path + '/another_file', 'other');
      await repo.add(['another_file']);
      await repo.commit('other (updated branch) message');

      await repo.checkout(defaultBranch);

      conflictsCache.getCachedConflictResult.mockReturnValue(null);
    });

    it('returns true for non-existing source branch', async () => {
      const res = await git.isBranchConflicted(
        defaultBranch,
        'renovate/non_existing_branch',
      );
      expect(res).toBeTrue();
    });

    it('returns true for non-existing target branch', async () => {
      const res = await git.isBranchConflicted(
        'renovate/non_existing_branch',
        'renovate/non_conflicted_branch',
      );
      expect(res).toBeTrue();
    });

    it('detects conflicted branch', async () => {
      const branchBefore = 'renovate/non_conflicted_branch';
      await git.checkoutBranch(branchBefore);

      const res = await git.isBranchConflicted(
        defaultBranch,
        'renovate/conflicted_branch',
      );

      expect(res).toBeTrue();

      const status = await git.getRepoStatus();
      expect(status.current).toEqual(branchBefore);
      expect(status.isClean()).toBeTrue();
    });

    it('detects non-conflicted branch', async () => {
      const branchBefore = 'renovate/conflicted_branch';
      await git.checkoutBranch(branchBefore);

      const res = await git.isBranchConflicted(
        defaultBranch,
        'renovate/non_conflicted_branch',
      );

      expect(res).toBeFalse();

      const status = await git.getRepoStatus();
      expect(status.current).toEqual(branchBefore);
      expect(status.isClean()).toBeTrue();
    });

    describe('cachedConflictResult', () => {
      it('returns cached values', async () => {
        conflictsCache.getCachedConflictResult.mockReturnValue(true);

        const res = await git.isBranchConflicted(
          defaultBranch,
          'renovate/conflicted_branch',
        );

        expect(res).toBeTrue();
        expect(conflictsCache.getCachedConflictResult.mock.calls).toEqual([
          [
            'renovate/conflicted_branch',
            git.getBranchCommit('renovate/conflicted_branch'),
            defaultBranch,
            git.getBranchCommit(defaultBranch),
          ],
        ]);
        expect(conflictsCache.setCachedConflictResult).not.toHaveBeenCalled();
      });

      it('caches truthy return value', async () => {
        conflictsCache.getCachedConflictResult.mockReturnValue(null);

        const res = await git.isBranchConflicted(
          defaultBranch,
          'renovate/conflicted_branch',
        );

        expect(res).toBeTrue();
        expect(conflictsCache.setCachedConflictResult.mock.calls).toEqual([
          ['renovate/conflicted_branch', true],
        ]);
      });

      it('caches falsy return value', async () => {
        conflictsCache.getCachedConflictResult.mockReturnValue(null);

        const res = await git.isBranchConflicted(
          defaultBranch,
          'renovate/non_conflicted_branch',
        );

        expect(res).toBeFalse();
        expect(conflictsCache.setCachedConflictResult.mock.calls).toEqual([
          ['renovate/non_conflicted_branch', false],
        ]);
      });
    });
  });

  describe('Renovate non-branch refs', () => {
    const lsRenovateRefs = async (): Promise<string[]> =>
      (await Git(tmpDir.path).raw(['ls-remote', 'origin', 'refs/renovate/*']))
        .split(newlineRegex)
        .map((line) => line.replace(regEx(/[0-9a-f]+\s+/i), ''))
        .filter(Boolean);

    it('creates renovate ref in default section', async () => {
      const commit = git.getBranchCommit('develop')!;

      await git.pushCommitToRenovateRef(commit, 'foo/bar');

      const renovateRefs = await lsRenovateRefs();
      expect(renovateRefs).toContain('refs/renovate/branches/foo/bar');
    });

    it('creates custom section for renovate ref', async () => {
      const commit = git.getBranchCommit('develop')!;

      await git.pushCommitToRenovateRef(commit, 'bar/baz');

      const renovateRefs = await lsRenovateRefs();
      expect(renovateRefs).toContain('refs/renovate/branches/bar/baz');
    });

    it('clears pushed Renovate refs', async () => {
      const commit = git.getBranchCommit('develop')!;
      await git.pushCommitToRenovateRef(commit, 'foo');
      await git.pushCommitToRenovateRef(commit, 'bar');
      await git.pushCommitToRenovateRef(commit, 'baz');

      expect(await lsRenovateRefs()).not.toBeEmpty();
      await git.clearRenovateRefs();
      expect(await lsRenovateRefs()).toBeEmpty();
    });

    it('clears remote Renovate refs', async () => {
      const commit = git.getBranchCommit('develop')!;
      const tmpGit = Git(tmpDir.path);
      await tmpGit.raw(['update-ref', 'refs/renovate/branches/aaa', commit]);
      await tmpGit.raw([
        'push',
        '--force',
        'origin',
        'refs/renovate/branches/aaa',
      ]);

      await git.pushCommitToRenovateRef(commit, 'bbb');
      await git.pushCommitToRenovateRef(commit, 'ccc');

      const pushSpy = vi.spyOn(SimpleGit.prototype, 'push');

      expect(await lsRenovateRefs()).not.toBeEmpty();
      await git.clearRenovateRefs();
      expect(await lsRenovateRefs()).toBeEmpty();
      expect(pushSpy).toHaveBeenCalledOnce();
    });

    it('preserves unknown sections by default', async () => {
      const commit = git.getBranchCommit('develop')!;
      const tmpGit = Git(tmpDir.path);
      await tmpGit.raw(['update-ref', 'refs/renovate/foo/bar', commit]);
      await tmpGit.raw(['push', '--force', 'origin', 'refs/renovate/foo/bar']);
      await git.clearRenovateRefs();
      expect(await lsRenovateRefs()).toEqual(['refs/renovate/foo/bar']);
    });

    it('falls back to sequential ref deletion if bulk changes are disallowed', async () => {
      const commit = git.getBranchCommit('develop')!;
      await git.pushCommitToRenovateRef(commit, 'foo');
      await git.pushCommitToRenovateRef(commit, 'bar');
      await git.pushCommitToRenovateRef(commit, 'baz');

      const pushSpy = vi.spyOn(SimpleGit.prototype, 'push');
      pushSpy.mockImplementationOnce(() => {
        throw new Error(
          'remote: Repository policies do not allow pushes that update more than 2 branches or tags.',
        );
      });

      expect(await lsRenovateRefs()).not.toBeEmpty();
      await git.clearRenovateRefs();
      expect(await lsRenovateRefs()).toBeEmpty();
      expect(pushSpy).toHaveBeenCalledTimes(4);
    });
  });

  describe('listCommitTree', () => {
    it('creates non-branch ref', async () => {
      const commit = git.getBranchCommit('develop')!;
      const res = await git.listCommitTree(commit);
      expect(res).toEqual([
        {
          mode: '100644',
          path: 'past_file',
          sha: '913705ab2ca79368053a476efa48aa6912d052c5',
          type: 'blob',
        },
      ]);
    });
  });

  describe('getRepoStatus', () => {
    it('should pass options into git status', async () => {
      await git.checkoutBranch('renovate/nested_files');

      await fs.writeFile(tmpDir.path + '/bin/nested', 'new nested');
      await fs.writeFile(tmpDir.path + '/root', 'new root');
      const resp = await git.getRepoStatus('bin');

      expect(resp.modified).toStrictEqual(['bin/nested']);
    });

    it('should reject when trying to access directory out of localDir', async () => {
      GlobalConfig.set({ localDir: tmpDir.path });
      await git.checkoutBranch('renovate/nested_files');

      await fs.writeFile(tmpDir.path + '/bin/nested', 'new nested');
      await fs.writeFile(tmpDir.path + '/root', 'new root');

      await expect(git.getRepoStatus('../../bin')).rejects.toThrow(
        INVALID_PATH,
      );
    });
  });

  describe('getSubmodules', () => {
    it('should return empty array', async () => {
      expect(await git.getSubmodules()).toHaveLength(0);
    });
  });

  describe('fetchRevSpec()', () => {
    it('fetchRevSpec()', async () => {
      await git.fetchRevSpec(
        `refs/heads/${defaultBranch}:refs/heads/other/${defaultBranch}`,
      );
      //checkout this duplicate
      const sha = await git.checkoutBranch(`other/${defaultBranch}`);
      expect(sha).toBe(git.getBranchCommit(defaultBranch));
    });
  });

  describe('syncGit()', () => {
    it('should clone a specified base branch', async () => {
      tmpDir = await tmp.dir({ unsafeCleanup: true });
      GlobalConfig.set({ baseBranches: ['develop'], localDir: tmpDir.path });
      await git.initRepo({
        url: origin.path,
        defaultBranch: 'develop',
      });
      await git.syncGit();
      const tmpGit = Git(tmpDir.path);
      const branch = (
        await tmpGit.raw(['rev-parse', '--abbrev-ref', 'HEAD'])
      ).trim();
      expect(branch).toBe('develop');
    });
  });

  describe('pushCommit', () => {
    it('should pass pushOptions to git.push', async () => {
      const pushSpy = vi
        .spyOn(SimpleGit.prototype, 'push')
        .mockResolvedValue({} as PushResult);
      await expect(
        git.pushCommit({
          sourceRef: defaultBranch,
          targetRef: defaultBranch,
          files: [],
          pushOptions: ['ci.skip', 'foo=bar'],
        }),
      ).resolves.toBeTrue();
      expect(pushSpy).toHaveBeenCalledWith(
        'origin',
        `${defaultBranch}:${defaultBranch}`,
        expect.objectContaining({
          '--push-option': ['ci.skip', 'foo=bar'],
        }),
      );
    });
  });

  describe('forkMode - normal working', () => {
    let upstreamBase: tmp.DirectoryResult;
    let upstreamOrigin: tmp.DirectoryResult;
    let tmpDir2: tmp.DirectoryResult;

    beforeAll(async () => {
      // create an upstream branch and one extra branch in it
      upstreamBase = await tmp.dir({ unsafeCleanup: true });
      const upstream = Git(upstreamBase.path);
      await upstream.init();
      const defaultUpsBranch = (
        await upstream.raw('branch', '--show-current')
      ).trim();
      await upstream.addConfig('user.email', 'other@example.com');
      await upstream.addConfig('user.name', 'Other');
      await fs.writeFile(upstreamBase.path + '/past_file', 'past');
      await upstream.addConfig('commit.gpgsign', 'false');
      await upstream.add(['past_file']);
      await upstream.commit('past message');
      await upstream.raw(['checkout', '-B', defaultUpsBranch]);
      await upstream.checkout(['-b', 'develop', defaultUpsBranch]);

      // clone of upstream on local path
      upstreamOrigin = await tmp.dir({ unsafeCleanup: true });
      const upstreamRepo = Git(upstreamOrigin.path);
      await upstreamRepo.clone(upstreamBase.path, '.', ['--bare']);
      await upstreamRepo.addConfig('commit.gpgsign', 'false');
    });

    afterAll(async () => {
      await upstreamBase?.cleanup();
      await upstreamOrigin?.cleanup();
    });

    afterEach(async () => {
      await tmpDir2?.cleanup();
    });

    describe('syncForkWithUpstream()', () => {
      it('throws unknown error', async () => {
        tmpDir2 = await tmp.dir({ unsafeCleanup: true });
        GlobalConfig.set({ localDir: tmpDir2.path });

        await git.initRepo({
          url: origin.path,
          defaultBranch,
          upstreamUrl: upstreamOrigin.path,
        });

        await git.syncGit();
        await expect(
          git.syncForkWithUpstream('non-existing-branch'),
        ).rejects.toThrow(UNKNOWN_ERROR);
      });

      it('syncs fork when local for branch absent', async () => {
        tmpDir2 = await tmp.dir({ unsafeCleanup: true });
        GlobalConfig.set({ localDir: tmpDir2.path });

        // init fork repo
        await git.initRepo({
          url: origin.path,
          defaultBranch,
          upstreamUrl: upstreamOrigin.path,
        });

        await git.syncGit();
        await expect(git.syncForkWithUpstream('develop')).toResolve();
        expect(logger.logger.debug).toHaveBeenCalledWith(
          'Checking out branch develop from remote renovate-fork-upstream',
        );
      });
    });

    describe('syncGit()', () => {
      it('should fetch from upstream and update local branch', async () => {
        tmpDir2 = await tmp.dir({ unsafeCleanup: true });
        GlobalConfig.set({ localDir: tmpDir2.path });

        await git.initRepo({
          url: origin.path,
          defaultBranch,
          upstreamUrl: upstreamOrigin.path,
        });

        await git.syncGit();
        const tmpGit = Git(tmpDir2.path);

        // make sure origin exists ie. fork repo is cloned
        const originRemote = (
          await tmpGit.raw(['remote', 'get-url', 'origin'])
        ).trim();
        expect(originRemote.trim()).toBe(origin.path);

        // make sure upstream exists
        const upstreamRemote = (
          await tmpGit.raw(['remote', 'get-url', git.RENOVATE_FORK_UPSTREAM])
        ).trim();
        expect(upstreamRemote).toBe(upstreamOrigin.path);

        // verify fetch from upstream happened
        // by checking the `${RENOVATE_FORK_UPSTREAM}/main` branch in the forked repo's remote branches
        const branches = await tmpGit.branch(['-r']);
        expect(branches.all).toContain(
          `${git.RENOVATE_FORK_UPSTREAM}/${defaultBranch}`,
        );

        // verify that the HEAD's match
        const headSha = (await tmpGit.revparse(['HEAD'])).trim();
        const upstreamSha = (
          await tmpGit.revparse([
            `${git.RENOVATE_FORK_UPSTREAM}/${defaultBranch}`,
          ])
        ).trim();
        expect(headSha).toBe(upstreamSha);
      });
    });
  });

  // for coverage mostly
  describe('forkMode - errors', () => {
    it('resetHardFromRemote()', async () => {
      const resetSpy = vi.spyOn(SimpleGit.prototype, 'reset');
      resetSpy.mockRejectedValueOnce(new Error('reset error'));
      await expect(git.resetHardFromRemote('branchName')).rejects.toThrow(
        'reset error',
      );
    });

    it('forcePushToRemote()', async () => {
      const pushSpy = vi.spyOn(SimpleGit.prototype, 'push');
      pushSpy.mockRejectedValueOnce(new Error('push error'));
      await expect(git.forcePushToRemote('branch', 'origin')).rejects.toThrow(
        'push error',
      );
    });

    it('checkoutBranchFromRemote()', async () => {
      const checkoutSpy = vi.spyOn(SimpleGit.prototype, 'checkoutBranch');
      checkoutSpy.mockRejectedValueOnce(new Error('checkout error'));
      await expect(
        git.checkoutBranchFromRemote('branch', git.RENOVATE_FORK_UPSTREAM),
      ).rejects.toThrow('checkout error');
    });

    it('checkoutBranchFromRemote() - temporary error', async () => {
      const checkoutSpy = vi.spyOn(SimpleGit.prototype, 'checkoutBranch');
      checkoutSpy.mockRejectedValueOnce(new Error('fatal: ambiguous argument'));
      await expect(
        git.checkoutBranchFromRemote('branch', git.RENOVATE_FORK_UPSTREAM),
      ).rejects.toThrow(TEMPORARY_ERROR);
    });

    it('syncForkWithRemote() - returns if no upstream exists', async () => {
      await git.initRepo({
        url: origin.path,
        defaultBranch,
      });

      await expect(git.syncForkWithUpstream(defaultBranch)).toResolve();
    });
  });
});
