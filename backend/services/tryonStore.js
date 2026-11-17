/** Mongo-backed store for the try-on queue (same interface as createMemoryStore). */
import TryOnJob from '../models/TryOnJob.js';

const strip = (doc) => {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return rest;
};

export function createMongoTryonStore(Model = TryOnJob) {
  return {
    async save(job) {
      const { id, owner, cacheKey, status, resultUrl, provider, error, reason, cached, createdAt, startedAt, finishedAt } = job;
      await Model.updateOne({ id }, { $set: { owner, cacheKey, status, resultUrl, provider, error, reason, cached, createdAt, startedAt, finishedAt } }, { upsert: true });
    },
    async get(id) {
      return strip(await Model.findOne({ id }).lean());
    },
    async findDoneByKey(cacheKey, since) {
      return strip(
        await Model.findOne({ cacheKey, status: 'done', finishedAt: { $gte: since }, resultUrl: { $exists: true, $ne: null } })
          .sort({ finishedAt: -1 })
          .lean(),
      );
    },
    /** Jobs left queued/running by a process that died: their image buffers are gone, so fail them. */
    async failStale(reason) {
      const res = await Model.updateMany(
        { status: { $in: ['queued', 'running'] } },
        { $set: { status: 'failed', error: 'The server restarted while this was running. Please try again.', reason, finishedAt: Date.now() } },
      );
      return res.modifiedCount;
    },
    async pruneOld(days = 30) {
      const res = await Model.deleteMany({ finishedAt: { $lt: Date.now() - days * 24 * 3600 * 1000 } });
      return res.deletedCount;
    },
  };
}
