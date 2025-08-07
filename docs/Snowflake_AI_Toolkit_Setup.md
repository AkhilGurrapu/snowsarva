# Snowflake AI Toolkit – Setup & Deployment Guide

Repository: <https://github.com/Snowflake-Labs/Snowflake-AI-Toolkit>

The **Snowflake AI Toolkit** provides ready-made utilities, examples and helper libraries to accelerate machine-learning and AI workloads inside Snowflake. This guide condenses the official instructions into a single markdown document.

---

## 1. Quick Start (Local Dev)

```bash
# Clone the repo
git clone https://github.com/sgsshankar/Snowflake-AI-Toolkit.git
cd snowflake-ai-toolkit

# Install Python dependencies
pip install -r requirements.txt
```

All required libraries (Snowpark Python, Pandas, scikit-learn, Streamlit etc.) are listed in `requirements.txt`.

---

## 2. Configuring **Debug Mode**

1. Open `src/settings_config.json`.
2. Locate the `mode` parameter and set it to `"debug"`:

```json
{
  "mode": "debug",
  "snowflake": {
    "account": "<your-account>",
    "user": "<your-user>",
    "password": "<your-password>",
    "role": "<your-role>",
    "warehouse": "<your-wh>",
    "database": "<your-db>",
    "schema": "<your-schema>"
  }
}
```

3. Save the file.

---

## 3. Running the App Locally

```bash
streamlit run streamlit_app.py
```

The Streamlit UI will load at <http://localhost:8501>. Verify functionality in debug mode before moving to native deployment.

---

## 4. Deploying **Natively** in Snowflake

1. Change `MODE` in `settings.json` from `debug` → `native`.
2. Use **Snow CLI** (`snow`) to deploy:

```bash
snow streamlit deploy \
  --account "<your_account>" \
  --user "<your_username>" \
  --password "<your_password>" \
  --role "<your_role>" \
  --warehouse "<your_warehouse>" \
  --database "<your_database>" \
  --replace
```

> Note: No additional `pip install` is necessary inside Snowflake; the app's conda environment is auto-resolved.

---

## 5. Troubleshooting

| Issue | Resolution |
|-------|------------|
|**Permission errors**|Ensure the Snowflake role has `USAGE` on warehouse/database + `CREATE STREAMLIT` privs.|
|**Missing dependency**|Re-run `pip install -r requirements.txt`; verify Python 3.9+ virtual-env.|
|**Streamlit app not loading**|Check firewall/port 8501 locally; confirm `MODE` flag is correct.| 
|**Configuration errors**|Double-check `.env` or `settings_config.json` values.|  

---

## 6. Support & Community
* GitHub Issues: <https://github.com/Snowflake-Labs/Snowflake-AI-Toolkit/issues>
* Snowflake Community AI Forum: <https://community.snowflake.com>
* Slack: `#snowpark-ai` (Snowflake Community Slack)

---

**Tip for SnowSarva users**: Reference this toolkit for building Snowpark ML models that plug into the **Quality Engine** and **NLQ Service** modules described in `SnowSarva_Architecture.md`. 