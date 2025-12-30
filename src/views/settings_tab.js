import { PluginSettingTab, Setting } from 'obsidian';

export class SmartChatgptSettingTab extends PluginSettingTab {
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
          .onChange(async (v) => {
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
          .onChange(async (v) => {
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
