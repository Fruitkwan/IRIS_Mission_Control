Class IrisOps.CloudBroker Extends %RegisteredObject
{

Parameter AzureScope = "https://vault.azure.net/.default";
Parameter AzureApiVersion = "7.4";

/// Executes an Azure test entirely on the server. Credentials and access
/// tokens are never returned to the caller or written to logs.
ClassMethod Test(request As %CSP.Request, response As %CSP.Response) As %Status
{
    set response.ContentType = "application/json"
    set response.CharSet = "utf-8"
    set response.Expires = 0
    set requestId = $job_"-"_$piece($horolog,",",2)
    try {
        set input = {}.%FromJSON(request.Content.Read(1048576))
        set provider = $zconvert(input.%Get("provider"), "l")
        set config = input.%Get("config")
        if provider'="azure" throw ##class(%Exception.General).%New("unsupported-provider")
        if '$isobject(config) throw ##class(%Exception.General).%New("invalid-config")
        do ..Log(requestId, provider, "start", "ok", "")
        set result = ..TestAzure(config, requestId)
        set response.Status = "200 OK"
        write result.%ToJSON()
    } catch ex {
        set errorCode = ..SafeErrorCode(ex)
        do ..Log(requestId, $get(provider,"unknown"), "failed", "error", errorCode)
        set response.Status = "502 Bad Gateway"
        set result = {}
        do result.%Set("status", "disconnected")
        do result.%Set("detail", "Live broker failed at "_errorCode)
        do result.%Set("requestId", requestId)
        write result.%ToJSON()
    }
    quit $$$OK
}

ClassMethod TestAzure(config As %DynamicObject, requestId As %String) As %DynamicObject
{
    set tenantId = $zstrip(config.%Get("tenantId"), "<>W")
    set clientId = $zstrip(config.%Get("clientId"), "<>W")
    set credentialRef = $zstrip(config.%Get("credentialRef"), "<>W")
    set vaultUrl = ..NormalizeVaultUrl(config.%Get("vaultUrl"))
    if (tenantId="")!(clientId="")!(credentialRef="") throw ##class(%Exception.General).%New("missing-config")
    if (tenantId["/")!(clientId["/") throw ##class(%Exception.General).%New("invalid-identity")

    set walletName = ..NormalizeWalletRef(credentialRef)
    do ..Log(requestId, "azure", "wallet-resolve", "start", walletName)
    try {
        set clientSecret = ##class(%Wallet.KeyValue).GetSecretValue(walletName)
        set clientSecret = ..ExtractSecret(clientSecret)
    } catch ex {
        do ..Log(requestId, "azure", "wallet-resolve", "error", walletName)
        throw ##class(%Exception.General).%New("wallet-secret-unavailable")
    }
    if clientSecret="" throw ##class(%Exception.General).%New("wallet-secret-empty")
    do ..Log(requestId, "azure", "wallet-resolve", "ok", walletName)

    set tokenRequest = ..NewHttpsRequest("login.microsoftonline.com")
    set tokenRequest.ContentType = "application/x-www-form-urlencoded"
    do tokenRequest.InsertFormData("grant_type", "client_credentials")
    do tokenRequest.InsertFormData("client_id", clientId)
    do tokenRequest.InsertFormData("client_secret", clientSecret)
    do tokenRequest.InsertFormData("scope", ..#AzureScope)
    do ..Log(requestId, "azure", "oauth-token", "start", "")
    set sc = tokenRequest.Post("/"_tenantId_"/oauth2/v2.0/token")
    set clientSecret = ""
    if $$$ISERR(sc) throw ##class(%Exception.General).%New("oauth-transport")
    set tokenStatus = tokenRequest.HttpResponse.StatusCode
    if tokenStatus'=200 {
        do ..Log(requestId, "azure", "oauth-token", "error", "http-"_tokenStatus)
        throw ##class(%Exception.General).%New("oauth-http-"_tokenStatus)
    }
    set tokenJson = {}.%FromJSON(tokenRequest.HttpResponse.Data.Read(1048576))
    set accessToken = tokenJson.%Get("access_token")
    set tokenJson = ""
    if accessToken="" throw ##class(%Exception.General).%New("oauth-token-missing")
    do ..Log(requestId, "azure", "oauth-token", "ok", "http-200")

    set vaultHost = $piece($piece(vaultUrl, "//", 2), "/", 1)
    set vaultRequest = ..NewHttpsRequest(vaultHost)
    do vaultRequest.SetHeader("Authorization", "Bearer "_accessToken)
    do ..Log(requestId, "azure", "vault-list", "start", vaultHost)
    set sc = vaultRequest.Get("/secrets?api-version="_..#AzureApiVersion)
    if $$$ISERR(sc) {
        set accessToken = ""
        throw ##class(%Exception.General).%New("vault-transport")
    }
    set vaultStatus = vaultRequest.HttpResponse.StatusCode
    if vaultStatus'=200 {
        set accessToken = ""
        do ..Log(requestId, "azure", "vault-list", "error", "http-"_vaultStatus)
        throw ##class(%Exception.General).%New("vault-http-"_vaultStatus)
    }
    set vaultJson = {}.%FromJSON(vaultRequest.HttpResponse.Data.Read(4194304))
    set items = vaultJson.%Get("value")
    set secrets = []
    set testName = ""
    if $isobject(items) {
        for i=0:1:items.%Size()-1 {
            set item = items.%Get(i)
            set secretName = $piece(item.%Get("id"), "/", *)
            if secretName'="" {
                set meta = {}
                do meta.%Set("provider", "Azure Key Vault")
                do meta.%Set("name", secretName)
                do meta.%Set("status", "stored")
                do secrets.%Push(meta)
            }
            if (testName="")&&(secretName'="") set testName=secretName
        }
    }
    do ..Log(requestId, "azure", "vault-list", "ok", "http-200 count="_secrets.%Size())

    // Prove Get Secret permission and the complete live path. The value is read
    // into server memory only long enough to confirm it exists, then discarded.
    if testName'="" {
        set getRequest = ..NewHttpsRequest(vaultHost)
        do getRequest.SetHeader("Authorization", "Bearer "_accessToken)
        do ..Log(requestId, "azure", "vault-get", "start", testName)
        set sc = getRequest.Get("/secrets/"_testName_"?api-version="_..#AzureApiVersion)
        set accessToken = ""
        if $$$ISERR(sc) throw ##class(%Exception.General).%New("vault-get-transport")
        set getStatus = getRequest.HttpResponse.StatusCode
        if getStatus'=200 {
            do ..Log(requestId, "azure", "vault-get", "error", "http-"_getStatus)
            throw ##class(%Exception.General).%New("vault-get-http-"_getStatus)
        }
        set secretResponse = {}.%FromJSON(getRequest.HttpResponse.Data.Read(4194304))
        set retrieved = secretResponse.%IsDefined("value")
        set secretResponse = ""
        if 'retrieved throw ##class(%Exception.General).%New("vault-value-missing")
        do ..Log(requestId, "azure", "vault-get", "ok", testName)
        set result = {}
        do result.%Set("status", "connected")
        do result.%Set("detail", "Live: Azure OAuth succeeded and Key Vault secret '"_testName_"' was retrieved through the broker.")
        do result.%Set("requestId", requestId)
        do result.%Set("validatedSecret", testName)
        do result.%Set("secrets", secrets)
        quit result
    }

    set accessToken = ""
    set result = {}
    do result.%Set("status", "connected")
    do result.%Set("detail", "Live: Azure OAuth succeeded and Key Vault was reached; the vault contains no secrets to retrieve.")
    do result.%Set("requestId", requestId)
    do result.%Set("secrets", secrets)
    quit result
}

ClassMethod NormalizeWalletRef(ref As %String) As %String
{
    set normalized = $translate($zstrip(ref, "<>W"), "/", ".")
    if ($length(normalized,".")<2)!(normalized["..") throw ##class(%Exception.General).%New("invalid-wallet-reference")
    quit normalized
}

ClassMethod ExtractSecret(value As %String) As %String
{
    set extracted = ""
    try {
        set object = {}.%FromJSON(value)
        for key="clientSecret","client_secret","password","value","secret" {
            if object.%IsDefined(key) set extracted=object.%Get(key) quit
        }
    } catch ex {
        set extracted=value
    }
    quit extracted
}

ClassMethod NormalizeVaultUrl(value As %String) As %String
{
    set url = $zstrip(value, "<>W")
    set lower = $zconvert(url, "l")
    if $extract(lower,1,8)'="https://" throw ##class(%Exception.General).%New("invalid-vault-url")
    set authority = $piece($extract(lower,9,*), "/", 1)
    if $extract(authority,*-15,*)'=".vault.azure.net" throw ##class(%Exception.General).%New("invalid-vault-host")
    if authority["@" throw ##class(%Exception.General).%New("invalid-vault-host")
    quit "https://"_authority
}

ClassMethod NewHttpsRequest(server As %String) As %Net.HttpRequest
{
    set request = ##class(%Net.HttpRequest).%New()
    set request.Server = server
    set request.Https = 1
    set request.Timeout = 20
    set request.OpenTimeout = 10
    set request.SSLCheckServerIdentity = 1
    set sslConfig = $system.Util.GetEnviron("IRISOPS_SSL_CONFIG")
    if sslConfig="" set sslConfig="irisops-azure-client"
    set request.SSLConfiguration = sslConfig
    quit request
}

ClassMethod SafeErrorCode(ex As %Exception.AbstractException) As %String
{
    // Exception text can contain request details. Only emit fixed error codes.
    set message = ex.DisplayString()
    set result = "internal-error"
    for code="unsupported-provider","invalid-config","missing-config","invalid-identity","invalid-wallet-reference","wallet-secret-unavailable","wallet-secret-empty","invalid-vault-url","invalid-vault-host","oauth-transport","oauth-token-missing","vault-transport","vault-get-transport","vault-value-missing" {
        if message[code set result=code quit
    }
    for prefix="oauth-http-","vault-http-","vault-get-http-" {
        if message[prefix {
            set status = $extract($piece(message,prefix,2),1,3)
            if (status?3N) set result=prefix_status quit
        }
    }
    quit result
}

ClassMethod Log(requestId As %String, provider As %String, stage As %String, outcome As %String, detail As %String)
{
    set message = "[irisops-cloud] request="_requestId_" provider="_provider_" stage="_stage_" outcome="_outcome
    if detail'="" set message=message_" detail="_detail
    do ##class(%SYS.System).WriteToConsoleLog(message, 0, 0, "IrisOps.CloudBroker")
}

}
