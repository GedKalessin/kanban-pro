import { App, Modal, Setting, Notice, setIcon } from 'obsidian';
import { KanbanCard, Priority, TaskType, TASK_TYPE_ICONS } from '../models/types';
import { BoardService } from '../services/BoardService';
import { formatDisplayDate, setCssProps } from '../utils/helpers';
import {
  DatePickerModal,
  ColorPickerModal,
  SuggesterModal,
  ConfirmModal,
  MultiSelectModal,
  TextInputModal
} from './UtilityModals';

export class CardDetailModal extends Modal {
  private card: KanbanCard;
  private boardService: BoardService;
  private onUpdate: () => void;
  private contentArea: HTMLElement | null = null;
  private checklistContainerEl: HTMLElement | null = null;
  private checklistProgressEl: HTMLElement | null = null;
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
    descSection.createEl('h3', { text: '📝 description' });

    // Get the current card from BoardService to ensure we have the latest data
    const currentCard = this.boardService.getCard(this.card.id);
    const descriptionValue = currentCard?.description || this.card.description || '';

    console.debug('🔍 rendering description field:', {
      cardId: this.card.id,
      descriptionValue,
      cardDescriptionDirect: this.card.description,
      currentCardDescription: currentCard?.description
    });

    const descTextarea = descSection.createEl('textarea', {
      cls: 'card-description-input',
      placeholder: 'Add a description...'
    });

    // Set value explicitly to ensure it's displayed
    descTextarea.value = descriptionValue;

    // Save on blur (when user clicks away)
    descTextarea.addEventListener('blur', () => {
      console.debug('💾 Saving description on blur:', descTextarea.value);
      this.boardService.updateCard(this.card.id, { description: descTextarea.value });
      this.card = this.boardService.getCard(this.card.id)!;
      this.onUpdate();
    });

    // Also save on input with debouncing for auto-save
    let saveTimeout: NodeJS.Timeout;
    descTextarea.addEventListener('input', () => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        console.debug('💾 Auto-saving description:', descTextarea.value);
        this.boardService.updateCard(this.card.id, { description: descTextarea.value });
        this.card = this.boardService.getCard(this.card.id)!;
        this.onUpdate();
      }, 1000); // Auto-save after 1 second of inactivity
    });

    // Subtasks
    const checklistSection = container.createDiv({ cls: 'card-section subtask-modal-section' });
    const checklistHeader = checklistSection.createDiv({ cls: 'section-header' });
    const checklistTitle = checklistHeader.createDiv({ cls: 'subtask-modal-title' });
    const titleIcon = checklistTitle.createSpan({ cls: 'icon' });
    setIcon(titleIcon, 'square-check-big');
    checklistTitle.createEl('h3', { text: 'subtasks' });

    const addChecklistBtn = checklistHeader.createEl('button', { cls: 'subtask-add-btn' });
    const addBtnIcon = addChecklistBtn.createSpan({ cls: 'icon' });
    setIcon(addBtnIcon, 'plus');
    addChecklistBtn.createSpan({ text: 'add' });
    addChecklistBtn.title = 'add subtask';
    addChecklistBtn.addEventListener('click', () => this.addChecklistItem());

    // Progress bar
    this.checklistProgressEl = checklistSection.createDiv({ cls: 'subtask-modal-progress' });
    this.renderChecklistProgress();

    this.checklistContainerEl = checklistSection.createDiv({ cls: 'checklist-content' });
    this.renderChecklist();

    // Linked Notes
    const notesSection = container.createDiv({ cls: 'card-section' });
    notesSection.createEl('h3', { text: '🔗 linked notes' });

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
        .setName('Start date')
        .addButton(btn => {
        btn.setButtonText(this.card.startDate ? formatDisplayDate(this.card.startDate) : 'Set start date');
        btn.onClick(() => {
            new DatePickerModal(
                          this.app,
                          this.card.startDate || null,
                          (date: string | null) => {
                            this.boardService.updateCard(this.card.id, { startDate: date });
                            this.onUpdate();
                            this.close();
                            const updatedCard = this.boardService.getCard(this.card.id);
                            if (updatedCard) {
                              new CardDetailModal(this.app, updatedCard, this.boardService, this.onUpdate).open();
                            }
                          },
                          'start'
                        ).open();
        });
        });


    // Due Date
    new Setting(container)
      .setName('Due date')
      .addButton(btn => {
        btn.setButtonText(this.card.dueDate ? formatDisplayDate(this.card.dueDate) : 'Set date');
        btn.onClick(() => {
          new DatePickerModal(
            this.app,
            this.card.dueDate,
            (date: string | null) => {
              this.boardService.updateCard(this.card.id, { dueDate: date });
              this.onUpdate();
              this.close();
              const updatedCard = this.boardService.getCard(this.card.id);
              if (updatedCard) {
                new CardDetailModal(this.app, updatedCard, this.boardService, this.onUpdate).open();
              }
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
      .setName('Card color')
      .addButton(btn => {
        btn.setButtonText('Choose');
        btn.onClick(() => {
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

  private renderChecklistProgress(): void {
    if (!this.checklistProgressEl) return;
    this.checklistProgressEl.empty();

    const currentCard = this.boardService.getCard(this.card.id);
    if (!currentCard || currentCard.checklist.length === 0) return;

    const total = currentCard.checklist.length;
    const completed = currentCard.checklist.filter(i => i.completed).length;
    const pct = Math.round((completed / total) * 100);

    const labelRow = this.checklistProgressEl.createDiv({ cls: 'subtask-modal-progress-label' });
    labelRow.createSpan({ text: `${completed} of ${total} subtasks completed` });
    labelRow.createSpan({ cls: 'subtask-modal-progress-pct', text: `${pct}%` });

    const track = this.checklistProgressEl.createDiv({ cls: 'subtask-modal-progress-track' });
    const fill = track.createDiv({ cls: `subtask-modal-progress-fill${pct === 100 ? ' complete' : ''}` });
    setCssProps(fill, { '--kp-width': `${pct}%` });
  }

  private renderChecklist(): void {
    if (!this.checklistContainerEl) return;
    this.checklistContainerEl.empty();

    const currentCard = this.boardService.getCard(this.card.id);
    if (!currentCard) return;
    this.card = currentCard;

    if (currentCard.checklist.length === 0) {
      const empty = this.checklistContainerEl.createDiv({ cls: 'subtask-empty' });
      const emptyIcon = empty.createSpan({ cls: 'icon' });
      setIcon(emptyIcon, 'list-checks');
      empty.createSpan({ text: 'No subtasks yet. Click + to add one.' });
      this.renderInlineAddRow(currentCard.id);
      return;
    }

    currentCard.checklist.forEach(item => {
      const itemEl = this.checklistContainerEl!.createDiv({
        cls: `checklist-item${item.completed ? ' completed' : ''}`
      });

      // Custom circular checkbox
      const cb = itemEl.createDiv({ cls: `subtask-cb${item.completed ? ' checked' : ''}` });
      const cbIcon = cb.createSpan({ cls: 'icon' });
      if (item.completed) setIcon(cbIcon, 'check');

      cb.addEventListener('click', () => {
        const newCompleted = !item.completed;
        this.boardService.updateChecklistItem(currentCard.id, item.id, { completed: newCompleted });
        this.card = this.boardService.getCard(currentCard.id)!;
        this.onUpdate();
        this.renderChecklist();
        this.renderChecklistProgress();
      });

      // Editable text
      const textEl = itemEl.createEl('div', {
        cls: `subtask-item-text${item.completed ? ' completed' : ''}`,
        attr: { contenteditable: 'true' }
      });
      textEl.textContent = item.text;

      let saveTimeout: NodeJS.Timeout;
      textEl.addEventListener('input', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          this.boardService.updateChecklistItem(currentCard.id, item.id, { text: textEl.textContent || '' });
          this.card = this.boardService.getCard(currentCard.id)!;
          this.onUpdate();
        }, 800);
      });
      textEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); textEl.blur(); }
        if (e.key === 'Escape') { textEl.textContent = item.text; textEl.blur(); }
      });

      // Delete button
      const deleteBtn = itemEl.createEl('button', { cls: 'subtask-delete-btn' });
      setIcon(deleteBtn, 'trash-2');
      deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.boardService.deleteChecklistItem(currentCard.id, item.id);
        this.card = this.boardService.getCard(currentCard.id)!;
        this.onUpdate();
        this.renderChecklist();
        this.renderChecklistProgress();
      });
    });

    // Inline "add subtask" row
    this.renderInlineAddRow(currentCard.id);
  }

  private renderInlineAddRow(cardId: string): void {
    if (!this.checklistContainerEl) return;

    const addRow = this.checklistContainerEl.createDiv({ cls: 'subtask-add-row' });
    const addIcon = addRow.createSpan({ cls: 'subtask-add-row-icon' });
    setIcon(addIcon, 'plus');
    const input = addRow.createEl('input', {
      type: 'text',
      cls: 'subtask-add-input',
      attr: { placeholder: 'Add a subtask… (enter to save)' }
    });

    let isSaved = false;
    const save = () => {
      if (isSaved) return;
      const text = input.value.trim();
      if (!text) return;
      isSaved = true;
      input.value = '';
      this.boardService.addChecklistItem(cardId, text);
      this.card = this.boardService.getCard(cardId)!;
      this.onUpdate();
      this.renderChecklist();
      this.renderChecklistProgress();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      if (e.key === 'Escape') { input.value = ''; input.blur(); }
    });
    input.addEventListener('blur', save);
  }

  private addChecklistItem(): void {
    if (!this.checklistContainerEl) return;
    const input = this.checklistContainerEl.querySelector<HTMLInputElement>('.subtask-add-input');
    if (input) {
      input.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      input.focus();
    }
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
        noteLink.addEventListener('click', (e) => {
          e.preventDefault();
          this.app.workspace.openLinkText(notePath, '', false).catch(console.error);
        });

        const removeBtn = noteEl.createEl('button', { cls: 'icon-btn-small' });
        setIcon(removeBtn, 'x');
        removeBtn.addEventListener('click', () => {
          const updatedNotes = this.card.linkedNotes?.filter(n => n !== notePath) || [];
          this.boardService.updateCard(this.card.id, { linkedNotes: updatedNotes });
          this.card.linkedNotes = updatedNotes;
          this.onUpdate();
          this.renderLinkedNotes();
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
    addNoteBtn.appendChild(document.createTextNode(' Link note'));
    addNoteBtn.addEventListener('click', () => this.linkNote());
  }

  private linkNote(): void {
    const files = this.app.vault.getMarkdownFiles();
    const items = files.map(file => ({
      display: file.path,
      value: file.path
    }));

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
          this.renderLinkedNotes();
        } else {
          new Notice('⚠️ note already linked', 2000);
        }
      },
      'Search notes...',
      'No notes found'
    ).open();
  }

  private editAssignees(): void {
    const teamMembers = this.boardService.getTeamMembers();

    if (teamMembers.length === 0) {
      new ConfirmModal(
        this.app,
        'No team members',
        'No team members have been defined yet. Go to More → Manage team to add members before assigning.',
        () => { /* do nothing */ },
        'OK',
        '',
        false
      ).open();
      return;
    }

    const items = teamMembers.map(m => ({
      display: m.role ? `${m.name} — ${m.role}` : m.name,
      value: m.name,
      selected: this.card.assignee.includes(m.name)
    }));

    new MultiSelectModal(
      this.app,
      'Assign team members',
      'Select who is working on this task',
      items,
      (selectedNames: string[]) => {
        this.boardService.updateCard(this.card.id, { assignee: selectedNames });
        this.onUpdate();
        this.close();
        const updatedCard = this.boardService.getCard(this.card.id);
        if (updatedCard) {
          new CardDetailModal(this.app, updatedCard, this.boardService, this.onUpdate).open();
        }
      }
    ).open();
  }

  private editTags(): void {
    new TextInputModal(
      this.app,
      'Edit tags',
      'Tags (comma-separated)',
      this.card.tags.join(', '),
      (value: string) => {
        const tags: string[] = value.split(',').map((t: string) => t.trim()).filter((t: string) => t);
        this.boardService.updateCard(this.card.id, { tags });
        this.onUpdate();
        this.close();
        const updatedCard = this.boardService.getCard(this.card.id);
        if (updatedCard) {
          new CardDetailModal(this.app, updatedCard, this.boardService, this.onUpdate).open();
        }
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

    new MultiSelectModal(
      this.app,
      'Select dependencies',
      'Select which tasks this card depends on',
      availableCards,
      (selectedIds: string[]) => {
        this.boardService.updateCard(this.card.id, { dependencies: selectedIds });
        this.onUpdate();
        this.close();
        const updatedCard = this.boardService.getCard(this.card.id);
        if (updatedCard) {
          new CardDetailModal(this.app, updatedCard, this.boardService, this.onUpdate).open();
        }
      }
    ).open();
  }

  private renderFooter(): void {
    const { contentEl } = this;
    const footer = contentEl.createDiv({ cls: 'modal-footer' });

    // Delete Card
    const deleteBtn = footer.createEl('button', { cls: 'danger-btn', text: 'Delete card' });
    deleteBtn.addEventListener('click', () => {
      new ConfirmModal(
        this.app,
        'Delete card',
        `Delete "${this.card.title}"?`,
        () => {
          this.boardService.deleteCard(this.card.id);
          this.onUpdate();
          this.close();
          new Notice('🗑️ card deleted', 2000);
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
      new Notice('✅ card duplicated', 2000);
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
