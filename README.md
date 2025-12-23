# AI RCA Service (Root Cause Analysis)

An AI-powered service that automatically analyzes GitHub pull requests to identify the root cause of bugs. It integrates with Azure OpenAI, Azure DevOps, and GitHub Webhooks.

## 🚀 Features

-   **Automatic RCA**: Triggers on GitHub PR creation/updates.
-   **AI Analysis**: Uses Azure OpenAI (GPT-4) to analyze code diffs and commit history.
-   **Azure DevOps Integration**: Fetches related work items and repos.
-   **Multi-Tenant Auth**: Supports both **Work/School** and **Personal** Microsoft accounts.
-   **Dockerized**: Fully containerized with automatic Ngrok integration for local development.

## 🛠️ Tech Stack

-   **Backend**: Node.js (v18), TypeScript, Express
-   **Database**: SQLite (via `better-sqlite3`)
-   **AI**: Azure OpenAI
-   **Auth**: Passport.js (Azure AD OIDC)
-   **Infrastructure**: Docker, Docker Compose, Ngrok

---

## 📋 Prerequisites

1.  **Docker & Docker Compose** installed.
2.  **Ngrok Account**: Get your Authtoken from [dashboard.ngrok.com](https://dashboard.ngrok.com).
3.  **Azure Account**: Access to Azure Portal to create App Registrations.

---

## ⚙️ Setup Guide

### 1. Azure App Registration (CRITICAL STEP)

To allow **Personal Accounts** (Gmail, Outlook) AND **Work Accounts**, you must configure the app exactly as follows:

1.  Go to **Azure Portal** > **App Registrations** > **+ New registration**.
2.  **Name**: `AI RCA Service`
3.  **Supported account types**: **YOU MUST SELECT THE 3RD OPTION**:
    *   ✅ **"Accounts in any organizational directory (Any Azure AD directory - Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)"**
    *   ❌ *Do NOT select "Single Tenant" or "Multitenant" (without personal).*
4.  **Redirect URI**:
    *   Select **Web**.
    *   URL: `http://localhost:3000/auth/azure/callback`
5.  Click **Register**.

#### Configure Client Secret
1.  Go to **Certificates & secrets** > **+ New client secret**.
2.  Description: `dev-secret`.
3.  Click **Add**.
4.  **Copy the Value immediately** (you won't see it again).

#### Configure API Permissions (For Repo Access)
1.  Go to **API Permissions** (Left menu).
2.  Click **+ Add a permission**.
3.  Select **Azure DevOps**.
4.  Select **Delegated permissions**.
5.  **CHECK** the box for **`user_impersonation`**.
6.  Click **Add permissions**.
7.  *(Optional)* Click **Grant admin consent** if available.

### 2. Environment Configuration

1.  Copy the example env file:
    ```bash
    cp .env.example .env
    ```
2.  Edit `.env` and fill in your details:

    ```ini
    # Azure AD Config
    AZURE_CLIENT_ID=<Your Application (client) ID>
    AZURE_CLIENT_SECRET=<Your Client Secret Value>
    AZURE_TENANT_ID=common  # MUST be 'common' for personal accounts

    # Ngrok
    NGROK_AUTHTOKEN=<Your Ngrok Authtoken>

    # Azure OpenAI
    AZURE_OPENAI_API_KEY=<Your Key>
    AZURE_OPENAI_ENDPOINT=<Your Endpoint>
    AZURE_OPENAI_DEPLOYMENT_NAME=<Your Deployment Name>
    ```

---

## 🏃‍♂️ Running the App

Start the application with Docker Compose. This will start the Node.js app and a local Ngrok tunnel.

```bash
docker-compose up --build
```

-   **App URL**: `http://localhost:3000`
-   **Ngrok URL**: Automatically discovered and printed in the logs (e.g., `https://xxxx.ngrok-free.app`).

---

## 🧪 Usage

1.  Open `http://localhost:3000` in your browser.
2.  Click **Login with Microsoft**.
    -   You can use **Personal** (Hotmail/Gmail) or **Work** accounts.
3.  Once logged in, you will see the Dashboard.
4.  **Toggle the Service Switch** to "ON" to enable RCA analysis.
5.  The app will listen for GitHub Webhooks (configured via the Ngrok URL).

## 🐛 Troubleshooting

-   **"You can't sign in here with a personal account"**:
    -   You created the App Registration as "Single Tenant". You MUST create a **new** one and select the "Multitenant + Personal" option.
-   **"Unauthorized" when fetching repos**:
    -   You forgot to add the **Azure DevOps > user_impersonation** permission in the Azure Portal.
-   **"Invalid resource" error**:
    -   Ensure you are using the correct Client ID in `.env`.
