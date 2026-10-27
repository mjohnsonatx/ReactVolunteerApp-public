# TODO

- [x] Launch initially on `https://tillerystreettrail.web.app` and publish the contact
      address `tilleryvolunteeradmin@gmail.com`.
- [x] Confirm the launch domain is present in `cors.json` for direct Firebase Storage reads.
- [x] Set and bind a real `POLL_VOTE_SALT` Functions secret for every guest-poll
      endpoint (verified in production on September 11, 2026).
- [x] Deploy the composite indexes in `firestore.indexes.json` (verified against the
      production project on September 11, 2026).
- [ ] Deferred until the public site gains meaningful traction: finish keyless GitHub
      Actions deployment authentication for staging and production with dedicated
      deployer accounts and protected environments. Dev already uses Workload Identity
      Federation. Until production deployment permissions are ready, deploy production
      manually from the authenticated desktop; never store a service-account JSON key
      in GitHub.
