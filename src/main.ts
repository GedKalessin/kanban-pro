import { Plugin, TFile, Notice, WorkspaceLeaf } from 'obsidian';
import { KanbanBoardView, KANBAN_VIEW_TYPE } from './views/KanbanBoardView';
import { KanbanBoard, BOARD_TEMPLATES } from './models/types';
import { KanbanSettingsTab, KanbanPluginSettings, DEFAULT_SETTINGS } from './settings';

// ============================================
// KANBAN PRO PLUGIN - Main Entry Point
// ============================================

export default class KanbanProPlugin extends Plugin {
  settings: KanbanPluginSettings;
  private autoSaveIntervals: Map<string, number> = new Map();

  async onload() {
    console.log('🚀 Loading Kanban Pro Plugin');

    await this.loadSettings();

    // Register custom view
    this.registerView(
      KANBAN_VIEW_TYPE,
      (leaf) => new KanbanBoardView(leaf, this)
    );

    // Register file extension
    this.registerExtensions(['kanban'], KANBAN_VIEW_TYPE);

    // Add ribbon icon
    this.addRibbonIcon('layout-grid', 'Create Kanban Board', () => {
      this.showNewBoardModal();
    });

    // Add commands
    this.addCommand({
      id: 'create-kanban-board',
      name: 'Create new Kanban board',
      callback: () => this.showNewBoardModal()
    });

    this.addCommand({
      id: 'open-kanban-board',
      name: 'Open Kanban board',
      callback: () => this.showOpenBoardModal()
    });

    this.addCommand({
      id: 'create-kanban-from-template',
      name: 'Create Kanban from template',
      callback: () => this.showTemplateModal()
    });

    // Add settings tab
    this.addSettingTab(new KanbanSettingsTab(this.app, this));

    // Listen for file open events
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        if (file && file.extension === 'kanban') {
          this.openKanbanBoard(file);
        }
      })
    );

    console.log('✅ Kanban Pro Plugin loaded successfully');
  }

  onunload() {
    console.log('👋 Unloading Kanban Pro Plugin');
    
    // Clear all auto-save intervals
    this.autoSaveIntervals.forEach(interval => clearInterval(interval));
    this.autoSaveIntervals.clear();
    
    // Detach all Kanban views
    this.app.workspace.detachLeavesOfType(KANBAN_VIEW_TYPE);
  }

  // ==================== SETTINGS ====================

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  // ==================== BOARD OPERATIONS ====================

  private showNewBoardModal() {
    const modal = new CreateBoardModal(this.app, async (name, folderPath) => {
      try {
        const board = this.createEmptyBoard(name);
        const filePath = await this.saveBoardToFile(board, name, folderPath);
        await this.openKanbanBoardByPath(filePath);
        new Notice(`✅ Created board "${name}"`, 3000);
      } catch (error) {
        console.error('Failed to create board:', error);
        new Notice('❌ Failed to create board', 3000);
      }
    });
    modal.open();
  }

  private showTemplateModal() {
    const modal = new TemplateSelectionModal(this.app, async (templateId, name, folderPath) => {
      try {
        const board = this.createBoardFromTemplate(templateId, name);
        const filePath = await this.saveBoardToFile(board, name, folderPath);
        await this.openKanbanBoardByPath(filePath);
        new Notice(`✅ Created board "${name}" from template`, 3000);
      } catch (error) {
        console.error('Failed to create board from template:', error);
        new Notice('❌ Failed to create board', 3000);
      }
    });
    modal.open();
  }

  private showOpenBoardModal() {
    const boards = this.getAllKanbanBoards();
    if (boards.length === 0) {
      new Notice('No Kanban boards found. Create one first!', 3000);
      return;
    }

    const modal = new OpenBoardModal(this.app, boards, async (filePath) => {
      await this.openKanbanBoardByPath(filePath);
    });
    modal.open();
  }

  private createEmptyBoard(name: string): KanbanBoard {
    const BoardService = require('./services/BoardService').BoardService;
    const service = new BoardService();
    const board = service.createDefaultBoard();
    board.name = name;
    return board;
  }

  private createBoardFromTemplate(templateId: string, name: string): KanbanBoard {
    const BoardService = require('./services/BoardService').BoardService;
    const service = new BoardService();
    return service.createBoardFromTemplate(templateId, name);
  }

  private async saveBoardToFile(board: KanbanBoard, name: string, folderPath: string): Promise<string> {
    const fileName = `${name}.kanban`;
    const filePath = folderPath ? `${folderPath}/${fileName}` : fileName;
    
    // Ensure folder exists
    if (folderPath) {
      const folder = this.app.vault.getAbstractFileByPath(folderPath);
      if (!folder) {
        await this.app.vault.createFolder(folderPath);
      }
    }

    const content = JSON.stringify(board, null, 2);
    await this.app.vault.create(filePath, content);
    return filePath;
  }

  async updateBoardFile(filePath: string, board: KanbanBoard): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file && file instanceof TFile) {
      const content = JSON.stringify(board, null, 2);
      await this.app.vault.modify(file, content);
    }
  }

  private getAllKanbanBoards(): TFile[] {
    return this.app.vault.getFiles().filter(file => file.extension === 'kanban');
  }

  private async openKanbanBoardByPath(filePath: string) {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file && file instanceof TFile) {
      await this.openKanbanBoard(file);
    }
  }

  private async openKanbanBoard(file: TFile) {
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({
      type: KANBAN_VIEW_TYPE,
      state: { file: file.path }
    });
    this.app.workspace.revealLeaf(leaf);
  }

  // ==================== AUTO-SAVE ====================

  setupAutoSave(filePath: string, view: KanbanBoardView) {
    // Clear existing interval if any
    if (this.autoSaveIntervals.has(filePath)) {
      clearInterval(this.autoSaveIntervals.get(filePath)!);
    }

    if (this.settings.autoSave && this.settings.autoSaveInterval > 0) {
      const interval = window.setInterval(async () => {
        try {
          await this.updateBoardFile(filePath, view.getBoard());
        } catch (error) {
          console.error('Auto-save failed:', error);
        }
      }, this.settings.autoSaveInterval * 1000);

      this.autoSaveIntervals.set(filePath, interval);
    }
  }
}

// ============================================
// MODAL COMPONENTS
// ============================================

import { App, Modal, Setting } from 'obsidian';

class CreateBoardModal extends Modal {
  private onSubmit: (name: string, folderPath: string) => void;
  private name: string = '';
  private folderPath: string = '';

  constructor(app: App, onSubmit: (name: string, folderPath: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('kanban-create-board-modal');

    contentEl.createEl('h2', { text: '✨ Create New Kanban Board' });

    new Setting(contentEl)
      .setName('Board name')
      .setDesc('Give your board a meaningful name')
      .addText(text => {
        text
          .setPlaceholder('My Project Board')
          .setValue(this.name)
          .onChange(value => this.name = value);
        text.inputEl.focus();
        text.inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.submit();
          }
        });
      });

    new Setting(contentEl)
      .setName('Folder')
      .setDesc('Optional: Choose a folder for the board')
      .addText(text => {
        text
          .setPlaceholder('Boards/')
          .setValue(this.folderPath)
          .onChange(value => this.folderPath = value);
      });

    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel', cls: 'mod-cancel' });
    cancelBtn.addEventListener('click', () => this.close());

    const createBtn = buttonContainer.createEl('button', { text: 'Create Board', cls: 'mod-cta' });
    createBtn.addEventListener('click', () => this.submit());
  }

  private submit() {
    if (this.name.trim()) {
      this.onSubmit(this.name.trim(), this.folderPath.trim());
      this.close();
    } else {
      new Notice('⚠️ Please enter a board name', 2000);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class TemplateSelectionModal extends Modal {
  private onSubmit: (templateId: string, name: string, folderPath: string) => void;
  private selectedTemplate: string = 'basic';
  private name: string = '';
  private folderPath: string = '';

  constructor(app: App, onSubmit: (templateId: string, name: string, folderPath: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('kanban-template-modal');

    contentEl.createEl('h2', { text: '🎨 Choose a Template' });

    const templatesGrid = contentEl.createDiv({ cls: 'template-grid' });

    BOARD_TEMPLATES.forEach(template => {
      const templateCard = templatesGrid.createDiv({ 
        cls: `template-card ${this.selectedTemplate === template.id ? 'selected' : ''}` 
      });

      const icon = templateCard.createDiv({ cls: 'template-icon' });
      icon.textContent = template.icon;

      templateCard.createEl('h3', { text: template.name });
      templateCard.createEl('p', { text: template.description });

      templateCard.addEventListener('click', () => {
        templatesGrid.querySelectorAll('.template-card').forEach(card => {
          card.removeClass('selected');
        });
        templateCard.addClass('selected');
        this.selectedTemplate = template.id;
      });
    });

    contentEl.createEl('h3', { text: 'Board Details' });

    new Setting(contentEl)
      .setName('Board name')
      .addText(text => {
        text
          .setPlaceholder('My Project Board')
          .setValue(this.name)
          .onChange(value => this.name = value);
      });

    new Setting(contentEl)
      .setName('Folder')
      .addText(text => {
        text
          .setPlaceholder('Boards/')
          .setValue(this.folderPath)
          .onChange(value => this.folderPath = value);
      });

    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel', cls: 'mod-cancel' });
    cancelBtn.addEventListener('click', () => this.close());

    const createBtn = buttonContainer.createEl('button', { text: 'Create from Template', cls: 'mod-cta' });
    createBtn.addEventListener('click', () => this.submit());
  }

  private submit() {
    if (this.name.trim()) {
      this.onSubmit(this.selectedTemplate, this.name.trim(), this.folderPath.trim());
      this.close();
    } else {
      new Notice('⚠️ Please enter a board name', 2000);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class OpenBoardModal extends Modal {
  private boards: TFile[];
  private onSubmit: (filePath: string) => void;

  constructor(app: App, boards: TFile[], onSubmit: (filePath: string) => void) {
    super(app);
    this.boards = boards;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('kanban-open-board-modal');

    contentEl.createEl('h2', { text: '📋 Open Kanban Board' });

    const boardsList = contentEl.createDiv({ cls: 'boards-list' });

    this.boards.forEach(board => {
      const boardItem = boardsList.createDiv({ cls: 'board-item' });
      
      const iconEl = boardItem.createDiv({ cls: 'board-icon' });
      iconEl.textContent = '📋';
      
      const infoEl = boardItem.createDiv({ cls: 'board-info' });
      infoEl.createEl('div', { text: board.basename, cls: 'board-name' });
      infoEl.createEl('div', { text: board.path, cls: 'board-path' });

      boardItem.addEventListener('click', () => {
        this.onSubmit(board.path);
        this.close();
      });
    });

    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel', cls: 'mod-cancel' });
    cancelBtn.addEventListener('click', () => this.close());
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
