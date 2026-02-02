import { URL } from 'url';

const DEFAULT_LINK_REGEX = /(https?:\/\/[^\s]+)/g;
const MARKDOWN_LINK_REGEX = /\((https?:\/\/[^)\s]+)\)/g;
const URL_TRAILING_CHARS_REGEX = /[)\].,>;:"']+$/;
const URL_LEADING_CHARS_REGEX = /^[<(]+/;

export function strip_wrapping_url_chars(url_value) {
  const raw_value = String(url_value || '');
  const no_trailing = raw_value.replace(URL_TRAILING_CHARS_REGEX, '');
  return no_trailing.replace(URL_LEADING_CHARS_REGEX, '');
}

export function extract_urls_from_line({ line, link_regex }) {
  const raw_line = String(line || '');
  const regex = link_regex || DEFAULT_LINK_REGEX;
  const urls = [];

  let md_match = null;
  while ((md_match = MARKDOWN_LINK_REGEX.exec(raw_line)) !== null) {
    urls.push(md_match[1]);
  }

  const raw_matches = raw_line.match(regex) || [];
  raw_matches.forEach(match => {
    urls.push(strip_wrapping_url_chars(match));
  });

  return Array.from(new Set(urls.filter(Boolean)));
}

export function line_contains_url({ line, target_url, link_regex }) {
  if (!line || !target_url) return false;
  const normalized_target_url = normalize_url_value(target_url);
  const candidates = extract_urls_from_line({ line, link_regex });
  return candidates.some(candidate => {
    if (!candidate) return false;
    const normalized_candidate = normalize_url_value(candidate);
    return (
      candidate === target_url ||
      candidate === normalized_target_url ||
      normalized_candidate === normalized_target_url
    );
  });
}

export function extract_links_from_source({ codeblock_source, link_regex }) {
  const lines = String(codeblock_source || '').split('\n');
  const result = [];
  const regex = link_regex || DEFAULT_LINK_REGEX;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('chat-done:: ')) {
      const [url_token] = extract_urls_from_line({ line: trimmed, link_regex: regex });
      if (url_token) result.push({ url: url_token, done: true });
      continue;
    }

    if (trimmed.startsWith('chat-active:: ')) {
      const [url_token] = extract_urls_from_line({ line: trimmed, link_regex: regex });
      if (url_token) result.push({ url: url_token, done: false });
      continue;
    }

    const found = extract_urls_from_line({ line, link_regex: regex });
    for (const url of found) {
      result.push({ url, done: false });
    }
  }

  return result;
}

export function normalize_url_value(url) {
  try {
    const normalized_url = new URL(url);
    normalized_url.search = '';
    normalized_url.hash = '';
    const path_name = normalized_url.pathname || '';
    if (path_name && path_name !== '/' && path_name.endsWith('/')) {
      normalized_url.pathname = path_name.replace(/\/+$/, '');
    }
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

export function resolve_add_thread_button_anchor({
  build_context_button_el,
  footer_parent_el,
  header_parent_el
}) {
  const build_parent = build_context_button_el?.parentElement || null;
  if (build_parent) {
    return {
      parent_el: build_parent,
      insert_before_el: build_context_button_el?.nextSibling || null
    };
  }

  if (footer_parent_el) {
    return {
      parent_el: footer_parent_el,
      insert_before_el: footer_parent_el.firstChild || null
    };
  }

  if (header_parent_el) {
    return { parent_el: header_parent_el, insert_before_el: null };
  }

  return { parent_el: null, insert_before_el: null };
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

/**
 * Determine if a URL points to a Kimi chat thread.
 *
 * Kimi threads are commonly shared under:
 * - https://www.kimi.com/share/<id>
 * - https://www.kimi.com/share/en/<id>
 *
 * We treat any '/share/.../<id>' route as a thread, with an optional language
 * segment between 'share' and the id.
 *
 * @param {string} url - URL to test.
 * @returns {boolean} True when the URL matches a supported Kimi thread.
 */
export function is_kimi_thread_link(url) {
  const SUPPORTED_DOMAINS = [
    'kimi.com',
    'www.kimi.com'
  ];

  try {
    const u = new URL(url);
    if (!SUPPORTED_DOMAINS.includes(u.hostname)) return false;

    const segments = (u.pathname || '')
      .split('/')
      .filter(Boolean)
      .map(segment => String(segment));

    const share_index = segments.findIndex(s => String(s).toLowerCase() === 'chat');
    if (share_index < 0) return false;

    const next_segment = segments[share_index + 1];
    if (!next_segment) return false;

    let id_index = share_index + 1;

    const maybe_locale = String(segments[id_index] || '').toLowerCase();
    if (maybe_locale.length === 2 || maybe_locale === 'en') {
      id_index += 1;
    }

    const thread_id = segments[id_index];
    if (!thread_id) return false;

    return true;
  } catch {
    return false;
  }
}
