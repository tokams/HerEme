'use strict';

// Only public selectors with a known value format can enter either audit table.
const permitted = {
  post: /^-?\d{1,16}$/, message: /^\d{1,16}$/, version: /^\d{1,9}$/,
  from: /^\d{1,9}$/, to: /^\d{1,9}$/, page: /^\d{1,9}$/, limit: /^\d{1,5}$/,
  history: /^(?:1|)$/, sort: /^(?:new|hot|top)$/
};
function safeUrl(value, origin, referrer = false) {
  if (typeof value !== 'string' || value.length > 8192 || /[\\\s\x00-\x1f\x7f]/.test(value)) return null;
  if (!referrer && (!value.startsWith('/') || value.startsWith('//'))) return null;
  if (referrer && !/^https?:\/\//i.test(value)) return null;
  if (!URL.canParse(value, origin)) return null;
  const url = new URL(value, origin);
  if (url.origin !== origin || url.username || url.password) return null;
  if (referrer && !/^\/(?:|me|staff|chat(?:\/[\da-f-]{36})?|u\/[\da-f-]{36}|(?:privacy|terms|cookies|rules)\.html)$/.test(url.pathname)) return null;
  const kept = url.search.slice(1).split('&').filter(pair => {
    const entry = new URLSearchParams(pair).entries().next().value;
    return entry && Object.hasOwn(permitted, entry[0]) && permitted[entry[0]].test(entry[1]);
  });
  return {path:url.pathname, url:origin + url.pathname + (kept.length ? '?' + kept.join('&') : '')};
}
function securityUrls(req, config) {
  const origin = config.publicOrigin;
  const request = safeUrl(req.url, origin);
  return {request_url:request?.url ?? null, request_path:request?.path ?? null,
    referrer_url:safeUrl(req.headers.referer, origin, true)?.url ?? null};
}
module.exports = {securityUrls};
