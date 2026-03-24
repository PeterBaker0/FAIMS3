import PouchDB from 'pouchdb';
import {
  DatabaseInterface,
  EncodedProjectUIModel,
  ExistingProjectDocument,
  toCanonicalProjectMetadata,
} from '@faims3/data-model';
import {localGetProjectsDb} from '.';
import {COUCHDB_INTERNAL_URL, LOCAL_COUCHDB_AUTH} from '../buildconfig';

const LEGACY_METADATA_PREFIX = 'project-metadata-';
const UI_SPEC_ID = 'ui-specification';

export type LegacyMetadataDocument = {
  _id: string;
  [key: string]: unknown;
};

export type ConsolidationOptions = {
  dryRun?: boolean;
  cleanup?: boolean;
  projectIds?: string[];
  metadataDbNameByProjectId?: Record<string, string>;
};

export type ConsolidationReport = {
  projectId: string;
  metadataDbName?: string;
  status:
    | 'skipped-no-metadata-db'
    | 'skipped-not-found'
    | 'dry-run'
    | 'migrated'
    | 'error';
  droppedKeys: string[];
  coercedKeys: string[];
  parseIssues: string[];
  errors: string[];
  cleanedUp: boolean;
};

const getLegacyMetadataDbName = ({
  project,
  explicitDbName,
}: {
  project: ExistingProjectDocument;
  explicitDbName?: string;
}): string => {
  if (explicitDbName) {
    return explicitDbName;
  }
  const doc = project as ExistingProjectDocument & {
    metadataDb?: {db_name?: string};
    metadata_db?: {db_name?: string};
  };
  return (
    doc.metadataDb?.db_name ??
    doc.metadata_db?.db_name ??
    `metadata-${project._id}`
  );
};

const readLegacyMetadataDocuments = async ({
  metadataDb,
}: {
  metadataDb: DatabaseInterface;
}) => {
  const docs = await metadataDb.allDocs({include_docs: true});
  const records: LegacyMetadataDocument[] = [];
  for (const row of docs.rows) {
    if (!row.doc) {
      continue;
    }
    records.push(row.doc as unknown as LegacyMetadataDocument);
  }
  return records;
};

export const extractLegacyMetadataFromDocuments = (
  docs: LegacyMetadataDocument[]
) => {
  let uiSpec: EncodedProjectUIModel | undefined;
  const flatMetadata: Record<string, unknown> = {};

  for (const doc of docs) {
    if (doc._id.startsWith('_design/')) continue;

    if (doc._id === UI_SPEC_ID) {
      const spec = {...(doc as any)};
      delete (spec as any)._id;
      delete (spec as any)._rev;
      uiSpec = spec as EncodedProjectUIModel;
      continue;
    }

    if (doc._id === `${LEGACY_METADATA_PREFIX}projectvalue`) {
      const projectValue = {...(doc as any)};
      delete projectValue._id;
      delete projectValue._rev;
      Object.assign(flatMetadata, projectValue);
      continue;
    }

    if (doc._id.startsWith(LEGACY_METADATA_PREFIX)) {
      const key = doc._id.substring(LEGACY_METADATA_PREFIX.length);
      const valDoc = doc as any;
      flatMetadata[key] =
        valDoc && Object.prototype.hasOwnProperty.call(valDoc, 'metadata')
          ? valDoc.metadata
          : valDoc;
    }
  }

  return {uiSpec, flatMetadata};
};

export const buildConsolidatedProjectDoc = ({
  project,
  legacyMetadataDocs,
}: {
  project: ExistingProjectDocument;
  legacyMetadataDocs: LegacyMetadataDocument[];
}) => {
  const {uiSpec, flatMetadata} =
    extractLegacyMetadataFromDocuments(legacyMetadataDocs);
  const conversion = toCanonicalProjectMetadata(flatMetadata);

  const nextUiSpec =
    uiSpec ??
    project['ui-specification'] ?? {
      fields: {},
      fviews: {},
      viewsets: {},
      visible_types: [],
    };

  const nextProject: ExistingProjectDocument = {
    ...project,
    metadata: conversion.metadata,
    'ui-specification': nextUiSpec,
  };

  // Remove legacy pointer props if they still exist.
  delete (nextProject as any).metadataDb;
  delete (nextProject as any).metadata_db;

  return {nextProject, conversion};
};

/**
 * Consolidates legacy per-project metadata DB documents into project docs.
 * Supports dry-run reports and optional cleanup of legacy metadata DBs.
 */
export const consolidateLegacyMetadataDbs = async ({
  dryRun = false,
  cleanup = false,
  projectIds,
  metadataDbNameByProjectId = {},
}: ConsolidationOptions = {}): Promise<ConsolidationReport[]> => {
  const projectsDb = localGetProjectsDb();
  const reports: ConsolidationReport[] = [];

  const projectRows = projectIds
    ? await Promise.all(
        projectIds.map(async id => {
          try {
            const doc = await projectsDb.get(id);
            return doc;
          } catch {
            return undefined;
          }
        })
      )
    : (
        await projectsDb.allDocs<ExistingProjectDocument>({include_docs: true})
      ).rows
        .map(r => r.doc)
        .filter((d): d is ExistingProjectDocument => !!d);

  for (const project of projectRows) {
    if (!project) {
      continue;
    }
    const metadataDbName = getLegacyMetadataDbName({
      project,
      explicitDbName: metadataDbNameByProjectId[project._id],
    });

    const report: ConsolidationReport = {
      projectId: project._id,
      metadataDbName,
      status: 'skipped-no-metadata-db',
      droppedKeys: [],
      coercedKeys: [],
      parseIssues: [],
      errors: [],
      cleanedUp: false,
    };

    const metadataDbUrl = `${COUCHDB_INTERNAL_URL}/${metadataDbName}`;
    const metadataDb = new PouchDB(metadataDbUrl, {
      skip_setup: true,
      ...(process.env.NODE_ENV === 'test' ? {adapter: 'memory'} : {}),
      ...(LOCAL_COUCHDB_AUTH ? {auth: LOCAL_COUCHDB_AUTH} : {}),
    }) as unknown as DatabaseInterface;

    try {
      await metadataDb.info();
    } catch {
      report.status = 'skipped-no-metadata-db';
      reports.push(report);
      continue;
    }

    try {
      const legacyMetadataDocs = await readLegacyMetadataDocuments({metadataDb});
      const extracted = extractLegacyMetadataFromDocuments(legacyMetadataDocs);
      const hasLegacyMetadata =
        extracted.uiSpec !== undefined ||
        Object.keys(extracted.flatMetadata).length > 0;

      if (!hasLegacyMetadata) {
        report.status = 'skipped-not-found';
        if (!dryRun && cleanup) {
          await metadataDb.destroy();
          report.cleanedUp = true;
        }
        reports.push(report);
        continue;
      }

      const {nextProject, conversion} = buildConsolidatedProjectDoc({
        project,
        legacyMetadataDocs,
      });
      report.droppedKeys = conversion.report.droppedKeys;
      report.coercedKeys = conversion.report.coercedKeys;
      report.parseIssues = conversion.report.parseIssues;

      if (!dryRun) {
        await projectsDb.put(nextProject);
        report.status = 'migrated';

        if (cleanup) {
          await metadataDb.destroy();
          report.cleanedUp = true;
        }
      } else {
        report.status = 'dry-run';
      }
    } catch (error: any) {
      report.status = 'error';
      report.errors.push(error?.message ?? String(error));
    }

    reports.push(report);
  }

  return reports;
};
