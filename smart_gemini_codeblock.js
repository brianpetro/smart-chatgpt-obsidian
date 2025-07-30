import { SmartChatCodeblock } from './smart_chat_codeblock.js';
export class SmartGeminiCodeblock extends SmartChatCodeblock {
  /**
   * @param {Object} options
   * @param {import('obsidian').Plugin} options.plugin - The parent plugin instance.
   * @param {import('obsidian').TFile} options.file - The file containing the codeblock.
   * @param {number} options.line_start - The start line of the codeblock.
   * @param {number} options.line_end - The end line of the codeblock.
   * @param {HTMLElement} options.container_el - The container where this codeblock UI is rendered.
   * @param {string} options.source - The raw text inside the ```smart-gemini codeblock.
   */
  constructor(opts = {}) {
    super(opts);

    this.link_regex = /(https?:\/\/[^\s]+)/g;
    this.links = this._extract_links(this.source);

    // The first not-done link, or fallback
    const not_done_link_obj = this.links.find(obj => !obj.done);
    this.initial_link = not_done_link_obj
      ? not_done_link_obj.url
      : 'https://gemini.google.com/app/01b45b7563b53661';

    this.THREAD_PREFIX = 'https://gemini.google.com/app/';
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
    this.grow_contain_button_el = null;
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

    // 3) Re-parse final links
    this.links = this._extract_links(this.source);
    const not_done_link_obj = this.links.find(obj => !obj.done);
    this.initial_link = not_done_link_obj
      ? not_done_link_obj.url
      : 'https://gemini.google.com/app/01b45b7563b53661';
    this.last_detected_url = this.initial_link;
    this.current_url = this.initial_link;

    // Build layout
    const top_row_el = this.container_el.createEl('div', { cls: 'sc-top-row' });
    top_row_el.style.display = 'flex';
    top_row_el.style.gap = '8px';
    top_row_el.style.marginBottom = '8px';
    top_row_el.style.alignItems = 'center';

    if (this.links.length > 1) {
      this._build_dropdown(top_row_el);
    }

    this.mark_done_button_el = top_row_el.createEl('button', { text: 'Mark Done' });
    this.mark_done_button_el.style.display = 'none';

    this.status_text_el = top_row_el.createEl('span', { text: '' });
    this.status_text_el.style.marginLeft = 'auto';

    const webview_height = this.plugin.settings.iframe_height || 800;
    this.webview_el = this.container_el.createEl('webview', { cls: 'sc-webview' });
    this.webview_el.setAttribute('partition', this.plugin.app.getWebviewPartition());
    this.webview_el.setAttribute('allowpopups', '');
    this.webview_el.setAttribute('useragent', "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.191 Safari/537.36");
    this.webview_el.setAttribute('webpreferences', 'nativeWindowOpen=yes, contextIsolation=yes');
    this.webview_el.style.setProperty('--sc-webview-height', webview_height + 'px');
    this.webview_el.setAttribute('src', this.initial_link);

    this.webview_el.addEventListener('dom-ready', () => {
      const factor = this.plugin.settings.zoom_factor || 1.0;
      this.webview_el.setZoomFactor(factor);
    });

    this._init_navigation_events();

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

    this.grow_contain_button_el = bottom_row_el.createEl('button', { text: 'Grow' });
    this._grow_css_active = false;

    this.grow_contain_button_el.addEventListener('click', () => {
      if (this._grow_css_active) {
        this._removeGrowCss();
        this.grow_contain_button_el.textContent = 'Grow';
        this._grow_css_active = false;
      } else {
        this._applyGrowCss();
        this.grow_contain_button_el.textContent = 'Contain';
        this._grow_css_active = true;
      }
    });

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
   * Ensures lines with bare links are prefixed with "chat-active:: <timestamp> ".
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
   * Builds a dropdown for multiple links in this codeblock.
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

  /**
   * Sets up event listeners to detect the webview's navigations and handle new URLs.
   */
  _init_navigation_events() {
    this.webview_el.addEventListener('did-navigate', (ev) => {
      if (ev.url) this._debounce_handle_new_url(ev.url);
    });

    this.webview_el.addEventListener('did-navigate-in-page', (ev) => {
      if (ev.url) this._debounce_handle_new_url(ev.url);
    });
  }

  _debounce_handle_new_url(new_url) {
    clearTimeout(this.debounce_handle_new_url_timeout);
    this.debounce_handle_new_url_timeout = setTimeout(() => {
      this._handle_new_url(new_url);
    }, 2000);
  }

  /**
   * Called whenever the webview navigates to a new URL.
   * If it's a new Gemini thread link, it is automatically saved.
   */
  async _handle_new_url(new_url) {
    if (new_url === this.last_detected_url) return;
    this.last_detected_url = new_url;
    this.current_url = new_url;

    if (this._is_thread_link(new_url)) {
      const already_saved = await this._check_if_saved(new_url);
      if (!already_saved) {
        setTimeout(async () => {
          await this._insert_link_into_codeblock(new_url);
          this.plugin.notices.show('Auto-saved new Gemini thread link.');
        }, 2000);
      }
    }
    this._render_save_ui(new_url);
  }

  _is_thread_link(url) {
    return url.startsWith(this.THREAD_PREFIX);
  }

  /**
   * Show/hide the correct UI for marking a link as done, etc.
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
      this._set_status_text('Not a recognized Gemini conversation link.');
      return;
    }

    const is_done = await this._check_if_done(url);
    if (is_done) {
      this._set_status_text('This conversation is marked done.');
      return;
    }

    // Show Mark Done if link is saved but not done
    this._show_mark_done_button();
    this.mark_done_button_el.onclick = async () => {
      await this._mark_thread_done_in_codeblock(url);
      this.plugin.notices.show('Marked as done.');
      this._render_save_ui(this.current_url);
    };
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

  /**
   * Mark "chat-active::" -> "chat-done::" for this url.
   * Then navigate to the next undone link if available, else fallback.
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

    // next undone link?
    const next_url = this._find_next_undone_url(new_data, start, end, done_line_index);
    if (next_url) {
      this.webview_el.setAttribute('src', next_url);
      this.current_url = next_url;
      return;
    }

    // none undone -> fallback root
    this.webview_el.setAttribute('src', 'https://gemini.google.com/app/01b45b7563b53661');
    this.current_url = 'https://gemini.google.com/app/01b45b7563b53661';
  }

  _applyGrowCss() {
    if (document.getElementById('sc-grow-css')) return;

    const css = `
.markdown-source-view.mod-cm6.is-readable-line-width .cm-sizer:has(.block-language-smart-gemini){
  max-width:none!important;
}
.cm-content.cm-lineWrapping:has(.block-language-smart-gemini){
  max-width:none!important;
}
.cm-content.cm-lineWrapping:has(.block-language-smart-gemini)>div{
  width:var(--file-line-width);
  max-width:none!important;
}
.cm-content.cm-lineWrapping:has(.block-language-smart-gemini)>.cm-embed-block:has(.block-language-smart-gemini){
  width:auto;
}`.trim();

    const styleEl = document.createElement('style');
    styleEl.id = 'sc-grow-css';
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  _removeGrowCss() {
    const styleEl = document.getElementById('sc-grow-css');
    if (styleEl) styleEl.remove();
  }

  /**
   * Finds the next line after done_line_index that starts with "chat-active::",
   * parse out the URL, and return it. If none, returns null.
   */
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

  /**
   * Locates the triple-backtick boundaries for ```smart-gemini``` in the file.
   * Returns [start_line, end_line].
   */
  async _find_codeblock_boundaries(file_data) {
    if (!file_data) return [this.line_start, this.line_end];

    const lines = file_data.split('\n');
    const found_blocks = [];
    let current_block_start = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (current_block_start === -1 && line.trim().startsWith('```smart-gemini')) {
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
