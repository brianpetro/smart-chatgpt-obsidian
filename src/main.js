import {
  Plugin,
  Notice,
  TFile} from 'obsidian';

import { SmartPlugin } from 'obsidian-smart-env/smart_plugin.js';
import { SmartChatgptCodeblock }    from './views/smart_chatgpt_codeblock.js';
import { SmartClaudeCodeblock }     from './views/smart_claude_codeblock.js';
import { SmartGeminiCodeblock }     from './views/smart_gemini_codeblock.js';
import { SmartDeepseekCodeblock }   from './views/smart_deepseek_codeblock.js';
import { SmartPerplexityCodeblock } from './views/smart_perplexity_codeblock.js';
import { SmartGrokCodeblock }       from './views/smart_grok_codeblock.js';
import { SmartAistudioCodeblock }   from './views/smart_aistudio_codeblock.js';

// DEPRECATED view from sc-obsidian
import { SmartChatGPTView } from "./views/sc_chatgpt.obsidian.js";
import { SmartChatgptSettingTab } from './views/settings_tab.js';

/**
 * @typedef {Object} SmartChatgptPluginSettings
 * @property {number} iframe_height
 * @property {number} zoom_factor
 */
const DEFAULT_SETTINGS = {
  iframe_height: 800,
  zoom_factor: 0.9
};

export default class SmartChatgptPlugin extends SmartPlugin {
  get env () {
    return window?.smart_env;
  }
  /** @type {SmartChatgptPluginSettings} */
  settings = DEFAULT_SETTINGS;

  async onload() {
    this.notices = { show(msg) { new Notice(msg); } };
    await this.loadSettings();

    await this.disable_conflicting_plugins();

    this.register_all();
    this.addSettingTab(new SmartChatgptSettingTab(this.app, this));
    this.register_chatgpt_view();
  }

  async disable_conflicting_plugins() {
    const conflictIds = [
      'smart-claude',
      'smart-gemini',
      'smart-deepseek',
      'smart-perplexity',
      'smart-grok',
      'smart-aistudio'
    ];
    const enabled = this.app.plugins.enabledPlugins ?? new Set();
    for (const id of conflictIds) {
      if (enabled.has(id)) {
        try {
          await this.app.plugins.disablePlugin(id);
          this.env?.events?.emit('plugin:conflict_disabled', { plugin_id: id });
          this.notices.show(`Disabled conflicting plugin: ${id}`);
        } catch (e) { console.error(`Failed disabling ${id}:`, e); }
      }
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }

  get_session_partition() {
    return this.app.getWebviewPartition();
  }

  register_all() {
    this.register_commands();
    this.register_dynamic_codeblocks();
  }

  register_commands() {
    /** @type {Array<[string,string]>} */
    const cmds = [
      ['smart-chatgpt',   'OpenAI ChatGPT'],
      ['smart-claude',    'Anthropic Claude'],
      ['smart-gemini',    'Google Gemini'],
      ['smart-deepseek',  'DeepSeek'],
      ['smart-perplexity','Perplexity'],
      ['smart-grok',      'Grok'],
      ['smart-aistudio',  'Google AI Studio']
    ];
    cmds.forEach(([lang, label]) => {
      this.addCommand({
        id: `insert-${lang}-codeblock`,
        name: `Insert ${label} codeblock`,
        editorCallback: ed => {
          ed.replaceSelection(`\`\`\`${lang}\n\`\`\`\n`);
        }
      });
    });
  }

  register_dynamic_codeblocks() {
    /** @type {Record<string, any>} */
    const mapping = {
      'smart-chatgpt':    SmartChatgptCodeblock,
      'smart-claude':     SmartClaudeCodeblock,
      'smart-gemini':     SmartGeminiCodeblock,
      'smart-deepseek':   SmartDeepseekCodeblock,
      'smart-perplexity': SmartPerplexityCodeblock,
      'smart-grok':       SmartGrokCodeblock,
      'smart-aistudio':   SmartAistudioCodeblock
    };

    const makeProcessor = Cls => async (source, el, ctx) => {
      const container = el.createEl('div', { cls: 'sc-dynamic-codeblock' });

      const info = ctx.getSectionInfo(el);
      if (!info) { container.createEl('div', { text: 'Unable to get codeblock info.' }); return; }

      const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
      if (!(file instanceof TFile)) {
        container.createEl('div', { text: 'Unable to locate file.' });
        return;
      }

      const cb = new Cls({
        plugin: this,
        file,
        line_start: info.lineStart,
        line_end: info.lineEnd,
        container_el: container,
        source,
        ctx
      });
      cb.build();
    };

    Object.entries(mapping).forEach(([lang, Cls]) => {
      if (this.registerMarkdownCodeBlockProcessor)
        this.registerMarkdownCodeBlockProcessor(lang, makeProcessor(Cls));
    });
  }

  // MOVED FROM DEPRECATED CONNECTIONS PLUGIN
  register_chatgpt_view() {
    this.registerView(SmartChatGPTView.view_type, leaf => new SmartChatGPTView(leaf, this));
    this.addCommand({
      id: SmartChatGPTView.view_type,
      name: "Open: " + SmartChatGPTView.display_text + " view",
      callback: () => {
        SmartChatGPTView.open(this.app.workspace);
      }
    });

    // Dynamic accessor and opener for each view
    // e.g. this.smart_connections_view and this.open_smart_connections_view()
    const method_name = SmartChatGPTView.view_type
      .replace("smart-", "")
      .replace(/-/g, "_")
    ;
    Object.defineProperty(this, method_name, {
      get: () => SmartChatGPTView.get_view(this.app.workspace)
    });
    this["open_" + method_name] = () => SmartChatGPTView.open(this.app.workspace);
  }

}
