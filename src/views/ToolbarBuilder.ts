import { Menu, Notice, setIcon } from 'obsidian';
import type { App } from 'obsidian';
import { createElement, debounce } from '../utils/helpers';
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

  constructor(
    app: App,
    plugin: KanbanProPlugin,
    boardService: BoardService,
    currentView: ExtendedViewType,
    onViewChange: (view: ExtendedViewType) => void,
    onSave: () => void,
    onRender: () => void
  ) {
    this.app = app;
    this.plugin = plugin;
    this.boardService = boardService;
    this.currentView = currentView;
    this.onViewChange = onViewChange;
    this.onSave = onSave;
    this.onRender = onRender;
  }

  build(): HTMLElement {
    const toolbar = createElement('div', { className: 'kanban-toolbar' });

    const leftSection = this.buildLeftSection();
    const centerSection = this.buildCenterSection();
    const rightSection = this.buildRightSection();

    toolbar.appendChild(leftSection);
    toolbar.appendChild(centerSection);
    toolbar.appendChild(rightSection);

    return toolbar;
  }

  private buildLeftSection(): HTMLElement {
    const board = this.boardService.getBoard();
    const leftSection = createElement('div', { className: 'toolbar-left' });

    // Board Title
    const boardTitle = createElement('h2', { className: 'board-title' }, [board.name]);
    boardTitle.addEventListener('click', () => this.editBoardName());
    leftSection.appendChild(boardTitle);

    // Board Menu
    const boardMenuBtn = this.createToolbarButton('more-horizontal', 'Board Menu', (e) => this.showBoardMenu(e));
    leftSection.appendChild(boardMenuBtn);

    // Undo
    const undoBtn = this.createToolbarButton('undo', 'Undo', () => {
      if (this.boardService.undo()) {
        this.onRender();
        this.onSave();
        new Notice('↩️ Undo', 1000);
      }
    });
    undoBtn.toggleClass('disabled', !this.boardService.canUndo());
    leftSection.appendChild(undoBtn);

    // Redo
    const redoBtn = this.createToolbarButton('redo', 'Redo', () => {
      if (this.boardService.redo()) {
        this.onRender();
        this.onSave();
        new Notice('↪️ Redo', 1000);
      }
    });
    redoBtn.toggleClass('disabled', !this.boardService.canRedo());
    leftSection.appendChild(redoBtn);

    return leftSection;
  }

  private buildCenterSection(): HTMLElement {
    const centerSection = createElement('div', { className: 'toolbar-center' });

    const views: { type: ExtendedViewType; icon: string; label: string }[] = [
      { type: 'board', icon: 'layout-grid', label: 'Board' },
      { type: 'list', icon: 'list', label: 'List' },
      { type: 'timeline', icon: 'calendar', label: 'Timeline' },
      { type: 'gantt', icon: 'gantt-chart', label: 'Gantt' },
      { type: 'roadmap', icon: 'milestone', label: 'Roadmap' }
    ];

    const viewSwitcher = createElement('div', { className: 'view-switcher' });

    views.forEach(view => {
      const btn = createElement('button', {
        className: `view-btn ${this.currentView === view.type ? 'active' : ''}`,
        'aria-label': view.label
      });
      setIcon(btn, view.icon);
      btn.appendChild(createElement('span', {}, [view.label]));
      btn.addEventListener('click', () => this.onViewChange(view.type));
      viewSwitcher.appendChild(btn);
    });

    centerSection.appendChild(viewSwitcher);
    return centerSection;
  }

  private buildRightSection(): HTMLElement {
    const board = this.boardService.getBoard();
    const rightSection = createElement('div', { className: 'toolbar-right' });

    // Search
    const searchWrapper = createElement('div', { className: 'search-wrapper' });
    const searchIcon = createElement('span', { className: 'search-icon' });
    setIcon(searchIcon, 'search');
    searchWrapper.appendChild(searchIcon);

    const searchInput = createElement('input', {
      className: 'search-input',
      type: 'text',
      placeholder: 'Search cards...'
    }) as HTMLInputElement;
    searchInput.value = board.filters.searchQuery;
    searchInput.addEventListener('input', debounce((e: Event) => {
      this.boardService.setFilters({ searchQuery: (e.target as HTMLInputElement).value });
      this.onRender();
    }, 300));
    searchWrapper.appendChild(searchInput);
    rightSection.appendChild(searchWrapper);

    // Filter
    const filterBtn = this.createToolbarButton('filter', 'Filters', () => this.showFilterModal());
    if (this.hasActiveFilters()) filterBtn.addClass('has-filters');
    rightSection.appendChild(filterBtn);

    // Analytics
    rightSection.appendChild(this.createToolbarButton('bar-chart-2', 'Analytics', () => this.showAnalyticsModal()));

    // Automations
    rightSection.appendChild(this.createToolbarButton('zap', 'Automations', () => this.showAutomationsModal()));

    // Settings
    rightSection.appendChild(this.createToolbarButton('settings', 'Settings', () => this.showSettingsModal()));

    return rightSection;
  }

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
      (value) => {
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
      (value) => {
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
