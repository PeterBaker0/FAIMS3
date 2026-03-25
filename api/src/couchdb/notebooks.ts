/*
 * Copyright 2021, 2022 Macquarie University
 *
 * Licensed under the Apache License Version 2.0 (the, "License");
 * you may not use, this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing software
 * distributed under the License is distributed on an "AS IS" BASIS
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND either express or implied.
 * See, the License, for the specific language governing permissions and
 * limitations under the License.
 *
 * Filename: index.ts
 * Description:
 *   This module provides functions to access notebooks from the database
 */

import PouchDB from 'pouchdb';
import PouchDBFind from 'pouchdb-find';
import SecurityPlugin from 'pouchdb-security-helper';
PouchDB.plugin(PouchDBFind);
PouchDB.plugin(SecurityPlugin);

import {
  Action,
  APINotebookList,
  CouchProjectUIModel,
  decodeUiSpec,
  EncodedProjectUIModel,
  ExistingProjectDocument,
  file_attachments_to_data,
  file_data_to_attachments,
  getDataDB,
  logError,
  ProjectEditableDetails,
  ProjectInfo,
  ProjectInfoSchema,
  ProjectMetadata,
  ProjectDBFields,
  ProjectDocument,
  ProjectID,
  PROJECTS_BY_TEAM_ID,
  ProjectStatus,
  Resource,
  resourceRoles,
  Role,
  setAttachmentDumperForType,
  setAttachmentLoaderForType,
  slugify,
  migrateNotebook,
  toCanonicalProjectMetadata,
  userHasProjectRole,
} from '@faims3/data-model';
import {
  initialiseDataDb,
  localGetProjectsDb,
  verifyCouchDBConnection,
} from '.';
import {COUCHDB_PUBLIC_URL, MIGRATE_NOTEBOOKS_ON_STARTUP} from '../buildconfig';
import * as Exceptions from '../exceptions';
import {userCanDo} from '../middleware';

const nowMs = () => Date.now();

const toProjectStatus = (status: ProjectInfo['status'] | undefined) =>
  status === ProjectStatus.CLOSED ? ProjectStatus.CLOSED : ProjectStatus.OPEN;

const parseTimestampMs = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && asNumber >= 0) {
      return Math.floor(asNumber);
    }
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return undefined;
};

const getProjectInfo = (project: ExistingProjectDocument): ProjectInfo => {
  const existingProjectInfo = ProjectInfoSchema.safeParse(
    (project as unknown as {project?: unknown}).project
  );
  if (existingProjectInfo.success) {
    return existingProjectInfo.data;
  }

  const canonicalMetadata = toCanonicalProjectMetadata(project.metadata).metadata;
  const projectName =
    canonicalMetadata.info.name?.trim() ||
    (typeof (project as unknown as {name?: unknown}).name === 'string' &&
    (project as unknown as {name: string}).name.trim().length > 0
      ? (project as unknown as {name: string}).name.trim()
      : '') ||
    project._id;

  return ProjectInfoSchema.parse({
    name: projectName,
    description:
      typeof (project as unknown as {description?: unknown}).description ===
      'string'
        ? (project as unknown as {description: string}).description
        : canonicalMetadata.info.description,
    teamId:
      typeof (project as unknown as {ownedByTeamId?: unknown}).ownedByTeamId ===
        'string' &&
      (project as unknown as {ownedByTeamId: string}).ownedByTeamId.trim()
        .length > 0
        ? (project as unknown as {ownedByTeamId: string}).ownedByTeamId.trim()
        : undefined,
    templateId:
      typeof (project as unknown as {templateId?: unknown}).templateId ===
        'string' &&
      (project as unknown as {templateId: string}).templateId.trim().length > 0
        ? (project as unknown as {templateId: string}).templateId.trim()
        : undefined,
    status: toProjectStatus(
      (project as unknown as {status?: ProjectStatus}).status
    ),
    createdAt:
      parseTimestampMs((project as unknown as {createdAt?: unknown}).createdAt) ??
      parseTimestampMs((project as unknown as {created?: unknown}).created) ??
      parseTimestampMs(
        (project as unknown as {last_updated?: unknown}).last_updated
      ),
    updatedAt:
      parseTimestampMs((project as unknown as {updatedAt?: unknown}).updatedAt) ??
      parseTimestampMs(
        (project as unknown as {last_updated?: unknown}).last_updated
      ) ??
      parseTimestampMs((project as unknown as {createdAt?: unknown}).createdAt) ??
      nowMs(),
  });
};

const normaliseProjectInfo = ({
  existing,
  input,
  fallbackName,
}: {
  existing?: ProjectInfo;
  input?: Partial<ProjectEditableDetails> & {status?: ProjectStatus};
  fallbackName: string;
}): ProjectInfo => {
  const base: ProjectInfo = existing ?? {
    name: fallbackName,
    status: ProjectStatus.OPEN,
    updatedAt: nowMs(),
  };

  const name =
    input?.name?.trim() && input.name.trim().length > 0
      ? input.name.trim()
      : base.name?.trim() && base.name.trim().length > 0
        ? base.name.trim()
        : fallbackName;

  return ProjectInfoSchema.parse({
    name,
    description: input?.description ?? base.description,
    teamId: input?.teamId ?? base.teamId,
    templateId: input?.templateId ?? base.templateId,
    status: toProjectStatus(input?.status ?? base.status),
    createdAt: base.createdAt,
    updatedAt: nowMs(),
  });
};

const extractNotebookPayload = (project: ExistingProjectDocument) => ({
  metadata: toCanonicalProjectMetadata(project.metadata).metadata,
  'ui-specification': project['ui-specification'],
});

const getProjectAliasFields = (project: ExistingProjectDocument) => {
  const projectInfo = getProjectInfo(project);
  return {
    name: projectInfo.name,
    template_id: projectInfo.templateId,
    ownedByTeamId: projectInfo.teamId,
    status: toProjectStatus(projectInfo.status),
    created:
      projectInfo.createdAt !== undefined
        ? new Date(projectInfo.createdAt).toISOString()
        : undefined,
    last_updated:
      projectInfo.updatedAt !== undefined
        ? new Date(projectInfo.updatedAt).toISOString()
        : undefined,
  };
};

type CreateNotebookParams = {
  project: Pick<ProjectEditableDetails, 'name' | 'description' | 'teamId'> & {
    status?: ProjectStatus;
    templateId?: string;
  };
  notebook: {
    metadata: unknown;
    'ui-specification': EncodedProjectUIModel;
  };
};

type UpdateNotebookParams = {
  projectId: string;
  project?: Partial<ProjectEditableDetails> & {status?: ProjectStatus};
  notebook?: {
    metadata: unknown;
    'ui-specification': EncodedProjectUIModel;
  };
};

const readNotebookPayload = async ({
  projectId,
}: {
  projectId: string;
}): Promise<{
  metadata: ProjectMetadata;
  'ui-specification': EncodedProjectUIModel;
} | null> => {
  const isValid = await validateNotebookID(projectId);
  if (!isValid) {
    return null;
  }
  try {
    const project = await getProjectById(projectId);
    return extractNotebookPayload(project);
  } catch (error) {
    console.error('error reading project metadata', projectId, error);
  }
  return null;
};

export const updateProjectDetailsOnly = async ({
  projectId,
  project,
}: {
  projectId: string;
  project: Partial<ProjectEditableDetails> & {status?: ProjectStatus};
}) => {
  const existingProject = await getProjectById(projectId);
  const existingProjectInfo = getProjectInfo(existingProject);
  const nextProjectInfo = normaliseProjectInfo({
    existing: existingProjectInfo,
    input: project,
    fallbackName: existingProjectInfo.name,
  });
  const updatedProject: ProjectDocument = {
    ...existingProject,
    project: nextProjectInfo,
  };
  await putProjectDoc(updatedProject);
  return projectId;
};

/**
 * Gets project IDs by teamID (who owns it)
 * @returns an array of template ids
 */
export const getProjectIdsByTeamId = async ({
  teamId,
}: {
  teamId: string;
}): Promise<string[]> => {
  const projectsDb = localGetProjectsDb();
  try {
    const resultList = await projectsDb.query<ProjectDBFields>(
      PROJECTS_BY_TEAM_ID,
      {
        key: teamId,
        include_docs: false,
      }
    );
    return resultList.rows
      .filter(res => {
        return !res.id.startsWith('_');
      })
      .map(res => {
        return res.id;
      });
  } catch (error) {
    throw new Exceptions.InternalSystemError(
      'An error occurred while reading projects by team ID from the Project DB.'
    );
  }
};

/**
 * Gets a single project document from DB
 */
export const getProjectById = async (
  id: string
): Promise<ExistingProjectDocument> => {
  try {
    return await localGetProjectsDb().get(id);
  } catch (e) {
    // Could not find the project
    throw new Exceptions.ItemNotFoundException(
      `Failed to find the project with ID ${id}.`
    );
  }
};

/**
 * Puts a single project document
 */
export const putProjectDoc = async (doc: ProjectDocument) => {
  try {
    return await localGetProjectsDb().put(doc);
  } catch (e) {
    throw new Exceptions.InternalSystemError(
      'Could not put document into Projects DB.'
    );
  }
};

/**
 * getAllProjects - get the internal project documents that reference
 * the project databases that the front end will connnect to
 */
export const getAllProjectsDirectory = async (): Promise<ProjectDocument[]> => {
  const projectsDb = localGetProjectsDb();
  const projects: ProjectDocument[] = [];
  const res = await projectsDb.allDocs<ProjectDocument>({
    include_docs: true,
  });
  res.rows.forEach(e => {
    if (e.doc !== undefined && !e.id.startsWith('_')) {
      const doc = e.doc;
      const project = {...doc, _rev: undefined};
      // delete rev so that we don't include in the result
      delete project._rev;
      // add database connection details
      if (project.dataDb) project.dataDb.base_url = COUCHDB_PUBLIC_URL;
      projects.push(project);
    }
  });
  return projects;
};

/**
 * getUserProjects - get the internal project documents that reference
 * the project databases that the front end will connnect to
 * @param user - only return projects visible to this user
 */
export const getUserProjectsDirectory = async (
  user: Express.User
): Promise<ProjectDocument[]> => {
  return (await getAllProjectsDirectory()).filter(p =>
    userCanDo({
      user,
      action: Action.READ_PROJECT_METADATA,
      resourceId: p._id,
    })
  );
};

/**
 * getNotebooks -- return an array of notebooks from the database
 * @param user - only return notebooks that this user can see
 * @returns an array of ProjectDocument objects
 */
export const getUserProjectsDetailed = async (
  user: Express.User,
  teamId: string | undefined = undefined
): Promise<APINotebookList[]> => {
  // Get projects DB
  const projectsDb = localGetProjectsDb();

  // Get all projects and filter for user access

  let allDocs;
  if (!teamId) {
    allDocs = await projectsDb.allDocs<ProjectDocument>({
      include_docs: true,
    });
  } else {
    allDocs = await projectsDb.query<ProjectDocument>(PROJECTS_BY_TEAM_ID, {
      key: teamId,
      include_docs: true,
    });
  }

  const userProjects = allDocs.rows
    .map(r => r.doc)
    .filter(d => d !== undefined && !d._id.startsWith('_'))
    .filter(p =>
      userCanDo({
        action: Action.READ_PROJECT_METADATA,
        resourceId: p!._id,
        user,
      })
    );

  // Process all projects in parallel using Promise.all
  const output = await Promise.all(
    userProjects.map(async project => {
      try {
        const projectId = project!._id;
        const notebookPayload = extractNotebookPayload(project!);
        const projectInfo = getProjectInfo(project!);
        const aliases = getProjectAliasFields(project!);

        return {
          name: aliases.name,
          is_admin: userHasProjectRole({
            user,
            projectId,
            role: Role.PROJECT_ADMIN,
          }),
          template_id: aliases.template_id,
          project_id: projectId,
          project: projectInfo,
          metadata: notebookPayload.metadata,
          ownedByTeamId: aliases.ownedByTeamId,
          status: aliases.status,
          created: aliases.created,
          last_updated: aliases.last_updated,
        } satisfies APINotebookList;
      } catch (e) {
        console.error('Error occurred during detailed notebook listing');
        logError(e);
        return undefined;
      }
    })
  );

  // Filter out null values from projects that user couldn't read
  return output.filter(item => item !== undefined);
};

/**
 * Generate a good project identifier for a new project
 * @param projectName the project name string
 * @returns a suitable project identifier
 */
const generateProjectID = (projectName: string): ProjectID => {
  return `${Date.now().toFixed()}-${slugify(projectName)}`;
};

/**
 * validateDatabases - check that all notebook databases are set up
 *  properly, add design documents if they are missing
 */
export const validateDatabases = async () => {
  try {
    const report = await verifyCouchDBConnection();

    if (!report.valid) {
      return report;
    }

    const projects = await getAllProjectsDirectory();

    for (const project of projects) {
      const projectId = project._id;
      const notebookPayload = await readNotebookPayload({projectId});
      const metadata = notebookPayload?.metadata;
      if (!metadata) {
        throw new Exceptions.InternalSystemError(
          'No project metadata found for project with ID ' + projectId
        );
      }
      if (MIGRATE_NOTEBOOKS_ON_STARTUP) {
        // Get uiSpec for migration
        const uiSpec = await getEncodedNotebookUISpec(projectId);
        if (!uiSpec) {
          throw new Exceptions.InternalSystemError(
            'Cannot find UI specification for project with ID ' + projectId
          );
        }
        await doNotebookMigration({
          projectId,
          metadata,
          uiSpec: uiSpec,
        });
      }
      // Initialise data db if required
      await initialiseDataDb({
        projectId,
        force: true,
      });
    }
    return report;
  } catch (e) {
    return {valid: false};
  }
};

/**
 * Perform notebook migration and save updated notebook
 * if required.
 */
export const doNotebookMigration = async ({
  projectId,
  metadata,
  uiSpec,
}: {
  projectId: string;
  metadata: any;
  uiSpec: EncodedProjectUIModel;
}) => {
  const {changed, migrated} = migrateNotebook({
    metadata,
    'ui-specification': uiSpec,
  });
  // update the notebook if it was changed by migration
  if (changed) {
    await updateNotebook(
      {
        projectId,
        notebook: {
          'ui-specification': migrated['ui-specification'],
          metadata: migrated.metadata,
        },
      }
    );
  }
};

/**
 * Create notebook databases and initialise them with required contents
 *
 * @param projectName Human readable project name
 * @param uispec A project Ui Specification
 * @param metadata A metadata object with properties/values
 * @returns the project id
 */
export async function createNotebook(
  params: CreateNotebookParams
): Promise<string | undefined>;
export async function createNotebook(
  projectName: string,
  uiSpec: EncodedProjectUIModel,
  metadata: unknown,
  status?: ProjectStatus,
  teamId?: string
): Promise<string | undefined>;
export async function createNotebook(
  paramsOrName: CreateNotebookParams | string,
  uiSpec?: EncodedProjectUIModel,
  metadata?: unknown,
  status?: ProjectStatus,
  teamId?: string
): Promise<string | undefined> {
  const params: CreateNotebookParams =
    typeof paramsOrName === 'string'
      ? {
          project: {
            name: paramsOrName,
            status,
            teamId,
          },
          notebook: {
            'ui-specification': uiSpec as EncodedProjectUIModel,
            metadata,
          },
        }
      : paramsOrName;
  const {project, notebook} = params;
  const projectName = project.name.trim();
  const projectId = generateProjectID(projectName);
  const dataDBName = `data-${projectId}`;
  const canonicalMetadata = toCanonicalProjectMetadata(notebook.metadata).metadata;
  canonicalMetadata.info.name = projectName.trim();
  const createdAt = nowMs();
  const projectInfo = normaliseProjectInfo({
    existing: undefined,
    input: {
      ...project,
      status: project.status ?? ProjectStatus.OPEN,
      templateId: project.templateId,
    },
    fallbackName: projectName,
  });

  const projectDoc = {
    _id: projectId,
    dataDb: {
      db_name: dataDBName,
    },
    project: {
      ...projectInfo,
      createdAt,
      updatedAt: createdAt,
    },
    metadata: canonicalMetadata,
    'ui-specification': notebook['ui-specification'],
  } satisfies ProjectDocument;

  try {
    // first add an entry to the projects db about this project
    // this is used to find the other databases below
    const projectsDB = localGetProjectsDb();
    await projectsDB.put(projectDoc);
  } catch (error) {
    console.log('Error creating project entry in projects database:', error);
    return undefined;
  }

  // data database
  await initialiseDataDb({
    projectId,
    force: true,
  });

  return projectId;
}

/**
 * Update an existing notebook definition
 * @param projectId Project identifier
 * @param uispec Project UI Spec object
 * @param metadata Project Metadata
 * @returns project_id or undefined if the project doesn't exist
 */
export async function updateNotebook(
  params: UpdateNotebookParams
): Promise<string | undefined>;
export async function updateNotebook(
  projectId: string,
  uiSpec: EncodedProjectUIModel,
  metadata: unknown
): Promise<string | undefined>;
export async function updateNotebook(
  paramsOrProjectId: UpdateNotebookParams | string,
  uiSpec?: EncodedProjectUIModel,
  metadata?: unknown
): Promise<string | undefined> {
  const params: UpdateNotebookParams =
    typeof paramsOrProjectId === 'string'
      ? {
          projectId: paramsOrProjectId,
          project:
            toCanonicalProjectMetadata(metadata).metadata.info.name?.trim()
              ? {
                  name: toCanonicalProjectMetadata(metadata).metadata.info.name!,
                }
              : undefined,
          notebook: {
            'ui-specification': uiSpec as EncodedProjectUIModel,
            metadata,
          },
        }
      : paramsOrProjectId;
  const {projectId, project: projectUpdate, notebook: notebookUpdate} = params;

  // Re-initialise data db (includes security update)
  await initialiseDataDb({
    projectId,
    force: true,
  });

  // get existing project and update canonical notebook payload/project info
  const existingProject = await getProjectById(projectId);
  const existingProjectInfo = getProjectInfo(existingProject);
  const nextProjectInfo = normaliseProjectInfo({
    existing: existingProjectInfo,
    input: projectUpdate,
    fallbackName: existingProjectInfo.name,
  });
  const nextNotebookPayload = notebookUpdate
    ? {
        metadata: toCanonicalProjectMetadata(notebookUpdate.metadata).metadata,
        'ui-specification': notebookUpdate['ui-specification'],
      }
    : extractNotebookPayload(existingProject);
  if (notebookUpdate?.metadata && typeof notebookUpdate.metadata === 'object') {
    const notebookMetadataInput = notebookUpdate.metadata as {
      name?: unknown;
      pre_description?: unknown;
      lead_institution?: unknown;
      project_lead?: unknown;
    };
    const inferredName =
      typeof notebookMetadataInput.name === 'string' &&
      notebookMetadataInput.name.trim().length > 0
        ? notebookMetadataInput.name.trim()
        : undefined;
    const inferredDescription =
      typeof notebookMetadataInput.pre_description === 'string'
        ? notebookMetadataInput.pre_description
        : undefined;
    const inferredLeadInstitution =
      typeof notebookMetadataInput.lead_institution === 'string'
        ? notebookMetadataInput.lead_institution
        : undefined;
    const inferredProjectLead =
      typeof notebookMetadataInput.project_lead === 'string'
        ? notebookMetadataInput.project_lead
        : undefined;

    if (inferredName) {
      nextNotebookPayload.metadata.info.name = inferredName;
    }
    if (inferredDescription !== undefined) {
      nextNotebookPayload.metadata.info.description = inferredDescription;
    }
    if (inferredLeadInstitution !== undefined) {
      nextNotebookPayload.metadata.info.leadInstitution = inferredLeadInstitution;
    }
    if (inferredProjectLead !== undefined) {
      nextNotebookPayload.metadata.info.projectLead = inferredProjectLead;
    }
  }

  const updatedProject: ProjectDocument = {
    ...existingProject,
    _id: projectId,
    project: nextProjectInfo,
    metadata: nextNotebookPayload.metadata,
    'ui-specification': nextNotebookPayload['ui-specification'],
  };

  await putProjectDoc(updatedProject);

  return projectId;
}

/**
 * Updates the notebook status to the targeted value
 */
export const changeNotebookStatus = async ({
  projectId,
  status,
}: {
  projectId: string;
  status: ProjectStatus;
}) => {
  // get existing project record
  const project = await getProjectById(projectId);
  const existingProjectInfo = getProjectInfo(project);

  // update status on project details
  const updated: ProjectDocument = {
    ...project,
    project: {
      ...existingProjectInfo,
      status,
      updatedAt: nowMs(),
    },
  };

  // write it back
  await putProjectDoc(updated);
};

/**
 * Updates the team associated with a notebook
 */
export const changeNotebookTeam = async ({
  projectId,
  teamId,
}: {
  projectId: string;
  teamId: string;
}) => {
  // get existing project record
  const project = await getProjectById(projectId);
  const existingProjectInfo = getProjectInfo(project);

  // update team in project details
  const updated: ProjectDocument = {
    ...project,
    project: {
      ...existingProjectInfo,
      teamId,
      updatedAt: nowMs(),
    },
  };

  // write it back
  await putProjectDoc(updated);
};

/**
 * deleteNotebook - DANGER!! Delete a notebook and all its data
 * @param project_id - project identifier
 */
export const deleteNotebook = async (project_id: string) => {
  // Get the projects DB
  const projectsDB = localGetProjectsDb();

  // If not found, 404
  if (!projectsDB) {
    throw new Exceptions.InternalSystemError(
      'Could not get the notebooks database. Contact a system administrator.'
    );
  }

  // Get the project document for given project ID
  const projectDoc = await projectsDB.get(project_id);

  if (!projectDoc) {
    throw new Exceptions.ItemNotFoundException(
      'Could not find the specified project. Are you sure the project id is correct?'
    );
  }

  // This gets the data DB
  const dataDB = await getDataDB(project_id);

  await dataDB.destroy();

  // remove the project from the projectsDB
  await projectsDB.remove(projectDoc);
};

/**
 * getNotebookPayload -- return notebook payload for a single notebook from the database
 * @param project_id a project identifier
 * @returns canonical notebook payload object or null if it doesn't exist
 */
export const getNotebookPayload = async (
  project_id: string
): Promise<{metadata: ProjectMetadata; 'ui-specification': EncodedProjectUIModel} | null> => {
  return await readNotebookPayload({projectId: project_id});
};

/**
 * @deprecated Prefer getNotebookPayload and read metadata from payload.metadata.
 * Retained temporarily for internal callers/tests during contract migration.
 */
export const getNotebookMetadata = async (
  project_id: string
): Promise<ProjectMetadata | null> => {
  const payload = await readNotebookPayload({projectId: project_id});
  return payload?.metadata ?? null;
};

/**
 * getNotebookUISpec -- return metadata for a single notebook from the database
 * @param projectId a project identifier
 * @returns the UISPec of the project or null if it doesn't exist
 */
export const getEncodedNotebookUISpec = async (
  projectId: string
): Promise<CouchProjectUIModel | null> => {
  try {
    // get the ui-specification from the project doc
    const project = await getProjectById(projectId);
    if (project['ui-specification']) {
      return project['ui-specification'] as CouchProjectUIModel;
    }
  } catch (error) {
    console.error('error reading project ui-specification', projectId, error);
  }
  return null;
};

/**
 * Gets the ready to use representation of the UI spec for a given project.
 *
 * Does this by fetching from the project doc and decoding.
 *
 * @param projectId
 * @returns The decoded project UI model (not compiled)
 */
export const getProjectUIModel = async (projectId: string) => {
  const rawUiSpec = await getEncodedNotebookUISpec(projectId);
  if (!rawUiSpec) {
    throw Error('Could not find UI spec for project with ID ' + projectId);
  }
  return decodeUiSpec(rawUiSpec);
};

/**
 * validateNotebookID - check that a project_id is a real notebook
 * @param project_id - a project identifier
 * @returns true if this is a valid project identifier
 */
export const validateNotebookID = async (
  project_id: string
): Promise<boolean> => {
  try {
    const projectsDB = localGetProjectsDb();
    if (projectsDB) {
      const projectDoc = await projectsDB.get(project_id);
      if (projectDoc) {
        return true;
      }
    }
  } catch (error) {
    return false;
  }
  return false;
};

/**
 * Fetches the roles configured for a notebook.
 * @returns A list of roles for this notebook including at least admin and user
 */
export const getRolesForNotebook = () => {
  return resourceRoles[Resource.PROJECT];
};

export async function countRecordsInNotebook(
  project_id: ProjectID
): Promise<number> {
  const dataDB = await getDataDB(project_id);
  try {
    const res = await dataDB.query('index/recordCount');
    if (res.rows.length === 0) {
      return 0;
    }
    return res.rows[0].value;
  } catch (error) {
    console.log(error);
    return 0;
  }
}

/*
 * For saving and loading attachment with type faims-attachment::Files
 */

setAttachmentLoaderForType('faims-attachment::Files', file_attachments_to_data);
setAttachmentDumperForType('faims-attachment::Files', file_data_to_attachments);
