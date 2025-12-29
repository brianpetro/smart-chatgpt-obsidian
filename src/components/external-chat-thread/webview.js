import { Platform, openExternal } from 'obsidian';
import webview_css from './webview.css' assert { type: 'css' };

const platform_labels = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  grok: 'Grok',
  unknown: 'Chat'
};

const MOBILE_HINT_TEXT = 'Webview unavailable on mobile. Use Open + Copy.';

/**
 * Construct base HTML for the external thread webview container.
 * @param {import('../../collections/external_chat_threads.js').ExternalChatThread} ext_thread
 * @returns {string}
 */
const build_html = ext_thread => {
  const label = platform_labels[ext_thread.data.platform] || platform_labels.unknown;
  return `<div>
    <div class="sc-external-chat-webview" data-thread-key="${ext_thread.key}">
      <div class="sc-external-chat-webview-header">
        <span>${label}</span>
        <span class="sc-external-chat-webview-status"></span>
      </div>
      <div class="sc-external-chat-webview-frame"></div>
    </div>
  </div>`;
};

const is_mobile_app = (env) => {
  try {
    if (Platform?.isMobileApp) return true;
  } catch (_) {}

  const app = env?.plugin?.app || window?.app;
  if (typeof app?.isMobile === 'boolean') return app.isMobile;

  const ua = window?.navigator?.userAgent || '';
  return /Android|iPhone|iPad|iPod/i.test(ua);
};

const supports_webview = (env) => {
  if (is_mobile_app(env)) return false;
  const app = env?.plugin?.app || window?.app;
  return typeof app?.getWebviewPartition === 'function';
};

const open_external_url = (url, env) => {
  if (!url || typeof url !== 'string') return;
  if (!url.startsWith('http')) return;

  try {
    if (typeof openExternal === 'function') {
      openExternal(url);
      return;
    }
  } catch (_) {}

  try {
    const app = env?.plugin?.app || window?.app;
    if (typeof app?.openWithDefaultApp === 'function') {
      app.openWithDefaultApp(url);
      return;
    }
  } catch (_) {}

  try {
    window.open(url, '_blank');
  } catch (err) {
    console.error('Failed opening external url:', url, err);
  }
};

const copy_url = async (url) => {
  if (!url?.startsWith('http')) return;
  try {
    await navigator.clipboard.writeText(url);
  } catch (err) {
    console.error('Failed to copy url:', err);
  }
};

const render_fallback = (container, frame, url, env) => {
  container.classList.add('sc-no-webview');
  const status = container.querySelector('.sc-external-chat-webview-status');
  if (status) status.textContent = 'Open externally';

  const hint = document.createElement('div');
  hint.className = 'sc-external-chat-webview-hint';
  hint.textContent = MOBILE_HINT_TEXT;

  const actions = document.createElement('div');
  actions.className = 'sc-external-chat-webview-actions';

  const open_btn = document.createElement('button');
  open_btn.type = 'button';
  open_btn.textContent = 'Open';
  open_btn.addEventListener('click', () => open_external_url(url, env));

  const copy_btn = document.createElement('button');
  copy_btn.type = 'button';
  copy_btn.textContent = 'Copy';
  copy_btn.addEventListener('click', () => copy_url(url));

  actions.append(open_btn, copy_btn);
  frame.replaceChildren(hint, actions);
};

/**
 * @param {import('../../collections/external_chat_threads.js').ExternalChatThread} ext_thread
 * @param {object} [params]
 * @returns {Promise<HTMLElement>}
 */
export async function render(ext_thread, params = {}) {
  const frag = this.create_doc_fragment(build_html(ext_thread));
  this.apply_style_sheet(webview_css);
  const container = frag.querySelector('.sc-external-chat-webview');
  post_process.call(this, ext_thread, container, params);
  return container;
}

/**
 * @param {import('../../collections/external_chat_threads.js').ExternalChatThread} ext_thread
 * @param {HTMLElement} container
 * @param {object} [params]
 * @returns {Promise<HTMLElement>}
 */
export async function post_process(ext_thread, container, params = {}) {
  const frame = container.querySelector('.sc-external-chat-webview-frame');
  const env = ext_thread.env;

  if (!supports_webview(env)) {
    render_fallback(container, frame, ext_thread.data.url, env);
    return container;
  }

  const platform = ext_thread.data.platform;
  const component_key = `external_chat_thread_${platform}_webview`;
  const webview_component = await ext_thread.env.smart_components.render_component(component_key, ext_thread, params);
  this.empty(frame);
  frame.appendChild(webview_component);
  return container;
}
