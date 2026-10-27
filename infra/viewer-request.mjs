// The viewer-request CloudFront Function (cloudfront-js-2.0), kept as source here so the tests can run
// it with a stand-in for the key value store.
//
// The site answers on poapkings.com. Any www. host is a 301 to the same path and query on the apex,
// before anything else runs.
//
// Redirects are real 301s. Their map is the build's _redirects.json (every page the build writes with a
// meta refresh: /elixir-mcp/ and /discord/ today; eleventy.config.js collects them), copied into the
// distribution's key value store by each deploy, so a redirect page added to the build needs no
// infrastructure change. A redirect keeps the query string as the viewer sent it.
//
// S3 behind Origin Access Control serves no directory indexes, so "/roster/" is rewritten to its
// index.html and "/roster" is sent to the slash form. A path whose last segment has a dot is a file and
// passes through, and so do the extensionless files the build publishes (FILES, which a test keeps equal
// to the build; there are none).
export const FILES = [];

export const viewerRequestCode = `import cf from 'cloudfront';

const redirects = cf.kvs();
const files = ${JSON.stringify(Object.fromEntries(FILES.map((file) => [file, true])))};

function search(querystring) {
  var parts = [];
  for (var name in querystring) {
    var item = querystring[name];
    var values = item.multiValue ? item.multiValue : [item];
    for (var i = 0; i < values.length; i++) parts.push(values[i].value === '' ? name : name + '=' + values[i].value);
  }
  return parts.length ? '?' + parts.join('&') : '';
}

function moved(location) {
  return { statusCode: 301, statusDescription: 'Moved Permanently', headers: { location: { value: location } } };
}

async function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var host = request.headers.host ? request.headers.host.value.toLowerCase() : '';
  if (host.indexOf('www.') === 0) return moved('https://' + host.slice(4) + uri + search(request.querystring));
  if (files[uri]) return request;
  var bare = !uri.endsWith('/') && !uri.split('/').pop().includes('.');
  var path = bare ? uri + '/' : uri;
  if (path.endsWith('/') && path !== '/') {
    var to = null;
    try {
      to = await redirects.get(path);
    } catch (missing) {}
    if (to) return moved(to + search(request.querystring));
  }
  if (bare) return moved(path + search(request.querystring));
  if (uri.endsWith('/')) request.uri = uri + 'index.html';
  return request;
}
`;
