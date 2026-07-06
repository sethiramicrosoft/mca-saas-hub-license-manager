import { Router } from "express";
import { z } from "zod";
import {
  armRequest,
  BILLING_API_VERSION,
  encodePathSegment,
  resolveArmToken,
  SAAS_HUB_API_VERSION
} from "./armClient.js";
import type { BillingAccount, BillingProfile, BillingSubscription, InvoiceSection, ListResult, SaasResource } from "./types.js";

const updateQuantitySchema = z.object({
  quantity: z.number().int().positive()
});

const moveTenantSchema = z.object({
  provisioningTenantId: z.string().min(1)
});

const recurringBillingSchema = z.object({
  autoRenew: z.enum(["On", "Off"])
});

const pollOperationSchema = z.object({
  operationUrl: z.string().url()
});

export function createApiRouter(): Router {
  const router = Router();

  router.get("/billing-accounts", async (req, res, next) => {
    try {
      const token = await resolveArmToken(req.header("authorization"));
      const result = await armRequest<ListResult<BillingAccount>>(
        token,
        `/providers/Microsoft.Billing/billingAccounts?api-version=${BILLING_API_VERSION}`
      );
      res.json(result.body);
    } catch (error) {
      next(error);
    }
  });

  router.get("/inventory", async (req, res, next) => {
    try {
      const token = await resolveArmToken(req.header("authorization"));
      const accountsResult = await armRequest<ListResult<BillingAccount>>(
        token,
        `/providers/Microsoft.Billing/billingAccounts?api-version=${BILLING_API_VERSION}`
      );
      const inventory = [];
      const errors = [];

      for (const account of accountsResult.body.value ?? []) {
        try {
          const subscriptionsResult = await armRequest<ListResult<BillingSubscription>>(
            token,
            `/providers/Microsoft.Billing/billingAccounts/${encodePathSegment(account.name)}/billingSubscriptions?api-version=${BILLING_API_VERSION}`
          );

          for (const subscription of (subscriptionsResult.body.value ?? []).filter(isActiveBillingSubscription)) {
            inventory.push(mapInventoryItem(account, subscription));
          }
        } catch (error) {
          errors.push({
            billingAccountName: account.name,
            billingAccountDisplayName: account.properties?.displayName,
            message: error instanceof Error ? error.message : "Unable to read billing subscriptions."
          });
        }
      }

      res.json({ value: inventory, errors });
    } catch (error) {
      next(error);
    }
  });

  router.get("/billing-accounts/:billingAccountName/billing-profiles", async (req, res, next) => {
    try {
      const token = await resolveArmToken(req.header("authorization"));
      const billingAccountName = encodePathSegment(req.params.billingAccountName);
      const result = await armRequest<ListResult<BillingProfile>>(
        token,
        `/providers/Microsoft.Billing/billingAccounts/${billingAccountName}/billingProfiles?api-version=${BILLING_API_VERSION}`
      );
      res.json(result.body);
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/billing-accounts/:billingAccountName/billing-profiles/:billingProfileName/invoice-sections",
    async (req, res, next) => {
      try {
        const token = await resolveArmToken(req.header("authorization"));
        const billingAccountName = encodePathSegment(req.params.billingAccountName);
        const billingProfileName = encodePathSegment(req.params.billingProfileName);
        const result = await armRequest<ListResult<InvoiceSection>>(
          token,
          `/providers/Microsoft.Billing/billingAccounts/${billingAccountName}/billingProfiles/${billingProfileName}/invoiceSections?api-version=${BILLING_API_VERSION}`
        );
        res.json(result.body);
      } catch (error) {
        next(error);
      }
    }
  );

  router.get("/billing-accounts/:billingAccountName/billing-subscriptions", async (req, res, next) => {
    try {
      const token = await resolveArmToken(req.header("authorization"));
      const billingAccountName = encodePathSegment(req.params.billingAccountName);
      const result = await armRequest<ListResult<BillingSubscription>>(
        token,
        `/providers/Microsoft.Billing/billingAccounts/${billingAccountName}/billingSubscriptions?api-version=${BILLING_API_VERSION}`
      );
      const invoiceSectionId = typeof req.query.invoiceSectionId === "string" ? req.query.invoiceSectionId : "";

      res.json({
        ...result.body,
        value: (invoiceSectionId
          ? result.body.value.filter((item) => item.properties.invoiceSectionId?.toLowerCase() === invoiceSectionId.toLowerCase())
          : result.body.value
        ).filter(isActiveBillingSubscription)
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/billing-accounts/:billingAccountName/associated-tenants", async (req, res, next) => {
    try {
      const token = await resolveArmToken(req.header("authorization"));
      const billingAccountName = encodePathSegment(req.params.billingAccountName);
      const result = await armRequest<ListResult<{
        id: string;
        name: string;
        type: string;
        properties: {
          friendlyName?: string;
          tenantId?: string;
          billingManagementState?: string;
          provisioningState?: string;
        };
      }>>(
        token,
        `/providers/Microsoft.Billing/billingAccounts/${billingAccountName}/associatedTenants?api-version=2020-11-01-privatepreview`
      );

      res.json(result.body);
    } catch (error) {
      next(error);
    }
  });

  router.put("/billing-accounts/:billingAccountName/billing-subscriptions/:billingSubscriptionName/quantity", async (req, res, next) => {
    try {
      const token = await resolveArmToken(req.header("authorization"));
      const billingSubscriptionName = encodePathSegment(req.params.billingSubscriptionName);
      const payload = updateQuantitySchema.parse(req.body);
      const result = await armRequest<BillingSubscription>(
        token,
        `/providers/Microsoft.SaaSHub/saasResources/${billingSubscriptionName}?api-version=${SAAS_HUB_API_VERSION}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            properties: {
              quantity: payload.quantity
            }
          })
        }
      );

      res.status(result.azureAsyncOperation || result.location ? 202 : 200).json({
        resource: result.body,
        azureAsyncOperation: result.azureAsyncOperation ?? result.location,
        retryAfter: result.retryAfter
      });
    } catch (error) {
      next(error);
    }
  });

  router.put("/billing-accounts/:billingAccountName/billing-subscriptions/:billingSubscriptionName/provisioning-tenant", async (req, res, next) => {
    try {
      const token = await resolveArmToken(req.header("authorization"));
      const billingSubscriptionName = encodePathSegment(req.params.billingSubscriptionName);
      const payload = moveTenantSchema.parse(req.body);
      const result = await armRequest<SaasResource>(
        token,
        `/providers/Microsoft.SaaSHub/saasResources/${billingSubscriptionName}?api-version=${SAAS_HUB_API_VERSION}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            properties: {
              provisioningTenantId: payload.provisioningTenantId
            }
          })
        }
      );

      res.status(result.azureAsyncOperation || result.location ? 202 : 200).json({
        resource: result.body,
        azureAsyncOperation: result.azureAsyncOperation ?? result.location,
        retryAfter: result.retryAfter
      });
    } catch (error) {
      next(error);
    }
  });

  router.put("/billing-accounts/:billingAccountName/billing-subscriptions/:billingSubscriptionName/recurring-billing", async (req, res, next) => {
    try {
      const token = await resolveArmToken(req.header("authorization"));
      const billingSubscriptionName = encodePathSegment(req.params.billingSubscriptionName);
      const payload = recurringBillingSchema.parse(req.body);
      const result = await armRequest<SaasResource>(
        token,
        `/providers/Microsoft.SaaSHub/saasResources/${billingSubscriptionName}?api-version=${SAAS_HUB_API_VERSION}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            properties: {
              autoRenew: payload.autoRenew
            }
          })
        }
      );

      res.status(result.azureAsyncOperation || result.location ? 202 : 200).json({
        resource: result.body,
        azureAsyncOperation: result.azureAsyncOperation ?? result.location,
        retryAfter: result.retryAfter
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/operations/poll", async (req, res, next) => {
    try {
      const token = await resolveArmToken(req.header("authorization"));
      const payload = pollOperationSchema.parse(req.body);
      const result = await armRequest<unknown>(token, payload.operationUrl);
      res.json(result.body);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function mapInventoryItem(account: BillingAccount, subscription: BillingSubscription) {
  const productName = subscription.properties.skuDescription ?? subscription.properties.productType ?? subscription.properties.displayName;
  const serviceCategory = classifyServiceCategory(subscription, productName);

  return {
    serviceCategory,
    billingAccountName: account.name,
    billingAccountDisplayName: account.properties?.displayName,
    billingProfileName: subscription.properties.billingProfileName,
    billingProfileDisplayName: subscription.properties.billingProfileDisplayName,
    billingProfileId: subscription.properties.billingProfileId,
    invoiceSectionName: subscription.properties.invoiceSectionName,
    invoiceSectionDisplayName: subscription.properties.invoiceSectionDisplayName,
    invoiceSectionId: subscription.properties.invoiceSectionId,
    subscriptionId: subscription.name,
    subscriptionResourceId: subscription.id,
    subscriptionDisplayName: subscription.properties.displayName,
    productName,
    productType: subscription.properties.productType,
    productTypeId: subscription.properties.productTypeId,
    skuDescription: subscription.properties.skuDescription,
    skuId: subscription.properties.skuId,
    quantity: subscription.properties.quantity,
    status: subscription.properties.status,
    autoRenew: subscription.properties.autoRenew,
    termDuration: subscription.properties.termDuration,
    termStartDate: subscription.properties.termStartDate,
    termEndDate: subscription.properties.termEndDate,
    expiryDate: subscription.properties.termEndDate,
    provisioningTenantId: subscription.properties.provisioningTenantId,
    purchaseDate: subscription.properties.purchaseDate
  };
}

function isActiveBillingSubscription(subscription: BillingSubscription): boolean {
  return subscription.properties.status?.toLowerCase() === "active";
}

function classifyServiceCategory(subscription: BillingSubscription, productName: string | undefined): "Azure" | "Non-Azure" {
  const searchable = [
    productName,
    subscription.properties.displayName,
    subscription.properties.productType,
    subscription.properties.productCategory,
    subscription.properties.resourceUri
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (subscription.properties.productCategory === "SeatBased") {
    return "Non-Azure";
  }

  if (
    searchable.includes("microsoft.capacity") ||
    searchable.includes("reservation") ||
    searchable.includes("reserved vm") ||
    searchable.includes("azure")
  ) {
    return "Azure";
  }

  return "Non-Azure";
}

