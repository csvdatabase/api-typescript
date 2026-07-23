# Releasing

Releases are published to npm from `.github/workflows/release.yml` when a GitHub
release with a matching `v<package-version>` tag is published.

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

## Publish a release

1. Update `version` in `package.json` and `package-lock.json` using semantic
   versioning.
2. Run `npm ci`, `npm run check`, and `npm pack --dry-run`.
3. Merge the version change to `main`.
4. Create a GitHub release from the exact tag `v<package-version>`.

The workflow verifies the tag, repeats the full check, and publishes a public
package with npm provenance. Versions are immutable; publish a new patch instead
of replacing an existing release.
