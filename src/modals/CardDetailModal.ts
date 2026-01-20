import { App, Modal, Setting, Notice, setIcon, MarkdownRenderer } from 'obsidian';
import { KanbanCard, Priority, TaskType, PRIORITY_COLORS, TASK_TYPE_ICONS } from '../models/types';
import { BoardService } from '../services/BoardService';
import { formatDisplayDate, generateId } from '../utils/helpers';

export class CardDetailModal extends Modal {
  private card: KanbanCard;
  private boardService: BoardService;
  private onUpdate: () => void;
  private contentArea: HTMLElement | null = null;

  constructor(app: App, card: KanbanCard, boardService: BoardService, onUpdate: () => void) {
    super(app);
    this.card = card;
    this.boardService = boardService;
    this.onUpdate = onUpdate;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kanban-card-detail-modal');

    this.renderHeader();
    this.renderContent();
    this.renderFooter();
  }

  private renderHeader(): void {
    const { contentEl } = this;
    const header = contentEl.createDiv({ cls: 'modal-header' });

    // Task Type Icon
    const taskTypeIcon = header.createSpan({ cls: 'task-type-icon-large' });
    taskTypeIcon.textContent = TASK_TYPE_ICONS[this.card.taskType];

    // Title
    const titleInput = header.createEl('input', {
      cls: 'card-title-input',
      type: 'text',
      value: this.card.title
    });
    titleInput.addEventListener('change', () => {
      this.boardService.updateCard(this.card.id, { title: titleInput.value });
      this.onUpdate();
    });

    // Close Button
    const closeBtn = header.createEl('button', { cls: 'modal-close-btn' });
    setIcon(closeBtn, 'x');
    closeBtn.addEventListener('click', () => this.close());
  }

  private renderContent(): void {
    const { contentEl } = this;
    this.contentArea = contentEl.createDiv({ cls: 'modal-content-area' });

    const leftColumn = this.contentArea.createDiv({ cls: 'content-left' });
    const rightColumn = this.contentArea.createDiv({ cls: 'content-right' });

    // Left: Main content
    this.renderMainContent(leftColumn);

    // Right: Metadata
    this.renderMetadata(rightColumn);
  }

  private renderMainContent(container: HTMLElement): void {
    // Description
    const descSection = container.createDiv({ cls: 'card-section' });
    descSection.createEl('h3', { text: '📝 Description' });

    const descTextarea = descSection.createEl('textarea', {
      cls: 'card-description-input',
      placeholder: 'Add a description...',
      value: this.card.description
    });
    descTextarea.addEventListener('change', () => {
      this.boardService.updateCard(this.card.id, { description: descTextarea.value });
      this.onUpdate();
    });

    // Checklist
    const checklistSection = container.createDiv({ cls: 'card-section' });
    const checklistHeader = checklistSection.createDiv({ cls: 'section-header' });
    checklistHeader.createEl('h3', { text: '✓ Checklist' });

    const addChecklistBtn = checklistHeader.createEl('button', { cls: 'icon-btn' });
    setIcon(addChecklistBtn, 'plus');
    addChecklistBtn.addEventListener('click', () => this.addChecklistItem(checklistSection));

    this.renderChecklist(checklistSection);

    // Linked Notes
    const notesSection = container.createDiv({ cls: 'card-section' });
    notesSection.createEl('h3', { text: '🔗 Linked Notes' });
    this.renderLinkedNotes(notesSection);
  }

  private renderMetadata(container: HTMLElement): void {
    // Status
    new Setting(container)
      .setName('Status')
      .addDropdown(dropdown => {
        const board = this.boardService.getBoard();
        board.columns.forEach(col => {
          dropdown.addOption(col.id, col.name);
        });
        dropdown.setValue(this.card.columnId);
        dropdown.onChange(value => {
          this.boardService.updateCard(this.card.id, { columnId: value });
          this.onUpdate();
        });
      });

    // Priority
    new Setting(container)
      .setName('Priority')
      .addDropdown(dropdown => {
        const priorities: Priority[] = ['none', 'low', 'medium', 'high', 'critical'];
        priorities.forEach(p => {
          dropdown.addOption(p, p.charAt(0).toUpperCase() + p.slice(1));
        });
        dropdown.setValue(this.card.priority);
        dropdown.onChange(value => {
          this.boardService.updateCard(this.card.id, { priority: value as Priority });
          this.onUpdate();
        });
      });

    // Task Type
    new Setting(container)
      .setName('Type')
      .addDropdown(dropdown => {
        const types: TaskType[] = ['task', 'feature', 'bug', 'improvement', 'story', 'epic'];
        types.forEach(t => {
          dropdown.addOption(t, `${TASK_TYPE_ICONS[t]} ${t.charAt(0).toUpperCase() + t.slice(1)}`);
        });
        dropdown.setValue(this.card.taskType);
        dropdown.onChange(value => {
          this.boardService.updateCard(this.card.id, { taskType: value as TaskType });
          this.onUpdate();
        });
      });

    // Due Date
    new Setting(container)
      .setName('Due Date')
      .addButton(btn => {
        btn.setButtonText(this.card.dueDate ? formatDisplayDate(this.card.dueDate) : 'Set date');
        btn.onClick(() => {
          const { DatePickerModal } = require('./UtilityModals');
          new DatePickerModal(this.app, this.card.dueDate, (date) => {
            this.boardService.updateCard(this.card.id, { dueDate: date });
            this.onUpdate();
            this.close();
            new CardDetailModal(this.app, this.card, this.boardService, this.onUpdate).open();
          }).open();
        });
      });

    // Assignees
    new Setting(container)
      .setName('Assignees')
      .setDesc(this.card.assignee.join(', ') || 'None')
      .addButton(btn => {
        btn.setButtonText('Edit');
        btn.onClick(() => this.editAssignees());
      });

    // Tags
    new Setting(container)
      .setName('Tags')
      .setDesc(this.card.tags.join(', ') || 'None')
      .addButton(btn => {
        btn.setButtonText('Edit');
        btn.onClick(() => this.editTags());
      });

    // Color
    new Setting(container)
      .setName('Card Color')
      .addButton(btn => {
        btn.setButtonText('Choose');
        btn.onClick(() => {
          const { ColorPickerModal } = require('./UtilityModals');
          new ColorPickerModal(this.app, this.card.color || '#6366f1', (color) => {
            this.boardService.updateCard(this.card.id, { color });
            this.onUpdate();
          }).open();
        });
      });

    // Blocked
    new Setting(container)
      .setName('Blocked')
      .addToggle(toggle => {
        toggle.setValue(this.card.blocked);
        toggle.onChange(value => {
          this.boardService.updateCard(this.card.id, { blocked: value });
          this.onUpdate();
        });
      });
  }

  private renderChecklist(container: HTMLElement): void {
    const checklistContainer = container.createDiv({ cls: 'checklist-container' });
    checklistContainer.empty();

    this.card.checklist.forEach(item => {
      const itemEl = checklistContainer.createDiv({ cls: 'checklist-item' });

      const checkbox = itemEl.createEl('input', { type: 'checkbox' });
      checkbox.checked = item.completed;
      checkbox.addEventListener('change', () => {
        this.boardService.updateChecklistItem(this.card.id, item.id, { completed: checkbox.checked });
        this.onUpdate();
      });

      const text = itemEl.createEl('input', {
        type: 'text',
        value: item.text,
        cls: item.completed ? 'completed' : ''
      });
      text.addEventListener('change', () => {
        this.boardService.updateChecklistItem(this.card.id, item.id, { text: text.value });
        this.onUpdate();
      });

      const deleteBtn = itemEl.createEl('button', { cls: 'icon-btn-small' });
      setIcon(deleteBtn, 'trash-2');
      deleteBtn.addEventListener('click', () => {
        this.boardService.deleteChecklistItem(this.card.id, item.id);
        this.onUpdate();
        this.renderChecklist(container);
      });
    });
  }

  private addChecklistItem(container: HTMLElement): void {
    const { TextInputModal } = require('./UtilityModals');
    new TextInputModal(
      this.app,
      'Add Checklist Item',
      'Item text',
      '',
      (text) => {
        this.boardService.addChecklistItem(this.card.id, text);
        this.onUpdate();
        this.renderChecklist(container);
      }
    ).open();
  }

  private renderLinkedNotes(container: HTMLElement): void {
    const notesContainer = container.createDiv({ cls: 'linked-notes-container' });

    if (this.card.linkedNotes && this.card.linkedNotes.length > 0) {
      this.card.linkedNotes.forEach(notePath => {
        const noteEl = notesContainer.createDiv({ cls: 'linked-note' });
        const noteLink = noteEl.createEl('a', { text: notePath, cls: 'internal-link' });
        noteLink.addEventListener('click', () => {
          this.app.workspace.openLinkText(notePath, '', false);
        });

        const removeBtn = noteEl.createEl('button', { cls: 'icon-btn-small' });
        setIcon(removeBtn, 'x');
        removeBtn.addEventListener('click', () => {
          const updatedNotes = this.card.linkedNotes?.filter(n => n !== notePath) || [];
          this.boardService.updateCard(this.card.id, { linkedNotes: updatedNotes });
          this.onUpdate();
          this.renderLinkedNotes(container);
        });
      });
    }

    const addNoteBtn = notesContainer.createEl('button', { cls: 'add-note-btn' });
    setIcon(addNoteBtn, 'plus');
    addNoteBtn.appendChild(document.createTextNode(' Link Note'));
    addNoteBtn.addEventListener('click', () => this.linkNote());
  }

  private linkNote(): void {
    // TODO: Implement note linking with file suggester
    new Notice('Note linking - To be implemented', 2000);
  }

  private editAssignees(): void {
    const { TextInputModal } = require('./UtilityModals');
    new TextInputModal(
      this.app,
      'Edit Assignees',
      'Assignees (comma-separated)',
      this.card.assignee.join(', '),
      (value) => {
        const assignees = value.split(',').map(a => a.trim()).filter(a => a);
        this.boardService.updateCard(this.card.id, { assignee: assignees });
        this.onUpdate();
        this.close();
        new CardDetailModal(this.app, this.card, this.boardService, this.onUpdate).open();
      }
    ).open();
  }

  private editTags(): void {
    const { TextInputModal } = require('./UtilityModals');
    new TextInputModal(
      this.app,
      'Edit Tags',
      'Tags (comma-separated)',
      this.card.tags.join(', '),
      (value) => {
        const tags = value.split(',').map(t => t.trim()).filter(t => t);
        this.boardService.updateCard(this.card.id, { tags });
        this.onUpdate();
        this.close();
        new CardDetailModal(this.app, this.card, this.boardService, this.onUpdate).open();
      }
    ).open();
  }

  private renderFooter(): void {
    const { contentEl } = this;
    const footer = contentEl.createDiv({ cls: 'modal-footer' });

    // Delete Card
    const deleteBtn = footer.createEl('button', { cls: 'danger-btn', text: 'Delete Card' });
    deleteBtn.addEventListener('click', () => {
      const { ConfirmModal } = require('./UtilityModals');
      new ConfirmModal(
        this.app,
        'Delete Card',
        `Delete "${this.card.title}"?`,
        () => {
          this.boardService.deleteCard(this.card.id);
          this.onUpdate();
          this.close();
          new Notice('🗑️ Card deleted', 2000);
        },
        'Delete',
        'Cancel',
        true
      ).open();
    });

    // Duplicate Card
    const duplicateBtn = footer.createEl('button', { cls: 'secondary-btn', text: 'Duplicate' });
    duplicateBtn.addEventListener('click', () => {
      this.boardService.duplicateCard(this.card.id);
      this.onUpdate();
      new Notice('✅ Card duplicated', 2000);
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
