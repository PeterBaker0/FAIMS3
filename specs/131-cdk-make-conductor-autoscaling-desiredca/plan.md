# Plan

```yaml
approach: >-
  One pull request makes conductor.autoScaling.desiredCapacity optional in
  the CDK schema, passes that value through to the conductor FargateService
  so CDK omits DesiredCount when it is unset, and asserts both the omit and
  set cases in tests. Then drop the field from the sample aws.json and
  document why to omit it, with minCapacity as the floor. Configs that still
  set desiredCapacity keep today's DesiredCount. Confirm the aws-config
  migrate script still copies autoScaling as a whole object and does not
  invent a default.
check: code
tasks:
  - key: schema
    title: Make desiredCapacity optional with range checks
    description: >-
      Change ConductorConfigSchema so desiredCapacity is
      z.number().int().positive().optional() with a refine that, when the
      field is set, requires minCapacity <= desiredCapacity <= maxCapacity.
      Update the schema comment: the field is only applied when set, setting
      it resets the live ECS count on each deploy, and minCapacity is the
      floor. Cover omit, in-range, below-min, and above-max in
      config.test.ts. Do not default the field to a number.
    depends_on: []
    files_hint:
      - infrastructure/aws-cdk/lib/config.ts
      - infrastructure/aws-cdk/test/config.test.ts
    acceptance:
      - 1
      - 2
      - 3
    risk: low
    size: s
    tier: cheap
  - key: desired-count
    title: Omit DesiredCount when desiredCapacity is unset
    description: >-
      Keep desiredCount: props.config.autoScaling.desiredCapacity on the
      conductor FargateService so undefined omits DesiredCount from
      AWS::ECS::Service. Do not fall back to 1, minCapacity, or any other
      number. Do not change minHealthyPercent, circuit breaker, or spatial
      capacity.
    depends_on:
      - schema
    files_hint:
      - infrastructure/aws-cdk/lib/components/conductor.ts
    acceptance:
      - 4
      - 5
    risk: med
    size: s
    tier: cheap
  - key: template-test
    title: Assert DesiredCount in a conductor template test
    description: >-
      Add a focused Template.fromStack test of FaimsConductor (same style
      as spatial-capacity.test.ts / ttl-cleanup.test.ts, not the full
      FaimsInfraStack). When desiredCapacity is omitted, the conductor
      AWS::ECS::Service must not have a DesiredCount key — DesiredCount: 1
      is a failure. When it is set (e.g. 2), DesiredCount equals that
      value and launch type, minHealthyPercent, and circuit breaker stay
      unchanged.
    depends_on:
      - desired-count
    files_hint:
      - infrastructure/aws-cdk/test/conductor-service.test.ts
      - infrastructure/aws-cdk/lib/components/conductor.ts
      - infrastructure/aws-cdk/lib/components/networking.ts
      - infrastructure/aws-cdk/test/spatial-capacity.test.ts
      - infrastructure/aws-cdk/test/ttl-cleanup.test.ts
    acceptance:
      - 4
      - 5
    risk: med
    size: m
    tier: mid
  - key: sample-docs
    title: Drop desiredCapacity from sample and docs
    description: >-
      Remove desiredCapacity from the sample aws.json autoScaling block,
      leaving minCapacity, maxCapacity, and the target/cooldown fields.
      Mark the field optional in the CDK README bullet and both conductor
      examples in DeployingAWSStack.md, and explain that setting it resets
      the live count on each deploy while minCapacity is the floor.
    depends_on: []
    files_hint:
      - infrastructure/aws-cdk/configs/sample/aws.json
      - infrastructure/aws-cdk/README.md
      - docs/developer/docs/source/markdown/DeployingAWSStack.md
    acceptance:
      - 6
      - 7
    risk: low
    size: s
    tier: cheap
  - key: migrate
    title: Keep aws-config migrate compatible
    description: >-
      Confirm library/build-config/test/migrate-aws-config.test.ts still
      passes with its desiredCapacity: 1 fixture. Add or adjust a case so
      migrating an autoScaling object that omits desiredCapacity does not
      throw and does not insert a default. Do not start requiring the
      field in migrated output.
    depends_on:
      - schema
    files_hint:
      - library/build-config/scripts/migrate-aws-config.ts
      - library/build-config/test/migrate-aws-config.test.ts
    acceptance:
      - 8
    risk: low
    size: s
    tier: cheap
```
