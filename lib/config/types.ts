import type { PlatformId } from '../constants';
import type { LogLevelRemap } from '../logger/types';
import type { ManagerName } from '../manager-list.generated';
import type { CustomManager } from '../modules/manager/custom/types';
import type { RepoSortMethod, SortMethod } from '../modules/platform/types';
import type { HostRule, SkipReason } from '../types';
import type { StageName } from '../types/skip-reason';
import type { GitNoVerifyOption } from '../util/git/types';
import type { MergeConfidence } from '../util/merge-confidence/types';
import type { Timestamp } from '../util/timestamp';

export type RenovateConfigStage =
  | 'global'
  | 'inherit'
  | 'repository'
  | 'package'
  | 'branch'
  | 'pr';

export type RepositoryCacheConfig = 'disabled' | 'enabled' | 'reset';
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export type RepositoryCacheType = 'local' | string;
export type DryRunConfig = 'extract' | 'lookup' | 'full';
export type RequiredConfig = 'required' | 'optional' | 'ignored';

export interface GroupConfig extends Record<string, unknown> {
  branchName?: string;
  branchTopic?: string;
}

export type RecreateWhen = 'auto' | 'never' | 'always';
export type PlatformCommitOptions = 'auto' | 'disabled' | 'enabled';
// TODO: Proper typings
export interface RenovateSharedConfig {
  $schema?: string;
  addLabels?: string[];
  autoReplaceGlobalMatch?: boolean;
  automerge?: boolean;
  automergeSchedule?: string[];
  automergeStrategy?: MergeStrategy;
  bumpVersions?: BumpVersionConfig[];
  branchName?: string;
  branchNameStrict?: boolean;
  branchPrefix?: string;
  branchPrefixOld?: string;
  commitMessage?: string;
  commitMessageAction?: string;
  commitMessageExtra?: string;
  commitMessageLowerCase?: 'auto' | 'never';
  commitMessagePrefix?: string;
  commitMessageTopic?: string;
  confidential?: boolean;
  changelogUrl?: string;
  dependencyDashboardApproval?: boolean;
  draftPR?: boolean;
  enabled?: boolean;
  enabledManagers?: string[];
  extends?: string[];
  managerFilePatterns?: string[];
  force?: RenovateConfig;
  gitIgnoredAuthors?: string[];
  group?: GroupConfig;
  groupName?: string;
  groupSlug?: string;
  hashedBranchLength?: number;
  ignoreDeps?: string[];
  ignorePaths?: string[];
  ignoreTests?: boolean;
  includePaths?: string[];
  internalChecksAsSuccess?: boolean;
  keepUpdatedLabel?: string;
  labels?: string[];
  manager?: string;
  milestone?: number;
  npmrc?: string;
  npmrcMerge?: boolean;
  platformCommit?: PlatformCommitOptions;
  postUpgradeTasks?: PostUpgradeTasks;
  prBodyColumns?: string[];
  prBodyDefinitions?: Record<string, string>;
  prCreation?: 'immediate' | 'not-pending' | 'status-success' | 'approval';
  prPriority?: number;
  productLinks?: Record<string, string>;
  pruneBranchAfterAutomerge?: boolean;
  rebaseLabel?: string;
  rebaseWhen?: string;
  recreateClosed?: boolean;
  recreateWhen?: RecreateWhen;
  repository?: string;
  repositoryCache?: RepositoryCacheConfig;
  repositoryCacheType?: RepositoryCacheType;
  respectLatest?: boolean;
  schedule?: string[];
  semanticCommitScope?: string | null;
  semanticCommitType?: string;
  semanticCommits?: 'auto' | 'enabled' | 'disabled';
  stopUpdatingLabel?: string;
  suppressNotifications?: string[];
  timezone?: string;
  unicodeEmoji?: boolean;
}

// Config options used only within the global worker
// The below should contain config options where stage=global
export interface GlobalOnlyConfig {
  autodiscover?: boolean;
  autodiscoverFilter?: string[] | string;
  autodiscoverNamespaces?: string[];
  autodiscoverProjects?: string[];
  autodiscoverTopics?: string[];
  baseDir?: string;
  cacheDir?: string;
  containerbaseDir?: string;
  detectHostRulesFromEnv?: boolean;
  dockerCliOptions?: string;
  endpoint?: string;
  forceCli?: boolean;
  gitNoVerify?: GitNoVerifyOption[];
  gitPrivateKey?: string;
  globalExtends?: string[];
  mergeConfidenceDatasources?: string[];
  mergeConfidenceEndpoint?: string;
  platform?: PlatformId;
  prCommitsPerRunLimit?: number;
  privateKey?: string;
  privateKeyOld?: string;
  privateKeyPath?: string;
  privateKeyPathOld?: string;
  redisPrefix?: string;
  redisUrl?: string;
  repositories?: RenovateRepository[];
  useCloudMetadataServices?: boolean;
  deleteConfigFile?: boolean;
}

// Config options used within the repository worker, but not user configurable
// The below should contain config options where globalOnly=true
export interface RepoGlobalConfig {
  allowedCommands?: string[];
  allowCustomCrateRegistries?: boolean;
  allowPlugins?: boolean;
  allowScripts?: boolean;
  allowedEnv?: string[];
  allowedHeaders?: string[];
  binarySource?: 'docker' | 'global' | 'install' | 'hermit';
  cacheDir?: string;
  cacheHardTtlMinutes?: number;
  cacheTtlOverride?: Record<string, number>;
  containerbaseDir?: string;
  customEnvVariables?: Record<string, string>;
  dockerChildPrefix?: string;
  dockerCliOptions?: string;
  dockerSidecarImage?: string;
  dockerUser?: string;
  dryRun?: DryRunConfig;
  encryptedWarning?: string;
  endpoint?: string;
  executionTimeout?: number;
  exposeAllEnv?: boolean;
  gitTimeout?: number;
  githubTokenWarn?: boolean;
  includeMirrors?: boolean;
  localDir?: string;
  migratePresets?: Record<string, string>;
  platform?: PlatformId;
  presetCachePersistence?: boolean;
  httpCacheTtlDays?: number;
  autodiscoverRepoSort?: RepoSortMethod;
  autodiscoverRepoOrder?: SortMethod;
  userAgent?: string;
  dockerMaxPages?: number;
  s3Endpoint?: string;
  s3PathStyle?: boolean;
  cachePrivatePackages?: boolean;
}

export interface LegacyAdminConfig {
  localDir?: string;

  logContext?: string;

  onboarding?: boolean;
  onboardingBranch?: string;
  onboardingCommitMessage?: string;
  onboardingNoDeps?: 'auto' | 'enabled' | 'disabled';
  onboardingRebaseCheckbox?: boolean;
  onboardingPrTitle?: string;
  onboardingConfig?: RenovateSharedConfig;
  onboardingConfigFileName?: string;

  requireConfig?: RequiredConfig;
}

export type ExecutionMode = 'branch' | 'update';

export interface PostUpgradeTasks {
  commands?: string[];
  dataFileTemplate?: string;
  fileFilters?: string[];
  executionMode: ExecutionMode;
}

export type UpdateConfig<
  T extends RenovateSharedConfig = RenovateSharedConfig,
> = Partial<Record<UpdateType, T | null>>;

export type RenovateRepository =
  | string
  | {
      repository: string;
      secrets?: Record<string, string>;
      variables?: Record<string, string>;
    };

export type UseBaseBranchConfigType = 'merge' | 'none';
export type ConstraintsFilter = 'strict' | 'none';

export const allowedStatusCheckStrings = [
  'minimumReleaseAge',
  'mergeConfidence',
  'configValidation',
  'artifactError',
] as const;
export type StatusCheckKey = (typeof allowedStatusCheckStrings)[number];
type UserEnv = Record<string, string>;
// TODO: Proper typings
export interface RenovateConfig
  extends LegacyAdminConfig,
    RenovateSharedConfig,
    UpdateConfig<PackageRule>,
    AssigneesAndReviewersConfig,
    ConfigMigration,
    Record<string, unknown> {
  s3Endpoint?: string;
  s3PathStyle?: boolean;
  reportPath?: string;
  reportType?: 'logging' | 'file' | 's3' | null;
  depName?: string;
  /** user configurable base branch patterns*/
  baseBranchPatterns?: string[];
  commitBody?: string;
  useBaseBranchConfig?: UseBaseBranchConfigType;
  baseBranch?: string;
  defaultBranch?: string;
  branchList?: string[];
  cloneSubmodulesFilter?: string[];
  description?: string | string[];
  force?: RenovateConfig;
  errors?: ValidationMessage[];

  gitAuthor?: string;

  hostRules?: HostRule[];

  inheritConfig?: boolean;
  inheritConfigFileName?: string;
  inheritConfigRepoName?: string;
  inheritConfigStrict?: boolean;

  ignorePresets?: string[];
  forkProcessing?: 'auto' | 'enabled' | 'disabled';
  isFork?: boolean;

  fileList?: string[];
  configWarningReuseIssue?: boolean;
  dependencyDashboard?: boolean;
  dependencyDashboardAutoclose?: boolean;
  dependencyDashboardChecks?: Record<string, string>;
  dependencyDashboardIssue?: number;
  dependencyDashboardTitle?: string;
  dependencyDashboardHeader?: string;
  dependencyDashboardFooter?: string;
  dependencyDashboardLabels?: string[];
  dependencyDashboardOSVVulnerabilitySummary?: 'none' | 'all' | 'unresolved';
  dependencyDashboardReportAbandonment?: boolean;
  packageFile?: string;
  packageRules?: PackageRule[];
  postUpdateOptions?: string[];
  branchConcurrentLimit?: number | null;
  prConcurrentLimit?: number;
  prHourlyLimit?: number;
  forkModeDisallowMaintainerEdits?: boolean;

  defaultRegistryUrls?: string[];
  registryUrls?: string[] | null;
  registryAliases?: Record<string, string>;

  repoIsOnboarded?: boolean;
  repoIsActivated?: boolean;

  updateInternalDeps?: boolean;
  updateType?: UpdateType;

  warnings?: ValidationMessage[];
  vulnerabilityAlerts?: RenovateSharedConfig;
  osvVulnerabilityAlerts?: boolean;
  vulnerabilitySeverity?: string;
  customManagers?: CustomManager[];
  customDatasources?: Record<string, CustomDatasourceConfig>;

  fetchChangeLogs?: FetchChangeLogsOptions;
  secrets?: Record<string, string>;
  variables?: Record<string, string>;

  constraints?: Record<string, string>;
  skipInstalls?: boolean | null;

  constraintsFiltering?: ConstraintsFilter;

  checkedBranches?: string[];
  customizeDashboard?: Record<string, string>;

  statusCheckNames?: Record<StatusCheckKey, string | null>;
  /**
   * User configured environment variables that Renovate uses when executing package manager commands
   */
  env?: UserEnv;
  logLevelRemap?: LogLevelRemap[];

  branchTopic?: string;
  additionalBranchPrefix?: string;
  sharedVariableName?: string;
}

const CustomDatasourceFormats = [
  'html',
  'json',
  'plain',
  'toml',
  'yaml',
] as const;
export type CustomDatasourceFormats = (typeof CustomDatasourceFormats)[number];

export interface CustomDatasourceConfig {
  defaultRegistryUrlTemplate?: string;
  format?: CustomDatasourceFormats;
  transformTemplates?: string[];
}

export interface AllConfig
  extends RenovateConfig,
    GlobalOnlyConfig,
    RepoGlobalConfig {}

export interface AssigneesAndReviewersConfig {
  assigneesFromCodeOwners?: boolean;
  expandCodeOwnersGroups?: boolean;
  assignees?: string[];
  assigneesSampleSize?: number;
  ignoreReviewers?: string[];
  reviewersFromCodeOwners?: boolean;
  reviewers?: string[];
  reviewersSampleSize?: number;
  additionalReviewers?: string[];
  filterUnavailableUsers?: boolean;
}

export type UpdateType =
  | 'major'
  | 'minor'
  | 'patch'
  | 'pin'
  | 'digest'
  | 'pinDigest'
  | 'lockFileMaintenance'
  | 'lockfileUpdate'
  | 'rollback'
  | 'bump'
  | 'replacement';

// These are the update types which can have configuration
export const UpdateTypesOptions = [
  'major',
  'minor',
  'patch',
  'pin',
  'digest',
  'pinDigest',
  'lockFileMaintenance',
  'rollback',
  'replacement',
] as const;

export type UpdateTypeOptions = (typeof UpdateTypesOptions)[number];

export type FetchChangeLogsOptions = 'off' | 'branch' | 'pr';

export type MatchStringsStrategy = 'any' | 'recursive' | 'combination';

export type MergeStrategy =
  | 'auto'
  | 'fast-forward'
  | 'merge-commit'
  | 'rebase'
  | 'rebase-merge'
  | 'squash';

// TODO: Proper typings
export interface PackageRule
  extends RenovateSharedConfig,
    UpdateConfig,
    Record<string, unknown> {
  description?: string | string[];
  isVulnerabilityAlert?: boolean;
  matchBaseBranches?: string[];
  matchCategories?: string[];
  matchConfidence?: MergeConfidence[];
  matchCurrentAge?: string;
  matchCurrentValue?: string;
  matchCurrentVersion?: string;
  matchDatasources?: string[];
  matchDepNames?: string[];
  matchDepTypes?: string[];
  matchFileNames?: string[];
  matchManagers?: string[];
  matchNewValue?: string;
  matchPackageNames?: string[];
  matchRepositories?: string[];
  matchSourceUrls?: string[];
  matchUpdateTypes?: UpdateType[];
  matchJsonata?: string[];
  registryUrls?: string[] | null;
  vulnerabilitySeverity?: string;
  vulnerabilityFixVersion?: string;
}

export interface ValidationMessage {
  topic: string;
  message: string;
}

export type AllowedParents =
  | '.'
  | 'bumpVersions'
  | 'customDatasources'
  | 'customManagers'
  | 'hostRules'
  | 'logLevelRemap'
  | 'packageRules'
  | 'postUpgradeTasks'
  | 'vulnerabilityAlerts'
  | ManagerName
  | UpdateTypeOptions;
export interface RenovateOptionBase {
  /**
   * If true, the option can only be configured by people with access to the Renovate instance.
   * Furthermore, the option should be documented in docs/usage/self-hosted-configuration.md.
   */
  globalOnly?: boolean;

  inheritConfigSupport?: boolean;

  allowedValues?: string[];

  allowString?: boolean;

  cli?: boolean;

  description: string;

  env?: false | string;

  /**
   * Do not validate object children
   */
  freeChoice?: boolean;

  mergeable?: boolean;

  autogenerated?: boolean;

  name: string;

  parents?: AllowedParents[];

  stage?: RenovateConfigStage;

  experimental?: boolean;

  experimentalDescription?: string;

  experimentalIssues?: number[];

  advancedUse?: boolean;

  /**
   * This is used to add depreciation message in the docs
   */
  deprecationMsg?: string;

  /**
   * For internal use only: add it to any config option that supports regex or glob matching
   */
  patternMatch?: boolean;

  /**
   * For internal use only: add it to any config option of type integer that supports negative integers
   */
  allowNegative?: boolean;

  /**
   * Managers which support this option, leave undefined if all managers support it.
   */
  supportedManagers?: string[];

  /**
   * Platforms which support this option, leave undefined if all platforms support it.
   */
  supportedPlatforms?: PlatformId[];
}

export interface RenovateArrayOption<
  T extends string | number | Record<string, unknown> = Record<string, unknown>,
> extends RenovateOptionBase {
  default?: T[] | null;
  mergeable?: boolean;
  type: 'array';
  subType?: 'string' | 'object' | 'number';
}

export interface RenovateStringArrayOption extends RenovateArrayOption<string> {
  format?: 'regex';
  subType: 'string';
}

export interface RenovateNumberArrayOption extends RenovateArrayOption<number> {
  subType: 'number';
}

export interface RenovateBooleanOption extends RenovateOptionBase {
  default?: boolean | null;
  type: 'boolean';
}

export interface RenovateIntegerOption extends RenovateOptionBase {
  default?: number | null;
  type: 'integer';
}

export interface RenovateStringOption extends RenovateOptionBase {
  default?: string | null;
  format?: 'regex';

  // Not used
  replaceLineReturns?: boolean;
  type: 'string';
}

export interface RenovateObjectOption extends RenovateOptionBase {
  default?: any;
  additionalProperties?: Record<string, unknown> | boolean;
  mergeable?: boolean;
  type: 'object';
}

export type RenovateOptions =
  | RenovateStringOption
  | RenovateNumberArrayOption
  | RenovateStringArrayOption
  | RenovateIntegerOption
  | RenovateBooleanOption
  | RenovateArrayOption
  | RenovateObjectOption;

export interface PackageRuleInputConfig extends Record<string, unknown> {
  versioning?: string;
  packageFile?: string;
  lockFiles?: string[];
  depType?: string;
  depTypes?: string[];
  depName?: string;
  packageName?: string | null;
  newValue?: string | null;
  currentValue?: string | null;
  currentVersion?: string;
  lockedVersion?: string;
  updateType?: UpdateType;
  mergeConfidenceLevel?: MergeConfidence | undefined;
  isBump?: boolean;
  sourceUrl?: string | null;
  categories?: string[];
  baseBranch?: string;
  manager?: string;
  datasource?: string;
  packageRules?: (PackageRule & PackageRuleInputConfig)[];
  releaseTimestamp?: Timestamp | null;
  repository?: string;
  currentVersionAgeInDays?: number;
  currentVersionTimestamp?: string;
  enabled?: boolean;
  skipReason?: SkipReason;
  skipStage?: StageName;
}

export interface ConfigMigration {
  configMigration?: boolean;
}

export interface MigratedConfig {
  isMigrated: boolean;
  migratedConfig: RenovateConfig;
}

export interface MigratedRenovateConfig extends RenovateConfig {
  endpoints?: HostRule[];
  pathRules: PackageRule[];
  packages: PackageRule[];

  node?: RenovateConfig;
  travis?: RenovateConfig;
  gradle?: RenovateConfig;
}

export interface ManagerConfig extends RenovateConfig {
  manager: string;
}

export interface ValidationResult {
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
}

export interface BumpVersionConfig {
  bumpType?: string;
  filePatterns: string[];
  matchStrings: string[];
  name?: string;
}
