/// Writes IRIS Mission Control events to the IRIS audit log under the
/// user-defined source "IrisOps". Events are created and enabled on first use.
Class IrisOps.Audit Extends %RegisteredObject
{

Parameter EventSource = "IrisOps";

/// Returns 1 if the record was written (auditing on and the event enabled).
ClassMethod Write(type As %String, name As %String, data As %DynamicAbstractObject, description As %String) As %Boolean
{
    do ..EnsureEvent(type, name)
    quit $system.Security.Audit(..#EventSource, type, name, data.%ToJSON(), $extract(description, 1, 128))
}

ClassMethod EnsureEvent(type As %String, name As %String)
{
    new $namespace
    set $namespace = "%SYS"
    if '##class(Security.Events).Exists(..#EventSource, type, name) {
        set sc = ##class(Security.Events).Create(..#EventSource, type, name, "IRIS Mission Control "_$zconvert(type,"l")_" "_$zconvert(name,"l"), 1)
        if $$$ISERR(sc) throw ##class(%Exception.StatusException).CreateFromStatus(sc)
    }
}

}
