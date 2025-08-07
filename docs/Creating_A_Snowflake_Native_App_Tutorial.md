# Tutorial: Creating Your First Snowflake Native App

This guide walks through the practical steps of building a basic Snowflake Native Application using the Snowflake CLI. It is based on the official [Snowflake Quickstart](https://quickstarts.snowflake.com/guide/getting_started_with_native_apps/).

---

## 1. Prerequisites

Before you begin, ensure you have the following installed and configured:

*   A Snowflake account (a trial account is sufficient).
*   Beginner-level knowledge of Python.
*   [Visual Studio Code](https://code.visualstudio.com/) or your preferred code editor.
*   The [Snowflake CLI](https://docs.snowflake.com/en/user-guide/snowcli-install-config), configured to connect to your Snowflake account.
*   [Git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git) installed on your local machine.

---

## 2. Setting Up the Project

The quickest way to start is by cloning the official starter project from Snowflake Labs.

Open your terminal and run the following command:

```bash
git clone git@github.com:Snowflake-Labs/sfguide-getting-started-with-native-apps.git
cd sfguide-getting-started-with-native-apps
```

This command downloads a project folder containing the necessary structure and files for a basic Native App.

---

## 3. The Development Workflow with Snowflake CLI

The Snowflake CLI (`snow`) is the primary tool for developing and deploying your application. The entire project is configured via the `snowflake.yml` file in the root directory.

### Running the Application for Testing

The most common command you will use is `snow app run`. This single command performs several actions:

1.  **Creates the Application Package**: If it doesn't already exist, this command creates the application package in your Snowflake account.
2.  **Uploads Files**: It uploads all your local files (setup scripts, application code, manifest) to a named stage associated with the application package.
3.  **Deploys the App**: It creates an instance of your application for testing purposes. This is equivalent to a consumer installing the app, and it executes the `setup.sql` script.
4.  **Handles Updates**: If you run the command again after making local changes, it will update the files on the stage and upgrade the test application instance.

To run the application, execute the following from the project's root directory:

```bash
snow app run
```

After the command finishes, it will provide a URL to view your running application in Snowsight.

---

## 4. Versioning Your Application

The Native App framework allows you to manage different versions and patches for your application. This is crucial for managing upgrades for consumers.

### Creating a Version

To create a new version of your application package, use the `snow app version create` command.

```bash
# Creates version V1, with the initial code as patch 0
snow app version create V1
```

-   The first time you create a version (e.g., `V1`), the system automatically assigns it `patch 0`.
-   If you make updates and run the command again with a `--patch <number>` flag, you can create a specific patch for that version.

You can also define the version information directly within your `manifest.yml` file. If you do this, you can simply run `snow app version create` without arguments, and the CLI will use the version defined in the manifest.

Example `manifest.yml` version definition:

```yaml
version:
  name: V1
  label: "Version One"
  comment: "The first version of our application"
```

---

## 5. Manual Installation (for Consumers)

While `snow app run` is used for development, a consumer would typically install your app from the Snowflake Marketplace. The underlying SQL command that gets executed is `CREATE APPLICATION`.

You can simulate this process manually after you have created a version of your application package.

```sql
-- Connect to your database and warehouse
USE DATABASE NATIVE_APP_QUICKSTART_DB;
USE SCHEMA NATIVE_APP_QUICKSTART_SCHEMA;
USE WAREHOUSE NATIVE_APP_QUICKSTART_WH;

-- This command executes the setup.sql script from the specified version
CREATE APPLICATION NATIVE_APP_QUICKSTART_APP
  FROM APPLICATION PACKAGE NATIVE_APP_QUICKSTART_PACKAGE
  USING VERSION V1 PATCH 0;
```

When a consumer runs the application for the first time, they may be prompted to grant permissions (e.g., access to their own tables) that the application defined as necessary in the `manifest.yml`.

---

## 6. Tearing Down the Application

To clean up your development environment and remove the test application and its related objects, the Snowflake CLI provides a simple command:

```bash
snow app teardown
```

This ensures your account is clean for the next development cycle. 