import webview_css from './webview.css' assert { type: 'css' };

const platform_labels = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  grok: 'Grok',
  unknown: 'Chat'
};

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
  const platform = ext_thread.data.platform;
  const component_key = `external_chat_thread_${platform}_webview`;
  const webview_component = await ext_thread.env.smart_components.render_component(component_key, ext_thread, params);
  this.empty(frame);
  frame.appendChild(webview_component);
  return container;
}
