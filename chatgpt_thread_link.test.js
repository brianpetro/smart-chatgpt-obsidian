import test from 'ava';
import { is_chatgpt_thread_link } from './chatgpt_thread_link.js';

const valid_threads = [
  'https://chatgpt.com/c/123e4567-e89b-12d3-a456-426614174000',
  'https://chatgpt.com/g/gpt-id/c/123e4567-e89b-12d3-a456-426614174000',
  'https://chatgpt.com/codex/tasks/sample-task',
  'https://sora.com/t/123e4567-e89b-12d3-a456-426614174000'
];

const invalid_threads = [
  'https://example.com/c/123e4567-e89b-12d3-a456-426614174000',
  'https://chatgpt.com/',
  'not a url'
];

test('recognizes valid chatgpt thread links', t => {
  for (const url of valid_threads) {
    t.true(is_chatgpt_thread_link(url), url);
  }
});

test('rejects invalid chatgpt thread links', t => {
  for (const url of invalid_threads) {
    t.false(is_chatgpt_thread_link(url), url);
  }
});
