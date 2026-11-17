import { FeedbackBody, buildFeedbackEvent, createFeedbackPublisher } from '../events/feedbackEvents.js';
import { callerKey } from '../middleware/quota.js';
import { feedbackEvents } from '../observability/metrics.js';

const defaultSend = createFeedbackPublisher();

/** 202: accepted for asynchronous processing. The shopper never waits on Kafka. */
export async function postFeedback(req, res) {
  const parsed = FeedbackBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid feedback', issues: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`) });
  }
  // Identity: the signed-in user if there is a valid token, otherwise the client's anonymous session id.
  const who = callerKey(req);
  const identity = who.startsWith('u:') ? who : parsed.data.sessionId;
  const event = buildFeedbackEvent(parsed.data, identity || who);
  const send = req.app.locals.feedbackSend || defaultSend;
  const result = await send(event);
  feedbackEvents.inc({ action: parsed.data.action, result });
  res.status(202).json({ accepted: true, eventId: event.eventId });
}
