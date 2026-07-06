export type BillingAccount = {
  id: string;
  name: string;
  type: string;
  properties?: {
    displayName?: string;
    agreementType?: string;
    accountStatus?: string;
    hasReadAccess?: boolean;
    primaryBillingTenantId?: string;
  };
};

export type BillingProfile = {
  id: string;
  name: string;
  type: string;
  properties?: {
    displayName?: string;
    currency?: string;
    status?: string;
    hasReadAccess?: boolean;
  };
};

export type InvoiceSection = {
  id: string;
  name: string;
  type: string;
  properties?: {
    displayName?: string;
    state?: string;
    systemId?: string;
  };
};

export type SaasResource = {
  id: string;
  name: string;
  type: string;
  properties: {
    autoRenew?: "On" | "Off";
    billingScope?: string;
    billingSubscriptionId?: string;
    provisioningState?: string;
    productType?: string;
    offerType?: string;
    productCode?: string;
    licenseData?: string;
    quantity?: number;
    skuDescription?: string;
    status?: string;
    provisioningTenantId?: string;
    term?: Record<string, unknown>;
    systemOverrides?: Record<string, unknown>;
    linkedResources?: Record<string, unknown>;
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

export type ListResult<T> = {
  value: T[];
  nextLink?: string;
  totalCount?: number;
};
