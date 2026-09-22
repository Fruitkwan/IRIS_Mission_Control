Class IrisOps.Router Extends %CSP.REST
{

/// Serves the SPA entrypoint for the bare /irisops/ URL.
/// Static assets are handled by ServeFiles; this dispatch class only
/// handles paths that do not map to a file (the app root and any
/// client-side deep link).
XData UrlMap [ XMLNamespace = "http://www.intersystems.com/urlmap" ]
{
<Routes>
  <Route Url="/" Method="GET" Call="Index" />
  <Route Url="/health" Method="GET" Call="Health" />
  <Route Url="/api/cloud/test" Method="POST" Call="CloudTest" />
  <Route Url="/(.*)" Method="GET" Call="Serve" />
</Routes>
}

ClassMethod Index() As %Status
{
    quit ..SendFile("/irisops/index.html", "text/html")
}

/// Serves a deployed static file if it exists, otherwise falls back to
/// index.html so client-side routes survive a refresh or deep link.
ClassMethod Serve(path As %String) As %Status
{
    set file = $system.CSP.GetFileName("/irisops/" _ path)
    if ##class(%File).Exists(file), '##class(%File).DirectoryExists(file) {
        quit ..SendStream(file, ..ContentType(path))
    }
    quit ..Index()
}

ClassMethod SendFile(url As %String, contentType As %String) As %Status
{
    set file = $system.CSP.GetFileName(url)
    if '##class(%File).Exists(file) {
        set %response.Status = "404 Not Found"
        write "IrisOps web assets not deployed"
        quit $$$OK
    }
    quit ..SendStream(file, contentType)
}

ClassMethod SendStream(file As %String, contentType As %String) As %Status
{
    set %response.ContentType = contentType
    set %response.CharSet = "utf-8"
    set %response.Expires = 0
    set stream = ##class(%Stream.FileBinary).%New()
    do stream.LinkToFile(file)
    do stream.OutputToDevice()
    quit $$$OK
}

ClassMethod ContentType(path As %String) As %String
{
    set ext = $zcvt($piece(path, ".", *), "l")
    quit $case(ext,
        "js": "text/javascript",
        "css": "text/css",
        "svg": "image/svg+xml",
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "gif": "image/gif",
        "ico": "image/x-icon",
        "json": "application/json",
        "woff": "font/woff",
        "woff2": "font/woff2",
        "map": "application/json",
        "txt": "text/plain",
        : "text/html")
}

/// Container healthcheck endpoint: GET /irisops/health
ClassMethod Health() As %Status
{
    set %response.ContentType = "application/json"
    write "{""status"":""ok"",""product"":""irisops"",""iris"":""" _ $zv _ """}"
    quit $$$OK
}

ClassMethod CloudTest() As %Status
{
    quit ##class(IrisOps.CloudBroker).Test(%request, %response)
}

}
