export class SmartChatCodeblock {
  constructor({ plugin, file, line_start, line_end, container_el, source, ctx }) {
    this.plugin = plugin;
    this.file = file;
    this.line_start = line_start;
    this.line_end = line_end;
    this.container_el = container_el;
    this.source = source;
    this.ctx = ctx;
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
}
