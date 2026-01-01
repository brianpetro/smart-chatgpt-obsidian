import test from 'ava';
import { format_dropdown_label, platform_label_from_url, shorten_id_segment } from './dropdown_label.js';

test('shortens uuid-like segments to first 8 and last 4', t => {
  const segment = '69541302-47dc-8326-8195-65b81bff1fce';
  t.is(shorten_id_segment(segment), '69541302...1fce');
});

test('shortens long non-uuid segments to first 8 and last 6', t => {
  const segment = 'averylongsegmentvalue';
  t.is(shorten_id_segment(segment), 'averylon...tvalue');
});

test('returns original segment when short', t => {
  t.is(shorten_id_segment('short-id'), 'short-id');
});

test('formats dropdown label with platform label and shortened segment', t => {
  const url = 'https://chatgpt.com/c/69541302-47dc-8326-8195-65b81bff1fce';
  t.is(format_dropdown_label(url), 'ChatGPT • 69541302...1fce');
});

test('defaults to prettified hostname when platform label is missing', t => {
  const url = 'https://custom.example.com/path/averylongsegmentvalue';
  t.is(format_dropdown_label(url), 'Custom • averylon...tvalue');
  t.is(platform_label_from_url(url), 'Custom');
});
