// SPDX-License-Identifier: Apache-2.0
import {
  DumpUserEmailRowSchema,
  GetDumpUserEmailsQuerySchema,
  GetDumpUserEmailsResponseSchema,
} from '../src';

describe('GetDumpUserEmailsQuerySchema', () => {
  it('parses omitted flags', () => {
    expect(GetDumpUserEmailsQuerySchema.parse({})).toEqual({});
  });

  it('parses true/false string enums like GET /api/users', () => {
    expect(
      GetDumpUserEmailsQuerySchema.parse({
        includeArchived: 'true',
        includeSkipped: 'false',
      })
    ).toEqual({
      includeArchived: 'true',
      includeSkipped: 'false',
    });
  });

  it('rejects values other than true/false', () => {
    expect(() =>
      GetDumpUserEmailsQuerySchema.parse({includeArchived: 'yes'})
    ).toThrow();
    expect(() =>
      GetDumpUserEmailsQuerySchema.parse({includeSkipped: '1'})
    ).toThrow();
  });
});

describe('GetDumpUserEmailsResponseSchema', () => {
  const row = {
    email: 'ada@csiro.au',
    name: 'Ada',
    userId: 'user-1',
    disabled: false,
    verified: true,
  };

  it('parses JSON rows with email, name, userId, disabled, verified', () => {
    expect(GetDumpUserEmailsResponseSchema.parse([row])).toEqual([row]);
  });

  it('strips profiles, roles, and secrets from each row', () => {
    const parsed = DumpUserEmailRowSchema.parse({
      ...row,
      profiles: {local: {password: 'secret', salt: 's'}},
      globalRoles: ['GENERAL_ADMIN'],
      projectRoles: {n1: ['PROJECT_ADMIN']},
      teamRoles: {t1: ['TEAM_ADMIN']},
      templateRoles: {tpl1: ['TEMPLATE_ADMIN']},
      password: 'secret',
      salt: 's',
      emails: [{email: 'ada@csiro.au', verified: true}],
    });

    expect(parsed).toEqual(row);
    expect(parsed).not.toHaveProperty('profiles');
    expect(parsed).not.toHaveProperty('globalRoles');
    expect(parsed).not.toHaveProperty('projectRoles');
    expect(parsed).not.toHaveProperty('teamRoles');
    expect(parsed).not.toHaveProperty('templateRoles');
    expect(parsed).not.toHaveProperty('password');
    expect(parsed).not.toHaveProperty('salt');
    expect(parsed).not.toHaveProperty('emails');
  });

  it('rejects a row missing required listing columns', () => {
    expect(() =>
      DumpUserEmailRowSchema.parse({email: 'ada@csiro.au', name: 'Ada'})
    ).toThrow();
  });
});
