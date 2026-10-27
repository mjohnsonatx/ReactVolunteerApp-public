# Security policy

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Email
`tilleryvolunteeradmin@gmail.com` with:

- the affected route, component, Function, or rule;
- the impact and the smallest safe reproduction;
- whether the issue affects the emulator, a preview, or production; and
- a way to contact you for follow-up.

Do not send production credentials, private keys, access tokens, or another
person's data. Redact identifiers and use a local emulator or disposable test
account whenever possible.

The maintainers will acknowledge the report, investigate it privately, and
coordinate disclosure after affected deployments and credentials have been
secured. If a credential may have been exposed, rotate or revoke it first;
removing it from Git history is not a substitute for rotation.

## Repository hygiene

Run `npm run verify:public` before publishing changes. It checks the currently
tracked tree for common secret formats, environment files, keys, source maps,
logs, generated output, and local tool state. It does not replace provider-side
secret scanning, dependency review, or a deliberate audit of Git history.
