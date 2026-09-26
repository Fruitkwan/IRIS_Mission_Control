/// Post-install configuration, run by the ZPM module (see module.xml).
Class IrisOps.Setup Extends %RegisteredObject
{

/// Audit events IRIS Mission Control writes. Creating them at install time
/// avoids changing security configuration at runtime.
Parameter AuditEvents = "Remediation:Apply,Remediation:Rollback,Snapshot:Create,Snapshot:Delete";

ClassMethod Configure() As %Status
{
    set sc = $$$OK
    try {
        for i=1:1:$length(..#AuditEvents, ",") {
            set event = $piece(..#AuditEvents, ",", i)
            do ##class(IrisOps.Audit).EnsureEvent($piece(event, ":", 1), $piece(event, ":", 2))
        }
        new $namespace
        set $namespace = "%SYS"
        // The broker authenticates once and keeps a CSP session cookie:
        // HttpOnly (IRIS default), SameSite=Strict, scoped to /irisops-broker/.
        if ##class(Security.Applications).Exists("/irisops-broker") {
            set props("SessionScope") = 2
            set props("UseCookies") = 2
            set props("CookiePath") = "/irisops-broker/"
            set props("JWTAuthEnabled") = 0
            set props("Timeout") = 3600
            $$$ThrowOnError(##class(Security.Applications).Modify("/irisops-broker", .props))
        }
    } catch ex {
        set sc = ex.AsStatus()
    }
    quit sc
}

}
