export class SmartChatCodeblock {
  constructor({ plugin, file, line_start, line_end, container_el, source, ctx }) {
    this.plugin = plugin;
    this.file = file;
    this.line_start = line_start;
    this.line_end = line_end;
    this.container_el = container_el;
    this.source = source;
    this.ctx = ctx;
    // overridden by subclasses
    this._FALLBACK_URL = 'https://smartconnections.app/?utm_source=chat-codeblock-fallback';
  }

  /**
   * Insert new url line after the start
   */
  async _insert_link_into_codeblock(url) {
    if (!this.file) return;
    const timestamp_in_seconds = Math.floor(Date.now() / 1000);
    const new_line = `chat-active:: ${timestamp_in_seconds} ${url}`;
    if(this.ctx && this.ctx.replaceCode) {
      // Use the codeblock cm context to insert the new line (prevents flicker)
      this.ctx.replaceCode(new_line + '\n' + this.source);
      const {text, lineStart: line_start, lineEnd: line_end} = this.ctx.getSectionInfo(this.container_el) ?? {};
      const updated_source = text.split('\n').slice(line_start + 1, line_end).join('\n');
      this.source = updated_source;
      this.links = this._extract_links(this.source);
      this._build_dropdown(); // re-render the dropdown
      return;
    }
    // @ deprecated: fallback to reading the file
    await this.plugin.app.vault.process(this.file, (file_data) => {
      const [start, end] = this._find_codeblock_boundaries(file_data);
      if (start < 0 || end < 0) {
        console.warn('Cannot find codeblock to insert link:', url);
        return file_data;
      }
      const lines = file_data.split('\n');
      lines.splice(start + 1, 0, new_line);
      return lines.join('\n');
    });
  }

  /**
   * Creates a dropdown for links, labeling done ones with "✓".
   */
  _build_dropdown(parent_el=null) {
    if (!this.dropdown_el) {
      if(!parent_el) throw new Error('Parent element is required to build dropdown');
      this.dropdown_el = parent_el.createEl('select', { cls: 'sc-link-dropdown' });
      this.dropdown_el.addEventListener('change', () => {
        const new_link = this.dropdown_el.value;
        if (this.webview_el) {
          this.webview_el.setAttribute('src', new_link);
          this.current_url = new_link;
        }
      });
    }
    this.dropdown_el.empty(); // Clear existing options


    this.add_dropdown_options();
    this.dropdown_el.value = this.current_url || this.initial_link;
  }

  add_dropdown_options() {
    const new_chat = this.dropdown_el.createEl('option');
    new_chat.value = this._FALLBACK_URL;
    new_chat.textContent = 'New chat';
    // Add links from the codeblock
    for (const link_obj of this.links) {
      const option_el = this.dropdown_el.createEl('option');
      option_el.value = link_obj.url;
      option_el.textContent = link_obj.done
        ? ('✓ ' + link_obj.url)
        : link_obj.url;
    }
  }

  _init_navigation_events() {
    if (!this.webview_el) return;
    this.webview_el.addEventListener('did-finish-load', () => {
      this.webview_el.setAttribute('data-did-finish-load', 'true');
    });

    this.webview_el.addEventListener('did-navigate', (ev) => {
      if (ev.url) this._debounce_handle_new_url(ev.url);
    });

    this.webview_el.addEventListener('did-navigate-in-page', (ev) => {
      if (ev.url) this._debounce_handle_new_url(ev.url);
    });
  }

  _debounce_handle_new_url(new_url) {
    clearTimeout(this._nav_timer);
    this._nav_timer = setTimeout(() => this._handle_new_url(new_url), 300);
  }

  async _handle_new_url(new_url) {
    const norm_new = this._normalize_url(new_url);
    const norm_last = this._normalize_url(this.last_detected_url);
    if (norm_new === norm_last) return;

    this.last_detected_url = new_url;
    this.current_url = new_url;

    // Auto-save new thread link if it's recognized
    if (this._is_thread_link(new_url)) {
      const link_to_save = this._normalize_url(new_url);
      const already_saved = await this._check_if_saved(link_to_save);
      if (!already_saved) {
        await this._insert_link_into_codeblock(link_to_save);
        this.plugin.env.events?.emit('thread:auto_saved_link', { url: link_to_save });
        this.plugin.notices.show(`Auto-saved new ${this.constructor.name} thread link.`);
      }
    }
    this._render_save_ui(new_url);
  }

  /**
   * Normalises a URL by stripping query / hash.
   * @param {string} url
   * @returns {string}
   */
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

  /**
   * Injects a <style id="sc-grow-css"> tag with the “grow” rules.
   */
  _applyGrowCss() {
    if (document.getElementById('sc-grow-css')) return;

    const css = `
.markdown-source-view.mod-cm6.is-readable-line-width .cm-sizer:has(.sc-dynamic-codeblock){
  max-width:none !important;
}
.cm-content.cm-lineWrapping:has(.sc-dynamic-codeblock){
  max-width:none !important;
}
.cm-content.cm-lineWrapping:has(.sc-dynamic-codeblock)>div{
  width:var(--file-line-width);
  max-width:none !important;
}
.cm-content.cm-lineWrapping:has(.sc-dynamic-codeblock)>.cm-embed-block:has(.sc-dynamic-codeblock){
  width:auto !important;
}`.trim();

    const styleEl = document.createElement('style');
    styleEl.id = 'sc-grow-css';
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  /**
   * Removes the injected grow rules if present.
   */
  _removeGrowCss() {
    const styleEl = document.getElementById('sc-grow-css');
    if (styleEl) styleEl.remove();
  }

  // Override this method in subclasses to extract links from the source based on platform-specific logic
  _extract_links(source) {}
}
