# Backend & APIs: HTTP done properly
<!-- stage: stage-6 -->

> An API is a contract expressed in HTTP: which verb, which URL, which status code, which headers. This article covers the semantics that make an API predictable - methods, idempotency, status codes, caching, authentication - and the security mistakes that show up in every audit.

## URLs, routing and parameters
<!-- tags: url, routing, parameters, query-params, rest, api-design -->

A URL has an origin, a path and a query string. In a REST-style API the **path identifies a resource** and the **query string filters or shapes** the response:

```
GET /users/42                  the user with id 42
GET /users?role=admin&page=2   a filtered, paginated collection
GET /users/42/orders           orders belonging to that user
```

Routers match patterns with **path parameters**: `/users/:id` binds `id` from the URL. Order matters when patterns overlap - `/users/me` must be registered before `/users/:id`, or `me` is treated as an id. Query values arrive as **strings**: `?page=2` gives `"2"`, and `?active=false` gives the truthy string `"false"`. Parse and validate them.

Use plural nouns for collections, avoid verbs in paths (`POST /orders`, not `/createOrder`), and keep ids opaque to the client.

## HTTP methods, safety and idempotency
<!-- tags: http-methods, safety, idempotency, post, put, http -->

Each method carries a promise about side effects:

- **GET** - read. *Safe*: no side effects. Cacheable.
- **HEAD** - GET without a body.
- **POST** - create or perform an action. Not idempotent: two POSTs may create two things.
- **PUT** - replace the resource at this URL with this body. **Idempotent**: doing it twice leaves the same state.
- **PATCH** - partial update. Idempotent only if you design it so.
- **DELETE** - remove. Idempotent: the second call finds nothing, but the end state is the same.

**Idempotency** is what lets a client safely retry after a timeout. For POSTs that must not be duplicated (payments), accept an `Idempotency-Key` header: store the first response under that key and replay it for repeats. Stage 09 revisits this from the systems side.

## Status codes
<!-- tags: status-codes -->

The first digit is the story: **2xx** success, **3xx** redirect, **4xx** the client did something wrong, **5xx** the server did.

- `200 OK` - here is the thing. `201 Created` - and here is where it lives (`Location` header). `204 No Content` - done, nothing to return.
- `301` permanent / `302` temporary redirect. `304 Not Modified` - your cached copy is still good.
- `400 Bad Request` - malformed. `401 Unauthorized` - you are not authenticated (misnamed; it means *unauthenticated*). `403 Forbidden` - authenticated, but not allowed. `404 Not Found`. `409 Conflict` - the request clashes with current state. `422 Unprocessable` - well-formed but semantically invalid. `429 Too Many Requests`.
- `500 Internal Server Error` - a bug. `502 Bad Gateway` / `503 Service Unavailable` / `504 Gateway Timeout` - the thing behind the proxy is unhappy.

Never return `200` with `{ "error": ... }` in the body. Clients, proxies and monitoring all key off the status code.

## Headers, content negotiation and caching
<!-- tags: headers, content-negotiation, accept-header, caching, cache-control, etag -->

Headers are metadata. `Content-Type` says what the body is; the client's `Accept` header says what it can handle, and the server picks - **content negotiation**. `Content-Type: application/json; charset=utf-8` is the JSON default.

Caching is controlled by two mechanisms:

```
Cache-Control: max-age=60             fresh for 60s: reuse without asking
Cache-Control: no-store               never cache (sensitive data)
Cache-Control: no-cache               cache, but revalidate every time
ETag: "abc123"                        a fingerprint of this version
```

With an `ETag`, the client revalidates by sending `If-None-Match: "abc123"`; if nothing changed the server answers `304` with no body. `Last-Modified` / `If-Modified-Since` does the same by timestamp. Public GETs should be cacheable; anything per-user needs `Cache-Control: private` or `no-store`.

## Middleware and request pipelines
<!-- tags: middleware, ordering, express, cors, preflight -->

In Express-style frameworks, a request flows through a chain of **middleware** functions in registration order. Each one can read or change the request, respond, or call `next()` to pass it on. Order is behaviour:

```javascript
app.use(express.json());            // 1. parse the body first...
app.use(authenticate);              // 2. ...so auth can read it
app.use("/admin", requireAdmin);    // 3. scoped to a prefix
app.get("/users/:id", handler);     // 4. routes
app.use(notFound);                  // 5. nothing matched
app.use(errorHandler);              // 6. (err, req, res, next) - four args
```

An error handler has four parameters and must be registered last. Forgetting to call `next()` - or calling it after sending a response - hangs or double-sends. **CORS** is middleware too: it answers the browser's `OPTIONS` preflight and adds `Access-Control-Allow-*` headers; put it before the routes.

## Input validation and parsing
<!-- tags: input-validation, parsing, types, defensive-coding -->

Everything from the network is untrusted text. Validate shape *and* type at the edge, then work with clean data inside:

```javascript
function parseLimit(raw, { fallback = 20, max = 100 } = {}) {
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return fallback;
  return Math.min(n, max);
}
```

Reject unknown fields, cap sizes, and fail with `400` or `422` plus a message that names the field. Schema validators (Zod, Joi, JSON Schema) turn this into declarations. Never build queries or shell commands by string concatenation with user input - see the security section.

## Authentication: sessions, JWTs, password hashing
<!-- tags: authentication, sessions, jwt, password-hashing, bcrypt, salt -->

**Sessions**: the server stores state, the client holds an opaque session id in an `HttpOnly; Secure; SameSite` cookie. Easy to revoke; needs a shared store when you scale out.

**JWTs**: the server signs a token containing claims (user id, expiry); any server with the key can verify it without a database call. Stateless and scalable - but hard to revoke before expiry, so keep lifetimes short and pair with refresh tokens. A JWT is *signed*, not encrypted: anyone can read its payload.

Passwords are never stored. Store a **salted, slow hash** - bcrypt, scrypt or Argon2. The salt is random per user so identical passwords hash differently; the slowness (a tunable cost factor) is deliberate, to make brute force expensive.

```javascript
const hash = await bcrypt.hash(password, 12);      // salt is embedded in the hash
const ok   = await bcrypt.compare(password, hash);  // constant-time compare
```

Return the same `401` message for "no such user" and "wrong password"; different messages let attackers **enumerate users**.

## Common vulnerabilities (OWASP)
<!-- tags: owasp, sql-injection, idor, mass-assignment, user-enumeration -->

- **SQL injection** - user input spliced into a query. `"... WHERE id = " + id` with `id = "1 OR 1=1"` returns everything. Always use parameterised queries: `db.query("... WHERE id = $1", [id])`.
- **IDOR** (insecure direct object reference) - the URL says `/orders/42`, the user is authenticated, and nobody checks that order 42 is *theirs*. Authorisation must be per resource, not just per route.
- **Mass assignment** - `User.update(req.body)` lets a client send `{ "isAdmin": true }`. Whitelist the fields a request may set.
- **Missing rate limits** - login and password-reset endpoints without them are brute-force targets.

The OWASP Top Ten is the checklist; most entries are a missing check at a boundary.

## Rate limiting
<!-- tags: rate-limiting, token-bucket, algorithms -->

A **token bucket** holds up to `capacity` tokens and refills at `rate` per second. Each request takes one token; if the bucket is empty the request gets `429 Too Many Requests`, ideally with a `Retry-After` header. Bursts up to the capacity are allowed, sustained load is capped at the refill rate.

```javascript
function allow(bucket, now) {
  const elapsed = (now - bucket.last) / 1000;
  bucket.tokens = Math.min(bucket.capacity, bucket.tokens + elapsed * bucket.rate);
  bucket.last = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}
```

Key the bucket by user id or API key rather than IP where you can - many users share an IP behind NAT, and attackers rotate them.

## Pagination and errors
<!-- tags: pagination, off-by-one, error-handling -->

**Offset pagination** (`?page=3&limit=20` → skip 40) is simple but drifts when rows are inserted, and `OFFSET 100000` is slow. **Cursor pagination** (`?after=<last id>`) is stable and fast: "give me 20 rows with id > cursor". Return the next cursor in the response and stop when a page comes back short.

Off-by-one bugs live in `page` being 1-based while offsets are 0-based: `offset = (page - 1) * limit`, and a final page of exactly `limit` rows means you do not yet know whether there is another.

Errors should be consistent JSON - `{ "error": { "code": "VALIDATION", "message": "...", "field": "email" } }` - with the matching status code, and should never leak stack traces or SQL in production.
