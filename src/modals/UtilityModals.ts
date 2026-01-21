import { App, Modal, Setting, FuzzySuggestModal, Notice, setIcon } from 'obsidian';
import { BoardService } from '../services/BoardService';
import { StatusGroup, BoardTemplate } from '../models/types';
import { generateId } from '../utils/helpers';

// Text Input Modal
class TextInputModal extends Modal {
  private title: string;
  private label: string;
  private value: string;
  private onSubmit: (value: string) => void;

  constructor(app: App, title: string, label: string, value: string, onSubmit: (value: string) => void) {
    super(app);
    this.title = title;
    this.label = label;
    this.value = value;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kanban-text-input-modal');

    contentEl.createEl('h2', { text: this.title });

    new Setting(contentEl)
      .setName(this.label)
      .addText(text => {
        text
          .setValue(this.value)
          .onChange(value => this.value = value);
        text.inputEl.focus();
        text.inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.submit();
          }
        });
      });

    const buttonContainer = contentEl.createDiv({ cls: 'button-container' });
    
    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel', cls: 'cancel-btn' });
    cancelBtn.addEventListener('click', () => this.close());
    
    const submitBtn = buttonContainer.createEl('button', { text: 'Submit', cls: 'submit-btn' });
    submitBtn.addEventListener('click', () => this.submit());
  }

  private submit(): void {
    if (this.value.trim()) {
      this.onSubmit(this.value);
      this.close();
    } else {
      new Notice('⚠️ Please enter a value', 2000);
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// Color Picker Modal
class ColorPickerModal extends Modal {
  private color: string;
  private onSubmit: (color: string) => void;
  private previewEl: HTMLElement | null = null;

  private colorPalette = [
    '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
    '#f97316', '#f59e0b', '#eab308', '#84cc16',
    '#22c55e', '#10b981', '#14b8a6', '#06b6d4',
    '#0ea5e9', '#3b82f6', '#6366f1', '#7c3aed',
    '#a855f7', '#d946ef', '#f43f5e', '#fb923c',
    '#fbbf24', '#facc15', '#a3e635', '#4ade80',
    '#34d399', '#2dd4bf', '#22d3ee', '#38bdf8',
    '#60a5fa', '#818cf8', '#a78bfa', '#c084fc'
  ];

  constructor(app: App, initialColor: string, onSubmit: (color: string) => void) {
    super(app);
    this.color = initialColor || '#6366f1';
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kanban-color-picker-modal');

    contentEl.createEl('h2', { text: '🎨 Choose Color' });

    // Color Preview
    const previewContainer = contentEl.createDiv({ cls: 'color-preview-container' });
    this.previewEl = previewContainer.createDiv({ cls: 'color-preview' });
    this.previewEl.style.backgroundColor = this.color;

    // Hex Input
    new Setting(contentEl)
      .setName('Hex Color')
      .addText(text => {
        text
          .setValue(this.color)
          .onChange(value => {
            if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
              this.color = value;
              if (this.previewEl) {
                this.previewEl.style.backgroundColor = value;
              }
            }
          });
      });

    // Color Grid
    const colorGrid = contentEl.createDiv({ cls: 'color-grid' });
    
    this.colorPalette.forEach(color => {
      const swatch = colorGrid.createDiv({ cls: 'color-swatch' });
      swatch.style.backgroundColor = color;
      
      if (color.toLowerCase() === this.color.toLowerCase()) {
        swatch.addClass('selected');
      }
      
      swatch.addEventListener('click', () => {
        this.color = color;
        if (this.previewEl) {
          this.previewEl.style.backgroundColor = color;
        }
        
        // Update selection
        colorGrid.querySelectorAll('.color-swatch').forEach(s => s.removeClass('selected'));
        swatch.addClass('selected');
      });
    });

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: 'button-container' });
    
    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel', cls: 'cancel-btn' });
    cancelBtn.addEventListener('click', () => this.close());
    
    const submitBtn = buttonContainer.createEl('button', { text: 'Apply', cls: 'submit-btn' });
    submitBtn.addEventListener('click', () => {
      this.onSubmit(this.color);
      this.close();
      new Notice('✓ Color applied', 1500);
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// Date Picker Modal
class DatePickerModal extends Modal {
  private date: string | null;
  private onSubmit: (date: string | null) => void;

  constructor(app: App, initialDate: string | null, onSubmit: (date: string | null) => void) {
    super(app);
    this.date = initialDate;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kanban-date-picker-modal');

    contentEl.createEl('h2', { text: '📅 Set Due Date' });

    // Quick Date Buttons
    const quickDates = contentEl.createDiv({ cls: 'quick-dates' });
    
    const quickOptions = [
      { label: 'Today', days: 0 },
      { label: 'Tomorrow', days: 1 },
      { label: 'Next Week', days: 7 },
      { label: 'Next Month', days: 30 }
    ];

    quickOptions.forEach(option => {
      const btn = quickDates.createEl('button', { 
        text: option.label, 
        cls: 'quick-date-btn' 
      });
      btn.addEventListener('click', () => {
        const date = new Date();
        date.setDate(date.getDate() + option.days);
        this.date = date.toISOString();
        this.submit();
      });
    });

    // Custom Date Picker
    new Setting(contentEl)
      .setName('Custom Date')
      .addText(text => {
        text.inputEl.type = 'date';
        text.setValue(this.date?.split('T')[0] || '');
        text.onChange(value => {
          this.date = value ? new Date(value).toISOString() : null;
        });
      });

    // Remove Date Button
    if (this.date) {
      const removeBtn = contentEl.createEl('button', { 
        text: 'Remove Due Date', 
        cls: 'danger-btn full-width-btn' 
      });
      removeBtn.addEventListener('click', () => {
        this.date = null;
        this.submit();
      });
    }

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: 'button-container' });
    
    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel', cls: 'cancel-btn' });
    cancelBtn.addEventListener('click', () => this.close());
    
    const submitBtn = buttonContainer.createEl('button', { text: 'Set Date', cls: 'submit-btn' });
    submitBtn.addEventListener('click', () => this.submit());
  }

  private submit(): void {
    this.onSubmit(this.date);
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// Suggester Modal (for selecting from a list)
class SuggesterModal<T> extends FuzzySuggestModal<{ display: string; value: T }> {
  private items: { display: string; value: T }[];
  private onChoose: (item: { display: string; value: T }) => void;
  private emptyMessage: string;

  constructor(
    app: App,
    items: { display: string; value: T }[],
    onChoose: (item: { display: string; value: T }) => void,
    placeholder: string = 'Search...',
    emptyMessage: string = 'No items found'
  ) {
    super(app);
    this.items = items;
    this.onChoose = onChoose;
    this.emptyMessage = emptyMessage;
    this.setPlaceholder(placeholder);
  }

  getItems(): { display: string; value: T }[] {
    return this.items;
  }

  getItemText(item: { display: string; value: T }): string {
    return item.display;
  }

  onChooseItem(item: { display: string; value: T }): void {
    this.onChoose(item);
  }
}

// Confirm Modal
class ConfirmModal extends Modal {
  private title: string;
  private message: string;
  private onConfirm: () => void;
  private confirmText: string;
  private cancelText: string;
  private isDangerous: boolean;

  constructor(
    app: App,
    title: string,
    message: string,
    onConfirm: () => void,
    confirmText: string = 'Confirm',
    cancelText: string = 'Cancel',
    isDangerous: boolean = false
  ) {
    super(app);
    this.title = title;
    this.message = message;
    this.onConfirm = onConfirm;
    this.confirmText = confirmText;
    this.cancelText = cancelText;
    this.isDangerous = isDangerous;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kanban-confirm-modal');

    contentEl.createEl('h2', { text: this.title });
    contentEl.createEl('p', { text: this.message, cls: 'confirm-message' });

    const buttonContainer = contentEl.createDiv({ cls: 'button-container' });

    const cancelBtn = buttonContainer.createEl('button', { 
      text: this.cancelText, 
      cls: 'cancel-btn' 
    });
    cancelBtn.addEventListener('click', () => this.close());

    const confirmBtn = buttonContainer.createEl('button', { 
      text: this.confirmText, 
      cls: this.isDangerous ? 'danger-btn' : 'submit-btn' 
    });
    confirmBtn.addEventListener('click', () => {
      this.onConfirm();
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// Quick Add Card Modal
class QuickAddCardModal extends Modal {
  private onSubmit: (title: string, startDate?: string | null, dueDate?: string | null) => void;
  private formData = {
    title: '',
    startDate: null as string | null,
    dueDate: null as string | null
  };

  constructor(
    app: App,
    onSubmit: (title: string, startDate?: string | null, dueDate?: string | null) => void
  ) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kanban-quick-add-modal');

    contentEl.createEl('h2', { text: '✨ Quick Add Card' });

    // Title
    new Setting(contentEl)
      .setName('Title')
      .setDesc('Card title (required)')
      .addText(text => {
        text
          .setPlaceholder('Enter card title')
          .onChange(value => {
            this.formData.title = value;
          });
        text.inputEl.focus();
        text.inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.submit();
          }
        });
      });

    // Start Date
    new Setting(contentEl)
      .setName('Start Date')
      .setDesc('When work begins (optional)')
      .addText(text => {
        text.inputEl.type = 'date';
        text.inputEl.addEventListener('change', (e) => {
          const value = (e.target as HTMLInputElement).value;
          this.formData.startDate = value ? new Date(value + 'T00:00:00').toISOString() : null;
        });
      });

    // Due Date
    new Setting(contentEl)
      .setName('Due Date')
      .setDesc('When work should be done (optional)')
      .addText(text => {
        text.inputEl.type = 'date';
        text.inputEl.addEventListener('change', (e) => {
          const value = (e.target as HTMLInputElement).value;
          this.formData.dueDate = value ? new Date(value + 'T23:59:59').toISOString() : null;
        });
      });

    // Quick date buttons
    const quickDatesSection = contentEl.createDiv({ cls: 'quick-dates-section' });
    quickDatesSection.createEl('h4', { text: 'Quick Dates' });

    const quickDatesContainer = quickDatesSection.createDiv({ cls: 'quick-dates-buttons' });

    const quickDates = [
      { label: 'Today', days: 0 },
      { label: 'Tomorrow', days: 1 },
      { label: 'This Week', days: 7 },
      { label: 'Next Week', days: 14 }
    ];

    quickDates.forEach(({ label, days }) => {
      const btn = quickDatesContainer.createEl('button', { text: label, cls: 'quick-date-btn' });
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dueDate = new Date(today);
        dueDate.setDate(dueDate.getDate() + days);
        dueDate.setHours(23, 59, 59, 999);

        this.formData.startDate = today.toISOString();
        this.formData.dueDate = dueDate.toISOString();

        // Update input values
        const startInput = contentEl.querySelector('input[type="date"]') as HTMLInputElement;
        const dueInput = contentEl.querySelectorAll('input[type="date"]')[1] as HTMLInputElement;
        if (startInput) startInput.value = today.toISOString().split('T')[0];
        if (dueInput) dueInput.value = dueDate.toISOString().split('T')[0];
      });
    });

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: 'button-container' });

    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel', cls: 'cancel-btn' });
    cancelBtn.addEventListener('click', () => this.close());

    const submitBtn = buttonContainer.createEl('button', { text: 'Add Card', cls: 'submit-btn' });
    submitBtn.addEventListener('click', () => this.submit());
  }

  private submit(): void {
    if (!this.formData.title.trim()) {
      new Notice('⚠️ Please enter a title', 2000);
      return;
    }

    this.onSubmit(
      this.formData.title.trim(),
      this.formData.startDate ?? undefined,  
      this.formData.dueDate ?? undefined      
    );

    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// ============================================
// STATUS MANAGEMENT MODAL
// ============================================

class StatusManagementModal extends Modal {
  private boardService: BoardService;
  private onSave: () => void;
  private statusGroups: StatusGroup[];

  constructor(app: App, boardService: BoardService, onSave: () => void) {
    super(app);
    this.boardService = boardService;
    this.onSave = onSave;

    const board = boardService.getBoard();

    // Initialize status groups if not exist
    if (!board.statusGroups) {
      this.statusGroups = this.getDefaultStatusGroups();
    } else {
      this.statusGroups = board.statusGroups;
    }
  }

  private getDefaultStatusGroups(): StatusGroup[] {
    const board = this.boardService.getBoard();
    const groups: StatusGroup[] = [
      {
        category: 'not-started',
        name: 'Not Started',
        description: 'Tasks that haven\'t been started yet',
        columnIds: [],
        color: '#94a3b8'
      },
      {
        category: 'active',
        name: 'Active',
        description: 'Tasks currently in progress',
        columnIds: [],
        color: '#3b82f6'
      },
      {
        category: 'closed',
        name: 'Closed',
        description: 'Completed or cancelled tasks',
        columnIds: [],
        color: '#10b981'
      }
    ];

    // Auto-assign columns based on name
    board.columns.forEach(column => {
      const nameLower = column.name.toLowerCase();
      if (nameLower.includes('todo') || nameLower.includes('to do') || nameLower.includes('backlog')) {
        groups[0].columnIds.push(column.id);
      } else if (nameLower.includes('done') || nameLower.includes('complete') || nameLower.includes('closed')) {
        groups[2].columnIds.push(column.id);
      } else {
        groups[1].columnIds.push(column.id);
      }
    });

    return groups;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('kanban-status-management-modal');

    // Header
    const header = contentEl.createDiv({ cls: 'modal-header-premium' });
    const headerTop = header.createDiv({ cls: 'header-top' });

    headerTop.createEl('h2', { text: '⚙️ Edit Statuses' });

    const closeBtn = headerTop.createEl('button', { cls: 'modal-close-btn' });
    setIcon(closeBtn, 'x');
    closeBtn.addEventListener('click', () => this.close());

    header.createEl('p', {
      text: 'Organize your columns into status categories. This helps with workflow automation and reporting.',
      cls: 'modal-subtitle'
    });

    // Body
    const body = contentEl.createDiv({ cls: 'status-management-body' });

    // Render each status group
    this.statusGroups.forEach((group, index) => {
      body.appendChild(this.renderStatusGroup(group, index));
    });

    // Save Template Section
    const templateSection = contentEl.createDiv({ cls: 'template-section' });
    templateSection.createEl('h3', { text: '💾 Save as Template' });
    templateSection.createEl('p', {
      text: 'Save your current board structure as a reusable template',
      cls: 'section-description'
    });

    const saveTemplateBtn = templateSection.createEl('button', { cls: 'add-button' });
    setIcon(saveTemplateBtn, 'save');
    saveTemplateBtn.createSpan({ text: 'Save Current Board as Template' });
    saveTemplateBtn.addEventListener('click', () => this.showSaveTemplateModal());

    // Saved Templates List
    const board = this.boardService.getBoard();
    if (board.savedTemplates && board.savedTemplates.length > 0) {
      const templatesHeader = templateSection.createDiv({ cls: 'templates-header' });
      templatesHeader.createEl('h4', { text: 'Saved Templates' });

      const templatesList = templateSection.createDiv({ cls: 'saved-templates-list' });
      board.savedTemplates.forEach(template => {
        templatesList.appendChild(this.renderSavedTemplate(template));
      });
    }

    contentEl.appendChild(templateSection);

    // Footer Buttons
    const footer = contentEl.createDiv({ cls: 'button-container' });

    const cancelBtn = footer.createEl('button', { text: 'Cancel', cls: 'cancel-btn' });
    cancelBtn.addEventListener('click', () => this.close());

    const saveBtn = footer.createEl('button', { text: 'Save Changes', cls: 'submit-btn' });
    saveBtn.addEventListener('click', () => this.save());
  }

  private renderStatusGroup(group: StatusGroup, _index: number): HTMLElement {
    const board = this.boardService.getBoard();
    const groupEl = this.contentEl.createDiv({ cls: `status-group status-group-${group.category}` });

    // Group Header
    const groupHeader = groupEl.createDiv({ cls: 'status-group-header' });

    const groupIcon = groupHeader.createDiv({ cls: 'group-icon' });
    groupIcon.style.backgroundColor = group.color;

    const icons = {
      'not-started': 'circle',
      'active': 'loader',
      'closed': 'check-circle'
    };
    setIcon(groupIcon, icons[group.category]);

    const groupInfo = groupHeader.createDiv({ cls: 'group-info' });
    groupInfo.createEl('h3', { text: group.name });
    groupInfo.createEl('p', { text: group.description });

    // Columns in this group
    const columnsContainer = groupEl.createDiv({ cls: 'group-columns' });

    const assignedColumns = board.columns.filter(col => group.columnIds.includes(col.id));

    if (assignedColumns.length === 0) {
      columnsContainer.createDiv({ cls: 'empty-columns', text: 'No columns assigned' });
    } else {
      assignedColumns.forEach(column => {
        const columnItem = columnsContainer.createDiv({ cls: 'column-item' });

        const colorDot = columnItem.createDiv({ cls: 'column-color-dot' });
        colorDot.style.backgroundColor = column.color;

        columnItem.createSpan({ text: column.name, cls: 'column-name' });

        const removeBtn = columnItem.createEl('button', { cls: 'remove-column-btn' });
        setIcon(removeBtn, 'x');
        removeBtn.addEventListener('click', () => {
          group.columnIds = group.columnIds.filter(id => id !== column.id);
          this.onOpen();
        });
      });
    }

    // Add Column Button
    const addColumnBtn = groupEl.createEl('button', { cls: 'add-column-to-group-btn' });
    setIcon(addColumnBtn, 'plus');
    addColumnBtn.createSpan({ text: 'Add Column' });
    addColumnBtn.addEventListener('click', () => this.showAddColumnToGroupModal(group));

    return groupEl;
  }

  private renderSavedTemplate(template: BoardTemplate): HTMLElement {
    const templateItem = this.contentEl.createDiv({ cls: 'saved-template-item' });

    const templateIcon = templateItem.createDiv({ cls: 'template-icon' });
    templateIcon.textContent = template.icon;

    const templateInfo = templateItem.createDiv({ cls: 'template-info' });
    templateInfo.createDiv({ text: template.name, cls: 'template-name' });
    templateInfo.createDiv({ text: template.description, cls: 'template-description' });

    const templateActions = templateItem.createDiv({ cls: 'template-actions' });

    const applyBtn = templateActions.createEl('button', { cls: 'template-action-btn' });
    setIcon(applyBtn, 'download');
    applyBtn.title = 'Apply Template';
    applyBtn.addEventListener('click', () => this.applyTemplate(template));

    const deleteBtn = templateActions.createEl('button', { cls: 'template-action-btn danger' });
    setIcon(deleteBtn, 'trash');
    deleteBtn.title = 'Delete Template';
    deleteBtn.addEventListener('click', () => this.deleteTemplate(template.id));

    return templateItem;
  }

  private showAddColumnToGroupModal(group: StatusGroup): void {
    const board = this.boardService.getBoard();
    const availableColumns = board.columns.filter(col => !group.columnIds.includes(col.id));

    if (availableColumns.length === 0) {
      new Notice('⚠️ All columns are already assigned', 2000);
      return;
    }

    const modal = new SuggesterModal(
      this.app,
      availableColumns.map(col => ({ display: col.name, value: col.id })),
      (selected) => {
        // Remove from other groups first
        this.statusGroups.forEach(g => {
          g.columnIds = g.columnIds.filter(id => id !== selected.value);
        });

        // Add to this group
        group.columnIds.push(selected.value);
        this.onOpen();
      },
      'Select column to add'
    );
    modal.open();
  }

  private showSaveTemplateModal(): void {
    const modal = new SaveTemplateModal(this.app, this.boardService, (templateData) => {
      const board = this.boardService.getBoard();

      if (!board.savedTemplates) {
        board.savedTemplates = [];
      }

      const newTemplate: BoardTemplate = {
        id: generateId(),
        name: templateData.name,
        description: templateData.description,
        icon: templateData.icon,
        columns: board.columns.map(col => ({
          name: col.name,
          color: col.color,
          order: col.order,
          collapsed: false,
          wipLimit: col.wipLimit,
          definition: col.definition
        })),
        statusGroups: JSON.parse(JSON.stringify(this.statusGroups)),
        settings: board.settings
      };

      board.savedTemplates.push(newTemplate);
      this.onOpen();
      new Notice(`✅ Template "${templateData.name}" saved`, 2000);
    });
    modal.open();
  }

  private applyTemplate(template: BoardTemplate): void {
    new ConfirmModal(
      this.app,
      'Apply Template',
      `This will replace your current board structure with "${template.name}". Continue?`,
      () => {
        const board = this.boardService.getBoard();

        // Clear existing columns and create new ones from template
        board.columns = template.columns.map((col, index) => ({
          ...col,
          id: generateId(),
          order: index
        }));

        // Apply status groups
        if (template.statusGroups) {
          // Update column IDs in status groups
          template.statusGroups.forEach(group => {
            group.columnIds = group.columnIds.map((oldId, idx) => {
              return board.columns[idx]?.id || oldId;
            });
          });
          board.statusGroups = template.statusGroups;
          this.statusGroups = template.statusGroups;
        }

        // Move all cards to first column
        if (board.columns.length > 0) {
          board.cards.forEach(card => {
            card.columnId = board.columns[0].id;
          });
        }

        this.onSave();
        this.close();
        new Notice(`✅ Template "${template.name}" applied`, 2000);
      },
      'Apply',
      'Cancel',
      false
    ).open();
  }

  private deleteTemplate(templateId: string): void {
    new ConfirmModal(
      this.app,
      'Delete Template',
      'Are you sure you want to delete this template?',
      () => {
        const board = this.boardService.getBoard();
        if (board.savedTemplates) {
          board.savedTemplates = board.savedTemplates.filter(t => t.id !== templateId);
        }
        this.onOpen();
        new Notice('✅ Template deleted', 2000);
      },
      'Delete',
      'Cancel',
      true
    ).open();
  }

  private save(): void {
    const board = this.boardService.getBoard();
    board.statusGroups = this.statusGroups;
    this.onSave();
    this.close();
    new Notice('✅ Status configuration saved', 2000);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// ============================================
// SAVE TEMPLATE MODAL
// ============================================

class SaveTemplateModal extends Modal {
  private onSave: (data: { name: string; description: string; icon: string }) => void;
  private name: string = '';
  private description: string = '';
  private icon: string = '📋';

  constructor(app: App, _boardService: BoardService, onSave: (data: any) => void) {
    super(app);
    this.onSave = onSave;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kanban-save-template-modal');

    contentEl.createEl('h2', { text: '💾 Save Board as Template' });

    new Setting(contentEl)
      .setName('Template Name')
      .addText(text => {
        text
          .setPlaceholder('My Custom Workflow')
          .setValue(this.name)
          .onChange(value => this.name = value);
        text.inputEl.focus();
      });

    new Setting(contentEl)
      .setName('Description')
      .addTextArea(text => {
        text
          .setPlaceholder('Describe this template...')
          .setValue(this.description)
          .onChange(value => this.description = value);
        text.inputEl.rows = 3;
      });

    new Setting(contentEl)
      .setName('Icon')
      .setDesc('Choose an emoji icon')
      .addText(text => {
        text
          .setValue(this.icon)
          .onChange(value => this.icon = value || '📋');
      });

    const buttonContainer = contentEl.createDiv({ cls: 'button-container' });

    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel', cls: 'cancel-btn' });
    cancelBtn.addEventListener('click', () => this.close());

    const saveBtn = buttonContainer.createEl('button', { text: 'Save Template', cls: 'submit-btn' });
    saveBtn.addEventListener('click', () => this.submit());
  }

  private submit(): void {
    if (this.name.trim()) {
      this.onSave({
        name: this.name.trim(),
        description: this.description.trim(),
        icon: this.icon
      });
      this.close();
    } else {
      new Notice('⚠️ Please enter a template name', 2000);
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// Export all modals
export {
  TextInputModal,
  ColorPickerModal,
  DatePickerModal,
  SuggesterModal,
  ConfirmModal,
  QuickAddCardModal,
  StatusManagementModal,
  SaveTemplateModal
};
