import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import KanbanProPlugin from './main';

// ============================================
// PLUGIN SETTINGS
// ============================================

export interface KanbanPluginSettings {
  autoSave: boolean;
  autoSaveInterval: number;
  defaultBoardFolder: string;
  enableNotifications: boolean;
  enableSoundEffects: boolean;
  compactMode: boolean;
  showCardNumbers: boolean;
  enableKeyboardShortcuts: boolean;
  theme: 'auto' | 'light' | 'dark';
  dateFormat: 'relative' | 'absolute';
  firstDayOfWeek: 0 | 1; // 0 = Sunday, 1 = Monday
  enableTelemetry: boolean;
  maxHistorySize: number;
}

export const DEFAULT_SETTINGS: KanbanPluginSettings = {
  autoSave: true,
  autoSaveInterval: 30,
  defaultBoardFolder: 'Kanban Boards',
  enableNotifications: true,
  enableSoundEffects: false,
  compactMode: false,
  showCardNumbers: false,
  enableKeyboardShortcuts: true,
  theme: 'auto',
  dateFormat: 'relative',
  firstDayOfWeek: 1,
  enableTelemetry: false,
  maxHistorySize: 50
};

// ============================================
// SETTINGS TAB
// ============================================

export class KanbanSettingsTab extends PluginSettingTab {
  plugin: KanbanProPlugin;

  constructor(app: App, plugin: KanbanProPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h1', { text: '⚙️ Kanban Pro Settings' });

    // ==================== GENERAL SETTINGS ====================
    
    containerEl.createEl('h2', { text: 'General' });

    new Setting(containerEl)
      .setName('Auto-save')
      .setDesc('Automatically save board changes')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoSave)
        .onChange(async (value) => {
          this.plugin.settings.autoSave = value;
          await this.plugin.saveSettings();
          this.display();
        })
      );

    if (this.plugin.settings.autoSave) {
      new Setting(containerEl)
        .setName('Auto-save interval')
        .setDesc('How often to auto-save (in seconds)')
        .addSlider(slider => slider
          .setLimits(10, 300, 10)
          .setValue(this.plugin.settings.autoSaveInterval)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.autoSaveInterval = value;
            await this.plugin.saveSettings();
          })
        )
        .addExtraButton(button => button
          .setIcon('reset')
          .setTooltip('Reset to default (30s)')
          .onClick(async () => {
            this.plugin.settings.autoSaveInterval = 30;
            await this.plugin.saveSettings();
            this.display();
          })
        );
    }

    new Setting(containerEl)
      .setName('Default board folder')
      .setDesc('Where new boards are created by default')
      .addText(text => text
        .setPlaceholder('Kanban Boards')
        .setValue(this.plugin.settings.defaultBoardFolder)
        .onChange(async (value) => {
          this.plugin.settings.defaultBoardFolder = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Theme')
      .setDesc('Choose the appearance theme')
      .addDropdown(dropdown => dropdown
        .addOption('auto', 'Auto (follow Obsidian)')
        .addOption('light', 'Light')
        .addOption('dark', 'Dark')
        .setValue(this.plugin.settings.theme)
        .onChange(async (value: 'auto' | 'light' | 'dark') => {
          this.plugin.settings.theme = value;
          await this.plugin.saveSettings();
          this.applyTheme(value);
        })
      );

    // ==================== DISPLAY SETTINGS ====================

    containerEl.createEl('h2', { text: 'Display' });

    new Setting(containerEl)
      .setName('Compact mode')
      .setDesc('Show cards in a more compact layout')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.compactMode)
        .onChange(async (value) => {
          this.plugin.settings.compactMode = value;
          await this.plugin.saveSettings();
          document.body.toggleClass('kanban-compact-mode', value);
        })
      );

    new Setting(containerEl)
      .setName('Show card numbers')
      .setDesc('Display card numbers for easy reference')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showCardNumbers)
        .onChange(async (value) => {
          this.plugin.settings.showCardNumbers = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Date format')
      .setDesc('How to display dates on cards')
      .addDropdown(dropdown => dropdown
        .addOption('relative', 'Relative (Today, Tomorrow, etc.)')
        .addOption('absolute', 'Absolute (Jan 1, 2024)')
        .setValue(this.plugin.settings.dateFormat)
        .onChange(async (value: 'relative' | 'absolute') => {
          this.plugin.settings.dateFormat = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('First day of week')
      .setDesc('Choose which day starts the week')
      .addDropdown(dropdown => dropdown
        .addOption('0', 'Sunday')
        .addOption('1', 'Monday')
        .setValue(this.plugin.settings.firstDayOfWeek.toString())
        .onChange(async (value) => {
          this.plugin.settings.firstDayOfWeek = parseInt(value) as 0 | 1;
          await this.plugin.saveSettings();
        })
      );

    // ==================== NOTIFICATIONS ====================

    containerEl.createEl('h2', { text: 'Notifications & Sounds' });

    new Setting(containerEl)
      .setName('Enable notifications')
      .setDesc('Show notifications for important events')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableNotifications)
        .onChange(async (value) => {
          this.plugin.settings.enableNotifications = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Enable sound effects')
      .setDesc('Play sounds for actions (experimental)')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableSoundEffects)
        .onChange(async (value) => {
          this.plugin.settings.enableSoundEffects = value;
          await this.plugin.saveSettings();
        })
      );

    // ==================== KEYBOARD SHORTCUTS ====================

    containerEl.createEl('h2', { text: 'Keyboard Shortcuts' });

    new Setting(containerEl)
      .setName('Enable keyboard shortcuts')
      .setDesc('Use keyboard shortcuts for quick actions')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableKeyboardShortcuts)
        .onChange(async (value) => {
          this.plugin.settings.enableKeyboardShortcuts = value;
          await this.plugin.saveSettings();
        })
      );

    if (this.plugin.settings.enableKeyboardShortcuts) {
      const shortcutsInfo = containerEl.createDiv({ cls: 'kanban-shortcuts-info' });
      shortcutsInfo.createEl('h4', { text: 'Available Shortcuts' });
      
      const shortcutsList = shortcutsInfo.createEl('ul');
      const shortcuts = [
        { keys: 'Cmd/Ctrl + N', action: 'Create new card' },
        { keys: 'Cmd/Ctrl + K', action: 'Quick search' },
        { keys: 'Cmd/Ctrl + F', action: 'Filter cards' },
        { keys: 'Cmd/Ctrl + Z', action: 'Undo' },
        { keys: 'Cmd/Ctrl + Shift + Z', action: 'Redo' },
        { keys: 'Cmd/Ctrl + S', action: 'Save board' },
        { keys: 'Escape', action: 'Close modal/deselect' }
      ];

      shortcuts.forEach(({ keys, action }) => {
        const li = shortcutsList.createEl('li');
        li.createEl('kbd', { text: keys });
        li.createSpan({ text: ` - ${action}` });
      });
    }

    // ==================== ADVANCED ====================

    containerEl.createEl('h2', { text: 'Advanced' });

    new Setting(containerEl)
      .setName('Maximum history size')
      .setDesc('Number of undo/redo states to keep')
      .addSlider(slider => slider
        .setLimits(10, 100, 5)
        .setValue(this.plugin.settings.maxHistorySize)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.maxHistorySize = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Enable telemetry')
      .setDesc('Help improve Kanban Pro by sharing anonymous usage data')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableTelemetry)
        .onChange(async (value) => {
          this.plugin.settings.enableTelemetry = value;
          await this.plugin.saveSettings();
        })
      );

    // ==================== DATA MANAGEMENT ====================

    containerEl.createEl('h2', { text: 'Data Management' });

    new Setting(containerEl)
      .setName('Export settings')
      .setDesc('Export your plugin settings to a file')
      .addButton(button => button
        .setButtonText('Export')
        .setIcon('download')
        .onClick(() => {
          this.exportSettings();
        })
      );

    new Setting(containerEl)
      .setName('Import settings')
      .setDesc('Import plugin settings from a file')
      .addButton(button => button
        .setButtonText('Import')
        .setIcon('upload')
        .onClick(() => {
          this.importSettings();
        })
      );

    new Setting(containerEl)
      .setName('Reset to defaults')
      .setDesc('Reset all settings to their default values')
      .addButton(button => button
        .setButtonText('Reset')
        .setWarning()
        .onClick(async () => {
          const confirmed = await this.confirmReset();
          if (confirmed) {
            this.plugin.settings = { ...DEFAULT_SETTINGS };
            await this.plugin.saveSettings();
            this.display();
            new Notice('✅ Settings reset to defaults', 3000);
          }
        })
      );

    // ==================== ABOUT ====================

    containerEl.createEl('h2', { text: 'About' });

    const aboutSection = containerEl.createDiv({ cls: 'kanban-about' });
    aboutSection.createEl('p', { text: '🎯 Kanban Pro - Advanced project management for Obsidian' });
    aboutSection.createEl('p', { text: 'Version: 1.0.0' });
    
    const linksDiv = aboutSection.createDiv({ cls: 'kanban-links' });
    linksDiv.createEl('a', { 
      text: '📖 Documentation', 
      href: '#',
      cls: 'external-link' 
    });
    linksDiv.createSpan({ text: ' • ' });
    linksDiv.createEl('a', { 
      text: '🐛 Report Bug', 
      href: '#',
      cls: 'external-link' 
    });
    linksDiv.createSpan({ text: ' • ' });
    linksDiv.createEl('a', { 
      text: '💡 Request Feature', 
      href: '#',
      cls: 'external-link' 
    });
    linksDiv.createSpan({ text: ' • ' });
    linksDiv.createEl('a', { 
      text: '☕ Support Development', 
      href: '#',
      cls: 'external-link' 
    });
  }

  private applyTheme(theme: 'auto' | 'light' | 'dark'): void {
    document.body.removeClass('kanban-theme-light', 'kanban-theme-dark');
    
    if (theme === 'light') {
      document.body.addClass('kanban-theme-light');
    } else if (theme === 'dark') {
      document.body.addClass('kanban-theme-dark');
    }
    // 'auto' uses Obsidian's theme
  }

  private exportSettings(): void {
    const dataStr = JSON.stringify(this.plugin.settings, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'kanban-pro-settings.json';
    link.click();
    
    URL.revokeObjectURL(url);
    new Notice('✅ Settings exported successfully', 3000);
  }

  private importSettings(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    
    input.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const settings = JSON.parse(text);
        
        // Validate settings
        if (!this.validateSettings(settings)) {
          new Notice('❌ Invalid settings file', 3000);
          return;
        }

        this.plugin.settings = { ...DEFAULT_SETTINGS, ...settings };
        await this.plugin.saveSettings();
        this.display();
        new Notice('✅ Settings imported successfully', 3000);
      } catch (error) {
        console.error('Failed to import settings:', error);
        new Notice('❌ Failed to import settings', 3000);
      }
    });

    input.click();
  }

  private validateSettings(settings: any): boolean {
    // Basic validation
    if (typeof settings !== 'object' || settings === null) {
      return false;
    }

    // Check if at least some expected keys exist
    const requiredKeys = ['autoSave', 'defaultBoardFolder'];
    return requiredKeys.every(key => key in settings);
  }

  private async confirmReset(): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = new ConfirmResetModal(this.app, resolve);
      modal.open();
    });
  }
}

// ============================================
// CONFIRM RESET MODAL
// ============================================

import { Modal } from 'obsidian';

class ConfirmResetModal extends Modal {
  private onConfirm: (confirmed: boolean) => void;

  constructor(app: App, onConfirm: (confirmed: boolean) => void) {
    super(app);
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('kanban-confirm-modal');

    contentEl.createEl('h2', { text: '⚠️ Reset Settings' });
    contentEl.createEl('p', { 
      text: 'Are you sure you want to reset all settings to their defaults? This action cannot be undone.',
      cls: 'confirm-message'
    });

    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel', cls: 'mod-cancel' });
    cancelBtn.addEventListener('click', () => {
      this.onConfirm(false);
      this.close();
    });

    const confirmBtn = buttonContainer.createEl('button', { text: 'Reset', cls: 'mod-warning' });
    confirmBtn.addEventListener('click', () => {
      this.onConfirm(true);
      this.close();
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
