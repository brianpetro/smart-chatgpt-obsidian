import { Platform, setIcon } from 'obsidian';
import { format_dropdown_label, platform_label_from_url } from '../utils/dropdown_label.js';
import {
  extract_links_from_source,
  normalize_url_value,
  prefix_missing_chat_lines,
  resolve_initial_fallback_url,
  resolve_initial_link_from_links
} from '../utils/smart_chat_codeblock.helpers.js';
import { handle_chatgpt_threads_list_detection } from '../utils/handle_chatgpt_threads_list_detection.js';

const DEFAULT_WEBVIEW_USERAGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.191 Safari/537.36';
const DEFAULT_WEBVIEW_PREFERENCES = 'nativeWindowOpen=yes, contextIsolation=yes';

const HELP_DOC_URL = 'https://smartconnections.app/smart-chat/codeblock/';

const footer_button_labels = () => [
  'Refresh',
  'Build context',
  'Open in browser',
  'Copy link',
  'Grow'
];

const MOBILE_HINT_TEXT = 'Webview unavailable on mobile. Use Open + Copy.';

export class SmartChatCodeblock {
  constructor({ plugin, file, line_start, line_end, container_el, source, ctx }) {
    this.plugin = plugin;
    this.file = file;
    this.line_start = line_start;
    this.line_end = line_end;
    this.container_el = container_el;
    this.source = source;
    this.ctx = ctx;

    this._FALLBACK_URL = 'https://smartconnections.app/?utm_source=chat-codeblock-fallback';
    this._INITIAL_FALLBACK_URL = '';
    this._HELP_URL = HELP_DOC_URL;

    this.link_regex = /(https?:\/\/[^\s]+)/g;
    this.links = [];

    this.initial_link = '';
    this.last_detected_url = '';
    this.current_url = '';

    this.dropdown_container_el = null;
    this.dropdown_row_el = null;
    this.dropdown_el = null;
    this.state_chip_el = null;
    this.mobile_hint_el = null;

    this.mark_done_button_el = null;
    this.help_button_el = null;
    this.status_text_el = null;
    this.webview_el = null;
    this._detected_threads = [];

    this.refresh_button_el = null;
    this.open_browser_button_el = null;
    this.copy_link_button_el = null;
    this.grow_contain_button_el = null;

    this._temp_context_key = '';

    this._is_mobile = this._is_mobile_app();
    this._supports_webview = this._supports_webview_app();

    if (this.container_el?.classList) {
      if (this._is_mobile) this.container_el.classList.add('sc-is-mobile');
      if (!this._supports_webview) this.container_el.classList.add('sc-no-webview');
    }

    this._wrap_render_save_ui();
    this._init_no_webview_click_intercepts();
  }

  async build() {
    if (!this.container_el?.createEl) return;

    this._reset_dom_refs();
    try {
      this.container_el.empty();
    } catch (_) {}

    await this._prefix_missing_lines_in_file();

    const updated_source = await this._get_codeblock_source_from_file();
    if (typeof updated_source === 'string') {
      this.source = updated_source;
    }

    this.links = this._extract_links(this.source) || [];
    this.initial_link = this._resolve_initial_link();
    this.current_url = this.initial_link;
    this.last_detected_url = this.initial_link;

    this._build_standard_ui();

    if (this.webview_el && this.current_url?.startsWith('http')) {
      this.webview_el.setAttribute('src', this.current_url);
    }

    if (typeof this._render_save_ui === 'function') {
      await this._render_save_ui(this.current_url);
    }
  }

  _reset_dom_refs() {
    this.dropdown_container_el = null;
    this.dropdown_row_el = null;
    this.dropdown_el = null;
    this.state_chip_el = null;
    this.mobile_hint_el = null;

    this.mark_done_button_el = null;
    this.help_button_el = null;
    this.status_text_el = null;
    this.webview_el = null;

    this.refresh_button_el = null;
    this.open_browser_button_el = null;
    this.copy_link_button_el = null;
    this.grow_contain_button_el = null;
  }

  _get_initial_fallback_url() {
    return resolve_initial_fallback_url({
      initial_fallback_url: this._INITIAL_FALLBACK_URL,
      fallback_url: this._FALLBACK_URL
    });
  }

  _resolve_initial_link() {
    return resolve_initial_link_from_links({
      links: this.links,
      initial_fallback_url: this._INITIAL_FALLBACK_URL,
      fallback_url: this._FALLBACK_URL
    });
  }

  _build_standard_ui() {
    const top_row_el = this.container_el.createEl('div', { cls: 'sc-top-row' });

    this._build_dropdown(top_row_el);

    this.mark_done_button_el = top_row_el.createEl('button', {
      text: this._MARK_DONE_LABEL || 'Mark done',
      cls: 'sc-mark-done-button sc-hidden'
    });
    this._hide_mark_done_button();

    // Help icon (docs) immediately after Mark done / Mark active.
    this._build_help_button(top_row_el);

    this.status_text_el = top_row_el.createEl('span', {
      text: '',
      cls: 'sc-status-text'
    });

    if (this._supports_webview) {
      const webview_height = this.plugin?.settings?.iframe_height || 800;

      this.webview_el = this.container_el.createEl('webview', { cls: 'sc-webview' });
      this.webview_el.setAttribute('partition', this.plugin.app.getWebviewPartition());
      this.webview_el.setAttribute('allowpopups', '');
      this.webview_el.setAttribute('useragent', DEFAULT_WEBVIEW_USERAGENT);
      this.webview_el.setAttribute('webpreferences', DEFAULT_WEBVIEW_PREFERENCES);
      this.webview_el.style.setProperty('--sc-webview-height', webview_height + 'px');
      handle_chatgpt_threads_list_detection(this);

      const initial_src = this.current_url || this.initial_link || this._FALLBACK_URL;
      if (initial_src?.startsWith('http')) {
        this.webview_el.setAttribute('src', initial_src);
      }

      this.webview_el.addEventListener('dom-ready', () => {
        const factor = this.plugin?.settings?.zoom_factor || 1.0;
        try {
          this.webview_el.setZoomFactor(factor);
        } catch (_) {}
      });

      this._init_navigation_events();
    } else {
      this.webview_el = null;
    }

    this._render_footer();
  }

  _build_help_button(parent_el) {
    if (!parent_el?.createEl) return;

    const btn = parent_el.createEl('button', {
      cls: 'sc-help-button'
    });

    btn.setAttribute('aria-label', 'Help: Smart Chat codeblock docs');
    btn.setAttribute('title', 'Help');

    try {
      setIcon(btn, 'help-circle');
    } catch (_) {
      btn.textContent = '?';
    }

    btn.onclick = () => {
      this._open_external_url(this._HELP_URL);
    };

    this.help_button_el = btn;
  }

  _is_mobile_app() {
    try {
      if (Platform?.isMobileApp) return true;
    } catch (_) {}

    const app = this.plugin?.app || window?.app;
    if (typeof app?.isMobile === 'boolean') return app.isMobile;

    const ua = window?.navigator?.userAgent || '';
    return /Android|iPhone|iPad|iPod/i.test(ua);
  }

  _supports_webview_app() {
    if (this._is_mobile_app()) return false;
    const app = this.plugin?.app || window?.app;
    return typeof app?.getWebviewPartition === 'function';
  }

  _open_external_url(url) {
    if (!url || typeof url !== 'string') return;
    if (!url.startsWith('http')) return;
    try {
      window.open(url, '_external');
    } catch (err) {
      console.error('Failed opening external url:', url, err);
    }
  }

  async _get_codeblock_source_from_file() {
    if (!this.file) return null;
    try {
      const raw_data = await this.plugin.app.vault.read(this.file);
      const [start, end] = await this._get_codeblock_boundaries(raw_data);
      if (start < 0 || end < 0 || end <= start) return null;
      const lines = raw_data.split('\n').slice(start + 1, end);
      return lines.join('\n');
    } catch (err) {
      console.error('Error reading file for updated codeblock content:', err);
      return null;
    }
  }

  async _prefix_missing_lines_in_file() {
    if (!this.file) return;

    try {
      const raw_data = await this.plugin.app.vault.read(this.file);
      const [start, end] = await this._get_codeblock_boundaries(raw_data);
      if (start < 0 || end < 0) return;

      const { lines, changed } = prefix_missing_chat_lines({
        lines: raw_data.split('\n'),
        start,
        end,
        link_regex: this.link_regex
      });

      if (changed) {
        await this.plugin.app.vault.modify(this.file, lines.join('\n'));
      }
    } catch (err) {
      console.error('Error prefixing lines in file:', err);
    }
  }

  _set_status_text(text) {
    if (this.status_text_el) {
      this.status_text_el.textContent = text || '';
    }
  }

  _set_thread_state_chip({ state_label, state_class }) {
    if (!this.state_chip_el) return;

    this.state_chip_el.textContent = state_label || '';

    const classes_to_remove = ['sc-state-active', 'sc-state-done', 'sc-state-unsaved'];
    classes_to_remove.forEach(cls => {
      try {
        this.state_chip_el.classList.remove(cls);
      } catch (_) {}
    });

    if (state_class) {
      try {
        this.state_chip_el.classList.add(state_class);
      } catch (_) {}
    }
  }

  _show_mark_done_button() {
    if (!this.mark_done_button_el) return;
    try {
      this.mark_done_button_el.classList.remove('sc-hidden');
    } catch (_) {}
    try {
      this.mark_done_button_el.style.display = '';
    } catch (_) {}
  }

  _hide_mark_done_button() {
    if (!this.mark_done_button_el) return;
    try {
      this.mark_done_button_el.classList.add('sc-hidden');
    } catch (_) {}
    try {
      this.mark_done_button_el.style.display = 'none';
    } catch (_) {}
  }

  _wrap_render_save_ui() {
    if (this._render_save_ui_wrapped) return;
    if (typeof this._render_save_ui !== 'function') return;

    const original_render_save_ui = this._render_save_ui.bind(this);
    this._render_save_ui = async (url) => {
      this._sync_dropdown_value(url);
      const result = await original_render_save_ui(url);
      await this._maybe_render_mark_active_ui(url);
      await this._render_thread_state_ui(url);
      return result;
    };
    this._render_save_ui_wrapped = true;
  }

  async _maybe_render_mark_active_ui(url) {
    if (!this.mark_done_button_el) return;
    if (!url || typeof url !== 'string') return;
    if (!url.startsWith('http')) return;

    if (typeof this._is_thread_link === 'function' && !this._is_thread_link(url)) {
      const original = this.mark_done_button_el.dataset?.scMarkDoneLabel;
      if (original) this.mark_done_button_el.textContent = original;
      return;
    }

    if (!this.mark_done_button_el.dataset?.scMarkDoneLabel) {
      this.mark_done_button_el.dataset.scMarkDoneLabel =
        this.mark_done_button_el.textContent || (this._MARK_DONE_LABEL || 'Mark done');
    }

    if (typeof this._check_if_done !== 'function') return;

    const normalized = this._normalize_url(url);
    const is_done = await this._check_if_done(normalized);

    if (!is_done) {
      const original = this.mark_done_button_el.dataset?.scMarkDoneLabel;
      if (original) this.mark_done_button_el.textContent = original;
      return;
    }

    this.mark_done_button_el.textContent = 'Mark active';
    this._show_mark_done_button();

    this.mark_done_button_el.onclick = async () => {
      await this._mark_thread_active_in_codeblock(normalized);
      this.plugin.env?.events?.emit('chat_codeblock:marked_active', { url: normalized });
      this.plugin.notices.show('Marked thread as active.');
      await this._render_save_ui(this.current_url || normalized);
    };
  }

  _select_has_option_value(value) {
    if (!this.dropdown_el) return false;
    try {
      return Array.from(this.dropdown_el.options).some(opt => opt.value === value);
    } catch (_) {
      return false;
    }
  }

  _sync_dropdown_value(url) {
    if (!this.dropdown_el) return;
    if (!url || typeof url !== 'string') return;

    // Prefer exact match
    if (this._select_has_option_value(url)) {
      this.dropdown_el.value = url;
      return;
    }

    // Then try normalized match (strip query/hash)
    const normalized = this._normalize_url(url);
    if (normalized && normalized !== url && this._select_has_option_value(normalized)) {
      this.dropdown_el.value = normalized;
    }
  }

  _init_no_webview_click_intercepts() {
    if (!this.container_el?.addEventListener) return;
    if (this._no_webview_click_intercepts_inited) return;
    if (this._supports_webview) return;

    this.container_el.addEventListener('click', (ev) => {
      const target = ev.target;
      if (!(target instanceof HTMLElement)) return;

      const button = target.closest('button');
      if (!button) return;

      const label = (button.textContent || '').trim().toLowerCase();

      // Ensure "Open" always opens externally in no-webview environments (mobile).
      if (label.startsWith('open')) {
        const url = this.current_url || this.initial_link || '';
        if (url.startsWith('http')) {
          ev.preventDefault();
          ev.stopImmediatePropagation();
          this._open_external_url(url);
        }
        return;
      }

      // Prevent refresh from throwing (webview.reload is not available).
      if (label === 'refresh') {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        this.plugin?.notices?.show?.('Webview not available on mobile. Use Open in browser.');
        return;
      }

      // Grow/Contain is webview-layout focused; disable to avoid confusing UX.
      if (label === 'grow' || label === 'contain') {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        return;
      }
    }, true);

    this._no_webview_click_intercepts_inited = true;
  }

  /**
   * Insert new url line after the start
   */
  async _insert_link_into_codeblock(url) {
    if (!this.file) return;
    const timestamp_in_seconds = Math.floor(Date.now() / 1000);
    const new_line = `chat-active:: ${timestamp_in_seconds} ${url}`;

    if (this.ctx && this.ctx.replaceCode) {
      this.ctx.replaceCode(new_line + '\n' + this.source);
      const { text, lineStart: line_start, lineEnd: line_end } =
        this.ctx.getSectionInfo(this.container_el) ?? {};
      const updated_source = text.split('\n').slice(line_start + 1, line_end).join('\n');
      this.source = updated_source;
      this.links = this._extract_links(this.source);
      this._build_dropdown();
      return;
    }

    await this.plugin.app.vault.process(this.file, (file_data) => {
      const [start, end] = this._find_codeblock_boundaries ? this._find_codeblock_boundaries(file_data) : [this.line_start, this.line_end];
      if (start < 0 || end < 0) {
        console.warn('Cannot find codeblock to insert link:', url);
        return file_data;
      }
      const lines = file_data.split('\n');
      lines.splice(start + 1, 0, new_line);
      return lines.join('\n');
    });

    // Best-effort refresh of in-memory source so datetime meta can render immediately.
    const updated_source = await this._get_codeblock_source_from_file();
    if (typeof updated_source === 'string') {
      this.source = updated_source;
      this.links = this._extract_links(this.source);
    }
  }

  /**
   * Creates a dropdown for links, labeling done ones with "✓".
   */
  _build_dropdown(parent_el=null) {
    if (!this.dropdown_el) {
      const dropdown_parent = parent_el || this.dropdown_container_el;
      if (!dropdown_parent) throw new Error('Parent element is required to build dropdown');
      this.dropdown_container_el = dropdown_parent.createEl('div', { cls: 'sc-dropdown-container' });

      this.dropdown_row_el = this.dropdown_container_el.createEl('div', { cls: 'sc-dropdown-row' });
      this.dropdown_el = this.dropdown_row_el.createEl('select', { cls: 'sc-link-dropdown' });

      this.state_chip_el = this.dropdown_row_el.createEl('span', {
        cls: 'sc-thread-state-chip sc-state-unsaved',
        text: 'Unsaved'
      });

      this.dropdown_el.addEventListener('change', () => {
        const new_link = this.dropdown_el.value;

        // Always update current url, even when webviews do not work.
        this.current_url = new_link;
        if (this.webview_el) {
          this.webview_el.setAttribute('src', new_link);
        }

        // Always refresh UI immediately (state chip + status + mark done/active).
        if (typeof this._render_save_ui === 'function') {
          this._render_save_ui(new_link);
        }
      });
    }

    this.dropdown_el.empty();
    this.add_dropdown_options();

    const preferred = this.current_url || this.initial_link || this._FALLBACK_URL;
    this._sync_dropdown_value(preferred);

    if (!this.dropdown_el.value) {
      this.dropdown_el.value = this._FALLBACK_URL;
      this.current_url = this._FALLBACK_URL;
    }

    if (!this.mobile_hint_el && !this._supports_webview && this.dropdown_container_el) {
      this._render_mobile_hint();
    }
  }

  _render_mobile_hint() {
    this.mobile_hint_el = this.dropdown_container_el?.createEl('div', {
      cls: 'sc-mobile-hint',
      text: MOBILE_HINT_TEXT
    });
  }

  _render_footer() {
    if (!this.container_el?.createEl) return null;

    const bottom_row_el = this.container_el.createEl('div', { cls: 'sc-bottom-row' });
    const left_group_el = bottom_row_el.createEl('div', { cls: 'sc-bottom-row-left' });
    const right_group_el = bottom_row_el.createEl('div', { cls: 'sc-bottom-row-right' });

    this._grow_css_active = false;

    footer_button_labels().forEach(label => {
      const is_left = (label === 'Refresh' || label === 'Build context');
      const group_el = is_left ? left_group_el : right_group_el;
      const btn = group_el.createEl('button', { text: label });

      if (label === 'Refresh') {
        this.refresh_button_el = btn;
        btn.classList.add('sc-footer-refresh');
        btn.onclick = () => {
          if (this.webview_el) {
            try {
              this.webview_el.reload();
              this.plugin.env?.events?.emit('webview:reloaded', { url: this.current_url });
              this.plugin.notices.show('Webview reloaded.');
            } catch (_) {}
          }
        };
        return;
      }

      if (label === 'Build context') {
        btn.classList.add('sc-build-context-button', 'sc-footer-build-context');
        btn.setAttribute('aria-label', 'Build context for this thread');
        this._bind_build_context_click(btn);
        return;
      }

      if (label === 'Open in browser') {
        this.open_browser_button_el = btn;
        btn.classList.add('sc-footer-open');
        btn.onclick = () => {
          if (this.current_url && this.current_url.startsWith('http')) {
            window.open(this.current_url, '_blank');
          }
        };
        return;
      }

      if (label === 'Copy link') {
        this.copy_link_button_el = btn;
        btn.classList.add('sc-footer-copy');
        btn.onclick = () => {
          if (this.current_url?.startsWith('http')) {
            navigator.clipboard.writeText(this.current_url);
            this.plugin.env?.events?.emit('url:copied', { url: this.current_url });
            this.plugin.notices.show('Copied current URL to clipboard.');
          }
        };
        return;
      }

      if (label === 'Grow') {
        this.grow_contain_button_el = btn;
        btn.classList.add('sc-footer-grow');
        btn.setAttribute('aria-label', 'Grow codeblock width');

        btn.onclick = () => {
          if (this._grow_css_active) {
            this._removeGrowCss();
            this.grow_contain_button_el.textContent = 'Grow';
            this.grow_contain_button_el.setAttribute('aria-label', 'Grow codeblock width');
            this._grow_css_active = false;
          } else {
            this._applyGrowCss();
            this.grow_contain_button_el.textContent = 'Contain';
            this.grow_contain_button_el.setAttribute('aria-label', 'Contain codeblock width');
            this._grow_css_active = true;
          }
        };
      }
    });

    return bottom_row_el;
  }

  _get_dropdown_label(url) {
    return format_dropdown_label(url, this.platform_label || platform_label_from_url(url));
  }

  add_dropdown_options() {
    const new_chat = this.dropdown_el.createEl('option');
    new_chat.value = this._FALLBACK_URL;
    new_chat.textContent = 'New chat';

    const initial_fallback = this._get_initial_fallback_url();
    if (initial_fallback && initial_fallback !== this._FALLBACK_URL) {
      const home_opt = this.dropdown_el.createEl('option');
      home_opt.value = initial_fallback;
      home_opt.textContent = 'Home';
    }

    for (const link_obj of this.links || []) {
      const option_el = this.dropdown_el.createEl('option');
      option_el.value = link_obj.url;
      const label = this._get_dropdown_label(link_obj.url);
      option_el.textContent = link_obj.done ? ('✓ ' + label) : label;
    }
  }

  _init_navigation_events() {
    if (!this.webview_el || !this._supports_webview) return;

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

    if (typeof this._is_thread_link === 'function' && this._is_thread_link(new_url)) {
      const link_to_save = this._normalize_url(new_url);
      const already_saved = await this._check_if_saved?.(link_to_save);
      if (!already_saved) {
        await this._insert_link_into_codeblock(link_to_save);
        this.plugin.env?.events?.emit('chat_codeblock:saved_thread', { url: link_to_save });
        this.plugin.notices.show(`Auto-saved new ${this.constructor.name} thread link.`);
      }
    }

    if (typeof this._render_save_ui === 'function') {
      this._render_save_ui(new_url);
    }
  }

  _normalize_url(url) {
    return normalize_url_value(url);
  }

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

  _removeGrowCss() {
    const styleEl = document.getElementById('sc-grow-css');
    if (styleEl) styleEl.remove();
  }

  _extract_links(codeblock_source) {
    return extract_links_from_source({
      codeblock_source,
      link_regex: this.link_regex
    });
  }

  _bind_build_context_click(btn) {
    if (!(btn instanceof HTMLButtonElement)) return;

    btn.onclick = () => {
      const url = this.current_url || this.initial_link || '';
      const context_key = this._resolve_context_key(url);
      const env = this.plugin.env;
      if (!env) return console.warn('No plugin.env available for context selector');

      const ctx = env.smart_contexts.get(context_key) || env.smart_contexts.new_context({ key: context_key });
      const temp_ctx = env.smart_contexts.get('temp-chat-context');

      if (temp_ctx) {
        const items_to_add = Object.keys(temp_ctx.data.context_items);
        ctx.add_items(items_to_add);
        temp_ctx.delete();
        temp_ctx.collection.process_save_queue();
      }

      ctx.emit_event('context_selector:open');
    };
  }

  _resolve_context_key(url) {
    const thread_key = this._resolve_thread_context_key(url);
    if (thread_key) return thread_key;

    if (this._temp_context_key) return this._temp_context_key;
    this._temp_context_key = 'temp-chat-context';
    return this._temp_context_key;
  }

  _resolve_thread_context_key(url) {
    if (!url || typeof url !== 'string') return null;
    if (!url.startsWith('http')) return null;

    if (typeof this._is_thread_link === 'function' && !this._is_thread_link(url)) {
      return null;
    }

    try {
      const u = new URL(this._normalize_url(url));
      const segments = u.pathname.split('/').filter(Boolean);
      const thread_id = segments[segments.length - 1] || '';
      if (!thread_id) return null;
      return `${u.hostname}:${thread_id}`;
    } catch (_) {
      return null;
    }
  }

  async _get_codeblock_boundaries(file_data) {
    if (typeof this._find_codeblock_boundaries !== 'function') {
      return [this.line_start, this.line_end];
    }
    try {
      const res = this._find_codeblock_boundaries(file_data);
      if (res && typeof res.then === 'function') return await res;
      return res;
    } catch (err) {
      console.error('Error resolving codeblock boundaries:', err);
      return [this.line_start, this.line_end];
    }
  }

  async _mark_thread_active_in_codeblock(url) {
    if (!this.file) return;
    if (!url || typeof url !== 'string') return;

    try {
      const raw_data = await this.plugin.app.vault.read(this.file);
      const [start, end] = await this._get_codeblock_boundaries(raw_data);
      if (start < 0 || end < 0 || end <= start) return;

      const normalized = this._normalize_url(url);
      const lines = raw_data.split('\n');
      let changed = false;

      for (let i = start + 1; i < end; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed.startsWith('chat-done:: ')) continue;

        if (lines[i].includes(url) || lines[i].includes(normalized)) {
          lines[i] = lines[i].replace('chat-done:: ', 'chat-active:: ');
          changed = true;
          break;
        }
      }

      if (!changed) return;
      await this.plugin.app.vault.modify(this.file, lines.join('\n'));
    } catch (err) {
      console.error('Error marking thread active:', err);
    }
  }

  _format_relative_time_from_unix_seconds(timestamp_in_seconds) {
    const ts = Number(timestamp_in_seconds);
    if (!Number.isFinite(ts) || ts <= 0) return '';

    const now_ms = Date.now();
    const diff_ms = now_ms - (ts * 1000);
    if (!Number.isFinite(diff_ms)) return '';

    if (diff_ms < 0) return 'in the future';

    const diff_s = Math.floor(diff_ms / 1000);
    if (diff_s < 10) return 'just now';
    if (diff_s < 60) return `${diff_s}s ago`;

    const diff_m = Math.floor(diff_s / 60);
    if (diff_m < 60) return `${diff_m}m ago`;

    const diff_h = Math.floor(diff_m / 60);
    if (diff_h < 24) return `${diff_h}h ago`;

    const diff_d = Math.floor(diff_h / 24);
    if (diff_d < 30) return `${diff_d}d ago`;

    const diff_mo = Math.floor(diff_d / 30);
    if (diff_mo < 12) return `${diff_mo}mo ago`;

    const diff_y = Math.floor(diff_d / 365);
    return `${diff_y}y ago`;
  }

  _parse_thread_meta_from_codeblock_source({ codeblock_source, url }) {
    if (!codeblock_source || typeof codeblock_source !== 'string') return null;
    if (!url || typeof url !== 'string') return null;

    const target = this._normalize_url(url);
    if (!target) return null;

    const lines = codeblock_source.split('\n');
    for (const raw_line of lines) {
      const trimmed = (raw_line || '').trim();
      if (!trimmed) continue;

      const lower = trimmed.toLowerCase();
      const is_active = lower.startsWith('chat-active::');
      const is_done = lower.startsWith('chat-done::');
      if (!is_active && !is_done) continue;

      const tokens = trimmed.split(/\s+/).filter(Boolean);
      if (tokens.length < 2) continue;

      const maybe_ts = tokens[1];
      const ts = parseInt(maybe_ts, 10);
      const timestamp_in_seconds = Number.isFinite(ts) ? ts : null;

      const last_token = tokens[tokens.length - 1] || '';
      const candidate_url = this._normalize_url(last_token);

      if (candidate_url && candidate_url === target) {
        return {
          done: is_done,
          timestamp_in_seconds
        };
      }
    }

    return null;
  }

  async _render_thread_state_ui(url) {
    const is_http = !!(url && typeof url === 'string' && url.startsWith('http'));

    let is_thread_link = false;
    if (is_http) {
      is_thread_link = typeof this._is_thread_link === 'function'
        ? this._is_thread_link(url)
        : true;
    }

    let meta = null;

    if (is_thread_link) {
      meta = this._parse_thread_meta_from_codeblock_source({
        codeblock_source: this.source,
        url
      });

      if (!meta && this.file) {
        const updated_source = await this._get_codeblock_source_from_file();
        if (typeof updated_source === 'string') {
          this.source = updated_source;
          meta = this._parse_thread_meta_from_codeblock_source({
            codeblock_source: updated_source,
            url
          });
        }
      }
    }

    let state_label = 'Unsaved';
    let state_class = 'sc-state-unsaved';
    let rel = '';

    if (meta) {
      state_label = meta.done ? 'Done' : 'Active';
      state_class = meta.done ? 'sc-state-done' : 'sc-state-active';
      if (meta.timestamp_in_seconds) {
        rel = this._format_relative_time_from_unix_seconds(meta.timestamp_in_seconds);
      }
    }

    this._set_thread_state_chip({ state_label, state_class });

    const display = rel ? `${state_label} • ${rel}` : state_label;
    this._set_status_text(display);
  }
}
