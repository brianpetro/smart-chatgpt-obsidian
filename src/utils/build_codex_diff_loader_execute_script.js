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
      poll_ms: 25, // fast polling for buttons
      settle_ms: 500, // stop after no new work for this long
      max_total_ms: 30000, // hard stop
      scroll_each: true, // helps trigger lazy-rendering in some UIs
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

    const section_has_diff_content = (section) => !!section.querySelector('[data-state="diff"]');

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
export const build_codex_diff_loader_execute_script = ({ expected_url }) => {
  const opts = {
    expected_url: String(expected_url || ''),
    poll_ms: 100,
    timeout_ms: 30000
  };

  return `(${run_codex_diff_loader_when_ready.toString()})(${codex_diff_loader.toString()}, ${JSON.stringify(opts)});`;
};
