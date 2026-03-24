import {
  LegacyFlatProjectMetadata,
  ProjectMetadata,
  toCanonicalProjectMetadata,
  toLegacyFlatMetadata,
} from '@faims3/data-model';

export const canonicaliseProjectMetadata = (
  metadata: unknown
): ProjectMetadata => {
  return toCanonicalProjectMetadata(metadata).metadata;
};

export const getProjectName = (metadata: unknown, fallback = ''): string => {
  const canonical = canonicaliseProjectMetadata(metadata);
  return canonical.info.name ?? fallback;
};

export const getProjectDescription = (
  metadata: unknown,
  fallback = ''
): string => {
  const canonical = canonicaliseProjectMetadata(metadata);
  return canonical.info.description ?? fallback;
};

export const getProjectLead = (metadata: unknown, fallback = ''): string => {
  const canonical = canonicaliseProjectMetadata(metadata);
  return canonical.info.projectLead ?? fallback;
};

export const getProjectStatus = (metadata: unknown, fallback = ''): string => {
  const canonical = canonicaliseProjectMetadata(metadata);
  return canonical.settings.projectStatus ?? fallback;
};

export const getShowQRCodeButton = (metadata: unknown): boolean => {
  const canonical = canonicaliseProjectMetadata(metadata);
  return canonical.settings.showQRCodeButton ?? false;
};

export const toDesignerLegacyFlatMetadata = (
  metadata: unknown
): LegacyFlatProjectMetadata => {
  return toLegacyFlatMetadata(canonicaliseProjectMetadata(metadata));
};

const LEGACY_TO_CANONICAL_KEY: Record<string, (m: ProjectMetadata) => unknown> = {
  name: m => m.info.name,
  pre_description: m => m.info.description,
  description: m => m.info.description,
  project_lead: m => m.info.projectLead,
  lead_institution: m => m.info.leadInstitution,
  project_status: m => m.settings.projectStatus,
  notebook_version: m => m.settings.notebookVersion,
  schema_version: m => m.settings.schemaVersion,
  showQRCodeButton: m => m.settings.showQRCodeButton,
};

export const getProjectMetadataValue = (
  metadata: unknown,
  key: string
): unknown => {
  if (metadata && typeof metadata === 'object') {
    const direct = (metadata as Record<string, unknown>)[key];
    if (direct !== undefined) {
      return direct;
    }
  }

  const canonical = canonicaliseProjectMetadata(metadata);
  const getter = LEGACY_TO_CANONICAL_KEY[key];
  if (getter) {
    return getter(canonical);
  }
  return canonical.userMetadata[key];
};

export const getMetadataName = (metadata: unknown, fallback = ''): string =>
  getProjectName(metadata, fallback);

export const getMetadataDescription = (
  metadata: unknown,
  fallback = ''
): string => getProjectDescription(metadata, fallback);

export const getMetadataProjectLead = (
  metadata: unknown,
  fallback = ''
): string => getProjectLead(metadata, fallback);

export const getMetadataLeadInstitution = (
  metadata: unknown,
  fallback = ''
): string => {
  const canonical = canonicaliseProjectMetadata(metadata);
  return canonical.info.leadInstitution ?? fallback;
};

export const getMetadataNotebookVersion = (
  metadata: unknown,
  fallback = ''
): string => {
  const canonical = canonicaliseProjectMetadata(metadata);
  return canonical.settings.notebookVersion ?? fallback;
};

export const getMetadataShowQRCodeButton = (metadata: unknown): boolean =>
  getShowQRCodeButton(metadata);

export const setMetadataName = (metadata: unknown, name: string): string => {
  const canonical = canonicaliseProjectMetadata(metadata);
  canonical.info.name = name;
  return name;
};

export const setMetadataDescription = (
  metadata: unknown,
  description: string
): string => {
  const canonical = canonicaliseProjectMetadata(metadata);
  canonical.info.description = description;
  return description;
};

export const setMetadataProjectLead = (
  metadata: unknown,
  projectLead: string
): string => {
  const canonical = canonicaliseProjectMetadata(metadata);
  canonical.info.projectLead = projectLead;
  return projectLead;
};

export const setMetadataLeadInstitution = (
  metadata: unknown,
  leadInstitution: string
): string => {
  const canonical = canonicaliseProjectMetadata(metadata);
  canonical.info.leadInstitution = leadInstitution;
  return leadInstitution;
};

export const setMetadataNotebookVersion = (
  metadata: unknown,
  notebookVersion: string
): string => {
  const canonical = canonicaliseProjectMetadata(metadata);
  canonical.settings.notebookVersion = notebookVersion;
  return notebookVersion;
};

export const setMetadataShowQRCodeButton = (
  metadata: unknown,
  show: boolean
): string => {
  const canonical = canonicaliseProjectMetadata(metadata);
  canonical.settings.showQRCodeButton = show;
  return show ? 'true' : 'false';
};

export const legacyMetadataName = (metadata: unknown): string => {
  return getMetadataName(metadata, 'notebook');
};

export const getMetadataProjectStatus = (
  metadata: unknown,
  fallback = ''
): string => getProjectStatus(metadata, fallback);

export const getTemplateProjectStatus = (metadata: unknown): string =>
  getMetadataProjectStatus(metadata, '');

export const getTemplateStatus = (metadata: unknown): string =>
  getTemplateProjectStatus(metadata);
