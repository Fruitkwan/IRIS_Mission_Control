Class IrisOps.Broker.Router Extends %CSP.REST
{

/// Authenticate once, then keep a CSP session in an HttpOnly, SameSite=Strict
/// cookie, so the browser holds no broker token. Broker JWTs are also
/// invalidated whenever IRIS security settings change, which remediation does.
Parameter UseSession = 1;

XData UrlMap [ XMLNamespace = "http://www.intersystems.com/urlmap" ]
{
<Routes>
  <Route Url="/api/session" Method="POST" Call="SessionStart" />
  <Route Url="/api/session" Method="DELETE" Call="SessionEnd" />
  <Route Url="/api/cloud/test" Method="POST" Call="CloudTest" />
  <Route Url="/api/remediation/audit" Method="POST" Call="RemediationAudit" />
  <Route Url="/api/remediation/history" Method="GET" Call="RemediationHistory" />
  <Route Url="/api/snapshots" Method="GET" Call="SnapshotList" />
  <Route Url="/api/snapshots" Method="POST" Call="SnapshotCreate" />
  <Route Url="/api/snapshots/:id" Method="GET" Call="SnapshotGet" />
  <Route Url="/api/snapshots/:id" Method="DELETE" Call="SnapshotRemove" />
  <Route Url="/api/logs/messages" Method="GET" Call="MessagesLogList" />
  <Route Url="/api/logs/messages/:name" Method="GET" Call="MessagesLogRead" />
</Routes>
}

/// Two guards before any route runs:
/// - Requests that change state must carry X-Requested-With: IrisOps. Cross-site
///   pages cannot add that header, so the session cookie cannot be abused (CSRF).
/// - Remediation records and snapshots hold security configuration, so those
///   routes require the %Admin_Secure privilege, not just a valid login.
ClassMethod OnPreDispatch(pUrl As %String, pMethod As %String, ByRef pContinue As %Boolean) As %Status
{
    if (pMethod'="GET") && (%request.GetCgiEnv("HTTP_X_REQUESTED_WITH")'="IrisOps") {
        set pContinue = 0
        set %response.Status = "403 Forbidden"
        set %response.ContentType = "application/json"
        write {"detail":"missing-request-header"}.%ToJSON()
        quit $$$OK
    }
    // messages.log may reveal system details; same privilege the classic portal requires to operate the system.
    if (pUrl["/api/logs/") && '$system.Security.Check("%Admin_Operate", "USE") && '$system.Security.Check("%Admin_Manage", "USE") {
        set pContinue = 0
        set %response.Status = "403 Forbidden"
        set %response.ContentType = "application/json"
        write {"detail":"requires-admin-operate"}.%ToJSON()
        quit $$$OK
    }
    if (pUrl["/api/remediation/") || (pUrl["/api/snapshots") {
        if '$system.Security.Check("%Admin_Secure", "USE") {
            set pContinue = 0
            set %response.Status = "403 Forbidden"
            set %response.ContentType = "application/json"
            write {"detail":"requires-admin-secure"}.%ToJSON()
        }
    }
    quit $$$OK
}

/// POST /api/session — called once at portal login with Basic credentials;
/// IRIS authenticates the request and the CSP session keeps the user signed in.
ClassMethod SessionStart() As %Status
{
    set %response.ContentType = "application/json"
    write {"user":($username), "adminSecure":($system.Security.Check("%Admin_Secure", "USE"))}.%ToJSON()
    quit $$$OK
}

/// DELETE /api/session — ends the broker session at portal logout.
ClassMethod SessionEnd() As %Status
{
    set %session.EndSession = 1
    set %response.ContentType = "application/json"
    write {"ended":true}.%ToJSON()
    quit $$$OK
}

ClassMethod MessagesLogList() As %Status
{
    quit ##class(IrisOps.MessagesLog).List(%request, %response)
}

ClassMethod MessagesLogRead(name As %String) As %Status
{
    quit ##class(IrisOps.MessagesLog).Read(%request, %response, name)
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

ClassMethod SnapshotList() As %Status
{
    quit ##class(IrisOps.Snapshot).List(%request, %response)
}

ClassMethod SnapshotCreate() As %Status
{
    quit ##class(IrisOps.Snapshot).Create(%request, %response)
}

ClassMethod SnapshotGet(id As %String) As %Status
{
    quit ##class(IrisOps.Snapshot).Get(%request, %response, id)
}

ClassMethod SnapshotRemove(id As %String) As %Status
{
    quit ##class(IrisOps.Snapshot).Remove(%request, %response, id)
}

}
