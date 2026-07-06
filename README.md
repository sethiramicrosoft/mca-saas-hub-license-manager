# MCA SaaS Hub License Manager

## Read this first

This tool is independent work and is not a Microsoft product, service, endorsed solution, or supported offering. It is provided as-is for customer-managed use. Microsoft has no responsibility for this tool, its operation, or any billing or commerce changes made with it. Customers are responsible for validating behavior, permissions, billing impact, and all commerce changes before use.

This tool performs billing and subscription management actions. Some actions can affect billing, renewal behavior, seat counts, and provisioning tenant assignment. Always test with a safe subscription before using it for regular operations.

## What this tool is for

The MCA SaaS Hub License Manager is a local workstation tool for organizations that use Microsoft Customer Agreement billing and need a practical way to manage licensed subscriptions across multiple billing accounts.

It is intended for billing operators, license administrators, and tenant administrators who need to:

- See active product inventory across accessible MCA billing accounts.
- Export that inventory to CSV.
- Find which billing account, billing profile, and invoice section owns a product.
- See product quantity, term, expiry date, auto-renew state, and provisioning tenant.
- Change seat quantity on an existing subscription.
- Turn recurring billing on or off.
- Move an existing subscription to another associated tenant.
- Poll long-running Microsoft SaaS Hub operations.

The tool does not create a database. It does not store credentials. It uses the Azure CLI sign-in session on the local machine.

## What this tool does not do

New product purchase is not included in this handover build. It was tested during development, but product catalog and product term resolution were not reliable enough across billing profiles for customer handover.

Billing plan change by raw product code is not included in the customer-facing tool. The backend API shape exists, but a normal user would not know which product code to use. That flow should only be added later if there is a friendly plan picker.

This tool is not a replacement for all Microsoft Admin Center features. It focuses on a controlled set of common billing and subscription operations.

## Package contents

The package folder is:

```text
mca-saas-hub-license-manager
```

Important files and folders:

| Path | Purpose |
|---|---|
| `Install-McaSaasHub.ps1` | Checks prerequisites, installs packages, and builds the local UI and API. |
| `Start-McaSaasHub.ps1` | Starts the local web UI and API. |
| `scripts\McaSaasHub.ps1` | Standalone PowerShell operations script. It can be used without the UI. |
| `src\client` | React UI source. |
| `src\server` | Local Node and Express API source. |
| `docs\MCA SaaS Hub License Manager Operating Guide.docx` | Customer operating guide. |
| `README.md` | This file. |

## Two ways to use the tool

There are two supported usage modes.

### Option 1: Use the web UI

Use this option when operators prefer a browser interface.

Requirements:

- Azure CLI
- Node.js LTS
- npm
- PowerShell
- A signed-in Azure CLI user with the required MCA billing permissions

The UI runs locally and opens in a browser at:

```text
http://localhost:3333
```

### Option 2: Use the standalone PowerShell script

Use this option when operators prefer command-line automation or when the customer does not want to maintain the UI.

Requirements:

- Azure CLI
- PowerShell
- A signed-in Azure CLI user with the required MCA billing permissions

The standalone script is:

```text
scripts\McaSaasHub.ps1
```

This script does not need Node.js, npm, the UI, or Microsoft Scout.

## Permissions required

The tool uses the signed-in Azure CLI user. It respects Microsoft Entra permissions and MCA billing roles.

The user must have access to the billing accounts they want to manage. If a user cannot see a billing account in Azure or Microsoft Admin Center, the tool should not be expected to show or manage it.

Typical required access:

| Operation | Required access |
|---|---|
| View billing accounts, profiles, invoice sections | MCA billing reader or higher, depending on customer policy |
| Export inventory | Read access to billing subscriptions |
| Change seats | Billing account owner or billing account contributor on the relevant billing scope |
| Turn recurring billing on or off | Billing account owner or billing account contributor on the relevant billing scope |
| Move subscription to associated tenant | Billing account owner or billing account contributor, plus valid associated tenant state |

Permission behavior is enforced by Microsoft APIs. The tool does not bypass access control.

## Installation for the web UI

Open PowerShell in the package folder:

```powershell
cd .\mca-saas-hub-license-manager
```

### Recommended install

Run:

```powershell
.\Install-McaSaasHub.ps1
```

The installer checks for:

- Azure CLI
- Node.js
- npm

When `winget` is available, the installer can install missing prerequisites. It then runs:

```powershell
npm install
npm run build
```

After installation, sign in:

```powershell
az login
```

Start the UI:

```powershell
.\Start-McaSaasHub.ps1 -OpenBrowser
```

If the browser does not open automatically, go to:

```text
http://localhost:3333
```

### Manual install

Use this when software installation is managed by desktop engineering or when `winget` is blocked.

1. Install Azure CLI.
2. Install Node.js LTS. npm is included with Node.js.
3. Open a new PowerShell window.
4. Go to the package folder.
5. Run these commands:

```powershell
az --version
node --version
npm --version
az login
npm install
npm run build
npm start
```

Open:

```text
http://localhost:3333
```

### Install without winget

If Azure CLI and Node.js have already been installed manually, run:

```powershell
.\Install-McaSaasHub.ps1 -SkipWingetInstall
```

## Using the web UI

### 1. Sign in

The sign-in panel shows the current Azure CLI account and tenant.

Use **Sign in / switch account** if the wrong account is active.

The tool uses Azure CLI device-code sign-in. The browser does not receive the ARM token.

### 2. Inventory view

Use this first.

Click **Load inventory**.

The tool reads active billing subscriptions across all accessible billing accounts and shows:

- Billing account name and ID
- Azure / Non-Azure classification
- Billing profile name and ID
- Invoice section name and ID
- Subscription ID
- Product name
- Quantity
- Term
- Expiry date

Use **Download CSV** to export the inventory.

Use **Pop out inventory** when the table needs more space.

### 3. Billing scope

Use this section before making subscription changes.

Click **Load my billing access**.

Select:

1. Billing account
2. Billing profile
3. Invoice section

The selected scope is used to load subscriptions and associated tenants.

### 4. Change seats

Use this to set the new total seat quantity for an existing subscription.

Steps:

1. Select a billing account.
2. Click **Load existing subscriptions**.
3. Select the subscription.
4. Review the current quantity.
5. Enter the new total quantity.
6. Click **Change seats**.
7. Confirm the prompt.
8. Poll the operation if an async operation is returned.

Important: seat reductions can be restricted by Microsoft commerce policy after the post-purchase adjustment window.

### 5. Recurring billing

Use this to turn recurring billing on or off.

Steps:

1. Select the subscription.
2. Choose **On** or **Off** in the recurring billing field.
3. Click **Update recurring billing**.
4. Confirm the prompt.
5. Poll the operation if an async operation is returned.

Turning recurring billing off is not the same as immediate cancellation. It stops renewal behavior where the subscription supports it.

### 6. Move subscription tenant

Use this to move an existing subscription to an active associated tenant.

Steps:

1. Select the subscription.
2. Select the target associated tenant.
3. Click **Move selected subscription**.
4. Confirm the prompt.
5. Poll the operation until it finishes.

Only active associated tenants are shown as selectable. A move can still fail if Microsoft commerce or product provisioning rules reject the target tenant.

### 7. Operations

Some changes return a long-running operation URL.

Use **Poll status** until the operation returns a final state such as:

- `Succeeded`
- `Failed`
- `Canceled`

Save the operation details if the customer needs to raise a support case through their normal support channel.

## Using the standalone PowerShell script

The standalone script is:

```powershell
.\scripts\McaSaasHub.ps1
```

Sign in first:

```powershell
az login
```

### Confirm current account

```powershell
.\scripts\McaSaasHub.ps1 -Action WhoAmI
```

### Export inventory

```powershell
.\scripts\McaSaasHub.ps1 -Action ExportInventory -OutputPath .\inventory.csv
```

### List billing accounts

```powershell
.\scripts\McaSaasHub.ps1 -Action ListBillingAccounts
```

### List billing profiles

```powershell
.\scripts\McaSaasHub.ps1 -Action ListBillingProfiles `
  -BillingAccountName "<billing-account-name>"
```

### List invoice sections

```powershell
.\scripts\McaSaasHub.ps1 -Action ListInvoiceSections `
  -BillingAccountName "<billing-account-name>" `
  -BillingProfileName "<billing-profile-name>"
```

### List subscriptions

```powershell
.\scripts\McaSaasHub.ps1 -Action ListBillingSubscriptions `
  -BillingAccountName "<billing-account-name>"
```

### List associated tenants

```powershell
.\scripts\McaSaasHub.ps1 -Action ListAssociatedTenants `
  -BillingAccountName "<billing-account-name>"
```

### Change seats

This sets the new total quantity.

```powershell
.\scripts\McaSaasHub.ps1 -Action ChangeSeats `
  -BillingSubscriptionName "<billing-subscription-name>" `
  -Quantity 10 `
  -Force
```

`UpdateSeats` is also supported as a backward-compatible alias.

### Turn recurring billing off

```powershell
.\scripts\McaSaasHub.ps1 -Action SetRecurringBilling `
  -BillingSubscriptionName "<billing-subscription-name>" `
  -AutoRenew Off `
  -Force
```

### Turn recurring billing on

```powershell
.\scripts\McaSaasHub.ps1 -Action SetRecurringBilling `
  -BillingSubscriptionName "<billing-subscription-name>" `
  -AutoRenew On `
  -Force
```

### Move a subscription to an associated tenant

```powershell
.\scripts\McaSaasHub.ps1 -Action MoveSubscriptionTenant `
  -BillingSubscriptionName "<billing-subscription-name>" `
  -ProvisioningTenantId "<target-associated-tenant-id>" `
  -Force
```

### Poll an operation

```powershell
.\scripts\McaSaasHub.ps1 -Action PollOperation `
  -OperationUrl "<azure-async-operation-url>"
```

## What the PowerShell script does

The script is a thin wrapper over Microsoft APIs. It handles:

- Azure CLI token acquisition
- API calls to Microsoft Billing and Microsoft SaaS Hub
- Flattening inventory into rows
- CSV export
- Basic parameter validation
- Safety gating for mutating actions through `-Force`
- Returning async operation URLs for polling

The script does not create its own identity. It uses the signed-in Azure CLI user.

## API reference

| Capability | API | Method |
|---|---|---|
| List billing accounts | `/providers/Microsoft.Billing/billingAccounts?api-version=2024-04-01` | GET |
| List billing profiles | `/providers/Microsoft.Billing/billingAccounts/{billingAccountName}/billingProfiles?api-version=2024-04-01` | GET |
| List invoice sections | `/providers/Microsoft.Billing/billingAccounts/{billingAccountName}/billingProfiles/{billingProfileName}/invoiceSections?api-version=2024-04-01` | GET |
| List billing subscriptions | `/providers/Microsoft.Billing/billingAccounts/{billingAccountName}/billingSubscriptions?api-version=2024-04-01` | GET |
| List associated tenants | `/providers/Microsoft.Billing/billingAccounts/{billingAccountName}/associatedTenants?api-version=2020-11-01-privatepreview` | GET |
| Change seats | `/providers/Microsoft.SaaSHub/saasResources/{billingSubscriptionName}?api-version=2025-07-01-preview` | PATCH |
| Recurring billing on or off | `/providers/Microsoft.SaaSHub/saasResources/{billingSubscriptionName}?api-version=2025-07-01-preview` | PATCH |
| Move subscription tenant | `/providers/Microsoft.SaaSHub/saasResources/{billingSubscriptionName}?api-version=2025-07-01-preview` | PATCH |
| Poll operation | Returned `Azure-AsyncOperation` or `Location` URL | GET |

## Request bodies for mutating actions

Change seats:

```json
{
  "properties": {
    "quantity": 10
  }
}
```

Recurring billing:

```json
{
  "properties": {
    "autoRenew": "Off"
  }
}
```

Move subscription tenant:

```json
{
  "properties": {
    "provisioningTenantId": "<target-associated-tenant-id>"
  }
}
```

## Inventory CSV columns

| Column | Meaning |
|---|---|
| Azure / Non-Azure | Derived classification. Azure plans and reservations are marked Azure. Seat-based Microsoft 365 style subscriptions are marked Non-Azure. |
| Billing Account | Billing account display name. |
| Billing Account ID | Billing account system name. |
| Billing Profile | Billing profile display name. |
| Billing Profile ID | Billing profile system name. |
| Invoice Section | Invoice section display name. |
| Invoice Section ID | Invoice section system name. |
| Subscription ID | Billing subscription name used by APIs. |
| Subscription Name | Billing subscription display name when present. |
| Product Name | Best available product label. Usually SKU description or product type. |
| Quantity | Seat or unit quantity when present. |
| Term | Term duration such as `P1M`, `P1Y`, or `P3Y`. |
| Expiry Date | Subscription term end date. |
| Status | Subscription status. Inventory only includes active rows. |
| Auto Renew | Recurring billing state, usually `On` or `Off`. |
| Provisioning Tenant ID | Tenant where the subscription is provisioned when present. |

## Validation already performed

The following validation has been run during development:

- UI build and TypeScript checks
- Server build and TypeScript checks
- PowerShell syntax checks
- Inventory API read test
- Inventory CSV export test
- Active-only filtering test
- Recurring billing off then on test
- Move subscription tenant test with a subscription that passed `canUpdate`
- Word operating guide validation

Customers should still run their own validation in their tenant.

## Troubleshooting

| Problem | What to check |
|---|---|
| No billing accounts appear | Confirm the signed-in account with `az account show`. Confirm the user has MCA billing access. |
| Inventory is empty | Confirm there are active billing subscriptions visible to the signed-in user. |
| Change seats fails | Check if the product allows quantity changes. Seat reductions can be blocked after the adjustment window. |
| Recurring billing update fails | Check whether the product supports recurring billing changes. |
| Move tenant fails | Confirm the target tenant is active and associated. A product can still reject the target tenant through backend validation. |
| API calls fail with network errors | Check proxy, VPN, firewall, or TLS inspection. Test `az rest` against `https://management.azure.com`. |
| UI does not open | Confirm `npm start` is running and browse to `http://localhost:3333`. |
| Script says Azure CLI is missing | Install Azure CLI and open a new PowerShell window. |

## Safe operating practice

Run inventory first. Confirm the billing account, billing profile, invoice section, subscription ID, product name, current quantity, recurring billing state, and provisioning tenant before changing anything.

Use a test subscription first. Keep the async operation URL from every change. Poll operations to completion. Record failures with the returned error code and request details.

## Files to give to operators

For UI users, give the full folder:

```text
mca-saas-hub-license-manager
```

For script-only users, give:

```text
scripts\McaSaasHub.ps1
```

For documentation, include:

```text
README.md
docs\MCA SaaS Hub License Manager Operating Guide.docx
```
