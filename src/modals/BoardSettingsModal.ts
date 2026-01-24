import { App, Modal, Setting, Notice } from 'obsidian';
import { BoardService } from '../services/BoardService';
import { ViewType } from '../models/types';

export class BoardSettingsModal extends Modal {
  private boardService: BoardService;
  private onUpdate: () => Promise<void>;
  private onFileRename?: (newName: string) => Promise<void>;
  private originalName: string;

  constructor(
    app: App,
    boardService: BoardService,
    onUpdate: () => Promise<void>,
    onFileRename?: (newName: string) => Promise<void>
  ) {
    super(app);
    this.boardService = boardService;
    this.onUpdate = onUpdate;
    this.onFileRename = onFileRename;
    this.originalName = boardService.getBoard().name;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kanban-board-settings-modal');

    contentEl.createEl('h2', { text: '⚙️ Board Settings' });

    const board = this.boardService.getBoard();
    const settings = board.settings;

    // General Settings
    contentEl.createEl('h3', { text: 'General' });

    new Setting(contentEl)
      .setName('Board Name')
      .addText(text => {
        text
          .setValue(board.name)
          .onChange(value => {
            this.boardService.updateBoard({ name: value });
            this.onUpdate();
          });
      });

    new Setting(contentEl)
      .setName('Board Description')
      .addTextArea(text => {
        text
          .setValue(board.description)
          .onChange(value => {
            this.boardService.updateBoard({ description: value });
            this.onUpdate();
          });
      });

    new Setting(contentEl)
      .setName('Default View')
      .addDropdown(dropdown => {
        const views: ViewType[] = ['board', 'list', 'timeline', 'roadmap'];
        views.forEach(view => {
          dropdown.addOption(view, view.charAt(0).toUpperCase() + view.slice(1));
        });
        dropdown.setValue(settings.defaultView);
        dropdown.onChange(value => {
          settings.defaultView = value as ViewType;
          this.boardService.updateBoard({ settings });
          this.onUpdate();
        });
      });

    // Features
    contentEl.createEl('h3', { text: 'Features' });

    new Setting(contentEl)
      .setName('Enable WIP Limits')
      .setDesc('Limit the number of cards per column')
      .addToggle(toggle => {
        toggle
          .setValue(settings.enableWipLimits)
          .onChange(value => {
            settings.enableWipLimits = value;
            this.boardService.updateBoard({ settings });
            this.onUpdate();
          });
      });

    new Setting(contentEl)
      .setName('Enable Swim Lanes')
      .setDesc('Organize cards in horizontal swim lanes')
      .addToggle(toggle => {
        toggle
          .setValue(settings.enableSwimLanes)
          .onChange(value => {
            settings.enableSwimLanes = value;
            this.boardService.updateBoard({ settings });
            this.onUpdate();
          });
      });

    new Setting(contentEl)
      .setName('Enable Time Tracking')
      .setDesc('Track time spent on cards')
      .addToggle(toggle => {
        toggle
          .setValue(settings.enableTimeTracking)
          .onChange(value => {
            settings.enableTimeTracking = value;
            this.boardService.updateBoard({ settings });
            this.onUpdate();
          });
      });

    new Setting(contentEl)
      .setName('Enable Automations')
      .setDesc('Automatically perform actions based on triggers')
      .addToggle(toggle => {
        toggle
          .setValue(settings.enableAutomations)
          .onChange(value => {
            settings.enableAutomations = value;
            this.boardService.updateBoard({ settings });
            this.onUpdate();
          });
      });

    new Setting(contentEl)
      .setName('Show Card Numbers')
      .setDesc('Display sequential card numbers')
      .addToggle(toggle => {
        toggle
          .setValue(settings.showCardNumbers)
          .onChange(value => {
            settings.showCardNumbers = value;
            this.boardService.updateBoard({ settings });
            this.onUpdate();
          });
      });

    // Card Display Options
    contentEl.createEl('h3', { text: 'Card Display' });

    const displayOptions = settings.cardDisplayOptions;

    new Setting(contentEl)
      .setName('Show Assignee')
      .addToggle(toggle => {
        toggle.setValue(displayOptions.showAssignee).onChange(value => {
          displayOptions.showAssignee = value;
          this.boardService.updateBoard({ settings });
          this.onUpdate();
        });
      });

    new Setting(contentEl)
      .setName('Show Due Date')
      .addToggle(toggle => {
        toggle.setValue(displayOptions.showDueDate).onChange(value => {
          displayOptions.showDueDate = value;
          this.boardService.updateBoard({ settings });
          this.onUpdate();
        });
      });

    new Setting(contentEl)
      .setName('Show Tags')
      .addToggle(toggle => {
        toggle.setValue(displayOptions.showTags).onChange(value => {
          displayOptions.showTags = value;
          this.boardService.updateBoard({ settings });
          this.onUpdate();
        });
      });

    new Setting(contentEl)
      .setName('Show Priority')
      .addToggle(toggle => {
        toggle.setValue(displayOptions.showPriority).onChange(value => {
          displayOptions.showPriority = value;
          this.boardService.updateBoard({ settings });
          this.onUpdate();
        });
      });

    new Setting(contentEl)
      .setName('Show Checklist Progress')
      .addToggle(toggle => {
        toggle.setValue(displayOptions.showChecklist).onChange(value => {
          displayOptions.showChecklist = value;
          this.boardService.updateBoard({ settings });
          this.onUpdate();
        });
      });

    new Setting(contentEl)
      .setName('Compact Mode')
      .setDesc('Reduce card size for more cards on screen')
      .addToggle(toggle => {
        toggle.setValue(displayOptions.compactMode).onChange(value => {
          displayOptions.compactMode = value;
          this.boardService.updateBoard({ settings });
          this.onUpdate();
        });
      });

    // Auto-Archive
    contentEl.createEl('h3', { text: 'Auto-Archive' });

    new Setting(contentEl)
      .setName('Auto-Archive Completed')
      .setDesc('Automatically archive completed cards after a certain number of days')
      .addToggle(toggle => {
        toggle
          .setValue(settings.autoArchiveCompleted)
          .onChange(value => {
            settings.autoArchiveCompleted = value;
            this.boardService.updateBoard({ settings });
            this.onUpdate();
          });
      });

    new Setting(contentEl)
      .setName('Archive After (days)')
      .addText(text => {
        text
          .setValue(settings.autoArchiveDays.toString())
          .onChange(value => {
            const days = parseInt(value);
            if (!isNaN(days) && days > 0) {
              settings.autoArchiveDays = days;
              this.boardService.updateBoard({ settings });
              this.onUpdate();
            }
          });
      });

    // Close Button
    const closeBtn = contentEl.createEl('button', { text: 'Close', cls: 'primary-btn full-width-btn' });
    closeBtn.addEventListener('click', () => this.close());
  }

  async onClose(): Promise<void> {
    // Check if board name changed and rename file if needed
    const currentName = this.boardService.getBoard().name;
    if (currentName !== this.originalName && this.onFileRename) {
      // IMPORTANTE: Salva PRIMA il contenuto (con il nuovo nome nel JSON)
      await this.onUpdate();
      // POI rinomina il file
      await this.onFileRename(currentName);
    }
    this.contentEl.empty();
  }
}
