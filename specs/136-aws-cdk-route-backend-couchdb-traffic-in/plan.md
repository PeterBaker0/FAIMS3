# Plan

```yaml
approach: >-
  One pull request adds a VPC-private Route 53 zone and A record for
  CouchDB, points COUCHDB_INTERNAL_URL at
  http://couchdb.internal.<baseDomain>:5984, and keeps COUCHDB_PUBLIC_URL
  as the public ALB HTTPS URL that devices already get via base_url.
  It then allows TCP 5984 from the shared Conductor task security group,
  removes the unused 0.0.0.0/0:443 Couch ingress in that same change
  (SSM instance policy kept), and stops the unauthenticated fallback
  page from rendering the internal hostname. CDK template tests plus
  conductor-env and API fallback tests pin the shape; AWS operator docs
  switch laptop access to the SSM tunnel.
check: code
tasks:
  - key: private-zone
    title: Add private hosted zone and Couch A record
    description: >-
      Create a Route 53 private hosted zone internal.<baseDomain>
      associated with the stack VPC and an A record
      couchdb.internal.<baseDomain> targeting the Couch EC2 private
      IP. Export a stable internal HTTP :5984 URL from EC2CouchDB; do
      not use Cloud Map, instance private DNS, or the raw IP as the
      configured URL.
    depends_on: []
    files_hint:
      - infrastructure/aws-cdk/lib/components/couch-db.ts
      - infrastructure/aws-cdk/lib/faims-infra-stack.ts
    acceptance:
      - 3
    risk: med
    size: m
    tier: mid
  - key: conductor-env
    title: Point Conductor internal Couch URL at the VPC name
    description: >-
      Give buildConductorRuntimeEnv a distinct internal URL input and
      set COUCHDB_INTERNAL_URL from it; keep COUCHDB_PUBLIC_URL and
      COUCHDB_EXTERNAL_PORT on the public ALB HTTPS endpoint. Do not
      fall back internal to public. Spatial worker, capacity manager,
      and TTL cleanup keep sharing conductor.environment with no second
      overlay. Cover the split URLs in conductor-env.test.ts.
    depends_on:
      - private-zone
    files_hint:
      - infrastructure/aws-cdk/lib/components/conductor.ts
      - infrastructure/aws-cdk/lib/faims-infra-stack.ts
      - infrastructure/aws-cdk/test/conductor-env.test.ts
    acceptance:
      - 1
      - 2
    risk: med
    size: s
    tier: cheap
  - key: couch-ingress
    title: Restrict Couch SG to ALB and backend 5984
    description: >-
      Export the Couch security group and allow TCP 5984 from
      conductor.serviceSecurityGroup in addition to the existing ALB
      rule. Remove the 0.0.0.0/0 TCP 443 ingress only after the
      internal URL is the VPC hostname; keep
      AmazonSSMManagedInstanceCore. Record the 1c1be2034 revert cause
      in the implementation PR.
    depends_on:
      - conductor-env
    files_hint:
      - infrastructure/aws-cdk/lib/components/couch-db.ts
      - infrastructure/aws-cdk/lib/faims-infra-stack.ts
    acceptance:
      - 4
      - 5
      - 6
      - 10
    risk: high
    size: s
    tier: mid
  - key: cdk-tests
    title: Assert private DNS and Couch ingress in synth tests
    description: >-
      Add a focused Template.fromStack test of EC2CouchDB (thin stack,
      same style as spatial-capacity.test.ts). Assert the private zone
      and A record, 5984 from ALB and Conductor (or a dummy backend)
      SGs only, no 0.0.0.0/0 on 443, and
      AmazonSSMManagedInstanceCore still on the instance role.
    depends_on:
      - private-zone
      - couch-ingress
    files_hint:
      - infrastructure/aws-cdk/test/couch-db.test.ts
      - infrastructure/aws-cdk/lib/components/couch-db.ts
      - infrastructure/aws-cdk/lib/components/networking.ts
      - infrastructure/aws-cdk/test/spatial-capacity.test.ts
      - infrastructure/aws-cdk/test/ttl-cleanup.test.ts
    acceptance:
      - 3
      - 4
      - 5
      - 6
    risk: med
    size: m
    tier: mid
  - key: fallback
    title: Show the public Couch URL on the fallback page
    description: >-
      Pass config.couchdbPublicUrl into the unauthenticated fallback
      render so GET / never shows couchdb.internal.*. Do not change
      stampListingCouchUrl; listing clients keep dataDb.base_url from
      couchdbPublicUrl. Cover the invalid-report HTML in an API unit
      test.
    depends_on: []
    files_hint:
      - api/src/expressSetup.ts
      - api/views/fallback.handlebars
      - api/src/couchdb/notebooks.ts
      - api/test/healthApp.test.ts
    acceptance:
      - 7
      - 8
    risk: low
    size: s
    tier: cheap
  - key: docs
    title: Document VPC-only internal URL and SSM tunnel
    description: >-
      Stop telling operators to set AWS COUCHDB_INTERNAL_URL to the
      public https://db.<domain>:443 URL. Update the CDK README Couch
      architecture notes (architecture-review.md is not in this tree),
      DeployingAWSStack.md, and the backup/upgrade guides so
      env-from-cdk-stack's VPC hostname requires ssmCouchTunnel.sh for
      laptop access.
    depends_on:
      - private-zone
      - conductor-env
    files_hint:
      - infrastructure/aws-cdk/README.md
      - docs/developer/docs/source/markdown/DeployingAWSStack.md
      - docs/developer/docs/source/markdown/CouchBackupRecoveryGuideAWS.md
      - docs/developer/docs/source/markdown/CouchVersionUpgradeGuideAWS.md
    acceptance:
      - 9
    risk: low
    size: s
    tier: cheap
```
