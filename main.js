import {
  Plugin,
  Notice,
  TFile,
  PluginSettingTab,
  Setting
} from 'obsidian';

import { SmartChatgptCodeblock }    from './smart_chatgpt_codeblock.js';
import { SmartClaudeCodeblock }     from './smart_claude_codeblock.js';
import { SmartGeminiCodeblock }     from './smart_gemini_codeblock.js';
import { SmartDeepseekCodeblock }   from './smart_deepseek_codeblock.js';
import { SmartPerplexityCodeblock } from './smart_perplexity_codeblock.js';
import { SmartGrokCodeblock }       from './smart_grok_codeblock.js';
import { SmartAistudioCodeblock }   from './smart_aistudio_codeblock.js';

/**
 * @typedef {Object} SmartChatgptPluginSettings
 * @property {number} iframe_height
 * @property {number} zoom_factor
 */
const DEFAULT_SETTINGS = {
  iframe_height: 800,
  zoom_factor: 0.9
};

class SmartChatgptSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Height (px)')
      .setDesc('Iframe height for embedded webviews.')
      .addText(txt => {
        txt
          .setPlaceholder('800')
          .setValue(String(this.plugin.settings.iframe_height))
          .onChange(async v => {
            const n = parseInt(v, 10);
            if (!isNaN(n)) {
              this.plugin.settings.iframe_height = n;
              await this.plugin.saveSettings();
            }
          });
      });

    new Setting(containerEl)
      .setName('Zoom')
      .setDesc('Zoom factor for all webviews.')
      .addSlider(slider => {
        slider
          .setLimits(0.1, 2.0, 0.1)
          .setValue(this.plugin.settings.zoom_factor)
          .onChange(async v => {
            this.plugin.settings.zoom_factor = v;
            await this.plugin.saveSettings();
            this.display();
          });
      })
      .addExtraButton(btn => {
        btn
          .setIcon('reset')
          .setTooltip('Reset zoom')
          .onClick(async () => {
            this.plugin.settings.zoom_factor = 1.0;
            await this.plugin.saveSettings();
            this.display();
          });
      })
      .then(setting => {
        setting.settingEl
          .createEl('div', {
            text: `Current: ${this.plugin.settings.zoom_factor.toFixed(1)}`
          })
          .style.marginTop = '5px';
      });
  }
}

export default class SmartChatgptPlugin extends Plugin {
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
}
