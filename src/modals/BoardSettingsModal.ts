import { App, Modal, Setting } from 'obsidian';
import { BoardService } from '../services/BoardService';
import { ViewType } from '../models/types';

export class BoardSettingsModal extends Modal {
  private boardService: BoardService;
  private onUpdate: () => Promise<void>;

  constructor(
    app: App,
    boardService: BoardService,
    onUpdate: () => Promise<void>
  ) {
    super(app);
    this.boardService = boardService;
    this.onUpdate = onUpdate;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kanban-board-settings-modal');

    contentEl.createEl('h2', { text: '⚙️ board settings' });

    const board = this.boardService.getBoard();
    const settings = board.settings;

    // General Settings
    new Setting(contentEl).setHeading().setName('General');

    new Setting(contentEl)
      .setName('Board description')
      .addTextArea(text => {
        text
          .setValue(board.description)
          .onChange(value => {
            this.boardService.updateBoard({ description: value });
            void this.onUpdate();
          });
      });

    new Setting(contentEl)
      .setName('Default view')
      .addDropdown(dropdown => {
        const views: ViewType[] = ['board', 'list', 'timeline', 'roadmap'];
        views.forEach(view => {
          dropdown.addOption(view, view.charAt(0).toUpperCase() + view.slice(1));
        });
        dropdown.setValue(settings.defaultView);
        dropdown.onChange(value => {
          settings.defaultView = value as ViewType;
          this.boardService.updateBoard({ settings });
          void this.onUpdate();
        });
      });

    // Features
    new Setting(contentEl).setHeading().setName('Features');

    new Setting(contentEl)
      .setName('Enable wip limits')
      .setDesc('Limit the number of cards per column')
      .addToggle(toggle => {
        toggle
          .setValue(settings.enableWipLimits)
          .onChange(value => {
            settings.enableWipLimits = value;
            this.boardService.updateBoard({ settings });
            void this.onUpdate();
          });
      });

    new Setting(contentEl)
      .setName('Enable swim lanes')
      .setDesc('Organize cards in horizontal swim lanes')
      .addToggle(toggle => {
        toggle
          .setValue(settings.enableSwimLanes)
          .onChange(value => {
            settings.enableSwimLanes = value;
            this.boardService.updateBoard({ settings });
            void this.onUpdate();
          });
      });

    new Setting(contentEl)
      .setName('Enable time tracking')
      .setDesc('Track time spent on cards')
      .addToggle(toggle => {
        toggle
          .setValue(settings.enableTimeTracking)
          .onChange(value => {
            settings.enableTimeTracking = value;
            this.boardService.updateBoard({ settings });
            void this.onUpdate();
          });
      });

    new Setting(contentEl)
      .setName('Enable automations')
      .setDesc('Automatically perform actions based on triggers')
      .addToggle(toggle => {
        toggle
          .setValue(settings.enableAutomations)
          .onChange(value => {
            settings.enableAutomations = value;
            this.boardService.updateBoard({ settings });
            void this.onUpdate();
          });
      });

    new Setting(contentEl)
      .setName('Show card numbers')
      .setDesc('Display sequential card numbers')
      .addToggle(toggle => {
        toggle
          .setValue(settings.showCardNumbers)
          .onChange(value => {
            settings.showCardNumbers = value;
            this.boardService.updateBoard({ settings });
            void this.onUpdate();
          });
      });

    // Card Display Options
    new Setting(contentEl).setHeading().setName('Card display');

    const displayOptions = settings.cardDisplayOptions;

    new Setting(contentEl)
      .setName('Show assignee')
      .addToggle(toggle => {
        toggle.setValue(displayOptions.showAssignee).onChange(value => {
          displayOptions.showAssignee = value;
          this.boardService.updateBoard({ settings });
          void this.onUpdate();
        });
      });

    new Setting(contentEl)
      .setName('Show due date')
      .addToggle(toggle => {
        toggle.setValue(displayOptions.showDueDate).onChange(value => {
          displayOptions.showDueDate = value;
          this.boardService.updateBoard({ settings });
          void this.onUpdate();
        });
      });

    new Setting(contentEl)
      .setName('Show tags')
      .addToggle(toggle => {
        toggle.setValue(displayOptions.showTags).onChange(value => {
          displayOptions.showTags = value;
          this.boardService.updateBoard({ settings });
          void this.onUpdate();
        });
      });

    new Setting(contentEl)
      .setName('Show priority')
      .addToggle(toggle => {
        toggle.setValue(displayOptions.showPriority).onChange(value => {
          displayOptions.showPriority = value;
          this.boardService.updateBoard({ settings });
          void this.onUpdate();
        });
      });

    new Setting(contentEl)
      .setName('Show checklist progress')
      .addToggle(toggle => {
        toggle.setValue(displayOptions.showChecklist).onChange(value => {
          displayOptions.showChecklist = value;
          this.boardService.updateBoard({ settings });
          void this.onUpdate();
        });
      });

    new Setting(contentEl)
      .setName('Compact mode')
      .setDesc('Reduce card size for more cards on screen')
      .addToggle(toggle => {
        toggle.setValue(displayOptions.compactMode).onChange(value => {
          displayOptions.compactMode = value;
          this.boardService.updateBoard({ settings });
          void this.onUpdate();
        });
      });

    // Auto-Archive
    new Setting(contentEl).setHeading().setName('Auto-archive');

    new Setting(contentEl)
      .setName('Auto-archive completed')
      .setDesc('Automatically archive completed cards after a certain number of days')
      .addToggle(toggle => {
        toggle
          .setValue(settings.autoArchiveCompleted)
          .onChange(value => {
            settings.autoArchiveCompleted = value;
            this.boardService.updateBoard({ settings });
            void this.onUpdate();
          });
      });

    new Setting(contentEl)
      .setName('Archive after (days)')
      .addText(text => {
        text
          .setValue(settings.autoArchiveDays.toString())
          .onChange(value => {
            const days = parseInt(value);
            if (!isNaN(days) && days > 0) {
              settings.autoArchiveDays = days;
              this.boardService.updateBoard({ settings });
              void this.onUpdate();
            }
          });
      });

    // Close Button
    const closeBtn = contentEl.createEl('button', { text: 'Close', cls: 'primary-btn full-width-btn' });
    closeBtn.addEventListener('click', () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
