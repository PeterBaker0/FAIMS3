import {ProjectMetadata, toCanonicalProjectMetadata} from '@faims3/data-model';
import {Project} from '../context/slices/projectSlice';

export const canonicaliseProjectMetadata = (
  metadata: unknown
): ProjectMetadata => {
  return toCanonicalProjectMetadata(metadata).metadata;
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

export const getProjectName = (project: Project): string => {
  return asString(project.project?.name);
};

export const getProjectDisplayName = (project: Project): string =>
  getProjectName(project);

export const getProjectDescription = (project: Project): string =>
  asString(project.project?.description);

export const getProjectLeadInstitution = (project: Project): string => {
  const canonical = canonicaliseProjectMetadata(project.metadata);
  return asString(canonical.info.leadInstitution);
};

export const getProjectLeadName = (project: Project): string => {
  const canonical = canonicaliseProjectMetadata(project.metadata);
  return asString(canonical.info.projectLead);
};

export const getProjectStatusLabel = (project: Project): string =>
  asString(project.project?.status);

export const getProjectTemplateId = (
  project: Project
): string | undefined => {
  const templateId = project.project?.templateId;
  if (!templateId || templateId.trim().length === 0) {
    return undefined;
  }
  return templateId;
};

export const getProjectLastUpdated = (
  project: Project
): string | undefined => {
  const timestamp = project.project?.updatedAt;
  if (timestamp === undefined || timestamp === null) {
    return undefined;
  }
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed.toLocaleString();
};

export const getProjectSettingBool = ({
  metadata,
  key,
}: {
  metadata: unknown;
  key: 'showQRCodeButton';
}): boolean => {
  const canonical = canonicaliseProjectMetadata(metadata);
  if (key === 'showQRCodeButton') {
    return canonical.settings.showQRCodeButton ?? false;
  }
  return false;
};
