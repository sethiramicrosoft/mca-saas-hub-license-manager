export type ListResult<T> = {
  value: T[];
  nextLink?: string;
};

export type BillingAccount = {
  id: string;
  name: string;
  properties?: {
    displayName?: string;
    agreementType?: string;
    accountStatus?: string;
    primaryBillingTenantId?: string;
  };
};

export type BillingProfile = {
  id: string;
  name: string;
  properties?: {
    displayName?: string;
    currency?: string;
    status?: string;
  };
};

export type InvoiceSection = {
  id: string;
  name: string;
  properties?: {
    displayName?: string;
    state?: string;
  };
};

export type SaasResource = {
  id: string;
  name: string;
  properties: {
    billingScope?: string;
    productCode?: string;
    productType?: string;
    skuDescription?: string;
    quantity?: number;
    status?: string;
    provisioningState?: string;
    provisioningTenantId?: string;
    autoRenew?: "On" | "Off";
  };
};

export type BillingSubscription = {
  id: string;
  name: string;
  type: string;
  properties: {
    autoRenew?: "On" | "Off";
    billingFrequency?: string | null;
    billingProfileDisplayName?: string;
    billingProfileId?: string;
    billingProfileName?: string;
    displayName?: string;
    invoiceSectionDisplayName?: string;
    invoiceSectionId?: string;
    invoiceSectionName?: string;
    operationStatus?: string;
    productCategory?: string;
    productType?: string;
    productTypeId?: string;
    provisioningTenantId?: string;
    purchaseDate?: string;
    quantity?: number;
    resourceUri?: string;
    skuDescription?: string;
    skuId?: string;
    status?: string;
    termDuration?: string;
    termEndDate?: string;
    termStartDate?: string;
  };
};

export type InventoryItem = {
  serviceCategory?: "Azure" | "Non-Azure";
  billingAccountName?: string;
  billingAccountDisplayName?: string;
  billingProfileName?: string;
  billingProfileDisplayName?: string;
  billingProfileId?: string;
  invoiceSectionName?: string;
  invoiceSectionDisplayName?: string;
  invoiceSectionId?: string;
  subscriptionId?: string;
  subscriptionResourceId?: string;
  subscriptionDisplayName?: string;
  productName?: string;
  productType?: string;
  productTypeId?: string;
  skuDescription?: string;
  skuId?: string;
  quantity?: number;
  status?: string;
  autoRenew?: "On" | "Off";
  termDuration?: string;
  termStartDate?: string;
  termEndDate?: string;
  expiryDate?: string;
  provisioningTenantId?: string;
  purchaseDate?: string;
};

export type InventoryResult = {
  value: InventoryItem[];
  errors?: Array<{
    billingAccountName?: string;
    billingAccountDisplayName?: string;
    message: string;
  }>;
};

export type AssociatedTenant = {
  id: string;
  name: string;
  type: string;
  properties: {
    friendlyName?: string;
    tenantId?: string;
    billingManagementState?: string;
    provisioningState?: string;
  };
};

export type OperationStarted = {
  resource: SaasResource | BillingSubscription;
  azureAsyncOperation?: string;
  retryAfter?: string;
};

export type AzureAccount = {
  id: string;
  name: string;
  tenantId: string;
  tenantDisplayName?: string;
  user?: {
    name?: string;
    type?: string;
  };
};

export type AuthStatus = {
  signedIn: boolean;
  account?: AzureAccount;
  subscriptions: AzureAccount[];
};

export type LoginState = {
  status: "idle" | "running" | "succeeded" | "failed";
  verificationUrl?: string;
  userCode?: string;
  message?: string;
  account?: AzureAccount;
};

export async function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path);
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: "PUT",
    body: JSON.stringify(body)
  });
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const rawMessage = payload?.error?.details?.error?.message ?? payload?.error?.message ?? `Request failed with ${response.status}`;
    const message =
      typeof rawMessage === "string" && rawMessage.includes("BillingGroupNotFound")
        ? "This product cannot be loaded for the selected billing profile. Choose a different billing profile or product."
        : rawMessage;
    throw new Error(message);
  }

  return payload as T;
}
