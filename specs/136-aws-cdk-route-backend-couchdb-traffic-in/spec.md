# Spec: AWS CDK — route backend CouchDB traffic inside the VPC

Issue: [#136](https://github.com/PeterBaker0/FAIMS3/issues/136)

## 1. Problem

In the AWS CDK stack, `COUCHDB_INTERNAL_URL` is set to the same value as
`COUCHDB_PUBLIC_URL` (`https://<couch-domain>:443`):

```ts
env.COUCHDB_PUBLIC_URL = input.couchDBEndpoint;
env.COUCHDB_INTERNAL_URL = input.couchDBEndpoint;
```

(`infrastructure/aws-cdk/lib/components/conductor.ts`,
`buildConductorRuntimeEnv`). Spatial worker, capacity manager, and TTL
cleanup reuse `conductor.environment`
(`spatial-capacity.ts`, `ttl-cleanup.ts`), so they inherit the same pair.

Every backend call to CouchDB (Nano, Pouch, JWT key install, migrate,
workers) therefore leaves the VPC through the internet gateway, resolves
the public DNS name, and comes back in through the internet-facing ALB.
Admin credentials travel on that public path. The CouchDB admin API
remains reachable on the public hostname. Backend availability depends
on the public DNS record and ALB listener rules, and every query pays
ALB plus data-transfer cost.

Devices still need the public HTTPS URL. `api/src/couchdb/notebooks.ts`
stamps `dataDb.base_url` from `config.couchdbPublicUrl`. That public URL
must not change.

## 2. Constraints

- Use option 1 from the issue: a Route 53 **private hosted zone**
  associated with the stack VPC, not Cloud Map / ECS Service Connect
  (CouchDB is a plain EC2 instance), not the EC2 private DNS name, and
  not the raw private IP as the configured URL.
- Zone name: `internal.${config.aws.domains.baseDomain}`. A record:
  `couchdb.internal.${baseDomain}` →
  `couch.instance.instancePrivateIp`. CDK manages both. The name stays
  stable for config, logs, and runbooks; the record value tracks
  instance replacement (`userDataCausesReplacement: true` already
  replaces the instance and refreshes the token).
- Set
  `COUCHDB_INTERNAL_URL=http://couchdb.internal.<baseDomain>:5984`
  (plain HTTP, port 5984). Do not use `https` or port 443 for the
  internal URL. Couch listens on 5984 over HTTP; TLS already terminates
  at the ALB for the public hop. Enabling CouchDB TLS on 6984 is a
  separate decision.
- Keep `COUCHDB_PUBLIC_URL` as today's public HTTPS URL
  (`https://<couch-domain>:443`, `couchDb.couchEndpoint`). Keep
  `COUCHDB_EXTERNAL_PORT` as the public ALB port (`443` /
  `couchDb.exposedPort`). Do not change `stampListingCouchUrl` /
  `base_url`.
- `buildConductorRuntimeEnv` must take a distinct internal URL input.
  Do not keep assigning `input.couchDBEndpoint` to both env keys. Do
  not fall back internal to public when the internal value is omitted.
  Spatial worker, capacity manager, and TTL cleanup keep sharing
  `conductor.environment`; they must not grow a second Couch URL path.
- Add Couch SG ingress TCP 5984 from
  `conductor.serviceSecurityGroup` (shared by Conductor, spatial
  worker, capacity manager, and TTL cleanup). Export the Couch
  security group from `EC2CouchDB` if the rule is attached in
  `faims-infra-stack.ts` after both constructs exist. Keep the existing
  ALB → Couch 5984 rule.
- Remove the `0.0.0.0/0` TCP 443 ingress on the Couch SG
  (`debugInstancePermissions` block in `couch-db.ts`) **only in the
  same change** that points `COUCHDB_INTERNAL_URL` at the VPC hostname.
  A previous removal (`dab0866d9`) was reverted in `1c1be2034` for
  "connectivity issues". Do not remove 443 while the API still uses the
  public URL as its internal endpoint. Keep
  `AmazonSSMManagedInstanceCore` for `scripts/ssmCouchTunnel.sh`.
- After this change, Couch instance ingress is only TCP 5984 from the
  ALB security group and from the Conductor task security group. No
  `0.0.0.0/0` on 443 or 5984.
- The unauthenticated fallback page
  (`api/src/expressSetup.ts` → `api/views/fallback.handlebars`) must
  not render the internal hostname. Pass `config.couchdbPublicUrl`
  (or drop the URL). Prefer the public URL so an operator hitting `/`
  still sees a clickable Couch address.
- VPC DNS support/hostnames stay on (CDK `Vpc` default). Do not add a
  NAT gateway or move tasks to private subnets for this issue.
- Do not change Digital Ocean env, local Docker `COUCHDB_INTERNAL_URL`,
  or e2e localhost URLs.
- Docs that currently show AWS
  `COUCHDB_INTERNAL_URL=https://db.<domain>:443` must be updated:
  `docs/developer/docs/source/markdown/DeployingAWSStack.md`, and the
  CouchDB section of `infrastructure/aws-cdk/README.md`.
  `env-from-cdk-stack.sh` copies ECS task env, so after this change it
  will emit the VPC hostname. Laptop scripts cannot resolve that name:
  update `CouchBackupRecoveryGuideAWS.md` and
  `CouchVersionUpgradeGuideAWS.md` so the SSM tunnel
  (`scripts/ssmCouchTunnel.sh`, then
  `COUCHDB_INTERNAL_URL=http://127.0.0.1:5984`) is required now, not
  only after couch-auth-proxy.
- If `architecture-review.md` (INT04, INT08, TB3/TB4) is in this
  repository at implementation time, update those findings. If it is
  not in this tree, put the same facts in the CDK README CouchDB /
  Conductor architecture notes. Do not invent a new review document.

## 3. Acceptance criteria

1. `buildConductorRuntimeEnv` sets `COUCHDB_INTERNAL_URL` to
   `http://couchdb.internal.<baseDomain>:5984` (or the value passed as
   the distinct internal URL input) and `COUCHDB_PUBLIC_URL` to
   `https://<couch-domain>:443`. The two values are not equal.
   Verified by a test in
   `infrastructure/aws-cdk/test/conductor-env.test.ts`.
2. Spatial-capacity and TTL-cleanup task definitions continue to
   receive the Conductor environment object, so they inherit the
   internal URL from (1) without a second assignment. Reviewer reads
   `faims-infra-stack.ts` / those constructs; no duplicate
   `COUCHDB_INTERNAL_URL` overlay.
3. Synthesised template includes a Route 53 private hosted zone for
   `internal.<baseDomain>` associated with the stack VPC, and an A
   record `couchdb.internal.<baseDomain>` whose target is the Couch
   EC2 instance private IP. Verified by a `Template.fromStack` test of
   `EC2CouchDB` (or a thin stack that includes it), same style as
   `spatial-capacity.test.ts` / `ttl-cleanup.test.ts`.
4. Couch security group allows TCP 5984 from the Conductor service
   security group and from the shared ALB security group. Verified by
   the same template test (ingress descriptions or
   `AWS::EC2::SecurityGroupIngress` sources).
5. Couch security group has no ingress from `0.0.0.0/0` on TCP 443 (or
   any other port). The synthesised instance role still includes
   `AmazonSSMManagedInstanceCore`. Verified by the template test.
6. No other Couch instance ingress remains besides TCP 5984 from the
   ALB SG and from the Conductor task SG. Verified by enumerating
   ingress on the Couch SG in the template test.
7. GET `/` fallback HTML, when `databaseValidityReport.valid` is
   false, does not contain the internal hostname. If a Couch URL is
   still rendered, it is `config.couchdbPublicUrl`. Verified by an API
   unit test (`pnpm --filter=@faims3/api test`) that drives
   `attachFullApi` / the fallback render path.
8. `api/src/couchdb/notebooks.ts` still stamps `dataDb.base_url` from
   `config.couchdbPublicUrl`. Reviewer reads the diff; no behaviour
   change to listing clients.
9. AWS docs listed in Constraints no longer tell operators to set
   `COUCHDB_INTERNAL_URL` to the public `https://db.<domain>:443` URL
   for in-VPC processes. Recovery / upgrade guides state that
   `env-from-cdk-stack` now emits a VPC-only hostname and that laptop
   access uses `ssmCouchTunnel.sh`. Reviewer reads the diff.
10. The implementation PR records the actual cause of the `1c1be2034`
    443 revert (reproduced on a deployed stack, or a code-path
    explanation that the previous outage required
    `COUCHDB_INTERNAL_URL` still pointing at the public hostname /
    instance public IP). 443 is not removed in a change that leaves
    internal URL equal to public URL.

## 4. Out of scope

- Closing the public Couch hostname / ALB listener, JWT auth-only
  public access, or couch-auth-proxy
  ([FAIMS/FAIMS3#2211](https://github.com/FAIMS/FAIMS3/pull/2211)).
  Devices keep using `COUCHDB_PUBLIC_URL` via the internet-facing ALB.
- Enabling CouchDB TLS on 6984, or putting TLS between tasks and
  Couch. Plain HTTP inside the VPC matches today's ALB-to-Couch hop.
- Cloud Map, ECS Service Connect, using
  `instance.instancePrivateDnsName` or the raw private IP as
  `COUCHDB_INTERNAL_URL`.
- NAT gateways, private subnets, or changing
  `assignPublicIp: true` on Fargate services.
- Digital Ocean conductor env, local Docker Compose Couch URL, e2e
  `.env`, or `@faims3/build-config` URL parsing (HTTP on 5984 already
  parses).
- Changing `userDataCausesReplacement`, EBS recovery, CloudWatch
  alarms, or Couch user-data / Docker install.
- Editing prod/stage `aws.json` in the private config repository
  (no new config field is required).

## 5. Test plan

Check: code

Automated tests are required: this changes env wiring, security-group
permissions, DNS, and a public HTML fallback. A missed SG rule or a
fallback that leaks `couchdb.internal.*` would not be caught by a
comment-only review.

Run:

- `pnpm --filter=@faims3/infra-aws-cdk test`
- `pnpm --filter=@faims3/api test`

Cover in CDK tests:

- `conductor-env.test.ts`: `COUCHDB_INTERNAL_URL` is the HTTP :5984
  internal name; `COUCHDB_PUBLIC_URL` remains the HTTPS :443 public
  URL; they differ.
- New (or extended) template test: private hosted zone + A record;
  Couch ingress 5984 from ALB SG and Conductor SG only; no
  `0.0.0.0/0` on 443; `AmazonSSMManagedInstanceCore` still on the
  instance role.

Cover in API tests:

- Fallback GET `/` with invalid `databaseValidityReport` renders
  `couchdbPublicUrl` (or omits the URL) and does not include the
  internal hostname.

Named manual checks (implementation PR, not this spec PR):

- On a deployed dev stack, from a Conductor task (ECS exec or logs):
  `COUCHDB_INTERNAL_URL` is `http://couchdb.internal.<baseDomain>:5984`,
  that name resolves to the instance private IP, and
  `curl -s -o /dev/null -w '%{http_code}' "$COUCHDB_INTERNAL_URL"` is
  200 or 401 (Couch up), not a TCP failure.
- Confirm 443-from-anywhere is gone and SSM port-forward
  (`./scripts/ssmCouchTunnel.sh`) still works.
- Record the `1c1be2034` root cause in the implementation PR.

No browser session and no screenshots. The fallback assertion is HTML
from supertest, not an in-browser pass.

## 6. Risk class and why

**High.** The change is the production data path for every Conductor,
spatial-worker, capacity-manager, and TTL-cleanup Couch call, plus
security-group ingress on the database instance. A wrong internal URL,
a private zone not associated with the VPC, or a missing 5984 rule
takes the API down. A previous Couch SG 443 removal was reverted for
unexplained connectivity issues (`1c1be2034`). Admin-credentialed
traffic moving from public HTTPS to VPC HTTP is the intended security
win, but a mistaken public-path leftover or a leaked internal hostname
on `/` would be a regression. Blast radius is limited to AWS CDK
deploys (local/e2e/Digital Ocean URLs unchanged) once tests pin env
and template shape.

## 7. Open questions

- `architecture-review.md` (INT04, INT08, TB3/TB4) is not in this
  repository. Treat the CDK README architecture notes as the in-repo
  stand-in unless the review file appears on the implementation
  branch.
- Prefer rendering `couchdbPublicUrl` on the fallback page rather than
  dropping the field. Drop only if the template cannot stay useful
  without a reachable link.
- Live AWS access may not exist in every implementation environment.
  Template tests are the merge gate; the named manual checks are
  required before a production deploy, and the 443 removal must still
  ship in the same PR as the internal URL change so the old failure
  mode cannot recur.
