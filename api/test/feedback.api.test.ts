// SPDX-License-Identifier: Apache-2.0
import PouchDB from 'pouchdb';
import PouchDBFind from 'pouchdb-find';
PouchDB.plugin(PouchDBFind);
PouchDB.plugin(require('pouchdb-adapter-memory'));

import {
  addGlobalRole,
  INPUT_LIMITS,
  registerClient,
  removeGlobalRole,
  Role,
} from '@faims3/data-model';
import request from 'supertest';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  generateJwtFromUser,
  upgradeCouchUserToExpressUser,
} from '../src/auth/keySigning/create';
import {
  config,
  DEFAULT_FEEDBACK_RATE_LIMITER_PER_WINDOW,
  emailService,
  keyService,
} from '../src/buildconfig';
import {
  createUser,
  getExpressUserFromEmailOrUserId,
  saveCouchUser,
} from '../src/couchdb/users';
import {app} from '../src/expressSetup';
import {FEEDBACK_RATE_LIMITER} from '../src/feedbackRateLimiter';
import {callbackObject} from './mocks';
import {
  adminToken,
  beforeApiTests,
  localUserName,
  localUserToken,
  requestAuthAndType,
} from './utils';

registerClient(callbackObject);

const FEEDBACK_PATH = '/api/feedback';
const VALID_BODY = {
  message: 'The designer save button is hard to find.',
  source: 'app' as const,
  pageUrl: 'https://app.example.org/notebook/abc',
};

const resetFeedbackLimiter = () => {
  config.feedbackRateLimiterEnabled = false;
  config.feedbackRateLimiterPerWindow =
    DEFAULT_FEEDBACK_RATE_LIMITER_PER_WINDOW;
  FEEDBACK_RATE_LIMITER.resetKey(`user:${localUserName}`);
  FEEDBACK_RATE_LIMITER.resetKey('user:admin');
  FEEDBACK_RATE_LIMITER.resetKey('user:no-mail-user');
  FEEDBACK_RATE_LIMITER.resetKey('user:no-feedback-user');
  FEEDBACK_RATE_LIMITER.resetKey('127.0.0.1');
  FEEDBACK_RATE_LIMITER.resetKey('::ffff:127.0.0.1');
  FEEDBACK_RATE_LIMITER.resetKey('::1');
};

describe('POST /api/feedback', () => {
  beforeEach(async () => {
    await beforeApiTests();
    resetFeedbackLimiter();
  });

  afterEach(() => {
    resetFeedbackLimiter();
    config.supportEmail = 'support@fieldmark.au';
    vi.restoreAllMocks();
  });

  it('returns 401 and does not send when unauthenticated', async () => {
    const sendEmailSpy = vi.spyOn(emailService, 'sendEmail');
    const result = await request(app).post(FEEDBACK_PATH).send(VALID_BODY);
    expect(result.statusCode).toBe(401);
    expect(sendEmailSpy).not.toHaveBeenCalled();
  });

  it('returns 403 and does not send without SUBMIT_FEEDBACK', async () => {
    const sendEmailSpy = vi.spyOn(emailService, 'sendEmail');
    const signingKey = await keyService.getSigningKey();
    const [dbUser, error] = await createUser({
      username: 'no-feedback-user',
      name: 'No Feedback',
    });
    expect(dbUser, `createUser failed: ${error}`).not.toBeNull();
    removeGlobalRole({user: dbUser!, role: Role.GENERAL_USER});
    addGlobalRole({user: dbUser!, role: Role.GENERAL_CREATOR});
    await saveCouchUser(dbUser!);
    const expressUser = await upgradeCouchUserToExpressUser({
      dbUser: dbUser!,
    });
    const token = await generateJwtFromUser({user: expressUser, signingKey});

    const result = await requestAuthAndType(
      request(app).post(FEEDBACK_PATH).send(VALID_BODY),
      token
    );
    expect(result.statusCode).toBe(403);
    expect(sendEmailSpy).not.toHaveBeenCalled();
  });

  it('sends once to config.supportEmail for a GENERAL_USER', async () => {
    const sendEmailSpy = vi.spyOn(emailService, 'sendEmail').mockResolvedValue({
      messageId: 'feedback-1',
    } as any);

    const result = await requestAuthAndType(
      request(app)
        .post(FEEDBACK_PATH)
        .set('User-Agent', 'FeedbackTest/1.0')
        .send({
          ...VALID_BODY,
          message: '  Please add undo. <script>alert(1)</script>  ',
        }),
      localUserToken
    );

    expect(result.statusCode).toBe(200);
    expect(result.body.message).toBe('Feedback sent');
    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    const options = sendEmailSpy.mock.calls[0][0].options;
    expect(options.to).toBe(config.supportEmail);
    expect(options.subject).toContain('app');
    expect(options.subject).toContain(config.conductorInstanceName);
    expect(options.text).toContain(
      'Please add undo. <script>alert(1)</script>'
    );
    expect(options.text).toContain(localUserName);
    expect(options.text).toContain(config.conductorInstanceName);
    expect(options.html).toContain('Please add undo.');
    expect(options.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(options.html).not.toMatch(/<script>alert\(1\)<\/script>/);
    expect(options.replyTo).toBe('bobalooba@gmail.com');
  });

  it('accepts OPERATIONS_ADMIN and GENERAL_ADMIN', async () => {
    const sendEmailSpy = vi.spyOn(emailService, 'sendEmail').mockResolvedValue({
      messageId: 'feedback-admin',
    } as any);

    const adminResult = await requestAuthAndType(
      request(app)
        .post(FEEDBACK_PATH)
        .send({message: 'Admin note', source: 'control-centre'}),
      adminToken
    );
    expect(adminResult.statusCode).toBe(200);

    const signingKey = await keyService.getSigningKey();
    const [opsUser] = await createUser({
      username: 'ops-feedback',
      name: 'Ops',
      email: 'ops@example.org',
    });
    addGlobalRole({user: opsUser!, role: Role.OPERATIONS_ADMIN});
    await saveCouchUser(opsUser!);
    const opsExpress = await upgradeCouchUserToExpressUser({
      dbUser: opsUser!,
    });
    const opsToken = await generateJwtFromUser({
      user: opsExpress,
      signingKey,
    });
    const opsResult = await requestAuthAndType(
      request(app)
        .post(FEEDBACK_PATH)
        .send({message: 'Ops note', source: 'designer'}),
      opsToken
    );
    expect(opsResult.statusCode).toBe(200);
    expect(sendEmailSpy).toHaveBeenCalledTimes(2);
  });

  it('returns 400 and does not send for empty, whitespace, missing or invalid source, overlong message or pageUrl', async () => {
    const sendEmailSpy = vi.spyOn(emailService, 'sendEmail');

    const empty = await requestAuthAndType(
      request(app).post(FEEDBACK_PATH).send({message: '', source: 'app'}),
      localUserToken
    );
    expect(empty.statusCode).toBe(400);

    const whitespace = await requestAuthAndType(
      request(app).post(FEEDBACK_PATH).send({message: '   ', source: 'app'}),
      localUserToken
    );
    expect(whitespace.statusCode).toBe(400);

    const missingSource = await requestAuthAndType(
      request(app).post(FEEDBACK_PATH).send({message: 'hello'}),
      localUserToken
    );
    expect(missingSource.statusCode).toBe(400);

    const badSource = await requestAuthAndType(
      request(app)
        .post(FEEDBACK_PATH)
        .send({message: 'hello', source: 'mobile'}),
      localUserToken
    );
    expect(badSource.statusCode).toBe(400);

    const overlongMessage = await requestAuthAndType(
      request(app)
        .post(FEEDBACK_PATH)
        .send({
          message: 'x'.repeat(INPUT_LIMITS.LONG_TEXT_MAX_LENGTH + 1),
          source: 'app',
        }),
      localUserToken
    );
    expect(overlongMessage.statusCode).toBe(400);

    const overlongUrl = await requestAuthAndType(
      request(app)
        .post(FEEDBACK_PATH)
        .send({
          message: 'hello',
          source: 'app',
          pageUrl:
            'https://example.org/' +
            'a'.repeat(INPUT_LIMITS.REDIRECT_URL_MAX_LENGTH),
        }),
      localUserToken
    );
    expect(overlongUrl.statusCode).toBe(400);

    expect(sendEmailSpy).not.toHaveBeenCalled();
  });

  it('strips unknown extra fields consistently with other validate() routes', async () => {
    const sendEmailSpy = vi.spyOn(emailService, 'sendEmail').mockResolvedValue({
      messageId: 'feedback-extra',
    } as any);

    const result = await requestAuthAndType(
      request(app)
        .post(FEEDBACK_PATH)
        .send({
          ...VALID_BODY,
          to: 'attacker@example.com',
          subject: 'spoofed',
        }),
      localUserToken
    );
    expect(result.statusCode).toBe(200);
    const options = sendEmailSpy.mock.calls[0][0].options;
    expect(options.to).toBe(config.supportEmail);
    expect(options.subject).not.toBe('spoofed');
  });

  it('returns 429 on the 6th POST from the same user and still accepts another user', async () => {
    const sendEmailSpy = vi.spyOn(emailService, 'sendEmail').mockResolvedValue({
      messageId: 'feedback-limit',
    } as any);
    config.feedbackRateLimiterEnabled = true;
    config.feedbackRateLimiterPerWindow = 5;

    for (let i = 0; i < 5; i++) {
      const ok = await requestAuthAndType(
        request(app)
          .post(FEEDBACK_PATH)
          .send({message: `note ${i}`, source: 'app'}),
        localUserToken
      );
      expect(ok.statusCode).toBe(200);
    }

    const limited = await requestAuthAndType(
      request(app)
        .post(FEEDBACK_PATH)
        .send({message: 'one too many', source: 'app'}),
      localUserToken
    );
    expect(limited.statusCode).toBe(429);
    expect(sendEmailSpy).toHaveBeenCalledTimes(5);

    const otherUser = await requestAuthAndType(
      request(app)
        .post(FEEDBACK_PATH)
        .send({message: 'from admin', source: 'control-centre'}),
      adminToken
    );
    expect(otherUser.statusCode).toBe(200);
    expect(sendEmailSpy).toHaveBeenCalledTimes(6);
  });

  it('returns 503 and does not send when supportEmail is blank', async () => {
    const sendEmailSpy = vi.spyOn(emailService, 'sendEmail');
    config.supportEmail = '   ';
    const result = await requestAuthAndType(
      request(app).post(FEEDBACK_PATH).send(VALID_BODY),
      localUserToken
    );
    expect(result.statusCode).toBe(503);
    expect(sendEmailSpy).not.toHaveBeenCalled();
  });

  it('returns non-2xx when sendEmail rejects, unlike test-email', async () => {
    vi.spyOn(emailService, 'sendEmail').mockRejectedValue(
      new Error('SMTP connection failed')
    );
    const result = await requestAuthAndType(
      request(app).post(FEEDBACK_PATH).send(VALID_BODY),
      localUserToken
    );
    expect(result.statusCode).toBeGreaterThanOrEqual(500);
    expect(result.statusCode).not.toBe(200);
    expect(result.body.success).not.toBe(false);
  });

  it('sends for a people-db user with no emails', async () => {
    const sendEmailSpy = vi.spyOn(emailService, 'sendEmail').mockResolvedValue({
      messageId: 'feedback-no-mail',
    } as any);
    const signingKey = await keyService.getSigningKey();
    const [dbUser] = await createUser({
      username: 'no-mail-user',
      name: 'No Mail',
    });
    await saveCouchUser(dbUser!);
    const expressUser = await upgradeCouchUserToExpressUser({
      dbUser: dbUser!,
    });
    const token = await generateJwtFromUser({user: expressUser, signingKey});

    const result = await requestAuthAndType(
      request(app).post(FEEDBACK_PATH).send(VALID_BODY),
      token
    );
    expect(result.statusCode).toBe(200);
    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    const options = sendEmailSpy.mock.calls[0][0].options;
    expect(options.to).toBe(config.supportEmail);
    expect(options.replyTo).toBeUndefined();
    expect(options.text).toContain('(none on file)');
  });

  it('includes impersonatingUserId in the email body', async () => {
    const sendEmailSpy = vi.spyOn(emailService, 'sendEmail').mockResolvedValue({
      messageId: 'feedback-impersonate',
    } as any);
    const signingKey = await keyService.getSigningKey();
    const localUser = await getExpressUserFromEmailOrUserId(localUserName);
    expect(localUser).not.toBeNull();
    const token = await generateJwtFromUser({
      user: localUser!,
      signingKey,
      impersonatingUserId: 'admin',
    });

    const result = await requestAuthAndType(
      request(app).post(FEEDBACK_PATH).send(VALID_BODY),
      token
    );
    expect(result.statusCode).toBe(200);
    const options = sendEmailSpy.mock.calls[0][0].options;
    expect(options.text).toContain('admin');
    expect(options.html).toContain('admin');
  });

  it('does not change POST /api/admin/test-email success-with-error shape', async () => {
    vi.spyOn(emailService, 'sendEmail').mockRejectedValue(
      Object.assign(new Error('SMTP connection failed'), {code: 'ECONNREFUSED'})
    );
    const result = await requestAuthAndType(
      request(app).post('/api/admin/test-email'),
      adminToken
    );
    expect(result.statusCode).toBe(200);
    expect(result.body.success).toBe(false);
    expect(result.body.status).toBe('error');
  });
});
