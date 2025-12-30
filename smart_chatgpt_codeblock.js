import { SmartChatCodeblock } from './smart_chat_codeblock.js';
import { is_chatgpt_thread_link } from './chatgpt_thread_link.js';

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

    // Fallback when no undone link is found
    this._FALLBACK_URL = 'https://chatgpt.com';

    this.links = this._extract_links(this.source);

    const not_done_link_obj = this.links.find(obj => !obj.done);
    this.initial_link = not_done_link_obj
      ? not_done_link_obj.url
      : this._FALLBACK_URL;

    this.last_detected_url = this.initial_link;
    this.current_url = this.initial_link;

    // UI elements
    this.dropdown_el = null;
    this.mark_done_button_el = null;
    this.status_text_el = null;
    this.webview_el = null;
    this.refresh_button_el = null;
    this.open_browser_button_el = null;
    this.copy_link_button_el = null;
  }

  /**
   * Extract lines:
   *   chat-active:: <timestamp> <url>
   *   chat-done:: <timestamp> <url>
   * or fallback to any link in the codeblock.
   *
   * @param {string} codeblock_source
   * @returns {Array<{ url: string, done: boolean }>}
   */
  _extract_links(codeblock_source) {
    const lines = codeblock_source.split('\n');
    const result = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('chat-done:: ')) {
        const tokens = trimmed.split(/\s+/);
        const possibleUrl = tokens[tokens.length - 1];
        if (possibleUrl.startsWith('http')) {
          result.push({ url: possibleUrl, done: true });
        }
        continue;
      }
      if (trimmed.startsWith('chat-active:: ')) {
        const tokens = trimmed.split(/\s+/);
        const possibleUrl = tokens[tokens.length - 1];
        if (possibleUrl.startsWith('http')) {
          result.push({ url: possibleUrl, done: false });
        }
        continue;
      }

      const found = line.match(this.link_regex) || [];
      for (const f of found) {
        result.push({ url: f, done: false });
      }
    }
    return result;
  }

  /**
   * Called once by our codeblock processor to build the UI.
   */
  async build() {
    // 1) Force lines with bare links to get chat-active prefix if missing
    await this._prefix_missing_lines_in_file();

    // 2) Re-read updated codeblock text
    const updated_source = await this._get_codeblock_source_from_file();
    if (updated_source) {
      this.source = updated_source;
    }

    // 3) Final link parse
    this.links = this._extract_links(this.source);
    const not_done_link_obj = this.links.find(obj => !obj.done);
    this.initial_link = not_done_link_obj
      ? not_done_link_obj.url
      : this._FALLBACK_URL;
    this.last_detected_url = this.initial_link;
    this.current_url = this.initial_link;

    // Build layout

    // top row
    const top_row_el = this.container_el?.createEl('div', { cls: 'sc-top-row' });

    // Always build dropdown if top_row_el exists
    if (top_row_el) {
      this._build_dropdown(top_row_el);

      this.mark_done_button_el = top_row_el.createEl('button', {
        text: 'Mark done',
        cls: 'sc-mark-done-button sc-hidden' // default hidden
      });
      this.status_text_el = top_row_el.createEl('span', { cls: 'sc-status-text' });
    }

    // webview
    if (this.container_el) {
      this.webview_el = this.container_el.createEl('webview', {
        cls: 'sc-webview'
      });
      this.webview_el.setAttribute('partition', this.plugin.app.getWebviewPartition());
      this.webview_el.setAttribute('allowpopups', '');
      this.webview_el.setAttribute('useragent', "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.191 Safari/537.36");
      this.webview_el.setAttribute('webpreferences', 'nativeWindowOpen=yes, contextIsolation=yes');
      this._init_navigation_events();

      // Use a custom property in CSS to handle dynamic height
      const webview_height = this.plugin.settings.iframe_height || 800;
      this.webview_el.style.setProperty('--sc-webview-height', webview_height + 'px');

      this.webview_el.setAttribute('src', this.initial_link);
      this.webview_el.addEventListener('dom-ready', () => {
        const factor = this.plugin.settings.zoom_factor || 1.0;
        this.webview_el.setZoomFactor(factor);
      });

      this._render_footer();
    }

    this._render_save_ui(this.initial_link);
  }


  /**
   * Reads the entire file, returns just the lines inside our codeblock.
   */
  async _get_codeblock_source_from_file() {
    if (!this.file) return null;
    try {
      const raw_data = await this.plugin.app.vault.read(this.file);
      const [start, end] = this._find_codeblock_boundaries(raw_data);
      if (start < 0 || end < 0 || end <= start) return null;
      const lines = raw_data.split('\n').slice(start + 1, end);
      return lines.join('\n');
    } catch (err) {
      console.error('Error reading file for updated codeblock content:', err);
      return null;
    }
  }

  /**
   * Ensures lines with bare links become "chat-active:: " lines
   */
  async _prefix_missing_lines_in_file() {
    if (!this.file) return;
    await this.plugin.app.vault.process(this.file, (file_data) => {
      const [start, end] = this._find_codeblock_boundaries(file_data);
      if (start < 0 || end < 0) return file_data;

      const lines = file_data.split('\n');
      let changed = false;
      for (let i = start + 1; i < end; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed.startsWith('chat-active:: ') || trimmed.startsWith('chat-done:: ')) {
          continue;
        }
        const found = line.match(this.link_regex) || [];
        if (found.length > 0) {
          const timestamp_in_seconds = Math.floor(Date.now() / 1000);
          lines[i] = `chat-active:: ${timestamp_in_seconds} ${trimmed}`;
          changed = true;
        }
      }
      return changed ? lines.join('\n') : file_data;
    });
  }

  add_dropdown_options() {
    const new_codex_opt = this.dropdown_el.createEl('option');
    new_codex_opt.value = 'https://chatgpt.com/codex';
    new_codex_opt.textContent = 'New Codex';

    const new_sora_opt = this.dropdown_el.createEl('option');
    new_sora_opt.value = 'https://sora.chatgpt.com/drafts';
    new_sora_opt.textContent = 'New Sora';
    // Add links from the codeblock
    super.add_dropdown_options();
  }

  /**
   * Checks if the provided URL is a recognized ChatGPT thread link.
   * Must be under one of the supported domains and must match a path pattern representing a thread/task.
   * Recognized patterns:
   *   - /c/: standard chat threads (also used for operator)
   *   - /g/{gpt-id}/c/{uuid}: custom GPT threads
   *   - /codex/tasks/: individual codex task pages
   *   - /t/: Sora tasks
   *
   * @param {string} url
   * @returns {boolean}
   */
  _is_thread_link(url) {
    return is_chatgpt_thread_link(url);
  }

  /**
   * Show/hide the correct UI for "mark done" or "already done".
   * @param {string} url
   */
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

    // Already saved as done
    if (is_done) {
      this._set_status_text('This thread is marked done.');
      return;
    }

    // Not done => show "Mark done"
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

  _set_status_text(text) {
    if (this.status_text_el) {
      this.status_text_el.textContent = text;
    }
  }

  _show_mark_done_button() {
    if (this.mark_done_button_el) {
      this.mark_done_button_el.classList.remove('sc-hidden');
    }
  }

  _hide_mark_done_button() {
    if (this.mark_done_button_el) {
      this.mark_done_button_el.classList.add('sc-hidden');
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

  /**
   * Mark "chat-active::" -> "chat-done::" for this url,
   * then navigate to next undone link if any
   */
  async _mark_thread_done_in_codeblock(url) {
    if (!this.file) return;
    let nextUrl = '';
    await this.plugin.app.vault.process(this.file, (file_data) => {
      const lines = file_data.split('\n');
      const [start, end] = this._find_codeblock_boundaries(file_data);
      if (start < 0 || end < 0) {
        console.warn('Cannot find codeblock boundaries to mark done:', url);
        return file_data;
      }

      let doneLineIndex = -1;
      for (let i = start + 1; i < end; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('chat-active:: ') && trimmed.includes(url)) {
          lines[i] = lines[i].replace('chat-active:: ', 'chat-done:: ');
          doneLineIndex = i;
          break;
        }
      }
      const updatedData = lines.join('\n');
      nextUrl = this._find_next_undone_url(updatedData, start, end, doneLineIndex) || '';
      return updatedData;
    });

    if (nextUrl) {
      this.webview_el?.setAttribute('src', nextUrl);
      this.current_url = nextUrl;
    } else {
      this.webview_el?.setAttribute('src', this._FALLBACK_URL);
      this.current_url = this._FALLBACK_URL;
    }
  }

  _find_next_undone_url(file_data, start, end, doneIndex) {
    if (doneIndex < 0) return null;
    const lines = file_data.split('\n');
    for (let i = doneIndex + 1; i < end; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('chat-active:: ')) {
        const tokens = trimmed.split(/\s+/);
        return tokens[tokens.length - 1];
      }
    }
    return null;
  }

  /**
   * Finds lines of ```smart-chatgpt ... ```
   */
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
