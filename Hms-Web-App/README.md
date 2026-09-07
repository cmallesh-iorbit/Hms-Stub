# HMS Web App — Appointment Booking UI

A small web front-end for the HAPI FHIR JPA server that lives in the parent directory of this repo.

> **Status: BUILT AND VERIFIED.** Both features are implemented and working against the deployed
> server. This document was originally the plan; it now doubles as the reference for what was built.
> See [section 17](#17-build-status--verification-results) for what was actually tested.

**Quick start:** `npm install && npm run dev` → <http://localhost:5173> → sign in `admin` / `admin123`.

**Backend:** the already-deployed server at `http://139.59.46.163:8085` (FHIR base
`http://139.59.46.163:8085/fhir`). Nothing runs locally except this web app. Every API contract in
this document was executed live against that server — results are shown inline.

---

## Table of contents

1. [Scope — what this app does (and does not) do](#1-scope--what-this-app-does-and-does-not-do)
2. [The backend it talks to](#2-the-backend-it-talks-to)
3. [Verified API contracts](#3-verified-api-contracts)
4. [Tech stack and why](#4-tech-stack-and-why)
5. [Directory layout](#5-directory-layout)
6. [Screens and user flow](#6-screens-and-user-flow)
7. [Appointment form — field specification](#7-appointment-form--field-specification)
8. [The FHIR payload we build](#8-the-fhir-payload-we-build)
9. [Authentication and token handling](#9-authentication-and-token-handling)
10. [The CORS problem and how we avoid it](#10-the-cors-problem-and-how-we-avoid-it)
11. [Configuration](#11-configuration)
12. [How you will run it](#12-how-you-will-run-it)
13. [Error handling and validation](#13-error-handling-and-validation)
14. [What is deliberately out of scope](#14-what-is-deliberately-out-of-scope)
15. [Decisions I made for you — confirm or override](#15-decisions-i-made-for-you--confirm-or-override)
16. [Note on the deployed server](#16-note-on-the-deployed-server)
17. [Build status & verification results](#17-build-status--verification-results)
18. [**Field mapping reference — UI label ↔ FHIR field**](#18-field-mapping-reference--ui-label--fhir-field)

---

## 1. Scope — what this app does (and does not) do

Exactly **two** features, as agreed:

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Login** | User enters username + password, we exchange them for a Bearer token via `POST /auth/login`. |
| 2 | **Create Appointment** | An authenticated form that collects the details a FHIR `Appointment` needs and `POST`s it to `/fhir/Appointment`. |

Everything else — patient registration, practitioner management, appointment lists, editing,
cancelling, dashboards, reports — is **not** in this build. The code will be structured so those
can be added later without rework, but they will not be implemented now.

---

## 2. The backend it talks to

This app is a **pure client**. It requires **zero changes to the Java backend**.

It talks to the **already-running deployed server** — the same code as this repo, line for line.
**You do not need to run the backend on your laptop.** Only `npm run dev` runs locally.

| Thing | Value |
|-------|-------|
| Server root | `http://139.59.46.163:8085` |
| FHIR base | `http://139.59.46.163:8085/fhir` |
| Auth endpoints | `http://139.59.46.163:8085/auth/login`, `.../auth/logout` |
| FHIR version | **R4** |
| Auth scheme | Opaque Bearer token (see `AUTHENTICATION.md` in the repo root) |
| Credentials | `admin` / `admin123` (from `HAPI_AUTH_USERNAME` / `HAPI_AUTH_PASSWORD`) |
| Token lifetime | 3600 s (confirmed: `expiresIn: 3600`) |

The server URL appears in **exactly one place** (`vite.config.ts`, fed by one env var), so switching
between the deployed server, a different host, or a laptop backend is a one-line change. Nothing is
hard-coded in application code.

Every `/fhir/**` call — including `/fhir/metadata` — requires `Authorization: Bearer <token>`.
A missing, wrong, or expired token returns a JSON `401`.

### Data already on the deployed server

Verified live, so the pickers will have real records to work with from day one:

| Resource | Count on server |
|----------|-----------------|
| `Patient` | **48** |
| `Practitioner` | **83** |
| `Appointment` | **399** |

Sample records: patients are `Patient40 / P040` with MRNs like `MRN-040`; practitioners are
`Dr. Priyansh Mehta` (`DOC-001`), `RN Anita Patel` (`NRS-001`). Practitioner ids are numeric
(`1001`, `1002`, …), patient ids likewise (`1826`, `1823`, …).

> **Plain HTTP over a public IP.** Credentials and Bearer tokens will cross the internet
> unencrypted, and the browser will flag the site as insecure. Fine for development and testing.
> Before this is used with real patient data it needs TLS in front of it — see
> [section 16](#16-note-on-the-deployed-server).

---

## 3. Verified API contracts

Read out of the backend source, then **executed live against `139.59.46.163:8085`** to confirm the
deployed server actually behaves this way. Every response below is a real one.

### 3.1 Login — `POST /auth/login`

Request (`Content-Type: application/json`, **no** auth header):

```json
{ "username": "admin", "password": "admin123" }
```

Success `200` — **actual response from the deployed server:**

```json
{ "token": "aOYVRYJ9-Y3gPZHqJAowg5jwDNcImM76tKJ5vwC7fYM", "tokenType": "Bearer", "expiresIn": 3600 }
```

The token is 43 characters of Base64-URL (256 bits of entropy), opaque — nothing to decode.

Failure `401` (also `400` if a field is blank):

```json
{
  "status": 401,
  "error": "Unauthorized",
  "message": "Invalid username or password.",
  "timestamp": "2026-09-06T18:20:11.482Z"
}
```

### 3.2 Logout — `POST /auth/logout`

Header `Authorization: Bearer <token>` returns `204 No Content`. The token is revoked server-side.

### 3.3 / 3.4 Patient and Practitioner lookup — the pickers

Both pickers accept **three kinds of input** and fire the matching lookups **in parallel**, merging
the results. The user does not have to know which kind of thing they are holding — a name from a
chart, the numeric id echoed back when the record was created, or the hospital's own MRN/DOC code
all work in the same box.

| You type | Query sent | Verified on the server |
|----------|------------|------------------------|
| `Kiran` | `Patient?name:contains=Kiran&_count=20` | 12 hits |
| `1173` | `Patient?_id=1173` | 1 hit — *Kohli Kiran* |
| `MRN-205` | `Patient?identifier=MRN-205&_count=20` | 1 hit |
| `Megha` | `Practitioner?name:contains=Megha&_count=20` | 2 hits |
| `1174` | `Practitioner?_id=1174` | 1 hit — *Dr. Priyansh Megha* |
| `DOC-505` | `Practitioner?identifier=DOC-505&_count=20` | 1 hit |

An empty box lists recent records (`Patient?_count=20&_sort=-_lastUpdated`, `Practitioner?_count=20`).

**Which lookups actually run.** Only the plausible ones: `_id` only when the text is all digits,
`identifier` only when it contains a digit or a dash. Typing `Kiran` fires one request, not three.

**Ordering.** Exact matches (`_id`, then `identifier`) are merged ahead of name matches, so the
unambiguous hit is the first row. Duplicates across lookups are removed by id.

**Failure isolation.** If one lookup errors the others still render — a broken id search never
blanks out working name results. A `401` is deliberately *not* swallowed, so an expired session
still ends the session properly.

> **Why `:contains` and not plain `name=`.** Tested live: FHIR's default `name` search is
> **prefix**-matched, so typing "eht" finds nothing while "Meht" finds 18 practitioners. The
> `:contains` modifier **is** supported here (`name:contains=eht` → 18 hits), which is what people
> expect from a search box.
>
> **A missing id is not an error.** `Patient?_id=99999999` returns `HTTP 200` with `total: 0`, so a
> mistyped id shows "No matches" rather than an error banner.

Each result row shows the id in its subtitle — `id 1173 · MRN-205 · male · 1990-05-15` — so you can
confirm you picked the right record before booking.

### 3.5 Create appointment — `POST /fhir/Appointment`

Headers: `Authorization: Bearer <token>`, `Content-Type: application/fhir+json`.
Success is `201 Created`; the new resource id comes back in the `Location` header and in the
response body's `id` field.

---

## 4. Tech stack and why

| Layer | Choice | Reason |
|-------|--------|--------|
| Framework | **React 18** | Standard for form-driven internal tools; easy for anyone to pick up later. |
| Language | **TypeScript** | FHIR payloads are deeply nested. Types catch mapping mistakes at compile time instead of as a `422` from the server. |
| Build tool | **Vite 5** | Instant dev server, and — critically — its built-in **dev proxy solves our CORS problem** (see §10). |
| Routing | **react-router-dom v6** | Two routes plus an auth guard. |
| HTTP | **native `fetch`** wrapped in a tiny `apiClient` | No axios dependency needed; one place to inject the token and catch `401`s. |
| Styling | **Plain CSS modules** | No Tailwind/MUI build weight for two screens. Clean, readable, no framework lock-in. |
| State | **React Context** for auth, local state for the form | Redux would be overkill at this size. |

Your machine already has **Node v24.15.0** and **npm 11.12.1**, so nothing extra to install.

**No backend dependency is added.** This directory is self-contained; Maven will not pick it up
because it sits outside `src/`. I will add `Hms-Web-App/node_modules/` to the repo `.gitignore`.

---

## 5. Directory layout

```
Hms-Web-App/
├── README.md                      <- this file
├── package.json
├── tsconfig.json
├── vite.config.ts                 <- dev proxy config (section 10)
├── .env.example                   <- copy to .env.local to override the backend URL
├── index.html
└── src/
    ├── main.tsx                   App bootstrap + router
    ├── App.tsx                    Route table + <ProtectedRoute>
    ├── api/
    │   ├── client.ts              fetch wrapper: base URL, Bearer header, 401 handling
    │   ├── auth.ts                login() / logout()
    │   └── fhir.ts                searchPatients(), searchPractitioners(), createAppointment()
    ├── auth/
    │   ├── AuthContext.tsx        token state, login/logout, session persistence
    │   └── ProtectedRoute.tsx     redirects to /login when there is no valid token
    ├── pages/
    │   ├── LoginPage.tsx          Feature 1
    │   └── NewAppointmentPage.tsx Feature 2
    ├── components/
    │   ├── ResourcePicker.tsx     reusable search-and-select (patient + practitioner)
    │   ├── FormField.tsx          label + input + inline error
    │   └── Alert.tsx              success / error banner
    ├── types/
    │   └── fhir.ts                minimal R4 types: Bundle, Patient, Practitioner, Appointment
    ├── utils/
    │   ├── datetime.ts            date + time + duration -> ISO string with local offset
    │   └── humanName.ts           FHIR HumanName -> "Dr. Priya Mehta"
    └── styles/
        └── *.css
```

---

## 6. Screens and user flow

```
   +--------------+   valid creds    +------------------------+
   |  /login      | ---------------> |  /appointments/new     |
   |              |                  |                        |
   |  username    |   401 / blank    |  Appointment form      |
   |  password    | <--------------- |  [ Create Appointment ]|
   |  [ Sign in ] |  token expired   |                        |
   +--------------+                  +-----------+------------+
                                                 | 201 Created
                                                 v
                                     +------------------------+
                                     | Success banner:        |
                                     | "Appointment ABC-123   |
                                     |  created."             |
                                     | [Create another]       |
                                     +------------------------+
```

**Screen 1 — Login (`/login`)**
Centred card. Username, password (masked), Sign in button. Shows the server's error message
verbatim on failure. Button disables and shows a spinner while the request is in flight.
If a valid token already exists in session storage, this route redirects straight to the form.

**Screen 2 — New Appointment (`/appointments/new`)**
Header bar showing the logged-in username and a **Logout** button. Below it, the appointment form
grouped into three sections: **Who** (patient, practitioner), **When** (date, time, duration), and
**Details** (status, type, service, specialty, reason, comment). One primary
**Create Appointment** button plus a **Reset** link.

On success: a green banner with the new appointment id and a **Create another** button that clears
the form but keeps the date. On failure: a red banner with the server's `OperationOutcome` message.

---

## 7. Appointment form — field specification

Derived from the FHIR R4 `Appointment` resource and the working example in
`HAPI FHIR R4 - Core APIs.postman_collection.json`.

| Field | Control | Required | Default | Maps to |
|-------|---------|:--------:|---------|---------|
| **Patient** | Search-and-select (typeahead on name / MRN) | Yes | — | `participant[0].actor.reference` = `Patient/{id}` |
| **Practitioner (Doctor)** | Search-and-select (typeahead on name) | Yes | — | `participant[1].actor.reference` = `Practitioner/{id}` |
| **Date** | Date picker | Yes | **today** | date half of `start` / `end` |
| **Start time** | Time picker (15-min steps) | Yes | next half hour | time half of `start` |
| **Duration** | Dropdown: 15 / 30 / 45 / 60 min | Yes | 30 min | computes `end`; also sets `minutesDuration` |
| **Pod ID** | Text input | No | — | `identifier[0].value` (system `http://hospital.org/pod-id`) |
| **Status** | Dropdown | Yes | `booked` | `status` |
| **Appointment type** | Dropdown | No | `ROUTINE` | `appointmentType.coding[0]` |
| **Service type** | Dropdown | No | Consultation | `serviceType[0].coding[0]` |
| **Specialty** | Dropdown | No | General practice | `specialty[0].coding[0]` |
| **Reason** | Dropdown + free text | No | — | `reasonCode[0].coding[0]` |
| **Description** | Text input | No | — | `description` |
| **Comment** | Textarea | No | — | `comment` |

### Dropdown value sets (fixed lists, hard-coded — no terminology server call)

**Status** (`http://hl7.org/fhir/appointmentstatus`)
`proposed`, `pending`, **`booked`** *(default)*, `arrived`, `checked-in`, `fulfilled`, `cancelled`,
`noshow`, `waitlist`

**Appointment type** (`http://terminology.hl7.org/CodeSystem/v2-0276`)
`ROUTINE` — Routine appointment *(default)* · `WALKIN` — Previously unscheduled walk-in visit ·
`CHECKUP` — A routine check-up · `FOLLOWUP` — A follow-up visit · `EMERGENCY` — Emergency appointment

**Service type** (SNOMED CT)
`11429006` Consultation *(default)* · `394701000` Follow-up · `410620009` Well child visit ·
`50849002` Emergency room admission

**Specialty** (SNOMED CT)
`394814009` General practice *(default)* · `394579002` Cardiology · `394582007` Dermatology ·
`394537008` Pediatrics · `394589003` Neurology · `394612005` Obstetrics and gynecology ·
`394801008` Trauma and orthopedics

**Reason** (SNOMED CT)
`386661006` Fever · `25064002` Headache · `29857009` Chest pain · `49727002` Cough ·
`422587007` Nausea · plus a **free-text** option that writes `reasonCode[0].text` instead of a coding

> These lists are small, editable constants in one file. Tell me which codes your hospital actually
> uses and I will swap them.

---

## 8. The FHIR payload we build

For a form filled in with patient `12`, practitioner `7`, 6 Sep 2026, 09:00, 30 min, the app sends:

```http
POST http://139.59.46.163:8085/fhir/Appointment
Authorization: Bearer <token>
Content-Type: application/fhir+json
```

```json
{
  "resourceType": "Appointment",
  "status": "booked",
  "appointmentType": {
    "coding": [{
      "system": "http://terminology.hl7.org/CodeSystem/v2-0276",
      "code": "ROUTINE",
      "display": "Routine appointment"
    }]
  },
  "serviceType": [{
    "coding": [{ "system": "http://snomed.info/sct", "code": "11429006", "display": "Consultation" }]
  }],
  "specialty": [{
    "coding": [{ "system": "http://snomed.info/sct", "code": "394814009", "display": "General practice" }]
  }],
  "reasonCode": [{
    "coding": [{ "system": "http://snomed.info/sct", "code": "386661006", "display": "Fever" }]
  }],
  "description": "OPD consultation",
  "start": "2026-09-06T09:00:00+05:30",
  "end": "2026-09-06T09:30:00+05:30",
  "minutesDuration": 30,
  "comment": "First visit. Patient has had fever for 3 days.",
  "participant": [
    {
      "actor": { "reference": "Patient/12", "display": "Rahul Sharma" },
      "required": "required",
      "status": "accepted"
    },
    {
      "actor": { "reference": "Practitioner/7", "display": "Dr. Priya Mehta" },
      "required": "required",
      "status": "accepted"
    }
  ]
}
```

**This shape is confirmed against reality, not inferred.** An appointment already stored on the
deployed server (`Appointment/1837`) uses precisely these fields, the same code systems, and the
same `+05:30` offsets:

```json
"status": "fulfilled",
"serviceType":     [{ "coding": [{ "system": "http://snomed.info/sct", "code": "11429006", "display": "Consultation" }] }],
"specialty":       [{ "coding": [{ "system": "http://snomed.info/sct", "code": "394814009", "display": "General practice" }] }],
"appointmentType":  { "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/v2-0276", "code": "ROUTINE", "display": "Routine appointment" }] },
"reasonCode":      [{ "coding": [{ "system": "http://snomed.info/sct", "code": "386661006", "display": "Fever" }] }],
"start": "2026-09-04T19:20:00+05:30",
"end":   "2026-09-04T20:00:00+05:30"
```

So the defaults in section 7 match what your server is already accepting. One extra field appears on
that record which the form will **not** send: an `identifier` with system
`http://hospital.org/pod-id`. If appointments in your system are supposed to carry a business
identifier, tell me and I will add a field for it.

**Rules the builder follows:**

- Optional fields that the user left blank are **omitted entirely** — never sent as `null` or `""`,
  which FHIR validation rejects.
- `start` / `end` are ISO-8601 **with the browser's local UTC offset** (e.g. `+05:30`), matching the
  format already used in the Postman collection.
- `end` is always `start + duration`, so the two can never disagree.
- Both participants get `"required": "required"` and `"status": "accepted"`, matching the example.

---

## 9. Authentication and token handling

- On successful login we store `{ token, username, expiresAt }` in **`sessionStorage`**.
- `expiresAt` is computed client-side as `now + expiresIn` so we can pre-emptively treat the token
  as dead instead of waiting for a `401`.
- `sessionStorage` (not `localStorage`) means the token dies when the tab closes — a reasonable
  default for a clinical app on a shared workstation. It survives page refresh, so the user is not
  kicked out mid-form.
- **Every** `/fhir/**` request goes through `apiClient`, which attaches the header and, on any
  `401`, clears the session and redirects to `/login` with the message
  *"Your session has expired. Please sign in again."*
- Logout calls `POST /auth/logout` (so the token is genuinely revoked server-side, not just
  forgotten by the browser) and then clears session storage.

> **Honest security note:** because the backend's tokens are opaque and held in an in-memory map,
> they are lost on server restart and not shared across instances. If the server restarts while a
> user is on the form, their next submit gets a `401` and they will be sent back to login. That is
> a backend property, not something this UI can fix. `sessionStorage` is also readable by any script
> on the page, so this is dev-grade, not hardened-against-XSS.

---

## 10. The CORS problem and how we avoid it

**This is the single most important section in this document. Read it.**

Now that the backend is on a different host from your browser, this stopped being theoretical.
I tested the deployed server directly, and **the browser cannot call it at all**:

```
OPTIONS http://139.59.46.163:8085/auth/login       Origin: http://localhost:5173
  -> HTTP/1.1 403    "Invalid CORS request"

OPTIONS http://139.59.46.163:8085/fhir/Appointment  Origin: http://localhost:5173
  -> HTTP/1.1 403    "Invalid CORS request"
```

**Both endpoints reject the browser's preflight.** Not just `/auth` — `/fhir` too.

**Why.** The backend's CORS support is a HAPI `CorsInterceptor` registered on the `RestfulServer`
(`StarterJpaConfig.java:308`). But Spring Security's filter chain runs **before** any servlet, and
`SecurityConfig` calls `.cors(cors -> {})` with no `CorsConfigurationSource` bean anywhere in the
app. Spring's CORS processor, finding no configuration for a preflight request, rejects it outright
with `403 Invalid CORS request` — so the request dies in the filter chain and HAPI's `CorsInterceptor`
never gets a turn. `hapi.fhir.cors.allowed_origin: "*"` in `application.yaml` is real config, but
it is applied at a layer the request never reaches.

Net effect: any browser app on a different origin is blocked on **every** call — login *and*
appointment creation.

### The fix — Vite dev proxy. Still no backend change required.

```ts
// vite.config.ts
const API = process.env.VITE_PROXY_TARGET ?? 'http://139.59.46.163:8085'

server: {
  port: 5173,
  proxy: {
    '/auth': { target: API, changeOrigin: true },
    '/fhir': { target: API, changeOrigin: true },
  },
}
```

The app only ever calls **relative** paths — `/auth/login`, `/fhir/Appointment`. To the browser
those are same-origin (`localhost:5173`), so **CORS never applies**. Vite's dev server forwards them
to `139.59.46.163:8085` from Node, server-to-server, where CORS is not a concern at all.

This is why the proxy is **mandatory, not a convenience**. It is also why the remote backend costs us
nothing: the proxy target is one env var, and I verified every endpoint works when called
server-side.

### Can we get rid of CORS permanently later? Yes — and it is easy

**The design in this plan is what makes it easy.** The app only ever calls relative paths, so it has
no idea what is in front of it. Whatever we put there later — Vite, nginx, or Spring Boot itself —
**no application code changes.** Nothing built now has to be rewritten.

Three ways to deploy, cheapest first:

#### Option A — the backend already has this feature built in ⭐ recommended

`WebAppFilesConfigurer.java` exists for exactly this purpose: hosting a static web app alongside the
FHIR server. It is switched on by one property, currently commented out at `application.yaml:201`:

```yaml
# app_content_path: ./configs/app            # served under /web/app
```

There is even a placeholder `configs/app/index.html` sitting in the repo waiting for it. Steps:

1. Uncomment that line *(config, not code)*
2. Copy our built `dist/` into `configs/app/`
3. Add `"/web/**"` to `PUBLIC_PATHS` in `SecurityConfig.java` — **one line**

Step 3 is needed because I checked the deployed server and `/web/app/` currently returns **`401`**,
not `404`: Spring Security blocks it since `/web/**` is not in the public list, and the browser
cannot attach a Bearer token when it is merely fetching HTML and JS files.

Result: app served from `http://139.59.46.163:8085/web/app/`, API at the same origin.
**CORS is not skipped — it never applies at all.** Total: one config line, one Java line.

*One build-time detail:* served under a sub-path, the app needs `base: '/web/app/'` in
`vite.config.ts` and a matching router basename. Two lines. I would also use `HashRouter` so that
refreshing on `/appointments/new` does not 404 against the static file handler.

#### Option B — nginx in front

Point nginx at the built `dist/` for `/`, and proxy `/auth` and `/fhir` to the Spring Boot app.
Same origin, so again CORS never applies. **Zero backend changes** — pure nginx config, roughly 15
lines. Best choice if you want the app on port 80/443 with a domain name and TLS.

#### Option C — genuinely cross-origin (only if A and B are both ruled out)

If the web app really must live on a different origin from the API, the server needs a
`CorsConfigurationSource` bean covering `/auth/**` and `/fhir/**`, plus the app's origin added to
`hapi.fhir.cors.allowed_origin`. That is roughly 20 lines of Java, a rebuild, and a redeploy — and
with `allow_credentials` it needs explicit origins rather than `"*"`. More work than A or B, and it
widens the server's attack surface. **Out of scope for this build; I will not touch it unless you
ask.**

### Summary

| | Backend Java change | Config change | Effort | CORS |
|---|---|---|---|---|
| **Dev today** (Vite proxy) | none | none | already planned | never applies |
| **A** — built-in `/web/app` | 1 line | 1 line | ~30 min | never applies |
| **B** — nginx | none | ~15 lines nginx | ~30 min | never applies |
| **C** — cross-origin | ~20 lines | yaml origins | ~1 hr + redeploy | configured to allow |

Nothing here is needed today, and no decision now locks you out of any option later.

---

## 11. Configuration

**The backend URL lives in one place only.** `.env.example` (copy to `.env.local` to override):

```
# The deployed backend the dev proxy forwards to. THIS IS THE ONLY PLACE
# THE SERVER URL APPEARS. Change this one line to point anywhere.
VITE_PROXY_TARGET=http://139.59.46.163:8085

# Page size for the patient / practitioner pickers
VITE_PICKER_PAGE_SIZE=20
```

Switching environments is a one-line edit:

| Target | `VITE_PROXY_TARGET` |
|--------|---------------------|
| Deployed server *(default)* | `http://139.59.46.163:8085` |
| A laptop backend, if you ever want one | `http://localhost:8085` |
| Any other host later | whatever you give me |

Application code never sees a hostname — it calls `/auth/login` and `/fhir/Appointment` as relative
paths. No `localhost` string will exist anywhere in `src/`.

---

## 12. How you will run it

**No backend to start. The deployed server is already up.** One terminal, three commands:

```bash
cd Hms-Web-App
npm install
npm run dev
```

Open **http://localhost:5173**, sign in with `admin` / `admin123`, and create an appointment.
It writes to `139.59.46.163:8085`.

**Sanity-checking the server** any time, without the UI:

```bash
# should return a token
curl -s -X POST http://139.59.46.163:8085/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# should return 401 -- that is correct and healthy, it means auth is live
curl -s -o /dev/null -w "%{http_code}\n" http://139.59.46.163:8085/fhir/metadata
```

Both of these were run against your server while writing this document and behaved as shown.

**Production build:** `npm run build` produces static files in `Hms-Web-App/dist/`.

**Verifying an appointment was really created** — three ways:
1. The success banner in the app shows the new appointment id.
2. Postman collection: *Appointment -> Get Appointment by ID* (change `serverUrl` /
   `baseUrl` to the deployed values, which you already have).
3. The HAPI tester UI at `http://139.59.46.163:8085`.

---

## 13. Error handling and validation

**Client-side, before any request is sent:**

- Patient and practitioner must both be selected.
- Date, start time, and duration must be present.
- Start time must not be in the past *(a warning, not a hard block — back-dated entries are
  sometimes legitimate; confirm which behaviour you want)*.

**Server-side responses, all surfaced to the user rather than swallowed:**

| Response | What the user sees |
|----------|--------------------|
| `201 Created` | Green banner with the new appointment id |
| `400` / `422` | Red banner with the `OperationOutcome.issue[].diagnostics` text from HAPI |
| `401` | Session cleared, redirect to login with an expiry message |
| Network failure | *"Cannot reach the FHIR server at 139.59.46.163:8085. Check your connection."* |
| `403 Invalid CORS request` | Should be impossible via the proxy; if it appears it means a call bypassed the proxy with an absolute URL — treated as a bug, and the message will say so |

The submit button is disabled while a request is in flight, so a double-click cannot create two
appointments.

---

## 14. What is deliberately out of scope

Not built now — say the word and any of these becomes the next task:

- Creating patients or practitioners from this UI (they must already exist on the server)
- Listing, searching, editing, rescheduling, or cancelling appointments
- Practitioner availability / `Slot` / `Schedule` checking or double-booking prevention
- Multiple participants beyond one patient + one practitioner
- Recurring appointments
- Real user accounts, roles, or permissions (the backend has exactly one hard-coded user)
- Automated tests (happy to add Vitest + React Testing Library if you want them)
- Internationalisation, dark mode, print layouts

---

## 15. Decisions I made for you — confirm or override

I picked a sensible default for each of these so you have something concrete to react to. Tell me
which ones to change and I will adjust before writing any code.

| # | Decision | Alternative if you disagree |
|---|----------|------------------------------|
| 1 | **React + TypeScript + Vite** | Plain HTML/CSS/JS with no build step; or Angular; or Next.js |
| 2 | **Vite dev proxy** to sidestep CORS (section 10) | Add a CORS bean for `/auth/**` in the Java backend |
| 3 | **Patient/practitioner must already exist** — pickers search the server | Add inline "create new patient" to the form |
| 4 | **`sessionStorage`** for the token | `localStorage` (survives tab close) or in-memory only (re-login on refresh) |
| 5 | **Hard-coded SNOMED/v2 code lists** in section 7 | Give me your hospital's real value sets |
| 6 | **Duration dropdown** (15/30/45/60) drives `end` | A free end-time picker instead |
| 7 | **Browser-local timezone offset** on `start`/`end` | Pin everything to `+05:30` (IST) |
| 8 | Past-dated appointments allowed **with a warning** | Block them outright |
| 9 | **Plain CSS**, clean and minimal | Tailwind, Material UI, or Bootstrap |
| 10 | Success shows a banner and stays on the form | Redirect to an appointment-detail view |
| 11 | **All testing against the deployed server** — the app will create real `Appointment` records there | Point at a staging server, or a laptop backend |
| 12 | Pickers use **`name:contains`** search | Prefix-only `name=`, or an MRN/identifier-only lookup |
| 13 | ~~Appointment `identifier` not collected~~ → **added on request**: optional **Pod ID** text box | Make it required, or auto-generate the value |

---

## 16. Note on the deployed server

Two things I found while verifying, neither blocking, both worth knowing:

**1. It is plain HTTP on a public IP.** `admin` / `admin123` and every Bearer token travel
unencrypted, and those credentials are currently committed in `application.yaml` and
`docker-compose.yml` in the repo. Anyone who can reach that IP can read and write all clinical data
on it. Perfectly fine for building and testing this app. Before real patient data goes near it, it
needs TLS and credentials moved to environment variables only. Not something this web app can fix —
flagging it because it is your server, not because it blocks us.

**2. Tokens are held in an in-memory map on the server.** If the server restarts while you have the
app open, your token silently stops working. The app handles this correctly — the next request gets
a `401`, and you are returned to the login screen with *"Your session has expired."* Just so the
behaviour is expected rather than confusing.

**3. Test appointments are real records.** Every appointment you create while testing lands in that
server's database alongside the 399 already there. Say the word if you would rather I use a
recognisable marker (e.g. a fixed comment prefix) so test rows can be found and cleaned up later.

---

---

## 17. Build status & verification results

Everything below was executed against the deployed server, not simulated.

### Build health

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ clean, 0 errors |
| `npm run build` | ✅ 53 modules, 202 kB JS (66 kB gzipped), 6.8 kB CSS |
| `npm audit --omit=dev` | ✅ **0 vulnerabilities** |
| All modules transform in dev | ✅ 11/11, no errors in the Vite log |

> React Router was moved from v6 to **v7** during the build: v6 carries two moderate CVEs
> (GHSA-wrjc-x8rr-h8h6 open redirect, GHSA-337j-9hxr-rhxg constructor injection) with no non-breaking
> fix. Our usage — `HashRouter`, `Routes`, `Route`, `Navigate`, `useNavigate` — is identical in v7,
> so the upgrade cost nothing and the production dependency tree is now clean.

### End-to-end, through the Vite proxy on :5173

| # | Flow | Result |
|---|------|--------|
| 1 | App HTML served | `200` |
| 2 | `POST /auth/login` (`admin`/`admin123`) | `200` + token |
| 3 | Patient picker — `Patient?name:contains=Patient4` | `200`, found `Patient40` / `MRN-040` |
| 4 | Practitioner picker — `Practitioner?name:contains=Meht` | `200`, found `Dr. Priyansh Mehta` |
| 5 | **`POST /fhir/Appointment`** | **`201 Created` → `Appointment/1846`** |
| 6 | Bad password | `401` *"Invalid username or password."* — shown verbatim in the UI |
| 7 | No token on a FHIR call | `401` → session cleared, redirect to login |

The CORS design is confirmed working in practice: every one of these calls went to `localhost:5173`
and was forwarded to `139.59.46.163:8085` by the proxy. The same calls made directly from a browser
return `403 Invalid CORS request` (section 10).

### Test records created on your server

Two real appointments were created while verifying. Both are tagged so you can find them:

| Id | How to identify it |
|----|--------------------|
| `Appointment/1845` | `comment` contains `HMS-WEB-APP-TEST` |
| `Appointment/1846` | `reasonCode.text` = `"E2E test via Vite proxy"` |

Delete them whenever you like:
`DELETE http://139.59.46.163:8085/fhir/Appointment/1845` with a Bearer token.

### Deviations from the plan

Only one, and it is an addition rather than a change: `main.tsx` uses **`HashRouter`** instead of
`BrowserRouter`. Section 10 had flagged this as needed if the app is ever served as static files
under a sub-path; doing it now means deploy option A works with no code change later. The only
visible effect is a `#` in the URL (`localhost:5173/#/appointments/new`).

Everything else matches sections 1–15 as written and approved.

### Bug found and fixed after first manual test

`client.ts` had a single `401` handler for every request, but `401` means two different things:
on `POST /auth/login` it means **wrong password**, and on any `/fhir/**` call it means **the token
expired**. Treating login's `401` as an expired session showed the misleading *"Your session has
expired"* notice twice and discarded the server's real *"Invalid username or password."*

Fixed: a request deliberately sent without a token (only login) now surfaces the server's own
message. Submitting the login form also clears any stale notice so two banners cannot stack.

---

## 18. Field mapping reference — UI label ↔ FHIR field

Exactly what each on-screen field becomes in the `Appointment` resource. This is the source of
truth; it was read off `buildAppointment()` in `src/pages/NewAppointmentPage.tsx`.

### Every UI field

| # | UI label (what you see) | Section | FHIR path (what the server stores) | Req. | Example value sent |
|---|---|---|---|:---:|---|
| 1 | **Patient** | Who | `participant[0].actor.reference` | ✅ | `"Patient/1826"` |
| | ↳ *(name shown in picker)* | | `participant[0].actor.display` | | `"P040 Patient40"` |
| 2 | **Practitioner** | Who | `participant[1].actor.reference` | ✅ | `"Practitioner/1001"` |
| | ↳ *(name shown in picker)* | | `participant[1].actor.display` | | `"Dr. Priyansh Mehta"` |
| 3 | **Date** | When | date half of `start` **and** `end` | ✅ | `2026-09-08` |
| 4 | **Start time** | When | time half of `start` | ✅ | `09:00` → `...T09:00:00+05:30` |
| 5 | **Duration** | When | drives `end` **and** `minutesDuration` | ✅ | `30` |
| 6 | **Pod ID** | Details | `identifier[0].value` | — | `"LoudrBed"` |
| | ↳ *(system is fixed)* | | `identifier[0].system` | | `"http://hospital.org/pod-id"` |
| 7 | **Status** | Details | `status` | ✅ | `"booked"` |
| 8 | **Appointment type** | Details | `appointmentType.coding[0]` | — | `ROUTINE` |
| 9 | **Service type** | Details | `serviceType[0].coding[0]` | — | `11429006` Consultation |
| 10 | **Specialty** | Details | `specialty[0].coding[0]` | — | `394814009` General practice |
| 11 | **Reason** *(dropdown)* | Details | `reasonCode[0].coding[0]` | — | `386661006` Fever |
| 12 | **Reason (free text)** | Details | `reasonCode[0].text` | — | `"Back pain since Monday"` |
| 13 | **Description** | Details | `description` | — | `"OPD consultation"` |
| 14 | **Comment** | Details | `comment` | — | `"First visit..."` |

Reason is either/or: pick a coded reason → `coding[0]`; pick *"Other (type it in)…"* → `text`.
Never both.

### Set automatically — no UI control

You cannot change these from the screen. They are hard-coded because every appointment on your
server already uses these values.

| FHIR path | Always sent as | Why |
|---|---|---|
| `resourceType` | `"Appointment"` | Identifies the resource |
| `participant[*].required` | `"required"` | Matches your existing records |
| `participant[*].status` | `"accepted"` | Matches your existing records |
| `end` | `start` + duration | Computed, so start and end can never disagree |
| `minutesDuration` | duration in minutes | Convenience; redundant with start/end |
| `coding[].system` / `coding[].display` | from `src/constants/codes.ts` | You pick a code; system and display come with it |

### Annotated payload

The same JSON you pasted, marked up with where each line comes from:

```jsonc
{
  "resourceType": "Appointment",          // automatic
  "status": "booked",                     // <- Status dropdown

  "identifier": [{                        // <- Pod ID text box (omitted if blank)
    "system": "http://hospital.org/pod-id", //  fixed, from POD_ID_SYSTEM in codes.ts
    "value": "LoudrBed"                     //  <- exactly what you typed
  }],

  "serviceType": [{                       // <- Service type dropdown
    "coding": [{
      "system": "http://snomed.info/sct", //    system + display come from the
      "code": "11429006",                 //    chosen entry in codes.ts; you only
      "display": "Consultation"           //    pick the label
    }]
  }],
  "specialty": [{                          // <- Specialty dropdown
    "coding": [{ "system": "http://snomed.info/sct", "code": "394814009", "display": "General practice" }]
  }],
  "appointmentType": {                     // <- Appointment type dropdown
    "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/v2-0276", "code": "ROUTINE", "display": "Routine appointment" }]
  },
  "reasonCode": [{                         // <- Reason dropdown
    "coding": [{ "system": "http://snomed.info/sct", "code": "386661006", "display": "Fever" }]
  }],

  "start": "2026-09-08T09:00:00+05:30",   // <- Date + Start time (browser's offset)
  "end":   "2026-09-08T09:30:00+05:30",   // automatic: start + Duration
  "minutesDuration": 30,                  // <- Duration

  "description": "OPD consultation",      // <- Description  (omitted if blank)
  "comment": "First visit...",            // <- Comment      (omitted if blank)

  "participant": [
    {
      "actor": {
        "reference": "Patient/1826",         // <- Patient picker (the id)
        "display": "P040 Patient40"          // <- Patient picker (the name)
      },
      "required": "required",                // automatic
      "status": "accepted"                   // automatic
    },
    {
      "actor": {
        "reference": "Practitioner/1001",    // <- Practitioner picker (the id)
        "display": "Dr. Priyansh Mehta"      // <- Practitioner picker (the name)
      },
      "required": "required",                // automatic
      "status": "accepted"                   // automatic
    }
  ]
}
```

### Coverage against your Postman payload

Every field in the reference payload is now reachable from the UI. Nothing is silently dropped.

| FHIR field | In the UI? | As |
|---|:---:|---|
| `status` | ✅ | Status dropdown |
| `identifier` (**Pod ID**) | ✅ | **Pod ID** text box — optional |
| `serviceType` | ✅ | Service type dropdown |
| `specialty` | ✅ | Specialty dropdown |
| `appointmentType` | ✅ | Appointment type dropdown |
| `reasonCode` | ✅ | Reason dropdown, or free text |
| `start` / `end` | ✅ | Date + Start time + Duration |
| `comment` | ✅ | Comment textarea |
| `participant` | ✅ | Patient + Practitioner pickers |

The app additionally sends `minutesDuration`, which your Postman payload omits. It is optional in
FHIR R4 and consistent with `end - start`; harmless, and it saves consumers doing the arithmetic.

**Blank optional fields are omitted entirely** — never sent as `null` or `""`, which FHIR
validation rejects. So an appointment created with no Pod ID simply has no `identifier` key, and one
with no Reason has no `reasonCode` key.

### Finding an appointment later by its Pod ID

Because it is stored as a proper FHIR `identifier`, it is searchable:

```
GET /fhir/Appointment?identifier=LoudrBed
```

> **No uniqueness check.** The server does not reject a Pod ID that is already in use, and the app
> does not look for duplicates before creating. Two appointments can carry the same Pod ID. If that
> should be prevented, the clean way is a conditional create (`If-None-Exist: identifier=<podId>`
> header) — say the word and I will add it.

### Where to change any of this

| To change… | Edit |
|---|---|
| The codes in a dropdown | `src/constants/codes.ts` |
| Which defaults are pre-selected | `DEFAULTS` in `src/constants/codes.ts` |
| How a field maps to FHIR | `buildAppointment()` in `src/pages/NewAppointmentPage.tsx` |
| Field labels, order, sections | the JSX in `src/pages/NewAppointmentPage.tsx` |
