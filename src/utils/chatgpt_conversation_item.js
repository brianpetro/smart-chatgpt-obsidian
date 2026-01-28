/**
 * @typedef {Object} ChatgptConversationItem
 * @property {string} id
 * @property {string} [title]
 * @property {string|null} [gizmo_id]
 * @property {string|null} [create_time]
 * @property {string|null} [update_time]
 * @property {boolean} [is_archived]
 * @property {boolean|null} [is_starred]
 */

/**
 * @param {string|null|undefined} iso_value
 * @returns {number}
 */
const parse_iso_time_to_ms = (iso_value) => {
  const raw_value = String(iso_value || '').trim();
  if (!raw_value) return 0;
  const ms = Date.parse(raw_value);
  return Number.isFinite(ms) ? ms : 0;
};

/**
 * @param {ChatgptConversationItem} item
 * @returns {number}
 */
export const get_chatgpt_conversation_sort_key_ms = (item) => {
  if (!item) return 0;
  const update_ms = parse_iso_time_to_ms(item.update_time);
  if (update_ms) return update_ms;
  return parse_iso_time_to_ms(item.create_time);
};

const DEFAULT_BASE_URL = 'https://chatgpt.com';

/**
 * Build a ChatGPT thread URL from a backend-api/conversations item.
 *
 * - Normal: https://chatgpt.com/c/<conversation-id>
 * - Custom GPT (gizmo): https://chatgpt.com/g/<gizmo-id>/c/<conversation-id>
 *
 * @param {ChatgptConversationItem} thread
 * @param {Object} [opts]
 * @param {string} [opts.base_url]
 * @returns {string}
 */
export function build_chatgpt_conversation_url(thread, opts = {}) {
  const base_url = String(opts.base_url || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const conversation_id = String(thread?.id || '').trim();
  if (!conversation_id) return '';

  const gizmo_id = String(thread?.gizmo_id || '').trim();
  if (gizmo_id) return `${base_url}/g/${gizmo_id}/c/${conversation_id}`;

  return `${base_url}/c/${conversation_id}`;
}

/**
 * Merge + dedupe ChatGPT conversation items by id, keeping the most recent (update_time/create_time).
 *
 * @param {ChatgptConversationItem[]} existing
 * @param {ChatgptConversationItem[]} incoming
 * @returns {ChatgptConversationItem[]}
 */
export function merge_chatgpt_conversation_items(existing = [], incoming = []) {
  /** @type {Map<string, ChatgptConversationItem>} */
  const by_id = new Map();

  /**
   * @param {ChatgptConversationItem} item
   */
  const consider = (item) => {
    const conversation_id = String(item?.id || '').trim();
    if (!conversation_id) return;

    const current = by_id.get(conversation_id);
    if (!current) {
      by_id.set(conversation_id, item);
      return;
    }

    const current_key = get_chatgpt_conversation_sort_key_ms(current);
    const next_key = get_chatgpt_conversation_sort_key_ms(item);

    if (next_key > current_key) {
      by_id.set(conversation_id, item);
      return;
    }

    if (next_key === current_key) {
      const cur_title = String(current?.title || '').trim();
      const next_title = String(item?.title || '').trim();
      if (!cur_title && next_title) by_id.set(conversation_id, item);
    }
  };

  (Array.isArray(existing) ? existing : []).forEach(consider);
  (Array.isArray(incoming) ? incoming : []).forEach(consider);

  const merged = Array.from(by_id.values());

  merged.sort((a, b) => {
    const a_key = get_chatgpt_conversation_sort_key_ms(a);
    const b_key = get_chatgpt_conversation_sort_key_ms(b);
    if (b_key !== a_key) return b_key - a_key;

    const a_title = String(a?.title || '').toLowerCase();
    const b_title = String(b?.title || '').toLowerCase();
    if (a_title < b_title) return -1;
    if (a_title > b_title) return 1;
    return 0;
  });

  return merged;
}
