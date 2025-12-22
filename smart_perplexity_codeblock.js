import { SmartChatCodeblock } from './smart_chat_codeblock.js';
export class SmartPerplexityCodeblock extends SmartChatCodeblock {
  /**
   * @param {Object} options
   * @param {import('obsidian').Plugin} options.plugin - The parent plugin instance.
   * @param {import('obsidian').TFile} options.file - The file containing the codeblock.
   * @param {number} options.line_start - The start line of the codeblock.
   * @param {number} options.line_end - The end line of the codeblock.
   * @param {HTMLElement} options.container_el - The container where this codeblock UI is rendered.
   * @param {string} options.source - The raw text inside the ```smart-perplexity codeblock.
   */
  constructor(opts = {}) {
    super(opts);

    this.link_regex = /(https?:\/\/[^\s]+)/g;
    this.links = this._extract_links(this.source);

    this._FALLBACK_URL = 'https://www.perplexity.ai/';
    // first not-done link, else fallback
    const not_done_obj = this.links.find(l => !l.done);
    this.initial_link = not_done_obj
      ? not_done_obj.url
      : this._FALLBACK_URL
    ;

    this.THREAD_PREFIX = 'https://www.perplexity.ai/search/';

    this.last_detected_url = this.initial_link;
    this.current_url = this.initial_link;

    // UI references
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
   * Extract links from lines:
   * - chat-active:: <timestamp> <url>
   * - chat-done:: <timestamp> <url>
   * or fallback to any link in the codeblock.
   *
   * @param {string} source
   * @returns {Array<{ url: string, done: boolean }>}
   */
  _extract_links(source) {
    const lines = source.split('\n');
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
      // fallback for lines with a raw link
      const found = line.match(this.link_regex) || [];
      for (const f of found) {
        result.push({ url: f, done: false });
      }
    }
    return result;
  }

  /**
   * Main UI build. Called once by the codeblock processor.
   */
  async build() {
    await this._prefix_missing_lines_in_file();
    const updated_source = await this._get_codeblock_source_from_file();
    if (updated_source) {
      this.source = updated_source;
    }

    // re-parse links after update
    this.links = this._extract_links(this.source);
    const not_done_obj = this.links.find(l => !l.done);
    this.initial_link = not_done_obj
      ? not_done_obj.url
      : 'https://www.perplexity.ai/';
    this.last_detected_url = this.initial_link;
    this.current_url = this.initial_link;

    // top row
    const top_row_el = this.container_el.createEl('div', { cls: 'sc-top-row' });
    top_row_el.style.display = 'flex';
    top_row_el.style.gap = '8px';
    top_row_el.style.marginBottom = '8px';
    top_row_el.style.alignItems = 'center';

    this._build_dropdown(top_row_el);

    // mark done button
    this.mark_done_button_el = top_row_el.createEl('button', { text: 'Mark Done' });
    this.mark_done_button_el.style.display = 'none';

    // status text
    this.status_text_el = top_row_el.createEl('span', { text: '' });
    this.status_text_el.style.marginLeft = 'auto';

    // embed webview
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

    // bottom row
    const bottom_row_el = this.container_el.createEl('div', { cls: 'sc-bottom-row' });
    bottom_row_el.style.display = 'flex';
    bottom_row_el.style.gap = '8px';
    bottom_row_el.style.marginTop = '8px';

    // refresh
    this.refresh_button_el = bottom_row_el.createEl('button', { text: 'Refresh' });
    this.refresh_button_el.addEventListener('click', () => {
      this.webview_el.reload();
      this.plugin.env?.events?.emit('webview:reloaded', { url: this.current_url });
      this.plugin.notices.show('Webview reloaded.');
    });

    // open in browser
    this.open_browser_button_el = bottom_row_el.createEl('button', { text: 'Open in Browser' });
    this.open_browser_button_el.addEventListener('click', () => {
      if (this.current_url && this.current_url.startsWith('http')) {
        window.open(this.current_url, '_blank');
      }
    });

    // copy link
    this.copy_link_button_el = bottom_row_el.createEl('button', { text: 'Copy Link' });
    this.copy_link_button_el.addEventListener('click', () => {
      if (this.current_url && this.current_url.startsWith('http')) {
        navigator.clipboard.writeText(this.current_url);
        this.plugin.env?.events?.emit('url:copied', { url: this.current_url });
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

    // finalize UI
    this._render_save_ui(this.initial_link);
  }

  /**
   * Re-read codeblock lines from the file, in case we changed them (prefixing).
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
   * Ensure any link-only line is prefixed with chat-active::
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
   * Returns true if the URL starts with the search prefix and does NOT end with '/new'.
   * This ensures 'https://www.perplexity.ai/search/new' is *not* treated as a valid thread link.
   * @param {string} url
   */
  _is_thread_link(url) {
    const uri = new URL(url);
    return (
      uri.hostname === 'www.perplexity.ai' &&
      uri.pathname.startsWith('/search/') &&
      !uri.pathname.endsWith('/new')
    );
  }

  async _render_save_ui(url) {
    this._set_status_text('');
    this._hide_mark_done_button();

    if (!url.startsWith('http')) {
      this._set_status_text('No valid link to save.');
      return;
    }
    if (!this._is_thread_link(url)) {
      this._set_status_text('Not a recognized Perplexity search link.');
      return;
    }

    const is_done = await this._check_if_done(url);
    if (is_done) {
      this._set_status_text('This search is marked done.');
      return;
    }
    // show Mark Done
    this._show_mark_done_button();
    this.mark_done_button_el.onclick = async () => {
      await this._mark_thread_done_in_codeblock(url);
      this.plugin.env?.events?.emit('chat_codeblock:marked_done', { url });
      this.plugin.notices.show('Marked Perplexity search as done.');
      this._render_save_ui(this.current_url);
    };
  }

  _set_status_text(txt) {
    if (this.status_text_el) {
      this.status_text_el.textContent = txt;
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
      console.error('Error checking if link is done:', err);
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

    // find next undone
    const next_url = this._find_next_undone_url(new_data, start, end, done_line_index);
    if (next_url) {
      this.webview_el.setAttribute('src', next_url);
      this.current_url = next_url;
      return;
    }
    // fallback
    this.webview_el.setAttribute('src', 'https://www.perplexity.ai/');
    this.current_url = 'https://www.perplexity.ai/';
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

  /**
   * Locates the ```smart-perplexity``` code fence lines in the file.
   */
  async _find_codeblock_boundaries(file_data) {
    if (!file_data) return [this.line_start, this.line_end];
    const lines = file_data.split('\n');
    const found_blocks = [];
    let current_block_start = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (current_block_start === -1 && line.trim().startsWith('```smart-perplexity')) {
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
    // if multiple, pick the one that encloses line_start/line_end
    for (const block of found_blocks) {
      const { start, end } = block;
      if (start <= this.line_start && end >= this.line_end) {
        return [start, end];
      }
    }
    return [found_blocks[0].start, found_blocks[0].end];
  }
}
