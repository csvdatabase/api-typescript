# Releasing

Run releases from this repository only:

```bash
make release version=1.1.1
```

The target updates `package.json` and `package-lock.json`, runs `npm run check`
and `npm pack --dry-run`, commits the version bump, pushes the branch and tag,
and creates a GitHub Release.

Published GitHub Releases trigger `.github/workflows/release.yml`, which verifies
the tag, reruns checks, and publishes the npm package with provenance.

Major releases use `x.0.0` and must be cut from a matching major branch. For
example, `make release version=1.0.0` must be run from branch `v1`.

## One-time setup

1. Publish the package's first version manually with npm two-factor
   authentication. npm requires the package to exist before trusted publishing
   can be configured. Do not create a GitHub release for this bootstrap version.
2. In the npm package settings, add a GitHub Actions trusted publisher for the
   `csvdatabase/api-typescript` repository, the `release.yml` workflow, and the
   `npm` environment.
3. In the GitHub repository, create an `npm` environment and restrict deployment
   to tags that match `v*`. Add required reviewers if desired.

Trusted publishing uses short-lived OpenID Connect credentials. No long-lived
npm token is required by the release workflow.
