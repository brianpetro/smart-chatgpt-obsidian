export class SmartChatgptCodeblock {
  /**
   * @param {Object} options
   * @param {import('obsidian').Plugin} options.plugin - The parent plugin instance.
   * @param {import('obsidian').TFile} options.file - The file containing the codeblock.
   * @param {number} options.line_start - The start line of the codeblock.
   * @param {number} options.line_end - The end line of the codeblock.
   * @param {HTMLElement} options.container_el - The container where this codeblock UI is rendered.
   * @param {string} options.source - The raw text inside the ```smart-chatgpt codeblock.
   */
  constructor({ plugin, file, line_start, line_end, container_el, source }) {
    this.plugin = plugin;
    this.file = file;
    this.line_start = line_start;
    this.line_end = line_end;
    this.container_el = container_el;
    this.source = source;

    // We'll store links with done-ness.
    this.link_regex = /(https?:\/\/[^\s]+)/g;
    this.links = this._extract_links(this.source);

    // Pick the first not-done link if any, else fallback
    const not_done_link_obj = this.links.find(obj => !obj.done);
    this.initial_link = not_done_link_obj
      ? not_done_link_obj.url
      : 'https://chatgpt.com/';

    this.THREAD_PREFIX = 'https://chatgpt.com/c/';
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
    // 1) Force lines with bare links to get "chat-active:: " prefix
    await this._prefix_missing_lines_in_file();

    // 2) Re-read the updated codeblock text
    const updated_source = await this._get_codeblock_source_from_file();
    if (updated_source) {
      this.source = updated_source;
    }

    // 3) Parse final links
    this.links = this._extract_links(this.source);
    const not_done_link_obj = this.links.find(obj => !obj.done);
    this.initial_link = not_done_link_obj ? not_done_link_obj.url : 'https://chatgpt.com/';
    this.last_detected_url = this.initial_link;
    this.current_url = this.initial_link;

    // Build layout
    const top_row_el = this.container_el?.createEl('div', { cls: 'sc-top-row' });
    if (top_row_el) {
      top_row_el.style.display = 'flex';
      top_row_el.style.gap = '8px';
      top_row_el.style.marginBottom = '8px';
      top_row_el.style.alignItems = 'center';
    }

    if (this.links.length > 0 && top_row_el) {
      this._build_dropdown(top_row_el);
    }

    if (top_row_el) {
      this.mark_done_button_el = top_row_el.createEl('button', { text: 'Mark Done' });
      this.mark_done_button_el.style.display = 'none';

      this.status_text_el = top_row_el.createEl('span', { text: '' });
      this.status_text_el.style.marginLeft = 'auto';
    }

    if (this.container_el) {
      const webview_height = this.plugin.settings.iframe_height || 800;
      this.webview_el = this.container_el.createEl('webview');
      this.webview_el.setAttribute(
        'partition',
        'persist:smart-chatgpt-' + this.plugin.app.vault.getName()
      );
      this.webview_el.setAttribute('allowpopups', '');
      this._init_navigation_events();

      this.webview_el.style.width = '100%';
      this.webview_el.style.height = webview_height + 'px';
      this.webview_el.setAttribute('src', this.initial_link);

      this.webview_el.addEventListener('dom-ready', () => {
        const factor = this.plugin.settings.zoom_factor || 1.0;
        this.webview_el.setZoomFactor(factor);
      });

      const bottom_row_el = this.container_el.createEl('div', { cls: 'sc-bottom-row' });
      bottom_row_el.style.display = 'flex';
      bottom_row_el.style.gap = '8px';
      bottom_row_el.style.marginTop = '8px';

      this.refresh_button_el = bottom_row_el.createEl('button', { text: 'Refresh' });
      this.refresh_button_el.addEventListener('click', () => {
        if (this.webview_el) {
          this.webview_el.reload();
          this.plugin.notices.show('Webview reloaded.');
        }
      });

      this.open_browser_button_el = bottom_row_el.createEl('button', { text: 'Open in Browser' });
      this.open_browser_button_el.addEventListener('click', () => {
        if (this.current_url && this.current_url.startsWith('http')) {
          window.open(this.current_url, '_blank');
        }
      });

      this.copy_link_button_el = bottom_row_el.createEl('button', { text: 'Copy Link' });
      this.copy_link_button_el.addEventListener('click', () => {
        if (this.current_url && this.current_url.startsWith('http')) {
          navigator.clipboard.writeText(this.current_url);
          this.plugin.notices.show('Copied current URL to clipboard.');
        }
      });
    }

    this._render_save_ui(this.initial_link);
  }

  /**
   * Reads the entire file, identifies our codeblock boundaries,
   * returns just the lines inside the codeblock as a single string.
   */
  async _get_codeblock_source_from_file() {
    if (!this.file) return null;
    try {
      const raw_data = await this.plugin.app.vault.read(this.file);
      const [start, end] = await this._find_codeblock_boundaries(raw_data);
      if (start < 0 || end < 0 || end <= start) return null;
      const lines = raw_data.split('\n').slice(start + 1, end);
      return lines.join('\n');
    } catch (err) {
      console.error('Error reading file for updated codeblock content:', err);
      return null;
    }
  }

  /**
   * Ensures that any line with at least one link but which does not start
   * with "chat-active:: " or "chat-done:: " is prefixed with:
   *   "chat-active:: <timestamp> <existing line>"
   * Then writes those changes back to the file if needed.
   */
  async _prefix_missing_lines_in_file() {
    if (!this.file) return;
    try {
      const file_data = await this.plugin.app.vault.read(this.file);
      const [start, end] = await this._find_codeblock_boundaries(file_data);
      if (start < 0 || end < 0) return;

      const lines = file_data.split('\n');
      let changed = false;
      for (let i = start + 1; i < end; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (
          trimmed.startsWith('chat-active:: ') ||
          trimmed.startsWith('chat-done:: ')
        ) {
          continue;
        }
        const found = line.match(this.link_regex) || [];
        if (found.length > 0) {
          const timestamp_in_seconds = Math.floor(Date.now() / 1000);
          lines[i] = `chat-active:: ${timestamp_in_seconds} ${trimmed}`;
          changed = true;
        }
      }

      if (changed) {
        const new_data = lines.join('\n');
        await this.plugin.app.vault.modify(this.file, new_data);
      }
    } catch (err) {
      console.error('Error prefixing lines in file:', err);
    }
  }

  /**
   * Creates a dropdown for links, labeling done ones with "✓".
   */
  _build_dropdown(parent_el) {
    this.dropdown_el = parent_el.createEl('select');
    for (const link_obj of this.links) {
      const option_el = this.dropdown_el.createEl('option');
      option_el.value = link_obj.url;
      option_el.textContent = link_obj.done ? ('✓ ' + link_obj.url) : link_obj.url;
    }
    this.dropdown_el.value = this.initial_link;

    this.dropdown_el.addEventListener('change', () => {
      const new_link = this.dropdown_el.value;
      if (this.webview_el) {
        this.webview_el.setAttribute('src', new_link);
        this.current_url = new_link;
      }
    });
  }

  _init_navigation_events() {
    if (!this.webview_el) return;

    this.webview_el.addEventListener('did-finish-load', () => {
      this.webview_el.setAttribute('data-did-finish-load', 'true');
    });

    this.webview_el.addEventListener('did-navigate', (ev) => {
      if (ev.url) this._handle_new_url(ev.url);
    });

    this.webview_el.addEventListener('did-navigate-in-page', (ev) => {
      if (ev.url) this._handle_new_url(ev.url);
    });
  }

  async _handle_new_url(new_url) {
    const norm_new = this._normalize_url(new_url);
    const norm_last = this._normalize_url(this.last_detected_url);
    if (norm_new === norm_last) return;

    this.last_detected_url = new_url;
    this.current_url = new_url;

    // Always auto-save if it's a new thread link
    if (this._is_thread_link(new_url)) {
      const link_to_save = this._normalize_url(new_url);
      const already_saved = await this._check_if_saved(link_to_save);
      if (!already_saved) {
        await this._insert_link_into_codeblock(link_to_save);
        this.plugin.notices.show('Auto-saved new ChatGPT thread link.');
      }
    }
    this._render_save_ui(new_url);
  }

  _normalize_url(url) {
    try {
      const u = new URL(url);
      u.search = '';
      u.hash = '';
      return u.toString();
    } catch (_) {
      return url;
    }
  }

  _is_thread_link(url) {
    return url.startsWith(this.THREAD_PREFIX);
  }

  /**
   * Show/hide the correct UI for "save link" or "mark done" or "already done."
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

    // Saved but not done => show "Mark Done"
    this._set_status_text('');
    this._show_mark_done_button();
    if (this.mark_done_button_el) {
      this.mark_done_button_el.onclick = async () => {
        await this._mark_thread_done_in_codeblock(link_to_check);
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
      this.mark_done_button_el.style.display = '';
    }
  }
  _hide_mark_done_button() {
    if (this.mark_done_button_el) {
      this.mark_done_button_el.style.display = 'none';
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
        if (
          trimmed.startsWith('chat-active:: ') ||
          trimmed.startsWith('chat-done:: ')
        ) {
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
      console.error('Error reading file to check if link is saved:', err);
      return false;
    }
  }

  /**
   * Returns true if the line for this url has "chat-done:: "
   */
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
   * Inserts a new url in "chat-active:: <timestamp> <url>" form at the top of the codeblock
   */
  async _insert_link_into_codeblock(url) {
    if (!this.file) return;
    const fresh_data = await this.plugin.app.vault.read(this.file);
    const [start, end] = await this._find_codeblock_boundaries(fresh_data);
    if (start < 0 || end < 0) {
      console.warn('Could not find codeblock boundaries to insert URL:', url);
      return;
    }

    const lines = fresh_data.split('\n');
    const timestamp_in_seconds = Math.floor(Date.now() / 1000);
    const new_line = `chat-active:: ${timestamp_in_seconds} ${url}`;

    lines.splice(start + 1, 0, new_line);
    const new_data = lines.join('\n');
    await this.plugin.app.vault.modify(this.file, new_data);
  }

  /**
   * Mark "chat-active::" -> "chat-done::" for this url.
   * Then navigate to the next undone link if available. Otherwise root.
   */
  async _mark_thread_done_in_codeblock(url) {
    if (!this.file) return;
    const fresh_data = await this.plugin.app.vault.read(this.file);
    const lines = fresh_data.split('\n');

    const [start, end] = await this._find_codeblock_boundaries(fresh_data);
    if (start < 0 || end < 0) {
      console.warn('Could not find codeblock boundaries to mark done:', url);
      return;
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

    const new_data = lines.join('\n');
    await this.plugin.app.vault.modify(this.file, new_data);

    // find next undone
    const nextUrl = this._find_next_undone_url(new_data, start, end, doneLineIndex);
    if (nextUrl) {
      this.webview_el?.setAttribute('src', nextUrl);
      this.current_url = nextUrl;
      return;
    }

    // none undone -> root
    this.webview_el?.setAttribute('src', 'https://chatgpt.com');
    this.current_url = 'https://chatgpt.com';
  }

  /**
   * Look for the next line after 'doneIndex' that starts with "chat-active::",
   * parse out the URL, and return it. If none found, returns empty string.
   *
   * @param {string} file_data
   * @param {number} start
   * @param {number} end
   * @param {number} doneIndex
   * @returns {string|null}
   */
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
   * Locates the triple-backtick boundaries for ```smart-chatgpt``` in the file.
   * Returns [start_line, end_line] for the code fence lines themselves.
   */
  async _find_codeblock_boundaries(file_data) {
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
