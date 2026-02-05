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
import { SmartOpenWebuiCodeblock }  from './views/smart_openwebui_codeblock.js';
import { SmartKimiCodeblock }       from './views/smart_kimi_codeblock.js';

// DEPRECATED view from sc-obsidian
import { SmartChatGPTView } from "./views/sc_chatgpt.obsidian.js";
import { SmartChatgptSettingTab } from './views/settings_tab.js';
import { ReleaseNotesView } from './views/release_notes_view.js';

/**
 * @typedef {Object} SmartChatgptPluginSettings
 * @property {number} iframe_height
 * @property {number} zoom_factor
 * @property {string} openwebui_base_url
 */
const DEFAULT_SETTINGS = {
  iframe_height: 800,
  zoom_factor: 0.9,
  openwebui_base_url: 'http://localhost:3000'
};

export default class SmartChatgptPlugin extends SmartPlugin {
  ReleaseNotesView = ReleaseNotesView;
  get env () {
    return window?.smart_env;
  }
  /** @type {SmartChatgptPluginSettings} */
  settings = DEFAULT_SETTINGS;

  async onload() {
    this.app.workspace.onLayoutReady(this.initialize.bind(this)); // initialize when layout is ready
    this.SmartEnv.create(this, {});
    await this.loadSettings();

    this.register_all();
    this.addSettingTab(new SmartChatgptSettingTab(this.app, this));
    this.register_chatgpt_view();
  }
  async initialize() {
    await this.SmartEnv.wait_for({ loaded: true });
    await this.check_for_updates();
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
    this.register_item_views();
    this.register_dynamic_codeblocks();
  }

  get item_views() {
    return {
      ReleaseNotesView: this.ReleaseNotesView,
    };
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
      ['smart-aistudio',  'Google AI Studio'],
      ['smart-openwebui', 'Open WebUI'],
      ['smart-kimi',      'Kimi']
    ];
    cmds.forEach(([lang, label]) => {
      this.addCommand({
        id: `insert-${lang}-codeblock`,
        name: `Insert ${label} codeblock`,
        editorCallback: ed => {
          ed.replaceSelection(`\`\`\`${lang}\n\n\`\`\`\n`);
        }
      });
    });

    if (this._is_dataview_enabled()) {
      this.addCommand({
        id: 'insert-chat-thread-dataviews',
        name: 'Insert Smart Chat thread Dataview blocks',
        editorCallback: ed => {
          ed.replaceSelection([
            '## Chat threads',
            '',
            'In Progress:',
            '',
            '```dataview',
            'LIST WITHOUT ID file.link',
            'WHERE chat-active',
            'SORT file.mtime DESC',
            '```',
            '',
            'Completed:',
            '',
            '```dataview',
            'LIST WITHOUT ID file.link',
            'WHERE chat-done',
            'SORT file.mtime DESC',
            '```',
            ''
          ].join('\n'));
        }
      });
    }
  }

  _is_dataview_enabled() {
    const plugins = this.app?.plugins;
    if (!plugins) return false;
    if (plugins.enabledPlugins?.has?.('dataview')) return true;
    if (typeof plugins.getPlugin === 'function') {
      return Boolean(plugins.getPlugin('dataview'));
    }
    return false;
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
      'smart-aistudio':   SmartAistudioCodeblock,
      'smart-openwebui':  SmartOpenWebuiCodeblock,
      'smart-kimi':       SmartKimiCodeblock
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

  show_release_notes() {
    return this.ReleaseNotesView.open(this.app.workspace, this.manifest.version);
  }

}
