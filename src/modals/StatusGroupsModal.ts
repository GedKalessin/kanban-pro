import { App, Modal, Setting, Notice, setIcon } from 'obsidian';
import { BoardService } from '../services/BoardService';
import { StatusGroup } from '../models/types';

export class StatusGroupsModal extends Modal {
  private boardService: BoardService;
  private onSave: () => void;

  constructor(app: App, boardService: BoardService, onSave: () => void) {
    super(app);
    this.boardService = boardService;
    this.onSave = onSave;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kanban-status-groups-modal');

    contentEl.createEl('h2', { text: '📊 Edit Status Groups' });

    const description = contentEl.createEl('p', { cls: 'modal-description' });
    description.textContent = 'Organize your columns into status groups. This helps with analytics and workflow automation.';

    const board = this.boardService.getBoard();

    // Initialize statusGroups if not exists
    if (!board.statusGroups) {
      board.statusGroups = this.getDefaultStatusGroups();
    }

    const groupsContainer = contentEl.createDiv({ cls: 'status-groups-container' });

    board.statusGroups.forEach((group, index) => {
      this.renderStatusGroup(groupsContainer, group, index);
    });

    // Add group button
    const addBtn = contentEl.createEl('button', { text: '+ Add Status Group', cls: 'primary-btn full-width-btn' });
    addBtn.style.marginTop = '16px';
    addBtn.addEventListener('click', () => this.addStatusGroup());

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: 'button-container' });

    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel', cls: 'cancel-btn' });
    cancelBtn.addEventListener('click', () => this.close());

    const saveBtn = buttonContainer.createEl('button', { text: 'Save', cls: 'submit-btn' });
    saveBtn.addEventListener('click', () => this.save());
  }

  private renderStatusGroup(container: HTMLElement, group: StatusGroup, index: number): void {
    const groupEl = container.createDiv({ cls: 'status-group-item' });

    const header = groupEl.createDiv({ cls: 'group-header' });

    // Color indicator
    const colorIndicator = header.createDiv({ cls: 'color-indicator' });
    colorIndicator.style.backgroundColor = group.color;

    // Name
    const nameInput = header.createEl('input', {
      type: 'text',
      value: group.name,
      cls: 'group-name-input',
      placeholder: 'Group name'
    });
    nameInput.addEventListener('change', () => {
      group.name = nameInput.value;
    });

    // Delete button
    const deleteBtn = header.createEl('button', { cls: 'delete-group-btn' });
    setIcon(deleteBtn, 'trash-2');
    deleteBtn.addEventListener('click', () => {
      const board = this.boardService.getBoard();
      if (board.statusGroups) {
        board.statusGroups.splice(index, 1);
      }
      this.close();
      new StatusGroupsModal(this.app, this.boardService, this.onSave).open();
    });

    // Description
    new Setting(groupEl)
      .setName('Description')
      .addText(text => {
        text
          .setValue(group.description)
          .setPlaceholder('Group description')
          .onChange(value => {
            group.description = value;
          });
      });

    // Color
    new Setting(groupEl)
      .setName('Color')
      .addText(text => {
        text.inputEl.type = 'color';
        text.setValue(group.color);
        text.onChange(value => {
          group.color = value;
          colorIndicator.style.backgroundColor = value;
        });
      });

    // Columns
    const columnsLabel = groupEl.createEl('label', { text: 'Columns in this group:' });
    columnsLabel.style.fontWeight = '600';
    columnsLabel.style.fontSize = '13px';
    columnsLabel.style.marginTop = '12px';
    columnsLabel.style.display = 'block';

    const columnsContainer = groupEl.createDiv({ cls: 'group-columns' });

    const board = this.boardService.getBoard();
    board.columns.forEach(column => {
      const columnCheckbox = columnsContainer.createDiv({ cls: 'column-checkbox' });
      
      const checkbox = columnCheckbox.createEl('input', { type: 'checkbox' });
      checkbox.checked = group.columnIds.includes(column.id);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          if (!group.columnIds.includes(column.id)) {
            group.columnIds.push(column.id);
          }
        } else {
          group.columnIds = group.columnIds.filter(id => id !== column.id);
        }
      });

      const label = columnCheckbox.createEl('label', { text: column.name });
      label.style.cursor = 'pointer';
      label.addEventListener('click', () => {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
      });
    });
  }

  private addStatusGroup(): void {
    const board = this.boardService.getBoard();
    const newGroup: StatusGroup = {
      category: 'active',
      name: 'New Group',
      description: '',
      columnIds: [],
      color: '#6366f1'
    };
    if (!board.statusGroups) {
      board.statusGroups = [];
    }
    board.statusGroups.push(newGroup);
    this.close();
    new StatusGroupsModal(this.app, this.boardService, this.onSave).open();
  }

  private getDefaultStatusGroups(): StatusGroup[] {
    return [
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
  }

  private save(): void {
    this.onSave();
    this.close();
    new Notice('✓ Status groups saved', 1500);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
