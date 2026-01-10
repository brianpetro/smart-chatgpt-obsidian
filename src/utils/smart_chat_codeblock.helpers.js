import { URL } from 'url';
export function extract_links_from_source({ codeblock_source, link_regex }) {
  const lines = String(codeblock_source || '').split('\n');
  const result = [];
  const regex = link_regex || /(https?:\/\/[^\s]+)/g;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('chat-done:: ')) {
      const tokens = trimmed.split(/\s+/);
      const possible_url = tokens[tokens.length - 1];
      if (possible_url.startsWith('http')) {
        result.push({ url: possible_url, done: true });
      }
      continue;
    }

    if (trimmed.startsWith('chat-active:: ')) {
      const tokens = trimmed.split(/\s+/);
      const possible_url = tokens[tokens.length - 1];
      if (possible_url.startsWith('http')) {
        result.push({ url: possible_url, done: false });
      }
      continue;
    }

    const found = line.match(regex) || [];
    for (const f of found) {
      result.push({ url: f, done: false });
    }
  }

  return result;
}

export function normalize_url_value(url) {
  try {
    const normalized_url = new URL(url);
    normalized_url.search = '';
    normalized_url.hash = '';
    return normalized_url.toString();
  } catch (_) {
    return url;
  }
}

export function resolve_initial_fallback_url({ initial_fallback_url, fallback_url }) {
  if (initial_fallback_url && typeof initial_fallback_url === 'string') {
    return initial_fallback_url;
  }
  return fallback_url;
}

export function resolve_initial_link_from_links({ links = [], initial_fallback_url, fallback_url }) {
  const not_done_link_obj = (links || []).find(link_obj => link_obj && !link_obj.done && link_obj.url);
  if (not_done_link_obj?.url) return not_done_link_obj.url;
  return resolve_initial_fallback_url({ initial_fallback_url, fallback_url });
}

export function prefix_missing_chat_lines({ lines, start, end, link_regex, now_seconds }) {
  const regex = link_regex || /(https?:\/\/[^\s]+)/g;
  const updated_lines = Array.isArray(lines) ? [...lines] : [];
  let changed = false;

  if (typeof start !== 'number' || typeof end !== 'number') {
    return { lines: updated_lines, changed };
  }

  for (let index = start + 1; index < end; index++) {
    const line = updated_lines[index];
    if (typeof line !== 'string') continue;

    const trimmed = line.trim();
    if (trimmed.startsWith('chat-active:: ') || trimmed.startsWith('chat-done:: ')) {
      continue;
    }

    const found = line.match(regex) || [];
    if (found.length > 0) {
      const timestamp_in_seconds = typeof now_seconds === 'number'
        ? now_seconds
        : Math.floor(Date.now() / 1000);
      updated_lines[index] = `chat-active:: ${timestamp_in_seconds} ${trimmed}`;
      changed = true;
    }
  }

  return { lines: updated_lines, changed };
}

/**
 * Determine if a URL points to a Grok conversation thread.
 *
 * Supports:
 * - https://grok.com/c/<thread-id>
 * - https://grok.com/chat/<thread-id>
 *
 * @param {string} url - URL to test.
 * @returns {boolean} True when the URL matches a supported thread.
 */
export function is_grok_thread_link(url) {
  const SUPPORTED_DOMAINS = [
    'grok.com',
    'www.grok.com'
  ];
  try {
    const u = new URL(url);
    if (!SUPPORTED_DOMAINS.includes(u.hostname)) return false;

    const segments = (u.pathname || '')
      .split('/')
      .filter(Boolean)
      .map(s => String(s).toLowerCase());

    // Expect at least: /c/<id> or /chat/<id>
    if (segments.length < 2) return false;

    const [prefix, id] = segments;

    if (!id) return false;

    if (prefix === 'c') return true;
    if (prefix === 'chat') return true;

    return false;
  } catch {
    return false;
  }
}

/**
 * Determine if a URL points to an Open WebUI chat thread.
 *
 * Typical routes:
 * - http://localhost:3000/c/<chat-id>
 * - https://openwebui.example.com/c/<chat-id>
 *
 * Supports hosting under a subpath by searching for a '/c/<id>' segment pair.
 *
 * @param {string} url - URL to test.
 * @returns {boolean} True when the URL matches a supported thread.
 */
export function is_openwebui_thread_link(url) {
  try {
    const parsed_url = new URL(url);

    const segments = (parsed_url.pathname || '')
      .split('/')
      .filter(Boolean)
      .map(segment => String(segment).toLowerCase());

    const c_index = segments.indexOf('c');
    if (c_index < 0) return false;

    const thread_id = segments[c_index + 1];
    if (!thread_id) return false;

    if (thread_id === 'new') return false;

    return true;
  } catch {
    return false;
  }
}
