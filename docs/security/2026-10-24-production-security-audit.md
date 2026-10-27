# Production Security Audit — 2026-10-24

## Executive summary

A non-destructive security review of the Watershed Crew production site and its
Firebase backend found no confirmed exploitable vulnerability on the live
origin.

Two production dependency advisories require maintenance:

- `body-parser` 2.3.0 is present in the deployed application image, but the
  live request entry point uses the Google Functions Framework's separate
  `body-parser` 1.20.5 installation. The application does not invoke Express or
  `body-parser` middleware. The affected 2.3.0 copy was therefore not reachable
  through the reviewed request path.
- Nodemailer 10.1.2 has address-parsing advisories. Production SMTP delivery is
  disabled and no Brevo secret or login is attached, so the vulnerable path is
  dormant.

Both packages should still be upgraded and the resulting production image
reinspected. This is a maintenance recommendation, not evidence of an active
incident.

## Scope

The review covered:

- Production Hosting: <https://tillerystreettrail.web.app>
- Passive and low-volume HTTP security probes
- Firebase Authentication, Firestore, Storage, Realtime Database, Cloud
  Functions, Cloud Run revision metadata, and App Check configuration
- The exact deployed Cloud Function source archive and runtime container image
- Firestore and Storage rules plus their emulator test suite
- Production and full dependency audits
- Public JavaScript and CSS asset inspection
- Current PHP security advisories and their applicability to this deployment

The source review began on local `dev` commit `166c65a4`. Production behavior,
deployed source, and the running container were inspected independently rather
than inferred from the local branch.

## Safety boundaries

The production testing was deliberately non-destructive. It did not:

- Create accounts, records, uploads, or other production data
- Authenticate as a member or administrator
- Modify Firebase configuration, rules, IAM, secrets, or deployments
- Perform load testing, password attacks, broad enumeration, or denial of
  service
- Trigger the PHP OOM/RCE proof-of-concept or the `body-parser` crash payload

Those payloads can terminate or compromise a process and are inappropriate for
a live production system without a dedicated maintenance window and recovery
plan.

## Findings

### SEC-2026-10-24-01: Vulnerable `body-parser` copy in the production image

**Upstream severity:** High

**Observed live exploitability:** Not demonstrated

**Maintenance priority:** Medium

The deployed source lock and `/workspace/node_modules` in the production image
contain `body-parser` 2.3.0. This version is affected by CVE-2026-111181 /
GHSA-27r3-jxmh-p828. A specially structured compressed request can cause an
uncaught exception and terminate a Node.js process. Version 2.4.0 contains the
fix.

The production container was inspected to determine reachability:

- The container entry point is the injected Google Functions Framework 3.5.1.
- That framework has its own `body-parser` 1.20.5 dependency, which is outside
  this advisory's affected `2.0.0` through `2.3.0` range.
- The application source does not import Express or `body-parser`, or register
  Express body-parsing middleware.

The vulnerable package is present but was not found on the active HTTP parsing
path. No crash payload was sent to production.

**Recommendation:** Upgrade or override `body-parser` to at least 2.4.0, rebuild
and redeploy every HTTP/callable function, then inspect the new image to confirm
that no 2.3.0 copy remains.

Reference: <https://github.com/advisories/GHSA-27r3-jxmh-p828>

### SEC-2026-10-24-02: Nodemailer address-parser advisories

**Upstream severity:** Moderate

**Observed live exploitability:** Dormant

**Maintenance priority:** Low until email is enabled; required before enablement

The deployed source contains Nodemailer 10.1.2. It is affected by three related
address-parser advisories that are fixed in 10.1.4 and later:

- <https://github.com/advisories/GHSA-8c8m-p3m8-cjg8>
- <https://github.com/advisories/GHSA-m943-m63m-w62w>
- <https://github.com/advisories/GHSA-85x2-q946-cp5h>

The production function metadata has no Brevo secret or email environment
configuration. The implementation also refuses delivery without SMTP
credentials and validates administrator-provided sender/test addresses.

**Recommendation:** Upgrade Nodemailer to the current compatible release
(`npm audit fix --omit=dev --dry-run` selected 10.2.1) before configuring Brevo
or enabling digest delivery. Re-run the standalone Functions production audit
after updating the lockfile.

### SEC-2026-10-24-03: Development and desktop dependency backlog

**Live website severity:** Informational

**Developer/desktop exposure:** Requires remediation

The complete dependency audit, including development and Electron tooling,
reported 14 vulnerable packages: two critical, six high, and six moderate.
They include advisories affecting `shell-quote`, Electron, Vite, Undici,
PostCSS tooling, and related transitive packages.

The production-only audit reduced this to the `body-parser` and Nodemailer
packages discussed above. The remaining packages are not served by Firebase
Hosting, but they matter when developers run local tools or distribute the
desktop application.

**Recommendation:** Remediate the development and Electron dependency tree in
a separate change, because some upgrades may require breaking-version or
desktop-runtime validation. Do not treat the live Hosting result as clearance
for the desktop application.

## Latest PHP exploit review

As of 2026-10-24, the newest critical PHP disclosures reviewed were:

- CVE-2026-109618 / GHSA-w8hw-w9fx-j79w — remote code execution through
  out-of-memory corruption
- CVE-2026-109619 / GHSA-6wmf-4rv5-p3rp — remote code execution through stale
  global state

Patched supported releases are PHP 8.2.35, 8.3.36, 8.4.27, and 8.5.12.

References:

- <https://github.com/php/php-src/security/advisories/GHSA-w8hw-w9fx-j79w>
- <https://github.com/php/php-src/security/advisories/GHSA-6wmf-4rv5-p3rp>

These vulnerabilities do not apply to the observed deployment:

- The repository contains no PHP source or PHP runtime configuration.
- Firebase Hosting serves the site and Node.js 22 runs the backend functions.
- `/index.php`, `/phpinfo.php`, `/cgi-bin/php-cgi.exe`, `/.env`, and
  `/.git/config` returned the same Firebase SPA shell and content hash as the
  application root.
- The live response did not expose PHP, Apache, or `X-Powered-By` fingerprints.

The PHP exploit payloads were not executed because their intended effects
include process corruption, denial of service, and remote code execution.

## Live penetration-test results

| Control | Result |
| --- | --- |
| Plain HTTP | Redirected to HTTPS |
| HSTS | Enabled with `includeSubDomains` and `preload` |
| Content Security Policy | Restrictive policy with `base-uri 'none'`, `frame-ancestors 'none'`, and `object-src 'none'` |
| Clickjacking | `X-Frame-Options: DENY` |
| MIME sniffing | `X-Content-Type-Options: nosniff` |
| Referrer policy | `strict-origin-when-cross-origin` |
| Browser permissions | Geolocation, camera, and microphone disabled |
| TRACE method | Rejected with HTTP 405 |
| Untrusted-origin CORS preflight | No `Access-Control-Allow-Origin` returned |
| Production-origin CORS preflight | Exact production origin allowed |
| Callable without App Check/authentication | HTTP 401 `UNAUTHENTICATED` |
| Private Firestore sentinel read | HTTP 403 `PERMISSION_DENIED` |
| Storage bucket enumeration | HTTP 401 invalid App Check token |
| Realtime Database root read | HTTP 401 `Permission denied` |
| Representative source-map request | Returned SPA shell, not a source map |
| Common secret and dotfile paths | Returned SPA shell, not file contents |

Twenty initial production JavaScript/CSS assets were downloaded and checked for
published source maps, private keys, service-account material, App Check debug
token values, and emulator endpoints. None were found. Generic Firebase debug
token strings inside vendor code are library functionality, not deployed token
values.

## Firebase and Cloud Functions posture

The live inventory contained 84 active functions:

- 78 callable functions
- One HTTP function
- Two scheduled functions
- Three event-driven functions

The 79 HTTP/callable functions use externally reachable Cloud Run services, but
the unauthenticated callable probe was rejected. Runtime identity verification
found explicit task-specific service accounts. The default compute identity was
limited to logging plus conditional access to build-source objects.

Additional controls verified:

- App Check enforced for Authentication, Firestore, and Storage
- Realtime Database App Check not enforced, but an unauthenticated root read was
  denied by database rules
- Password policy enforced with a 15-character minimum and 25-character maximum
- Storage CORS limited to the permanent application origins, the active
  development preview, and loopback development ports; only `GET` and `HEAD`
  are permitted by the bucket CORS policy
- The active preview domain matched the authorized-domain configuration
- Cloud Run invoker and secret access were limited to the intended runtime
  identities

## Firestore rules assessment

```json
{
  "score": 5,
  "summary": "Source rules use server-owned writes, strict owner/admin reads, verified-email plus MFA admin authority, state-constrained public reads, and recursive default denial. Live private-read probes were denied.",
  "findings": []
}
```

The assessment specifically considered update bypasses, authority sources,
client-controlled role fields, ownership checks, type/size enforcement, and
resource-exhaustion risks. Direct Firestore client writes are denied; business
writes go through callable functions. Public forum and overlay reads are
restricted to approved/published records, and the final recursive rule denies
otherwise unmatched access.

Storage rules separately require verified ownership, server-issued upload
tickets, exact path/type/size matching, safe public-object metadata, and a
recursive default deny.

All three rules test files passed: 34 tests total. These tests validate the
checked-in rules. Live sentinel probes confirmed important denial behavior, but
the audit did not export and byte-compare the deployed ruleset with the local
files.

## Validation performed

- Firestore/Storage rules: 3 files, 34 tests passed
- Root production dependency audit: one high package and one moderate package
- Standalone Functions production audit: same two packages
- Full dependency audit: 14 packages (2 critical, 6 high, 6 moderate)
- Cloud function inventory and runtime-identity inspection
- Production CORS, App Check, Firestore, Storage, Realtime Database, HTTP method,
  TLS redirect, and security-header probes
- Deployed source-lock comparison
- Direct inspection of the active Cloud Run revision and its container layers
- Public asset scan across 20 initial JavaScript/CSS resources
- Repository whitespace check

No full application CI, browser end-to-end suite, authenticated member flow, or
administrator flow was run as part of this audit because no application code
was changed and production test identities were not used.

## Recommended follow-up

1. Upgrade/override `body-parser` to at least 2.4.0 and Nodemailer to at least
   10.1.4, preferably the current compatible release.
2. Run the standalone Functions build and production audit, then redeploy all
   HTTP/callable functions.
3. Reinspect the deployed source archive and container to verify that
   `body-parser` 2.3.0 and Nodemailer 10.1.2 are absent.
4. Remediate the separate development/Electron dependency backlog and validate
   the desktop application independently.
5. Use dedicated test member and administrator accounts for an authenticated
   assessment of IDOR, role/MFA enforcement, upload quotas, moderation flows,
   account deletion, and rate limits. Prefer a production-equivalent preview
   for destructive or high-volume cases.

## Repository and production impact

The audit itself made no application-source, Firebase, production-data, account,
configuration, or deployment changes. Only this report was added afterward.
