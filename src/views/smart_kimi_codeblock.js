import { SmartChatCodeblock } from './smart_chat_codeblock.js';
import { is_kimi_thread_link, line_contains_url } from '../utils/smart_chat_codeblock.helpers.js';

export class SmartKimiCodeblock extends SmartChatCodeblock {
  /**
   * @param {Object} options
   * @param {import('obsidian').Plugin} options.plugin - The parent plugin instance.
   * @param {import('obsidian').TFile} options.file - The file containing the codeblock.
   * @param {number} options.line_start - The start line of the codeblock.
   * @param {number} options.line_end - The end line of the codeblock.
   * @param {HTMLElement} options.container_el - The container where this codeblock UI is rendered.
   * @param {string} options.source - The raw text inside the ```smart-kimi codeblock.
   */
  constructor(opts = {}) {
    super(opts);

    this.platform_label = 'Kimi';

    this.link_regex = /(https?:\/\/[^\s]+)/g;
    this.links = this._extract_links(this.source);

    this._FALLBACK_URL = 'https://www.kimi.com/';

    const not_done_link_obj = this.links.find(obj => !obj.done);
    this.initial_link = not_done_link_obj ? not_done_link_obj.url : this._FALLBACK_URL;

    this.last_detected_url = this.initial_link;
    this.current_url = this.initial_link;
  }

  _find_codeblock_boundaries(file_data) {
    if (!file_data) return [this.line_start, this.line_end];

    const lines = file_data.split('\n');
    const blocks = [];
    let current_start = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (current_start === -1 && line.trim().startsWith('```smart-kimi')) {
        current_start = i;
      } else if (current_start >= 0 && line.trim().startsWith('```')) {
        blocks.push({ start: current_start, end: i });
        current_start = -1;
      }
    }

    if (!blocks.length) return [this.line_start, this.line_end];
    if (blocks.length === 1) return [blocks[0].start, blocks[0].end];

    for (const block of blocks) {
      if (block.start <= this.line_start && block.end >= this.line_end) {
        return [block.start, block.end];
      }
    }

    return [blocks[0].start, blocks[0].end];
  }

  _is_thread_link(url) {
    return is_kimi_thread_link(url);
  }

  async _render_save_ui(url) {
    this._set_status_text('');
    this._hide_mark_done_button();

    if (!url.startsWith('http')) {
      this._set_status_text('No valid link to save.');
      return;
    }
    if (!this._is_thread_link(url)) {
      this._set_status_text('Not a recognized Kimi thread link.');
      return;
    }

    const link_to_check = this._normalize_url(url);
    const is_done = await this._check_if_done(link_to_check);

    if (!is_done) {
      this._show_mark_done_button();
      this.mark_done_button_el.onclick = async () => {
        await this._mark_thread_done_in_codeblock(link_to_check);
        this.plugin.env?.events?.emit('chat_codeblock:marked_done', { url: link_to_check });
        this.plugin.notices.show('Marked thread as done.');
        this._render_save_ui(this.current_url);
      };
    }
  }

  async _check_if_saved(url) {
    if (!this.file) return false;

    const normalized_url = this._normalize_url(url);
    const candidates = Array.from(new Set([url, normalized_url].filter(Boolean)));

    try {
      const raw_data = await this.plugin.app.vault.read(this.file);
      const [start, end] = await this._get_codeblock_boundaries(raw_data);
      if (start < 0 || end <= start) return false;

      const lines = raw_data.split('\n').slice(start + 1, end);
      for (const line of lines) {
        if (candidates.some(candidate => line_contains_url({
          line,
          target_url: candidate,
          link_regex: this.link_regex
        }))) {
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

    const normalized_url = this._normalize_url(url);
    const candidates = Array.from(new Set([url, normalized_url].filter(Boolean)));

    try {
      const raw_data = await this.plugin.app.vault.read(this.file);
      const [start, end] = await this._get_codeblock_boundaries(raw_data);
      if (start < 0 || end <= start) return false;

      const lines = raw_data.split('\n').slice(start + 1, end);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('chat-done:: ')) continue;

        if (candidates.some(candidate => line_contains_url({
          line,
          target_url: candidate,
          link_regex: this.link_regex
        }))) {
          return true;
        }
      }

      return false;
    } catch (err) {
      console.error('Error checking if link is done:', err);
      return false;
    }
  }

  async _mark_thread_done_in_codeblock(url) {
    if (!this.file) return;

    const normalized_url = this._normalize_url(url);
    const candidates = Array.from(new Set([url, normalized_url].filter(Boolean)));

    const fresh_data = await this.plugin.app.vault.read(this.file);
    const lines = fresh_data.split('\n');

    const [start, end] = await this._get_codeblock_boundaries(fresh_data);
    if (start < 0 || end < 0) return;

    let done_index = -1;
    for (let i = start + 1; i < end; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed.startsWith('chat-active:: ')) continue;

      if (candidates.some(candidate => trimmed.includes(candidate))) {
        lines[i] = lines[i].replace('chat-active:: ', 'chat-done:: ');
        done_index = i;
        break;
      }
    }

    await this.plugin.app.vault.modify(this.file, lines.join('\n'));

    const next_url = this._find_next_undone_url(lines.join('\n'), start, end, done_index);
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
        return trimmed.split(/\s+/).pop();
      }
    }
    return null;
  }
}
