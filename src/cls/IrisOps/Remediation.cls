/// Records IRIS Doctor remediations in the IRIS audit log so changes made
/// from the portal are durable, attributable to the signed-in user and visible
/// to every administrator, not only in one browser.
Class IrisOps.Remediation Extends %RegisteredObject
{

Parameter EventSource = "IrisOps";

Parameter EventType = "Remediation";

/// POST /api/remediation/audit
/// Body: { action: "Apply"|"Rollback", ruleId, target, outcome: "verified"|"failed", changes: [{field,before,after}], detail? }
ClassMethod Record(request As %CSP.Request, response As %CSP.Response) As %Status
{
    set response.ContentType = "application/json"
    set response.CharSet = "utf-8"
    set response.Expires = 0
    try {
        set input = {}.%FromJSON(request.Content.Read(65536))
        set action = input.%Get("action")
        if (action'="Apply")&&(action'="Rollback") throw ##class(%Exception.General).%New("invalid-action")
        set ruleId = input.%Get("ruleId")
        if (ruleId="")||($length(ruleId)>64)||(ruleId'?1.(1L,1N,1"-")) throw ##class(%Exception.General).%New("invalid-rule")
        set outcome = input.%Get("outcome")
        if (outcome'="verified")&&(outcome'="failed") throw ##class(%Exception.General).%New("invalid-outcome")
        set target = $extract(input.%Get("target"), 1, 256)

        // Copy only the expected fields so arbitrary input is never written to the audit log.
        set data = {"ruleId":(ruleId), "target":(target), "outcome":(outcome), "changes":[]}
        set changes = input.%Get("changes")
        if $isobject(changes) {
            set iter = changes.%GetIterator()
            while iter.%GetNext(.i, .c) && (i<20) {
                if '$isobject(c) continue
                do data.changes.%Push({"field":($extract(c.%Get("field"),1,64)), "before":($extract(c.%Get("before"),1,128)), "after":($extract(c.%Get("after"),1,128))})
            }
        }
        if input.%Get("detail")'="" do data.%Set("detail", $extract(input.%Get("detail"), 1, 256))

        set description = "IRIS Doctor "_$zconvert(action,"l")_" "_ruleId_" on "_target_" ("_outcome_")"
        set written = ##class(IrisOps.Audit).Write(..#EventType, action, data, description)
        if 'written throw ##class(%Exception.General).%New("audit-not-written")
        set response.Status = "200 OK"
        write {"recorded":true, "event":(..#EventSource_"/"_..#EventType_"/"_action)}.%ToJSON()
    } catch ex {
        set response.Status = "422 Unprocessable Entity"
        write {"recorded":false, "detail":(..ErrorCode(ex))}.%ToJSON()
    }
    quit $$$OK
}

/// GET /api/remediation/history — the 50 most recent remediation audit records.
ClassMethod History(request As %CSP.Request, response As %CSP.Response) As %Status
{
    set response.ContentType = "application/json"
    set response.CharSet = "utf-8"
    set response.Expires = 0
    try {
        set rows = []
        new $namespace
        set $namespace = "%SYS"
        // Embedded SQL has no SQL-privilege check: the broker already requires %Admin_Secure,
        // which is what the classic portal requires to view audit records. Dynamic SQL would
        // also need SELECT on %SYS.Audit, which administrators with %Manager do not have.
        set source = ..#EventSource, type = ..#EventType
        &sql(DECLARE History CURSOR FOR
             SELECT TOP 50 UTCTimeStamp, Username, Event, Description, EventData
               INTO :ts, :user, :event, :desc, :data
               FROM %SYS.Audit
              WHERE EventSource = :source AND EventType = :type
              ORDER BY UTCTimeStamp DESC)
        &sql(OPEN History)
        if SQLCODE<0 throw ##class(%Exception.SQL).CreateFromSQLCODE(SQLCODE, $get(%msg))
        for {
            &sql(FETCH History)
            quit:SQLCODE'=0
            // UTC as ISO 8601 so browsers do not read it as local time.
            set entry = {"timestamp":($translate(ts, " ", "T")_"Z"), "username":(user), "action":(event), "description":(desc)}
            try { do entry.%Set("data", {}.%FromJSON(data)) } catch { }
            do rows.%Push(entry)
        }
        &sql(CLOSE History)
        set response.Status = "200 OK"
        write {"records":(rows)}.%ToJSON()
    } catch ex {
        set response.Status = "500 Internal Server Error"
        write {"records":[], "detail":(..ErrorCode(ex))}.%ToJSON()
    }
    quit $$$OK
}

ClassMethod ErrorCode(ex As %Exception.AbstractException) As %String
{
    if ex.%IsA("%Exception.General") && (ex.Name?1.(1L,1"-")) quit ex.Name
    if ex.%IsA("%Exception.StatusException") quit "audit-event-unavailable"
    quit "remediation-audit-failed"
}

}
