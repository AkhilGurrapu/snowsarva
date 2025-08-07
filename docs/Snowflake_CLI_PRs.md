# Snowflake CLI – Development Activity Snapshot (Jun 2025)

Repository: <https://github.com/snowflakedb/snowflake-cli>

The **Snowflake CLI** (`snow`) is the primary DevOps tool for working with Snowflake objects, deploying native apps, managing connections and orchestrating CI/CD pipelines. This document summarises notable open or recently-opened pull requests to help contributors stay informed.

---

## Highlighted Open / Draft PRs

| PR # | Date | Author | Title | Notes |
|------|------|--------|-------|-------|
|2474|01 Jul 2025|@sfc-gh-jwilkowski|dbt external access integrations|Adds `snow dbt external-access` sub-commands (preview).|
|2472|30 Jun 2025|dependabot|Bump `pydantic-core` 2.33.2 → 2.35.2|Security/compat patch.|
|2471|30 Jun 2025|dependabot|Bump `coverage` 7.8.0 → 7.9.1|Test coverage instrumentation update.|
|2470|30 Jun 2025|dependabot|Bump `snowflake-core` 1.5.1 → 1.6.0|Aligns with 2025_06 SF Core SDK.|
|2469|30 Jun 2025|dependabot|Bump `setuptools` 80.8.0 → 80.9.0|Build tooling upgrade.|
|2466|30 Jun 2025|@sfc-gh-jwilkowski|Bump version to v3.10.0-rc0|Pre-release tag for next minor.|
|2463|27 Jun 2025|@sfc-gh-pczajka|Separate QA and Pre-prod tests|CI re-org.| 
|2447|25 Jun 2025|@sfc-gh-jwilkowski|Rename execute/dry-run → deploy/plan|Breaking CLI command rename.|
|2443|23 Jun 2025|@sfc-gh-mraba|FIPS install docker image|Security hardening.|
|2432|18 Jun 2025|@sfc-gh-daniszewski|PoC using **snowpy** for Snow Notebook|Prototype notebook integration.|
|2430|18 Jun 2025|@nipunchamikara|Add `snow connection remove` command|Feature request fulfilment.|
|2336|26 May 2025|@sfc-gh-pczajka|Fix Snowsight URL errors|Bug fix.|

### Themes
1. **CLI Command Renaming** – Transition from `execute/dry-run` to `deploy/plan` aligns with Terraform-like semantics (#2447).
2. **dbt Integration** – Ongoing work to embed dbt remote execution (`dbt external-access`) directly into CLI (#2474).
3. **Security & Compliance** – FIPS-compliant Docker image (#2443) and library upgrades (#2472, #2471).
4. **Notebook Experience** – Early experiments with `snowpy` to drive interactive notebooks (#2432).

---

## Getting the Bleeding-Edge Version

```bash
# Install CLI from source (dev branch)
git clone https://github.com/snowflakedb/snowflake-cli.git
cd snowflake-cli
pip install --editable .
```

> **Warning**: Draft PRs may introduce breaking changes. Pin major versions in production.

---

## Contribution Tips
* Run `pre-commit install` to enable linting and unit tests.
* Follow the **Developer Guide** in `docs/CONTRIBUTING.md` for code conventions.
* Use `nox -s integration` to execute integration tests against a Snowflake account stub.

---

### Relation to SnowSarva
SnowSarva's deployment automation (Phase 6) leverages the `snow deploy/plan` commands introduced in #2447, so tracking these PRs is critical for compatibility. 