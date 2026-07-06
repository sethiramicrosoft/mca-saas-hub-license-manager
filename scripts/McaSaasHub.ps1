<#
.SYNOPSIS
    Standalone Microsoft Customer Agreement (MCA) SaaS/license management helper.

.DESCRIPTION
    This script uses the signed-in Azure CLI user to call Microsoft Billing and
    Microsoft SaaS Hub ARM APIs. It does not require Microsoft Scout, Node.js,
    npm, or the companion web UI.

    DISCLAIMER: This tool is provided as-is for customer-managed use. Microsoft
    provides no warranties, guarantees, or support commitments for this sample.
    Customers are responsible for validating behavior, permissions, billing
    impact, and all commerce changes before use.

    Supported actions:
      - Inventory/export of active products across accessible MCA billing accounts
      - Listing billing accounts, billing profiles, invoice sections, subscriptions
      - Listing associated tenants
      - Changing seats on an existing billing subscription
      - Updating recurring billing on/off
      - Moving an existing subscription to another associated/provisioning tenant
      - Polling long-running operation URLs

.PREREQUISITES
    - Azure CLI installed
    - Run: az login
    - The signed-in user must have the required MCA billing roles
    - For mutating actions, use -Force deliberately

.EXAMPLES
    # Confirm the signed-in Azure CLI account
    .\McaSaasHub.ps1 -Action WhoAmI

    # Export active inventory to CSV
    .\McaSaasHub.ps1 -Action ExportInventory -OutputPath .\inventory.csv

    # List active subscriptions for a billing account
    .\McaSaasHub.ps1 -Action ListBillingSubscriptions `
      -BillingAccountName "<billing-account-name>"

    # List associated tenants for a billing account
    .\McaSaasHub.ps1 -Action ListAssociatedTenants `
      -BillingAccountName "<billing-account-name>"

    # Change seats by setting the new total quantity.
    # Reductions may be restricted by Microsoft commerce policy after the post-purchase adjustment window.
    .\McaSaasHub.ps1 -Action UpdateSeats `
      -BillingSubscriptionName "<billing-subscription-name>" `
      -Quantity 10 `
      -Force

    # Move an existing subscription to an associated tenant
    .\McaSaasHub.ps1 -Action MoveSubscriptionTenant `
      -BillingSubscriptionName "<billing-subscription-name>" `
      -ProvisioningTenantId "<target-associated-tenant-id>" `
      -Force

    # Turn recurring billing on or off
    .\McaSaasHub.ps1 -Action SetRecurringBilling `
      -BillingSubscriptionName "<billing-subscription-name>" `
      -AutoRenew Off `
      -Force

    # Poll an async operation returned by UpdateSeats or MoveSubscriptionTenant
    .\McaSaasHub.ps1 -Action PollOperation `
      -OperationUrl "<azure-async-operation-url>"

.NOTES
    This script is provided as-is with no Microsoft support commitment.
    Mutating actions intentionally require -Force to reduce accidental commerce changes.
    The script does not print access tokens or store credentials.
#>

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet(
        'WhoAmI',
        'ListBillingAccounts',
        'ListBillingProfiles',
        'ListInvoiceSections',
        'ListBillingSubscriptions',
        'ListAssociatedTenants',
        'ListInventory',
        'ExportInventory',
        'ChangeSeats',
        'UpdateSeats',
        'SetRecurringBilling',
        'MoveSubscriptionTenant',
        'PollOperation'
    )]
    [string]$Action,

    [string]$BillingAccountName,
    [string]$BillingProfileName,
    [string]$InvoiceSectionName,
    [string]$BillingScope,
    [string]$BillingSubscriptionName,
    [string]$ProductId,
    [string]$ProductCode,
    [string]$ProductSearch,
    [int]$Quantity = 1,
    [string]$ProvisioningTenantId,
    [string]$SaasResourceName,
    [ValidateSet('On', 'Off')]
    [string]$AutoRenew = 'On',
    [string]$Market = 'US',
    [string]$Language = 'en',
    [string]$OperationUrl,
    [string]$OutputPath = ".\mca-product-inventory.csv",
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$ArmBaseUrl = 'https://management.azure.com'
$BillingApiVersion = '2024-04-01'
$MarketplaceApiVersion = '2025-05-01'
$SaasHubApiVersion = '2025-07-01-preview'

Write-Warning 'DISCLAIMER: This tool is provided as-is for customer-managed use. Microsoft provides no warranties, guarantees, or support commitments. Validate permissions, billing impact, and all commerce changes before use.'

function Assert-AzCli {
    if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
        throw 'Azure CLI is required. Install Azure CLI, run az login, and retry.'
    }
}

function Get-ArmToken {
    Assert-AzCli
    $token = az account get-access-token --resource $ArmBaseUrl --query accessToken -o tsv
    if (-not $token) {
        throw 'Unable to acquire Azure Resource Manager token. Run az login and retry.'
    }
    return $token
}

function Invoke-ArmJson {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$PathOrUrl,
        [object]$Body
    )

    $token = Get-ArmToken
    $uri = if ($PathOrUrl.StartsWith('https://')) { $PathOrUrl } else { "$ArmBaseUrl$PathOrUrl" }
    $headers = @{ Authorization = "Bearer $token" }

    $invokeParams = @{
        Method = $Method
        Uri = $uri
        Headers = $headers
    }

    if ($null -ne $Body) {
        $invokeParams.ContentType = 'application/json'
        $invokeParams.Body = $Body | ConvertTo-Json -Depth 30
    }

    $response = Invoke-WebRequest @invokeParams
    $parsedBody = if ($response.Content) {
        try {
            $response.Content | ConvertFrom-Json
        } catch {
            [pscustomobject]@{ raw = $response.Content }
        }
    } else {
        [pscustomobject]@{}
    }

    if ($null -eq $parsedBody) {
        $parsedBody = [pscustomobject]@{}
    }

    $metadata = [ordered]@{
        statusCode = [int]$response.StatusCode
        azureAsyncOperation = Get-HeaderValue $response.Headers 'Azure-AsyncOperation'
        location = Get-HeaderValue $response.Headers 'Location'
        retryAfter = Get-HeaderValue $response.Headers 'Retry-After'
    }

    if ($parsedBody -is [System.Array]) {
        return [pscustomobject]@{
            value = $parsedBody
            operation = $metadata
        }
    }

    foreach ($key in $metadata.Keys) {
        if ($metadata[$key]) {
            $parsedBody | Add-Member -NotePropertyName "_$key" -NotePropertyValue $metadata[$key] -Force
        }
    }

    return $parsedBody
}

function Get-HeaderValue {
    param(
        [Parameter(Mandatory = $true)]$Headers,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $value = $Headers[$Name]
    if ($value -is [array]) {
        return [string]$value[0]
    }
    if ($null -eq $value) {
        return $null
    }
    return [string]$value
}

function Encode-Part {
    param([Parameter(Mandatory = $true)][string]$Value)
    return [uri]::EscapeDataString($Value)
}

function Escape-ODataString {
    param([string]$Value)
    if ($null -eq $Value) {
        return ''
    }
    return $Value.Replace("'", "''")
}

function Get-BillingScope {
    if ($BillingScope) {
        return $BillingScope
    }

    if (-not $BillingAccountName -or -not $BillingProfileName -or -not $InvoiceSectionName) {
        throw 'Provide BillingScope or BillingAccountName + BillingProfileName + InvoiceSectionName.'
    }

    return "/providers/Microsoft.Billing/billingAccounts/$BillingAccountName/billingProfiles/$BillingProfileName/invoiceSections/$InvoiceSectionName"
}

function Require-Force {
    param([string]$Operation)
    if (-not $Force) {
        throw "$Operation changes commerce state. Re-run with -Force after reviewing parameters."
    }
}

function Get-ProductFilters {
    param([string]$Search)

    $base = @(
        "isTestProduct eq false",
        "skuAggregatedData/actions/any(actions: actions eq 'Purchase')"
    )

    if ($Search) {
        $variants = @(
            $Search,
            (Get-Culture).TextInfo.ToTitleCase($Search.ToLowerInvariant()),
            $Search.ToUpperInvariant()
        ) | Select-Object -Unique

        $clauses = foreach ($variant in $variants) {
            "contains(displayName,'$(Escape-ODataString $variant)')"
        }

        return @($base + @('(' + ($clauses -join ' or ') + ')'))
    }

    return @($base)
}

function Convert-MarketplaceProduct {
    param([object]$Product)
    [pscustomobject]@{
        productId     = $Product.productId
        displayName   = $Product.displayName
        description   = $Product.description
        productFamily = $Product.productFamily
        productType   = $Product.productType
        service       = $Product.service
        startingPrice = $Product.startingPrice
    }
}

function Get-ProductTermsFromDetails {
    param([object]$Details)

    $terms = @()
    foreach ($plan in @($Details.plans)) {
        foreach ($availability in @($plan.availabilities)) {
            foreach ($term in @($availability.terms)) {
                if ($term.productCode -and $availability.isStopSell -ne $true -and $term.state -ne 'Unavailable') {
                    $terms += [pscustomobject]@{
                        productCode            = $term.productCode
                        termId                 = $term.termId
                        termUnit               = $term.termUnit
                        termDescription        = $term.termDescription
                        billingPeriod          = $term.billingPlan.billingPeriod
                        billingPlanTitle       = $term.billingPlan.title
                        billingPlanDescription = $term.billingPlan.description
                        state                  = $term.state
                        isAutorenewable        = $term.isAutorenewable
                        availabilityId         = $availability.id
                        market                 = $availability.market
                    }
                }
            }
        }
    }

    return $terms
}

function Get-ServiceCategory {
    param(
        [Parameter(Mandatory = $true)][object]$Subscription,
        [string]$ProductName
    )

    $searchable = @(
        $ProductName,
        $Subscription.properties.displayName,
        $Subscription.properties.productType,
        $Subscription.properties.productCategory,
        $Subscription.properties.resourceUri
    ) -join ' '

    if ($Subscription.properties.productCategory -eq 'SeatBased') {
        return 'Non-Azure'
    }

    if ($searchable -match '(?i)microsoft\.capacity|reservation|reserved vm|azure') {
        return 'Azure'
    }

    return 'Non-Azure'
}

function Test-ActiveBillingSubscription {
    param([Parameter(Mandatory = $true)][object]$Subscription)
    return $Subscription.properties.status -eq 'Active'
}

function Get-Inventory {
    $accounts = Invoke-ArmJson -Method GET -PathOrUrl "/providers/Microsoft.Billing/billingAccounts?api-version=$BillingApiVersion"
    $rows = @()

    foreach ($account in @($accounts.value)) {
        try {
            $subscriptions = Invoke-ArmJson -Method GET -PathOrUrl "/providers/Microsoft.Billing/billingAccounts/$(Encode-Part $account.name)/billingSubscriptions?api-version=$BillingApiVersion"
            foreach ($subscription in @($subscriptions.value | Where-Object { Test-ActiveBillingSubscription $_ })) {
                $productName = if ($subscription.properties.skuDescription) { $subscription.properties.skuDescription } elseif ($subscription.properties.productType) { $subscription.properties.productType } else { $subscription.properties.displayName }
                $serviceCategory = Get-ServiceCategory -Subscription $subscription -ProductName $productName
                $rows += [pscustomobject]@{
                    serviceCategory           = $serviceCategory
                    billingAccountName        = $account.name
                    billingAccountDisplayName = $account.properties.displayName
                    billingProfileName        = $subscription.properties.billingProfileName
                    billingProfileDisplayName = $subscription.properties.billingProfileDisplayName
                    billingProfileId          = $subscription.properties.billingProfileId
                    invoiceSectionName        = $subscription.properties.invoiceSectionName
                    invoiceSectionDisplayName = $subscription.properties.invoiceSectionDisplayName
                    invoiceSectionId          = $subscription.properties.invoiceSectionId
                    subscriptionId            = $subscription.name
                    subscriptionResourceId    = $subscription.id
                    subscriptionDisplayName   = $subscription.properties.displayName
                    productName               = $productName
                    productType               = $subscription.properties.productType
                    productTypeId             = $subscription.properties.productTypeId
                    skuDescription            = $subscription.properties.skuDescription
                    skuId                     = $subscription.properties.skuId
                    quantity                  = $subscription.properties.quantity
                    status                    = $subscription.properties.status
                    autoRenew                 = $subscription.properties.autoRenew
                    termDuration              = $subscription.properties.termDuration
                    termStartDate             = $subscription.properties.termStartDate
                    termEndDate               = $subscription.properties.termEndDate
                    expiryDate                = $subscription.properties.termEndDate
                    provisioningTenantId      = $subscription.properties.provisioningTenantId
                    purchaseDate              = $subscription.properties.purchaseDate
                }
            }
        } catch {
            Write-Warning "Unable to read billing subscriptions for $($account.name): $($_.Exception.Message)"
        }
    }

    return $rows
}

switch ($Action) {
    'WhoAmI' {
        Assert-AzCli
        az account show | ConvertFrom-Json
        break
    }

    'ListBillingAccounts' {
        Invoke-ArmJson -Method GET -PathOrUrl "/providers/Microsoft.Billing/billingAccounts?api-version=$BillingApiVersion"
        break
    }

    'ListBillingProfiles' {
        if (-not $BillingAccountName) { throw 'BillingAccountName is required.' }
        Invoke-ArmJson -Method GET -PathOrUrl "/providers/Microsoft.Billing/billingAccounts/$(Encode-Part $BillingAccountName)/billingProfiles?api-version=$BillingApiVersion"
        break
    }

    'ListInvoiceSections' {
        if (-not $BillingAccountName -or -not $BillingProfileName) { throw 'BillingAccountName and BillingProfileName are required.' }
        Invoke-ArmJson -Method GET -PathOrUrl "/providers/Microsoft.Billing/billingAccounts/$(Encode-Part $BillingAccountName)/billingProfiles/$(Encode-Part $BillingProfileName)/invoiceSections?api-version=$BillingApiVersion"
        break
    }

    'ListBillingSubscriptions' {
        if (-not $BillingAccountName) { throw 'BillingAccountName is required.' }
        $result = Invoke-ArmJson -Method GET -PathOrUrl "/providers/Microsoft.Billing/billingAccounts/$(Encode-Part $BillingAccountName)/billingSubscriptions?api-version=$BillingApiVersion"
        if ($InvoiceSectionName -or $BillingScope) {
            $scope = Get-BillingScope
            $result.value = @($result.value | Where-Object { $_.properties.invoiceSectionId -eq $scope })
        }
        $result
        break
    }

    'ListAssociatedTenants' {
        if (-not $BillingAccountName) { throw 'BillingAccountName is required.' }
        Invoke-ArmJson -Method GET -PathOrUrl "/providers/Microsoft.Billing/billingAccounts/$(Encode-Part $BillingAccountName)/associatedTenants?api-version=2020-11-01-privatepreview"
        break
    }

    'ListInventory' {
        Get-Inventory
        break
    }

    'ExportInventory' {
        $inventory = Get-Inventory
        $inventory | Export-Csv -Path $OutputPath -NoTypeInformation -Encoding UTF8
        [pscustomobject]@{
            outputPath = (Resolve-Path $OutputPath).Path
            count = @($inventory).Count
        }
        break
    }

    'UpdateSeats' {
        Require-Force 'UpdateSeats'
        if (-not $BillingSubscriptionName) { throw 'BillingSubscriptionName is required.' }
        Invoke-ArmJson -Method PATCH -PathOrUrl "/providers/Microsoft.SaaSHub/saasResources/$(Encode-Part $BillingSubscriptionName)?api-version=$SaasHubApiVersion" -Body @{ properties = @{ quantity = $Quantity } }
        break
    }

    'ChangeSeats' {
        Require-Force 'ChangeSeats'
        if (-not $BillingSubscriptionName) { throw 'BillingSubscriptionName is required.' }
        Invoke-ArmJson -Method PATCH -PathOrUrl "/providers/Microsoft.SaaSHub/saasResources/$(Encode-Part $BillingSubscriptionName)?api-version=$SaasHubApiVersion" -Body @{ properties = @{ quantity = $Quantity } }
        break
    }

    'MoveSubscriptionTenant' {
        Require-Force 'MoveSubscriptionTenant'
        if (-not $BillingSubscriptionName -or -not $ProvisioningTenantId) { throw 'BillingSubscriptionName and ProvisioningTenantId are required.' }
        Invoke-ArmJson -Method PATCH -PathOrUrl "/providers/Microsoft.SaaSHub/saasResources/$(Encode-Part $BillingSubscriptionName)?api-version=$SaasHubApiVersion" -Body @{ properties = @{ provisioningTenantId = $ProvisioningTenantId } }
        break
    }

    'SetRecurringBilling' {
        Require-Force 'SetRecurringBilling'
        if (-not $BillingSubscriptionName) { throw 'BillingSubscriptionName is required.' }
        Invoke-ArmJson -Method PATCH -PathOrUrl "/providers/Microsoft.SaaSHub/saasResources/$(Encode-Part $BillingSubscriptionName)?api-version=$SaasHubApiVersion" -Body @{ properties = @{ autoRenew = $AutoRenew } }
        break
    }

    'PollOperation' {
        if (-not $OperationUrl) { throw 'OperationUrl is required.' }
        Invoke-ArmJson -Method GET -PathOrUrl $OperationUrl
        break
    }
}
