import test from 'ava';
import { chat_platform_from_url } from './chat_platform.js';

test('detects chatgpt', t => {
  t.is(chat_platform_from_url('https://chatgpt.com/c/123'), 'chatgpt');
});

test('detects claude', t => {
  t.is(chat_platform_from_url('https://claude.ai/chat/abc'), 'claude');
});

test('detects grok', t => {
  t.is(chat_platform_from_url('https://grok.com/chat/xyz'), 'grok');
});

test('handles unknown', t => {
  t.is(chat_platform_from_url('https://example.com'), 'unknown');
});
