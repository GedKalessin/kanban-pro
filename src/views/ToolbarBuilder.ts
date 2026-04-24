import { Menu, Notice, setIcon } from 'obsidian';
import type { App } from 'obsidian';
import { createElement } from '../utils/helpers';
import { BoardService } from '../services/BoardService';
import { TextInputModal, QuickAddCardModal, StatusManagementModal } from '../modals/UtilityModals';
import { FilterModal } from '../modals/FilterModal';
import { TeamModal } from '../modals/TeamModal';
import { StatusGroupsModal } from '../modals/StatusGroupsModal';
import { AnalyticsModal } from '../modals/AnalyticsModal';
import { AutomationsModal } from '../modals/AutomationsModal';
import { BoardSettingsModal } from '../modals/BoardSettingsModal';

type ExtendedViewType = 'board' | 'list' | 'timeline' | 'gantt' | 'roadmap';

export class ToolbarBuilder {
  private app: App;
  private boardService: BoardService;
  private currentView: ExtendedViewType;
  private onViewChange: (view: ExtendedViewType) => void;
  private onSave: () => Promise<void>;
  private onRender: () => void;

  constructor(
    app: App,
    boardService: BoardService,
    currentView: ExtendedViewType,
    onViewChange: (view: ExtendedViewType) => void,
    onSave: () => Promise<void>,
    onRender: () => void
  ) {
    this.app = app;
    this.boardService = boardService;
    this.currentView = currentView;
    this.onViewChange = onViewChange;
    this.onSave = onSave;
    this.onRender = onRender;
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

    // Board name (read-only — rename via file explorer)
    const nameWrapper = boardInfo.createDiv({ cls: 'board-name-wrapper' });
    const nameEl = nameWrapper.createDiv({ cls: 'board-name-display' });
    nameEl.textContent = board.name;

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
        this.onViewChange(view.id);
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
    const addBtn = this.createActionButton(actions, 'plus', 'Add card', 'primary');
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
    new TextInputModal(
      this.app,
      'Search cards',
      'Search',
      '',
      (query: string) => {
        this.boardService.setFilters({ searchQuery: query });
        this.onRender();
      }
    ).open();
  }

  private showFilters(): void {
    new FilterModal(this.app, this.boardService, () => {
      this.onRender();
      void this.onSave();
    }).open();
  }

  private quickAddCard(): void {
    console.debug('🎯 TOOLBAR quickAddCard called');
    const board = this.boardService.getBoard();
    console.debug('📊 Board ID:', board.id, 'Total cards:', board.cards.length);

    if (board.columns.length === 0) {
      new Notice('⚠️ create a column first', 2000);
      return;
    }

    new QuickAddCardModal(this.app, (title: string, startDate?: string, dueDate?: string) => {
      console.debug('✨ TOOLBAR Card creation callback:', { title, boardId: board.id });
      console.debug('📊 Board cards BEFORE add:', board.cards.length);

      const newCard = this.boardService.addCard(board.columns[0].id, {
        title,
        startDate: startDate ?? null,
        dueDate: dueDate ?? null
      });

      console.debug('✅ TOOLBAR Card created:', newCard.id, 'Total cards now:', board.cards.length);

      this.onRender();
      console.debug('🔄 TOOLBAR Render called');

      void this.onSave();
      console.debug('💾 TOOLBAR Save called');
    }).open();
  }

  private showMoreMenu(e: MouseEvent): void {
    const menu = new Menu();

    menu.addItem(item => {
      item.setTitle('Manage team').setIcon('users').onClick(() => {
        new TeamModal(this.app, this.boardService, () => {
          void this.onSave();
          this.onRender();
        }).open();
      });
    });

    menu.addSeparator();

    menu.addItem(item => {
      item.setTitle('Edit status groups').setIcon('layers').onClick(() => {
        new StatusGroupsModal(this.app, this.boardService, () => {
          void this.onSave();
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
      item.setTitle('Board settings').setIcon('settings').onClick(() => {
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

    void navigator.clipboard.writeText(markdown);
    new Notice('✓ Markdown copied to clipboard', 2000);
  }

  private exportJSON(): void {
    const board = this.boardService.getBoard();
    const json = JSON.stringify(board, null, 2);
    void navigator.clipboard.writeText(json);
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
    const board = this.boardService.getBoard();
    new TextInputModal(
      this.app,
      'Rename board',
      'Board name',
      board.name,
      (value: string) => {
        this.boardService.updateBoard({ name: value });
        this.onRender();
        void this.onSave();
      }
    ).open();
  }

  private showBoardMenu(event: MouseEvent): void {
    const menu = new Menu();

    menu.addItem((item) =>
      item
        .setTitle('Edit statuses')
        .setIcon('settings')
        .onClick(() => {
          new StatusManagementModal(this.app, this.boardService, () => {
            this.onRender();
            void this.onSave();
          }).open();
        })
    );

    menu.addSeparator();

    menu.addItem((item) =>
      item
        .setTitle('Add swim lane')
        .setIcon('columns')
        .onClick(() => this.addSwimLane())
    );

    menu.addItem((item) =>
      item
        .setTitle('Export board')
        .setIcon('download')
        .onClick(() => this.exportBoard())
    );

    menu.addSeparator();

    menu.addItem((item) =>
      item
        .setTitle('Board settings')
        .setIcon('sliders-horizontal')
        .onClick(() => this.showSettingsModal())
    );

    menu.showAtMouseEvent(event);
  }

  private addSwimLane(): void {
    new TextInputModal(
      this.app,
      'Add swim lane',
      'Swim lane name',
      '',
      (value: string) => {
        this.boardService.addSwimLane(value);
        this.onRender();
        void this.onSave();
        new Notice(`✅ swim lane "${value}" created`, 2000);
      }
    ).open();
  }

  private exportBoard(): void {
    const board = this.boardService.getBoard();
    const dataStr = JSON.stringify(board, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = activeDocument.createElement('a');
    link.href = url;
    link.download = `${board.name}.kanban.json`;
    link.click();

    URL.revokeObjectURL(url);
    new Notice('✅ board exported', 2000);
  }

  private showFilterModal(): void {
    new FilterModal(this.app, this.boardService, () => {
      this.onRender();
    }).open();
  }

  private showAnalyticsModal(): void {
    new AnalyticsModal(this.app, this.boardService).open();
  }

  private showAutomationsModal(): void {
    new AutomationsModal(this.app, this.boardService, () => {
      void this.onSave();
    }).open();
  }

  private showSettingsModal(): void {
    new BoardSettingsModal(
      this.app,
      this.boardService,
      async () => {
        this.onRender();
        await this.onSave();
      }
    ).open();
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
