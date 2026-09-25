Class IrisOps.Broker.Router Extends %CSP.REST
{

XData UrlMap [ XMLNamespace = "http://www.intersystems.com/urlmap" ]
{
<Routes>
  <Route Url="/api/cloud/test" Method="POST" Call="CloudTest" />
</Routes>
}

ClassMethod CloudTest() As %Status
{
    quit ##class(IrisOps.CloudBroker).Test(%request, %response)
}

}
