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

/// Origins the portal may call besides its own (the MCP sidecar by default).
/// Override per deployment, e.g. to add an external FHIR server:
///   set ^IrisOps("security","connect-src")="https://mcp.example.com https://fhir.example.com"
Parameter DefaultConnectSrc = "http://localhost:3333 http://127.0.0.1:3333";

/// Content-Security-Policy and related headers. Scripts may only come from this
/// application, which blocks injected inline or third-party scripts, the main way
/// an XSS attack would read the tokens the SPA keeps in browser storage.
ClassMethod SecurityHeaders()
{
    set connect = $get(^IrisOps("security","connect-src"), ..#DefaultConnectSrc)
    // Accept only URL-like origin lists; anything else falls back to the default.
    if connect'?.(1AN,1" ",1":",1"/",1".",1"-",1"*",1"[",1"]") set connect = ..#DefaultConnectSrc
    set csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "_
        "img-src 'self' data:; font-src 'self' data:; connect-src 'self' "_connect_"; "_
        "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
    do %response.SetHeader("Content-Security-Policy", csp)
    do %response.SetHeader("X-Content-Type-Options", "nosniff")
    do %response.SetHeader("X-Frame-Options", "DENY")
    do %response.SetHeader("Referrer-Policy", "same-origin")
    do %response.SetHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
}

ClassMethod SendStream(file As %String, contentType As %String) As %Status
{
    do ..SecurityHeaders()
    // Stream raw bytes: NoCharSetConvert stops CSP from translating the
    // payload (files are already UTF-8), and the charset is declared in the
    // Content-Type header instead so text/* still renders correctly.
    set %response.NoCharSetConvert = 1
    if contentType [ "text/" set contentType = contentType _ "; charset=utf-8"
    set %response.ContentType = contentType
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

}
