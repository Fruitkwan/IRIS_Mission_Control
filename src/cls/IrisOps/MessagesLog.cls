/// Read-only access to messages.log and the rotated messages.old_* files in the
/// manager directory, which the classic Management Portal cannot display
/// (Community Idea DPI-I-966: https://ideas.intersystems.com/ideas/DPI-I-966).
Class IrisOps.MessagesLog Extends %RegisteredObject
{

/// Most lines returned by one read.
Parameter MaxLines = 5000;

/// True only for messages.log and messages.old_<suffix>; anything else, including
/// any path separator, is refused so no other file can be read.
ClassMethod IsLogName(name As %String) As %Boolean
{
    quit (name="messages.log") || (name?1"messages.old_"1.(1AN,1"_",1"-",1"."))
}

/// GET /api/logs/messages — the log files, current first, then newest rotated first.
ClassMethod List(request As %CSP.Request, response As %CSP.Response) As %Status
{
    do ..JsonResponse(response)
    try {
        set dir = $system.Util.ManagerDirectory()
        set files = []
        set rs = ##class(%ResultSet).%New("%File:FileSet")
        $$$ThrowOnError(rs.Execute(dir, "messages*", "DateModified", 0))
        while rs.Next() {
            set name = ##class(%File).GetFilename(rs.Get("Name"))
            if (rs.Get("Type")'="F") || '..IsLogName(name) continue
            do files.%Push({"name":(name), "size":(rs.Get("Size")+0), "modified":(rs.Get("DateModified")), "current":(name="messages.log")})
        }
        write {"directory":(dir), "files":(..Ordered(files))}.%ToJSON()
    } catch ex {
        do ..Fail(response, ex)
    }
    quit $$$OK
}

/// GET /api/logs/messages/:name?lines=N — the last N lines of one file (default 500).
ClassMethod Read(request As %CSP.Request, response As %CSP.Response, name As %String) As %Status
{
    do ..JsonResponse(response)
    try {
        if '..IsLogName(name) throw ##class(%Exception.General).%New("invalid-file")
        set path = ##class(%File).NormalizeFilename(name, $system.Util.ManagerDirectory())
        if '##class(%File).Exists(path) throw ##class(%Exception.General).%New("not-found")
        set want = +request.Get("lines", 500)
        if (want<1) || (want>..#MaxLines) set want = ..#MaxLines

        // Keep a ring buffer of the last N lines while streaming through the file.
        set stream = ##class(%Stream.FileCharacter).%New()
        set stream.TranslateTable = "UTF8"
        $$$ThrowOnError(stream.LinkToFile(path))
        set total = 0
        while 'stream.AtEnd {
            set line = stream.ReadLine(32000)
            if stream.AtEnd && (line="") quit
            set total = total + 1
            set buf(total # want) = line
        }
        set lines = []
        set first = $select(total>want:total-want+1, 1:1)
        for i=first:1:total do lines.%Push(buf(i # want))
        write {"name":(name), "totalLines":(total), "truncated":(total>want), "lines":(lines)}.%ToJSON()
    } catch ex {
        do ..Fail(response, ex)
    }
    quit $$$OK
}

/// messages.log first, then rotated files newest first (their names sort by date).
ClassMethod Ordered(files As %DynamicArray) As %DynamicArray
{
    set out = [], sorted = ""
    set iter = files.%GetIterator()
    while iter.%GetNext(, .f) {
        if f.current { do out.%Push(f) } else { set sorted(f.name) = f }
    }
    set key = ""
    for { set key = $order(sorted(key), -1) quit:key=""  do out.%Push(sorted(key)) }
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
    set code = $select(ex.%IsA("%Exception.General")&&(ex.Name?1.(1L,1"-")):ex.Name, 1:"log-read-failed")
    set response.Status = $case(code, "not-found":"404 Not Found", "invalid-file":"400 Bad Request", :"500 Internal Server Error")
    write {"detail":(code)}.%ToJSON()
}

}
