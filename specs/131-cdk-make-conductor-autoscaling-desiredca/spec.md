# Spec: CDK — optional conductor `autoScaling.desiredCapacity`

Issue: [#131](https://github.com/PeterBaker0/FAIMS3/issues/131)
Related: [#130](https://github.com/PeterBaker0/FAIMS3/issues/130) (migration lock fingerprinting; not this change)

## 1. Problem

`infrastructure/aws-cdk/lib/components/conductor.ts` always passes a fixed
`desiredCount` into the conductor `FargateService`:

```ts
desiredCount: props.config.autoScaling.desiredCapacity,
```

`conductor.autoScaling.desiredCapacity` is required in
`ConductorConfigSchema` (`infrastructure/aws-cdk/lib/config.ts`). The same
service also has Application Auto Scaling target tracking (`minCapacity` /
`maxCapacity`, CPU and memory targets). The autoscaler writes the live
desired count on the ECS service; CloudFormation does not see that write.

Every deploy that updates the service therefore sends the template's
`DesiredCount` and resets the live count to `desiredCapacity`. Combined with
`minHealthyPercent: 100` / `maxHealthyPercent: 200` (CDK default), a normal
rolling update becomes a scale change mid-rollout:

- **Live count below `desiredCapacity` (typical idle).** A prod deploy with
  live count 1 and template `desiredCapacity` 2 issued one `UpdateService`
  that both swapped the task definition and raised the count to 2. ECS ran
  four tasks (200% of 2), including an extra *old* revision. That old task
  won the startup migration lock and marked it `complete`, so the new
  revision never migrated (the lock-side fix is #130). Autoscaling scaled
  back to 1 minutes later.
- **Live count above `desiredCapacity` (busy).** A deploy under load would
  cut the service down to `desiredCapacity`. Deployment percentages are
  relative to that new, lower count, so ECS drains capacity until autoscaling
  alarms and cooldown restore it.

The intended behaviour is: omit `desiredCapacity` so CDK leaves
`DesiredCount` off `AWS::ECS::Service`. CloudFormation uses 1 on create and
keeps the current count on update. The autoscaler's `minCapacity` is the
floor.

## 2. Constraints

- Make `conductor.autoScaling.desiredCapacity` optional
  (`z.number().int().positive().optional()`). Do not default it to a number.
  When it is omitted, the parsed value must be `undefined`.
- Keep passing
  `desiredCount: props.config.autoScaling.desiredCapacity` in
  `FaimsConductor`. `undefined` is what tells CDK to omit `DesiredCount`
  from the synthesised service. Do not substitute `1`, `minCapacity`, or any
  other fallback.
- When `desiredCapacity` *is* set, synthesis must still emit
  `DesiredCount` equal to that value (existing configs keep today's
  template).
- If `desiredCapacity` is set, reject configs where it is outside
  `[minCapacity, maxCapacity]` (schema refine or synth-time error). Do not
  apply that range check when the field is omitted.
- Update the schema doc comment: the field is only applied when set; setting
  it resets the live ECS count on every service update; `minCapacity` is the
  way to guarantee a floor.
- A synth-time warning when the field is set is optional and not required
  for acceptance. A schema comment is enough.
- Remove `desiredCapacity` from
  `infrastructure/aws-cdk/configs/sample/aws.json`. Leave `minCapacity` /
  `maxCapacity` and the CPU/memory targets as they are.
- Prod/stage `aws.json` lives in the private config repository, not this
  tree. This change cannot edit it. Sample + docs must recommend omitting
  the field so that follow-up config-repo edit is obvious.
- Docs to update: `infrastructure/aws-cdk/README.md` (`desiredCapacity`
  bullet) and both example conductor blocks in
  `docs/developer/docs/source/markdown/DeployingAWSStack.md`. Mark the field
  optional, say why to omit it, and that `minCapacity` is the floor.
- Do not change `minHealthyPercent` / `maxHealthyPercent`, circuit breaker,
  health-check grace, or any other `FargateService` deployment setting.
- Do not change `spatial-capacity.ts` (`desiredCount: 1` with scalable
  target min = max = 1).
- Do not change Conductor API / migration-lock application code (#130).
- The migrate script
  (`library/build-config/scripts/migrate-aws-config.ts`) copies
  `conductor.autoScaling` as a whole object. Do not start requiring
  `desiredCapacity` in migrated output. A legacy file that still has the
  field must still migrate with it present.
- New stacks that omit the field: CloudFormation create defaults
  `DesiredCount` to 1; after the scalable target registers, `minCapacity`
  raises the floor. Existing stacks: dropping `DesiredCount` from the
  template does not change the running count on that deploy.
- Prefer a focused `Template.fromStack` test of `FaimsConductor` (same
  style as `infrastructure/aws-cdk/test/spatial-capacity.test.ts` and
  `ttl-cleanup.test.ts`) over synthesising the full `FaimsInfraStack`.

## 3. Acceptance criteria

1. `ConductorConfigSchema` parses an `autoScaling` object that omits
   `desiredCapacity`, and the parsed `desiredCapacity` is `undefined`.
   Verified by a test in `infrastructure/aws-cdk/test/config.test.ts`.
2. `ConductorConfigSchema` still parses when `desiredCapacity` is a positive
   integer inside `[minCapacity, maxCapacity]`. Verified by the same test
   file (existing fixtures that set `desiredCapacity: 1` must keep passing).
3. When `desiredCapacity` is present and `< minCapacity` or `> maxCapacity`,
   parse fails. Verified by tests in `config.test.ts` (below min and above
   max). Non-positive values remain rejected by the existing
   `.int().positive()` check.
4. A CDK template assertion on the conductor `AWS::ECS::Service` shows
   `DesiredCount` is absent when `autoScaling.desiredCapacity` is omitted.
5. The same template assertion path, with `desiredCapacity` set (e.g. `2`),
   shows `DesiredCount` equal to that value. Other service properties
   (launch type, `minHealthyPercent`, circuit breaker) are unchanged.
6. `infrastructure/aws-cdk/configs/sample/aws.json` does not contain
   `desiredCapacity`. `minCapacity`, `maxCapacity`, and the target /
   cooldown fields remain.
7. `infrastructure/aws-cdk/README.md` and both conductor examples in
   `docs/developer/docs/source/markdown/DeployingAWSStack.md` no longer
   present `desiredCapacity` as a required field. They state it is optional,
   that setting it resets the live count on each deploy, and that
   `minCapacity` is the floor. Reviewer reads the diff.
8. `pnpm --filter=@faims3/build-config test` still passes, including
   `library/build-config/test/migrate-aws-config.test.ts` (fixture currently
   writes `desiredCapacity: 1`). Migrating an `autoScaling` object that
   omits `desiredCapacity` does not throw and does not insert a default.

## 4. Out of scope

- Spatial capacity manager (`spatial-capacity.ts`): hard-coded
  `desiredCount: 1` with min = max = 1; it does not fight an autoscaler.
- Migration lock fingerprinting, steal/timeout behaviour, or Conductor
  `/up` vs `/ready` health checks (#130).
- Changing ECS deployment configuration (`minHealthyPercent`,
  `maxHealthyPercent`, circuit breaker, `healthCheckGracePeriod`).
- Editing prod/stage `aws.json` in the private config repository (rollout
  follow-up after this ships).
- Application Auto Scaling policy types, CPU/memory target values, or
  cooldown numbers.
- Making `minCapacity` / `maxCapacity` optional.

## 5. Test plan

Check: code

Automated tests are required: this is config parsing plus CloudFormation
synthesis of the Conductor ECS service. A wrong fallback (e.g. defaulting
`desiredCount` to `1`) would still reset the live count on every deploy.

Run:

- `pnpm --filter=@faims3/infra-aws-cdk test`
- `pnpm --filter=@faims3/build-config test`

Cover in CDK tests (`infrastructure/aws-cdk/test/config.test.ts` and a
template test next to the existing construct tests):

- Parse without `desiredCapacity`.
- Parse with an in-range `desiredCapacity`.
- Reject `desiredCapacity` below `minCapacity` and above `maxCapacity`.
- Template: conductor `AWS::ECS::Service` has no `DesiredCount` when the
  field is omitted (`hasResourceProperties` / `findResources` + assert the
  key is missing; do not treat `DesiredCount: 1` as success).
- Template: `DesiredCount` equals the configured value when set.

Cover in build-config tests:

- Existing migrate fixture with `desiredCapacity: 1` still passes.
- Migrate of an `autoScaling` object without `desiredCapacity` does not
  throw and does not invent a value.

No browser session and no screenshots. Manual deploy against a live ECS
service is not required for this PR; CloudFormation's omit-on-update
behaviour is documented and asserted at synth time.

## 6. Risk class and why

**Med.** The code change is small (optional schema field, pass-through
`undefined`, sample/docs, tests), but it is the CloudFormation of the
production Conductor Fargate service — the path that already caused a
rolling-update scale-up and a skipped migration (#130). A mistaken default
(`desiredCount: 1` when unset) would still fight the autoscaler. Range
validation could start rejecting a config that previously parsed if
`desiredCapacity` sits outside min/max. Backward-compatible configs that
still set the field synthesise as today, which limits blast radius.

## 7. Open questions

- Prod/stage `aws.json` is not in this repository. After this ships, the
  config-repo change is to delete `conductor.autoScaling.desiredCapacity`
  there. No in-repo stand-in is needed beyond sample + docs.
- Skip the optional synth-time warning unless it is a one-liner already
  consistent with other CDK `Annotations`. Schema comment + docs are the
  required signal.
