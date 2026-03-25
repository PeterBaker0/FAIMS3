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
 * Filename: backupRestore.ts
 * Description:
 *    Functions to backup and restore databases from JSONL backups.
 *
 *    Restore flow (high level):
 *    - Stream the backup line by line. Each `type: "header"` line switches
 *      the active logical database (projects, data, legacy metadata, or other).
 *    - Projects and data DB sections are written straight to the local Pouch
 *      targets used today (shared projects DB; per-project data DBs).
 *
 *    Legacy per-project metadata databases (backup DB names starting with
 *    `metadata`, with project id after `||`) are handled specially:
 *    - Historically, each project had its own Couch metadata DB holding docs
 *      such as `ui-specification`, `project-metadata-*` keys, etc., while the
 *      projects DB held a lighter project record (sometimes with pointers like
 *      `metadataDb` / `metadata_db`). New deployments keep metadata and UI spec
 *      on the project document in the projects DB (see `metadataConsolidation`).
 *    - We do not recreate separate metadata DBs on restore: that would bring
 *      back a layout the app no longer treats as the source of truth, and would
 *      duplicate information already (or soon) represented on project docs.
 *    - Instead, metadata backup lines are accumulated in memory per project id.
 *      After the file is processed, we (1) normalise project rows that still
 *      use older shapes (`toCanonicalProjectMetadata`, default `ui-specification`),
 *      then (2) merge each project’s buffered legacy metadata docs into its
 *      project document via `buildConsolidatedProjectDoc` and write once to the
 *      projects DB. That yields a single consistent, consolidated store after
 *      restore—equivalent in outcome to running consolidation against live DBs.
 */
import {
  batchWriteDocuments,
  ExistingProjectDocument,
  toCanonicalProjectMetadata,
} from '@faims3/data-model';
import {open} from 'node:fs/promises';
import {initialiseDataDb, localGetProjectsDb} from '.';
import {
  buildConsolidatedProjectDoc,
  LegacyMetadataDocument,
} from './metadataConsolidation';

/**
 * restoreFromBackup - restore databases from a JSONL backup file
 * Backup file contains one line per document from the database
 * Each database starts with a JSONL line with the key `type="header"`
 * @param filename - file containing JSONL backup of databases
 * @param pattern - optional regex pattern to filter databases to restore
 * @param force - if true, overwrite existing documents if present, default is false
 */
export const restoreFromBackup = async ({
  filename,
  pattern = '.*',
  force = false,
}: {
  filename: string;
  pattern?: string;
  force?: boolean;
}) => {
  const file = await open(filename);

  let dbName: string;
  let db: any;
  let line_number = 1;
  let processedCount = 0;
  const GC_INTERVAL = 1000; // Force GC every 1000 records
  const BATCH_SIZE = 500; // Smaller batches
  let batch: any[] = [];
  let skipping = false;
  const projectIdsSeen = new Set<string>();
  /** Buffered legacy metadata DB rows, keyed by project id — written only after
   *  the full pass, merged into the projects DB (see file header). */
  const metadataDocsByProjectId: Record<string, LegacyMetadataDocument[]> = {};
  let currentDatabaseType: 'projects' | 'data' | 'metadata' | 'other' = 'other';
  /** Set from `metadata||<projectId>` header segments while streaming metadata sections. */
  let currentMetadataProjectId: string | undefined = undefined;

  try {
    for await (const line of file.readLines()) {
      if (processedCount % GC_INTERVAL === 0 && processedCount > 0) {
        // Process batch before GC
        if (batch.length > 0 && db) {
          await batchWriteDocuments({
            db,
            documents: batch,
            writeOnClash: true,
          });
          // console.log(
          //   `Batch results: ${results.successful} successful, ${results.failed} failed`
          // );
          batch = []; // Clear batch
        }

        if (global.gc) {
          global.gc();
        }

        // const memUsage = process.memoryUsage();
        // console.log(
        //   `Processed ${processedCount} records. Heap: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`
        // );
      }

      try {
        let doc = JSON.parse(line);
        if (doc.type === 'header') {
          // write out any remaining documents to the previous db
          if (batch.length > 0 && db) {
            await batchWriteDocuments({
              db,
              documents: batch,
              writeOnClash: force,
            });
            // console.log(
            //   `Batch results: ${results.successful} successful, ${results.failed} failed`
            // );
            batch = [];
          }
          // update the database
          dbName = doc.database;
          skipping = dbName.match(pattern) === null;
          if (skipping) {
            console.log(`Skipping database ${dbName}`);
          } else {
            console.log(`Processing database ${dbName}`);
          }
          if (dbName.startsWith('projects')) {
            currentDatabaseType = 'projects';
            currentMetadataProjectId = undefined;
            // name will be eg. 'projects_default', where 'default' is the
            // conductor instance id
            // we'll put all projects into our projectsDB
            db = localGetProjectsDb();
          } else if (!skipping && dbName.startsWith('metadata')) {
            currentDatabaseType = 'metadata';
            const projectId = dbName.split('||')[1];
            if (projectId) {
              currentMetadataProjectId = projectId;
              if (!metadataDocsByProjectId[projectId]) {
                metadataDocsByProjectId[projectId] = [];
              }
            } else {
              currentMetadataProjectId = undefined;
            }
            // No target Pouch DB: legacy metadata is not restored as its own
            // database. Documents in this section are appended to
            // metadataDocsByProjectId and merged after EOF (see below).
            db = undefined;
          } else if (!skipping && dbName.startsWith('data')) {
            currentDatabaseType = 'data';
            currentMetadataProjectId = undefined;
            const projectName = dbName.split('||')[1];
            // TODO: set up permissions for the databases
            db = await initialiseDataDb({
              projectId: projectName,
              force: true,
            });
            projectIdsSeen.add(projectName);
          } else {
            currentDatabaseType = 'other';
            currentMetadataProjectId = undefined;
            // don't try to restore anything we don't know about
            db = undefined;
          }
        } else if (
          !skipping &&
          !doc.id.startsWith('_design') &&
          currentDatabaseType === 'metadata' &&
          currentMetadataProjectId
        ) {
          // Strip _rev so merged content can be applied to the project doc
          // without revision conflicts from the old metadata DB.
          const metadataDoc = {
            _id: doc.doc._id,
            ...doc.doc,
          };
          delete metadataDoc._rev;
          metadataDocsByProjectId[currentMetadataProjectId].push(
            metadataDoc as LegacyMetadataDocument
          );
        } else if (!skipping && !doc.id.startsWith('_design') && db) {
          // don't try to restore design documents as these will have been
          // created on the database initialisation
          // Minimal document copy
          const docToWrite = {
            _id: doc.doc._id,
            ...doc.doc,
          };
          // delete the _rev attribute so that we can put it into an empty db
          // if we were restoring into an existing db, we would need to be more
          // careful and check whether this _rev is present in the db already
          delete docToWrite._rev;

          batch.push(docToWrite);

          if (batch.length >= BATCH_SIZE) {
            await batchWriteDocuments({
              db,
              documents: batch,
              writeOnClash: force,
            });
            // console.log(
            //   `Batch results: ${results.successful} successful, ${results.failed} failed`
            // );
            batch = [];
          }
        }
        processedCount += 1;
        // Explicitly null out references to help GC
        doc = null;
      } catch (e: any) {
        console.error(
          `error parsing JSON on line ${line_number} ${JSON.stringify(e, undefined, 2)} ${e.stack}`
        );
        return;
      }
      line_number += 1;
    }
    // Process final batch
    if (batch.length > 0 && db) {
      await batchWriteDocuments({db, documents: batch, writeOnClash: force});
      batch = [];
    }

    // Post-pass: projects DB may contain rows from an older backup shape
    // (missing embedded `metadata` / `ui-specification`). Normalise those first
    // so consolidation has a consistent base document to merge into.
    const projectsDb = localGetProjectsDb();
    const projectsDocs = await projectsDb.allDocs<ExistingProjectDocument>({
      include_docs: true,
    });
    for (const row of projectsDocs.rows) {
      const doc = row.doc;
      if (!doc || row.id.startsWith('_')) {
        continue;
      }
      const canonical = toCanonicalProjectMetadata((doc as any).metadata);
      const nameFromDoc = (doc as any).name;
      if (!canonical.metadata.info.name && typeof nameFromDoc === 'string') {
        canonical.metadata.info.name = nameFromDoc;
      }

      const needsUiSpec = !(doc as any)['ui-specification'];
      const needsMetadata = !(doc as any).metadata;
      if (!needsUiSpec && !needsMetadata) {
        continue;
      }

      await projectsDb.put({
        ...doc,
        metadata: canonical.metadata,
        'ui-specification':
          (doc as any)['ui-specification'] ?? {
            fields: {},
            fviews: {},
            viewsets: {},
            visible_types: [],
          },
      });
    }

    // Merge each project’s buffered legacy metadata DB snapshot into its
    // project document (same rules as `consolidateLegacyMetadataDbs` /
    // `buildConsolidatedProjectDoc`). Skips ids with no matching project row
    // (e.g. orphaned metadata backup sections).
    for (const projectId of Object.keys(metadataDocsByProjectId)) {
      const project = await projectsDb.get(projectId).catch(() => undefined);
      if (!project) {
        continue;
      }
      const {nextProject} = buildConsolidatedProjectDoc({
        project: project as ExistingProjectDocument,
        legacyMetadataDocs: metadataDocsByProjectId[projectId],
      });
      await projectsDb.put(nextProject);
    }
  } finally {
    await file.close();
  }
  console.log(`Restore completed. Total records processed: ${processedCount}`);
};
