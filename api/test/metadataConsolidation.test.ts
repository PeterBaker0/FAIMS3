import PouchDB from 'pouchdb';
import PouchDBFind from 'pouchdb-find';
PouchDB.plugin(PouchDBFind);
PouchDB.plugin(require('pouchdb-adapter-memory')); // enable memory adapter for testing

import {DatabaseInterface, EncodedProjectUIModel} from '@faims3/data-model';
import {expect} from 'chai';
import {COUCHDB_INTERNAL_URL} from '../src/buildconfig';
import {consolidateLegacyMetadataDbs} from '../src/couchdb/metadataConsolidation';
import {createNotebook, getProjectById} from '../src/couchdb/notebooks';
import {resetDatabases} from './mocks';

const initialUiSpec: EncodedProjectUIModel = {
  fields: {},
  fviews: {},
  viewsets: {},
  visible_types: [],
};

const migratedUiSpec: EncodedProjectUIModel = {
  fields: {
    migratedField: {
      type: 'faims-core::String',
    },
  } as any,
  fviews: {},
  viewsets: {},
  visible_types: ['MigratedForm'],
};

const createLegacyMetadataDb = async (projectId: string) => {
  const metadataDbName = `metadata-${projectId}`;
  const metadataDb = new PouchDB(`${COUCHDB_INTERNAL_URL}/${metadataDbName}`, {
    adapter: 'memory',
  }) as unknown as DatabaseInterface;

  await metadataDb.put({
    _id: 'ui-specification',
    ...migratedUiSpec,
  });
  await metadataDb.put({
    _id: 'project-metadata-projectvalue',
    project_lead: 'Migrated Lead',
    lead_institution: 'Migrated Institution',
    showQRCodeButton: 'true',
  });
  await metadataDb.put({
    _id: 'project-metadata-project_status',
    metadata: 'archived',
  });
  await metadataDb.put({
    _id: 'project-metadata-customField',
    metadata: 'custom value',
  });

  return {metadataDbName, metadataDb};
};

describe('metadata consolidation', () => {
  beforeEach(async () => {
    await resetDatabases();
  });

  it('supports dry-run without mutating project docs', async () => {
    const projectId = await createNotebook('Dry Run Notebook', initialUiSpec, {
      project_lead: 'Original Lead',
      lead_institution: 'Original Institution',
      showQRCodeButton: false,
    });

    expect(projectId).to.not.be.undefined;
    if (!projectId) throw new Error('Failed to create project for dry-run test');

    const {metadataDb} = await createLegacyMetadataDb(projectId);

    const projectBefore = await getProjectById(projectId);
    const reports = await consolidateLegacyMetadataDbs({
      dryRun: true,
      projectIds: [projectId],
    });

    expect(reports).to.have.lengthOf(1);
    expect(reports[0].status).to.equal('dry-run');
    expect(reports[0].cleanedUp).to.equal(false);
    expect(reports[0].errors).to.deep.equal([]);
    expect(reports[0].coercedKeys).to.include('showQRCodeButton');

    const projectAfter = await getProjectById(projectId);
    expect(projectAfter.metadata.info.projectLead).to.equal(
      projectBefore.metadata.info.projectLead
    );
    expect(projectAfter.metadata.info.leadInstitution).to.equal(
      projectBefore.metadata.info.leadInstitution
    );
    expect(projectAfter['ui-specification']).to.deep.equal(
      projectBefore['ui-specification']
    );

    const metadataDbInfo = await metadataDb.info();
    expect(metadataDbInfo.doc_count).to.equal(4);
  });

  it('migrates metadata and ui-spec into projects DB and cleans up legacy DB', async () => {
    const projectId = await createNotebook(
      'Real Run Notebook',
      initialUiSpec,
      {
        project_lead: 'Original Lead',
        lead_institution: 'Original Institution',
        showQRCodeButton: false,
      }
    );

    expect(projectId).to.not.be.undefined;
    if (!projectId) throw new Error('Failed to create project for migration test');

    const {metadataDb} = await createLegacyMetadataDb(projectId);

    const reports = await consolidateLegacyMetadataDbs({
      cleanup: true,
      projectIds: [projectId],
    });

    expect(reports).to.have.lengthOf(1);
    expect(reports[0].status).to.equal('migrated');
    expect(reports[0].cleanedUp).to.equal(true);
    expect(reports[0].errors).to.deep.equal([]);
    expect(reports[0].coercedKeys).to.include('showQRCodeButton');

    const projectAfter = await getProjectById(projectId);
    expect(projectAfter.metadata.info.projectLead).to.equal('Migrated Lead');
    expect(projectAfter.metadata.info.leadInstitution).to.equal(
      'Migrated Institution'
    );
    expect(projectAfter.metadata.settings.projectStatus).to.equal('archived');
    expect(projectAfter.metadata.settings.showQRCodeButton).to.equal(true);
    expect(projectAfter.metadata.userMetadata.customField).to.equal(
      'custom value'
    );
    expect(projectAfter['ui-specification']).to.deep.equal(migratedUiSpec);
    expect((projectAfter as any).metadataDb).to.equal(undefined);
    expect((projectAfter as any).metadata_db).to.equal(undefined);

    // A follow-up consolidation pass should no longer find a legacy metadata DB.
    const followUp = await consolidateLegacyMetadataDbs({
      projectIds: [projectId],
    });
    expect(followUp).to.have.lengthOf(1);
    expect(['skipped-no-metadata-db', 'skipped-not-found']).to.include(
      followUp[0].status
    );
  });

  it('is safe to run repeatedly for the same project', async () => {
    const projectId = await createNotebook('Idempotent Notebook', initialUiSpec, {
      project_lead: 'Original Lead',
      lead_institution: 'Original Institution',
      showQRCodeButton: false,
    });

    expect(projectId).to.not.be.undefined;
    if (!projectId) throw new Error('Failed to create project for rerun test');

    const {metadataDb} = await createLegacyMetadataDb(projectId);

    const firstRun = await consolidateLegacyMetadataDbs({
      projectIds: [projectId],
    });
    expect(firstRun[0].status).to.equal('migrated');

    const projectAfterFirstRun = await getProjectById(projectId);

    const secondRun = await consolidateLegacyMetadataDbs({
      projectIds: [projectId],
    });
    expect(secondRun[0].status).to.equal('migrated');
    expect(secondRun[0].errors).to.deep.equal([]);

    const projectAfterSecondRun = await getProjectById(projectId);
    expect(projectAfterSecondRun.metadata).to.deep.equal(
      projectAfterFirstRun.metadata
    );
    expect(projectAfterSecondRun['ui-specification']).to.deep.equal(
      projectAfterFirstRun['ui-specification']
    );

    const metadataDbInfo = await metadataDb.info();
    expect(metadataDbInfo.doc_count).to.equal(4);
  });
});
