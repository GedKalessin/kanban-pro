import { App, Modal, Setting } from 'obsidian';
import { Milestone } from '../models/types';

interface MilestoneData {
  name: string;
  description: string;
  dueDate: string | null;
  color: string;
}

export class MilestoneModal extends Modal {
  private milestone: Milestone | null;
  private onSubmit: (data: MilestoneData) => void;
  private formData: MilestoneData;

  constructor(app: App, milestone: Milestone | null, onSubmit: (data: MilestoneData) => void) {
    super(app);
    this.milestone = milestone;
    this.onSubmit = onSubmit;

    this.formData = {
      name: milestone?.name || '',
      description: milestone?.description || '',
      dueDate: milestone?.dueDate || null,
      color: milestone?.color || '#6366f1'
    };
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kanban-milestone-modal');

    contentEl.createEl('h2', { text: this.milestone ? 'Edit Milestone' : 'Create Milestone' });

    // Name
    new Setting(contentEl)
      .setName('Name')
      .addText(text => {
        text
          .setValue(this.formData.name)
          .setPlaceholder('Q1 Release')
          .onChange(value => {
            this.formData.name = value;
          });
        text.inputEl.focus();
      });

    // Description
    new Setting(contentEl)
      .setName('Description')
      .addTextArea(text => {
        text
          .setValue(this.formData.description)
          .setPlaceholder('What does this milestone represent?')
          .onChange(value => {
            this.formData.description = value;
          });
      });

    // Due Date
    new Setting(contentEl)
      .setName('Due Date')
      .addText(text => {
        text.inputEl.type = 'date';
        if (this.formData.dueDate) {
          text.setValue(this.formData.dueDate.split('T')[0]);
        }
        text.onChange(value => {
          this.formData.dueDate = value ? new Date(value).toISOString() : null;
        });
      });

    // Color
    new Setting(contentEl)
      .setName('Color')
      .addButton(btn => {
        btn.setButtonText('Choose Color');
        btn.onClick(() => {
          const { ColorPickerModal } = require('./UtilityModals');
          new ColorPickerModal(
            this.app,
            this.formData.color,
            (color: string) => {
              this.formData.color = color;
            }
          ).open();
        });
      });

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: 'button-container' });

    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel', cls: 'cancel-btn' });
    cancelBtn.addEventListener('click', () => this.close());

    const submitBtn = buttonContainer.createEl('button', {
      text: this.milestone ? 'Update' : 'Create',
      cls: 'submit-btn'
    });
    submitBtn.addEventListener('click', () => this.submit());
  }

  private submit(): void {
    if (!this.formData.name.trim()) {
      return;
    }

    // Close first, then submit callback to avoid render conflicts
    this.close();

    // Increased delay to ensure modal is fully closed before rendering
    // This prevents race conditions with the view render cycle
    setTimeout(() => {
      this.onSubmit(this.formData);
    }, 150);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
