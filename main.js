import { Plugin, Notice, TFile, PluginSettingTab, Setting } from 'obsidian';
import { SmartChatgptCodeblock } from './smart_chatgpt_codeblock.js';

/**
 * @typedef {Object} SmartChatgptPluginSettings
 * @property {number} iframe_height - height (in px) for the embedded iframe in codeblocks.
 * @property {number} zoom_factor - multiplier used to zoom in/out the ChatGPT webview (0.1 - 2.0).
 */

/**
 * Default settings for SmartChatgptPlugin.
 * @type {SmartChatgptPluginSettings}
 */
const DEFAULT_SETTINGS = {
  iframe_height: 800,
  zoom_factor: 0.9,
};

/**
 * A settings tab for the SmartChatgptPlugin. Includes:
 * - numeric field for 'iframe_height'
 * - slider for 'zoom_factor'
 */
class SmartChatgptSettingTab extends PluginSettingTab {
  /**
   * @param {import('obsidian').App} app
   * @param {SmartChatgptPlugin} plugin
   */
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    // Numeric field for iframe height
    new Setting(containerEl)
      .setName('Height (px)')
      .setDesc('Adjust how tall the embedded ChatGPT iframe is, in pixels.')
      .addText(text => {
        text
          .setPlaceholder('600')
          .setValue(this.plugin.settings.iframe_height.toString())
          .onChange(async (value) => {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed)) {
              this.plugin.settings.iframe_height = parsed;
              await this.plugin.saveSettings();
            }
          });
      });

    // Slider for zoom factor
    new Setting(containerEl)
      .setName('Zoom')
      .setDesc('Change the zoom factor of the ChatGPT webview (0.1 - 2.0).')
      .addSlider(slider => {
        slider
          .setLimits(0.1, 2.0, 0.1)
          .setValue(this.plugin.settings.zoom_factor)
          .onChange(async (value) => {
            this.plugin.settings.zoom_factor = value;
            await this.plugin.saveSettings();
            this.display(); // refresh UI
          });
      })
      .addExtraButton(cb => {
        cb.setIcon('reset');
        cb.setTooltip('Reset zoom to 1.0');
        cb.onClick(async () => {
          this.plugin.settings.zoom_factor = 1.0;
          await this.plugin.saveSettings();
          this.display();
        });
      })
      .then(setting => {
        const previewEl = setting.settingEl.createEl('div', {
          text: `Current: ${this.plugin.settings.zoom_factor.toFixed(1)}`
        });
        previewEl.style.marginTop = '5px';
      });

  }
}

export default class SmartChatgptPlugin extends Plugin {
  /**
   * @type {SmartChatgptPluginSettings}
   */
  settings = DEFAULT_SETTINGS;

  /**
   * Custom environment config for SmartEnv.
   * @type {Object}
   */
  smart_env_config = {
    collections: {
    }
  };

  /**
   * Called by Obsidian when the plugin is first loaded.
   */
  async onload() {
    this.notices = {
      show(msg) {
        new Notice(msg);
      }
    };

    await this.loadSettings();
    
    // Register everything
    this.register_all();
    
    // Add settings tab
    this.addSettingTab(new SmartChatgptSettingTab(this.app, this));
  }

  /**
   * Loads settings from disk.
   */
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  /**
   * Saves settings to disk.
   */
  async saveSettings() {
    await this.saveData(this.settings);
  }

  /**
   * Registers everything: the commands and codeblock processor.
   */
  register_all() {
    this.register_commands();
    this.register_dynamic_codeblock();
  }

  /**
   * Adds commands:
   * 1) Insert a 'smart-chatgpt' codeblock in the active editor
   */
  register_commands() {
    this.addCommand({
      id: 'insert-smart-chatgpt-codeblock',
      name: 'Insert Smart ChatGPT Codeblock',
      editorCallback: (editor) => {
        editor.replaceSelection('```smart-chatgpt\n```\n');
      }
    });
  }

  /**
   * Registers a markdown codeblock processor for language 'smart-chatgpt',
   * delegating UI logic to the SmartChatgptCodeblock class.
   */
  register_dynamic_codeblock() {
    const processor = async (source, el, ctx) => {
      const container = el.createEl('div', { cls: 'sc-dynamic-codeblock' });
      const section_info = ctx.getSectionInfo(el);
      if (!section_info) {
        container.createEl('div', { text: 'Unable to get codeblock section info.' });
        return;
      }
      const { lineStart, lineEnd } = section_info;
      const file_path = ctx.sourcePath;
      const file = this.app.vault.getAbstractFileByPath(file_path);
      if (!file || !(file instanceof TFile)) {
        container.createEl('div', { text: 'Unable to find file for codeblock.' });
        return;
      }
      const codeblock = new SmartChatgptCodeblock({
        plugin: this,
        file,
        line_start: lineStart,
        line_end: lineEnd,
        container_el: container,
        source
      });
      codeblock.build();
    };

    if (this.registerMarkdownCodeBlockProcessor) {
      this.registerMarkdownCodeBlockProcessor('smart-chatgpt', processor);
    }
  }
}
