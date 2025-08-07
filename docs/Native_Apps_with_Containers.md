# Snowflake Native Apps with Snowpark Container Services

This document details how to build a Snowflake Native App that includes and manages containerized workloads using Snowpark Container Services.

---

## 1. Overview

A Snowflake Native App with Snowpark Container Services (also called an "app with containers") is an extension of the standard Native App model. It allows you to package, distribute, and run OCI-compliant container images as services directly within a consumer's Snowflake account.

This powerful feature enables use cases that are not perfectly suited for the standard SQL/Python/Streamlit model, such as:
- Running custom backend services (e.g., a REST API built with FastAPI or Node.js).
- Executing specialized data processing tools or models packaged as Docker images.
- Integrating open-source applications that are distributed as containers.

Apps with containers retain all the core benefits of the Native App framework, including provider IP protection, security, data sharing, and monetization.

The primary difference in the architecture is the inclusion of a **Compute Pool** in the consumer's account and an **Image Repository** in the provider's account.

![Native Apps with Containers Overview](../../../_images/na-spcs-overview.png)

---

## 2. Key Components for Apps with Containers

Building an app with containers introduces a few additional components to the standard development process.

### Image Repository

Before a container can be used, its image must be stored in a Snowflake **Image Repository**. This is a special type of stage in the *provider's* account that is used to store OCIv2 container images.

### Services Specification File

In addition to the `manifest.yml`, you must define your containerized services in a separate YAML specification file (e.g., `spec.yml`). This file defines:
- The container images to be used, referencing the provider's image repository.
- The **services** and **jobs** to be run.
- The endpoints to be exposed (e.g., ports for a web service).
- The compute resources (instance types) required from the compute pool.
- Any environment variables to be passed to the container.

### Manifest File (`manifest.yml`) Modifications

The `manifest.yml` must be updated to reference the services specification file. This links the container definitions to the application package. It's also where you specify the privileges required to manage compute pools and external network access if needed.

### Compute Pool

A **Compute Pool** is a collection of one or more virtual machine (VM) nodes on which Snowflake runs your container services. This infrastructure is provisioned within the *consumer's* account.
- When a consumer installs an app with containers, they must grant the `CREATE COMPUTE POOL` privilege to the application.
- Alternatively, the consumer can create the compute pool manually and grant `USAGE` to the application.

---

## 3. Provider IP Protection

The Native App framework provides strong intellectual property protection, which extends to apps with containers. When your service runs in the consumer account, its internal operations are hidden to protect your code and logic.

Specifically, for queries originating from a containerized service:
- The query text is hidden in the `QUERY_HISTORY` view.
- All related information in the `ACCESS_HISTORY` view is hidden.
- The graphical Query Profile is collapsed into a single, empty node, preventing inspection of the detailed execution plan.

---

## 4. Development Workflow for Apps with Containers

The workflow is an extension of the standard Native App development process:

1.  **Package Your Service**: Develop your application and package it as a Docker image.
2.  **Push to Repository**: Push the container image to an Image Repository in your provider account.
3.  **Define Specification**: Create the service `spec.yml` file, defining how the container should be run.
4.  **Update Manifest**: Reference the `spec.yml` in your `manifest.yml`.
5.  **Test**: Use `snow app run` to deploy and test the application. The Snowflake CLI will handle the creation of the necessary compute pools and services for your development testing.
6.  **Publish**: Once tested, version and publish the application package to the Snowflake Marketplace or a private listing.

When a consumer installs the app, the framework will automatically provision the defined services onto a compute pool in their account, making your containerized application fully operational without any manual setup from the consumer.

---
*Source: [About the Snowflake Native App Framework](https://docs.snowflake.com/en/developer-guide/native-apps/native-apps-about)* 