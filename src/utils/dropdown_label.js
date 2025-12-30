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
  'sora.com': 'Sora',
  'sora.chatgpt.com': 'Sora'
};

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
  return segment ? `${label} • ${segment}` : label;
};

export { HOST_PLATFORM_LABELS };
