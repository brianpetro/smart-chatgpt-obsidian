import { SmartChatCodeblock } from './smart_chat_codeblock.js';
import { is_chatgpt_thread_link } from '../utils/chatgpt_thread_link.js';

const CODEX_TASK_PATH_REGEX = /^\/codex\/tasks\/[a-z0-9-_]+\/?$/i;

const CODEX_HOSTNAMES = new Set([
  'chatgpt.com',
  'chat.openai.com'
]);

/**
 * @param {string} url
 * @returns {boolean}
 */
const is_codex_task_url = (url) => {
  try {
    const u = new URL(url);
    if (!CODEX_HOSTNAMES.has(u.hostname)) return false;
    return CODEX_TASK_PATH_REGEX.test(u.pathname || '');
  } catch (_) {
    return false;
  }
};

/**
 * User-provided Codex diff loader (verbatim), wrapped so we can inject it via executeJavaScript.
 */
function codex_diff_loader() {
  (() => {
    /**
     * Expands each diff section (elements with data-diff-header) and clicks any "Load diff" buttons
     * that appear inside them (handles async loading).
     *
     * Guard: do NOT click the expander if the section already contains an element with data-state="diff"
     * (prevents collapsing an already-expanded diff).
     *
     * Paste into console.
     */

    const CFG = {
      poll_ms: 25,           // fast polling for buttons
      settle_ms: 500,        // stop after no new work for this long
      max_total_ms: 30000,   // hard stop
      scroll_each: true,     // helps trigger lazy-rendering in some UIs
    };

    const state = {
      clicked: new WeakSet(),
      expanded: new WeakSet(),
      last_progress_ts: performance.now(),
      start_ts: performance.now(),
    };

    const now = () => performance.now();

    const is_visible = (el) => {
      if (!el || !el.getClientRects().length) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== "hidden" && cs.display !== "none" && cs.pointerEvents !== "none";
    };

    const find_sections = () => Array.from(document.querySelectorAll("[data-diff-header]"));

    const section_has_diff_content = (section) =>
      !!section.querySelector('[data-state="diff"]');

    const find_expand_target = (section) => {
      // In your markup: section -> first child has role="button" (the sticky header).
      const direct = section.querySelector(':scope > [role="button"]');
      if (direct) return direct;
      // Fallback: any role=button near the top of the section
      const any = section.querySelector('[role="button"]');
      return any || null;
    };

    const click_el = (el) => {
      if (!el || state.clicked.has(el)) return false;
      if (!is_visible(el)) return false;
      state.clicked.add(el);
      el.click();
      state.last_progress_ts = now();
      return true;
    };

    const is_load_diff_button = (btn) => {
      if (!btn) return false;
      const txt = (btn.innerText || btn.textContent || "").trim().toLowerCase();
      if (txt === "load diff") return true;

      // Fallback: nested node equals "Load diff"
      return Array.from(btn.querySelectorAll("*")).some((n) => {
        const t = (n.textContent || "").trim().toLowerCase();
        return t === "load diff";
      });
    };

    const click_load_buttons_in = (root) => {
      let did = 0;
      const buttons = Array.from(root.querySelectorAll("button"));
      for (const btn of buttons) {
        if (state.clicked.has(btn)) continue;
        if (!is_visible(btn)) continue;
        if (!is_load_diff_button(btn)) continue;
        if (click_el(btn)) did += 1;
      }
      return did;
    };

    const expand_sections = (sections) => {
      let did = 0;
      for (const section of sections) {
        // If diff content is already present, never click the expander (avoid collapse).
        if (section_has_diff_content(section)) {
          state.expanded.add(section);
          continue;
        }
        if (state.expanded.has(section)) continue;

        const expander = find_expand_target(section);
        if (expander && is_visible(expander)) {
          if (CFG.scroll_each) {
            section.scrollIntoView({ block: "start", inline: "nearest" });
          }
          expander.click();
          state.expanded.add(section);
          state.last_progress_ts = now();
          did += 1;
        }
      }
      return did;
    };

    const sweep = () => {
      const sections = find_sections();

      let did = 0;
      did += expand_sections(sections);

      // Click load buttons globally (some UIs detach/portal them)
      did += click_load_buttons_in(document);

      // Also sweep per-section to catch newly inserted tails
      for (const section of sections) {
        did += click_load_buttons_in(section);
      }

      const elapsed = now() - state.start_ts;
      const since_progress = now() - state.last_progress_ts;

      if (elapsed >= CFG.max_total_ms) {
        stop(`hard stop after ${Math.round(elapsed)}ms`);
        return;
      }

      if (since_progress >= CFG.settle_ms) {
        stop(`settled (no new work for ${Math.round(since_progress)}ms)`);
        return;
      }
    };

    let interval_id = null;
    let mo = null;

    const stop = (reason) => {
      if (interval_id) clearInterval(interval_id);
      interval_id = null;
      if (mo) mo.disconnect();
      mo = null;

      const sections = find_sections().length;
      console.log(`[diff-loader] done: ${reason}; sections=${sections}`);
    };

    // Observe DOM changes for async button appearance
    mo = new MutationObserver(() => {
      sweep();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });

    // Fast polling as a backstop
    interval_id = setInterval(sweep, CFG.poll_ms);

    // Kick immediately
    sweep();

    console.log('[diff-loader] running: expanding sections (no-collapse guard) + clicking "Load diff"...');
  })();
}

/**
 * Wait until the Codex task page has its diff UI present, then run the provided loader.
 *
 * @param {Function} run_loader
 * @param {Object} opts
 * @returns {Promise<{ok: boolean, reason: string}>}
 */
async function run_codex_diff_loader_when_ready(run_loader, opts = {}) {
  const cfg = {
    expected_url: String(opts.expected_url || ''),
    poll_ms: Number.isFinite(Number(opts.poll_ms)) ? Number(opts.poll_ms) : 100,
    timeout_ms: Number.isFinite(Number(opts.timeout_ms)) ? Number(opts.timeout_ms) : 30000
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const normalize = (url) => {
    try {
      const u = new URL(String(url || ''));
      u.search = '';
      u.hash = '';
      return u.toString();
    } catch (_) {
      return String(url || '');
    }
  };

  const expected_norm = normalize(cfg.expected_url);

  const same_route_as_expected = () => {
    if (!expected_norm) return true;

    const current_norm = normalize(window.location.href);

    try {
      const cur = new URL(current_norm);
      const exp = new URL(expected_norm);
      return cur.hostname === exp.hostname && cur.pathname === exp.pathname;
    } catch (_) {
      return current_norm === expected_norm;
    }
  };

  const has_diff_header = () => {
    try {
      return !!document.querySelector('[data-diff-header]');
    } catch (_) {
      return false;
    }
  };

  const has_load_diff_button = () => {
    try {
      const buttons = Array.from(document.querySelectorAll('button'));
      for (const btn of buttons) {
        const txt = (btn?.innerText || btn?.textContent || '').trim().toLowerCase();
        if (txt === 'load diff') return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  };

  const is_ready = () => {
    if (!same_route_as_expected()) return false;

    const rs = String(document?.readyState || '').toLowerCase();
    const dom_ready = (rs === 'complete' || rs === 'interactive');

    // Important: the diff loader self-stops quickly if there's nothing to do,
    // so wait until Codex diff UI exists before starting it.
    return dom_ready && (has_diff_header() || has_load_diff_button());
  };

  const start_ms = Date.now();
  while ((Date.now() - start_ms) < cfg.timeout_ms) {
    if (!same_route_as_expected()) return { ok: false, reason: 'navigated_away' };
    if (is_ready()) {
      run_loader();
      return { ok: true, reason: 'ready' };
    }
    await sleep(cfg.poll_ms);
  }

  if (!same_route_as_expected()) return { ok: false, reason: 'navigated_away' };

  // Last attempt even if we never observed diff UI (best-effort).
  run_loader();
  return { ok: false, reason: 'timeout' };
}

/**
 * @param {Object} args
 * @param {string} args.expected_url
 * @returns {string}
 */
const build_codex_diff_loader_execute_script = ({ expected_url }) => {
  const opts = {
    expected_url: String(expected_url || ''),
    poll_ms: 100,
    timeout_ms: 30000
  };

  return `(${run_codex_diff_loader_when_ready.toString()})(${codex_diff_loader.toString()}, ${JSON.stringify(opts)});`;
};

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

    this._FALLBACK_URL = 'https://chatgpt.com';

    this.links = this._extract_links(this.source);

    const not_done_link_obj = this.links.find(obj => !obj.done);
    this.initial_link = not_done_link_obj ? not_done_link_obj.url : this._FALLBACK_URL;

    this.last_detected_url = this.initial_link;
    this.current_url = this.initial_link;

    this.codex_diff_button_el = null;
    this._codex_diff_button_busy = false;
  }

  async build() {
    // Avoid stale element refs across rebuilds (base empties container).
    this.codex_diff_button_el = null;
    this._codex_diff_button_busy = false;

    await super.build();

    // Best-effort sync after full build; _render_save_ui also syncs.
    this._sync_codex_diff_button(this.current_url);
  }

  add_dropdown_options() {
    const new_codex_opt = this.dropdown_el.createEl('option');
    new_codex_opt.value = 'https://chatgpt.com/codex';
    new_codex_opt.textContent = 'New Codex';

    const new_sora_opt = this.dropdown_el.createEl('option');
    new_sora_opt.value = 'https://sora.chatgpt.com/drafts';
    new_sora_opt.textContent = 'New Sora';

    super.add_dropdown_options();
  }

  _is_thread_link(url) {
    return is_chatgpt_thread_link(url);
  }

  _ensure_codex_diff_button() {
    if (this.codex_diff_button_el) return;
    if (!this.status_text_el) return;

    const parent_el = this.status_text_el.parentElement;
    if (!parent_el || typeof parent_el.createEl !== 'function') return;

    const btn = parent_el.createEl('button', {
      text: 'Load diffs',
      cls: 'sc-codex-diff-button sc-hidden'
    });

    btn.setAttribute('aria-label', 'Codex: expand all diff sections and click any Load diff buttons');

    // Place the button immediately before the status text so the status stays right-aligned.
    try {
      parent_el.insertBefore(btn, this.status_text_el);
    } catch (_) {}

    btn.onclick = async () => {
      await this._run_codex_diff_loader_for_current_url();
    };

    this.codex_diff_button_el = btn;
  }

  _set_codex_diff_button_visible(visible) {
    if (!this.codex_diff_button_el) return;

    if (visible) {
      try {
        this.codex_diff_button_el.classList.remove('sc-hidden');
      } catch (_) {}
      try {
        this.codex_diff_button_el.style.display = '';
      } catch (_) {}
      return;
    }

    try {
      this.codex_diff_button_el.classList.add('sc-hidden');
    } catch (_) {}
    try {
      this.codex_diff_button_el.style.display = 'none';
    } catch (_) {}
  }

  _sync_codex_diff_button(url) {
    this._ensure_codex_diff_button();

    const has_webview = !!(this._supports_webview && this.webview_el && typeof this.webview_el.executeJavaScript === 'function');
    const should_show = has_webview && is_codex_task_url(String(url || ''));

    this._set_codex_diff_button_visible(should_show);
  }

  async _run_codex_diff_loader_for_current_url() {
    if (this._codex_diff_button_busy) return;
    if (!this._supports_webview || !this.webview_el) return;

    const raw_url = this.current_url || this.last_detected_url || '';
    const normalized = this._normalize_url(raw_url);

    if (!is_codex_task_url(normalized)) {
      this._sync_codex_diff_button(raw_url);
      return;
    }

    const btn = this.codex_diff_button_el;
    const original_text = btn?.textContent || 'Load diffs';

    this._codex_diff_button_busy = true;

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Loading diffs...';
    }

    try {
      const execute_script = build_codex_diff_loader_execute_script({ expected_url: normalized });
      await this.webview_el.executeJavaScript(execute_script);
    } catch (err) {
      console.error('Codex diff loader injection failed:', err);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = original_text;
      }
      this._codex_diff_button_busy = false;
    }
  }

  async _render_save_ui(url) {
    // Keep the button in sync on every URL change and dropdown selection.
    this._sync_codex_diff_button(url);

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

    if (!is_done) {
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

  async _mark_thread_done_in_codeblock(url) {
    if (!this.file) return;
    let next_url = '';
    await this.plugin.app.vault.process(this.file, (file_data) => {
      const lines = file_data.split('\n');
      const [start, end] = this._find_codeblock_boundaries(file_data);
      if (start < 0 || end < 0) {
        console.warn('Cannot find codeblock boundaries to mark done:', url);
        return file_data;
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

      const updated_data = lines.join('\n');
      next_url = this._find_next_undone_url(updated_data, start, end, done_line_index) || '';
      return updated_data;
    });

    if (next_url) {
      this.webview_el?.setAttribute('src', next_url);
      this.current_url = next_url;
    } else {
      this.webview_el?.setAttribute('src', this._FALLBACK_URL);
      this.current_url = this._FALLBACK_URL;
    }
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
