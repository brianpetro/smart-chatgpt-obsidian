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
      this.dropdown_el.value = this.initial_link;
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
  }
  add_dropdown_options() {
    const new_codex_opt = this.dropdown_el.createEl('option');
    new_codex_opt.value = this._FALLBACK_URL;
    new_codex_opt.textContent = 'New chat';
    // Add links from the codeblock
    for (const link_obj of this.links) {
      const option_el = this.dropdown_el.createEl('option');
      option_el.value = link_obj.url;
      option_el.textContent = link_obj.done
        ? ('✓ ' + link_obj.url)
        : link_obj.url;
    }
  }
  // Override this method in subclasses to extract links from the source based on platform-specific logic
  _extract_links(source) {}
}
