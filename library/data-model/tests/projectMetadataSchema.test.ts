import {
  ProjectMetadataSchema,
  toCanonicalProjectMetadata,
  toLegacyFlatMetadata,
} from '../src/types';

describe('project metadata schema and conversions', () => {
  it('parses canonical metadata with userMetadata', () => {
    const parsed = ProjectMetadataSchema.parse({
      info: {
        name: 'Project One',
        description: 'A description',
      },
      settings: {
        showQRCodeButton: true,
      },
      userMetadata: {
        customKey: 'customValue',
      },
    });

    expect(parsed.info.name).toEqual('Project One');
    expect(parsed.settings.showQRCodeButton).toEqual(true);
    expect(parsed.userMetadata.customKey).toEqual('customValue');
  });

  it('maps legacy flat metadata into canonical model', () => {
    const legacy = {
      name: 'Legacy Project',
      pre_description: 'Legacy Description',
      lead_institution: 'Legacy Institute',
      project_lead: 'Legacy Lead',
      showQRCodeButton: 'true',
      notebook_version: '1.0',
      schema_version: '2.0',
      customFlag: 'yes',
    };

    const {metadata, report} = toCanonicalProjectMetadata(legacy);

    expect(metadata.info.name).toEqual('Legacy Project');
    expect(metadata.info.description).toEqual('Legacy Description');
    expect(metadata.info.leadInstitution).toEqual('Legacy Institute');
    expect(metadata.info.projectLead).toEqual('Legacy Lead');
    expect(metadata.settings.showQRCodeButton).toEqual(true);
    expect(metadata.settings.notebookVersion).toEqual('1.0');
    expect(metadata.settings.schemaVersion).toEqual('2.0');
    expect(metadata.userMetadata.customFlag).toEqual('yes');
    expect(report.coercedKeys).toContain('showQRCodeButton');
  });

  it('flattens canonical metadata to legacy shape preserving compatibility keys', () => {
    const canonical = {
      info: {
        name: 'Canonical Project',
        description: 'Canonical Description',
        leadInstitution: 'Canonical Institute',
        projectLead: 'Canonical Lead',
      },
      settings: {
        showQRCodeButton: false,
        projectStatus: 'Open',
        notebookVersion: '3.2',
        schemaVersion: '4.5',
      },
      userMetadata: {
        custom: 'value',
      },
    };

    const legacy = toLegacyFlatMetadata(ProjectMetadataSchema.parse(canonical));
    expect(legacy.name).toEqual('Canonical Project');
    expect(legacy.pre_description).toEqual('Canonical Description');
    expect(legacy.lead_institution).toEqual('Canonical Institute');
    expect(legacy.project_lead).toEqual('Canonical Lead');
    expect(legacy.showQRCodeButton).toEqual(false);
    expect(legacy.project_status).toEqual('Open');
    expect(legacy.notebook_version).toEqual('3.2');
    expect(legacy.schema_version).toEqual('4.5');
    expect(legacy.custom).toEqual('value');
  });

  it('supports legacy behavious key and flattens to behaviours + behavious', () => {
    const legacy = {
      name: 'Compat Project',
      behavious: {a: 1},
    };
    const {metadata} = toCanonicalProjectMetadata(legacy);
    expect(metadata.settings.behaviours).toEqual({a: 1});

    const flattened = toLegacyFlatMetadata(metadata);
    expect(flattened.behaviours).toEqual({a: 1});
    expect(flattened.behavious).toEqual({a: 1});
  });
});
