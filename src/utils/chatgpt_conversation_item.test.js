import test from 'ava';
import {
  build_chatgpt_conversation_url,
  merge_chatgpt_conversation_items,
} from './chatgpt_conversation_item.js';

test('build_chatgpt_conversation_url builds normal /c/<id> urls', t => {
  const url = build_chatgpt_conversation_url({ id: '123e4567-e89b-12d3-a456-426614174000' });
  t.is(url, 'https://chatgpt.com/c/123e4567-e89b-12d3-a456-426614174000');
});

test('build_chatgpt_conversation_url builds /g/<gizmo>/c/<id> when gizmo_id exists', t => {
  const url = build_chatgpt_conversation_url({
    id: '123e4567-e89b-12d3-a456-426614174000',
    gizmo_id: 'gpt-id'
  });
  t.is(url, 'https://chatgpt.com/g/gpt-id/c/123e4567-e89b-12d3-a456-426614174000');
});

test('merge_chatgpt_conversation_items dedupes by id and keeps most recent update_time', t => {
  const existing = [{
    id: 'a',
    title: 'Old',
    update_time: '2026-01-01T00:00:00.000Z'
  }];
  const incoming = [{
    id: 'a',
    title: 'New',
    update_time: '2026-01-02T00:00:00.000Z'
  }];

  const merged = merge_chatgpt_conversation_items(existing, incoming);
  t.is(merged.length, 1);
  t.is(merged[0].id, 'a');
  t.is(merged[0].title, 'New');
});

test('merge_chatgpt_conversation_items sorts by recency desc', t => {
  const merged = merge_chatgpt_conversation_items([], [
    { id: 'older', update_time: '2026-01-01T00:00:00.000Z', title: 'Older' },
    { id: 'newer', update_time: '2026-01-03T00:00:00.000Z', title: 'Newer' },
    { id: 'middle', update_time: '2026-01-02T00:00:00.000Z', title: 'Middle' }
  ]);

  t.deepEqual(merged.map(x => x.id), ['newer', 'middle', 'older']);
});