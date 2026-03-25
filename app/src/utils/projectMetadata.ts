/**
 * Helpers for reading project metadata from the {@link Project} shape, including
 * legacy flat keys and canonical {@link ProjectMetadata} from `@faims3/data-model`.
 */
import {ProjectMetadata, toCanonicalProjectMetadata} from '@faims3/data-model';
import {Project} from '../context/slices/projectSlice';

/** Legacy string keys used in stored/flat project metadata documents. */
export type LegacyMetadataKey =
  | 'name'
  | 'pre_description'
  | 'description'
  | 'lead_institution'
  | 'project_lead'
  | 'project_status'
  | 'notebook_version'
  | 'schema_version'
  | 'showQRCodeButton'
  | 'template_id'
  | 'last_updated';

/**
 * Maps camelCase field names (e.g. UI or code conventions) to {@link LegacyMetadataKey}
 * values as they appear on raw metadata objects.
 */
export const LEGACY_METADATA_KEYS: Record<string, LegacyMetadataKey> = {
  name: 'name',
  preDescription: 'pre_description',
  description: 'description',
  leadInstitution: 'lead_institution',
  projectLead: 'project_lead',
  projectStatus: 'project_status',
  notebookVersion: 'notebook_version',
  schemaVersion: 'schema_version',
  showQRCodeButton: 'showQRCodeButton',
  templateId: 'template_id',
  lastUpdated: 'last_updated',
};

/** Arbitrary metadata object from the project slice before full validation. */
export type UnknownProjectMetadata = Record<string, unknown> | undefined;

/**
 * Normalises unknown metadata into canonical {@link ProjectMetadata} via the data model.
 *
 * @param metadata - Raw metadata (any shape accepted by `toCanonicalProjectMetadata`)
 * @returns Canonical metadata structure
 */
export const canonicaliseProjectMetadata = (
  metadata: unknown
): ProjectMetadata => {
  return toCanonicalProjectMetadata(metadata).metadata;
};

/** Reads a single top-level property from raw metadata when present. */
const getDirectMetadataValue = ({
  metadata,
  key,
}: {
  metadata: UnknownProjectMetadata;
  key: string;
}) => {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }
  return metadata[key];
};

/**
 * Resolves a value by legacy key: prefers a direct property on raw metadata, then
 * falls back to the canonical {@link ProjectMetadata} mapping (e.g. nested `info` / `settings`).
 *
 * `template_id` and `last_updated` are only read from the raw object, not from canonical paths.
 *
 * @param metadata - Project metadata (may be legacy or already canonical-compatible)
 * @param key - Legacy flat key name
 */
export const getProjectMetadataValueByLegacyKey = (
  metadata: UnknownProjectMetadata,
  key: LegacyMetadataKey
): unknown => {
  const direct = getDirectMetadataValue({metadata, key});
  if (direct !== undefined) {
    return direct;
  }

  const canonical = canonicaliseProjectMetadata(metadata);
  switch (key) {
    case 'name':
      return canonical.info.name;
    case 'description':
    case 'pre_description':
      return canonical.info.description;
    case 'lead_institution':
      return canonical.info.leadInstitution;
    case 'project_lead':
      return canonical.info.projectLead;
    case 'project_status':
      return canonical.settings.projectStatus;
    case 'notebook_version':
      return canonical.settings.notebookVersion;
    case 'schema_version':
      return canonical.settings.schemaVersion;
    case 'showQRCodeButton':
      return canonical.settings.showQRCodeButton;
    case 'template_id':
      return getDirectMetadataValue({metadata, key});
    case 'last_updated':
      return getDirectMetadataValue({metadata, key});
    default:
      return undefined;
  }
};

/** Coerces an unknown value to a display string; non-scalars become empty string. */
const asString = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value.toString();
  }
  return '';
};

/** Coerces an unknown value to boolean (string "true", number 1, or boolean). */
const asBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  return false;
};

/**
 * Project display title: `project.name` if set, otherwise metadata `name` (legacy or canonical).
 *
 * @param project - Project from app state
 */
export const getProjectName = (project: Project): string => {
  return (
    asString(project.name) ||
    asString(getProjectMetadataValueByLegacyKey(project.metadata, 'name'))
  );
};

/** Same as {@link getProjectName} (alias for clarity in list/UI contexts). */
export const getProjectDisplayName = (project: Project): string =>
  getProjectName(project);

/**
 * Short intro text from legacy `pre_description` (canonical description is shared with full description).
 *
 * @param project - Project from app state
 */
export const getProjectDescription = (project: Project): string =>
  asString(
    getProjectMetadataValueByLegacyKey(project.metadata, 'pre_description')
  );

/** Lead organisation / institution string from metadata. */
export const getProjectLeadInstitution = (project: Project): string =>
  asString(
    getProjectMetadataValueByLegacyKey(project.metadata, 'lead_institution')
  );

/** Primary contact / project lead name from metadata. */
export const getProjectLeadName = (project: Project): string =>
  asString(getProjectMetadataValueByLegacyKey(project.metadata, 'project_lead'));

/** Human-readable project status label from metadata settings. */
export const getProjectStatusLabel = (project: Project): string =>
  asString(
    getProjectMetadataValueByLegacyKey(project.metadata, 'project_status')
  );

/**
 * Reads a boolean project setting from metadata by legacy key (currently only `showQRCodeButton`).
 *
 * @param metadata - Raw project metadata
 * @param key - Setting key
 */
export const getProjectSettingBool = ({
  metadata,
  key,
}: {
  metadata: UnknownProjectMetadata;
  key: 'showQRCodeButton';
}): boolean =>
  asBoolean(getProjectMetadataValueByLegacyKey(metadata, key));
