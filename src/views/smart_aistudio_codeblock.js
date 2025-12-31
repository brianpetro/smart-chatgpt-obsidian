import { SmartChatCodeblock } from './smart_chat_codeblock.js';

export class SmartAistudioCodeblock extends SmartChatCodeblock {
  /**
   * @param {Object} options
   * @param {import('obsidian').Plugin} options.plugin - The parent plugin instance.
   * @param {import('obsidian').TFile} options.file - The file containing the codeblock.
   * @param {number} options.line_start - The start line of the codeblock.
   * @param {number} options.line_end - The end line of the codeblock.
   * @param {HTMLElement} options.container_el - The container where this codeblock UI is rendered.
   * @param {string} options.source - The raw text inside the ```smart-aistudio codeblock.
   */
  constructor(opts = {}) {
    super(opts);

    this.link_regex = /(https?:\/\/[^\s]+)/g;
    this.links = this._extract_links(this.source);

    this._FALLBACK_URL = 'https://aistudio.google.com/prompts/new_chat';

    const not_done_link_obj = this.links.find(obj => !obj.done);
    this.initial_link = not_done_link_obj ? not_done_link_obj.url : this._FALLBACK_URL;

    this.THREAD_PREFIX = 'https://aistudio.google.com/prompts/';
    this.last_detected_url = this.initial_link;
    this.current_url = this.initial_link;
  }

  _is_thread_link(url) {
    return url.startsWith(this.THREAD_PREFIX) && !url.endsWith('/new_chat');
  }

  async _render_save_ui(url) {
    this._set_status_text('');
    this._hide_mark_done_button();

    if (!url.startsWith('http')) {
      this._set_status_text('No valid link to save.');
      return;
    }
    if (!this._is_thread_link(url)) {
      this._set_status_text('Not a recognized AI Studio conversation link.');
      return;
    }

    const is_done = await this._check_if_done(url);
    if (!is_done) {
      this._show_mark_done_button();
      this.mark_done_button_el.onclick = async () => {
        await this._mark_thread_done_in_codeblock(url);
        this.plugin.env?.events?.emit('chat_codeblock:marked_done', { url });
        this.plugin.notices.show('Marked as done.');
        this._render_save_ui(this.current_url);
      };
    }

  }

  async _check_if_saved(url) {
    if (!this.file) return false;
    try {
      const raw_data = await this.plugin.app.vault.read(this.file);
      const [start, end] = await this._find_codeblock_boundaries(raw_data);
      if (start < 0 || end < 0 || end <= start) return false;

      const lines = raw_data.split('\n').slice(start + 1, end);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('chat-active:: ') || trimmed.startsWith('chat-done:: ')) {
          const tokens = trimmed.split(/\s+/);
          const lastToken = tokens[tokens.length - 1];
          if (lastToken === url) return true;
        } else if (line.includes(url)) {
          return true;
        }
      }
      return false;
    } catch (err) {
      console.error('Error reading file to check if link is saved:', err);
      return false;
    }
  }

  async _check_if_done(url) {
    if (!this.file) return false;
    try {
      const raw_data = await this.plugin.app.vault.read(this.file);
      const [start, end] = await this._find_codeblock_boundaries(raw_data);
      if (start < 0 || end < 0 || end <= start) return false;

      const lines = raw_data.split('\n').slice(start + 1, end);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('chat-done:: ')) {
          const tokens = trimmed.split(/\s+/);
          const lastToken = tokens[tokens.length - 1];
          if (lastToken === url) return true;
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
    const fresh_data = await this.plugin.app.vault.read(this.file);
    const lines = fresh_data.split('\n');

    const [start, end] = await this._find_codeblock_boundaries(fresh_data);
    if (start < 0 || end < 0) {
      console.warn('Could not find codeblock boundaries to mark done:', url);
      return;
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

    const new_data = lines.join('\n');
    await this.plugin.app.vault.modify(this.file, new_data);

    const next_url = this._find_next_undone_url(new_data, start, end, done_line_index);
    if (next_url) {
      this.webview_el?.setAttribute('src', next_url);
      this.current_url = next_url;
      return;
    }

    this.webview_el?.setAttribute('src', this._FALLBACK_URL);
    this.current_url = this._FALLBACK_URL;
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

  async _find_codeblock_boundaries(file_data) {
    if (!file_data) return [this.line_start, this.line_end];

    const lines = file_data.split('\n');
    const found_blocks = [];
    let current_block_start = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (current_block_start === -1 && line.trim().startsWith('```smart-aistudio')) {
        current_block_start = i;
      } else if (current_block_start >= 0 && line.trim().startsWith('```')) {
        found_blocks.push({ start: current_block_start, end: i });
        current_block_start = -1;
      }
    }

    if (!found_blocks.length) {
      return [this.line_start, this.line_end];
    }
    if (found_blocks.length === 1) {
      return [found_blocks[0].start, found_blocks[0].end];
    }

    for (const block of found_blocks) {
      const { start, end } = block;
      if (start <= this.line_start && end >= this.line_end) {
        return [start, end];
      }
    }

    return [found_blocks[0].start, found_blocks[0].end];
  }
}
