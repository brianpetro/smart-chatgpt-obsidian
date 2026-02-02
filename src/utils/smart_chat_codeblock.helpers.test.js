import test from 'ava';
import {
  extract_links_from_source,
  extract_urls_from_line,
  normalize_url_value,
  prefix_missing_chat_lines,
  resolve_initial_fallback_url,
  resolve_initial_link_from_links,
  is_grok_thread_link,
  is_kimi_thread_link,
  is_openwebui_thread_link,
  line_contains_url,
  resolve_add_thread_button_anchor,
} from './smart_chat_codeblock.helpers.js';

const link_regex = /(https?:\/\/[^\s]+)/g;

test('extracts active, done, and bare links', t => {
  const source = [
    'chat-active:: 123 https://example.com/active',
    'chat-done:: 234 https://example.com/done',
    'A bare link https://example.com/bare'
  ].join('\n');

  const links = extract_links_from_source({ codeblock_source: source, link_regex });

  t.deepEqual(links, [
    { url: 'https://example.com/active', done: false },
    { url: 'https://example.com/done', done: true },
    { url: 'https://example.com/bare', done: false }
  ]);
});

test('extracts chat links when trailing tokens are present', t => {
  const source = [
    'chat-active:: 123 https://example.com/active #note',
    'chat-done:: 234 https://example.com/done trailing'
  ].join('\n');

  const links = extract_links_from_source({ codeblock_source: source, link_regex });

  t.deepEqual(links, [
    { url: 'https://example.com/active', done: false },
    { url: 'https://example.com/done', done: true }
  ]);
});

test('resolves initial link to first not-done entry', t => {
  const links = [
    { url: 'https://example.com/done', done: true },
    { url: 'https://example.com/next', done: false }
  ];

  const initial = resolve_initial_link_from_links({
    links,
    initial_fallback_url: 'https://example.com/home',
    fallback_url: 'https://example.com/fallback'
  });

  t.is(initial, 'https://example.com/next');
});

test('falls back to initial fallback then fallback URL', t => {
  const links = [
    { url: 'https://example.com/done', done: true }
  ];

  const initial_home = resolve_initial_link_from_links({
    links,
    initial_fallback_url: 'https://example.com/home',
    fallback_url: 'https://example.com/fallback'
  });
  t.is(initial_home, 'https://example.com/home');

  const initial_default = resolve_initial_link_from_links({
    links,
    initial_fallback_url: '',
    fallback_url: 'https://example.com/fallback'
  });
  t.is(initial_default, 'https://example.com/fallback');
});

test('returns normalized url without query or hash', t => {
  const normalized = normalize_url_value('https://example.com/path?query=1#hash');
  t.is(normalized, 'https://example.com/path');
});

test('normalize_url_value trims trailing slash for non-root paths', t => {
  const normalized = normalize_url_value('https://example.com/path/');
  t.is(normalized, 'https://example.com/path');
});

test('prefixes bare links with chat-active in range', t => {
  const lines = [
    '```smart-chatgpt',
    '  https://example.com/new',
    '```'
  ];
  const { lines: updated, changed } = prefix_missing_chat_lines({
    lines,
    start: 0,
    end: 2,
    link_regex,
    now_seconds: 100
  });

  t.true(changed);
  t.is(updated[1], 'chat-active:: 100 https://example.com/new');
});

test('leaves prefixed lines unchanged', t => {
  const lines = [
    '```smart-chatgpt',
    'chat-active:: 50 https://example.com/active',
    'chat-done:: 51 https://example.com/done',
    '```'
  ];

  const { lines: updated, changed } = prefix_missing_chat_lines({
    lines,
    start: 0,
    end: 3,
    link_regex,
    now_seconds: 100
  });

  t.false(changed);
  t.deepEqual(updated, lines);
});

test('resolve_initial_fallback_url prefers initial fallback when set', t => {
  t.is(
    resolve_initial_fallback_url({
      initial_fallback_url: 'https://example.com/home',
      fallback_url: 'https://example.com/fallback'
    }),
    'https://example.com/home'
  );

  t.is(
    resolve_initial_fallback_url({ initial_fallback_url: '', fallback_url: 'https://example.com/fallback' }),
    'https://example.com/fallback'
  );
});

test('line_contains_url matches URLs', t => {

  t.true(line_contains_url({
    line: 'chat-done:: 123 https://example.com/active)',
    target_url: 'https://example.com/active',
    link_regex
  }));

  t.false(line_contains_url({
    line: 'chat-active:: 123 https://example.com/other',
    target_url: 'https://example.com/active',
    link_regex
  }));
});

test('extract_urls_from_line de-duplicates and strips wrapping punctuation', t => {
  const source_line = 'See (https://example.com/alpha), and https://example.com/alpha.';

  const urls = extract_urls_from_line({
    line: source_line,
    link_regex
  });

  t.deepEqual(urls, ['https://example.com/alpha']);
});

test('line_contains_url normalizes query/hash and punctuation', t => {
  const source_line = 'chat-active:: 123 (https://example.com/path?query=1#hash),';

  t.true(line_contains_url({
    line: source_line,
    target_url: 'https://example.com/path',
    link_regex
  }));
});

test('line_contains_url matches trailing slash variants', t => {
  const source_line = 'chat-active:: 123 https://example.com/path/';

  t.true(line_contains_url({
    line: source_line,
    target_url: 'https://example.com/path',
    link_regex
  }));
});

test('resolve_add_thread_button_anchor uses build context parent + next sibling', t => {
  const parent_el = { id: 'footer-left' };
  const next_el = { id: 'after-build' };
  const build_context_button_el = {
    parentElement: parent_el,
    nextSibling: next_el
  };

  const result = resolve_add_thread_button_anchor({
    build_context_button_el,
    footer_parent_el: null,
    header_parent_el: null
  });

  t.is(result.parent_el, parent_el);
  t.is(result.insert_before_el, next_el);
});

test('resolve_add_thread_button_anchor falls back to footer parent', t => {
  const footer_parent_el = { id: 'footer-left', firstChild: { id: 'first' } };

  const result = resolve_add_thread_button_anchor({
    build_context_button_el: null,
    footer_parent_el,
    header_parent_el: null
  });

  t.is(result.parent_el, footer_parent_el);
  t.is(result.insert_before_el, footer_parent_el.firstChild);
});

test('resolve_add_thread_button_anchor falls back to header parent', t => {
  const header_parent_el = { id: 'header' };

  const result = resolve_add_thread_button_anchor({
    build_context_button_el: null,
    footer_parent_el: null,
    header_parent_el
  });

  t.is(result.parent_el, header_parent_el);
  t.is(result.insert_before_el, null);
});


const valid_grok_threads = [
  'https://grok.com/c/36153b4a-d3ed-475e-b63b-9246c3423b06',
  'https://grok.com/c/36153b4a-d3ed-475e-b63b-9246c3423b06/',
  'https://grok.com/c/36153b4a-d3ed-475e-b63b-9246c3423b06?utm_source=test',
  'https://grok.com/chat/36153b4a-d3ed-475e-b63b-9246c3423b06',
  'https://www.grok.com/c/36153b4a-d3ed-475e-b63b-9246c3423b06'
];

const invalid_grok_threads = [
  'https://grok.com/',
  'https://grok.com/chat',
  'https://grok.com/c',
  'https://example.com/c/36153b4a-d3ed-475e-b63b-9246c3423b06',
  'not a url'
];

test('recognizes valid grok thread links', t => {
  for (const url of valid_grok_threads) {
    t.true(is_grok_thread_link(url), url);
  }
});

test('rejects invalid grok thread links', t => {
  for (const url of invalid_grok_threads) {
    t.false(is_grok_thread_link(url), url);
  }
});

const valid_openwebui_threads = [
  'http://localhost:3000/c/123e4567-e89b-12d3-a456-426614174000',
  'http://localhost:3000/c/123e4567-e89b-12d3-a456-426614174000/',
  'https://openwebui.example.com/c/123e4567-e89b-12d3-a456-426614174000?utm_source=test',
  'https://example.com/openwebui/c/123e4567-e89b-12d3-a456-426614174000'
];

const invalid_openwebui_threads = [
  'http://localhost:3000/',
  'http://localhost:3000/?models=llama3',
  'http://localhost:3000/c',
  'http://localhost:3000/c/new',
  'https://example.com/path/without/c',
  'not a url'
];

test('recognizes valid openwebui thread links', t => {
  for (const url of valid_openwebui_threads) {
    t.true(is_openwebui_thread_link(url), url);
  }
});

test('rejects invalid openwebui thread links', t => {
  for (const url of invalid_openwebui_threads) {
    t.false(is_openwebui_thread_link(url), url);
  }
});

const valid_kimi_threads = [
  'https://www.kimi.com/chat/19c003f5-acb2-838b-8000-00006aa45d9b',
  'https://www.kimi.com/chat/en/19a99d62-6062-830d-8000-0000fb11a176',
  'https://kimi.com/chat/cn2dgno3r07f4fk1dc70',
  'https://www.kimi.com/chat/d2nk785e09netp2mb9bg?utm_source=test',
  'https://www.kimi.com/chat/en/d3ggof8l3dccogoni3n0'
];

const invalid_kimi_threads = [
  'https://www.kimi.com/',
  'https://www.kimi.com/en',
  'https://example.com/chat/123',
  'https://www.kimi.com/chat/',
  'not a url'
];

test('recognizes valid kimi thread links', t => {
  for (const url of valid_kimi_threads) {
    t.true(is_kimi_thread_link(url), url);
  }
});

test('rejects invalid kimi thread links', t => {
  for (const url of invalid_kimi_threads) {
    t.false(is_kimi_thread_link(url), url);
  }
});
