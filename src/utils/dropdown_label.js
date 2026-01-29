const HOST_PLATFORM_LABELS = {
  'chatgpt.com': 'ChatGPT',
  'chat.openai.com': 'ChatGPT',
  'claude.ai': 'Claude',
  'gemini.google.com': 'Gemini',
  'aistudio.google.com': 'AI Studio',
  'chat.deepseek.com': 'DeepSeek',
  'perplexity.ai': 'Perplexity',
  'grok.com': 'Grok',
  'www.grok.com': 'Grok',
  'kimi.com': 'Kimi',
  'www.kimi.com': 'Kimi',
  'sora.com': 'Sora',
  'sora.chatgpt.com': 'Sora'
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const prettify_hostname = (hostname) => {
  if (!hostname) return 'Link';
  const parts = hostname.split('.').filter(Boolean);
  const base = parts[0] || hostname;
  return base.charAt(0).toUpperCase() + base.slice(1);
};

const last_path_segment = (url) => {
  try {
    const u = new URL(url);
    const segments = u.pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] || '';
  } catch (_) {
    return '';
  }
};

/**
 * Shorten long ids for dropdown display.
 *
 * Rules:
 * - UUID-like segments: first 8 + "..." + last 4
 * - Other long segments: first 8 + "..." + last 6
 *
 * @param {string} segment
 * @returns {string}
 */
export const shorten_id_segment = (segment) => {
  const s = String(segment || '').trim();
  if (!s) return '';
  if (s.length <= 14) return s;

  const first = s.slice(0, 8);
  const last_len = UUID_REGEX.test(s) ? 4 : 6;
  const last = s.slice(-last_len);

  return `${first}...${last}`;
};

export const platform_label_from_url = (url, fallback = 'Link') => {
  try {
    const host = new URL(url).hostname;
    return HOST_PLATFORM_LABELS[host] || prettify_hostname(host);
  } catch (_) {
    return fallback;
  }
};

export const format_dropdown_label = (url, platform_label = null) => {
  const label = platform_label || platform_label_from_url(url);
  const segment = last_path_segment(url);
  const shortened = shorten_id_segment(segment);
  return shortened ? `${label} • ${shortened}` : label;
};

export { HOST_PLATFORM_LABELS };
