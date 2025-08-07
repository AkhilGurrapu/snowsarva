# Snowflake Native Apps: Deep Dive

This document provides a comprehensive overview of the Snowflake Native App Framework, its components, and the development lifecycle.

## Introduction to the Snowflake Native App Framework

The Snowflake Native App Framework enables developers to build data applications that leverage core Snowflake functionality. It allows you to:

-   **Expand Snowflake's capabilities** by securely sharing data and related business logic (Streamlit apps, Snowpark code, SQL procedures) with other Snowflake accounts.
-   **Distribute and monetize applications** through the Snowflake Marketplace (for public listings) or via private listings to specific consumers.
-   **Create rich, interactive user interfaces** directly within Snowflake using Streamlit.

The framework is designed with a robust developer experience in mind, offering:

-   A streamlined, single-account testing environment.
-   A developer workflow that integrates with standard source control tools like Git.
-   Support for versioning and patching, allowing for incremental updates.
-   Built-in logging and event tracing for monitoring and troubleshooting.

## Core Components and Concepts

The framework operates on a **Provider** and **Consumer** model, consistent with other Snowflake features like Secure Data Sharing.

-   **Provider**: The entity (developer, company) that creates and publishes the application.
-   **Consumer**: The Snowflake user who installs and uses the application.

The following diagram illustrates the high-level architecture:

![Native Apps Overview](../../../_images/native-apps-overview.png)

### 1. Application Package

The central component of a Native App is the **Application Package**. It is a container that encapsulates everything the application needs to run:

-   **Data Content**: Shared data from the provider.
-   **Application Logic**: Stored procedures, UDFs, and Streamlit apps.
-   **Metadata**: Information about versions and patch levels.
-   **Setup Script**: The SQL script that installs and configures the application.

### 2. Manifest File (`manifest.yml`)

This crucial YAML file acts as the blueprint for the application package. It defines key configuration and setup properties, including:

-   The location of the `setup.sql` script.
-   Application version information.
-   Privileges the application will request from the consumer.
-   References to external code files or UI elements like Streamlit.
-   Bindings to consumer-side objects.

### 3. Setup Script (`setup.sql`)

This SQL script contains all the statements necessary to install, configure, or upgrade an application. It is executed automatically when a consumer installs the app or when a provider runs it for testing. Its responsibilities include:

-   Creating the application schema and roles.
-   Granting privileges to the application role.
-   Creating stored procedures, functions, and views.
-   Setting up the Streamlit UI.

## Development and Deployment Workflow

The process of bringing a Native App to consumers follows a clear path:

1.  **Develop & Test**: The provider develops the application logic, defines the `manifest.yml` and `setup.sql` scripts, and creates an Application Package. Testing can be done locally within a single provider account.
2.  **Publish**: Once tested, the provider shares the application by publishing a **Listing**.
    -   **Snowflake Marketplace Listing**: Makes the app discoverable and available to all Snowflake users.
    -   **Private Listing**: Shares the app directly with specific consumer accounts.
3.  **Install & Manage**: The consumer discovers the listing and installs the **Snowflake Native App**.
    -   When installed, Snowflake creates the application object in the consumer's account and executes the `setup.sql` script to build all the necessary objects.
    -   The consumer may then need to grant the application specific privileges to access their own data.

---

*Source: [About the Snowflake Native App Framework](https://docs.snowflake.com/en/developer-guide/native-apps/native-apps-about)* 