const build_html = ext_thread => {
  return `<div></div>`;
};

export async function render(ext_thread, params = {}) {
  const frag = this.create_doc_fragment(build_html(ext_thread));
  const container = frag.firstElementChild;
  post_process.call(this, ext_thread, container, params);
  return container;
}

export async function post_process(ext_thread, container, params = {}) {
  const app = ext_thread.env.plugin?.app || window.app;
  const frame = container.querySelector('.sc-external-chat-webview-frame');
  const webview = document.createElement('webview');
  webview.setAttribute('src', ext_thread.data.url);
  webview.setAttribute('partition', app.getWebviewPartition());
  webview.setAttribute('allowpopups', '');
  webview.setAttribute('useragent', "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.191 Safari/537.36");
  webview.setAttribute('webpreferences', 'nativeWindowOpen=yes, contextIsolation=yes');
  webview.setAttribute('allowpopups', 'true');
  webview.setAttribute('webpreferences', 'contextIsolation=no');
  frame.replaceChildren(webview);

  return container;
}

