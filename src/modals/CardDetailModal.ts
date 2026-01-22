import { App, Modal, Setting, Notice, setIcon, MarkdownRenderer } from 'obsidian';
import { KanbanCard, Priority, TaskType, PRIORITY_COLORS, TASK_TYPE_ICONS } from '../models/types';
import { BoardService } from '../services/BoardService';
import { formatDisplayDate, generateId } from '../utils/helpers';

export class CardDetailModal extends Modal {
  private card: KanbanCard;
  private boardService: BoardService;
  private onUpdate: () => void;
  private contentArea: HTMLElement | null = null;
  private checklistContainerEl: HTMLElement | null = null;
  private linkedNotesContainerEl: HTMLElement | null = null;

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
    addChecklistBtn.addEventListener('click', () => this.addChecklistItem());

    this.checklistContainerEl = checklistSection.createDiv({ cls: 'checklist-content' });
    this.renderChecklist();

    // Linked Notes
    const notesSection = container.createDiv({ cls: 'card-section' });
    notesSection.createEl('h3', { text: '🔗 Linked Notes' });

    this.linkedNotesContainerEl = notesSection.createDiv({ cls: 'linked-notes-content' });
    this.renderLinkedNotes();
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

    // Start Date
    new Setting(container)
        .setName('Start Date')
        .addButton(btn => {
        btn.setButtonText(this.card.startDate ? formatDisplayDate(this.card.startDate) : 'Set start date');
        btn.onClick(() => {
            const { DatePickerModal } = require('./UtilityModals');
            new DatePickerModal(
                          this.app,
                          this.card.startDate || null,
                          (date: string | null) => {
                            this.boardService.updateCard(this.card.id, { startDate: date });
                            this.onUpdate();
                            this.close();
                            new CardDetailModal(this.app, this.card, this.boardService, this.onUpdate).open();
                          }
                        ).open();
        });
        });


    // Due Date
    new Setting(container)
      .setName('Due Date')
      .addButton(btn => {
        btn.setButtonText(this.card.dueDate ? formatDisplayDate(this.card.dueDate) : 'Set date');
        btn.onClick(() => {
          const { DatePickerModal } = require('./UtilityModals');
          new DatePickerModal(
            this.app,
            this.card.dueDate,
            (date: string | null) => {
              this.boardService.updateCard(this.card.id, { dueDate: date });
              this.onUpdate();
              this.close();
              new CardDetailModal(this.app, this.card, this.boardService, this.onUpdate).open();
            }
          ).open();
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

    // Dependencies
    new Setting(container)
      .setName('Dependencies')
      .setDesc(this.getDependenciesDescription())
      .addButton(btn => {
        btn.setButtonText('Edit');
        btn.onClick(() => this.editDependencies());
      });

    // Color
    new Setting(container)
      .setName('Card Color')
      .addButton(btn => {
        btn.setButtonText('Choose');
        btn.onClick(() => {
          const { ColorPickerModal } = require('./UtilityModals');
          new ColorPickerModal(
            this.app,
            this.card.color || '#6366f1',
            (color: string) => {
              this.boardService.updateCard(this.card.id, { color });
              this.onUpdate();
            }
          ).open();
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

  private renderChecklist(): void {
    if (!this.checklistContainerEl) return;

    this.checklistContainerEl.empty();

    // Prendi sempre la versione aggiornata della card
    const currentCard = this.boardService.getCard(this.card.id);
    if (!currentCard) return;

    // Aggiorna il riferimento locale
    this.card = currentCard;

    currentCard.checklist.forEach(item => {
      const itemEl = this.checklistContainerEl!.createDiv({ cls: 'checklist-item' });

      const checkbox = itemEl.createEl('input', { type: 'checkbox' });
      checkbox.checked = item.completed;
      checkbox.addEventListener('change', () => {
        this.boardService.updateChecklistItem(currentCard.id, item.id, { completed: checkbox.checked });
        this.card = this.boardService.getCard(currentCard.id)!;
        this.onUpdate();
        this.renderChecklist(); // Re-render immediato
      });

      const text = itemEl.createEl('input', {
        type: 'text',
        value: item.text,
        cls: item.completed ? 'completed' : ''
      });
      text.addEventListener('change', () => {
        this.boardService.updateChecklistItem(currentCard.id, item.id, { text: text.value });
        this.card = this.boardService.getCard(currentCard.id)!;
        this.onUpdate();
      });

      const deleteBtn = itemEl.createEl('button', { cls: 'icon-btn-small' });
      setIcon(deleteBtn, 'trash-2');
      deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        this.boardService.deleteChecklistItem(currentCard.id, item.id);
        this.card = this.boardService.getCard(currentCard.id)!;
        this.onUpdate();
        this.renderChecklist(); // Re-render immediato
      });
    });
  }

  private addChecklistItem(): void {
    const { TextInputModal } = require('./UtilityModals');
    new TextInputModal(
      this.app,
      'Add Checklist Item',
      'Item text',
      '',
      (text: string) => {
        this.boardService.addChecklistItem(this.card.id, text);
        this.card = this.boardService.getCard(this.card.id)!;
        this.onUpdate();
        this.renderChecklist(); // Re-render immediato
      }
    ).open();
  }

  private renderLinkedNotes(): void {
    if (!this.linkedNotesContainerEl) return;

    this.linkedNotesContainerEl.empty();

    if (!this.card.linkedNotes) {
      this.card.linkedNotes = [];
    }

    if (this.card.linkedNotes.length > 0) {
      this.card.linkedNotes.forEach(notePath => {
        const noteEl = this.linkedNotesContainerEl!.createDiv({ cls: 'linked-note' });

        const noteIcon = noteEl.createSpan({ cls: 'note-icon' });
        setIcon(noteIcon, 'file-text');

        const noteLink = noteEl.createEl('a', {
          text: notePath.split('/').pop() || notePath,
          cls: 'internal-link'
        });
        noteLink.addEventListener('click', async (e) => {
          e.preventDefault();
          await this.app.workspace.openLinkText(notePath, '', false);
        });

        const removeBtn = noteEl.createEl('button', { cls: 'icon-btn-small' });
        setIcon(removeBtn, 'x');
        removeBtn.addEventListener('click', () => {
          const updatedNotes = this.card.linkedNotes?.filter(n => n !== notePath) || [];
          this.boardService.updateCard(this.card.id, { linkedNotes: updatedNotes });
          this.card.linkedNotes = updatedNotes;
          this.onUpdate();
          this.renderLinkedNotes(); // Re-render immediato
        });
      });
    } else {
      this.linkedNotesContainerEl.createEl('p', {
        text: 'No linked notes yet',
        cls: 'empty-state-text'
      });
    }

    const addNoteBtn = this.linkedNotesContainerEl.createEl('button', { cls: 'add-note-btn' });
    setIcon(addNoteBtn, 'plus');
    addNoteBtn.appendChild(document.createTextNode(' Link Note'));
    addNoteBtn.addEventListener('click', () => this.linkNote());
  }

  private linkNote(): void {
    const files = this.app.vault.getMarkdownFiles();
    const items = files.map(file => ({
      display: file.path,
      value: file.path
    }));

    const { SuggesterModal } = require('./UtilityModals');
    new SuggesterModal(
      this.app,
      items,
      (item: { display: string; value: string }) => {
        if (!this.card.linkedNotes) {
          this.card.linkedNotes = [];
        }

        if (!this.card.linkedNotes.includes(item.value)) {
          this.card.linkedNotes.push(item.value);
          this.boardService.updateCard(this.card.id, { linkedNotes: this.card.linkedNotes });
          this.onUpdate();
          this.renderLinkedNotes(); // Re-render immediato
        } else {
          new Notice('⚠️ Note already linked', 2000);
        }
      },
      'Search notes...',
      'No notes found'
    ).open();
  }

  private editAssignees(): void {
    const { TextInputModal } = require('./UtilityModals');
    new TextInputModal(
        this.app,
        'Edit Assignees',
        'Assignees (comma-separated)',
        this.card.assignee.join(', '),
        (value: string) => {
          const assignees: string[] = value.split(',').map((a: string) => a.trim()).filter((a: string) => a);
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
      (value: string) => {
        const tags: string[] = value.split(',').map((t: string) => t.trim()).filter((t: string) => t);
        this.boardService.updateCard(this.card.id, { tags });
        this.onUpdate();
        this.close();
        new CardDetailModal(this.app, this.card, this.boardService, this.onUpdate).open();
      }
    ).open();
  }

  private getDependenciesDescription(): string {
    if (!this.card.dependencies || this.card.dependencies.length === 0) {
      return 'None';
    }

    const board = this.boardService.getBoard();
    const dependencyTitles = this.card.dependencies
      .map(depId => {
        const depCard = board.cards.find(c => c.id === depId);
        return depCard ? depCard.title : `[Unknown: ${depId}]`;
      })
      .join(', ');

    return `${this.card.dependencies.length} task${this.card.dependencies.length > 1 ? 's' : ''}: ${dependencyTitles}`;
  }

  private editDependencies(): void {
    const board = this.boardService.getBoard();

    // Ottieni tutte le card tranne questa
    const availableCards = board.cards
      .filter(c => c.id !== this.card.id)
      .map(c => ({
        display: c.title,
        value: c.id,
        selected: this.card.dependencies?.includes(c.id) || false
      }));

    if (availableCards.length === 0) {
      new Notice('No other cards available for dependencies', 2000);
      return;
    }

    // Usa un modal multi-select
    const { MultiSelectModal } = require('./UtilityModals');
    new MultiSelectModal(
      this.app,
      'Select Dependencies',
      'Select which tasks this card depends on',
      availableCards,
      (selectedIds: string[]) => {
        this.boardService.updateCard(this.card.id, { dependencies: selectedIds });
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
