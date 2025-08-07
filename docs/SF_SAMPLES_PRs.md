# Snowflake Labs `sf-samples` – Recent Pull Requests Overview

Repository: <https://github.com/Snowflake-Labs/sf-samples>

`sf-samples` is Snowflake Labs' public repository showcasing example projects, demos and reference implementations built on the Snowflake Data Cloud. Tracking its pull-request (PR) activity is useful for spotting new tutorials, sample datasets and best-practice patterns.

## Snapshot of Open/Draft PRs (June 2024 – July 2025)

| PR # | Date Opened | Author | Title (abridged) | Category |
|------|-------------|--------|------------------|-----------|
|210|24 Jun 2025|@sfc-gh-ajiang|Update the ML Job Jupyter script output|Machine-Learning / Notebook|
|201|17 Jun 2025|@sfc-gh-egudgion|Create README|Docs Update|
|195|16 May 2025|@sfc-gh-vshiv|Minor changes related to env vars|Config Hardening|
|180|16 Apr 2025|@curious-bigcat|Update README.md|Docs Update|
|177|15 Apr 2025|@curious-bigcat|Vehicle Insurance Agentic AI|AI Solution Sample|
|168|12 Mar 2025|@sfc-gh-vtimofeenko|Snowflake-CLI deployment instructions for Cortex Advanced SiS Demo|DevOps / Deployment|
|166|19 Feb 2025|@wluna01|Remove dependency on previous table creation|Data Prep Refactor|
|162|07 Feb 2025|@sfc-gh-dan|Add read-image-and-process-labels notebook|Computer Vision Sample|
|161|05 Feb 2025|@mahanteshimath|Execute queries concurrently in one worksheet|Performance Demo|
|155|17 Jan 2025|@jeff-mw|Mediawallah enrichment app init|Partner Integration|
|152|11 Jan 2025|@naishagarwal|Kumo/Snowflake personalised shopping chatbot|GenAI Commerce Demo|
|144|19 Nov 2024|@scottteal|Updates for solution centre audit|Solution Centre|
|132|15 Oct 2024|@ilias1111|Adding sample code|General Sample|
|130|11 Oct 2024|@fjaguero|Fix: remove Lang.ai quickstart guide + assets|Project Cleanup|
|128|10 Oct 2024|@dougvalenta|Add Census setup SQL script|Data Integration|
|125|03 Oct 2024|@sfc-gh-sacharya|Remove OAuth child integration creation|Security|
|119|13 Sep 2024|@ShawnGilleran|Create LiveRamp sample notebook|Marketing Integration|
|118|12 Sep 2024|@natewardwell|Hightouch solution-centre source code|Reverse ETL|
|117|12 Sep 2024|@Caside|Add Improvado cross-channel data model Snowflake notebook|Marketing Analytics|
|116|11 Sep 2024|@pballai|Sigma-computing quickstart sample script|BI Integration|
|109|23 Jul 2024|@ibadia|Update manifest.yml|Deployment|
|106|25 Jun 2024|@sfc-gh-drholland|Add files via upload|New Asset|
|60|20 Feb 2024|@sfc-gh-skhara|Skhara build 2023|Legacy Example|
|58|13 Feb 2024|@sfc-gh-zblackwood|Update deploy example to use snowcli 2.0|DevOps|
|56|07 Feb 2024|@sfc-gh-amgupta|Rename prereq SP install SQL|Refactor|

> **Tip**: Use the GitHub "Sort → Recently updated" filter to locate the most active discussions.

## Themes & Trends (2024-2025)

1. **GenAI & Agentic Workflows** – PRs #177 & #152 introduce agent-style demos built with Snowpark Python and Streamlit.
2. **Partner Integrations** – Census, Hightouch, LiveRamp and Sigma quickstarts help customers connect external SaaS tools.
3. **DevOps Enhancements** – Adoption of `snow` CLI 2.0 (#58) and deployment recipes for Cortex and Streamlit (#168).
4. **Data Quality & Env Hardening** – Environment variable sanitation (#195) and elimination of legacy dependencies (#166, #130).

## How to Use This Repository

```bash
# Clone selective sample (e.g. personalised shopping chatbot)
git clone --depth 1 --filter=blob:none --sparse https://github.com/Snowflake-Labs/sf-samples.git
cd sf-samples
# Enable sparse-checkout for the path you want
git sparse-checkout set solutions/kumo_personalized_shopping_chatbot
```

## Related Documentation
* **Snowflake Native Apps Examples** – <https://github.com/snowflakedb/native-apps-examples>
* **SnowSarva Architecture** – see `SnowSarva_Architecture.md` for integration ideas. 