import {ProjectMetadata, toCanonicalProjectMetadata} from '@faims3/data-model';
import {Project} from '../context/slices/projectSlice';

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

export type UnknownProjectMetadata = Record<string, unknown> | undefined;

export const canonicaliseProjectMetadata = (
  metadata: unknown
): ProjectMetadata => {
  return toCanonicalProjectMetadata(metadata).metadata;
};

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

export const getProjectName = (project: Project): string => {
  return (
    asString(project.name) ||
    asString(getProjectMetadataValueByLegacyKey(project.metadata, 'name'))
  );
};

export const getProjectDisplayName = (project: Project): string =>
  getProjectName(project);

export const getProjectDescription = (project: Project): string =>
  asString(
    getProjectMetadataValueByLegacyKey(project.metadata, 'pre_description')
  );

export const getProjectLeadInstitution = (project: Project): string =>
  asString(
    getProjectMetadataValueByLegacyKey(project.metadata, 'lead_institution')
  );

export const getProjectLeadName = (project: Project): string =>
  asString(getProjectMetadataValueByLegacyKey(project.metadata, 'project_lead'));

export const getProjectStatusLabel = (project: Project): string =>
  asString(
    getProjectMetadataValueByLegacyKey(project.metadata, 'project_status')
  );

export const getProjectSettingBool = ({
  metadata,
  key,
}: {
  metadata: UnknownProjectMetadata;
  key: 'showQRCodeButton';
}): boolean =>
  asBoolean(getProjectMetadataValueByLegacyKey(metadata, key));
