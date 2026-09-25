/// Time Machine (metrics) and Configuration Drift (config) snapshots, stored in
/// IRIS so they are durable, shared by every administrator and attributable.
Class IrisOps.Snapshot Extends %Persistent
{

/// Newest snapshots kept per kind; older ones are purged when a new one is saved.
Parameter RetainMetrics = 200;

Parameter RetainConfig = 50;

/// Largest accepted request body, in bytes.
Parameter MaxDataSize = 5000000;

Property Kind As %String(VALUELIST = ",metrics,config") [ Required ];

Property Label As %String(MAXLEN = 200);

/// UTC, ISO 8601 (e.g. 2026-09-25T19:34:03.421Z).
Property CreatedAt As %String [ Required ];

Property CreatedBy As %String(MAXLEN = 160) [ Required ];

Property Data As %Stream.GlobalCharacter;

Index KindCreated On (Kind, CreatedAt);

/// GET /api/snapshots?kind=metrics|config — newest first. Metrics include their
/// data; config snapshots are summaries (fetch one by id for its data).
ClassMethod List(request As %CSP.Request, response As %CSP.Response) As %Status
{
    do ..JsonResponse(response)
    try {
        set kind = request.Get("kind")
        if (kind'="metrics")&&(kind'="config") throw ##class(%Exception.General).%New("invalid-kind")
        set rows = []
        set rs = ##class(%SQL.Statement).%ExecDirect(, "SELECT ID FROM IrisOps.Snapshot WHERE Kind = ? ORDER BY CreatedAt DESC", kind)
        while rs.%Next() {
            do rows.%Push(..ToJson(..%OpenId(rs.ID), kind="metrics"))
        }
        write {"snapshots":(rows)}.%ToJSON()
    } catch ex {
        do ..Fail(response, ex)
    }
    quit $$$OK
}

/// GET /api/snapshots/:id
ClassMethod Get(request As %CSP.Request, response As %CSP.Response, id As %String) As %Status
{
    do ..JsonResponse(response)
    try {
        set snap = ..%OpenId(id)
        if '$isobject(snap) throw ##class(%Exception.General).%New("not-found")
        write ..ToJson(snap, 1).%ToJSON()
    } catch ex {
        do ..Fail(response, ex)
    }
    quit $$$OK
}

/// POST /api/snapshots  Body: { kind, label, data }
ClassMethod Create(request As %CSP.Request, response As %CSP.Response) As %Status
{
    do ..JsonResponse(response)
    try {
        if '$isobject(request.Content) throw ##class(%Exception.General).%New("invalid-data")
        if request.Content.Size>..#MaxDataSize throw ##class(%Exception.General).%New("too-large")
        set input = {}.%FromJSON(request.Content)
        set kind = input.%Get("kind")
        if (kind'="metrics")&&(kind'="config") throw ##class(%Exception.General).%New("invalid-kind")
        set data = input.%Get("data")
        if '$isobject(data) throw ##class(%Exception.General).%New("invalid-data")

        set snap = ..%New()
        set snap.Kind = kind
        set snap.Label = $extract(input.%Get("label"), 1, 200)
        set snap.CreatedAt = $translate($zdatetime($ztimestamp, 3, 1, 3), " ", "T")_"Z"
        set snap.CreatedBy = $username
        do data.%ToJSON(snap.Data)
        $$$ThrowOnError(snap.%Save())
        do ..Purge(kind)

        do ##class(IrisOps.Audit).Write("Snapshot", "Create", {"id":(snap.%Id()), "kind":(kind), "label":(snap.Label)}, "Captured "_kind_" snapshot "_snap.Label)
        set response.Status = "201 Created"
        write ..ToJson(snap, 1).%ToJSON()
    } catch ex {
        do ..Fail(response, ex)
    }
    quit $$$OK
}

/// DELETE /api/snapshots/:id
ClassMethod Remove(request As %CSP.Request, response As %CSP.Response, id As %String) As %Status
{
    do ..JsonResponse(response)
    try {
        set snap = ..%OpenId(id)
        if '$isobject(snap) throw ##class(%Exception.General).%New("not-found")
        set summary = {"id":(id), "kind":(snap.Kind), "label":(snap.Label), "createdBy":(snap.CreatedBy)}
        kill snap
        $$$ThrowOnError(..%DeleteId(id))
        do ##class(IrisOps.Audit).Write("Snapshot", "Delete", summary, "Deleted "_summary.kind_" snapshot "_summary.label)
        write {"deleted":true}.%ToJSON()
    } catch ex {
        do ..Fail(response, ex)
    }
    quit $$$OK
}

/// Keeps only the newest RetainMetrics / RetainConfig snapshots of a kind.
ClassMethod Purge(kind As %String)
{
    set keep = $select(kind="metrics":..#RetainMetrics, 1:..#RetainConfig)
    set rs = ##class(%SQL.Statement).%ExecDirect(, "SELECT ID FROM IrisOps.Snapshot WHERE Kind = ? ORDER BY CreatedAt DESC", kind)
    set n = 0
    while rs.%Next() {
        set n = n + 1
        if n>keep do ..%DeleteId(rs.ID)
    }
}

ClassMethod ToJson(snap As IrisOps.Snapshot, withData As %Boolean) As %DynamicObject
{
    set out = {"id":(snap.%Id()), "kind":(snap.Kind), "label":(snap.Label), "ts":(snap.CreatedAt), "createdBy":(snap.CreatedBy)}
    if withData && (snap.Data.Size>0) {
        do snap.Data.Rewind()
        do out.%Set("data", {}.%FromJSON(snap.Data))
    }
    quit out
}

ClassMethod JsonResponse(response As %CSP.Response)
{
    set response.ContentType = "application/json"
    set response.CharSet = "utf-8"
    set response.Expires = 0
}

ClassMethod Fail(response As %CSP.Response, ex As %Exception.AbstractException)
{
    set code = $select(ex.%IsA("%Exception.General")&&(ex.Name?1.(1L,1"-")):ex.Name, 1:"snapshot-failed")
    set response.Status = $case(code, "not-found":"404 Not Found", "snapshot-failed":"500 Internal Server Error", :"422 Unprocessable Entity")
    write {"detail":(code)}.%ToJSON()
}

}
