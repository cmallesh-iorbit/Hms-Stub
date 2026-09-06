# 🔐 Simple Bearer-Token Authentication — HAPI FHIR JPA Server

A deliberately **minimal** authentication layer for the HAPI FHIR server.

> Log in once → get an opaque token → send `Authorization: Bearer <token>` on every FHIR call.
> Missing / invalid / expired token → `HTTP 401`.

**No OAuth2. No JWT. No Keycloak. No external identity provider.** Just username/password → token.

---

## Table of contents

1. [What we built & why](#1-what-we-built--why)
2. [The key architectural idea](#2-the-key-architectural-idea)
3. [Project structure](#3-project-structure)
4. [File-by-file: responsibility, why, purpose](#4-file-by-file-responsibility-why-purpose)
5. [Request flow (sequence diagrams)](#5-request-flow-sequence-diagrams)
6. [Token lifecycle](#6-token-lifecycle)
7. [Endpoints & access rules](#7-endpoints--access-rules)
8. [Configuration](#8-configuration)
9. [Ports — everything is 8085](#9-ports--everything-is-8085)
10. [Running the project](#10-running-the-project)
11. [Testing — curl](#11-testing--curl)
12. [Testing — Postman (how the token flows)](#12-testing--postman-how-the-token-flows)
13. [Trade-offs](#13-trade-offs)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. What we built & why

The HAPI FHIR JPA starter ships **wide open** — anyone who can reach `/fhir/**` can read and write
clinical data. We needed a simple gate that:

| Requirement | How we met it |
|-------------|---------------|
| A login API that returns a token | `POST /auth/login` → `{ "token": "..." }` |
| Protect **all** FHIR APIs | Every `/fhir/**` request (incl. `/fhir/metadata`) requires a valid token |
| Reject bad/missing tokens | Returns a clean `HTTP 401` JSON body |
| No heavy auth stack | Plain Spring Security + an in-memory opaque-token store |

The whole design optimises for **simplicity and revocability** over standards-based federation.

---

## 2. The key architectural idea

> **HAPI's FHIR endpoint is a raw Servlet, not a Spring MVC controller.**

In [`Application.java`](src/main/java/ca/uhn/fhir/jpa/starter/Application.java), the `RestfulServer`
is registered as a Jakarta **servlet** mapped at `/fhir/*` via a `ServletRegistrationBean`.
Controller-level security (`@PreAuthorize`, MVC interceptors) **never runs** for it.

The only layer that sits in front of *every* servlet is the **servlet filter chain**, where Spring
Security installs `springSecurityFilterChain`. Our `TokenAuthFilter` lives there, so it intercepts
`/fhir/*` even though those URLs are served by non-Spring code. **That is the entire reason this
approach works.**

```
                        HTTP request
                             │
                             ▼
         ┌──────────────────────────────────────────┐
         │  springSecurityFilterChain (servlet filter)│
         │  └─ TokenAuthFilter validates Bearer token │   ← our code runs here
         │  └─ AuthorizationFilter checks the rule    │
         │  └─ on failure → RestAuthenticationEntryPoint → 401 JSON
         └──────────────────────────────────────────┘
                             │ (only if allowed)
          ┌──────────────────┼─────────────────────────┐
          ▼                  ▼                          ▼
    /fhir/*  servlet     /auth/*  →               /  → DispatcherServlet
    (HAPI RestfulServer) DispatcherServlet         (web tester UI / static)
                         → AuthController
```

---

## 3. Project structure

```
src/main/java/ca/uhn/fhir/jpa/starter/security/
├── SecurityConfig.java               # the Spring Security filter chain
├── TokenAuthFilter.java              # reads & validates the Bearer token per request
├── TokenService.java                 # issues / validates / revokes opaque tokens
├── AuthController.java               # POST /auth/login  &  POST /auth/logout
├── RestAuthenticationEntryPoint.java # turns auth failures into clean 401 JSON
├── AuthProperties.java               # binds hapi.auth.* config
└── dto/
    ├── LoginRequest.java             # { username, password }
    ├── LoginResponse.java            # { token, tokenType, expiresIn }
    └── ErrorResponse.java            # { status, error, message, timestamp }

Modified files:
├── pom.xml                           # + spring-boot-starter-security
├── src/main/resources/application.yaml  # + hapi.auth block, server.port: 8085
└── docker-compose.yml                # + HAPI_AUTH_* env, ports 8085:8085
```

---

## 4. File-by-file: responsibility, why, purpose

### `SecurityConfig.java` — the gate
- **Responsibility:** declares the single `SecurityFilterChain` bean that defines *who can reach
  what*.
- **Why it exists:** Spring Boot auto-detects this bean and uses it instead of the default
  "everything requires login" chain. It's the central place where the public allow-list, the
  stateless policy, CSRF, and our custom filter are wired together.
- **Key details:**
  - `sessionCreationPolicy(STATELESS)` — no `HttpSession`; auth is re-evaluated from the token on
    every request.
  - `csrf().disable()` — CSRF protection is for cookie/session browser flows; a stateless Bearer API
    doesn't use it.
  - **Public allow-list:** `/auth/login`, `/`, `/actuator/health`, `/fhir/swagger-ui/**`,
    `/fhir/api-docs/**`, static assets. **Everything else → `authenticated()`** (so all
    `/fhir/**` data APIs and `/fhir/metadata` are protected).
  - `dispatcherTypeMatchers(FORWARD, ERROR).permitAll()` — so when a permitted page errors
    internally and Spring forwards to `/error`, the security layer doesn't mask the real error with
    a misleading 401.
  - Inserts `TokenAuthFilter` before `UsernamePasswordAuthenticationFilter`.
  - Honors `hapi.auth.enabled=false` → permits everything (kill-switch without code changes).

### `TokenAuthFilter.java` — the per-request check
- **Responsibility:** on each request, read `Authorization: Bearer <token>`, validate it, and (if
  valid) mark the request as authenticated.
- **Why it exists:** this is the actual enforcement point that runs inside the servlet filter chain
  — the one layer that can guard HAPI's raw servlet (see §2).
- **Key details:**
  - Extends `OncePerRequestFilter` (guaranteed to run exactly once per request).
  - On a valid token it sets a `UsernamePasswordAuthenticationToken` (with a `ROLE_USER` authority)
    into the `SecurityContext`.
  - It **never rejects** the request itself — if the token is missing/invalid it simply leaves the
    context empty and lets the authorization rules + entry point decide. This keeps all rejection
    logic in one place and lets public paths through cleanly.

### `TokenService.java` — the token brain
- **Responsibility:** generate, store, validate and revoke tokens.
- **Why it exists:** isolates *all* token state and crypto behind a small API, so the rest of the
  code never touches raw randomness or the store — and so the store can later be swapped (e.g.
  Redis) without touching the filter or controller.
- **Key details:**
  - **Generation:** 32 bytes (256 bits) from `java.security.SecureRandom`, Base64-URL encoded → an
    **opaque** token (carries no decodable data, unlike a JWT).
  - **Storage:** in-memory `ConcurrentHashMap<token, (username, expiresAt)>`.
  - **Validation:** lookup; absent or past `expiresAt` → invalid (and evicted on access).
  - **Revocation:** `revoke()` removes the entry — instant, unlike a self-contained JWT.

### `AuthController.java` — the login/logout API
- **Responsibility:** expose `POST /auth/login` and `POST /auth/logout`.
- **Why it exists:** this is the only public door — it turns credentials into a token, and a token
  into "revoked." Served by the `DispatcherServlet` at `/auth/*` (doesn't collide with `/fhir/*`).
- **Key details:**
  - Validates the body (missing `username`/`password` → `400`).
  - Compares credentials against `AuthProperties` using **constant-time** comparison
    (`MessageDigest.isEqual`) to avoid timing side-channels.
  - Bad credentials → `401`; success → `200` with `{ token, tokenType, expiresIn }`.
  - `logout` reads the Bearer header and revokes that token → `204`.

### `RestAuthenticationEntryPoint.java` — the 401 formatter
- **Responsibility:** produce the response when an unauthenticated request hits a protected path.
- **Why it exists:** Spring Security's default would redirect to an HTML login page — wrong for an
  API. This returns a clean JSON body and a `WWW-Authenticate: Bearer` header instead.
- **Key details:** writes `ErrorResponse` JSON with status `401` and a helpful message
  ("Obtain one via POST /auth/login").

### `AuthProperties.java` — the config binding
- **Responsibility:** bind the `hapi.auth.*` settings into a typed object.
- **Why it exists:** keeps credentials and the token TTL out of source code and overridable by
  environment variables (so prod can inject a real password without recompiling).
- **Key details:** `enabled`, `username`, `password`, `tokenValiditySeconds`.

### DTOs (`dto/`)
- **`LoginRequest`** — the request body `{ username, password }`.
- **`LoginResponse`** — the success body `{ token, tokenType: "Bearer", expiresIn }`.
- **`ErrorResponse`** — the uniform error body `{ status, error, message, timestamp }` used for both
  login failures and 401s.
- **Why they exist:** explicit, self-documenting request/response shapes instead of raw maps; they
  make the API contract obvious and stable.

### Modified files
- **`pom.xml`** — adds `spring-boot-starter-security` (the only new dependency).
- **`application.yaml`** — adds the `hapi.auth` block and sets `server.port: 8085`.
- **`docker-compose.yml`** — injects `HAPI_AUTH_*` env vars and maps `8085:8085`.

---

## 5. Request flow (sequence diagrams)

**Login**
```
Client            AuthController        TokenService        Store
  │ POST /auth/login   │                    │                │
  │ {user,pass}        │                    │                │
  │───────────────────▶│ constant-time      │                │
  │                    │ compare vs config  │                │
  │                    │ issue(user) ──────▶│ token=random() │
  │                    │                    │ put ──────────▶│
  │ 200 {token,...}    │◀───────────────────│ token          │
  │◀───────────────────│                    │                │
        bad creds → 401 {error:"Invalid username or password."}
```

**Protected FHIR call**
```
Client       SecurityFilterChain   TokenAuthFilter   TokenService   HAPI servlet
  │ GET /fhir/Patient  │                 │                │              │
  │ Bearer <token>     │                 │                │              │
  │───────────────────▶│ run filter ────▶│ validate ─────▶│              │
  │                    │ setAuthentication◀────────────── valid+user     │
  │                    │ authorized? ✓ ─────────────────────────────────▶│
  │ 200 + Bundle       │◀───────────────────────────────────────────────│
  │◀───────────────────│                                                 │
   missing/invalid/expired → RestAuthenticationEntryPoint → 401 (servlet never reached)
```

---

## 6. Token lifecycle

```
 login ──▶ [ active token in map, expiresAt = now + TTL ]
              │                         │                      │
        used on requests          TTL elapses            logout called
              │                         │                      │
              ▼                         ▼                      ▼
        authenticated            expired → evicted        revoked → removed
                                  → 401 next use           → 401 next use
```

- TTL is `hapi.auth.token-validity-seconds` (default **3600s**; `0` = never expires).
- Tokens live **in memory** → a server/container restart clears them (just log in again).

---

## 7. Endpoints & access rules

| Method | Path | Access |
|--------|------|--------|
| `POST` | `/auth/login` | 🟢 **public** — returns a token |
| `POST` | `/auth/logout` | 🔒 revokes the presented token (`204`) |
| `GET`/`POST`/`PUT`/`DELETE` | `/fhir/**` (Patient, Observation, Encounter, …) | 🔒 token required |
| `GET` | `/fhir/metadata` | 🔒 protected |
| `GET` | `/` (web tester UI) | 🟢 public |
| `GET` | `/fhir/swagger-ui/**`, `/fhir/api-docs/**` | 🟢 public |
| `GET` | `/actuator/health` | 🟢 public |

---

## 8. Configuration

`application.yaml`:
```yaml
hapi:
  auth:
    enabled: true
    username: ${HAPI_AUTH_USERNAME:admin}
    password: ${HAPI_AUTH_PASSWORD:admin123}
    token-validity-seconds: ${HAPI_AUTH_TOKEN_TTL:3600}   # 0 = never expires
```

Docker (`docker-compose.yml`, app service `environment:`):
```yaml
HAPI_AUTH_ENABLED: "true"
HAPI_AUTH_USERNAME: "admin"
HAPI_AUTH_PASSWORD: "admin123"      # change me in production
HAPI_AUTH_TOKEN_TTL: "3600"
```

- Set `enabled: false` (or `HAPI_AUTH_ENABLED=false`) to reopen the server with zero code changes.
- Always override `HAPI_AUTH_PASSWORD` via env in production — never ship the default.

---

## 9. Ports — everything is 8085

`server.port: 8085` in `application.yaml` makes the app listen on **8085** in *all* modes.

| Mode | App listens on | Compose mapping | You call |
|------|----------------|-----------------|----------|
| Docker | container `8085` | `8085:8085` | `http://localhost:8085` |
| Local Maven | `8085` | — | `http://localhost:8085` |

> ⚠️ The app port (`server.port`) and the compose mapping **must agree**. If they drift (e.g. app on
> 8085 but compose maps `8085:8080`), Docker accepts the connection then drops it → **"socket hang
> up"**. See [Troubleshooting](#14-troubleshooting).

---

## 10. Running the project

### Option A — Docker (port 8085)
```bash
cd /home/user/IdeaProjects/hapi-fhir-jpaserver-starter

# build the image (compiles the auth code) and start app + Postgres
docker compose up --build -d        # or: docker-compose up --build -d

# follow logs until "Started Application"
docker compose logs -f hapi-fhir-jpaserver-start

# stop
docker compose down                 # keep DB volume   (down -v to wipe)
```

> **Rebuild rule:** changed Java / `application.yaml` / `pom.xml` → `up -d --build`.
> Changed only `docker-compose.yml` (ports/env) → `up -d` is enough.

### Option B — Local (Maven, port 8085)
```bash
mvn spring-boot:run                 # or: java -jar target/ROOT.war
# server: http://localhost:8085/fhir      UI: http://localhost:8085/
```

---

## 11. Testing — curl

```bash
# 1 · log in → get a token
curl -s -X POST http://localhost:8085/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
# → {"token":"...","tokenType":"Bearer","expiresIn":3600}

# 2 · capture it
TOKEN=$(curl -s -X POST http://localhost:8085/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r .token)

# 3 · authenticated read → 200 + Bundle
curl -i http://localhost:8085/fhir/Patient -H "Authorization: Bearer $TOKEN"

# 4 · no token → 401     |  5 · wrong token → 401
curl -i http://localhost:8085/fhir/Patient
curl -i http://localhost:8085/fhir/Patient -H "Authorization: Bearer nope"

# 6 · bad credentials → 401
curl -i -X POST http://localhost:8085/auth/login \
  -H "Content-Type: application/json" -d '{"username":"admin","password":"wrong"}'

# 7 · logout (revoke) → 204
curl -i -X POST http://localhost:8085/auth/logout -H "Authorization: Bearer $TOKEN"
```

---

## 12. Testing — Postman (how the token flows)

Import **`HAPI FHIR R4 - Core APIs.postman_collection.json`** (already auth-wired, points at 8085).

**The token is NOT typed into each request's Headers tab — it's set once at the collection level and
inherited.** Here's the chain:

```
Run "Auth → Login (get token)"
   └─ post-response script: pm.collectionVariables.set("token", body.token)
        └─ stores it in the {{token}} collection variable
              └─ Collection → Authorization tab = Bearer Token, value {{token}}
                    └─ every FHIR request = "Inherit auth from parent"
                          └─ Postman auto-adds the header at send time:
                             Authorization: Bearer <token>
```

Steps:
1. Run **Auth → Login (get token)** once — token is stored in `{{token}}`.
2. Run any FHIR request — the Bearer header is added automatically.
3. Optional checks: **Login - bad credentials** → 401, **Get Patient - NO token** → 401.

**Why you don't see the header in the Headers tab:** Postman auto-generates it from the Authorization
tab. To confirm it's being sent: open **Postman Console** (`Ctrl/Cmd+Alt+C`), send a request, and
look under *Request Headers* — you'll see `Authorization: Bearer ...`. (Or click the "hidden headers"
toggle in the Headers tab.)

Collection variables (shipped at 8085):

| Variable | Value |
|----------|-------|
| `serverUrl` | `http://localhost:8085` |
| `baseUrl` | `http://localhost:8085/fhir` |

---

## 13. Trade-offs

**Pros**
- Tiny footprint — one dependency, no JWT/OAuth machinery.
- Instant revocation (delete the entry → token is dead).
- Opaque tokens leak no decodable data if intercepted.
- One choke point secures the HAPI servlet *and* Spring MVC.
- Easy to read, test, and reason about.

**Cons**
- In-memory store: tokens vanish on restart and aren't shared across instances — scaling needs a
  shared store (Redis/DB) or sticky sessions.
- Coarse-grained: a single admin identity, no roles/scopes/per-resource rules.
- A bearer credential is only as safe as the transport — **HTTPS is mandatory** in production.
- No standard client tooling, unlike SMART/OAuth.

---

## 14. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| **"socket hang up" / empty reply** | App listens on a different port than the compose mapping forwards to (app `8085` vs map `8085:8080`). | Make them agree — map `8085:8085`, then `docker-compose up -d`. |
| **401 on every FHIR call in Postman** | `{{token}}` is empty — you didn't run **Auth → Login** yet, or the token expired/was revoked. | Run **Auth → Login** again. |
| **401 on `/fhir/metadata`** | Expected — metadata is protected by design. | Send the Bearer token, or move it to the public list in `SecurityConfig` if you want it open. |
| **Web tester UI at `/` shows an error** | Pre-existing: the bundled tester renders a Thymeleaf template and calls the now-protected `/fhir/metadata` without a token. Not caused by auth. | Use the REST API / Postman / Swagger; the tester UI isn't required. |
| **`docker-compose` Python traceback (`ContainerConfig`)** | Known bug in docker-compose **v1** recreating over an existing container. | `docker rm -f hapi-fhir-jpaserver-start`, then `docker-compose up -d`. |
