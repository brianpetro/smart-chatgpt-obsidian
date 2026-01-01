import { Setting } from 'obsidian';
import { SmartPluginSettingsTab } from 'obsidian-smart-env';

export class SmartChatgptSettingTab extends SmartPluginSettingsTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async render_plugin_settings(container) {
    if (!container) return;
    container.empty?.();

    // Keep existing local settings (used by SmartChatCodeblock webviews)
    new Setting(container)
      .setName('Height (px)')
      .setDesc('Iframe height for embedded webviews.')
      .addText((txt) => {
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

    const zoom_setting = new Setting(container)
      .setName('Zoom')
      .setDesc('Zoom factor for all webviews.');

    let slider_component = null;
    const current_value_el = zoom_setting.settingEl.createEl('div', {
      text: `Current: ${Number(this.plugin.settings.zoom_factor || 1.0).toFixed(1)}`,
    });
    current_value_el.style.marginTop = '5px';

    zoom_setting.addSlider((slider) => {
      slider_component = slider;
      slider
        .setLimits(0.1, 2.0, 0.1)
        .setValue(this.plugin.settings.zoom_factor)
        .onChange(async (v) => {
          this.plugin.settings.zoom_factor = v;
          await this.plugin.saveSettings();
          current_value_el.textContent = `Current: ${Number(v).toFixed(1)}`;
        });
    });

    zoom_setting.addExtraButton((btn) => {
      btn
        .setIcon('reset')
        .setTooltip('Reset zoom')
        .onClick(async () => {
          const reset_value = 1.0;
          this.plugin.settings.zoom_factor = reset_value;
          await this.plugin.saveSettings();
          slider_component?.setValue?.(reset_value);
          current_value_el.textContent = `Current: ${Number(reset_value).toFixed(1)}`;
        });
    });
  }
}
