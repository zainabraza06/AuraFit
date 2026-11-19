/**
 * memoryProfile.js — decide whether this process has the RAM to run the local embedding models.
 *
 * Measured (process RSS, see docs/deploy.md): the plain API ~190 MB, + the Qwen3 text model ~920 MB,
 * + the FashionCLIP image model ~1,120 MB. A 512 MB host (Render free tier, small containers) cannot hold either
 * model: the process is killed for running out of memory. So local models are used only when the memory limit allows
 * it, and everything that needs them degrades to the existing keyword / description-only paths otherwise.
 *
 * Overrides: LOCAL_MODELS=true|false forces the decision; MEMORY_LIMIT_MB=<n> states the limit for hosts that report
 * it wrongly (and lets you rehearse a small host locally).
 */
import fs from 'node:fs';
import os from 'node:os';

/** Smallest memory limit (MB) at which the text model fits with headroom for the API and the vector cache. */
export const MIN_MB_TEXT_MODEL = 1800;
/** With the image model loaded as well. */
export const MIN_MB_BOTH_MODELS = 2400;

const readNumber = (file, readFile) => {
  try {
    const raw = String(readFile(file, 'utf8')).trim();
    if (!raw || raw === 'max') return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
};

/**
 * Memory this process may actually use, in MB: the container (cgroup v2 / v1) limit when there is one, otherwise the
 * machine's total. Containers often report the HOST's RAM in os.totalmem(), which is why the cgroup file comes first.
 */
export function memoryLimitMB({ readFile = fs.readFileSync, totalmem = os.totalmem } = {}) {
  const candidates = [
    readNumber('/sys/fs/cgroup/memory.max', readFile), // cgroup v2
    readNumber('/sys/fs/cgroup/memory/memory.limit_in_bytes', readFile), // cgroup v1
  ].filter((n) => n && n < 2 ** 50); // v1 reports ~9.2e18 for "unlimited"
  const bytes = candidates.length ? Math.min(...candidates, totalmem()) : totalmem();
  return Math.round(bytes / 1048576);
}

/**
 * @param {{ env?: NodeJS.ProcessEnv, limitMB?: number }} [opts]
 * @returns {{ text: boolean, image: boolean, limitMB: number, reason: string }}
 */
export function localModelPolicy({ env = process.env, limitMB = Number(env.MEMORY_LIMIT_MB) || memoryLimitMB() } = {}) {
  const forced = String(env.LOCAL_MODELS || '').toLowerCase();
  if (forced === 'true') return { text: true, image: true, limitMB, reason: 'forced on by LOCAL_MODELS=true' };
  if (forced === 'false') return { text: false, image: false, limitMB, reason: 'forced off by LOCAL_MODELS=false' };
  const text = limitMB >= MIN_MB_TEXT_MODEL;
  const image = limitMB >= MIN_MB_BOTH_MODELS;
  const reason = text
    ? image ? `${limitMB} MB available: both models fit` : `${limitMB} MB available: text model only (image model needs ${MIN_MB_BOTH_MODELS} MB)`
    : `${limitMB} MB available: local models need at least ${MIN_MB_TEXT_MODEL} MB, using keyword search`;
  return { text, image, limitMB, reason };
}

let cached;
/** The policy for this process (computed once; the limit does not change while running). */
export function currentPolicy() {
  cached ||= localModelPolicy();
  return cached;
}

export function _resetPolicyForTests() {
  cached = undefined;
}
