import { Plugin, Notice, TFile, PluginSettingTab, Setting } from 'obsidian';
import { SmartChatgptCodeblock } from './smart_chatgpt_codeblock.js';
import { session } from 'electron';

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
  zoom_factor: 0.9
};

/**
 * A settings tab for the SmartChatgptPlugin. Includes:
 * - numeric field for 'iframe_height'
 * - slider for 'zoom_factor'
 * - button to clear webview partition data
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
            this.display(); // refresh UI to update displayed value
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

    // Button to clear webview partition cache
    new Setting(containerEl)
      .setName('Clear cache')
      .setDesc('Clears the cache for the ChatGPT webview. May resolve some issues with ChatGPT.')
      .addButton((btn) => {
        btn.setButtonText('Clear Cache')
          .onClick(async () => {
            await this.plugin.clear_webview_partition_cache();
          });
      });

    // Button to clear webview partition data
    new Setting(containerEl)
      .setName('Clear data')
      .setDesc('Clears cache, cookies, local storage, etc. May resolve some other issues with ChatGPT.')
      .addButton((btn) => {
        btn.setButtonText('Clear Data')
          .onClick(async () => {
            await this.plugin.clear_webview_partition_data();
          });
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
    collections: {}
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
    this.register_all();
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
      name: 'Insert ChatGPT codeblock',
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


  get_session_partition() {
    const { session } = window.electron.remote || {};
    const current_partition = 'persist:smart-chatgpt-' + this.app.vault.getName();
    return session.fromPartition(current_partition);
  }

  async clear_webview_partition_cache() {
    const session_partition = this.get_session_partition();
    await session_partition.clearCache();
    this.notices.show('Successfully cleared ChatGPT webview cache.');
  }

  /**
   * Clears all webview partition data used by 'smart-chatgpt'.
   * @returns {Promise<void>}
   */
  async clear_webview_partition_data() {
    const session_partition = this.get_session_partition();

    try {
      await session_partition.clearStorageData({
        storages: [
          'appcache',
          'cache',
          'cookies',
          'filesystem',
          'indexdb',
          'localstorage',
          'shadercache',
          'serviceworkers',
          'websql',
          'cachestorage'
        ]
      });
      this.notices.show('Successfully cleared ChatGPT webview data.');
    } catch (err) {
      console.error('Error clearing partition data:', err);
      this.notices.show('Failed to clear webview data. See console.');
    }
  }
}
