import {FullExportConfig} from '../couchdb/export/types';

export type ExportFormat =
  | 'csv'
  | 'zip'
  | 'geojson'
  | 'kml'
  | 'full'
  | 'json-records';

export interface ExportRequestPayload {
  projectId: string;
  format: ExportFormat;
  userId: string;
  viewId?: string;
  fullConfig?: FullExportConfig;
}
