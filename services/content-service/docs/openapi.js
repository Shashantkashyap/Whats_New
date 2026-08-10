// OpenAPI 3.0 spec + Swagger UI + Postman collection download.
//
// The Postman JSON is `require()`'d so esbuild inlines it into
// dist/whatsnew-backend.cjs — the binary can serve it with no loose files.

const postmanCollection = require("../../../postman/WhatsNew.postman_collection.json");

const bearer = [{ bearerAuth: [] }];

const envelope = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["success", "error"] },
    data: { type: "object" },
    metadata: { type: "object" },
    code: { type: "string", description: "Present on errors only" },
    message: { type: "string", description: "Present on errors (and some 201s)" },
  },
};

function jsonOk(description, example) {
  return {
    description,
    content: {
      "application/json": {
        schema: envelope,
        ...(example !== undefined ? { example } : {}),
      },
    },
  };
}

function jsonErr(description, example) {
  return {
    description,
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: ["status", "code", "message"],
          properties: {
            status: { type: "string", example: "error" },
            code: { type: "string" },
            message: { type: "string" },
          },
        },
        ...(example !== undefined ? { example } : {}),
      },
    },
  };
}

function body(schema, example) {
  return {
    required: true,
    content: {
      "application/json": {
        schema,
        ...(example !== undefined ? { example } : {}),
      },
    },
  };
}

const ID = "507f1f77bcf86cd799439011";
const TOPIC_ID = "507f1f77bcf86cd799439022";
const SUBJECT_ID = "507f1f77bcf86cd799439033";
const MEDIA_ID = "507f1f77bcf86cd799439044";
const TEST_ID = "507f1f77bcf86cd799439055";

const spec = {
  openapi: "3.0.3",
  info: {
    title: "What's New — UPSC News Intelligence API",
    version: "2.1.0",
    description: [
      "# Overview",
      "",
      "Composed backend (user-service + content-service) for the What's New UPSC platform.",
      "",
      "## Suggested client flows",
      "",
      "1. **Guest browse** — `GET /api/v1/news/feed` (no token) → open brief → `GET /api/v1/media/{image_document_id}` for images.",
      "2. **Login** — `POST /api/v1/auth/login` → copy `data.token` → **Authorize** in Swagger (or set Postman `{{token}}`).",
      "3. **Personalized feed** — same feed/swipe endpoints with bearer → affinity ranking + `is_bookmarked` + per-item `challenge` progress.",
      "4. **Daily challenge** — brief → `GET .../challenge/status` → `POST .../answer-mcq` (per question) and/or `POST .../submit-mcq` (full set) and/or `POST .../mains/submit`.",
      "5. **Practice / tests** — create mains test → `POST /media/upload/{testId}/{questionId}` (async OCR, no S3) → poll `POST /media/ocr-status` until `done` → `POST /tests/{id}/answers` with `answerText` → `/evaluate`.",
      "",
      "## Conventions",
      "",
      "- Success envelope: `{ status: \"success\", data, metadata? }`.",
      "- Error envelope: `{ status: \"error\", code, message }`.",
      "- **Images never return storage/CDN URLs** — only `image_document_id` / `answer_sheet_document_id`; fetch bytes via `GET /api/v1/media/{id}`.",
      "- Mains answer photos are OCR'd in-memory (not stored on S3); poll `/media/ocr-status` for extracted `answer_text`.",
      "- Questions are **topic-first**: every question has a taxonomy `topic_id` (seed via `make seed-taxonomy`).",
      "",
      "## Postman",
      "",
      "Download the ready-to-import collection: [`GET /postman/WhatsNew.postman_collection.json`](/postman/WhatsNew.postman_collection.json).",
    ].join("\n"),
  },
  servers: [
    { url: "https://whats-api.codeforcontract.com", description: "Production composed backend" },
    { url: "http://localhost:8080", description: "Local composed backend (default PORT)" },
    { url: "http://localhost:6973", description: "Local composed backend (.env PORT=6973)" },
    { url: "http://localhost:5050", description: "content-service only" },
    { url: "http://localhost:4001", description: "user-service only" },
  ],
  tags: [
    {
      name: "System",
      description: "Health + developer tooling (OpenAPI, Postman download). No auth.",
    },
    {
      name: "Auth",
      description:
        "Register → OTP → login. **When:** first-time setup and session start. Login returns `data.token` used as `Authorization: Bearer` for student features.",
    },
    {
      name: "Users",
      description: "Profile + interests. **When:** after login, to read/update `is_subscription` and preferences.",
    },
    {
      name: "Daily News (public)",
      description:
        "Home/Explore feeds. **When:** guests and students browse dossiers. JWT optional — personalizes affinity + bookmarks when present. Implementation: Mongo filter → optional swipe-affinity re-rank → `newsPresenter` shapes; images as document ids.",
    },
    {
      name: "Topics",
      description: "Curriculum tag chips for the news feed (not the UPSC question-bank Subject/Topic taxonomy).",
    },
    {
      name: "Media",
      description:
        "Byte proxy for news/challenge assets, plus async mains OCR upload (`POST /media/upload/{testId}/{questionId}`) and status poll (`POST /media/ocr-status`). Answer photos are not stored on S3 — only extracted text is kept temporarily.",
    },
    {
      name: "Saved News",
      description: "Bookmark dossiers. **When:** student taps save on a feed/brief card. Auth required.",
    },
    {
      name: "Daily Challenge",
      description:
        "Per-news prelims MCQ + handwritten mains persistence. **When:** student answers dossier MCQs one-by-one (`answer-mcq`) or as a full set (`submit-mcq`), or uploads a mains sheet. Auth required. Implementation: `ChallengeAttempt` upsert keyed by `(userId, newsId)`; feed cards expose compact `challenge` progress.",
    },
    {
      name: "Swipe",
      description: "Left/right interest signals that drive feed affinity. **When:** swipe deck UX. Auth required. Recorded swipes are excluded from subsequent `GET /news/swipe-decks` for that user.",
    },
    {
      name: "Questions",
      description:
        "Topic-first question bank. **When:** practice UI and admin import. Subjects/topics come from seeded taxonomy (`Subject`/`Topic` collections). Inserts require exact `topic` name or `topic_id`.",
    },
    {
      name: "Tests",
      description:
        "Timed/practice attempts. **Flow (prelims):** create → answer → `/submit`. **Flow (mains):** create → optional photo OCR via `/media/upload` + poll → `/answers` with `answerText` → `/evaluate`. Modes: `topic_wise` (`topic_id`), `subject_wise` (`subject_id`), `mixed` (importance-weighted sample).",
    },
    {
      name: "News CRUD",
      description: "Admin-style news document CRUD. Guest-readable list/detail; writes are open (no auth) for tooling.",
    },
    {
      name: "Content",
      description: "Trigger the scrape + Gemini enrichment pipeline, and inspect in-process scheduler status. **When:** ops wants a fresh fetch now or to check cron health.",
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Paste `data.token` from `POST /api/v1/auth/login`.",
      },
    },
    schemas: {
      SuccessEnvelope: envelope,
      ErrorEnvelope: {
        type: "object",
        required: ["status", "code", "message"],
        properties: {
          status: { type: "string", example: "error" },
          code: { type: "string" },
          message: { type: "string" },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Health check",
        description: "**When:** load balancers / smoke tests. Returns process uptime.",
        responses: {
          200: jsonOk("Service is up", {
            status: "success",
            data: { ok: true, uptime_s: 42 },
          }),
        },
      },
    },

    "/postman/WhatsNew.postman_collection.json": {
      get: {
        tags: ["System"],
        summary: "Download Postman collection",
        description: [
          "**When:** import the full API into Postman (or Insomnia).",
          "",
          "**Implementation:** the collection JSON under `postman/` is `require()`'d at build time and inlined into the binary, so this works from `node server.js` and from `dist/whatsnew-backend.cjs` with no external file dependency.",
          "",
          "Response is served as an attachment (`Content-Disposition: attachment`).",
        ].join("\n"),
        responses: {
          200: {
            description: "Postman Collection v2.1 JSON",
            headers: {
              "Content-Disposition": {
                schema: { type: "string" },
                example: 'attachment; filename="WhatsNew.postman_collection.json"',
              },
            },
            content: {
              "application/json": {
                schema: { type: "object" },
                example: {
                  info: { name: "What's New — UPSC News Intelligence API", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
                  variable: [{ key: "baseUrl", value: "http://localhost:6973" }, { key: "token", value: "" }],
                  item: [{ name: "Health" }, { name: "Auth (user-service)" }, { name: "Daily News (PUBLIC)" }],
                },
              },
            },
          },
        },
      },
    },

    // ---------------- Auth ----------------
    "/api/v1/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register (emails an OTP)",
        description: "**Flow step 1.** Creates an unverified user and emails a 6-digit OTP. Next: `POST /api/v1/auth/verify-otp`.",
        requestBody: body(
          {
            type: "object",
            required: ["email", "password"],
            properties: {
              email: { type: "string", format: "email" },
              password: { type: "string", minLength: 6 },
              name: { type: "string" },
              designation: { type: "string" },
              department: { type: "string" },
              interests: { type: "array", items: { type: "string" } },
            },
          },
          {
            email: "aspirant@example.com",
            password: "Passw0rd!",
            name: "Test Aspirant",
            designation: "Deputy Secretary",
            department: "Ministry of Finance",
            interests: ["Economy", "Polity"],
          }
        ),
        responses: {
          201: jsonOk("User created; OTP emailed", {
            status: "success",
            data: { message: "OTP sent", email: "aspirant@example.com" },
          }),
          409: jsonErr("Email/username taken", {
            status: "error",
            code: "USER_EXISTS",
            message: "Email already registered",
          }),
        },
      },
    },
    "/api/v1/auth/verify-otp": {
      post: {
        tags: ["Auth"],
        summary: "Verify signup OTP (logs in)",
        description: "**Flow step 2 after register.** Marks user verified and issues tokens (same shape as login).",
        requestBody: body(
          {
            type: "object",
            required: ["email", "code"],
            properties: { email: { type: "string" }, code: { type: "string" } },
          },
          { email: "aspirant@example.com", code: "123456" }
        ),
        responses: {
          200: jsonOk("Verified + tokens", {
            status: "success",
            data: {
              token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
              expires_at: "2026-08-03T14:00:00.000Z",
              user: { id: ID, email: "aspirant@example.com", is_subscription: false },
            },
          }),
        },
      },
    },
    "/api/v1/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login — returns bearer token + user",
        description: [
          "**When:** start every authenticated session.",
          "",
          "Copy `data.token` into Swagger **Authorize**, or let the Postman Login test script store it as `{{token}}`.",
          "Also sets `accessToken` / `refreshToken` cookies for cookie-based user-service routes.",
        ].join("\n"),
        requestBody: body(
          {
            type: "object",
            required: ["email", "password"],
            properties: { email: { type: "string" }, password: { type: "string" } },
          },
          { email: "aspirant@example.com", password: "Passw0rd!" }
        ),
        responses: {
          200: jsonOk("Logged in", {
            status: "success",
            data: {
              token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
              expires_at: "2026-08-03T14:00:00.000Z",
              user: {
                id: ID,
                email: "aspirant@example.com",
                name: "Test Aspirant",
                is_subscription: true,
                interests: ["Economy", "Polity"],
              },
            },
          }),
          401: jsonErr("Invalid credentials", {
            status: "error",
            code: "INVALID_CREDENTIALS",
            message: "Invalid email or password",
          }),
        },
      },
    },
    "/api/v1/auth/refresh-token": {
      post: {
        tags: ["Auth"],
        summary: "Rotate tokens via refreshToken cookie",
        description: "**When:** access token expired but refresh cookie is still valid.",
        responses: { 200: jsonOk("Refreshed", { status: "success", data: { token: "eyJ..." } }) },
      },
    },
    "/api/v1/auth/forgot-password": {
      post: {
        tags: ["Auth"],
        summary: "Send password-reset OTP",
        requestBody: body(
          { type: "object", properties: { email: { type: "string" } } },
          { email: "aspirant@example.com" }
        ),
        responses: { 200: jsonOk("OTP sent", { status: "success", data: { message: "OTP sent" } }) },
      },
    },
    "/api/v1/auth/reset-password": {
      post: {
        tags: ["Auth"],
        summary: "Reset password with OTP",
        requestBody: body(
          {
            type: "object",
            properties: { email: { type: "string" }, otp: { type: "string" }, newPassword: { type: "string" } },
          },
          { email: "aspirant@example.com", otp: "123456", newPassword: "N3wPassw0rd!" }
        ),
        responses: { 200: jsonOk("Password reset", { status: "success", data: { message: "Password updated" } }) },
      },
    },
    "/api/v1/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Logout (clear cookies / refresh)",
        responses: { 200: jsonOk("Logged out", { status: "success", data: { message: "Logged out" } }) },
      },
    },

    // ---------------- Users ----------------
    "/api/v1/users/me": {
      get: {
        tags: ["Users"],
        summary: "Get my profile",
        description: "**When:** app boot after login — includes `is_subscription`.",
        security: bearer,
        responses: {
          200: jsonOk("Profile", {
            status: "success",
            data: {
              id: ID,
              email: "aspirant@example.com",
              name: "Test Aspirant",
              is_subscription: true,
              interests: ["Economy"],
            },
          }),
        },
      },
      put: {
        tags: ["Users"],
        summary: "Update my profile",
        security: bearer,
        requestBody: body(
          {
            type: "object",
            properties: {
              name: { type: "string" },
              bio: { type: "string" },
              interests: { type: "array", items: { type: "string" } },
              is_subscription: { type: "boolean" },
            },
          },
          { name: "Test Aspirant", is_subscription: true, interests: ["Economy", "Polity"] }
        ),
        responses: { 200: jsonOk("Updated profile", { status: "success", data: { id: ID, is_subscription: true } }) },
      },
    },
    "/api/v1/users/interests": {
      get: {
        tags: ["Users"],
        summary: "Get interests",
        security: bearer,
        responses: { 200: jsonOk("Interests", { status: "success", data: { interests: ["Economy", "Polity"] } }) },
      },
      put: {
        tags: ["Users"],
        summary: "Replace interests",
        security: bearer,
        requestBody: body(
          { type: "object", properties: { interests: { type: "array", items: { type: "string" } } } },
          { interests: ["Economy", "Environment"] }
        ),
        responses: { 200: jsonOk("Updated", { status: "success", data: { interests: ["Economy", "Environment"] } }) },
      },
    },

    // ---------------- Topics (news curriculum chips) ----------------
    "/api/v1/topics/tags": {
      get: {
        tags: ["Topics"],
        summary: "News curriculum tags (PUBLIC)",
        description:
          "**When:** render Home tag chips. Not the question-bank Subject/Topic taxonomy. Optional bearer affinity-orders tags.",
        responses: {
          200: jsonOk("tags[]", {
            status: "success",
            data: {
              tags: [
                { id: "all", slug: "all", label: "All", icon: "grid", is_priority: false, active_dossiers_count: 120 },
                { id: "polity", slug: "polity", label: "Polity", icon: "shield", is_priority: true, active_dossiers_count: 34 },
              ],
            },
            metadata: { personalized: false },
          }),
        },
      },
    },

    // ---------------- Daily News ----------------
    "/api/v1/news/feed": {
      get: {
        tags: ["Daily News (public)"],
        summary: "Daily News Feed (PUBLIC; personalized if token sent)",
        description: [
          "**When:** Home / Explore list.",
          "",
          "**Auth:** optional. Missing/invalid JWT → still `200`, `is_bookmarked: false`, empty `challenge`, no affinity re-rank.",
          "",
          "**Implementation:** filter by tag/date/query/priority → sort priority+relevance+recency → optional swipe-affinity re-rank → attach bookmarks + `ChallengeAttempt` progress → `toFeedItem` (exposes `image_document_id`, never storage URL).",
        ].join("\n"),
        parameters: [
          { name: "tag", in: "query", schema: { type: "string" }, description: "all|polity|economy|relations|technology|ethics", example: "economy" },
          { name: "query", in: "query", schema: { type: "string" }, example: "budget" },
          { name: "date", in: "query", schema: { type: "string" }, description: "YYYY-MM-DD" },
          { name: "from", in: "query", schema: { type: "string" } },
          { name: "to", in: "query", schema: { type: "string" } },
          { name: "all", in: "query", schema: { type: "boolean" }, description: "Ignore date window" },
          { name: "priority", in: "query", schema: { type: "boolean" }, description: "High-priority only" },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 15 } },
        ],
        responses: {
          200: jsonOk("Paginated feed", {
            status: "success",
            data: {
              feed: [
                {
                  id: ID,
                  index_code: "01",
                  title: "Electoral Bond Verdict",
                  syllabus_tag: "GS-II • Polity",
                  category: "Polity",
                  image_document_id: MEDIA_ID,
                  read_time: "5m read",
                  priority: "High",
                  is_priority: true,
                  synopsis: "SC struck down the scheme.",
                  is_bookmarked: false,
                  challenge: {
                    attempted: false,
                    completed: false,
                    answered_count: 0,
                    total_questions: 5,
                    selected_answers: {},
                  },
                },
              ],
            },
            metadata: { total_records: 1, page: 1, limit: 15, has_next: false, personalized: false },
          }),
        },
      },
    },
    "/api/v1/news/swipe-decks": {
      get: {
        tags: ["Daily News (public)"],
        summary: "Swipeable deck (PUBLIC) — same item shape as /news/feed",
        description:
          "**When:** flashcard swipe UI. Prefers today; **excludes cards already recorded via `POST /news/swipe` or `POST /news/{id}/swipe`** when a bearer token is present; affinity-ordered. Response uses the same `data.feed[]` item schema as `GET /api/v1/news/feed` (including `challenge` progress when authed). Send the same JWT used to record swipes.",
        parameters: [
          { name: "date", in: "query", schema: { type: "string" } },
          { name: "all", in: "query", schema: { type: "boolean" } },
        ],
        responses: {
          200: jsonOk("feed[] (same shape as /news/feed)", {
            status: "success",
            data: {
              feed: [
                {
                  id: ID,
                  index_code: "01",
                  title: "Electoral Bond Verdict",
                  syllabus_tag: "GS-II • Polity",
                  category: "Polity",
                  category_icon: "shield",
                  image_document_id: MEDIA_ID,
                  read_time: "5m read",
                  priority: "High",
                  is_priority: true,
                  updated_at_label: "12h ago",
                  synopsis: "SC struck down the scheme.",
                  is_bookmarked: false,
                  challenge: {
                    attempted: true,
                    completed: false,
                    answered_count: 2,
                    total_questions: 5,
                    selected_answers: { "0": 1, "1": 0 },
                    prelims_score: null,
                    mains_submitted: false,
                  },
                },
              ],
            },
            metadata: {
              total_records: 1,
              page: 1,
              limit: 15,
              has_next: false,
              personalized: true,
              swiped_excluded: 3,
            },
          }),
        },
      },
    },
    "/api/v1/news/briefs/{id}/details": {
      get: {
        tags: ["Daily News (public)"],
        summary: "Full dossier detail (PUBLIC)",
        description:
          "**When:** user opens a feed card. Includes pillars, mains focus question, and `prelims_mcqs` (options only — no answer keys). Optional auth sets `is_bookmarked`.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: ID }],
        responses: {
          200: jsonOk("brief", {
            status: "success",
            data: {
              id: ID,
              title: "Electoral Bond Verdict",
              image_document_id: MEDIA_ID,
              is_bookmarked: false,
              core_briefing: "Landmark transparency ruling.",
              key_analytical_pillars: [{ pillar_index: "01", heading: "Unconstitutional", content: "Violates RTI." }],
              mains_focus_question: "Analyze the verdict.",
              prelims_mcqs: [{ index: 0, question: "Which Act…?", options: ["A", "B", "C", "D"] }],
            },
          }),
          404: jsonErr("Not found", { status: "error", code: "BRIEF_NOT_FOUND", message: "No briefing exists for the supplied identifier." }),
        },
      },
    },

    "/api/v1/media/upload/{testId}/{questionId}": {
      post: {
        tags: ["Media"],
        summary: "Async OCR upload for a mains answer photo (no S3)",
        description: [
          "**When:** student photographs a handwritten mains answer.",
          "",
          "**Flow:** multipart `image` → validate test ownership + question membership → queue OCR in-process (image not stored on S3) → `202` with `status: in_progress`.",
          "Poll `POST /api/v1/media/ocr-status` until each question is `done` (returns `answer_text`) or `failed`.",
          "Then submit texts via `POST /api/v1/tests/{id}/answers`.",
        ].join("\n"),
        security: bearer,
        parameters: [
          { name: "testId", in: "path", required: true, schema: { type: "string" }, example: TEST_ID },
          { name: "questionId", in: "path", required: true, schema: { type: "string" }, example: ID },
        ],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["image"],
                properties: {
                  image: { type: "string", format: "binary", description: "Answer sheet / notebook photo" },
                  file: { type: "string", format: "binary", description: "Alias for `image`" },
                },
              },
            },
          },
        },
        responses: {
          202: jsonOk("OCR started", {
            status: "success",
            data: { test_id: TEST_ID, question_id: ID, status: "in_progress" },
          }),
          400: jsonErr("Bad upload", { status: "error", code: "IMAGE_REQUIRED", message: "multipart field `image` (or `file`) with a binary file is required." }),
          401: jsonErr("Auth required", { status: "error", code: "AUTH_TOKEN_MISSING", message: "Authentication is required to upload media." }),
          404: jsonErr("Test not found", { status: "error", code: "TEST_NOT_FOUND", message: "No test exists for the supplied id." }),
        },
      },
    },

    "/api/v1/media/ocr-status": {
      post: {
        tags: ["Media"],
        summary: "Poll OCR status for mains answer photos",
        description: [
          "**When:** after one or more `POST /media/upload/{testId}/{questionId}` calls.",
          "",
          "Send `testId` + `questionIds[]`. Overall `status` is `in_progress` while any job is running, else `done`.",
          "Per-question: `not_started` | `in_progress` | `done` (includes `answer_text`) | `failed` (includes `error`).",
        ].join("\n"),
        security: bearer,
        requestBody: body(
          {
            type: "object",
            required: ["testId", "questionIds"],
            properties: {
              testId: { type: "string" },
              questionIds: { type: "array", items: { type: "string" } },
            },
          },
          { testId: TEST_ID, questionIds: [ID] }
        ),
        responses: {
          200: jsonOk("OCR status", {
            status: "success",
            data: {
              test_id: TEST_ID,
              status: "done",
              results: [
                {
                  question_id: ID,
                  status: "done",
                  answer_text: "Cooperative federalism is embodied in the GST Council…",
                  confidence: 0.92,
                },
              ],
            },
          }),
        },
      },
    },

    "/api/v1/media/{id}": {
      get: {
        tags: ["Media"],
        summary: "Stream image bytes by document id",
        description: [
          "**When:** `<img src=\"/api/v1/media/{image_document_id}\">` or download a mains answer sheet.",
          "",
          "**Never** expect a public S3 URL in JSON — only document ids. This handler looks up `MediaAsset.storageUrl` server-side and pipes bytes.",
        ].join("\n"),
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: MEDIA_ID }],
        responses: {
          200: {
            description: "Raw image bytes",
            content: { "image/jpeg": { schema: { type: "string", format: "binary" } }, "image/png": { schema: { type: "string", format: "binary" } } },
          },
          404: jsonErr("Not found", { status: "error", code: "MEDIA_NOT_FOUND", message: "No media asset exists for the supplied identifier." }),
        },
      },
    },

    // ---------------- Saved ----------------
    "/api/v1/news/saved": {
      get: {
        tags: ["Saved News"],
        summary: "List my saved news",
        description: "**When:** Bookmarks / Saved tab. Auth required.",
        security: bearer,
        parameters: [
          { name: "page", in: "query", schema: { type: "integer" } },
          { name: "limit", in: "query", schema: { type: "integer" } },
        ],
        responses: {
          200: jsonOk("saved[]", {
            status: "success",
            data: { saved: [{ id: ID, title: "Electoral Bond Verdict", is_bookmarked: true, image_document_id: MEDIA_ID }] },
          }),
        },
      },
    },
    "/api/v1/news/{id}/save": {
      post: {
        tags: ["Saved News"],
        summary: "Save a news item",
        description: "**When:** bookmark tap. Idempotent upsert on `(userId, newsId)`.",
        security: bearer,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: ID }],
        responses: {
          201: jsonOk("Saved", { status: "success", data: { news_id: ID, is_bookmarked: true } }),
          404: jsonErr("News not found", { status: "error", code: "NEWS_NOT_FOUND", message: "News not found" }),
        },
      },
      delete: {
        tags: ["Saved News"],
        summary: "Unsave a news item",
        security: bearer,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: ID }],
        responses: {
          200: jsonOk("Unsaved", { status: "success", data: { is_bookmarked: false, removed: true } }),
        },
      },
    },

    // ---------------- Challenge ----------------
    "/api/v1/news/{id}/challenge/status": {
      get: {
        tags: ["Daily Challenge"],
        summary: "Fetch challenge status + MCQs (no answers until answered/submitted)",
        description: [
          "**When:** opening a dossier challenge screen.",
          "",
          "Returns `questions` with options only. After each `answer-mcq` (or full `submit-mcq`), also returns `results` for locked-in questions with `correct_answer` / `is_correct`.",
          "Includes `answered_count` for partial progress.",
          "Mains sheet is `answer_sheet_document_id` only (never a storage URL).",
        ].join("\n"),
        security: bearer,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: ID }],
        responses: {
          200: jsonOk("Status", {
            status: "success",
            data: {
              is_completed: false,
              prelims_score: 0,
              total_questions: 2,
              answered_count: 0,
              selected_answers: {},
              questions: [
                { index: 0, question: "Which body sets the repo rate?", options: ["RBI", "SEBI", "NITI Aayog", "Finance Ministry"] },
              ],
              mains_status: { submitted: false, evaluation_status: "Unattempted" },
            },
          }),
          401: jsonErr("Auth required", { status: "error", code: "AUTH_TOKEN_MISSING", message: "Authorization bearer token is required." }),
        },
      },
    },
    "/api/v1/news/{id}/challenge/answer-mcq": {
      post: {
        tags: ["Daily Challenge"],
        summary: "Submit one prelims MCQ — persists immediately",
        description: [
          "**When:** student answers a single dossier MCQ (per-question UX).",
          "",
          "Send `question_index` + `selected` (option index or option text).",
          "Server grades that question against `News.mcqs`, upserts into `ChallengeAttempt.selectedAnswers`, and returns that question's `result`.",
          "When every MCQ has an answer, the set auto-completes (`is_completed: true`, `prelims_score` set).",
          "Feed cards then show updated `challenge.answered_count` / `selected_answers`.",
        ].join("\n"),
        security: bearer,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: ID }],
        requestBody: body(
          {
            type: "object",
            required: ["question_index", "selected"],
            properties: {
              question_index: { type: "integer", minimum: 0, description: "0-based index into News.mcqs" },
              selected: {
                oneOf: [{ type: "integer" }, { type: "string" }],
                description: "optionIndex (number) or option text (string)",
              },
            },
          },
          { question_index: 0, selected: 2 }
        ),
        responses: {
          201: jsonOk("Answer saved", {
            status: "success",
            data: {
              message: "MCQ answer saved.",
              question_index: 0,
              result: {
                index: 0,
                question: "Which body sets the repo rate?",
                options: ["RBI", "SEBI", "NITI Aayog", "Finance Ministry"],
                selected: "NITI Aayog",
                selected_index: 2,
                correct_answer: "RBI",
                is_correct: false,
              },
              answered_count: 1,
              total_questions: 5,
              is_completed: false,
              prelims_score: null,
              selected_answers: { "0": 2 },
            },
          }),
          400: jsonErr("Bad question index / selection", {
            status: "error",
            code: "INVALID_QUESTION_INDEX",
            message: "question_index must be an integer in 0..4.",
          }),
        },
      },
    },
    "/api/v1/news/{id}/challenge/submit-mcq": {
      post: {
        tags: ["Daily Challenge"],
        summary: "Submit prelims picks — server grades score",
        description: [
          "**When:** student finishes the dossier MCQ set (bulk submit), or wants to finalize answers already saved via `answer-mcq`.",
          "",
          "Send **only** `selected_answers` (question index → option index or option text), **or omit it** to grade already-persisted single answers.",
          "Server grades against `News.mcqs` and returns `prelims_score` + per-question `results`.",
          "A client-supplied `score` is ignored if present.",
        ].join("\n"),
        security: bearer,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: ID }],
        requestBody: body(
          {
            type: "object",
            properties: {
              selected_answers: {
                type: "object",
                additionalProperties: { oneOf: [{ type: "integer" }, { type: "string" }] },
                description: "Optional. questionIndex → optionIndex (number) or option text (string). Omit to finalize stored answers.",
              },
            },
          },
          { selected_answers: { "0": 0, "1": 2, "2": 1 } }
        ),
        responses: {
          201: jsonOk("Graded and saved", {
            status: "success",
            data: {
              message: "Prelims MCQ attempt graded and saved.",
              prelims_score: 2,
              total_questions: 3,
              selected_answers: { "0": 0, "1": 2, "2": 1 },
              results: [
                {
                  index: 0,
                  question: "Which body sets the repo rate?",
                  options: ["RBI", "SEBI", "NITI Aayog", "Finance Ministry"],
                  selected: "RBI",
                  selected_index: 0,
                  correct_answer: "RBI",
                  is_correct: true,
                },
              ],
            },
          }),
          400: jsonErr("Bad answers payload", {
            status: "error",
            code: "INVALID_ANSWERS",
            message: "selected_answers must be an object map of index → choice.",
          }),
        },
      },
    },
    "/api/v1/news/{id}/mains/submit": {
      post: {
        tags: ["Daily Challenge"],
        summary: "Upload handwritten mains sheet (vision-validated)",
        description: [
          "**When:** student photographs an A4 answer sheet for the dossier mains question.",
          "",
          "**Implementation:** parse multipart `image` → Gemini vision (≤3.5s; timeout saves with warning) → reject below 75% confidence with `422 INVALID_ANSWER_SHEET_FORMAT` → upload via asset API → store `MediaAsset` → return `answer_sheet_document_id` (never storage URL).",
        ].join("\n"),
        security: bearer,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: ID }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["image"],
                properties: { image: { type: "string", format: "binary", description: "Photo of handwritten A4 sheet" } },
              },
            },
          },
        },
        responses: {
          201: jsonOk("Accepted sheet", {
            status: "success",
            data: {
              submitted: true,
              answer_sheet_document_id: MEDIA_ID,
              evaluation_status: "Pending Review",
              insights: { text_extracted_chars: 1420, page_count: 1, clarity_rating: "High" },
            },
          }),
          422: jsonErr("Not an answer sheet", {
            status: "error",
            code: "INVALID_ANSWER_SHEET_FORMAT",
            message:
              "The uploaded photo does not appear to be an academic answer script. Please capture a clear, well-lit image of your handwritten A4 response sheet.",
          }),
        },
      },
    },

    // ---------------- Swipe ----------------
    "/api/v1/news/{id}/swipe": {
      post: {
        tags: ["Swipe"],
        summary: "Record swipe on a card",
        description: "**When:** left/right on swipe deck. `right` = interested (+affinity), `left` = skip (−affinity). Idempotent per (user, news).",
        security: bearer,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: ID }],
        requestBody: body(
          {
            type: "object",
            required: ["direction"],
            properties: { direction: { type: "string", enum: ["left", "right"] } },
          },
          { direction: "right" }
        ),
        responses: {
          201: jsonOk("Recorded", { status: "success", data: { news_id: ID, direction: "right" } }),
        },
      },
    },
    "/api/v1/news/swipe": {
      post: {
        tags: ["Swipe"],
        summary: "Record swipe (newsId in body)",
        security: bearer,
        requestBody: body(
          {
            type: "object",
            required: ["newsId", "direction"],
            properties: {
              newsId: { type: "string" },
              direction: { type: "string", enum: ["left", "right"] },
            },
          },
          { newsId: ID, direction: "left" }
        ),
        responses: { 201: jsonOk("Recorded", { status: "success", data: { news_id: ID, direction: "left" } }) },
      },
    },
    "/api/v1/news/swipe/affinity": {
      get: {
        tags: ["Swipe"],
        summary: "My per-tag swipe affinity",
        description: "**When:** debug / profile personalization UI. Derived from swipe history.",
        security: bearer,
        responses: {
          200: jsonOk("affinity[]", {
            status: "success",
            data: { affinity: [{ tag: "Economy", score: 3 }, { tag: "Polity", score: 1 }] },
          }),
        },
      },
    },

    // ---------------- Questions ----------------
    "/api/v1/questions/subjects": {
      get: {
        tags: ["Questions"],
        summary: "Subjects + nested topics (ids, importance, counts)",
        description: [
          "**When:** practice home — pick a subject, then a topic for topic-wise tests.",
          "",
          "**Implementation:** reads seeded `Subject`/`Topic` collections + aggregates question counts. Run `make seed-taxonomy` first.",
        ].join("\n"),
        security: bearer,
        responses: {
          200: jsonOk("Catalogue", {
            status: "success",
            data: {
              subjects: [
                {
                  id: SUBJECT_ID,
                  name: "Economy",
                  topic_count: 35,
                  question_count: 48,
                  topics: [
                    { id: TOPIC_ID, name: "Monetary Policy", importance: 5, question_count: 12 },
                  ],
                },
              ],
              total_questions: 259,
            },
          }),
        },
      },
    },
    "/api/v1/questions/practice": {
      get: {
        tags: ["Questions"],
        summary: "Random practice set (no-repeat + answers)",
        description: [
          "**When:** casual practice without creating a Test attempt.",
          "",
          "Returns a **random** batch. Per-user cursor prefers questions **not yet served** for this filter;",
          "if the pool is short, fills randomly from already-served ids; after a full cycle, reshuffles.",
          "Includes `answer` + `explanation` (and mains `modelAnswer`) for client-side checking.",
          "Pass `reset=true` to clear the cursor. Prefer `topic_id` for topic-wise drills.",
        ].join("\n"),
        security: bearer,
        parameters: [
          { name: "subject", in: "query", schema: { type: "string" }, example: "Economy" },
          { name: "topic", in: "query", schema: { type: "string" } },
          { name: "topic_id", in: "query", schema: { type: "string" }, example: TOPIC_ID },
          { name: "type", in: "query", schema: { type: "string", enum: ["prelims", "mains"] } },
          { name: "count", in: "query", schema: { type: "integer", default: 10 } },
          { name: "reset", in: "query", schema: { type: "boolean" }, description: "Clear no-repeat cursor for this pool" },
        ],
        responses: {
          200: jsonOk("questions[] with answers", {
            status: "success",
            data: {
              questions: [
                {
                  id: ID,
                  type: "prelims",
                  question: "Which body sets the repo rate?",
                  options: ["RBI", "SEBI", "NITI Aayog", "Finance Ministry"],
                  answer: "RBI",
                  explanation: "The RBI's MPC sets the policy repo rate.",
                  subject: "Economy",
                  topic: "Monetary Policy",
                  topic_id: TOPIC_ID,
                },
              ],
            },
            metadata: {
              requested: 10,
              count: 1,
              pool_size: 15,
              remaining_unseen: 5,
              recycled: 0,
              random: true,
              no_repeat: true,
            },
          }),
        },
      },
    },
    "/api/v1/questions": {
      get: {
        tags: ["Questions"],
        summary: "List / filter questions (no-repeat random + answers)",
        description: [
          "**When:** browse/drill the bank casually.",
          "",
          "Same no-repeat random sampling as `/questions/practice` (per-user cursor keyed by filter).",
          "Includes `answer` + `explanation`. For scored attempts use `POST /tests` instead.",
          "`limit` = batch size (default 20). `reset=true` clears the cursor.",
        ].join("\n"),
        security: bearer,
        parameters: [
          { name: "subject", in: "query", schema: { type: "string" } },
          { name: "topic", in: "query", schema: { type: "string" } },
          { name: "topic_id", in: "query", schema: { type: "string" } },
          { name: "tag", in: "query", schema: { type: "string" } },
          { name: "type", in: "query", schema: { type: "string", enum: ["prelims", "mains"] } },
          { name: "difficulty", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          { name: "reset", in: "query", schema: { type: "boolean" } },
        ],
        responses: {
          200: jsonOk("questions[] with answers", {
            status: "success",
            data: {
              questions: [
                {
                  id: ID,
                  type: "prelims",
                  question: "Which body sets the repo rate?",
                  options: ["RBI", "SEBI", "NITI Aayog", "Finance Ministry"],
                  answer: "RBI",
                  explanation: "The RBI's MPC sets the policy repo rate.",
                  topic_id: TOPIC_ID,
                },
              ],
            },
            metadata: { requested: 20, count: 1, random: true, no_repeat: true },
          }),
        },
      },
      post: {
        tags: ["Questions"],
        summary: "Create / bulk-import questions",
        description: [
          "**When:** admin import or scripts. **Rule:** every question must include `topic_id` OR an exact taxonomy `topic` name under `subject`.",
          "",
          "Free-text topics are rejected. Requires seeded taxonomy (`make seed-taxonomy`).",
        ].join("\n"),
        requestBody: body(
          {
            type: "object",
            properties: {
              questions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string", enum: ["prelims", "mains"] },
                    question: { type: "string" },
                    options: { type: "array", items: { type: "string" } },
                    answer: { type: "string" },
                    explanation: { type: "string" },
                    hints: { type: "array", items: { type: "string" } },
                    modelAnswer: { type: "string" },
                    subject: { type: "string" },
                    topic: { type: "string" },
                    topic_id: { type: "string" },
                    difficulty: { type: "string" },
                  },
                },
              },
            },
          },
          {
            questions: [
              {
                type: "prelims",
                question: "Which body sets the repo rate in India?",
                options: ["RBI", "SEBI", "NITI Aayog", "Finance Ministry"],
                answer: "RBI",
                explanation: "Monetary Policy Committee / RBI.",
                subject: "Economy",
                topic: "Monetary Policy",
                difficulty: "medium",
              },
            ],
          }
        ),
        responses: {
          201: jsonOk("Insert report", {
            status: "success",
            data: { inserted: 1, skipped_or_invalid: 0, invalid: [] },
          }),
          503: jsonErr("Taxonomy not seeded", {
            status: "error",
            code: "TAXONOMY_NOT_SEEDED",
            message: "Run seed taxonomy before inserting questions.",
          }),
        },
      },
    },
    "/api/v1/questions/{id}": {
      get: {
        tags: ["Questions"],
        summary: "Get a question by id",
        security: bearer,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: ID }],
        responses: {
          200: jsonOk("question", {
            status: "success",
            data: { id: ID, type: "prelims", question: "…", topic_id: TOPIC_ID, subject_id: SUBJECT_ID },
          }),
          404: jsonErr("Not found", { status: "error", code: "QUESTION_NOT_FOUND", message: "No question exists for the supplied id." }),
        },
      },
    },

    // ---------------- Tests ----------------
    "/api/v1/tests": {
      post: {
        tags: ["Tests"],
        summary: "Create a test attempt",
        description: [
          "**When:** start practice/exam mode.",
          "",
          "| Mode | Required | Sampling |",
          "|---|---|---|",
          "| `topic_wise` | `topic_id` (or exact `topic` + `subject`) | `$sample` within that topic |",
          "| `subject_wise` | `subject_id` (or `subject`) | `$sample` across topics in subject |",
          "| `mixed` | — | importance-weighted across full bank |",
          "",
          "**Prelims flow:** create → show options → `POST /tests/{id}/submit`.",
          "**Mains flow:** create → show hints → `POST /tests/{id}/answers` → `POST /tests/{id}/evaluate`.",
        ].join("\n"),
        security: bearer,
        requestBody: body(
          {
            type: "object",
            required: ["examType", "mode"],
            properties: {
              examType: { type: "string", enum: ["prelims", "mains"] },
              mode: { type: "string", enum: ["subject_wise", "topic_wise", "mixed"] },
              subject: { type: "string" },
              topic: { type: "string" },
              subject_id: { type: "string" },
              topic_id: { type: "string" },
              count: { type: "integer", default: 10 },
            },
          },
          { examType: "prelims", mode: "topic_wise", topic_id: TOPIC_ID, count: 10 }
        ),
        responses: {
          201: jsonOk("Test created (answers hidden)", {
            status: "success",
            data: {
              id: TEST_ID,
              exam_type: "prelims",
              mode: "topic_wise",
              topic_id: TOPIC_ID,
              status: "created",
              total_questions: 10,
              questions: [
                {
                  question_id: ID,
                  question: "Which body sets the repo rate?",
                  options: ["RBI", "SEBI", "NITI Aayog", "Finance Ministry"],
                  subject: "Economy",
                  topic: "Monetary Policy",
                },
              ],
            },
          }),
          404: jsonErr("No questions in pool", {
            status: "error",
            code: "TEST_NO_QUESTIONS",
            message: "No questions available for the selected mode/subject/topic.",
          }),
        },
      },
      get: {
        tags: ["Tests"],
        summary: "My test history",
        security: bearer,
        responses: {
          200: jsonOk("tests[]", {
            status: "success",
            data: { tests: [{ id: TEST_ID, exam_type: "prelims", mode: "topic_wise", status: "evaluated", score: 7, max_score: 10 }] },
          }),
        },
      },
    },
    "/api/v1/tests/{id}": {
      get: {
        tags: ["Tests"],
        summary: "Get a test (display or results)",
        description: "Pre-submit: options/hints only. After evaluation: full results view.",
        security: bearer,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: TEST_ID }],
        responses: { 200: jsonOk("test", { status: "success", data: { id: TEST_ID, status: "created" } }) },
      },
    },
    "/api/v1/tests/{id}/submit": {
      post: {
        tags: ["Tests"],
        summary: "PRELIMS: grade answers",
        description: "**When:** student finishes a prelims test. Reveals correct answers + explanations + score.",
        security: bearer,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: TEST_ID }],
        requestBody: body(
          {
            type: "object",
            properties: {
              answers: {
                type: "array",
                items: {
                  type: "object",
                  properties: { questionId: { type: "string" }, selectedOption: { type: "string" } },
                },
              },
            },
          },
          { answers: [{ questionId: ID, selectedOption: "RBI" }] }
        ),
        responses: {
          200: jsonOk("Graded", {
            status: "success",
            data: {
              id: TEST_ID,
              status: "evaluated",
              score: 1,
              max_score: 1,
              results: [
                {
                  question_id: ID,
                  your_answer: "RBI",
                  correct_answer: "RBI",
                  is_correct: true,
                  explanation: "MPC / RBI sets the repo rate.",
                },
              ],
            },
          }),
        },
      },
    },
    "/api/v1/tests/{id}/answers": {
      post: {
        tags: ["Tests"],
        summary: "MAINS: save written answers",
        description: [
          "**When:** before AI evaluation — persist text answers (status → `submitted`).",
          "",
          "For photo answers: upload via `POST /media/upload/{testId}/{questionId}`, poll `/media/ocr-status` for `answer_text`, then submit those texts here.",
        ].join("\n"),
        security: bearer,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: TEST_ID }],
        requestBody: body(
          {
            type: "object",
            properties: {
              answers: {
                type: "array",
                items: {
                  type: "object",
                  properties: { questionId: { type: "string" }, answerText: { type: "string" } },
                },
              },
            },
          },
          { answers: [{ questionId: ID, answerText: "Cooperative federalism is embodied in…" }] }
        ),
        responses: {
          200: jsonOk("Answers saved", { status: "success", data: { id: TEST_ID, status: "submitted", answers_saved: 1 } }),
        },
      },
    },
    "/api/v1/tests/{id}/evaluate": {
      post: {
        tags: ["Tests"],
        summary: "MAINS: AI evaluation",
        description: "**When:** after answers are saved (or pass answers inline with `answerText`). Gemini marks + feedback; falls back to heuristic if no key.",
        security: bearer,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: TEST_ID }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  answers: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: { questionId: { type: "string" }, answerText: { type: "string" } },
                    },
                  },
                },
              },
              example: { answers: [{ questionId: ID, answerText: "Cooperative federalism is embodied in…" }] },
            },
          },
        },
        responses: {
          200: jsonOk("Evaluated", {
            status: "success",
            data: {
              id: TEST_ID,
              status: "evaluated",
              score: 7,
              max_score: 10,
              results: [
                {
                  question_id: ID,
                  marks: 7,
                  max_marks: 10,
                  your_answer: "Cooperative federalism…",
                  feedback: "Solid coverage of GST Council; add more on NITI Aayog.",
                  improvements: ["Add a crisp conclusion", "Cite one recent example"],
                },
              ],
            },
          }),
        },
      },
    },

    // ---------------- News CRUD ----------------
    "/api/v1/news": {
      get: {
        tags: ["News CRUD"],
        summary: "List news (PUBLIC)",
        description: "**When:** admin/list tooling. Defaults to today's news unless `?all=true` / date range. Strips private `imageUrl`; exposes `image_document_id`.",
        parameters: [
          { name: "date", in: "query", schema: { type: "string" } },
          { name: "from", in: "query", schema: { type: "string" } },
          { name: "to", in: "query", schema: { type: "string" } },
          { name: "all", in: "query", schema: { type: "boolean" } },
          { name: "priority", in: "query", schema: { type: "boolean" } },
          { name: "category", in: "query", schema: { type: "string" } },
          { name: "minRating", in: "query", schema: { type: "integer" } },
          { name: "page", in: "query", schema: { type: "integer" } },
          { name: "limit", in: "query", schema: { type: "integer" } },
        ],
        responses: {
          200: {
            description: "Legacy success envelope",
            content: {
              "application/json": {
                example: {
                  success: true,
                  page: 1,
                  limit: 20,
                  total: 1,
                  data: [{ _id: ID, title: "…", image_document_id: MEDIA_ID }],
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["News CRUD"],
        summary: "Create news",
        description: "**When:** manual admin insert / tooling. Raw `imageUrl` in body is stripped.",
        requestBody: body(
          {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              content: { type: "string" },
              source: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
              is_priority: { type: "boolean" },
            },
          },
          {
            title: "Sample dossier",
            description: "Short synopsis",
            content: "Full article body…",
            source: "PIB",
            tags: ["Economy"],
            is_priority: true,
          }
        ),
        responses: { 201: { description: "Created", content: { "application/json": { example: { success: true, data: { _id: ID, title: "Sample dossier" } } } } } },
      },
    },
    "/api/v1/news/{id}": {
      get: {
        tags: ["News CRUD"],
        summary: "Get news by id",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: ID }],
        responses: { 200: { description: "news", content: { "application/json": { example: { success: true, data: { _id: ID, image_document_id: MEDIA_ID } } } } } },
      },
      put: {
        tags: ["News CRUD"],
        summary: "Update news",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: ID }],
        requestBody: body(
          { type: "object", properties: { is_priority: { type: "boolean" }, relevanceScore: { type: "integer" } } },
          { is_priority: true, relevanceScore: 90 }
        ),
        responses: { 200: { description: "Updated", content: { "application/json": { example: { success: true, data: { _id: ID, isPriority: true } } } } } },
      },
      delete: {
        tags: ["News CRUD"],
        summary: "Delete news",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: ID }],
        responses: { 200: { description: "Deleted", content: { "application/json": { example: { success: true, message: "News deleted successfully" } } } } },
      },
    },

    // ---------------- Content ----------------
    "/api/v1/content/fetch-now": {
      post: {
        tags: ["Content"],
        summary: "Trigger scrape + enrichment pipeline",
        description: [
          "**When:** ops wants an on-demand news pull.",
          "",
          "**Implementation:** returns `202` immediately and runs the pipeline async (RSS/chrome-mcp → Gemini enrichment → persist image as MediaAsset).",
        ].join("\n"),
        parameters: [{ name: "mode", in: "query", schema: { type: "string", enum: ["dev", "prod"] }, example: "dev" }],
        responses: {
          202: jsonOk("Pipeline started", { status: "success", data: { started: true, mode: "dev" } }),
        },
      },
    },
    "/api/v1/content/schedulers": {
      get: {
        tags: ["Content"],
        summary: "Scheduler status (last run, next run)",
        description: [
          "**When:** ops checks whether in-process crons are healthy.",
          "",
          "Returns each job's cron, enabled/running flags, last run timestamps/status/error,",
          "`invokes` (internal function — schedulers do not call HTTP), optional `equivalent_endpoint`,",
          "and computed `next_run_at`.",
        ].join("\n"),
        responses: {
          200: jsonOk("Scheduler status", {
            status: "success",
            data: {
              enabled: true,
              timezone: "Asia/Kolkata",
              jobs: [
                {
                  id: "content-pipeline",
                  name: "News feed content pipeline",
                  cron: "0 */2 * * *",
                  timezone: "Asia/Kolkata",
                  enabled: true,
                  running: false,
                  invokes: "runContentPipeline(mode)",
                  equivalent_endpoint: "POST /api/v1/content/fetch-now",
                  last_started_at: null,
                  last_finished_at: null,
                  last_status: "never",
                  last_error: null,
                  last_duration_ms: null,
                  run_count: 0,
                  next_run_at: "2026-08-04T14:00:00.000Z",
                },
                {
                  id: "question-bank",
                  name: "Question bank generation",
                  cron: "0 * * * *",
                  invokes: "runQuestionGeneration(opts)",
                  equivalent_endpoint: null,
                  last_status: "never",
                  next_run_at: "2026-08-04T13:00:00.000Z",
                },
              ],
            },
          }),
        },
      },
    },
  },
};

const DOCS_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>What's New API — Swagger UI</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      .wn-bar { font-family: system-ui, sans-serif; background: #1b1b1b; color: #eee;
        padding: 10px 16px; display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
      .wn-bar a { color: #6ea8fe; text-decoration: none; font-weight: 600; }
      .wn-bar a:hover { text-decoration: underline; }
      .wn-bar span { opacity: 0.7; font-size: 13px; }
    </style>
  </head>
  <body>
    <div class="wn-bar">
      <strong>What's New API</strong>
      <a href="/postman/WhatsNew.postman_collection.json" download>Download Postman collection</a>
      <a href="/openapi.json">openapi.json</a>
      <span>Import the collection into Postman, then run Auth → Login to capture {{token}}.</span>
    </div>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
        docExpansion: "list",
        defaultModelsExpandDepth: 1,
        tryItOutEnabled: true,
      });
    </script>
  </body>
</html>`;

function mountDocs(app) {
  app.get("/openapi.json", (req, res) => res.json(spec));
  app.get("/docs", (req, res) => res.type("html").send(DOCS_HTML));
  // Inlined via require() so the compiled binary does not need the postman/ folder on disk.
  app.get("/postman/WhatsNew.postman_collection.json", (req, res) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="WhatsNew.postman_collection.json"');
    res.status(200).json(postmanCollection);
  });
}

module.exports = { spec, mountDocs, postmanCollection };
