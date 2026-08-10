/**
 * In-process cron jobs for content-service.
 *
 * - News feed pipeline: every 2 hours
 * - Question bank generation: every 1 hour (capped topic batch)
 *
 * Toggle with ENABLE_SCHEDULERS=false. Overlap: if a previous tick is still
 * running, the next tick is skipped (ponytail: single-process lock; upgrade
 * path = distributed lock if you ever run multiple replicas).
 */

const cron = require("node-cron");
const { runContentPipeline } = require("../pipeline/contentPipeline");
const { runQuestionGeneration } = require("../scripts/generateQuestions");

const CONTENT_CRON = process.env.CONTENT_PIPELINE_CRON || "0 */2 * * *"; // every 2h
const QUESTIONS_CRON = process.env.QUESTION_BANK_CRON || "0 * * * *"; // every 1h
const CONTENT_MODE = process.env.CONTENT_PIPELINE_MODE || "prod";
const CRON_TZ = process.env.CRON_TZ || "Asia/Kolkata";

/** @type {Map<string, object>} */
const jobRegistry = new Map();

function enabled() {
  return !/^(0|false|no|off)$/i.test(String(process.env.ENABLE_SCHEDULERS ?? "true"));
}

function ensureJob(id, defaults) {
  if (!jobRegistry.has(id)) {
    jobRegistry.set(id, {
      id,
      name: defaults.name,
      cron: defaults.cron,
      timezone: defaults.timezone || CRON_TZ,
      enabled: false,
      running: false,
      // Internal function invoked (schedulers do not hit HTTP).
      invokes: defaults.invokes,
      // Closest manual HTTP trigger, if any.
      equivalent_endpoint: defaults.equivalent_endpoint || null,
      last_started_at: null,
      last_finished_at: null,
      last_status: "never", // never | success | error | skipped
      last_error: null,
      last_duration_ms: null,
      run_count: 0,
      _task: null,
    });
  }
  return jobRegistry.get(id);
}

function nextRunAt(cronExpr, timezone, from = new Date()) {
  if (!cron.validate(cronExpr)) return null;
  // ponytail: walk minute-by-minute up to 48h using node-cron's matcher
  // (ceiling: custom crons with seconds precision; upgrade: cron-parser).
  const probe = cron.schedule(cronExpr, () => {}, { scheduled: false, timezone });
  try {
    const start = new Date(from.getTime());
    start.setSeconds(0, 0);
    start.setTime(start.getTime() + 60_000); // strictly after `from`
    for (let i = 0; i < 60 * 48; i++) {
      const d = new Date(start.getTime() + i * 60_000);
      if (probe.timeMatcher.match(d)) return d.toISOString();
    }
  } finally {
    try {
      probe.stop();
    } catch (_) {
      /* ignore */
    }
  }
  return null;
}

function withLock(jobId, fn) {
  return async () => {
    const job = jobRegistry.get(jobId);
    if (!job) return;
    if (job.running) {
      job.last_status = "skipped";
      job.last_error = "previous run still in progress";
      console.warn(`⏭️  [${jobId}] previous run still in progress — skipping tick`);
      return;
    }
    job.running = true;
    job.last_started_at = new Date().toISOString();
    job.last_error = null;
    const started = Date.now();
    console.log(`⏰ [${jobId}] starting at ${job.last_started_at}`);
    try {
      await fn();
      job.last_status = "success";
      job.run_count += 1;
      console.log(`✅ [${jobId}] finished in ${Math.round((Date.now() - started) / 1000)}s`);
    } catch (err) {
      job.last_status = "error";
      job.last_error = err.message || String(err);
      console.error(`❌ [${jobId}] failed:`, job.last_error);
    } finally {
      job.running = false;
      job.last_finished_at = new Date().toISOString();
      job.last_duration_ms = Date.now() - started;
    }
  };
}

function publicJobView(job) {
  return {
    id: job.id,
    name: job.name,
    cron: job.cron,
    timezone: job.timezone,
    enabled: job.enabled,
    running: job.running,
    invokes: job.invokes,
    equivalent_endpoint: job.equivalent_endpoint,
    last_started_at: job.last_started_at,
    last_finished_at: job.last_finished_at,
    last_status: job.last_status,
    last_error: job.last_error,
    last_duration_ms: job.last_duration_ms,
    run_count: job.run_count,
    next_run_at: job.enabled ? nextRunAt(job.cron, job.timezone) : null,
  };
}

function getSchedulerStatus() {
  // Always expose both known jobs, even before startSchedulers() / when disabled.
  ensureJob("content-pipeline", {
    name: "News feed content pipeline",
    cron: CONTENT_CRON,
    timezone: CRON_TZ,
    invokes: "runContentPipeline(mode)",
    equivalent_endpoint: "POST /api/v1/content/fetch-now",
  });
  ensureJob("question-bank", {
    name: "Question bank generation",
    cron: QUESTIONS_CRON,
    timezone: CRON_TZ,
    invokes: "runQuestionGeneration(opts)",
    equivalent_endpoint: null,
  });
  return {
    enabled: enabled(),
    timezone: CRON_TZ,
    jobs: [...jobRegistry.values()].map(publicJobView),
  };
}

function startSchedulers() {
  const contentJob = ensureJob("content-pipeline", {
    name: "News feed content pipeline",
    cron: CONTENT_CRON,
    timezone: CRON_TZ,
    invokes: "runContentPipeline(mode)",
    equivalent_endpoint: "POST /api/v1/content/fetch-now",
  });
  const questionsJob = ensureJob("question-bank", {
    name: "Question bank generation",
    cron: QUESTIONS_CRON,
    timezone: CRON_TZ,
    invokes: "runQuestionGeneration(opts)",
    equivalent_endpoint: null, // CLI / make generate-questions only
  });

  if (!enabled()) {
    contentJob.enabled = false;
    questionsJob.enabled = false;
    console.log("⏸️  Schedulers disabled (ENABLE_SCHEDULERS=false)");
    return { content: null, questions: null };
  }

  if (!cron.validate(CONTENT_CRON) || !cron.validate(QUESTIONS_CRON)) {
    console.error("❌ Invalid cron expression — check CONTENT_PIPELINE_CRON / QUESTION_BANK_CRON");
    return { content: null, questions: null };
  }

  const opts = { timezone: CRON_TZ };

  contentJob.enabled = true;
  contentJob.cron = CONTENT_CRON;
  contentJob._task = cron.schedule(
    CONTENT_CRON,
    withLock("content-pipeline", async () => {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY missing — skip");
      }
      const result = await runContentPipeline(CONTENT_MODE);
      if (!result?.success) {
        throw new Error(result?.error || "pipeline returned failure");
      }
    }),
    opts
  );

  questionsJob.enabled = true;
  questionsJob.cron = QUESTIONS_CRON;
  questionsJob._task = cron.schedule(
    QUESTIONS_CRON,
    withLock("question-bank", async () => {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY missing — skip");
      }
      await runQuestionGeneration({
        connect: false,
        close: false,
        prelimsPerTopic: parseInt(process.env.QUESTION_PRELIMS_PER_TOPIC || "2", 10) || 2,
        mainsPerTopic: parseInt(process.env.QUESTION_MAINS_PER_TOPIC || "1", 10) || 1,
        minImportance: parseInt(process.env.QUESTION_MIN_IMPORTANCE || "3", 10) || 3,
        topicsPerRun: parseInt(process.env.QUESTION_TOPICS_PER_RUN || "6", 10) || 6,
        delayMs: parseInt(process.env.QUESTION_DELAY_MS || "1200", 10) || 1200,
      });
    }),
    opts
  );

  console.log(
    `🗓️  Schedulers armed (tz=${CRON_TZ}): content "${CONTENT_CRON}", questions "${QUESTIONS_CRON}"`
  );
  return { content: contentJob._task, questions: questionsJob._task };
}

module.exports = {
  startSchedulers,
  getSchedulerStatus,
  nextRunAt,
  // test helpers
  _ensureJob: ensureJob,
  _jobRegistry: jobRegistry,
};
