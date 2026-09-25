Class IrisOps.Broker.Router Extends %CSP.REST
{

XData UrlMap [ XMLNamespace = "http://www.intersystems.com/urlmap" ]
{
<Routes>
  <Route Url="/api/cloud/test" Method="POST" Call="CloudTest" />
  <Route Url="/api/remediation/audit" Method="POST" Call="RemediationAudit" />
  <Route Url="/api/remediation/history" Method="GET" Call="RemediationHistory" />
</Routes>
}

ClassMethod CloudTest() As %Status
{
    quit ##class(IrisOps.CloudBroker).Test(%request, %response)
}

ClassMethod RemediationAudit() As %Status
{
    quit ##class(IrisOps.Remediation).Record(%request, %response)
}

ClassMethod RemediationHistory() As %Status
{
    quit ##class(IrisOps.Remediation).History(%request, %response)
}

}
