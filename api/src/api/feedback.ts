// SPDX-License-Identifier: Apache-2.0
/**
 * In-app feedback API. Authenticated POST emails the install support address
 * through emailService. No Couch write.
 */

import {
  Action,
  INPUT_LIMITS,
  PostFeedbackRequestSchema,
  PostFeedbackResponse,
} from '@faims3/data-model';
import express, {Response} from 'express';
import {config} from '../buildconfig';
import * as Exceptions from '../exceptions';
import {feedbackRateLimit} from '../feedbackRateLimiter';
import {requireAuthenticationAPI, userCanDo} from '../middleware';
import validate from '../middleware/validate';
import {sendSupportFeedbackEmail} from '../utils/emailHelpers';
import patch from '../utils/patchExpressAsync';

patch();

export const api: express.Router = express.Router();

const requireSubmitFeedback = (
  req: express.Request,
  _res: express.Response,
  next: express.NextFunction
) => {
  if (!req.user) {
    throw new Exceptions.UnauthorizedException('Authentication required.');
  }
  if (!userCanDo({user: req.user, action: Action.SUBMIT_FEEDBACK})) {
    throw new Exceptions.ForbiddenException(
      'You are not authorized to submit feedback.'
    );
  }
  next();
};

/**
 * POST /feedback
 * Sends in-app feedback to the server-configured support inbox.
 */
api.post(
  '/feedback',
  requireAuthenticationAPI,
  requireSubmitFeedback,
  feedbackRateLimit,
  validate({
    body: PostFeedbackRequestSchema,
  }),
  async (req, res: Response<PostFeedbackResponse>) => {
    if (!req.user) {
      throw new Exceptions.UnauthorizedException('Authentication required.');
    }

    const supportEmail = (config.supportEmail ?? '').trim();
    if (!supportEmail) {
      throw new Exceptions.ServiceUnavailableException(
        'Feedback is unavailable because no support email is configured.'
      );
    }

    const {message, source, pageUrl} = req.body;
    const rawUa = req.headers['user-agent'];
    const userAgent = (
      Array.isArray(rawUa) ? (rawUa[0] ?? '') : (rawUa ?? '')
    ).slice(0, INPUT_LIMITS.SHORT_TEXT_MAX_LENGTH);

    await sendSupportFeedbackEmail({
      message,
      source,
      pageUrl,
      userId: req.user.user_id,
      displayName: req.user.name ?? '',
      emails: (req.user.emails ?? []).map(entry => entry.email),
      impersonatingUserId: req.user.impersonatingUserId,
      userAgent,
    });

    res.status(200).json({message: 'Feedback sent'});
  }
);
