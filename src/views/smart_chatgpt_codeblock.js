import { SmartChatCodeblock } from './smart_chat_codeblock.js';
import { is_chatgpt_thread_link } from '../utils/chatgpt_thread_link.js';
import { build_codex_diff_loader_execute_script } from '../utils/build_codex_diff_loader_execute_script.js';
import {
  line_contains_url,
  resolve_add_thread_button_anchor,
} from '../utils/smart_chat_codeblock.helpers.js';
import {
  build_chatgpt_conversation_url,
  merge_chatgpt_conversation_items,
} from '../utils/chatgpt_conversation_item.js';
import { ChatgptThreadSuggestModal } from '../modals/add_thread_suggest_modal.js';

const CODEX_TASK_PATH_REGEX = /^\/codex\/tasks\/[a-z0-9-_]+\/?$/i;

const CODEX_HOSTNAMES = new Set([
  'chatgpt.com',
  'chat.openai.com'
]);

const ADD_THREAD_BUTTON_LABEL = 'Add thread';

/**
 * @param {Object} params
 * @param {HTMLElement|null} params.footer_parent_el
 * @param {HTMLElement|null} params.status_parent_el
 * @returns {HTMLElement|null}
 */
export const resolve_codex_diff_button_parent = ({ footer_parent_el, status_parent_el }) => {
  return footer_parent_el || status_parent_el || null;
};

/**
 * @param {string} url
 * @returns {boolean}
 */
const is_codex_task_url = (url) => {
  try {
    const u = new URL(url);
    if (!CODEX_HOSTNAMES.has(u.hostname)) return false;
    return CODEX_TASK_PATH_REGEX.test(u.pathname || '');
  } catch (_) {
    return false;
  }
};

export class SmartChatgptCodeblock extends SmartChatCodeblock {
  /**
   * @param {Object} options
   * @param {import('obsidian').Plugin} options.plugin - The parent plugin instance.
   * @param {import('obsidian').TFile} options.file - The file containing the codeblock.
   * @param {number} options.line_start - The start line of the codeblock.
   * @param {number} options.line_end - The end line of the codeblock.
   * @param {HTMLElement} options.container_el - The container where this codeblock UI is rendered.
   * @param {string} options.source - The raw text inside the ```smart-chatgpt codeblock.
   */
  constructor(opts = {}) {
    super(opts);

    this.link_regex = /(https?:\/\/[^\s]+)/g;

    this._FALLBACK_URL = 'https://chatgpt.com';

    this.links = this._extract_links(this.source);

    const not_done_link_obj = this.links.find(obj => !obj.done);
    this.initial_link = not_done_link_obj ? not_done_link_obj.url : this._FALLBACK_URL;

    this.last_detected_url = this.initial_link;
    this.current_url = this.initial_link;

    this.codex_diff_button_el = null;
    this._codex_diff_button_busy = false;

    this.add_thread_button_el = null;
    this._add_thread_button_busy = false;
  }

  async build() {
    // Avoid stale element refs across rebuilds (base empties container).
    this.codex_diff_button_el = null;
    this._codex_diff_button_busy = false;

    this.add_thread_button_el = null;
    this._add_thread_button_busy = false;

    await super.build();

    // Best-effort sync after full build; _render_save_ui also syncs.
    this._sync_codex_diff_button(this.current_url);

    // Detected threads may already exist (if rebuild); ensure button state matches.
    this._sync_add_thread_button();
  }

  add_dropdown_options() {
    const new_codex_opt = this.dropdown_el.createEl('option');
    new_codex_opt.value = 'https://chatgpt.com/codex';
    new_codex_opt.textContent = 'New Codex';

    const new_sora_opt = this.dropdown_el.createEl('option');
    new_sora_opt.value = 'https://sora.chatgpt.com/drafts';
    new_sora_opt.textContent = 'New Sora';

    super.add_dropdown_options();
  }

  _is_thread_link(url) {
    return is_chatgpt_thread_link(url);
  }

  _ensure_codex_diff_button() {
    if (this.codex_diff_button_el) return;
    if (!this.container_el) return;

    const footer_parent_el = this.container_el.querySelector?.('.sc-bottom-row-right') || null;
    const status_parent_el = this.status_text_el?.parentElement || null;
    const parent_el = resolve_codex_diff_button_parent({ footer_parent_el, status_parent_el });
    if (!parent_el || typeof parent_el.createEl !== 'function') return;

    const btn = parent_el.createEl('button', {
      text: 'Load diffs',
      cls: 'sc-codex-diff-button sc-hidden'
    });

    btn.setAttribute('aria-label', 'Codex: expand all diff sections and click any Load diff buttons');

    if (footer_parent_el && parent_el.insertBefore) {
      const insert_target = parent_el.firstChild;
      if (insert_target) {
        try {
          parent_el.insertBefore(btn, insert_target);
        } catch (_) {}
      }
    } else if (this.status_text_el) {
      // Fallback: place before the status text in the header row.
      try {
        parent_el.insertBefore(btn, this.status_text_el);
      } catch (_) {}
    }

    btn.onclick = async () => {
      await this._run_codex_diff_loader_for_current_url();
    };

    this.codex_diff_button_el = btn;
  }

  _set_codex_diff_button_visible(visible) {
    if (!this.codex_diff_button_el) return;

    if (visible) {
      try {
        this.codex_diff_button_el.classList.remove('sc-hidden');
      } catch (_) {}
      try {
        this.codex_diff_button_el.style.display = '';
      } catch (_) {}
      return;
    }

    try {
      this.codex_diff_button_el.classList.add('sc-hidden');
    } catch (_) {}
    try {
      this.codex_diff_button_el.style.display = 'none';
    } catch (_) {}
  }

  _sync_codex_diff_button(url) {
    this._ensure_codex_diff_button();

    const has_webview = !!(this._supports_webview && this.webview_el && typeof this.webview_el.executeJavaScript === 'function');
    const should_show = has_webview && is_codex_task_url(String(url || ''));

    this._set_codex_diff_button_visible(should_show);
  }

  async _run_codex_diff_loader_for_current_url() {
    if (this._codex_diff_button_busy) return;
    if (!this._supports_webview || !this.webview_el) return;

    const raw_url = this.current_url || this.last_detected_url || '';
    const normalized = this._normalize_url(raw_url);

    if (!is_codex_task_url(normalized)) {
      this._sync_codex_diff_button(raw_url);
      return;
    }

    const btn = this.codex_diff_button_el;
    const original_text = btn?.textContent || 'Load diffs';

    this._codex_diff_button_busy = true;

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Loading diffs...';
    }

    try {
      const execute_script = build_codex_diff_loader_execute_script({ expected_url: normalized });
      await this.webview_el.executeJavaScript(execute_script);
    } catch (err) {
      console.error('Codex diff loader injection failed:', err);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = original_text;
      }
      this._codex_diff_button_busy = false;
    }
  }

  _ensure_add_thread_button() {
    if (this.add_thread_button_el) return;
    if (!this.container_el) return;

    const footer_parent_el = this.container_el.querySelector?.('.sc-bottom-row-left') || null;
    const header_parent_el = this.container_el.querySelector?.('.sc-top-row') || null;
    const { parent_el, insert_before_el } = resolve_add_thread_button_anchor({
      build_context_button_el: this.build_context_button_el,
      footer_parent_el,
      header_parent_el
    });

    if (!parent_el || typeof parent_el.createEl !== 'function') return;

    const btn = parent_el.createEl('button', {
      text: ADD_THREAD_BUTTON_LABEL,
      cls: 'sc-add-thread-button sc-hidden'
    });

    btn.setAttribute('aria-label', 'Add a thread from detected ChatGPT conversations');

    if (parent_el.insertBefore) {
      try {
        parent_el.insertBefore(btn, insert_before_el);
      } catch (_) {}
    }

    btn.onclick = () => {
      this._open_add_thread_modal();
    };

    this.add_thread_button_el = btn;
  }

  _set_add_thread_button_visible(visible) {
    if (!this.add_thread_button_el) return;

    if (visible) {
      try {
        this.add_thread_button_el.classList.remove('sc-hidden');
      } catch (_) {}
      try {
        this.add_thread_button_el.style.display = '';
      } catch (_) {}
      return;
    }

    try {
      this.add_thread_button_el.classList.add('sc-hidden');
    } catch (_) {}
    try {
      this.add_thread_button_el.style.display = 'none';
    } catch (_) {}
  }

  /**
   * Called by handle_chatgpt_threads_list_detection() when new conversation items are merged in.
   */
  _on_detected_threads_updated() {
    this._sync_add_thread_button();
  }

  _get_detected_thread_suggestions() {
    const threads = Array.isArray(this._detected_threads) ? this._detected_threads : [];
    return merge_chatgpt_conversation_items([], threads).filter(t => String(t?.id || '').trim());
  }

  _sync_add_thread_button() {
    this._ensure_add_thread_button();
    const has_threads = this._get_detected_thread_suggestions().length > 0;
    this._set_add_thread_button_visible(has_threads);
  }

  _open_add_thread_modal() {
    const threads = this._get_detected_thread_suggestions();

    if (!threads.length) {
      this.plugin?.notices?.show?.('No threads detected yet.');
      return;
    }

    const modal = new ChatgptThreadSuggestModal(this.plugin.app, {
      threads,
      on_choose: (thread) => {
        this._add_detected_thread_to_codeblock(thread);
      }
    });

    modal.open();
  }

  async _add_detected_thread_to_codeblock(thread) {
    if (this._add_thread_button_busy) return;

    const raw_url = build_chatgpt_conversation_url(thread);
    const url = this._normalize_url(raw_url);

    if (!url || !url.startsWith('http')) {
      this.plugin?.notices?.show?.('Could not build a valid ChatGPT thread URL.');
      return;
    }

    const btn = this.add_thread_button_el;
    const original_text = btn?.textContent || ADD_THREAD_BUTTON_LABEL;

    this._add_thread_button_busy = true;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Adding...';
    }

    try {
      const already_saved = await this._check_if_saved?.(url);
      if (!already_saved) {
        await this._insert_link_into_codeblock(url);
        this.plugin.env?.events?.emit?.('chat_codeblock:added_thread', { url, origin: 'detected_threads' });
        this.plugin?.notices?.show?.('Added thread to codeblock.');
      } else {
        this.plugin?.notices?.show?.('Thread already saved in this codeblock.');
      }

      this.current_url = url;
      this._skip_auto_save_url = url;

      // Ensure dropdown options include it and select it.
      try {
        this._build_dropdown();
      } catch (_) {}

      if (this.webview_el) {
        this.webview_el.setAttribute('src', url);
      }

      if (typeof this._render_save_ui === 'function') {
        await this._render_save_ui(url);
      }
    } catch (err) {
      console.error('Failed adding detected thread:', err);
      this.plugin?.notices?.show?.('Failed to add thread. See console.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = original_text;
      }
      this._add_thread_button_busy = false;
    }
  }

  async _render_save_ui(url) {
    // Keep the button in sync on every URL change and dropdown selection.
    this._sync_codex_diff_button(url);

    // Keep Add thread visibility synced (in case rebuilds happen mid-session).
    this._sync_add_thread_button();

    this._set_status_text('');
    this._hide_mark_done_button();

    if (!url.startsWith('http')) {
      this._set_status_text('No valid link to save.');
      return;
    }
    if (!this._is_thread_link(url)) {
      this._set_status_text('Not a thread link (no save/done).');
      return;
    }

    const link_to_check = this._normalize_url(url);
    const is_done = await this._check_if_done(link_to_check);

    if (!is_done) {
      this._show_mark_done_button();
      if (this.mark_done_button_el) {
        this.mark_done_button_el.onclick = async () => {
          await this._mark_thread_done_in_codeblock(link_to_check);
          this.plugin.env?.events?.emit('chat_codeblock:marked_done', { url: link_to_check });
          this.plugin.notices.show('Marked thread as done.');
          this._render_save_ui(this.current_url);
        };
      }
    }
  }

  async _check_if_saved(url) {
    if (!this.file) return false;
    try {
      const raw_data = await this.plugin.app.vault.read(this.file);
      const [start, end] = this._find_codeblock_boundaries(raw_data);
      if (start < 0 || end < 0 || end <= start) return false;

      const lines = raw_data.split('\n').slice(start + 1, end);
      for (const line of lines) {
        if (line_contains_url({ line, target_url: url, link_regex: this.link_regex })) {
          return true;
        }
      }
      return false;
    } catch (err) {
      console.error('Error checking if link is saved:', err);
      return false;
    }
  }

  async _check_if_done(url) {
    if (!this.file) return false;
    try {
      const raw_data = await this.plugin.app.vault.read(this.file);
      const [start, end] = this._find_codeblock_boundaries(raw_data);
      if (start < 0 || end < 0 || end <= start) return false;

      const lines = raw_data.split('\n').slice(start + 1, end);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('chat-done:: ')) continue;
        if (line_contains_url({ line, target_url: url, link_regex: this.link_regex })) {
          return true;
        }
      }
      return false;
    } catch (err) {
      console.error('Error reading file for done-check:', err);
      return false;
    }
  }

  async _mark_thread_done_in_codeblock(url) {
    if (!this.file) return;
    let next_url = '';
    await this.plugin.app.vault.process(this.file, (file_data) => {
      const lines = file_data.split('\n');
      const [start, end] = this._find_codeblock_boundaries(file_data);
      if (start < 0 || end < 0) {
        console.warn('Cannot find codeblock boundaries to mark done:', url);
        return file_data;
      }

      let done_line_index = -1;
      for (let i = start + 1; i < end; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('chat-active:: ') && trimmed.includes(url)) {
          lines[i] = lines[i].replace('chat-active:: ', 'chat-done:: ');
          done_line_index = i;
          break;
        }
      }

      const updated_data = lines.join('\n');
      next_url = this._find_next_undone_url(updated_data, start, end, done_line_index) || '';
      return updated_data;
    });

    if (next_url) {
      this.webview_el?.setAttribute('src', next_url);
      this.current_url = next_url;
    } else {
      this.webview_el?.setAttribute('src', this._FALLBACK_URL);
      this.current_url = this._FALLBACK_URL;
    }
  }

  _find_next_undone_url(file_data, start, end, done_index) {
    if (done_index < 0) return null;
    const lines = file_data.split('\n');
    for (let i = done_index + 1; i < end; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('chat-active:: ')) {
        const tokens = trimmed.split(/\s+/);
        return tokens[tokens.length - 1];
      }
    }
    return null;
  }

  _find_codeblock_boundaries(file_data) {
    if (!file_data) return [this.line_start, this.line_end];

    const lines = file_data.split('\n');
    const foundBlocks = [];
    let currentBlockStart = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (currentBlockStart === -1 && line.trim().startsWith('```smart-chatgpt')) {
        currentBlockStart = i;
      } else if (currentBlockStart >= 0 && line.trim().startsWith('```')) {
        foundBlocks.push({ start: currentBlockStart, end: i });
        currentBlockStart = -1;
      }
    }
    if (!foundBlocks.length) {
      return [this.line_start, this.line_end];
    }
    if (foundBlocks.length === 1) {
      return [foundBlocks[0].start, foundBlocks[0].end];
    }
    for (const block of foundBlocks) {
      const { start, end } = block;
      if (start <= this.line_start && end >= this.line_end) {
        return [start, end];
      }
    }
    return [foundBlocks[0].start, foundBlocks[0].end];
  }
}
