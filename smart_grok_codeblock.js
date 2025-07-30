import { SmartChatCodeblock } from './smart_chat_codeblock.js';
export class SmartGrokCodeblock extends SmartChatCodeblock {
  /**
   * @param {Object} options
   * @param {import('obsidian').Plugin} options.plugin – Parent plugin instance.
   * @param {import('obsidian').TFile} options.file – File containing the code‑block.
   * @param {number} options.line_start – Start line of the code‑block.
   * @param {number} options.line_end – End line of the code‑block.
   * @param {HTMLElement} options.container_el – Element where this UI renders.
   * @param {string} options.source – Raw text inside the ```smart-grok code‑block.
   */
  constructor(opts = {}) {
    super(opts);

    this.link_regex = /(https?:\/\/[^\s]+)/g;
    this.links = this._extract_links(this.source);

    this._FALLBACK_URL = 'https://grok.com/chat';
    const not_done_link_obj = this.links.find(obj => !obj.done);
    this.initial_link = not_done_link_obj
      ? not_done_link_obj.url
      : this._FALLBACK_URL
    ;

    // Updated to the new Grok chat path
    this.THREAD_PREFIX = 'https://grok.com/chat/';

    this.last_detected_url = this.initial_link;
    this.current_url = this.initial_link;

    this.dropdown_el = null;
    this.mark_done_button_el = null;
    this.status_text_el = null;
    this.webview_el = null;
    this.refresh_button_el = null;
    this.open_browser_button_el = null;
    this.copy_link_button_el = null;
    this.grow_contain_button_el = null;
  }

  _extract_links(codeblock_source) {
    const lines = codeblock_source.split('\n');
    const result = [];

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('chat-done:: ')) {
        const tokens = trimmed.split(/\s+/);
        const possibleUrl = tokens[tokens.length - 1];
        if (possibleUrl.startsWith('http')) result.push({ url: possibleUrl, done: true });
        continue;
      }
      if (trimmed.startsWith('chat-active:: ')) {
        const tokens = trimmed.split(/\s+/);
        const possibleUrl = tokens[tokens.length - 1];
        if (possibleUrl.startsWith('http')) result.push({ url: possibleUrl, done: false });
        continue;
      }

      const found = line.match(this.link_regex) || [];
      for (const f of found) result.push({ url: f, done: false });
    }
    return result;
  }

  async build() {
    await this._prefix_missing_lines_in_file();
    const updated_source = await this._get_codeblock_source_from_file();
    if (updated_source) this.source = updated_source;

    this.links = this._extract_links(this.source);
    const not_done_link_obj = this.links.find(obj => !obj.done);
    this.initial_link = not_done_link_obj ? not_done_link_obj.url : 'https://grok.com/chat';
    this.last_detected_url = this.initial_link;
    this.current_url = this.initial_link;

    /* Top row (dropdown + status) */
    const top_row_el = this.container_el.createEl('div', { cls: 'sc-top-row' });
    top_row_el.style.display = 'flex';
    top_row_el.style.gap = '8px';
    top_row_el.style.marginBottom = '8px';
    top_row_el.style.alignItems = 'center';

    this._build_dropdown(top_row_el);

    this.mark_done_button_el = top_row_el.createEl('button', { text: 'Mark Done' });
    this.mark_done_button_el.style.display = 'none';

    this.status_text_el = top_row_el.createEl('span', { text: '' });
    this.status_text_el.style.marginLeft = 'auto';

    /* Web‑view */
    const webview_height = this.plugin.settings.iframe_height || 800;
    this.webview_el = this.container_el.createEl('webview', { cls: 'sc-webview' });
    this.webview_el.setAttribute('partition', this.plugin.app.getWebviewPartition());
    this.webview_el.setAttribute('allowpopups', '');
    this.webview_el.setAttribute(
      'useragent',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.191 Safari/537.36'
    );
    this.webview_el.setAttribute('webpreferences', 'nativeWindowOpen=yes, contextIsolation=yes');
    this.webview_el.style.setProperty('--sc-webview-height', webview_height + 'px');
    this.webview_el.setAttribute('src', this.initial_link);

    this.webview_el.addEventListener('dom-ready', () => {
      const factor = this.plugin.settings.zoom_factor || 1.0;
      this.webview_el.setZoomFactor(factor);
    });
    this._init_navigation_events();

    /* Bottom row (actions) */
    const bottom_row_el = this.container_el.createEl('div', { cls: 'sc-bottom-row' });
    bottom_row_el.style.display = 'flex';
    bottom_row_el.style.gap = '8px';
    bottom_row_el.style.marginTop = '8px';

    this.refresh_button_el = bottom_row_el.createEl('button', { text: 'Refresh' });
    this.refresh_button_el.addEventListener('click', () => {
      this.webview_el.reload();
      this.plugin.notices.show('Web‑view reloaded.');
    });

    this.open_browser_button_el = bottom_row_el.createEl('button', { text: 'Open in Browser' });
    this.open_browser_button_el.addEventListener('click', () => {
      if (this.current_url.startsWith('http')) window.open(this.current_url, '_blank');
    });

    this.copy_link_button_el = bottom_row_el.createEl('button', { text: 'Copy Link' });
    this.copy_link_button_el.addEventListener('click', () => {
      if (this.current_url.startsWith('http')) {
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

  async _get_codeblock_source_from_file() {
    if (!this.file) return null;
    try {
      const raw_data = await this.plugin.app.vault.read(this.file);
      const [start, end] = await this._find_codeblock_boundaries(raw_data);
      if (start < 0 || end <= start) return null;
      return raw_data.split('\n').slice(start + 1, end).join('\n');
    } catch (err) {
      console.error('Error reading file for updated code‑block content:', err);
      return null;
    }
  }

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
        ) continue;

        if ((line.match(this.link_regex) || []).length > 0) {
          const ts = Math.floor(Date.now() / 1000);
          lines[i] = `chat-active:: ${ts} ${trimmed}`;
          changed = true;
        }
      }

      if (changed) await this.plugin.app.vault.modify(this.file, lines.join('\n'));
    } catch (err) {
      console.error('Error prefixing lines in file:', err);
    }
  }

  _find_codeblock_boundaries(file_data) {
    if (!file_data) return [this.line_start, this.line_end];

    const lines = file_data.split('\n');
    const blocks = [];
    let current_start = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (current_start === -1 && line.trim().startsWith('```smart-grok')) current_start = i;
      else if (current_start >= 0 && line.trim().startsWith('```')) {
        blocks.push({ start: current_start, end: i });
        current_start = -1;
      }
    }
    if (!blocks.length) return [this.line_start, this.line_end];
    if (blocks.length === 1) return [blocks[0].start, blocks[0].end];

    for (const b of blocks) if (b.start <= this.line_start && b.end >= this.line_end) return [b.start, b.end];
    return [blocks[0].start, blocks[0].end];
  }

  _applyGrowCss() {
    if (document.getElementById('sc-grow-css')) return;

    const css = `
.markdown-source-view.mod-cm6.is-readable-line-width .cm-sizer:has(.block-language-smart-grok){max-width:none!important;}
.cm-content.cm-lineWrapping:has(.block-language-smart-grok){max-width:none!important;}
.cm-content.cm-lineWrapping:has(.block-language-smart-grok)>div{width:var(--file-line-width);max-width:none!important;}
.cm-content.cm-lineWrapping:has(.block-language-smart-grok)>.cm-embed-block:has(.block-language-smart-grok){width:auto;}
`.trim();

    const styleEl = document.createElement('style');
    styleEl.id = 'sc-grow-css';
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  _removeGrowCss() {
    const styleEl = document.getElementById('sc-grow-css');
    if (styleEl) styleEl.remove();
  }

  _init_navigation_events() {
    this.webview_el.addEventListener('did-navigate', ev => {
      if (ev.url) this._debounce_handle_new_url(ev.url);
    });
    this.webview_el.addEventListener('did-navigate-in-page', ev => {
      if (ev.url) this._debounce_handle_new_url(ev.url);
    });
  }

  _debounce_handle_new_url(new_url) {
    clearTimeout(this._nav_timer);
    this._nav_timer = setTimeout(() => this._handle_new_url(new_url), 2000);
  }

  async _handle_new_url(new_url) {
    if (new_url === this.last_detected_url) return;
    this.last_detected_url = new_url;
    this.current_url = new_url;

    if (this._is_thread_link(new_url)) {
      const already_saved = await this._check_if_saved(new_url);
      if (!already_saved) {
        await this._insert_link_into_codeblock(new_url);
        this.plugin.notices.show('Auto‑saved new Grok conversation link.');
      }
    }
    this._render_save_ui(new_url);
  }

  _is_thread_link(url) {
    return url.startsWith(this.THREAD_PREFIX) && url.length > this.THREAD_PREFIX.length;
  }

  async _render_save_ui(url) {
    this._set_status_text('');
    this._hide_mark_done_button();

    if (!url.startsWith('http')) {
      this._set_status_text('No valid link to save.');
      return;
    }
    if (!this._is_thread_link(url)) {
      this._set_status_text('Not a Grok conversation link (no save/done).');
      return;
    }

    const is_done = await this._check_if_done(url);
    if (is_done) {
      this._set_status_text('This conversation is marked done.');
      return;
    }

    this._show_mark_done_button();
    this.mark_done_button_el.onclick = async () => {
      await this._mark_thread_done_in_codeblock(url);
      this.plugin.notices.show('Marked conversation as done.');
      this._render_save_ui(this.current_url);
    };
  }

  _set_status_text(text) {
    if (this.status_text_el) this.status_text_el.textContent = text;
  }
  _show_mark_done_button() {
    if (this.mark_done_button_el) this.mark_done_button_el.style.display = '';
  }
  _hide_mark_done_button() {
    if (this.mark_done_button_el) this.mark_done_button_el.style.display = 'none';
  }

  /* ─── Persistence checks & updates ─────────────────────────────────────── */

  async _check_if_saved(url) {
    if (!this.file) return false;
    try {
      const raw_data = await this.plugin.app.vault.read(this.file);
      const [start, end] = await this._find_codeblock_boundaries(raw_data);
      if (start < 0 || end <= start) return false;

      const lines = raw_data.split('\n').slice(start + 1, end);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('chat-active:: ') || trimmed.startsWith('chat-done:: ')) {
          const lastToken = trimmed.split(/\s+/).pop();
          if (lastToken === url) return true;
        } else if (line.includes(url)) return true;
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
      if (start < 0 || end <= start) return false;

      const lines = raw_data.split('\n').slice(start + 1, end);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('chat-done:: ')) {
          const lastToken = trimmed.split(/\s+/).pop();
          if (lastToken === url) return true;
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
    if (start < 0 || end < 0) return;

    let done_index = -1;
    for (let i = start + 1; i < end; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('chat-active:: ') && trimmed.includes(url)) {
        lines[i] = lines[i].replace('chat-active:: ', 'chat-done:: ');
        done_index = i;
        break;
      }
    }

    await this.plugin.app.vault.modify(this.file, lines.join('\n'));

    const next_url = this._find_next_undone_url(lines.join('\n'), start, end, done_index);
    if (next_url) {
      this.webview_el.setAttribute('src', next_url);
      this.current_url = next_url;
    } else {
      this.webview_el.setAttribute('src', 'https://grok.com/chat');
      this.current_url = 'https://grok.com/chat';
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
