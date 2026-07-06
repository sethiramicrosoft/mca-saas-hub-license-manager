import { useEffect, useMemo, useState } from "react";
import {
  apiGet,
  apiPost,
  apiPut,
  type AssociatedTenant,
  type AuthStatus,
  type AzureAccount,
  type BillingAccount,
  type BillingProfile,
  type BillingSubscription,
  type InventoryItem,
  type InventoryResult,
  type InvoiceSection,
  type ListResult,
  type LoginState,
  type OperationStarted,
} from "./api";

type OperationRecord = {
  name: string;
  url?: string;
  status?: string;
  lastResult?: unknown;
};

export function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [loginState, setLoginState] = useState<LoginState | null>(null);
  const [billingAccounts, setBillingAccounts] = useState<BillingAccount[]>([]);
  const [billingProfiles, setBillingProfiles] = useState<BillingProfile[]>([]);
  const [invoiceSections, setInvoiceSections] = useState<InvoiceSection[]>([]);
  const [billingSubscriptions, setBillingSubscriptions] = useState<BillingSubscription[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [inventoryErrors, setInventoryErrors] = useState<InventoryResult["errors"]>([]);
  const [inventoryExpanded, setInventoryExpanded] = useState(false);
  const [associatedTenants, setAssociatedTenants] = useState<AssociatedTenant[]>([]);
  const [selectedBillingAccount, setSelectedBillingAccount] = useState("");
  const [selectedBillingProfile, setSelectedBillingProfile] = useState("");
  const [selectedInvoiceSection, setSelectedInvoiceSection] = useState("");
  const [selectedBillingSubscription, setSelectedBillingSubscription] = useState("");
  const [moveTargetTenantId, setMoveTargetTenantId] = useState("");
  const [recurringBillingValue, setRecurringBillingValue] = useState<"On" | "Off">("On");
  const [targetQuantity, setTargetQuantity] = useState(1);
  const [operations, setOperations] = useState<OperationRecord[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const billingScope = useMemo(() => {
    if (!selectedBillingAccount || !selectedBillingProfile || !selectedInvoiceSection) {
      return "";
    }

    return `/providers/Microsoft.Billing/billingAccounts/${selectedBillingAccount}/billingProfiles/${selectedBillingProfile}/invoiceSections/${selectedInvoiceSection}`;
  }, [selectedBillingAccount, selectedBillingProfile, selectedInvoiceSection]);

  useEffect(() => {
    void refreshAuthStatus();
  }, []);

  useEffect(() => {
    if (loginState?.status !== "running") {
      return;
    }

    const interval = window.setInterval(() => {
      void pollLoginStatus();
    }, 2000);

    return () => window.clearInterval(interval);
  }, [loginState?.status]);

  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      return await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unexpected error.");
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    await run(async () => {
      const accounts = await apiGet<ListResult<BillingAccount>>("/billing-accounts");
      setBillingAccounts(accounts.value);
    });
  }

  async function refreshAuthStatus() {
    await run(async () => {
      const status = await apiGet<AuthStatus>("/auth/status");
      setAuthStatus(status);
    });
  }

  async function startLogin() {
    await run(async () => {
      clearBillingSelection();
      const state = await apiPost<LoginState>("/auth/login/start", {});
      setLoginState(state);
    });
  }

  async function pollLoginStatus() {
    const state = await apiGet<LoginState>("/auth/login/status");
    setLoginState(state);

    if (state.status === "succeeded") {
      await refreshAuthStatus();
    }
  }

  async function logout() {
    await run(async () => {
      clearBillingSelection();
      const status = await apiPost<AuthStatus>("/auth/logout", {});
      setAuthStatus(status);
      setLoginState(null);
    });
  }

  async function setSubscription(subscriptionId: string) {
    if (!subscriptionId) return;

    await run(async () => {
      clearBillingSelection();
      const status = await apiPost<AuthStatus>("/auth/subscription", { subscriptionId });
      setAuthStatus(status);
    });
  }

  function clearBillingSelection() {
    setBillingAccounts([]);
    setBillingProfiles([]);
    setInvoiceSections([]);
    setAssociatedTenants([]);
    setSelectedBillingAccount("");
    setSelectedBillingProfile("");
    setSelectedInvoiceSection("");
  }

  async function loadBillingProfiles(name: string) {
    setSelectedBillingAccount(name);
    setSelectedBillingProfile("");
    setSelectedInvoiceSection("");
    setBillingProfiles([]);
    setInvoiceSections([]);
    setAssociatedTenants([]);
    clearProductSelection();
    if (!name) return;

    await run(async () => {
      const [profiles, tenants] = await Promise.all([
        apiGet<ListResult<BillingProfile>>(`/billing-accounts/${encodeURIComponent(name)}/billing-profiles`),
        apiGet<ListResult<AssociatedTenant>>(`/billing-accounts/${encodeURIComponent(name)}/associated-tenants`)
      ]);
      setBillingProfiles(profiles.value);
      setAssociatedTenants(tenants.value);
    });
  }

  async function loadInvoiceSections(profileName: string) {
    setSelectedBillingProfile(profileName);
    setSelectedInvoiceSection("");
    setInvoiceSections([]);
    clearProductSelection();
    if (!selectedBillingAccount || !profileName) return;

    await run(async () => {
      const result = await apiGet<ListResult<InvoiceSection>>(
        `/billing-accounts/${encodeURIComponent(selectedBillingAccount)}/billing-profiles/${encodeURIComponent(profileName)}/invoice-sections`
      );
      setInvoiceSections(result.value);
    });
  }

  function selectInvoiceSection(invoiceSectionName: string) {
    setSelectedInvoiceSection(invoiceSectionName);
    clearProductSelection();
  }

  function clearProductSelection() {
    return;
  }

  async function loadBillingSubscriptions() {
    if (!selectedBillingAccount) {
      setError("Select a billing account first.");
      return;
    }

    await run(async () => {
      const invoiceFilter = billingScope ? `?invoiceSectionId=${encodeURIComponent(billingScope)}` : "";
      const result = await apiGet<ListResult<BillingSubscription>>(
        `/billing-accounts/${encodeURIComponent(selectedBillingAccount)}/billing-subscriptions${invoiceFilter}`
      );
      setBillingSubscriptions(result.value);
    });
  }

  async function loadInventory() {
    await run(async () => {
      const result = await apiGet<InventoryResult>("/inventory");
      setInventory(result.value);
      setInventoryErrors(result.errors ?? []);
      setNotice(`Loaded ${result.value.length} inventory records across accessible billing accounts.`);
    });
  }

  function downloadInventoryCsv() {
    const columns: Array<[keyof InventoryItem, string]> = [
      ["serviceCategory", "Azure / Non-Azure"],
      ["billingAccountDisplayName", "Billing Account"],
      ["billingAccountName", "Billing Account ID"],
      ["billingProfileDisplayName", "Billing Profile"],
      ["billingProfileName", "Billing Profile ID"],
      ["invoiceSectionDisplayName", "Invoice Section"],
      ["invoiceSectionName", "Invoice Section ID"],
      ["subscriptionId", "Subscription ID"],
      ["subscriptionDisplayName", "Subscription Name"],
      ["productName", "Product Name"],
      ["quantity", "Quantity"],
      ["termDuration", "Term"],
      ["expiryDate", "Expiry Date"],
      ["status", "Status"],
      ["autoRenew", "Auto Renew"],
      ["provisioningTenantId", "Provisioning Tenant ID"]
    ];
    const csv = [
      columns.map(([, label]) => csvCell(label)).join(","),
      ...inventory.map((item) => columns.map(([key]) => csvCell(item[key])).join(","))
    ].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `mca-product-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function updateSeats() {
    if (!selectedBillingSubscription) {
      setError("Select an existing billing subscription first.");
      return;
    }

    if (!window.confirm(`Set ${selectedBillingSubscription} quantity to ${targetQuantity}?`)) {
      return;
    }

    await run(async () => {
      const result = await apiPut<OperationStarted>(
        `/billing-accounts/${encodeURIComponent(selectedBillingAccount)}/billing-subscriptions/${encodeURIComponent(selectedBillingSubscription)}/quantity`,
        { quantity: targetQuantity }
      );
      trackOperation(selectedBillingSubscription, result);
      setNotice(
        result.azureAsyncOperation
          ? "Seat update was accepted and is now pending. Use the Operations panel to poll for completion."
          : `Seat update completed. Current returned quantity: ${getQuantity(result.resource) ?? "unknown"}.`
      );
      await loadBillingSubscriptions();
    });
  }

  async function updateRecurringBilling() {
    if (!selectedBillingSubscription) {
      setError("Select an existing billing subscription first.");
      return;
    }

    if (!window.confirm(`Set recurring billing for ${selectedBillingSubscription} to ${recurringBillingValue}?`)) {
      return;
    }

    await run(async () => {
      const result = await apiPut<OperationStarted>(
        `/billing-accounts/${encodeURIComponent(selectedBillingAccount)}/billing-subscriptions/${encodeURIComponent(selectedBillingSubscription)}/recurring-billing`,
        { autoRenew: recurringBillingValue }
      );
      trackOperation(`${selectedBillingSubscription} recurring billing`, result);
      setNotice(
        result.azureAsyncOperation
          ? "Recurring billing change was accepted and is pending. Use Operations to poll for completion."
          : "Recurring billing change completed."
      );
      await loadBillingSubscriptions();
    });
  }

  async function moveSubscriptionTenant() {
    if (!selectedBillingSubscription || !moveTargetTenantId) {
      setError("Select an existing subscription and target associated tenant first.");
      return;
    }

    const target = associatedTenants.find((tenant) => tenant.properties.tenantId === moveTargetTenantId);
    if (!window.confirm(`Move ${selectedBillingSubscription} provisioning to ${target?.properties.friendlyName ?? moveTargetTenantId}?`)) {
      return;
    }

    await run(async () => {
      const result = await apiPut<OperationStarted>(
        `/billing-accounts/${encodeURIComponent(selectedBillingAccount)}/billing-subscriptions/${encodeURIComponent(selectedBillingSubscription)}/provisioning-tenant`,
        { provisioningTenantId: moveTargetTenantId }
      );
      trackOperation(`${selectedBillingSubscription} tenant move`, result);
      setNotice(
        result.azureAsyncOperation
          ? "Tenant move was accepted and is pending. Use Operations to poll for completion."
          : "Tenant move request completed."
      );
      await loadBillingSubscriptions();
    });
  }

  async function pollOperation(index: number) {
    const operation = operations[index];
    if (!operation.url) return;

    await run(async () => {
      const result = await apiPost<Record<string, unknown>>("/operations/poll", {
        operationUrl: operation.url
      });
      setOperations((current) =>
        current.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                status: typeof result.status === "string" ? result.status : item.status,
                lastResult: result
              }
            : item
        )
      );
      setNotice("Operation status refreshed.");
      await loadBillingSubscriptions();
    });
  }

  function trackOperation(name: string, result: OperationStarted) {
    setOperations((current) => [
      {
        name,
        url: result.azureAsyncOperation,
        status: getOperationStatus(result.resource),
        lastResult: result
      },
      ...current
    ]);
  }

  return (
    <main className="shell">
      <div className="top-disclaimer">
        <strong>Disclaimer:</strong> This tool is independent work and is not a Microsoft product, service, endorsed solution, or supported offering. It is provided as-is for customer-managed use. Microsoft has no responsibility for this tool, its operation, or any billing or commerce changes made with it. Customers are responsible for validating behavior, permissions, billing impact, and all commerce changes before use.
      </div>
      <header className="hero">
        <div>
          <p className="eyebrow">Microsoft Customer Agreement</p>
          <h1>SaaS Hub license management portal</h1>
          <p>Inventory, seat changes, recurring billing, and associated-tenant moves for MCA-billed subscriptions.</p>
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      <section className="grid">
        <div className="card wide">
          <h2>0. Sign in</h2>
          <p className="helper">
            This local app signs in through Azure CLI device-code auth, but the flow starts here so users know exactly which account is active.
          </p>
          <div className="auth-panel">
            <div>
              <strong>Current account</strong>
              {authStatus?.signedIn && authStatus.account ? (
                <p>
                  {authStatus.account.user?.name ?? "Unknown user"}<br />
                  <span>{authStatus.account.name} ({authStatus.account.id})</span><br />
                  <span>{authStatus.account.tenantDisplayName ?? "Tenant"} ({authStatus.account.tenantId})</span>
                </p>
              ) : (
                <p>Not signed in.</p>
              )}
            </div>
            <div className="button-row">
              <button onClick={startLogin} disabled={busy || loginState?.status === "running"}>Sign in / switch account</button>
              <button className="secondary" onClick={refreshAuthStatus} disabled={busy}>Refresh account</button>
              <button className="danger" onClick={logout} disabled={busy || !authStatus?.signedIn}>Logout</button>
            </div>
          </div>

          {loginState?.status === "running" && (
            <div className="device-code">
              <strong>Complete sign-in</strong>
              <p>Open <a href={loginState.verificationUrl ?? "https://login.microsoft.com/device"} target="_blank" rel="noreferrer">{loginState.verificationUrl ?? "https://login.microsoft.com/device"}</a></p>
              {loginState.userCode && <code>{loginState.userCode}</code>}
              <p className="helper">After sign-in completes, this panel will update automatically.</p>
            </div>
          )}

          {loginState?.status === "failed" && <div className="error">{loginState.message}</div>}

          {authStatus?.subscriptions.length ? (
            <label>
              Active subscription
              <select value={authStatus.account?.id ?? ""} onChange={(event) => setSubscription(event.target.value)} disabled={busy}>
                {authStatus.subscriptions.map((subscription) => (
                  <option key={subscription.id} value={subscription.id}>
                    {subscription.name} - {subscription.id}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <div className="card wide info-grid">
          <section>
            <h2>About this tool</h2>
            <p>
              This local tool helps billing operators work with Microsoft Customer Agreement subscriptions without jumping between several portal pages. It reads active product inventory across billing accounts, exports a CSV, and lets an authorized user change seats, switch recurring billing on or off, and move an existing subscription to an associated tenant.
            </p>
            <p>
              It uses the signed-in Azure CLI account, so it follows the user’s existing Microsoft Entra and MCA billing permissions. It doesn’t keep a database and it doesn’t store credentials.
            </p>
          </section>
          <section>
            <h2>How to use</h2>
            <ol>
              <li>Start by signing in. Check that the account and tenant shown are the ones you intend to use.</li>
              <li>Use Inventory view first. Load the active subscription list and download the CSV if you need a working file.</li>
              <li>For changes, load billing access, select the billing account, then pick the subscription you want to manage.</li>
              <li>Review the current quantity, recurring billing state, and provisioning tenant before making changes.</li>
              <li>After a change is accepted, use Operations to poll the result until it finishes.</li>
            </ol>
          </section>
        </div>

        <div className="card wide">
          <h2>1. Inventory view</h2>
          <p className="helper">Download all products/subscriptions visible to the signed-in user across accessible MCA billing accounts.</p>
          <div className="button-row left">
            <button onClick={loadInventory} disabled={busy || !authStatus?.signedIn}>Load inventory</button>
            <button className="secondary" onClick={downloadInventoryCsv} disabled={!inventory.length}>Download CSV</button>
            <button className="secondary" onClick={() => setInventoryExpanded(true)} disabled={!inventory.length}>Pop out inventory</button>
          </div>
          {inventoryErrors?.length ? (
            <div className="warning">
              <strong>Some billing accounts could not be read:</strong>
              <ul>
                {inventoryErrors.map((item) => (
                  <li key={item.billingAccountName}>{item.billingAccountDisplayName ?? item.billingAccountName}: {item.message}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {inventory.length ? (
            <div className="result-card">
              <div className="result-card-toolbar">
                <span className="toolbar-label">Inventory results ({inventory.length})</span>
                <button className="secondary icon-btn" onClick={() => setInventoryExpanded(true)}>Expand</button>
              </div>
              <InventoryTable inventory={inventory} limit={100} />
              {inventory.length > 100 && <p className="helper">Showing first 100 rows. Download CSV for the full inventory.</p>}
            </div>
          ) : null}
        </div>

        <div className="card">
          <h2>2. Billing scope</h2>
          <button onClick={connect} disabled={busy || !authStatus?.signedIn}>
            Load my billing access
          </button>
          <label>
            Billing account
            <select value={selectedBillingAccount} onChange={(event) => loadBillingProfiles(event.target.value)} disabled={billingAccounts.length === 0 || busy}>
              <option value="">Select account</option>
              {billingAccounts.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.properties?.displayName ?? item.name} ({item.properties?.agreementType ?? "unknown"})
                </option>
              ))}
            </select>
          </label>

          <label>
            Billing profile
            <select value={selectedBillingProfile} onChange={(event) => loadInvoiceSections(event.target.value)} disabled={!selectedBillingAccount || busy}>
              <option value="">Select profile</option>
              {billingProfiles.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.properties?.displayName ?? item.name} {item.properties?.currency ? `(${item.properties.currency})` : ""}
                </option>
              ))}
            </select>
          </label>

          <label>
            Invoice section
            <select value={selectedInvoiceSection} onChange={(event) => selectInvoiceSection(event.target.value)} disabled={!selectedBillingProfile || busy}>
              <option value="">Select invoice section</option>
              {invoiceSections.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.properties?.displayName ?? item.name} ({item.properties?.state ?? "unknown"})
                </option>
              ))}
            </select>
          </label>

          <pre>{billingScope || "Billing scope will appear here."}</pre>
        </div>

        <div className="card">
          <h2>3. Change seats</h2>
          <p className="helper">Set a new total seat quantity for an existing subscription. Seat reductions may be restricted by Microsoft commerce policy after the post-purchase adjustment window.</p>
          <button onClick={loadBillingSubscriptions} disabled={busy || !selectedBillingAccount}>Load existing subscriptions</button>
          <label>
            Existing subscription
            <select value={selectedBillingSubscription} onChange={(event) => setSelectedBillingSubscription(event.target.value)} disabled={!billingSubscriptions.length}>
              <option value="">Select subscription</option>
              {billingSubscriptions.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.properties.displayName ?? item.name} - {item.properties.skuDescription ?? item.properties.productType} ({item.properties.quantity ?? 0})
                </option>
              ))}
            </select>
          </label>
          {billingSubscriptions.length > 0 && (
            <div className="subscription-summary">
              {billingSubscriptions
                .filter((item) => !selectedBillingSubscription || item.name === selectedBillingSubscription)
                .slice(0, 1)
                .map((item) => (
                  <div key={item.id}>
                    <strong>{item.properties.displayName ?? item.name}</strong>
                    <span>{item.properties.productType} / {item.properties.skuDescription}</span>
                    <span>Current quantity: {item.properties.quantity ?? "unknown"}</span>
                    <span>Recurring billing: {item.properties.autoRenew ?? "unknown"}</span>
                    <span>Status: {item.properties.status ?? "unknown"}</span>
                    <span>Provisioning tenant: {item.properties.provisioningTenantId ?? "unknown"}</span>
                  </div>
                ))}
            </div>
          )}
          <label>
            New total quantity
            <input type="number" min={1} value={targetQuantity} onChange={(event) => setTargetQuantity(Number(event.target.value))} />
          </label>
          <button onClick={updateSeats} disabled={busy || !selectedBillingSubscription}>
            Change seats
          </button>
          <label>
            Recurring billing
            <select value={recurringBillingValue} onChange={(event) => setRecurringBillingValue(event.target.value as "On" | "Off")} disabled={!selectedBillingSubscription || busy}>
              <option value="On">On</option>
              <option value="Off">Off</option>
            </select>
          </label>
          <button onClick={updateRecurringBilling} disabled={busy || !selectedBillingSubscription}>
            Update recurring billing
          </button>
        </div>

        <div className="card">
          <h2>4. Move subscription tenant</h2>
          <p className="helper">Move the selected existing subscription to another active associated tenant.</p>
          <label>
            Target associated tenant
            <select value={moveTargetTenantId} onChange={(event) => setMoveTargetTenantId(event.target.value)} disabled={!associatedTenants.length}>
              <option value="">Select associated tenant</option>
              {associatedTenants.map((tenant) => (
                <option
                  key={tenant.name}
                  value={tenant.properties.tenantId ?? tenant.name}
                  disabled={tenant.properties.provisioningState !== "Active"}
                >
                  {tenant.properties.friendlyName ?? tenant.name} - {tenant.properties.provisioningState}
                </option>
              ))}
            </select>
          </label>
          <button onClick={moveSubscriptionTenant} disabled={busy || !selectedBillingSubscription || !moveTargetTenantId}>
            Move selected subscription
          </button>
        </div>

        <div className="card">
          <h2>5. Operations</h2>
          {operations.length === 0 ? (
            <p>No operations yet.</p>
          ) : (
            <div className="operations">
              {operations.map((operation, index) => (
                <article key={`${operation.name}-${index}`}>
                  <strong>{operation.name}</strong>
                  <span>{operation.status ?? "Unknown"}</span>
                  {operation.url ? (
                    <button onClick={() => pollOperation(index)} disabled={busy}>Poll status</button>
                  ) : (
                    <span>No async polling URL returned; refresh subscriptions to confirm latest quantity.</span>
                  )}
                  <pre>{JSON.stringify(operation.lastResult, null, 2)}</pre>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
      {inventoryExpanded && (
        <div className="expanded-backdrop" role="presentation" onClick={() => setInventoryExpanded(false)}>
          <div className="result-card is-expanded" role="dialog" aria-modal="true" aria-label="Inventory pop-out" onClick={(event) => event.stopPropagation()}>
            <div className="result-card-toolbar">
              <span className="toolbar-label">Inventory pop-out ({inventory.length} active subscriptions)</span>
              <div className="button-row">
                <button className="secondary icon-btn" onClick={downloadInventoryCsv}>Download CSV</button>
                <button className="secondary icon-btn" onClick={() => setInventoryExpanded(false)}>Close</button>
              </div>
            </div>
            <InventoryTable inventory={inventory} />
          </div>
        </div>
      )}
    </main>
  );
}

function InventoryTable({ inventory, limit }: { inventory: InventoryItem[]; limit?: number }) {
  const rows = typeof limit === "number" ? inventory.slice(0, limit) : inventory;

  return (
    <div className="table-wrap scroll">
      <table>
        <thead>
          <tr>
            <th>Billing account</th>
            <th>Azure / Non-Azure</th>
            <th>Billing profile</th>
            <th>Invoice section</th>
            <th>Subscription</th>
            <th>Product</th>
            <th>Qty</th>
            <th>Term</th>
            <th>Expiry date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={`${item.billingAccountName}-${item.subscriptionId}`}>
              <td>{item.billingAccountDisplayName}<br /><small>{item.billingAccountName}</small></td>
              <td>{item.serviceCategory}</td>
              <td>{item.billingProfileDisplayName}<br /><small>{item.billingProfileName}</small></td>
              <td>{item.invoiceSectionDisplayName}<br /><small>{item.invoiceSectionName}</small></td>
              <td>{item.subscriptionDisplayName}<br /><small>{item.subscriptionId}</small></td>
              <td>{item.productName}</td>
              <td>{item.quantity}</td>
              <td>{item.termDuration}</td>
              <td>{item.expiryDate}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getOperationStatus(resource: OperationStarted["resource"] | undefined): string {
  if (!resource) {
    return "Accepted";
  }

  if ("provisioningState" in resource.properties && resource.properties.provisioningState) {
    return resource.properties.provisioningState;
  }

  return resource.properties.status ?? "Accepted";
}

function getQuantity(resource: OperationStarted["resource"] | undefined): number | undefined {
  return resource?.properties.quantity;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return `"${String(value).replace(/"/g, '""')}"`;
}
