# PR Changes

Optimize Gemini token usage, improve content quality, make the pipeline
non-blocking, and move the whole platform to MongoDB (drop Postgres/Sequelize).

## 1. Gemini token usage (`content-service`)
- Replaced the huge prompt (which embedded a ~1.3k-token JSON example) with a
  compact, instructions-only prompt.
- Structure is now enforced by Gemini's **native `responseSchema`**
  (`generationConfig`) instead of a baked-in example — fewer input tokens,
  always-valid JSON, and no more parse-fail retries (each retry was a full call).
- Lowered defaults (all env-tunable): article body cap `9000 → 6000`,
  `maxOutputTokens 8192 → 4096`.

## 2. Content quality
- `temperature 0.1 → 0.3` so `why` / mains text reads naturally while facts stay
  grounded in the source article.
- Structured output guarantees every field is present and well-formed.
- Kept the "source of truth / do NOT invent" grounding rules.

## 3. Async / concurrency
- `POST /api/v1/content/fetch-now` now returns **202 immediately** and runs the
  pipeline in the background (supports `?mode=dev`).
- `generateAndStoreContent` refactored into a per-item `processNewsItem` run via
  `utils/concurrency.mapLimit` with **bounded concurrency** (`GEMINI_CONCURRENCY`,
  default 2) — replaces the serial loop + fixed sleeps; one bad article never
  aborts the batch.

## 4. MongoDB-only (`user-service`: Postgres/Sequelize → Mongoose)
- `User` / `Otp` converted to Mongoose. Interests are **embedded** as `[String]`
  (no join table); OTPs use a **TTL index** on `expiresAt` for auto-cleanup.
- Rewrote both controllers, `config/db.js`, and `index.js` for `mongoose.connect`.
- Deleted all Sequelize migrations, seeders, CLI config, and the root
  `migrations/`; removed `pg` / `pg-hstore` / `sequelize` / `sequelize-cli` from
  both `package.json`s and the root.
- Added `services/user-service/.env` (git-ignored) with `MONGO_URI` + dev JWT
  secrets so the service boots.

## 5. Cleanup / fixes
- **Bug fix:** `middleware/auth.js` read the wrong cookie (`token` →
  `accessToken`), so protected routes never authenticated.
- Removed dead code: empty placeholders (`contentService.js`, `helper.js`,
  `cron.js`), unused `openai` client + dependency, broken ESM `utils/unsplash.js`,
  unused `utils/tags.js`, redundant `testgemni.js`.
- Declared the actually-used `@google/generative-ai` in `content-service` deps.
- Applied DRY/SOLID helpers in the user-service auth controller
  (`issueTokens`, `createAndSendOtp`, `findValidOtp`, `publicProfile`).
- Updated `README.md` and `docs/NEWS_PIPELINE_ARCHITECTURE.md` for Mongo-only +
  Gemini 2.5 + structured output.

## Verification
- `content-service`: all 61 `node:test` unit tests pass; no lint errors.
- Both services load and connect to MongoDB.

## Follow-ups (not automated)
- Existing Postgres user data is not migrated (new schema is ready; a one-time
  export/import would be needed for any production data).
- Set `EMAIL_USER` / `EMAIL_PASS` for OTP email; replace dev JWT secrets before
  any shared/prod deploy.
