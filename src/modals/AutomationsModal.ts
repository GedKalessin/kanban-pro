import { App, Modal, Setting, Notice } from 'obsidian';
import { BoardService } from '../services/BoardService';

export class AutomationsModal extends Modal {
  private boardService: BoardService;
  private onSave: () => void;

  constructor(app: App, boardService: BoardService, onSave: () => void) {
    super(app);
    this.boardService = boardService;
    this.onSave = onSave;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kanban-automations-modal');

    contentEl.createEl('h2', { text: '⚡ Automations' });

    const board = this.boardService.getBoard();

    if (board.automations.length === 0) {
      this.renderEmptyState();
    } else {
      this.renderAutomations();
    }

    // Add Automation Button
    const addBtn = contentEl.createEl('button', { text: '+ Add Automation', cls: 'primary-btn full-width-btn' });
    addBtn.addEventListener('click', () => {
      new Notice('⚠️ Automation creation - Coming soon!', 2000);
    });
  }

  private renderEmptyState(): void {
    const { contentEl } = this;
    const emptyState = contentEl.createDiv({ cls: 'empty-state' });
    emptyState.createEl('p', { text: 'No automations configured yet.' });
    emptyState.createEl('p', {
      text: 'Automations can automatically perform actions based on triggers like card moves or date changes.',
      cls: 'empty-state-description'
    });
  }

  private renderAutomations(): void {
    const { contentEl } = this;
    const board = this.boardService.getBoard();

    const automationsList = contentEl.createDiv({ cls: 'automations-list' });

    board.automations.forEach(automation => {
      const item = automationsList.createDiv({ cls: 'automation-item' });

      const header = item.createDiv({ cls: 'automation-header' });

      const toggle = header.createEl('input', { type: 'checkbox' });
      toggle.checked = automation.enabled;
      toggle.addEventListener('change', () => {
        automation.enabled = toggle.checked;
        this.onSave();
        new Notice(automation.enabled ? '✅ Automation enabled' : '⏸️ Automation disabled', 2000);
      });

      const name = header.createEl('span', { text: automation.name, cls: 'automation-name' });

      const deleteBtn = header.createEl('button', { text: '×', cls: 'delete-automation-btn' });
      deleteBtn.addEventListener('click', () => {
        board.automations = board.automations.filter(a => a.id !== automation.id);
        this.onSave();
        this.close();
        new AutomationsModal(this.app, this.boardService, this.onSave).open();
      });

      const description = item.createDiv({ cls: 'automation-description' });
      description.textContent = `When ${automation.trigger.type} → ${automation.actions.length} action(s)`;
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
