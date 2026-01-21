import { Menu, Notice, setIcon } from 'obsidian';
import type { App } from 'obsidian';
import { createElement } from '../utils/helpers';
import { BoardService } from '../services/BoardService';
import type KanbanProPlugin from '../main';

type ExtendedViewType = 'board' | 'list' | 'timeline' | 'gantt' | 'roadmap';

export class ToolbarBuilder {
  private app: App;
  private plugin: KanbanProPlugin;
  private boardService: BoardService;
  private currentView: ExtendedViewType;
  private onViewChange: (view: ExtendedViewType) => void;
  private onSave: () => void;
  private onRender: () => void;
  private onTitleChange?: () => void;

  constructor(
    app: App,
    plugin: KanbanProPlugin,
    boardService: BoardService,
    currentView: ExtendedViewType,
    onViewChange: (view: ExtendedViewType) => void,
    onSave: () => void,
    onRender: () => void,
    onTitleChange?: () => void
  ) {
    this.app = app;
    this.plugin = plugin;
    this.boardService = boardService;
    this.currentView = currentView;
    this.onViewChange = onViewChange;
    this.onSave = onSave;
    this.onRender = onRender;
    this.onTitleChange = onTitleChange;
  }

  build(): HTMLElement {
    const toolbar = createElement('div', { className: 'kanban-toolbar' });

    // Left section - Board info
    const leftSection = toolbar.createDiv({ cls: 'toolbar-left' });
    this.buildBoardInfo(leftSection);

    // Center section - View switcher
    const centerSection = toolbar.createDiv({ cls: 'toolbar-center' });
    this.buildViewSwitcher(centerSection);

    // Right section - Actions
    const rightSection = toolbar.createDiv({ cls: 'toolbar-right' });
    this.buildActions(rightSection);

    return toolbar;
  }

  private buildBoardInfo(container: HTMLElement): void {
    const boardInfo = container.createDiv({ cls: 'board-info' });

    const board = this.boardService.getBoard();

    // Board icon
    const iconWrapper = boardInfo.createDiv({ cls: 'board-icon' });
    setIcon(iconWrapper, 'layout-grid');

    // Board name (editable)
    const nameWrapper = boardInfo.createDiv({ cls: 'board-name-wrapper' });
    const nameInput = nameWrapper.createEl('input', {
      type: 'text',
      value: board.name,
      cls: 'board-name-input',
      placeholder: 'Board name'
    });

    nameInput.addEventListener('blur', () => {
      const newName = nameInput.value.trim();
      if (newName && newName !== board.name) {
        this.boardService.updateBoard({ name: newName });
        if (this.onTitleChange) {
          this.onTitleChange(); // Aggiorna il titolo della tab
        }
        this.onSave();
        new Notice('✓ Board renamed', 1500);
      } else if (!newName) {
        nameInput.value = board.name;
      }
    });

    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        nameInput.blur();
      } else if (e.key === 'Escape') {
        nameInput.value = board.name;
        nameInput.blur();
      }
    });

    // Board description (tooltip on hover)
    if (board.description) {
      const descIcon = boardInfo.createDiv({ cls: 'board-desc-icon' });
      setIcon(descIcon, 'info');
      descIcon.setAttribute('aria-label', board.description);
      descIcon.setAttribute('data-tooltip', board.description);
    }
  }

  private buildViewSwitcher(container: HTMLElement): void {
    const viewSwitcher = container.createDiv({ cls: 'view-switcher' });

    const views = [
      { id: 'board', icon: 'layout-grid', label: 'Board' },
      { id: 'list', icon: 'list', label: 'List' },
      { id: 'timeline', icon: 'calendar', label: 'Timeline' },
      { id: 'gantt', icon: 'gantt-chart', label: 'Gantt' },
      { id: 'roadmap', icon: 'flag', label: 'Roadmap' }
    ] as const;

    views.forEach(view => {
      const btn = viewSwitcher.createDiv({
        cls: `view-btn ${this.currentView === view.id ? 'active' : ''}`,
        attr: {
          'aria-label': view.label,
          'data-view': view.id
        }
      });

      const iconWrapper = btn.createDiv({ cls: 'view-icon' });
      setIcon(iconWrapper, view.icon);

      const label = btn.createDiv({ cls: 'view-label' });
      label.textContent = view.label;

      btn.addEventListener('click', () => {
        this.onViewChange(view.id as ExtendedViewType);
      });
    });
  }

  private buildActions(container: HTMLElement): void {
    const actions = container.createDiv({ cls: 'toolbar-actions' });

    // Search
    const searchBtn = this.createActionButton(actions, 'search', 'Search');
    searchBtn.addEventListener('click', () => this.showSearch());

    // Filter
    const filterBtn = this.createActionButton(actions, 'filter', 'Filter');
    filterBtn.addEventListener('click', () => this.showFilters());

    // Add card
    const addBtn = this.createActionButton(actions, 'plus', 'Add Card', 'primary');
    addBtn.addEventListener('click', () => this.quickAddCard());

    // More menu
    const moreBtn = this.createActionButton(actions, 'more-vertical', 'More');
    moreBtn.addEventListener('click', (e) => this.showMoreMenu(e));
  }

  private createActionButton(
    container: HTMLElement,
    icon: string,
    label: string,
    variant?: 'primary'
  ): HTMLElement {
    const btn = container.createDiv({
      cls: `action-btn ${variant || ''}`,
      attr: { 'aria-label': label }
    });

    const iconWrapper = btn.createDiv({ cls: 'action-icon' });
    setIcon(iconWrapper, icon);

    return btn;
  }

  private showSearch(): void {
    const { TextInputModal } = require('../modals/UtilityModals');
    new TextInputModal(
      this.app,
      'Search Cards',
      'Search',
      '',
      (query: string) => {
        this.boardService.setFilters({ searchQuery: query });
        this.onRender();
      }
    ).open();
  }

  private showFilters(): void {
    const { FilterModal } = require('../modals/FilterModal');
    new FilterModal(this.app, this.boardService, () => {
      this.onRender();
      this.onSave();
    }).open();
  }

  private quickAddCard(): void {
    console.log('🎯 TOOLBAR quickAddCard called');  // ✅ Debug
    const board = this.boardService.getBoard();
    console.log('📊 Board ID:', board.id, 'Total cards:', board.cards.length);  // ✅ Debug

    if (board.columns.length === 0) {
      new Notice('⚠️ Create a column first', 2000);
      return;
    }

    const { QuickAddCardModal } = require('../modals/UtilityModals');
    new QuickAddCardModal(this.app, (title: string, startDate?: string, dueDate?: string) => {
      console.log('✨ TOOLBAR Card creation callback:', { title, boardId: board.id });  // ✅ Debug
      console.log('📊 Board cards BEFORE add:', board.cards.length);  // ✅ Debug

      const newCard = this.boardService.addCard(board.columns[0].id, {
        title,
        startDate: startDate ?? null,
        dueDate: dueDate ?? null
      });

      console.log('✅ TOOLBAR Card created:', newCard.id, 'Total cards now:', board.cards.length);  // ✅ Debug

      this.onRender();
      console.log('🔄 TOOLBAR Render called');  // ✅ Debug

      this.onSave();
      console.log('💾 TOOLBAR Save called');  // ✅ Debug
    }).open();
  }

  private showMoreMenu(e: MouseEvent): void {
    const menu = new Menu();

    menu.addItem(item => {
      item.setTitle('Edit Status Groups').setIcon('layers').onClick(() => {
        const { StatusGroupsModal } = require('../modals/StatusGroupsModal');
        new StatusGroupsModal(this.app, this.boardService, () => {
          this.onSave();
          this.onRender();
        }).open();
      });
    });

    menu.addSeparator();

    menu.addItem(item => {
      item.setTitle('Analytics').setIcon('bar-chart-2').onClick(() => {
        this.showAnalyticsModal();
      });
    });

    menu.addItem(item => {
      item.setTitle('Automations').setIcon('zap').onClick(() => {
        this.showAutomationsModal();
      });
    });

    menu.addItem(item => {
      item.setTitle('Board Settings').setIcon('settings').onClick(() => {
        this.showSettingsModal();
      });
    });

    menu.addSeparator();

    menu.addItem(item => {
      item.setTitle('Export to Markdown').setIcon('download').onClick(() => {
        this.exportMarkdown();
      });
    });

    menu.addItem(item => {
      item.setTitle('Export to JSON').setIcon('code').onClick(() => {
        this.exportJSON();
      });
    });

    menu.showAtMouseEvent(e);
  }

  private exportMarkdown(): void {
    const board = this.boardService.getBoard();
    let markdown = `# ${board.name}\n\n`;

    if (board.description) {
      markdown += `${board.description}\n\n`;
    }

    markdown += `---\n\n`;

    board.columns.forEach(column => {
      markdown += `## ${column.name}\n\n`;
      const cards = board.cards.filter(c => c.columnId === column.id);

      if (cards.length === 0) {
        markdown += `*No cards*\n\n`;
      } else {
        cards.forEach(card => {
          markdown += `### ${card.title}\n`;
          if (card.description) {
            markdown += `${card.description}\n`;
          }
          if (card.tags.length > 0) {
            markdown += `Tags: ${card.tags.map(t => `#${t}`).join(' ')}\n`;
          }
          if (card.dueDate) {
            markdown += `Due: ${card.dueDate.split('T')[0]}\n`;
          }
          markdown += `\n`;
        });
      }
    });

    navigator.clipboard.writeText(markdown);
    new Notice('✓ Markdown copied to clipboard', 2000);
  }

  private exportJSON(): void {
    const board = this.boardService.getBoard();
    const json = JSON.stringify(board, null, 2);
    navigator.clipboard.writeText(json);
    new Notice('✓ JSON copied to clipboard', 2000);
  }

  // ==================== OLD METHODS (UNUSED) ====================

  private createToolbarButton(icon: string, tooltip: string, onClick: (e: MouseEvent) => void): HTMLElement {
    const btn = createElement('button', { className: 'toolbar-btn clickable-icon', 'aria-label': tooltip });
    setIcon(btn, icon);
    btn.addEventListener('click', onClick);
    return btn;
  }

  private editBoardName(): void {
    const { TextInputModal } = require('../modals/UtilityModals');
    const board = this.boardService.getBoard();
    new TextInputModal(
      this.app,
      'Rename Board',
      'Board name',
      board.name,
      (value: string) => {
        this.boardService.updateBoard({ name: value });
        this.onRender();
        this.onSave();
      }
    ).open();
  }

  private showBoardMenu(event: MouseEvent): void {
    const menu = new Menu();

    menu.addItem((item) =>
      item
        .setTitle('Edit Statuses')
        .setIcon('settings')
        .onClick(() => {
          const { StatusManagementModal } = require('../modals/UtilityModals');
          new StatusManagementModal(this.app, this.boardService, () => {
            this.onRender();
            this.onSave();
          }).open();
        })
    );

    menu.addSeparator();

    menu.addItem((item) =>
      item
        .setTitle('Add Swim Lane')
        .setIcon('columns')
        .onClick(() => this.addSwimLane())
    );

    menu.addItem((item) =>
      item
        .setTitle('Export Board')
        .setIcon('download')
        .onClick(() => this.exportBoard())
    );

    menu.addSeparator();

    menu.addItem((item) =>
      item
        .setTitle('Board Settings')
        .setIcon('sliders-horizontal')
        .onClick(() => this.showSettingsModal())
    );

    menu.showAtMouseEvent(event);
  }

  private addSwimLane(): void {
    const { TextInputModal } = require('../modals/UtilityModals');
    new TextInputModal(
      this.app,
      'Add Swim Lane',
      'Swim lane name',
      '',
      (value: string) => {
        this.boardService.addSwimLane(value);
        this.onRender();
        this.onSave();
        new Notice(`✅ Swim lane "${value}" created`, 2000);
      }
    ).open();
  }

  private exportBoard(): void {
    const board = this.boardService.getBoard();
    const dataStr = JSON.stringify(board, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${board.name}.kanban.json`;
    link.click();

    URL.revokeObjectURL(url);
    new Notice('✅ Board exported', 2000);
  }

  private showFilterModal(): void {
    const { FilterModal } = require('../modals/FilterModal');
    new FilterModal(this.app, this.boardService, () => {
      this.onRender();
    }).open();
  }

  private showAnalyticsModal(): void {
    const { AnalyticsModal } = require('../modals/AnalyticsModal');
    new AnalyticsModal(this.app, this.boardService).open();
  }

  private showAutomationsModal(): void {
    const { AutomationsModal } = require('../modals/AutomationsModal');
    new AutomationsModal(this.app, this.boardService, () => {
      this.onSave();
    }).open();
  }

  private showSettingsModal(): void {
    const { BoardSettingsModal } = require('../modals/BoardSettingsModal');
    new BoardSettingsModal(this.app, this.boardService, () => {
      this.onRender();
      this.onSave();
    }).open();
  }

  private hasActiveFilters(): boolean {
    const filters = this.boardService.getBoard().filters;
    return (
      filters.assignees.length > 0 ||
      filters.priorities.length > 0 ||
      filters.tags.length > 0 ||
      !filters.showCompleted ||
      !filters.showBlocked ||
      (filters.dateRange?.start !== null && filters.dateRange?.start !== undefined) ||
      (filters.dateRange?.end !== null && filters.dateRange?.end !== undefined)
    );
  }
}
