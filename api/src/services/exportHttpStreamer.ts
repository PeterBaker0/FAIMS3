import {Request, Response} from 'express';
import {once} from 'events';
import {
  exportServiceGrpcUrl,
  exportServiceMode,
  RUNNING_UNDER_TEST,
} from '../buildconfig';
import {createExportGrpcStream} from './exportServiceClient';
import {ExportRequestPayload} from './exportTypes';

export async function streamExportResponse({
  req,
  res,
  payload,
  legacy,
}: {
  req: Request;
  res: Response;
  payload: ExportRequestPayload;
  legacy: () => Promise<void> | void;
}): Promise<void> {
  if (!shouldUseGrpc()) {
    await legacy();
    return;
  }

  await streamGrpcToHttp({req, res, payload});
}

function shouldUseGrpc(): boolean {
  const mode = exportServiceMode();
  if (mode === 'legacy') {
    return false;
  }
  if (mode === 'grpc') {
    return true;
  }
  if (RUNNING_UNDER_TEST) {
    return false;
  }
  return exportServiceGrpcUrl() !== undefined;
}

async function streamGrpcToHttp({
  req,
  res,
  payload,
}: {
  req: Request;
  res: Response;
  payload: ExportRequestPayload;
}): Promise<void> {
  const call = createExportGrpcStream(payload);
  let wroteBody = false;
  let completed = false;

  const cancel = () => {
    if (!completed) {
      call.cancel();
    }
  };
  req.on('close', cancel);
  res.on('close', cancel);

  try {
    await new Promise<void>((resolve, reject) => {
      call.on('data', async chunk => {
        call.pause();
        try {
          const data = Buffer.from(chunk.data);
          if (data.length > 0) {
            wroteBody = true;
            if (!res.write(data)) {
              await once(res, 'drain');
            }
          }
          call.resume();
        } catch (error) {
          call.cancel();
          reject(error);
        }
      });

      call.on('error', error => {
        reject(error);
      });

      call.on('end', () => {
        resolve();
      });
    });

    completed = true;
    res.end();
  } catch (error) {
    completed = true;
    if (wroteBody || res.headersSent) {
      res.destroy(error as Error);
      return;
    }
    throw error;
  } finally {
    req.off('close', cancel);
    res.off('close', cancel);
  }
}
