import { FuzzySuggestModal } from 'obsidian';

/**
 * @typedef {import('../utils/chatgpt_conversation_item.js').ChatgptConversationItem} ChatgptConversationItem
 */
/**
 * @param {string} value
 * @returns {string}
 */
const shorten_thread_id = (value) => {
  const s = String(value || '').trim();
  if (!s) return '';
  if (s.length <= 14) return s;
  return `${s.slice(0, 8)}...${s.slice(-4)}`;
};
export class ChatgptThreadSuggestModal extends FuzzySuggestModal {
  /**
   * @param {import('obsidian').App} app
   * @param {Object} opts
   * @param {ChatgptConversationItem[]} opts.threads
   * @param {(thread: ChatgptConversationItem)} opts.on_choose
   */
  constructor(app, opts = {}) {
    super(app);

    this.threads = Array.isArray(opts.threads) ? opts.threads : [];
    this.on_choose_thread = typeof opts.on_choose === 'function' ? opts.on_choose : null;

    this.setPlaceholder('Filter detected threads...');
  }

  getItems() {
    return this.threads;
  }

  getItemText(item) {
    console.log('getItemText item:', item);
    const title = String(item?.title || '').trim();
    if (title) return title;

    const id_short = shorten_thread_id(item?.id);
    return id_short ? `Untitled (${id_short})` : 'Untitled';
  }

  onChooseItem(item) {
    if (this.on_choose_thread) this.on_choose_thread(item);
  }
}
