// Cloudflare Pages entry (advanced mode _worker.js). Pages has no cron, so the daily job
// runs once per UTC day on the first request after 11:15 UTC, claimed atomically in D1.
import app from './index.js';

async function maybeDaily(env, ctx) {
  try {
    const now = new Date();
    if (now.getUTCHours() * 60 + now.getUTCMinutes() < 11 * 60 + 15) return;
    const day = now.toISOString().slice(0, 10);
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS daily_runs (day TEXT PRIMARY KEY, ran_at TEXT)").run();
    const r = await env.DB.prepare("INSERT OR IGNORE INTO daily_runs (day, ran_at) VALUES (?, ?)").bind(day, now.toISOString()).run();
    if (r.meta && r.meta.changes === 1) ctx.waitUntil(app.scheduled({ cron: 'first-request', scheduledTime: Date.now() }, env, ctx).catch((e) => console.error('daily job', e)));
  } catch (e) { console.error('daily check', e); }
}

export default {
  async fetch(req, env, ctx) {
    ctx.waitUntil(maybeDaily(env, ctx));
    return app.fetch(req, env, ctx);
  },
};
