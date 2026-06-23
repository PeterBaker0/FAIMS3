import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import {existsSync} from 'fs';
import path from 'path';
import {
  exportServiceGrpcDeadlineMs,
  exportServiceGrpcUrl,
  exportServiceSharedSecret,
} from '../buildconfig';
import {ExportRequestPayload} from './exportTypes';

export interface ExportFileChunk {
  data: Buffer | Uint8Array;
  sequence?: number | string;
  filename?: string;
  contentType?: string;
}

export interface ExportGrpcClient {
  export(
    request: Record<string, unknown>,
    metadata: grpc.Metadata,
    options?: grpc.CallOptions
  ): grpc.ClientReadableStream<ExportFileChunk>;
}

let injectedClient: ExportGrpcClient | undefined;
let cachedClient: ExportGrpcClient | undefined;
let cachedUrl: string | undefined;

export function setExportGrpcClientForTests(client: ExportGrpcClient | undefined) {
  injectedClient = client;
}

export function getExportGrpcClient(): ExportGrpcClient {
  if (injectedClient) {
    return injectedClient;
  }

  const url = exportServiceGrpcUrl();
  if (!url) {
    throw new Error('EXPORT_SERVICE_GRPC_URL is not configured.');
  }
  if (cachedClient && cachedUrl === url) {
    return cachedClient;
  }

  const protoPath = resolveProtoPath();
  const packageDefinition = protoLoader.loadSync(protoPath, {
    keepCase: false,
    longs: String,
    enums: String,
    defaults: false,
    oneofs: true,
  });
  const proto = grpc.loadPackageDefinition(packageDefinition) as any;
  cachedClient = new proto.faims.export.v1.ExportService(
    url,
    grpc.credentials.createInsecure()
  ) as ExportGrpcClient;
  cachedUrl = url;
  return cachedClient;
}

function resolveProtoPath(): string {
  const candidates = [
    path.resolve(__dirname, '../../../proto/export/v1/export.proto'),
    path.resolve(__dirname, '../../../../proto/export/v1/export.proto'),
    path.resolve(process.cwd(), 'proto/export/v1/export.proto'),
    path.resolve(process.cwd(), '../proto/export/v1/export.proto'),
  ];
  const found = candidates.find(candidate => existsSync(candidate));
  if (!found) {
    throw new Error('Unable to locate proto/export/v1/export.proto');
  }
  return found;
}

export function createExportGrpcStream(
  payload: ExportRequestPayload
): grpc.ClientReadableStream<ExportFileChunk> {
  const client = getExportGrpcClient();
  const metadata = new grpc.Metadata();
  const secret = exportServiceSharedSecret();
  if (secret) {
    metadata.set('x-export-service-secret', secret);
  }
  const deadlineMs = exportServiceGrpcDeadlineMs();
  const options = deadlineMs
    ? {deadline: new Date(Date.now() + deadlineMs)}
    : undefined;

  return client.export(toGrpcRequest(payload), metadata, options);
}

function toGrpcRequest(payload: ExportRequestPayload): Record<string, unknown> {
  return {
    projectId: payload.projectId,
    format: toGrpcFormat(payload.format),
    viewId: payload.viewId,
    userId: payload.userId,
    fullConfig: payload.fullConfig
      ? {
          includeTabular: payload.fullConfig.includeTabular,
          includeAttachments: payload.fullConfig.includeAttachments,
          includeGeojson: payload.fullConfig.includeGeoJSON,
          includeKml: payload.fullConfig.includeKML,
          includeMetadata: payload.fullConfig.includeMetadata,
        }
      : undefined,
  };
}

function toGrpcFormat(format: ExportRequestPayload['format']): string {
  switch (format) {
    case 'csv':
      return 'EXPORT_FORMAT_CSV';
    case 'zip':
      return 'EXPORT_FORMAT_ZIP';
    case 'geojson':
      return 'EXPORT_FORMAT_GEOJSON';
    case 'kml':
      return 'EXPORT_FORMAT_KML';
    case 'full':
      return 'EXPORT_FORMAT_FULL';
    case 'json-records':
      return 'EXPORT_FORMAT_JSON_RECORDS';
  }
}
