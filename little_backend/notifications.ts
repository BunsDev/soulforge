interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  attempts: number;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

const queue: EmailMessage[] = [];
const deadLetters: EmailMessage[] = [];
let processing = false;

export function sendEmail(to: string, subject: string, body: string) {
  queue.push({ to, subject, body, attempts: 0 });
  processQueue();
}

async function processQueue() {
  if (processing) return;
  processing = true;
  while (queue.length > 0) {
    const msg = queue.shift()!;
    let delivered = false;

    while (msg.attempts < MAX_RETRIES && !delivered) {
      msg.attempts++;
      try {
        await deliver(msg.to, msg.subject, msg.body);
        delivered = true;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(
          `[email] delivery failed (attempt ${msg.attempts}/${MAX_RETRIES}) to=${msg.to}: ${reason}`,
        );
        if (msg.attempts < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * msg.attempts));
        }
      }
    }

    if (!delivered) {
      console.error(`[email] moved to dead-letter queue: to=${msg.to} subject="${msg.subject}"`);
      deadLetters.push(msg);
    }
  }
  processing = false;
}

async function deliver(to: string, subject: string, body: string) {
  await new Promise((r) => setTimeout(r, 100));
  console.log(`[email] ${to}: ${subject}`);
}

export function getQueueLength() {
  return queue.length;
}

export function getDeadLetters() {
  return deadLetters.map(({ to, subject, body, attempts }) => ({ to, subject, body, attempts }));
}

export function retryDeadLetters(): number {
  const count = deadLetters.length;
  const items = deadLetters.splice(0);
  for (const msg of items) {
    sendEmail(msg.to, msg.subject, msg.body);
  }
  return count;
}

export async function sendSMS(phone: string, message: string): Promise<boolean> {
  const maxAttempts = MAX_RETRIES;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await deliverSMS(phone, message);
      return true;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[sms] delivery failed (attempt ${attempt}/${maxAttempts}) phone=${phone}: ${reason}`);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
      }
    }
  }
  console.error(`[sms] permanently failed: phone=${phone}`);
  return false;
}

async function deliverSMS(phone: string, message: string) {
  await new Promise((r) => setTimeout(r, 50));
  console.log(`[sms] ${phone}: ${message}`);
}
