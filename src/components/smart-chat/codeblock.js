import codeblock_css from './codeblock.css' assert { type: 'css' };

const build_html = thread => `<div>
  <div class="sc-smart-chat-codeblock" data-codeblock-key="${thread.key}">
    <div class="sc-smart-chat-header">
      <select class="sc-smart-chat-select"></select>
      <div class="sc-smart-chat-toolbar">
        <button class="sc-smart-chat-mark-done" type="button">Mark done</button>
        <button class="sc-smart-chat-open" type="button" title="Open in browser">Open</button>
      </div>
    </div>
    <div class="sc-smart-chat-body"></div>
  </div>
</div>`;

/**
 * Render the smart chat codeblock container with controls.
 * @param {object} thread - Codeblock scope containing records and handlers.
 * @param {object} [params]
 * @returns {Promise<HTMLElement>}
 */
export async function render(thread, params = {}) {
  const frag = this.create_doc_fragment(build_html(thread));
  this.apply_style_sheet(codeblock_css);
  const container = frag.querySelector('.sc-smart-chat-codeblock');
  post_process.call(this, thread, container, params);
  return container;
}

/**
 * Attach interactivity to the rendered smart chat codeblock container.
 * @param {object} thread
 * @param {HTMLElement} container
 * @returns {Promise<void>}
 */
export async function post_process(thread, container, params = {}) {
  const env = thread.env;
  const body = container.querySelector('.sc-smart-chat-body');

  if(thread.data.url) {
    const webview = await env.smart_components.render_component('external_chat_thread_webview', thread, params);
    this.empty(body);
    body.appendChild(webview);
  }
}
