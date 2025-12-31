import { SmartChatCodeblock } from './smart_chat_codeblock.js';
import { is_chatgpt_thread_link } from '../utils/chatgpt_thread_link.js';

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

  async _render_save_ui(url) {
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
        const trimmed = line.trim();
        if (trimmed.startsWith('chat-active:: ') || trimmed.startsWith('chat-done:: ')) {
          const tokens = trimmed.split(/\s+/);
          const lastToken = tokens[tokens.length - 1];
          if (lastToken === url) {
            return true;
          }
        } else if (line.includes(url)) {
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
        if (trimmed.startsWith('chat-done:: ')) {
          const tokens = trimmed.split(/\s+/);
          const lastToken = tokens[tokens.length - 1];
          if (lastToken === url) {
            return true;
          }
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
