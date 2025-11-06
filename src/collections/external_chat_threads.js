import { Collection, CollectionItem } from 'smart-collections';
import { AjsonSingleFileCollectionDataAdapter } from 'smart-collections/adapters/ajson_single_file.js';
import { murmur_hash_32_alphanumeric } from 'smart-utils/create_hash.js';
import { chat_platform_from_url } from '../utils/chat_platform.js';

/**
 * External chat thread metadata tracked per platform URL.
 */
export class ExternalChatThread extends CollectionItem {
  static get defaults() {
    return {
      data: {
        key: '',
        url: '',
        platform: 'unknown',
        note_path: '',
        status: 'active',
        created_at: 0,
        updated_at: 0,
        last_opened_at: 0
      }
    };
  }

  init() {
    if (!this.data.key && this.data.url) {
      this.data.key = `ext-chat-${murmur_hash_32_alphanumeric(this.data.url)}`;
    }
    if (!this.data.created_at) this.data.created_at = Date.now();
    if (!this.data.updated_at) this.data.updated_at = this.data.created_at;
    if (!this.data.platform || this.data.platform === 'unknown') {
      this.data.platform = chat_platform_from_url(this.data.url);
    }
  }

  mark_done() {
    if (this.data.status === 'done') return;
    this.data.status = 'done';
    this.touch();
  }

  touch() {
    this.data.updated_at = Date.now();
  }

  mark_open() {
    this.data.last_opened_at = Date.now();
    this.touch();
  }
}

/**
 * Collection managing external chat threads.
 */
export class ExternalChatThreads extends Collection {
  static get collection_key() {
    return 'external_chat_threads';
  }
}

export default {
  class: ExternalChatThreads,
  collection_key: ExternalChatThreads.collection_key,
  item_type: ExternalChatThread,
  data_adapter: AjsonSingleFileCollectionDataAdapter
};
