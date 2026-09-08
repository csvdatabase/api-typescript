# Releasing

```bash
bash scripts/upsert-branch.sh v1
bash scripts/release.sh 1.0.0 true # dry run
bash scripts/release.sh 1.0.0
```

Pass `true` as the second argument for a dry run; omit it to release.

Every release requires the matching major branch: all `1.x.x` releases use `v1`, all `2.x.x` releases use `v2`. The working tree must be clean and the tag must not exist. Dry runs validate these rules and print commands without changes. Real releases install dependencies, update the version, run checks, commit, push the branch and tag atomically, and create a GitHub release. The release workflow validates the branch and tag again before publishing.

The central `csdb` checkout runs the same scripts with the following commands; it adds no version restrictions:

```bash
bash scripts/release-all.sh 1.0.0 true # dry run
bash scripts/release-all.sh 1.0.0
```

Upsert switches to an existing branch (fast-forwarding from origin), or creates it from HEAD, and pushes it. It never resets existing history.

## One-time setup

1. Publish the package's first version manually with npm two-factor authentication. npm requires the package to exist before trusted publishing can be configured. Do not create a GitHub release for this bootstrap version.
2. In the npm package settings, add a GitHub Actions trusted publisher for the `csvdatabase/api-typescript` repository, the `release.yml` workflow, and the `npm` environment.
3. In the GitHub repository, create an `npm` environment and restrict deployment to tags that match `v*`. Add required reviewers if desired.

Trusted publishing uses short-lived OpenID Connect credentials. No long-lived npm token is required by the release workflow.
