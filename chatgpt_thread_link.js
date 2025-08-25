import { URL } from 'url';

const SUPPORTED_DOMAINS = ['chatgpt.com', 'operator.chatgpt.com', 'sora.com'];
const GPT_THREAD_REGEX = /^\/g\/[^/]+\/c\/[a-f0-9-]+\/?$/i;
const SORA_TASK_REGEX = /^\/t\/[a-f0-9-]+\/?$/i;
const CODEX_TASK_REGEX = /^\/codex\/tasks\/[a-z0-9-_]+\/?$/i;
const CHAT_THREAD_REGEX = /^\/c\/[a-f0-9-]+\/?$/i;

/**
 * Determine if a URL points to a ChatGPT thread or task.
 *
 * @param {string} url - URL to test.
 * @returns {boolean} True when the URL matches a supported thread.
 */
export function is_chatgpt_thread_link(url) {
  try {
    const u = new URL(url);
    if (!SUPPORTED_DOMAINS.includes(u.hostname)) return false;
    const path = u.pathname;
    return (
      CHAT_THREAD_REGEX.test(path) ||
      GPT_THREAD_REGEX.test(path) ||
      CODEX_TASK_REGEX.test(path) ||
      SORA_TASK_REGEX.test(path)
    );
  } catch {
    return false;
  }
}
