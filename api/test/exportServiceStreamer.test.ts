import {expect} from 'chai';
import express from 'express';
import {Readable} from 'stream';
import request from 'supertest';
import {setExportGrpcClientForTests} from '../src/services/exportServiceClient';
import {streamExportResponse} from '../src/services/exportHttpStreamer';

describe('export HTTP streamer', () => {
  const originalMode = process.env.EXPORT_SERVICE_MODE;

  afterEach(() => {
    process.env.EXPORT_SERVICE_MODE = originalMode;
    setExportGrpcClientForTests(undefined);
  });

  it('pipes gRPC chunks to the HTTP response', async () => {
    process.env.EXPORT_SERVICE_MODE = 'grpc';
    setExportGrpcClientForTests({
      export: () => {
        const stream = Readable.from([
          {data: Buffer.from('hello ')},
          {data: Buffer.from('world')},
        ]) as any;
        stream.cancel = () => undefined;
        return stream;
      },
    });

    const app = express();
    app.get('/download', async (req, res) => {
      await streamExportResponse({
        req,
        res,
        payload: {
          projectId: 'project',
          format: 'csv',
          viewId: 'FORM1',
          userId: 'user',
        },
        legacy: () => {
          throw new Error('legacy should not be called');
        },
      });
    });

    const response = await request(app).get('/download').expect(200);
    expect(response.text).to.equal('hello world');
  });

  it('uses legacy exporter when configured', async () => {
    process.env.EXPORT_SERVICE_MODE = 'legacy';

    const app = express();
    app.get('/download', async (req, res) => {
      await streamExportResponse({
        req,
        res,
        payload: {
          projectId: 'project',
          format: 'csv',
          viewId: 'FORM1',
          userId: 'user',
        },
        legacy: () => {
          res.send('legacy');
        },
      });
    });

    const response = await request(app).get('/download').expect(200);
    expect(response.text).to.equal('legacy');
  });
});
