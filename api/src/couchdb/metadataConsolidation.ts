/**
 * Legacy metadata database consolidation for FAIMS projects.
 *
 * **Background:** Older deployments stored each project’s editable metadata (form
 * configuration, labels, and related key/value material) in a *separate* CouchDB
 * database per project, typically named `metadata-{projectId}` or referenced from
 * the project document via `metadataDb` / `metadata_db`. The UI specification
 * lived as a document with id `ui-specification` in that database; other entries
 * used ids prefixed with `project-metadata-` (or a flattened
 * `project-metadata-projectvalue` doc).
 *
 * **Current model:** Canonical project metadata and the encoded UI model are
 * stored on the project document itself (`metadata`, `ui-specification`), as
 * produced by `toCanonicalProjectMetadata` from `@faims3/data-model`. Legacy
 * pointer fields on the project doc are removed after a successful migration.
 *
 * **What this module does:** For each project (or a filtered subset), it opens
 * the legacy metadata database if it exists, reads all non-design documents,
 * merges them into a single updated project document, and writes that document
 * back to the projects database. Optional `dryRun` only reports what would
 * happen; optional `cleanup` destroys the legacy metadata database after
 * migration or when it is empty of migratable content.
 *
 * Typical callers: one-off or scripted migrations during upgrades, not hot-path
 * request handling.
 */
import PouchDB from 'pouchdb';
import {
  DatabaseInterface,
  EncodedProjectUIModel,
  ExistingProjectDocument,
  toCanonicalProjectMetadata,
} from '@faims3/data-model';
import {localGetProjectsDb} from '.';
import {COUCHDB_INTERNAL_URL, LOCAL_COUCHDB_AUTH} from '../buildconfig';

/** Prefix for legacy per-key metadata doc ids in the old metadata database. */
const LEGACY_METADATA_PREFIX = 'project-metadata-';

/** Legacy document id for the encoded UI model in the old metadata database. */
const UI_SPEC_ID = 'ui-specification';

/** A row from `allDocs` in a legacy metadata database (any shape except `_id`). */
export type LegacyMetadataDocument = {
  _id: string;
  [key: string]: unknown;
};

/** Options for {@link consolidateLegacyMetadataDbs}. */
export type ConsolidationOptions = {
  /** If true, do not write the project doc or destroy databases; only fill reports. */
  dryRun?: boolean;
  /** If true, destroy the legacy metadata DB after a successful migration or when empty. */
  cleanup?: boolean;
  /** If set, only these project ids are considered; otherwise all projects in the projects DB. */
  projectIds?: string[];
  /** Override legacy DB name per project id (otherwise derived from the project doc or `metadata-{id}`). */
  metadataDbNameByProjectId?: Record<string, string>;
};

/** Per-project outcome of a consolidation run. */
export type ConsolidationReport = {
  projectId: string;
  /** CouchDB database name used for legacy metadata for this project. */
  metadataDbName?: string;
  /** High-level result for this project in this run. */
  status:
    | 'skipped-no-metadata-db'
    | 'skipped-not-found'
    | 'dry-run'
    | 'migrated'
    | 'error';
  /** Keys dropped while normalizing metadata (see `toCanonicalProjectMetadata` report). */
  droppedKeys: string[];
  /** Keys coerced during normalization. */
  coercedKeys: string[];
  /** Non-fatal parse or validation notes from normalization. */
  parseIssues: string[];
  /** Error messages when migration failed for this project. */
  errors: string[];
  /** Whether the legacy metadata database was destroyed in this run. */
  cleanedUp: boolean;
};

/** Resolves the legacy metadata CouchDB database name for a project. */
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

/** Loads all documents from a legacy metadata database (including `_id` / `_rev`). */
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

/**
 * Parses legacy metadata DB documents into a flat metadata map and optional UI spec.
 * Skips `_design/*`. Handles `ui-specification`, `project-metadata-projectvalue`,
 * and `project-metadata-{key}` rows.
 */
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

/**
 * Builds the project document that should be written after consolidation:
 * merges {@link extractLegacyMetadataFromDocuments} with `toCanonicalProjectMetadata`,
 * attaches `ui-specification`, and strips legacy `metadataDb` / `metadata_db` fields.
 */
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
 * Walks projects (all or `projectIds`), reads each legacy metadata DB if present,
 * and writes merged `metadata` + `ui-specification` onto the project document.
 *
 * @returns One {@link ConsolidationReport} per processed project id (skipped
 *   projects still produce a report where applicable).
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
