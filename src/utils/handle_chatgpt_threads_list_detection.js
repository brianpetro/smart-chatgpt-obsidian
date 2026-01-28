import { merge_chatgpt_conversation_items } from './chatgpt_conversation_item.js';

const SC_NET_PREFIX = '[SC_NET]';

/**
 * @param {string} raw_json
 * @returns {any|null}
 */
const try_parse_json = (raw_json) => {
  try {
    return JSON.parse(String(raw_json || '').trim());
  } catch (_) {
    return null;
  }
};

/**
 * Watches ChatGPT webview network calls and extracts conversation list items.
 *
 * Expected payloads:
 * - backend-api/conversations -> { items: [...] }
 *
 * @param {any} codeblock_cls_instance
 */
export function handle_chatgpt_threads_list_detection(codeblock_cls_instance) {
  if (!codeblock_cls_instance?.webview_el?.addEventListener) return;

  const update_detected_threads = (threads = []) => {
    const existing = Array.isArray(codeblock_cls_instance._detected_threads)
      ? codeblock_cls_instance._detected_threads
      : [];

    const merged = merge_chatgpt_conversation_items(existing, Array.isArray(threads) ? threads : []);
    codeblock_cls_instance._detected_threads = merged;

    if (typeof codeblock_cls_instance._on_detected_threads_updated === 'function') {
      try {
        codeblock_cls_instance._on_detected_threads_updated(merged);
      } catch (err) {
        console.error('Error in _on_detected_threads_updated:', err);
      }
    }
  };

  codeblock_cls_instance.webview_el.addEventListener('console-message', (e) => {
    const msg = e?.message || '';
    if (!msg.startsWith(SC_NET_PREFIX)) return;

    const json = msg.slice(SC_NET_PREFIX.length).trim();
    const payload = try_parse_json(json);
    if (!payload || !payload.url) return;

    const request_url = String(payload.url || '');

    if (request_url.includes('backend-api/conversations')) {
      const body = try_parse_json(payload.response_body || '{}') || {};
      const threads = Array.isArray(body.items) ? body.items : [];

      update_detected_threads(threads);

      console.log('Smart ChatGPT conversations response:', {
        current_url: codeblock_cls_instance.webview_el.getURL?.() || undefined,
        request_url,
        threads_count: threads.length
      });
    }
  });

  codeblock_cls_instance.webview_el.addEventListener('ipc-message', (event) => {
    if (event.channel === 'preload-ready') {
      console.log('[webview] preload-ready', event.args?.[0]);
    }
    if (event.channel !== 'network-log') return;

    const payload = event.args?.[0];
    console.log('Smart ChatGPT conversations response:', {
      current_url: codeblock_cls_instance.webview_el.getURL?.() || undefined,
      request_url: payload?.url,
      response: payload
    });
  });

  codeblock_cls_instance.webview_el.addEventListener('did-finish-load', async () => {
    const inject = `
      (() => {
        if (window.__sc_net_installed) return { ok: true, already_installed: true };
        window.__sc_net_installed = true;

        const log = (payload) => {
          try {
            console.log('${SC_NET_PREFIX}', JSON.stringify(payload));
          } catch (_) {}
        };

        // fetch
        const original_fetch = window.fetch;
        if (typeof original_fetch === 'function') {
          window.fetch = async (...args) => {
            const [input, init] = args;
            const url = typeof input === 'string' ? input : input?.url;
            const method = init?.method || 'GET';

            const res = await original_fetch(...args);
            const clone = res.clone();

            clone.text().then((body) => {
              log({
                kind: 'fetch',
                url,
                method,
                status: res.status,
                response_body: body
              });
            }).catch(() => {});

            return res;
          };
        }

        // XHR
        const original_open = XMLHttpRequest.prototype.open;
        const original_send = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
          this.__sc_method = method;
          this.__sc_url = url;
          return original_open.call(this, method, url, ...rest);
        };

        XMLHttpRequest.prototype.send = function(body) {
          this.addEventListener('load', function() {
            log({
              kind: 'xhr',
              url: this.__sc_url,
              method: this.__sc_method,
              status: this.status,
              response_body: this.responseText
            });
          });

          return original_send.call(this, body);
        };

        return { ok: true, installed: true };
      })();
        `;
    const res = await codeblock_cls_instance.webview_el.executeJavaScript(inject);
    console.log('[SC_NET] inject result:', res);
  });
}


// _detected_threads sample value:
// [
//     {
//         "id": "697a20f3-d2d8-8332-a096-a41f8d6585dd", // used to build URL
//         "title": "Intercepting Network Requests",
//         "create_time": "2026-01-28T14:45:20.195299Z",
//         "update_time": "2026-01-28T15:35:24.970521Z",
//         "pinned_time": null,
//         "mapping": null,
//         "current_node": null,
//         "conversation_template_id": null,
//         "gizmo_id": null,
//         "is_archived": false,
//         "is_starred": null,
//         "is_do_not_remember": false,
//         "memory_scope": "global_enabled",
//         "context_scopes": null,
//         "context_scopes_v2": {
//             "context_scopes": [
//                 {
//                     "is_siloed": false,
//                     "scope_namespace": "global",
//                     "sub_scope": null,
//                     "key": null,
//                     "key_timestamp": null,
//                     "key_scoped_access_claim": null
//                 }
//             ]
//         },
//         "workspace_id": null,
//         "async_status": null,
//         "safe_urls": [],
//         "blocked_urls": [],
//         "conversation_origin": null,
//         "snippet": null,
//         "sugar_item_id": null,
//         "sugar_item_visible": false
//     },
// ]