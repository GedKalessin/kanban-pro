import { App, Modal, Setting, Notice } from 'obsidian';
import { Priority } from '../models/types';
import { BoardService } from '../services/BoardService';

export class FilterModal extends Modal {
  private boardService: BoardService;
  private onUpdate: () => void;

  constructor(app: App, boardService: BoardService, onUpdate: () => void) {
    super(app);
    this.boardService = boardService;
    this.onUpdate = onUpdate;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kanban-filter-modal');

    contentEl.createEl('h2', { text: '🔍 Filters' });

    const board = this.boardService.getBoard();
    const filters = board.filters;

    // Assignees
    new Setting(contentEl)
      .setName('Assignees')
      .setDesc('Filter by assignees (comma-separated)')
      .addText(text => {
        text
          .setValue(filters.assignees.join(', '))
          .setPlaceholder('john, jane, bob')
          .onChange(value => {
            const assignees = value.split(',').map(a => a.trim()).filter(a => a);
            this.boardService.setFilters({ assignees });
            this.onUpdate();
          });
      });

    // Priorities
    new Setting(contentEl)
      .setName('Priorities')
      .setDesc('Select priorities to show')
      .addDropdown(dropdown => {
        dropdown.addOption('', 'All Priorities');
        const priorities: Priority[] = ['low', 'medium', 'high', 'critical'];
        priorities.forEach(p => {
          dropdown.addOption(p, p.charAt(0).toUpperCase() + p.slice(1));
        });
        dropdown.onChange(value => {
          if (value) {
            const currentPriorities = filters.priorities;
            if (!currentPriorities.includes(value as Priority)) {
              this.boardService.setFilters({ priorities: [...currentPriorities, value as Priority] });
              this.onUpdate();
              this.close();
              new FilterModal(this.app, this.boardService, this.onUpdate).open();
            }
          }
        });
      });

    // Show selected priorities
    if (filters.priorities.length > 0) {
      const prioritiesDiv = contentEl.createDiv({ cls: 'selected-filters' });
      filters.priorities.forEach(priority => {
        const tag = prioritiesDiv.createSpan({ cls: 'filter-tag' });
        tag.textContent = priority;
        const removeBtn = tag.createSpan({ cls: 'remove-filter' });
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', () => {
          const updated = filters.priorities.filter(p => p !== priority);
          this.boardService.setFilters({ priorities: updated });
          this.onUpdate();
          this.close();
          new FilterModal(this.app, this.boardService, this.onUpdate).open();
        });
      });
    }

    // Tags
    new Setting(contentEl)
      .setName('Tags')
      .setDesc('Filter by tags (comma-separated)')
      .addText(text => {
        text
          .setValue(filters.tags.join(', '))
          .setPlaceholder('bug, feature, urgent')
          .onChange(value => {
            const tags = value.split(',').map(t => t.trim()).filter(t => t);
            this.boardService.setFilters({ tags });
            this.onUpdate();
          });
      });

    // Date Range
    contentEl.createEl('h3', { text: 'Date Range' });

    new Setting(contentEl)
      .setName('Start Date')
      .addText(text => {
        text.inputEl.type = 'date';
        if (filters.dateRange?.start) {
          text.setValue(filters.dateRange.start.split('T')[0]);
        }
        text.onChange(value => {
          const dateRange = filters.dateRange || { start: null, end: null };
          dateRange.start = value ? new Date(value).toISOString() : null;
          this.boardService.setFilters({ dateRange });
          this.onUpdate();
        });
      });

    new Setting(contentEl)
      .setName('End Date')
      .addText(text => {
        text.inputEl.type = 'date';
        if (filters.dateRange?.end) {
          text.setValue(filters.dateRange.end.split('T')[0]);
        }
        text.onChange(value => {
          const dateRange = filters.dateRange || { start: null, end: null };
          dateRange.end = value ? new Date(value).toISOString() : null;
          this.boardService.setFilters({ dateRange });
          this.onUpdate();
        });
      });

    // Show/Hide Options
    contentEl.createEl('h3', { text: 'Visibility' });

    new Setting(contentEl)
      .setName('Show Completed')
      .addToggle(toggle => {
        toggle
          .setValue(filters.showCompleted)
          .onChange(value => {
            this.boardService.setFilters({ showCompleted: value });
            this.onUpdate();
          });
      });

    new Setting(contentEl)
      .setName('Show Blocked')
      .addToggle(toggle => {
        toggle
          .setValue(filters.showBlocked)
          .onChange(value => {
            this.boardService.setFilters({ showBlocked: value });
            this.onUpdate();
          });
      });

    // Actions
    const buttonContainer = contentEl.createDiv({ cls: 'button-container' });

    const clearBtn = buttonContainer.createEl('button', { text: 'Clear All Filters', cls: 'secondary-btn' });
    clearBtn.addEventListener('click', () => {
      this.boardService.clearFilters();
      this.onUpdate();
      this.close();
      new Notice('🧹 Filters cleared', 2000);
    });

    const closeBtn = buttonContainer.createEl('button', { text: 'Close', cls: 'primary-btn' });
    closeBtn.addEventListener('click', () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
