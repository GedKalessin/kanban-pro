import { ItemView, WorkspaceLeaf, Menu, Notice, setIcon, TFile, App, Modal, Setting, TextComponent, DropdownComponent, ButtonComponent, ToggleComponent } from 'obsidian';
import type KanbanProPlugin from '../main';
import { BoardService } from '../services/BoardService';
import type { StatusGroup, StatusCategory, BoardTemplate } from '../models/types';
import {
  KanbanBoard,
  KanbanCard,
  KanbanColumn,
  SwimLane,
  ViewType,
  Priority,
  TaskType,
  Milestone,
  ChecklistItem,
  PRIORITY_COLORS,
  TASK_TYPE_ICONS
} from '../models/types';
import {
  generateId,
  formatDisplayDate,
  isOverdue,
  isDueSoon,
  hexToRgba,
  isLightColor,
  createElement,
  createChildElement,
  debounce,
  calculatePercentage
} from '../utils/helpers';
import { StatusManagementModal } from '../modals/UtilityModals';

export const KANBAN_VIEW_TYPE = 'kanban-pro-view';

type ExtendedViewType = ViewType | 'gantt';

interface GanttConfig {
  startDate: Date;
  endDate: Date;
  cellWidth: number;
  rowHeight: number;
  headerHeight: number;
  zoomLevel: 'day' | 'week' | 'month';
}

interface TimelineConfig {
  viewMode: 'day' | 'week' | 'month';
  showWeekends: boolean;
  groupBy: 'none' | 'assignee' | 'priority' | 'column';
}

interface CardAssociation {
  fromCardId: string;
  toCardId: string;
  type: 'blocks' | 'blocked-by' | 'relates-to' | 'parent-of' | 'child-of';
}

export class KanbanBoardView extends ItemView {
  private plugin: KanbanProPlugin;
  private boardService: BoardService;
  private boardEl: HTMLElement | null = null;
  private currentView: ExtendedViewType = 'board';
  private draggedCard: HTMLElement | null = null;
  private draggedColumn: HTMLElement | null = null;
  private selectedCards: Set<string> = new Set();
  private filePath: string = '';
  
  private ganttConfig: GanttConfig = {
    startDate: new Date(),
    endDate: new Date(),
    cellWidth: 40,
    rowHeight: 44,
    headerHeight: 60,
    zoomLevel: 'day'
  };
  
  private timelineConfig: TimelineConfig = {
    viewMode: 'week',
    showWeekends: true,
    groupBy: 'none'
  };

  constructor(leaf: WorkspaceLeaf, plugin: KanbanProPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.boardService = new BoardService();
  }

  getViewType(): string { return KANBAN_VIEW_TYPE; }
  getDisplayText(): string { return this.boardService.getBoard().name || 'Kanban Pro'; }
  getIcon(): string { return 'layout-grid'; }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('kanban-pro-container');
    const state = this.leaf.getViewState();
    const fileState = state.state as { file?: string } | undefined;
    if (fileState?.file) {
      await this.loadFile(fileState.file);
    } else {
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile && activeFile.extension === 'kanban') {
        await this.loadFile(activeFile.path);
      } else {
        this.render();
      }
    }
  }

  async onClose(): Promise<void> { this.contentEl.empty(); }
  getState(): any { return { file: this.filePath }; }
  
  async setState(state: any, result: any): Promise<void> {
    if (state?.file) await this.loadFile(state.file);
  }

  private async loadFile(filePath: string): Promise<void> {
    try {
      const abstractFile = this.app.vault.getAbstractFileByPath(filePath);
      if (abstractFile && abstractFile instanceof TFile) {
        const content = await this.app.vault.read(abstractFile);
        const board = JSON.parse(content) as KanbanBoard;
        this.boardService = new BoardService(board);
        this.filePath = filePath;
        this.render();
        this.plugin.setupAutoSave(filePath, this);
      } else {
        this.render();
      }
    } catch (error) {
      console.error('Kanban Pro: Error loading file:', error);
      new Notice('⚠️ Failed to load Kanban board', 3000);
      this.render();
    }
  }

  setBoard(board: KanbanBoard, filePath: string): void {
    this.boardService = new BoardService(board);
    this.filePath = filePath;
    this.render();
  }

  getBoard(): KanbanBoard { return this.boardService.getBoard(); }

  // ==================== MAIN RENDER ====================
  render(): void {
    const board = this.boardService.getBoard();
    this.contentEl.empty();
    
    const wrapper = createElement('div', { className: 'kanban-pro-wrapper' });
    wrapper.appendChild(this.renderToolbar());
    
    const content = createElement('div', { className: 'kanban-pro-content' });
    
    switch (this.currentView) {
      case 'board': content.appendChild(this.renderBoardView()); break;
      case 'list': content.appendChild(this.renderListView()); break;
      case 'timeline': content.appendChild(this.renderTimelineView()); break;
      case 'gantt': content.appendChild(this.renderGanttView()); break;
      case 'roadmap': content.appendChild(this.renderRoadmapView()); break;
      default: content.appendChild(this.renderBoardView());
    }
    
    wrapper.appendChild(content);
    this.contentEl.appendChild(wrapper);
    this.setupDragAndDrop();
  }

  // ==================== TOOLBAR ====================
  private renderToolbar(): HTMLElement {
    const board = this.boardService.getBoard();
    const toolbar = createElement('div', { className: 'kanban-toolbar' });

    // Left section
    const leftSection = createElement('div', { className: 'toolbar-left' });
    const boardTitle = createElement('h2', { className: 'board-title' }, [board.name]);
    boardTitle.addEventListener('click', () => this.editBoardName());
    leftSection.appendChild(boardTitle);

    // Board menu button (three dots)
    const boardMenuBtn = this.createToolbarButton('more-horizontal', 'Board Menu', (e) => this.showBoardMenu(e));
    leftSection.appendChild(boardMenuBtn);

    const undoBtn = this.createToolbarButton('undo', 'Undo', () => {
      if (this.boardService.undo()) {
        this.render();
        this.saveBoard();
        new Notice('↩️ Undo', 1000);
      }
    });
    undoBtn.toggleClass('disabled', !this.boardService.canUndo());
    leftSection.appendChild(undoBtn);

    const redoBtn = this.createToolbarButton('redo', 'Redo', () => {
      if (this.boardService.redo()) {
        this.render();
        this.saveBoard();
        new Notice('↪️ Redo', 1000);
      }
    });
    redoBtn.toggleClass('disabled', !this.boardService.canRedo());
    leftSection.appendChild(redoBtn);

    toolbar.appendChild(leftSection);
    
    // Center section - View switcher
    const centerSection = createElement('div', { className: 'toolbar-center' });
    const views: { type: ExtendedViewType; icon: string; label: string }[] = [
      { type: 'board', icon: 'layout-grid', label: 'Board' },
      { type: 'list', icon: 'list', label: 'List' },
      { type: 'timeline', icon: 'calendar', label: 'Timeline' },
      { type: 'gantt', icon: 'gantt-chart', label: 'Gantt' },
      { type: 'roadmap', icon: 'milestone', label: 'Roadmap' },
    ];
    
    const viewSwitcher = createElement('div', { className: 'view-switcher' });
    views.forEach(view => {
      const btn = createElement('button', { 
        className: `view-btn ${this.currentView === view.type ? 'active' : ''}`,
        'aria-label': view.label
      });
      setIcon(btn, view.icon);
      btn.appendChild(createElement('span', {}, [view.label]));
      btn.addEventListener('click', () => { 
        this.currentView = view.type; 
        this.render(); 
      });
      viewSwitcher.appendChild(btn);
    });
    centerSection.appendChild(viewSwitcher);
    toolbar.appendChild(centerSection);
    
    // Right section
    const rightSection = createElement('div', { className: 'toolbar-right' });
    
    const searchWrapper = createElement('div', { className: 'search-wrapper' });
    const searchIcon = createElement('span', { className: 'search-icon' });
    setIcon(searchIcon, 'search');
    searchWrapper.appendChild(searchIcon);
    
    const searchInput = createElement('input', { 
      className: 'search-input', type: 'text', placeholder: 'Search cards...'
    }) as HTMLInputElement;
    searchInput.value = board.filters.searchQuery;
    searchInput.addEventListener('input', debounce((e: Event) => {
      this.boardService.setFilters({ searchQuery: (e.target as HTMLInputElement).value });
      this.render();
    }, 300));
    searchWrapper.appendChild(searchInput);
    rightSection.appendChild(searchWrapper);
    
    const filterBtn = this.createToolbarButton('filter', 'Filters', () => this.showFilterModal());
    if (this.hasActiveFilters()) filterBtn.addClass('has-filters');
    rightSection.appendChild(filterBtn);
    
    rightSection.appendChild(this.createToolbarButton('bar-chart-2', 'Analytics', () => this.showAnalyticsModal()));
    rightSection.appendChild(this.createToolbarButton('zap', 'Automations', () => this.showAutomationsModal()));
    rightSection.appendChild(this.createToolbarButton('settings', 'Settings', () => this.showSettingsModal()));
    
    toolbar.appendChild(rightSection);
    return toolbar;
  }

  private createToolbarButton(icon: string, tooltip: string, onClick: ((e: MouseEvent) => void) | (() => void)): HTMLElement {
    const btn = createElement('button', { className: 'toolbar-btn clickable-icon', 'aria-label': tooltip });
    setIcon(btn, icon);
    btn.addEventListener('click', onClick as any);
    return btn;
  }

  private showBoardMenu(event: MouseEvent): void {
    const menu = new Menu();

    menu.addItem((item) =>
      item
        .setTitle('Edit Statuses')
        .setIcon('settings')
        .onClick(() => {
          new StatusManagementModal(this.app, this.boardService, () => {
            this.render();
            this.saveBoard();
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
    new TextInputModal(
      this.app,
      'Add Swim Lane',
      'Swim lane name',
      '',
      (value) => {
        this.boardService.addSwimLane(value);
        this.render();
        this.saveBoard();
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

  // ==================== BOARD VIEW ====================
  private renderBoardView(): HTMLElement {
    const board = this.boardService.getBoard();
    this.boardEl = createElement('div', { className: 'kanban-board' });
    const filteredCards = this.boardService.getFilteredCards();
    const columns = [...board.columns].sort((a, b) => a.order - b.order);
    
    if (board.settings.enableSwimLanes && board.swimLanes.length > 0) {
      const swimLanes = [...board.swimLanes].sort((a, b) => a.order - b.order);
      const noLane: SwimLane = { id: '__no_lane__', name: 'Unassigned', color: '#94a3b8', order: -1, collapsed: false, assignee: null, tags: [] };
      [noLane, ...swimLanes].forEach(lane => {
        this.boardEl!.appendChild(this.renderSwimLane(lane, columns, filteredCards));
      });
    } else {
      const columnsContainer = createElement('div', { className: 'columns-container' });
      columns.forEach(column => {
        columnsContainer.appendChild(this.renderColumn(column, filteredCards.filter(c => c.columnId === column.id)));
      });
      
      const addColumnBtn = createElement('div', { className: 'add-column-btn' });
      const addIcon = createElement('span', { className: 'add-icon' });
      setIcon(addIcon, 'plus');
      addColumnBtn.appendChild(addIcon);
      addColumnBtn.appendChild(createElement('span', {}, ['Add Column']));
      addColumnBtn.addEventListener('click', () => this.addColumn());
      columnsContainer.appendChild(addColumnBtn);
      
      this.boardEl.appendChild(columnsContainer);
    }
    return this.boardEl;
  }

  private renderSwimLane(lane: SwimLane, columns: KanbanColumn[], allCards: KanbanCard[]): HTMLElement {
    const laneEl = createElement('div', { className: `swim-lane ${lane.collapsed ? 'collapsed' : ''}`, 'data-lane-id': lane.id });
    const laneHeader = createElement('div', { className: 'swim-lane-header' });
    laneHeader.style.borderLeftColor = lane.color;
    
    const collapseBtn = createElement('button', { className: 'collapse-btn clickable-icon' });
    setIcon(collapseBtn, lane.collapsed ? 'chevron-right' : 'chevron-down');
    collapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (lane.id !== '__no_lane__') {
        this.boardService.updateSwimLane(lane.id, { collapsed: !lane.collapsed });
        this.render(); 
        this.saveBoard();
      }
    });
    laneHeader.appendChild(collapseBtn);
    laneHeader.appendChild(createElement('span', { className: 'lane-name' }, [lane.name]));
    
    const laneCards = allCards.filter(c => lane.id === '__no_lane__' ? !c.swimLaneId : c.swimLaneId === lane.id);
    laneHeader.appendChild(createElement('span', { className: 'lane-card-count' }, [`${laneCards.length}`]));
    
    if (lane.id !== '__no_lane__') {
      const laneMenu = createElement('button', { className: 'lane-menu-btn clickable-icon' });
      setIcon(laneMenu, 'more-horizontal');
      laneMenu.addEventListener('click', (e) => { e.stopPropagation(); this.showSwimLaneMenu(lane, e); });
      laneHeader.appendChild(laneMenu);
    }
    laneEl.appendChild(laneHeader);
    
    if (!lane.collapsed) {
      const columnsContainer = createElement('div', { className: 'columns-container' });
      columns.forEach(column => columnsContainer.appendChild(this.renderColumn(column, laneCards.filter(c => c.columnId === column.id), lane.id)));
      laneEl.appendChild(columnsContainer);
    }
    return laneEl;
  }

  private renderColumn(column: KanbanColumn, cards: KanbanCard[], swimLaneId?: string): HTMLElement {
    const board = this.boardService.getBoard();
    const columnEl = createElement('div', {
      className: `kanban-column ${column.collapsed ? 'collapsed' : ''}`,
      'data-column-id': column.id, 'data-swim-lane-id': swimLaneId || ''
    });

    // Add status category attribute
    const statusCategory = this.boardService.getColumnStatusCategory(column.id);
    if (statusCategory) {
      columnEl.dataset.statusCategory = statusCategory;
    }

    if (this.boardService.isWipLimitExceeded(column.id)) columnEl.addClass('wip-exceeded');
    
    const header = createElement('div', { className: 'column-header' });
    header.style.borderTopColor = column.color;
    
    const headerLeft = createElement('div', { className: 'header-left' });
    const collapseBtn = createElement('button', { className: 'collapse-btn clickable-icon' });
    setIcon(collapseBtn, column.collapsed ? 'chevron-right' : 'chevron-down');
    collapseBtn.addEventListener('click', () => {
      this.boardService.updateColumn(column.id, { collapsed: !column.collapsed });
      this.render(); 
      this.saveBoard();
    });
    headerLeft.appendChild(collapseBtn);
    
    const titleWrapper = createElement('div', { className: 'column-title-wrapper' });
    const colorDot = createElement('span', { className: 'color-dot' });
    colorDot.style.backgroundColor = column.color;
    titleWrapper.appendChild(colorDot);
    
    const title = createElement('span', { className: 'column-title' }, [column.name]);
    title.addEventListener('dblclick', () => this.editColumnName(column));
    titleWrapper.appendChild(title);
    
    const count = createElement('span', { className: 'card-count' });
    count.textContent = column.wipLimit && board.settings.enableWipLimits ? `${cards.length}/${column.wipLimit}` : `${cards.length}`;
    if (this.boardService.isWipLimitExceeded(column.id)) count.addClass('exceeded');
    titleWrapper.appendChild(count);
    headerLeft.appendChild(titleWrapper);
    header.appendChild(headerLeft);
    
    const headerRight = createElement('div', { className: 'header-right' });
    const addCardBtn = createElement('button', { className: 'add-card-btn clickable-icon' });
    setIcon(addCardBtn, 'plus');
    addCardBtn.addEventListener('click', () => this.quickAddCard(column.id, swimLaneId));
    headerRight.appendChild(addCardBtn);
    
    const menuBtn = createElement('button', { className: 'column-menu-btn clickable-icon' });
    setIcon(menuBtn, 'more-horizontal');
    menuBtn.addEventListener('click', (e) => this.showColumnMenu(column, e));
    headerRight.appendChild(menuBtn);
    
    header.appendChild(headerRight);
    columnEl.appendChild(header);
    
    if (!column.collapsed) {
      const content = createElement('div', { className: 'column-content' });
      content.dataset.columnId = column.id;
      content.dataset.swimLaneId = swimLaneId || '';
      [...cards].sort((a, b) => a.order - b.order).forEach(card => content.appendChild(this.renderCard(card)));
      content.appendChild(createElement('div', { className: 'drop-zone' }));
      columnEl.appendChild(content);
    }
    return columnEl;
  }

  private renderCard(card: KanbanCard): HTMLElement {
    const board = this.boardService.getBoard();
    const displayOptions = board.settings.cardDisplayOptions;
    
    const cardEl = createElement('div', { 
      className: `kanban-card ${card.blocked ? 'blocked' : ''} ${this.selectedCards.has(card.id) ? 'selected' : ''}`,
      'data-card-id': card.id, draggable: 'true'
    });
    
    if (card.color) { 
      cardEl.style.borderLeftColor = card.color; 
      cardEl.style.borderLeftWidth = '4px'; 
    }
    
    if (displayOptions.showPriority || card.taskType !== 'task') {
      const cardHeader = createElement('div', { className: 'card-header' });
      if (card.taskType !== 'task') cardHeader.appendChild(createElement('span', { className: 'task-type-icon' }, [TASK_TYPE_ICONS[card.taskType]]));
      if (displayOptions.showPriority && card.priority !== 'none') {
        const priorityBadge = createElement('span', { className: `priority-badge priority-${card.priority}` });
        priorityBadge.style.backgroundColor = hexToRgba(PRIORITY_COLORS[card.priority], 0.2);
        priorityBadge.style.color = PRIORITY_COLORS[card.priority];
        priorityBadge.textContent = card.priority.charAt(0).toUpperCase() + card.priority.slice(1);
        cardHeader.appendChild(priorityBadge);
      }
      if (card.blocked) cardHeader.appendChild(createElement('span', { className: 'blocked-badge' }, ['Blocked']));
      cardEl.appendChild(cardHeader);
    }
    
    const cardTitle = createElement('div', { className: 'card-title' }, [card.title]);
    cardTitle.addEventListener('click', () => this.openCardModal(card));
    cardEl.appendChild(cardTitle);
    
    if (displayOptions.showTags && card.tags.length > 0) {
      const tagsContainer = createElement('div', { className: 'card-tags' });
      card.tags.slice(0, 3).forEach(tag => tagsContainer.appendChild(createElement('span', { className: 'tag' }, [tag])));
      if (card.tags.length > 3) tagsContainer.appendChild(createElement('span', { className: 'tag more' }, [`+${card.tags.length - 3}`]));
      cardEl.appendChild(tagsContainer);
    }
    
    const cardFooter = createElement('div', { className: 'card-footer' });
    let hasFooterContent = false;
    
    if (displayOptions.showDueDate && card.dueDate) {
      hasFooterContent = true;
      const dueDateEl = createElement('div', { className: `due-date ${isOverdue(card.dueDate) ? 'overdue' : ''} ${isDueSoon(card.dueDate) ? 'due-soon' : ''}` });
      const calIcon = createElement('span', { className: 'icon' }); 
      setIcon(calIcon, 'calendar');
      dueDateEl.appendChild(calIcon);
      dueDateEl.appendChild(createElement('span', {}, [formatDisplayDate(card.dueDate)]));
      cardFooter.appendChild(dueDateEl);
    }
    
    if (displayOptions.showChecklist && card.checklist.length > 0) {
      hasFooterContent = true;
      const completed = card.checklist.filter(i => i.completed).length;
      const checklistEl = createElement('div', { className: `checklist-progress ${completed === card.checklist.length ? 'complete' : ''}` });
      const checkIcon = createElement('span', { className: 'icon' }); 
      setIcon(checkIcon, 'check-square');
      checklistEl.appendChild(checkIcon);
      checklistEl.appendChild(createElement('span', {}, [`${completed}/${card.checklist.length}`]));
      cardFooter.appendChild(checklistEl);
    }
    
    if (hasFooterContent) cardFooter.appendChild(createElement('div', { className: 'spacer' }));
    
    if (displayOptions.showAssignee && card.assignee.length > 0) {
      hasFooterContent = true;
      const assigneesEl = createElement('div', { className: 'assignees' });
      card.assignee.slice(0, 3).forEach(assignee => {
        const avatar = createElement('div', { className: 'assignee-avatar' });
        avatar.textContent = assignee.charAt(0).toUpperCase();
        avatar.title = assignee;
        assigneesEl.appendChild(avatar);
      });
      if (card.assignee.length > 3) {
        const more = createElement('div', { className: 'assignee-avatar more' });
        more.textContent = `+${card.assignee.length - 3}`;
        assigneesEl.appendChild(more);
      }
      cardFooter.appendChild(assigneesEl);
    }
    
    if (hasFooterContent) cardEl.appendChild(cardFooter);
    return cardEl;
  }

  // ==================== LIST VIEW ====================
  private renderListView(): HTMLElement {
    const board = this.boardService.getBoard();
    const listEl = createElement('div', { className: 'kanban-list-view' });
    const filteredCards = this.boardService.getFilteredCards();
    
    [...board.columns].sort((a, b) => a.order - b.order).forEach(column => {
      const columnCards = filteredCards.filter(c => c.columnId === column.id).sort((a, b) => a.order - b.order);
      const sectionEl = createElement('div', { className: 'list-section' });
      
      const sectionHeader = createElement('div', { className: 'list-section-header' });
      const colorDot = createElement('span', { className: 'color-dot' });
      colorDot.style.backgroundColor = column.color;
      sectionHeader.appendChild(colorDot);
      sectionHeader.appendChild(createElement('span', { className: 'section-title' }, [column.name]));
      sectionHeader.appendChild(createElement('span', { className: 'section-count' }, [`(${columnCards.length})`]));
      sectionEl.appendChild(sectionHeader);
      
      const listItems = createElement('div', { className: 'list-items' });
      columnCards.forEach(card => {
        const itemEl = createElement('div', { className: 'list-item', 'data-card-id': card.id });
        
        const priorityDot = createElement('span', { className: `priority-dot priority-${card.priority}` });
        priorityDot.style.backgroundColor = PRIORITY_COLORS[card.priority];
        itemEl.appendChild(priorityDot);
        
        const title = createElement('span', { className: 'item-title' }, [card.title]);
        title.addEventListener('click', () => this.openCardModal(card));
        itemEl.appendChild(title);
        
        if (card.dueDate) {
          const dueDate = createElement('span', { className: `item-due-date ${isOverdue(card.dueDate) ? 'overdue' : ''}` }, [formatDisplayDate(card.dueDate)]);
          itemEl.appendChild(dueDate);
        }
        
        listItems.appendChild(itemEl);
      });
      sectionEl.appendChild(listItems);
      listEl.appendChild(sectionEl);
    });
    return listEl;
  }

  // ==================== TIMELINE VIEW ====================
  private renderTimelineView(): HTMLElement {
    const board = this.boardService.getBoard();
    const timelineEl = createElement('div', { className: 'kanban-timeline-view horizontal' });
    
    const timelineToolbar = createElement('div', { className: 'timeline-toolbar' });
    
    const viewModeSelector = createElement('div', { className: 'view-mode-selector' });
    (['day', 'week', 'month'] as const).forEach(mode => {
      const btn = createElement('button', { className: `mode-btn ${this.timelineConfig.viewMode === mode ? 'active' : ''}` }, [mode.charAt(0).toUpperCase() + mode.slice(1)]);
      btn.addEventListener('click', () => { this.timelineConfig.viewMode = mode; this.render(); });
      viewModeSelector.appendChild(btn);
    });
    timelineToolbar.appendChild(viewModeSelector);
    
    const groupBySelector = createElement('div', { className: 'group-by-selector' });
    groupBySelector.appendChild(createElement('span', { className: 'group-label' }, ['Group by:']));
    const groupDropdown = createElement('select', { className: 'group-dropdown' }) as HTMLSelectElement;
    ([{ v: 'none', l: 'None' }, { v: 'assignee', l: 'Assignee' }, { v: 'priority', l: 'Priority' }, { v: 'column', l: 'Status' }] as const).forEach(opt => {
      const option = createElement('option', { value: opt.v }, [opt.l]) as HTMLOptionElement;
      if (this.timelineConfig.groupBy === opt.v) option.selected = true;
      groupDropdown.appendChild(option);
    });
    groupDropdown.addEventListener('change', () => { this.timelineConfig.groupBy = groupDropdown.value as any; this.render(); });
    groupBySelector.appendChild(groupDropdown);
    timelineToolbar.appendChild(groupBySelector);
    
    const todayBtn = createElement('button', { className: 'today-btn' }, ['Today']);
    todayBtn.addEventListener('click', () => { 
      const marker = timelineEl.querySelector('.today-marker');
      if (marker) marker.scrollIntoView({ behavior: 'smooth', inline: 'center' });
    });
    timelineToolbar.appendChild(todayBtn);
    timelineEl.appendChild(timelineToolbar);
    
    const filteredCards = this.boardService.getFilteredCards().filter(c => c.dueDate || (c as any).startDate);
    
    if (filteredCards.length === 0) {
      const emptyState = createElement('div', { className: 'empty-state' });
      const emptyIcon = createElement('div', { className: 'empty-icon' }); 
      setIcon(emptyIcon, 'calendar-x');
      emptyState.appendChild(emptyIcon);
      emptyState.appendChild(createElement('h3', {}, ['No cards with dates']));
      emptyState.appendChild(createElement('p', {}, ['Add start or due dates to see cards in timeline.']));
      timelineEl.appendChild(emptyState);
      return timelineEl;
    }
    
    const { dates, startDate } = this.calculateTimelineDates(filteredCards);
    
    const timelineContainer = createElement('div', { className: 'timeline-container' });
    
    const header = createElement('div', { className: 'timeline-header' });
    header.appendChild(createElement('div', { className: 'timeline-sidebar-spacer' }));
    const dateCells = createElement('div', { className: 'timeline-date-cells' });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    dates.forEach(date => {
      const isToday = date.getTime() === today.getTime();
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      const dayCell = createElement('div', { className: `day-cell ${isToday ? 'today' : ''} ${isWeekend ? 'weekend' : ''}` });
      dayCell.style.width = `${this.ganttConfig.cellWidth}px`;
      dayCell.appendChild(createElement('span', { className: 'day-number' }, [date.getDate().toString()]));
      dayCell.appendChild(createElement('span', { className: 'day-name' }, [date.toLocaleString('default', { weekday: 'short' })]));
      if (isToday) dayCell.appendChild(createElement('div', { className: 'today-marker' }));
      dateCells.appendChild(dayCell);
    });
    header.appendChild(dateCells);
    timelineContainer.appendChild(header);
    
    const body = createElement('div', { className: 'timeline-body' });
    const groups = this.groupTimelineCards(filteredCards);
    
    groups.forEach((groupCards, groupName) => {
      const groupEl = createElement('div', { className: 'timeline-group' });
      const groupHeader = createElement('div', { className: 'timeline-group-header' });
      groupHeader.appendChild(createElement('span', { className: 'group-title' }, [groupName]));
      groupHeader.appendChild(createElement('span', { className: 'group-count' }, [`${groupCards.length}`]));
      groupEl.appendChild(groupHeader);
      
      const groupRows = createElement('div', { className: 'timeline-group-rows' });
      groupCards.forEach(card => {
        const row = this.renderTimelineRow(card, dates, startDate);
        groupRows.appendChild(row);
      });
      groupEl.appendChild(groupRows);
      body.appendChild(groupEl);
    });
    
    timelineContainer.appendChild(body);
    timelineEl.appendChild(timelineContainer);
    return timelineEl;
  }

  private calculateTimelineDates(cards: KanbanCard[]): { dates: Date[]; startDate: Date } {
    const now = new Date();
    let minDate = new Date(now), maxDate = new Date(now);
    
    cards.forEach(card => {
      const start = (card as any).startDate ? new Date((card as any).startDate) : null;
      const due = card.dueDate ? new Date(card.dueDate) : null;
      if (start && start < minDate) minDate = new Date(start);
      if (due && due > maxDate) maxDate = new Date(due);
      if (due && !start && due < minDate) minDate = new Date(due);
    });
    
    minDate.setDate(minDate.getDate() - 7);
    maxDate.setDate(maxDate.getDate() + 14);
    
    const dates: Date[] = [];
    const current = new Date(minDate);
    while (current <= maxDate) { 
      dates.push(new Date(current)); 
      current.setDate(current.getDate() + 1); 
    }
    return { dates, startDate: minDate };
  }

  private groupTimelineCards(cards: KanbanCard[]): Map<string, KanbanCard[]> {
    const groups = new Map<string, KanbanCard[]>();
    if (this.timelineConfig.groupBy === 'none') { 
      groups.set('All Cards', cards); 
      return groups; 
    }
    
    cards.forEach(card => {
      let key: string;
      switch (this.timelineConfig.groupBy) {
        case 'assignee': key = card.assignee.length > 0 ? card.assignee[0] : 'Unassigned'; break;
        case 'priority': key = card.priority.charAt(0).toUpperCase() + card.priority.slice(1); break;
        case 'column': const col = this.boardService.getColumn(card.columnId); key = col?.name || 'Unknown'; break;
        default: key = 'All Cards';
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(card);
    });
    return groups;
  }

  private renderTimelineRow(card: KanbanCard, dates: Date[], startDate: Date): HTMLElement {
    const row = createElement('div', { className: 'timeline-row', 'data-card-id': card.id });
    
    const sidebar = createElement('div', { className: 'timeline-row-sidebar' });
    const cardInfo = createElement('div', { className: 'card-info' });
    const priorityDot = createElement('span', { className: `priority-dot priority-${card.priority}` });
    priorityDot.style.backgroundColor = PRIORITY_COLORS[card.priority];
    cardInfo.appendChild(priorityDot);
    const title = createElement('span', { className: 'card-title' }, [card.title]);
    title.addEventListener('click', () => this.openCardModal(card));
    cardInfo.appendChild(title);
    sidebar.appendChild(cardInfo);
    
    if (card.assignee.length > 0) {
      const avatar = createElement('div', { className: 'mini-avatar' });
      avatar.textContent = card.assignee[0].charAt(0).toUpperCase();
      sidebar.appendChild(avatar);
    }
    row.appendChild(sidebar);
    
    const cellsContainer = createElement('div', { className: 'timeline-cells' });
    cellsContainer.style.position = 'relative';
    cellsContainer.style.width = `${dates.length * this.ganttConfig.cellWidth}px`;
    
    const today = new Date(); 
    today.setHours(0, 0, 0, 0);
    dates.forEach(date => {
      const isToday = date.getTime() === today.getTime();
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      const cell = createElement('div', { className: `timeline-cell ${isWeekend ? 'weekend' : ''} ${isToday ? 'today' : ''}` });
      cell.style.width = `${this.ganttConfig.cellWidth}px`;
      cell.style.position = 'relative';
      cellsContainer.appendChild(cell);
    });
    
    const bar = this.renderTimelineBar(card, startDate);
    if (bar) {
      bar.style.position = 'absolute';
      bar.style.top = '12px';
      cellsContainer.appendChild(bar);
    }
    
    row.appendChild(cellsContainer);
    return row;
  }

  private renderTimelineBar(card: KanbanCard, startDate: Date): HTMLElement | null {
    const cardStart = (card as any).startDate ? new Date((card as any).startDate) : (card.dueDate ? new Date(card.dueDate) : null);
    const cardEnd = card.dueDate ? new Date(card.dueDate) : cardStart;
    if (!cardStart || !cardEnd) return null;
    
    const column = this.boardService.getColumn(card.columnId);
    const barColor = card.color || column?.color || '#6366f1';
    
    const startOffset = Math.floor((cardStart.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const duration = Math.max(1, Math.ceil((cardEnd.getTime() - cardStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    
    const bar = createElement('div', { className: `timeline-bar ${card.blocked ? 'blocked' : ''} ${card.completedAt ? 'completed' : ''}`, 'data-card-id': card.id });
    bar.style.left = `${startOffset * this.ganttConfig.cellWidth}px`;
    bar.style.width = `${duration * this.ganttConfig.cellWidth - 8}px`;
    bar.style.backgroundColor = barColor;
    
    if (card.checklist.length > 0) {
      const completed = card.checklist.filter(i => i.completed).length;
      const progress = (completed / card.checklist.length) * 100;
      const progressEl = createElement('div', { className: 'bar-progress' });
      progressEl.style.width = `${progress}%`;
      bar.appendChild(progressEl);
    }
    
    bar.appendChild(createElement('div', { className: 'bar-content' }, [card.title]));
    bar.appendChild(createElement('div', { className: 'resize-handle left' }));
    bar.appendChild(createElement('div', { className: 'resize-handle right' }));
    bar.addEventListener('click', () => this.openCardModal(card));
    
    return bar;
  }

  // ==================== GANTT VIEW ====================
  private renderGanttView(): HTMLElement {
    const board = this.boardService.getBoard();
    const ganttEl = createElement('div', { className: 'kanban-gantt-view' });
    
    const ganttToolbar = createElement('div', { className: 'gantt-toolbar' });
    
    const zoomControls = createElement('div', { className: 'zoom-controls' });
    zoomControls.appendChild(createElement('span', { className: 'zoom-label' }, ['Zoom:']));
    
    (['day', 'week', 'month'] as const).forEach(level => {
      const btn = createElement('button', { className: `zoom-btn ${this.ganttConfig.zoomLevel === level ? 'active' : ''}` }, [level.charAt(0).toUpperCase() + level.slice(1)]);
      btn.addEventListener('click', () => {
        this.ganttConfig.zoomLevel = level;
        this.updateGanttCellWidth();
        this.render();
      });
      zoomControls.appendChild(btn);
    });
    ganttToolbar.appendChild(zoomControls);
    
    const navControls = createElement('div', { className: 'nav-controls' });
    const prevBtn = createElement('button', { className: 'nav-btn' }); 
    setIcon(prevBtn, 'chevron-left');
    prevBtn.addEventListener('click', () => this.navigateGantt('prev'));
    navControls.appendChild(prevBtn);
    
    const todayBtn = createElement('button', { className: 'today-btn' }, ['Today']);
    todayBtn.addEventListener('click', () => this.navigateGantt('today'));
    navControls.appendChild(todayBtn);
    
    const nextBtn = createElement('button', { className: 'nav-btn' }); 
    setIcon(nextBtn, 'chevron-right');
    nextBtn.addEventListener('click', () => this.navigateGantt('next'));
    navControls.appendChild(nextBtn);
    ganttToolbar.appendChild(navControls);
    
    const addTaskBtn = createElement('button', { className: 'add-task-btn' });
    setIcon(addTaskBtn, 'plus');
    addTaskBtn.appendChild(createElement('span', {}, ['Add Task']));
    addTaskBtn.addEventListener('click', () => { 
      if (board.columns[0]) this.quickAddCard(board.columns[0].id); 
    });
    ganttToolbar.appendChild(addTaskBtn);
    ganttEl.appendChild(ganttToolbar);
    
    const filteredCards = this.boardService.getFilteredCards()
      .filter(c => c.dueDate || (c as any).startDate)
      .sort((a, b) => ((a as any).startDate || a.dueDate || '').localeCompare((b as any).startDate || b.dueDate || ''));
    
    if (filteredCards.length === 0) {
      const emptyState = createElement('div', { className: 'empty-state' });
      const emptyIcon = createElement('div', { className: 'empty-icon' }); 
      setIcon(emptyIcon, 'gantt-chart');
      emptyState.appendChild(emptyIcon);
      emptyState.appendChild(createElement('h3', {}, ['No tasks with dates']));
      emptyState.appendChild(createElement('p', {}, ['Add dates to cards to see them in the Gantt chart.']));
      ganttEl.appendChild(emptyState);
      return ganttEl;
    }
    
    this.calculateGanttDateRange(filteredCards);
    
    const ganttContainer = createElement('div', { className: 'gantt-container' });
    
    const sidebar = createElement('div', { className: 'gantt-sidebar' });
    const sidebarHeader = createElement('div', { className: 'gantt-sidebar-header' });
    sidebarHeader.style.height = `${this.ganttConfig.headerHeight}px`;
    sidebarHeader.appendChild(createElement('span', {}, ['Task']));
    sidebar.appendChild(sidebarHeader);
    
    const taskList = createElement('div', { className: 'gantt-task-list' });
    filteredCards.forEach(card => {
      const column = this.boardService.getColumn(card.columnId);
      const taskRow = createElement('div', { className: 'gantt-task-row', 'data-card-id': card.id });
      taskRow.style.height = `${this.ganttConfig.rowHeight}px`;
      
      const taskInfo = createElement('div', { className: 'task-info' });
      const priorityDot = createElement('span', { className: `priority-dot priority-${card.priority}` });
      priorityDot.style.backgroundColor = PRIORITY_COLORS[card.priority];
      taskInfo.appendChild(priorityDot);
      
      if (card.taskType !== 'task') taskInfo.appendChild(createElement('span', { className: 'task-type-icon' }, [TASK_TYPE_ICONS[card.taskType]]));
      
      const title = createElement('span', { className: 'task-title' }, [card.title]);
      title.addEventListener('click', () => this.openCardModal(card));
      taskInfo.appendChild(title);
      taskRow.appendChild(taskInfo);
      
      const statusBadge = createElement('span', { className: 'status-badge' });
      statusBadge.textContent = column?.name || '';
      statusBadge.style.backgroundColor = column?.color || '#94a3b8';
      taskRow.appendChild(statusBadge);
      
      if (card.assignee.length > 0) {
        const avatar = createElement('div', { className: 'mini-avatar' });
        avatar.textContent = card.assignee[0].charAt(0).toUpperCase();
        taskRow.appendChild(avatar);
      }
      taskList.appendChild(taskRow);
    });
    sidebar.appendChild(taskList);
    ganttContainer.appendChild(sidebar);
    
    const chartContainer = createElement('div', { className: 'gantt-chart-container' });
    
    const chartHeader = createElement('div', { className: 'gantt-header' });
    chartHeader.style.height = `${this.ganttConfig.headerHeight}px`;
    
    const { startDate, endDate } = this.ganttConfig;
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    const monthRow = createElement('div', { className: 'gantt-month-row' });
    const dayRow = createElement('div', { className: 'gantt-day-row' });
    
    const current = new Date(startDate);
    let currentMonth = -1;
    let monthStartX = 0;
    
    for (let i = 0; i < totalDays; i++) {
      const month = current.getMonth();
      const dayOfWeek = current.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isToday = this.isToday(current);
      
      if (month !== currentMonth) {
        if (currentMonth !== -1 && monthRow.lastChild) {
          (monthRow.lastChild as HTMLElement).style.width = `${(i - monthStartX) * this.ganttConfig.cellWidth}px`;
        }
        currentMonth = month;
        monthStartX = i;
        const monthEl = createElement('div', { className: 'gantt-month' });
        monthEl.textContent = current.toLocaleString('default', { month: 'short', year: 'numeric' });
        monthRow.appendChild(monthEl);
      }
      
      const dayCell = createElement('div', { className: `gantt-day ${isWeekend ? 'weekend' : ''} ${isToday ? 'today' : ''}` });
      dayCell.style.width = `${this.ganttConfig.cellWidth}px`;
      dayCell.textContent = current.getDate().toString();
      dayRow.appendChild(dayCell);
      
      current.setDate(current.getDate() + 1);
    }
    
    if (monthRow.lastChild) {
      (monthRow.lastChild as HTMLElement).style.width = `${(totalDays - monthStartX) * this.ganttConfig.cellWidth}px`;
    }
    
    chartHeader.appendChild(monthRow);
    chartHeader.appendChild(dayRow);
    chartContainer.appendChild(chartHeader);
    
    const chartBody = createElement('div', { className: 'gantt-body' });
    chartBody.style.minHeight = `${filteredCards.length * this.ganttConfig.rowHeight}px`;
    
    const grid = createElement('div', { className: 'gantt-grid' });
    grid.style.height = `${filteredCards.length * this.ganttConfig.rowHeight}px`;
    
    for (let i = 0; i < totalDays; i++) {
      const gridCol = createElement('div', { className: 'gantt-grid-col' });
      gridCol.style.width = `${this.ganttConfig.cellWidth}px`;
      gridCol.style.height = '100%';
      
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      const isToday = this.isToday(date);
      
      if (isWeekend) gridCol.addClass('weekend');
      if (isToday) gridCol.addClass('today');
      
      grid.appendChild(gridCol);
    }
    chartBody.appendChild(grid);
    
    const todayIndex = Math.floor((new Date().setHours(0, 0, 0, 0) - startDate.getTime()) / (1000 * 60 * 60 * 24));
    if (todayIndex >= 0 && todayIndex < totalDays) {
      const todayLine = createElement('div', { className: 'gantt-today-line' });
      todayLine.style.left = `${todayIndex * this.ganttConfig.cellWidth}px`;
      todayLine.style.height = `${filteredCards.length * this.ganttConfig.rowHeight}px`;
      chartBody.appendChild(todayLine);
    }
    
    const barsContainer = createElement('div', { className: 'gantt-bars' });
    
    filteredCards.forEach((card, index) => {
      const cardStart = (card as any).startDate ? new Date((card as any).startDate) : (card.dueDate ? new Date(card.dueDate) : null);
      const cardEnd = card.dueDate ? new Date(card.dueDate) : cardStart;
      
      if (!cardStart || !cardEnd) return;
      
      const column = this.boardService.getColumn(card.columnId);
      const barColor = card.color || column?.color || '#6366f1';
      
      const startOffset = Math.floor((cardStart.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const duration = Math.max(1, Math.ceil((cardEnd.getTime() - cardStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      
      const bar = createElement('div', { className: `gantt-bar ${card.blocked ? 'blocked' : ''} ${card.completedAt ? 'completed' : ''}` });
      bar.style.left = `${startOffset * this.ganttConfig.cellWidth}px`;
      bar.style.width = `${duration * this.ganttConfig.cellWidth - 8}px`;
      bar.style.top = `${index * this.ganttConfig.rowHeight + 8}px`;
      bar.style.height = `${this.ganttConfig.rowHeight - 16}px`;
      bar.style.backgroundColor = barColor;
      
      const barLabel = createElement('div', { className: 'bar-label' }, [card.title]);
      bar.appendChild(barLabel);
      
      bar.addEventListener('click', () => this.openCardModal(card));
      
      barsContainer.appendChild(bar);
    });
    
    chartBody.appendChild(barsContainer);
    chartContainer.appendChild(chartBody);
    ganttContainer.appendChild(chartContainer);
    ganttEl.appendChild(ganttContainer);
    
    return ganttEl;
  }

  private calculateGanttDateRange(cards: KanbanCard[]): void {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    let minDate = new Date(now);
    let maxDate = new Date(now);
    
    cards.forEach(card => {
      const start = (card as any).startDate ? new Date((card as any).startDate) : null;
      const due = card.dueDate ? new Date(card.dueDate) : null;
      
      if (start) {
        start.setHours(0, 0, 0, 0);
        if (start < minDate) minDate = new Date(start);
      }
      if (due) {
        due.setHours(0, 0, 0, 0);
        if (due > maxDate) maxDate = new Date(due);
        if (!start && due < minDate) minDate = new Date(due);
      }
    });
    
    minDate.setDate(minDate.getDate() - 7);
    maxDate.setDate(maxDate.getDate() + 14);
    
    this.ganttConfig.startDate = minDate;
    this.ganttConfig.endDate = maxDate;
  }

  private updateGanttCellWidth(): void {
    switch (this.ganttConfig.zoomLevel) {
      case 'day': this.ganttConfig.cellWidth = 40; break;
      case 'week': this.ganttConfig.cellWidth = 28; break;
      case 'month': this.ganttConfig.cellWidth = 20; break;
    }
  }

  private navigateGantt(direction: 'prev' | 'next' | 'today'): void {
    if (direction === 'today') {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      this.ganttConfig.startDate = new Date(now);
      this.ganttConfig.startDate.setDate(this.ganttConfig.startDate.getDate() - 7);
      this.ganttConfig.endDate = new Date(now);
      this.ganttConfig.endDate.setDate(this.ganttConfig.endDate.getDate() + 21);
    } else {
      const shift = direction === 'prev' ? -7 : 7;
      this.ganttConfig.startDate.setDate(this.ganttConfig.startDate.getDate() + shift);
      this.ganttConfig.endDate.setDate(this.ganttConfig.endDate.getDate() + shift);
    }
    this.render();
  }

  private isToday(date: Date): boolean {
    const today = new Date();
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  }

  // ==================== ROADMAP VIEW ====================
  private renderRoadmapView(): HTMLElement {
    const board = this.boardService.getBoard();
    const roadmapEl = createElement('div', { className: 'kanban-roadmap-view' });
    
    // Roadmap Toolbar
    const roadmapToolbar = createElement('div', { className: 'roadmap-toolbar' });
    
    const toolbarTitle = createElement('h2', { className: 'toolbar-title' }, ['Roadmap']);
    roadmapToolbar.appendChild(toolbarTitle);
    
    const toolbarActions = createElement('div', { className: 'toolbar-actions' });
    
    const addMilestoneBtn = createElement('button', { className: 'add-milestone-btn' });
    setIcon(addMilestoneBtn, 'plus');
    addMilestoneBtn.appendChild(createElement('span', {}, ['Add Milestone']));
    addMilestoneBtn.addEventListener('click', () => this.addMilestone());
    toolbarActions.appendChild(addMilestoneBtn);
    
    roadmapToolbar.appendChild(toolbarActions);
    roadmapEl.appendChild(roadmapToolbar);
    
    // Milestones Container
    const milestonesContainer = createElement('div', { className: 'milestones-container' });
    
    const sortedMilestones = [...board.milestones].sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
    
    if (sortedMilestones.length === 0) {
      const emptyState = createElement('div', { className: 'empty-state' });
      const emptyIcon = createElement('div', { className: 'empty-icon' });
      setIcon(emptyIcon, 'milestone');
      emptyState.appendChild(emptyIcon);
      emptyState.appendChild(createElement('h3', {}, ['No milestones yet']));
      emptyState.appendChild(createElement('p', {}, ['Create milestones to organize your roadmap']));
      
      const createBtn = createElement('button', { className: 'primary-btn' });
      setIcon(createBtn, 'plus');
      createBtn.appendChild(createElement('span', {}, ['Create First Milestone']));
      createBtn.addEventListener('click', () => this.addMilestone());
      emptyState.appendChild(createBtn);
      
      roadmapEl.appendChild(emptyState);
      return roadmapEl;
    }
    
    sortedMilestones.forEach(milestone => {
      milestonesContainer.appendChild(this.renderMilestoneCard(milestone));
    });
    
    roadmapEl.appendChild(milestonesContainer);
    
    // Unassigned Cards Section
    const unassignedCards = board.cards.filter(card => 
      !board.milestones.some(m => m.cardIds.includes(card.id))
    );
    
    if (unassignedCards.length > 0) {
      const unassignedSection = createElement('div', { className: 'unassigned-cards-section' });
      const sectionHeader = createElement('div', { className: 'section-header' });
      sectionHeader.appendChild(createElement('h4', {}, ['Unassigned Cards']));
      sectionHeader.appendChild(createElement('span', { className: 'card-count' }, [`${unassignedCards.length}`]));
      unassignedSection.appendChild(sectionHeader);
      
      const unassignedCardsList = createElement('div', { className: 'unassigned-cards-list' });
      unassignedCards.slice(0, 20).forEach(card => {
        unassignedCardsList.appendChild(this.renderUnassignedCard(card));
      });
      
      if (unassignedCards.length > 20) {
        const showMore = createElement('div', { className: 'show-more' }, [`+${unassignedCards.length - 20} more cards`]);
        unassignedCardsList.appendChild(showMore);
      }
      
      unassignedSection.appendChild(unassignedCardsList);
      roadmapEl.appendChild(unassignedSection);
    }
    
    return roadmapEl;
  }

  private renderMilestoneCard(milestone: Milestone): HTMLElement {
    const board = this.boardService.getBoard();
    const milestoneCard = createElement('div', { className: `milestone-card ${milestone.completed ? 'completed' : ''}` });
    milestoneCard.style.setProperty('--milestone-color', milestone.color);
    
    // Milestone Header
    const header = createElement('div', { className: 'milestone-header' });
    
    const statusIcon = createElement('div', { className: 'status-icon clickable-icon' });
    setIcon(statusIcon, milestone.completed ? 'check-circle' : 'circle');
    statusIcon.addEventListener('click', () => this.toggleMilestoneCompletion(milestone.id));
    header.appendChild(statusIcon);
    
    const headerContent = createElement('div', { className: 'milestone-header-content' });
    const title = createElement('h3', { className: 'milestone-title' }, [milestone.name]);
    title.addEventListener('click', () => this.editMilestone(milestone));
    headerContent.appendChild(title);
    
    if (milestone.dueDate) {
      const dueDate = createElement('span', { className: `milestone-due-date ${isOverdue(milestone.dueDate) && !milestone.completed ? 'overdue' : ''}` });
      const calIcon = createElement('span', { className: 'icon' });
      setIcon(calIcon, 'calendar');
      dueDate.appendChild(calIcon);
      dueDate.appendChild(createElement('span', {}, [formatDisplayDate(milestone.dueDate)]));
      headerContent.appendChild(dueDate);
    }
    
    header.appendChild(headerContent);
    
    const menuBtn = createElement('button', { className: 'milestone-menu-btn clickable-icon' });
    setIcon(menuBtn, 'more-horizontal');
    menuBtn.addEventListener('click', (e) => this.showMilestoneMenu(milestone, e));
    header.appendChild(menuBtn);
    
    milestoneCard.appendChild(header);
    
    if (milestone.description) {
      const description = createElement('div', { className: 'milestone-description' }, [milestone.description]);
      milestoneCard.appendChild(description);
    }
    
    // Progress Section
    const milestoneCards = milestone.cardIds
      .map(id => board.cards.find(c => c.id === id))
      .filter(c => c !== undefined) as KanbanCard[];
    
    if (milestoneCards.length > 0) {
      const progressSection = createElement('div', { className: 'progress-section' });
      
      const completedCards = milestoneCards.filter(c => c.completedAt).length;
      const progressPercent = (completedCards / milestoneCards.length) * 100;
      
      const progressInfo = createElement('div', { className: 'progress-info' });
      progressInfo.appendChild(createElement('span', { className: 'progress-text' }, [`${completedCards} of ${milestoneCards.length} cards completed`]));
      progressInfo.appendChild(createElement('span', { className: 'progress-percent' }, [`${Math.round(progressPercent)}%`]));
      progressSection.appendChild(progressInfo);
      
      const progressBar = createElement('div', { className: 'progress-bar' });
      const progressFill = createElement('div', { className: 'progress-fill' });
      progressFill.style.width = `${progressPercent}%`;
      progressBar.appendChild(progressFill);
      progressSection.appendChild(progressBar);
      
      milestoneCard.appendChild(progressSection);
      
      // Cards Section
      const cardsSection = createElement('div', { className: 'cards-section' });
      
      const columnGroups = new Map<string, KanbanCard[]>();
      milestoneCards.forEach(card => {
        const columnId = card.columnId;
        if (!columnGroups.has(columnId)) {
          columnGroups.set(columnId, []);
        }
        columnGroups.get(columnId)!.push(card);
      });
      
      board.columns.forEach(column => {
        const cardsInColumn = columnGroups.get(column.id) || [];
        if (cardsInColumn.length === 0) return;
        
        const columnGroup = createElement('div', { className: 'column-group' });
        
        const columnHeaderMini = createElement('div', { className: 'column-header-mini' });
        const colorDot = createElement('span', { className: 'color-dot' });
        colorDot.style.backgroundColor = column.color;
        columnHeaderMini.appendChild(colorDot);
        columnHeaderMini.appendChild(createElement('span', {}, [`${column.name} (${cardsInColumn.length})`]));
        columnGroup.appendChild(columnHeaderMini);
        
        const cardsList = createElement('div', { className: 'cards-list' });
        cardsInColumn.forEach(card => {
          cardsList.appendChild(this.renderRoadmapCardItem(card, milestone.id));
        });
        columnGroup.appendChild(cardsList);
        
        cardsSection.appendChild(columnGroup);
      });
      
      milestoneCard.appendChild(cardsSection);
    }
    
    // Drop Zone for adding cards
    const dropZone = createElement('div', { className: 'milestone-drop-zone' });
    const dropIcon = createElement('span', { className: 'drop-icon' });
    setIcon(dropIcon, 'plus-circle');
    dropZone.appendChild(dropIcon);
    dropZone.appendChild(createElement('span', {}, ['Add cards to this milestone']));
    dropZone.addEventListener('click', () => this.showAddCardsToMilestoneModal(milestone));
    
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });
    
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      // Handle drop logic here
    });
    
    milestoneCard.appendChild(dropZone);
    
    return milestoneCard;
  }

  private renderRoadmapCardItem(card: KanbanCard, milestoneId: string): HTMLElement {
    const column = this.boardService.getColumn(card.columnId);

    const cardItem = createElement('div', {
      className: `roadmap-card-item ${card.completedAt ? 'completed' : ''} ${card.blocked ? 'blocked' : ''}`,
      'data-card-id': card.id,
      draggable: 'true'
    });

    const cardContent = createElement('div', { className: 'card-content' });

    const cardLeft = createElement('div', { className: 'card-left' });

    // RIMOSSO IL CHECKBOX - Ora solo icona indicativa dello stato
    const statusIcon = createElement('div', { className: 'status-icon-roadmap' });
    if (card.completedAt) {
      setIcon(statusIcon, 'check-circle-2');
      statusIcon.addClass('completed');
    } else if (card.blocked) {
      setIcon(statusIcon, 'alert-circle');
      statusIcon.addClass('blocked');
    } else {
      setIcon(statusIcon, 'circle');
    }
    cardLeft.appendChild(statusIcon);

    const cardTitle = createElement('span', { className: 'card-title' }, [card.title]);
    cardTitle.addEventListener('click', () => this.openCardModal(card));
    cardLeft.appendChild(cardTitle);

    cardContent.appendChild(cardLeft);

    const cardBadges = createElement('div', { className: 'card-badges' });

    if (card.priority !== 'none') {
      const priorityBadge = createElement('span', { className: `priority-badge priority-${card.priority}` });
      priorityBadge.style.backgroundColor = hexToRgba(PRIORITY_COLORS[card.priority], 0.2);
      priorityBadge.style.color = PRIORITY_COLORS[card.priority];
      priorityBadge.textContent = card.priority.charAt(0).toUpperCase();
      cardBadges.appendChild(priorityBadge);
    }

    if (card.dueDate) {
      const dueDateBadge = createElement('span', { className: `due-date-badge ${isOverdue(card.dueDate) && !card.completedAt ? 'overdue' : ''}` });
      const calIcon = createElement('span', { className: 'icon' });
      setIcon(calIcon, 'calendar');
      dueDateBadge.appendChild(calIcon);
      dueDateBadge.appendChild(createElement('span', {}, [formatDisplayDate(card.dueDate)]));
      cardBadges.appendChild(dueDateBadge);
    }

    cardContent.appendChild(cardBadges);

    const cardRight = createElement('div', { className: 'card-right' });

    if (card.assignee.length > 0) {
      const avatar = createElement('div', { className: 'mini-avatar' });
      avatar.textContent = card.assignee[0].charAt(0).toUpperCase();
      avatar.title = card.assignee[0];
      cardRight.appendChild(avatar);
    }

    const removeBtn = createElement('button', { className: 'remove-card-btn clickable-icon' });
    setIcon(removeBtn, 'x');
    removeBtn.title = 'Remove from milestone';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.removeCardFromMilestone(milestoneId, card.id);
    });
    cardRight.appendChild(removeBtn);

    cardContent.appendChild(cardRight);
    cardItem.appendChild(cardContent);

    return cardItem;
  }

  private renderUnassignedCard(card: KanbanCard): HTMLElement {
    const column = this.boardService.getColumn(card.columnId);
    
    const cardItem = createElement('div', { 
      className: `unassigned-card-item`,
      'data-card-id': card.id,
      draggable: 'true'
    });
    
    const priorityDot = createElement('span', { className: `priority-dot priority-${card.priority}` });
    priorityDot.style.backgroundColor = PRIORITY_COLORS[card.priority];
    cardItem.appendChild(priorityDot);
    
    const title = createElement('span', { className: 'card-title' }, [card.title]);
    title.addEventListener('click', () => this.openCardModal(card));
    cardItem.appendChild(title);
    
    if (column) {
      const columnBadge = createElement('span', { className: 'column-badge' });
      columnBadge.textContent = column.name;
      columnBadge.style.backgroundColor = column.color;
      cardItem.appendChild(columnBadge);
    }
    
    return cardItem;
  }

  // Milestone Actions
  private addMilestone(): void {
    new MilestoneEditModal(this.app, null, (data) => {
      const board = this.boardService.getBoard();
      const newMilestone: Milestone = {
        id: generateId(),
        name: data.name,
        description: data.description,
        dueDate: data.dueDate,
        color: data.color,
        completed: false,
        order: board.milestones.length,
        cardIds: []
      };
      board.milestones.push(newMilestone);
      this.render();
      this.saveBoard();
      new Notice(`✅ Milestone "${data.name}" created`, 2000);
    }).open();
  }

  private editMilestone(milestone: Milestone): void {
    new MilestoneEditModal(this.app, milestone, (data) => {
      Object.assign(milestone, data);
      this.render();
      this.saveBoard();
      new Notice(`✅ Milestone updated`, 2000);
    }).open();
  }

  private toggleMilestoneCompletion(milestoneId: string): void {
    const board = this.boardService.getBoard();
    const milestone = board.milestones.find(m => m.id === milestoneId);
    if (milestone) {
      milestone.completed = !milestone.completed;
      this.render();
      this.saveBoard();
    }
  }

  private removeCardFromMilestone(milestoneId: string, cardId: string): void {
    const board = this.boardService.getBoard();
    const milestone = board.milestones.find(m => m.id === milestoneId);
    if (milestone) {
      milestone.cardIds = milestone.cardIds.filter(id => id !== cardId);
      this.render();
      this.saveBoard();
    }
  }

  private showMilestoneMenu(milestone: Milestone, event: MouseEvent): void {
    const menu = new Menu();
    
    menu.addItem((item) =>
      item
        .setTitle('Edit')
        .setIcon('pencil')
        .onClick(() => this.editMilestone(milestone))
    );
    
    menu.addItem((item) =>
      item
        .setTitle('Change color')
        .setIcon('palette')
        .onClick(() => {
          new ColorPickerModal(this.app, milestone.color, (color) => {
            milestone.color = color;
            this.render();
            this.saveBoard();
          }).open();
        })
    );
    
    menu.addSeparator();
    
    menu.addItem((item) =>
      item
        .setTitle('Delete')
        .setIcon('trash')
        .onClick(() => {
          new ConfirmModal(
            this.app,
            'Delete Milestone',
            `Are you sure you want to delete "${milestone.name}"?`,
            () => {
              const board = this.boardService.getBoard();
              board.milestones = board.milestones.filter(m => m.id !== milestone.id);
              this.render();
              this.saveBoard();
              new Notice(`✅ Milestone deleted`, 2000);
            }
          ).open();
        })
    );
    
    menu.showAtMouseEvent(event);
  }

  private showAddCardsToMilestoneModal(milestone: Milestone): void {
    new AddCardsToMilestoneModal(this.app, this.boardService, milestone, () => {
      this.render();
      this.saveBoard();
    }).open();
  }


  // ==================== INTERACTION HANDLERS ====================

  private showFilterModal(): void {
    new FilterModal(this.app, this.boardService, () => {
      this.render();
      this.saveBoard();
    }).open();
  }

  private showAnalyticsModal(): void {
    new AnalyticsModal(this.app, this.boardService).open();
  }

  private showAutomationsModal(): void {
    new AutomationsModal(this.app, this.boardService, () => {
      this.saveBoard();
    }).open();
  }

  private showSettingsModal(): void {
    new BoardSettingsModal(this.app, this.boardService, () => {
      this.render();
      this.saveBoard();
    }).open();
  }

  private openCardModal(card: KanbanCard): void {
    new CardDetailModal(
      this.app,
      this.plugin,
      card,
      this.boardService,
      () => {
        this.render();
        this.saveBoard();
      }
    ).open();
  }

  private editBoardName(): void {
    const board = this.boardService.getBoard();
    const modal = new TextInputModal(
      this.app,
      'Rename Board',
      'Board name',
      board.name,
      (value) => {
        if (value.trim()) {
          this.boardService.updateBoard({ name: value.trim() });
          this.render();
          this.saveBoard();
          new Notice(`✓ Board renamed to "${value.trim()}"`, 2000);
        }
      }
    );
    modal.open();
  }

  private quickAddCard(columnId: string, swimLaneId?: string): void {
    const modal = new QuickAddCardModal(
      this.app,
      (title) => {
        const card = this.boardService.addCard(columnId, {
          title,
          swimLaneId
        });
        this.render();
        this.saveBoard();
        new Notice(`✅ Card "${title}" created`, 2000);
      }
    );
    modal.open();
  }

  private showColumnMenu(column: KanbanColumn, event: MouseEvent): void {
    const menu = new Menu();
    
    menu.addItem((item) =>
      item
        .setTitle('Rename')
        .setIcon('pencil')
        .onClick(() => this.editColumnName(column))
    );
    
    menu.addItem((item) =>
      item
        .setTitle('Change color')
        .setIcon('palette')
        .onClick(() => {
          new ColorPickerModal(this.app, column.color, (color) => {
            this.boardService.updateColumn(column.id, { color });
            this.render();
            this.saveBoard();
          }).open();
        })
    );
    
    menu.addItem((item) =>
      item
        .setTitle('Set WIP limit')
        .setIcon('alert-circle')
        .onClick(() => this.setWipLimit(column))
    );
    
    menu.addSeparator();
    
    menu.addItem((item) =>
      item
        .setTitle('Delete')
        .setIcon('trash')
        .onClick(() => {
          new ConfirmModal(
            this.app,
            'Delete Column',
            `Are you sure you want to delete "${column.name}" and all its cards?`,
            () => {
              this.boardService.deleteColumn(column.id);
              this.render();
              this.saveBoard();
              new Notice(`✅ Column "${column.name}" deleted`, 2000);
            }
          ).open();
        })
    );
    
    menu.showAtMouseEvent(event);
  }

  private showSwimLaneMenu(lane: SwimLane, event: MouseEvent): void {
    const menu = new Menu();
    
    menu.addItem((item) =>
      item
        .setTitle('Rename')
        .setIcon('pencil')
        .onClick(() => this.editSwimLaneName(lane))
    );
    
    menu.addItem((item) =>
      item
        .setTitle('Change color')
        .setIcon('palette')
        .onClick(() => {
          new ColorPickerModal(this.app, lane.color, (color) => {
            this.boardService.updateSwimLane(lane.id, { color });
            this.render();
            this.saveBoard();
          }).open();
        })
    );
    
    menu.addSeparator();
    
    menu.addItem((item) =>
      item
        .setTitle('Delete')
        .setIcon('trash')
        .onClick(() => {
          new ConfirmModal(
            this.app,
            'Delete Swim Lane',
            `Are you sure you want to delete "${lane.name}"?`,
            () => {
              this.boardService.deleteSwimLane(lane.id);
              this.render();
              this.saveBoard();
              new Notice(`✅ Swim lane "${lane.name}" deleted`, 2000);
            }
          ).open();
        })
    );
    
    menu.showAtMouseEvent(event);
  }

  private editColumnName(column: KanbanColumn): void {
    new TextInputModal(
      this.app,
      'Rename Column',
      'Column name',
      column.name,
      (value) => {
        this.boardService.updateColumn(column.id, { name: value });
        this.render();
        this.saveBoard();
        new Notice(`✅ Column renamed to "${value}"`, 2000);
      }
    ).open();
  }

  private editSwimLaneName(lane: SwimLane): void {
    new TextInputModal(
      this.app,
      'Rename Swim Lane',
      'Swim lane name',
      lane.name,
      (value) => {
        this.boardService.updateSwimLane(lane.id, { name: value });
        this.render();
        this.saveBoard();
        new Notice(`✅ Swim lane renamed to "${value}"`, 2000);
      }
    ).open();
  }

  private setWipLimit(column: KanbanColumn): void {
    new TextInputModal(
      this.app,
      'Set WIP Limit',
      'Maximum cards in progress',
      column.wipLimit?.toString() || '',
      (value) => {
        const limit = parseInt(value);
        if (isNaN(limit) || limit < 0) {
          new Notice('⚠️ Please enter a valid number', 2000);
          return;
        }
        this.boardService.updateColumn(column.id, { wipLimit: limit || null });
        this.render();
        this.saveBoard();
        new Notice(`✅ WIP limit set to ${limit}`, 2000);
      }
    ).open();
  }

  private addColumn(): void {
    new TextInputModal(
      this.app,
      'Add Column',
      'Column name',
      '',
      (value) => {
        this.boardService.addColumn(value);
        this.render();
        this.saveBoard();
        new Notice(`✅ Column "${value}" created`, 2000);
      }
    ).open();
  }

  private hasActiveFilters(): boolean {
    const filters = this.boardService.getBoard().filters;
    return !!(
      filters.searchQuery ||
      filters.assignees.length > 0 ||
      filters.priorities.length > 0 ||
      filters.tags.length > 0 ||
      !filters.showCompleted ||
      !filters.showBlocked
    );
  }

  async saveBoard(): Promise<void> {
    if (this.filePath) {
      await this.plugin.updateBoardFile(this.filePath, this.boardService.getBoard());
    }
  }


  // ==================== DRAG AND DROP ====================
  
  private setupDragAndDrop(): void {
    if (this.currentView === 'roadmap') {
      this.setupRoadmapDragAndDrop();
      return;
    }

    if (this.currentView !== 'board') return;

    const boardEl = this.contentEl.querySelector('.kanban-board');
    if (!boardEl) return;

    // ==================== COLUMN DRAG & DROP ====================
    const columns = boardEl.querySelectorAll('.kanban-column');

    columns.forEach(columnEl => {
      const element = columnEl as HTMLElement;
      const columnHeader = element.querySelector('.column-header') as HTMLElement;

      if (!columnHeader) return;

      // Make column header draggable
      columnHeader.draggable = true;
      columnHeader.style.cursor = 'grab';

      columnHeader.addEventListener('dragstart', (e: DragEvent) => {
        if (!e.dataTransfer) return;

        const columnId = element.dataset.columnId;
        if (!columnId) return;

        this.draggedColumn = element;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', columnId);
        e.dataTransfer.setData('type', 'column');

        element.addClass('dragging-column');
        columnHeader.style.cursor = 'grabbing';

        // Create drag ghost
        const dragGhost = element.cloneNode(true) as HTMLElement;
        dragGhost.style.opacity = '0.5';
        dragGhost.style.position = 'absolute';
        dragGhost.style.top = '-9999px';
        document.body.appendChild(dragGhost);
        e.dataTransfer.setDragImage(dragGhost, 0, 0);
        setTimeout(() => dragGhost.remove(), 0);
      });

      columnHeader.addEventListener('dragend', () => {
        element.removeClass('dragging-column');
        columnHeader.style.cursor = 'grab';
        this.draggedColumn = null;

        // Remove all drop indicators
        columns.forEach(col => {
          (col as HTMLElement).removeClass('drag-over-left', 'drag-over-right');
        });
      });

      // Column drop zones
      element.addEventListener('dragover', (e: DragEvent) => {
        e.preventDefault();
        if (!e.dataTransfer) return;

        const type = e.dataTransfer.types.includes('type') ? 'column' : 'card';
        if (type !== 'column') return;

        if (this.draggedColumn === element) return;

        e.dataTransfer.dropEffect = 'move';

        // Determine drop position (left or right)
        const rect = element.getBoundingClientRect();
        const midpoint = rect.left + rect.width / 2;

        columns.forEach(col => {
          (col as HTMLElement).removeClass('drag-over-left', 'drag-over-right');
        });

        if (e.clientX < midpoint) {
          element.addClass('drag-over-left');
        } else {
          element.addClass('drag-over-right');
        }
      });

      element.addEventListener('dragleave', () => {
        element.removeClass('drag-over-left', 'drag-over-right');
      });

      element.addEventListener('drop', (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!e.dataTransfer) return;

        const type = e.dataTransfer.getData('type');
        if (type !== 'column') return;

        element.removeClass('drag-over-left', 'drag-over-right');

        const draggedColumnId = e.dataTransfer.getData('text/plain');
        const targetColumnId = element.dataset.columnId;

        if (!draggedColumnId || !targetColumnId || draggedColumnId === targetColumnId) return;

        const draggedColumn = this.boardService.getColumn(draggedColumnId);
        const targetColumn = this.boardService.getColumn(targetColumnId);

        if (!draggedColumn || !targetColumn) return;

        // Determine if dropping before or after
        const rect = element.getBoundingClientRect();
        const midpoint = rect.left + rect.width / 2;
        const dropBefore = e.clientX < midpoint;

        const newOrder = dropBefore ? targetColumn.order : targetColumn.order + 1;

        // Move column
        this.boardService.moveColumn(draggedColumnId, newOrder);
        this.render();
        this.saveBoard();

        new Notice('✓ Column moved', 1500);
      });
    });

    // ==================== CARD DRAG & DROP (existing code) ====================
    const cards = boardEl.querySelectorAll('.kanban-card');

    cards.forEach(cardEl => {
      const element = cardEl as HTMLElement;

      element.addEventListener('dragstart', (e: DragEvent) => {
        if (!e.dataTransfer) return;

        const cardId = element.dataset.cardId;
        if (!cardId) return;

        this.draggedCard = element;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', cardId);
        e.dataTransfer.setData('type', 'card');

        element.addClass('dragging');

        setTimeout(() => {
          element.style.opacity = '0.4';
        }, 0);
      });

      element.addEventListener('dragend', () => {
        element.removeClass('dragging');
        element.style.opacity = '1';
        this.draggedCard = null;
      });
    });

    // Column content drop zones for cards
    const columnContents = boardEl.querySelectorAll('.column-content');

    columnContents.forEach(contentEl => {
      const element = contentEl as HTMLElement;

      element.addEventListener('dragover', (e: DragEvent) => {
        e.preventDefault();
        if (!e.dataTransfer) return;

        const type = e.dataTransfer.getData('type') || 'card';
        if (type !== 'card') return;

        e.dataTransfer.dropEffect = 'move';

        const afterElement = this.getDragAfterElement(element, e.clientY);
        const draggable = this.draggedCard;

        if (!draggable) return;

        if (afterElement == null) {
          element.appendChild(draggable);
        } else {
          element.insertBefore(draggable, afterElement);
        }
      });

      element.addEventListener('drop', (e: DragEvent) => {
        e.preventDefault();

        if (!e.dataTransfer) return;

        const type = e.dataTransfer.getData('type') || 'card';
        if (type !== 'card') return;

        const cardId = e.dataTransfer.getData('text/plain');
        const columnId = element.dataset.columnId;
        const swimLaneId = element.dataset.swimLaneId;

        if (!cardId || !columnId) return;

        const cards = Array.from(element.querySelectorAll('.kanban-card:not(.dragging)'));
        const newOrder = cards.length;

        this.boardService.moveCard(cardId, columnId, newOrder, swimLaneId || undefined);
        this.render();
        this.saveBoard();
      });
    });
  }

  private setupRoadmapDragAndDrop(): void {
  const roadmapEl = this.contentEl.querySelector('.kanban-roadmap-view');
  if (!roadmapEl) return;

  // Setup draggable cards (both assigned and unassigned)
  const draggableCards = roadmapEl.querySelectorAll('.roadmap-card-item, .unassigned-card-item');
  
  draggableCards.forEach(cardEl => {
    const element = cardEl as HTMLElement;
    
    element.addEventListener('dragstart', (e: DragEvent) => {
      if (!e.dataTransfer) return;
      
      const cardId = element.dataset.cardId;
      if (!cardId) return;
      
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', cardId);
      element.addClass('dragging');
      
      // Create drag image
      const dragImage = element.cloneNode(true) as HTMLElement;
      dragImage.style.opacity = '0.8';
      dragImage.style.transform = 'rotate(3deg)';
      document.body.appendChild(dragImage);
      dragImage.style.position = 'absolute';
      dragImage.style.top = '-9999px';
      e.dataTransfer.setDragImage(dragImage, 0, 0);
      setTimeout(() => dragImage.remove(), 0);
    });
    
    element.addEventListener('dragend', () => {
      element.removeClass('dragging');
    });
  });

  // Setup drop zones on milestone cards
  const milestoneCards = roadmapEl.querySelectorAll('.milestone-card');
  
  milestoneCards.forEach(milestoneEl => {
    const element = milestoneEl as HTMLElement;
    const milestoneId = this.getMilestoneIdFromElement(element);
    if (!milestoneId) return;

    // Drop zone area
    const dropZone = element.querySelector('.milestone-drop-zone');
    const cardsSection = element.querySelector('.cards-section');
    
    [dropZone, cardsSection].forEach(zone => {
      if (!zone) return;
      const zoneEl = zone as HTMLElement;
      
      zoneEl.addEventListener('dragover', (e: DragEvent) => {
        e.preventDefault();
        if (!e.dataTransfer) return;
        e.dataTransfer.dropEffect = 'move';
        zoneEl.addClass('drag-over');
      });
      
      zoneEl.addEventListener('dragleave', (e: DragEvent) => {
        const rect = zoneEl.getBoundingClientRect();
        const x = e.clientX;
        const y = e.clientY;
        
        // Check if we're actually leaving the element
        if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
          zoneEl.removeClass('drag-over');
        }
      });
      
      zoneEl.addEventListener('drop', (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        zoneEl.removeClass('drag-over');
        
        if (!e.dataTransfer) return;
        const cardId = e.dataTransfer.getData('text/plain');
        if (!cardId) return;
        
        this.addCardToMilestone(milestoneId, cardId);
      });
    });
  });

  // Setup drop zone for unassigned section (remove from milestone)
  const unassignedSection = roadmapEl.querySelector('.unassigned-cards-section');
  if (unassignedSection) {
    const sectionEl = unassignedSection as HTMLElement;
    
    sectionEl.addEventListener('dragover', (e: DragEvent) => {
      e.preventDefault();
      if (!e.dataTransfer) return;
      e.dataTransfer.dropEffect = 'move';
      sectionEl.addClass('drag-over');
    });
    
    sectionEl.addEventListener('dragleave', () => {
      sectionEl.removeClass('drag-over');
    });
    
    sectionEl.addEventListener('drop', (e: DragEvent) => {
      e.preventDefault();
      sectionEl.removeClass('drag-over');
      
      if (!e.dataTransfer) return;
      const cardId = e.dataTransfer.getData('text/plain');
      if (!cardId) return;
      
      // Remove card from all milestones
      const board = this.boardService.getBoard();
      board.milestones.forEach(milestone => {
        milestone.cardIds = milestone.cardIds.filter(id => id !== cardId);
      });
      
      this.render();
      this.saveBoard();
      new Notice('✓ Card removed from milestone', 2000);
    });
  }
}

private getMilestoneIdFromElement(element: HTMLElement): string | null {
  // Try to find milestone ID from data attribute or by searching parent elements
  let current: HTMLElement | null = element;
  while (current) {
    if (current.classList.contains('milestone-card')) {
      // Find milestone by matching card structure
      const titleEl = current.querySelector('.milestone-title');
      if (titleEl) {
        const title = titleEl.textContent;
        const board = this.boardService.getBoard();
        const milestone = board.milestones.find(m => m.name === title);
        return milestone?.id || null;
      }
    }
    current = current.parentElement;
  }
  return null;
}

private addCardToMilestone(milestoneId: string, cardId: string): void {
  const board = this.boardService.getBoard();
  const milestone = board.milestones.find(m => m.id === milestoneId);
  
  if (!milestone) {
    new Notice('⚠️ Milestone not found', 2000);
    return;
  }
  
  // Remove card from other milestones first
  board.milestones.forEach(m => {
    m.cardIds = m.cardIds.filter(id => id !== cardId);
  });
  
  // Add to target milestone if not already there
  if (!milestone.cardIds.includes(cardId)) {
    milestone.cardIds.push(cardId);
    this.render();
    this.saveBoard();
    new Notice(`✓ Card added to "${milestone.name}"`, 2000);
  }
}

  private getDragAfterElement(container: HTMLElement, y: number): HTMLElement | null {
    const draggableElements = Array.from(
      container.querySelectorAll('.kanban-card:not(.dragging)')
    ) as HTMLElement[];

    return draggableElements.reduce<{ offset: number; element: HTMLElement | null }>(
      (closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;

        if (offset < 0 && offset > closest.offset) {
          return { offset: offset, element: child };
        } else {
          return closest;
        }
      },
      { offset: Number.NEGATIVE_INFINITY, element: null }
    ).element;
  }
}

// ============================================
// MODAL COMPONENTS
// ============================================

class TextInputModal extends Modal {
  private title: string;
  private label: string;
  private defaultValue: string;
  private onSubmit: (value: string) => void;

  constructor(app: App, title: string, label: string, defaultValue: string, onSubmit: (value: string) => void) {
    super(app);
    this.title = title;
    this.label = label;
    this.defaultValue = defaultValue;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kanban-text-input-modal');
    
    contentEl.createEl('h2', { text: this.title });
    
    const inputContainer = contentEl.createDiv({ cls: 'input-container' });
    
    new Setting(inputContainer)
      .setName(this.label)
      .addText(text => {
        text
          .setPlaceholder(`Enter ${this.label.toLowerCase()}`)
          .setValue(this.defaultValue)
          .onChange(value => {
            this.defaultValue = value;
          });
        
        text.inputEl.addClass('modern-input');
        text.inputEl.focus();
        text.inputEl.select();
        
        text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.submit();
          }
        });
      });

    const buttonContainer = contentEl.createDiv({ cls: 'button-container' });
    
    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel', cls: 'cancel-btn' });
    cancelBtn.addEventListener('click', () => this.close());
    
    const submitBtn = buttonContainer.createEl('button', { text: 'Save', cls: 'submit-btn' });
    submitBtn.addEventListener('click', () => this.submit());
  }

  private submit(): void {
    if (this.defaultValue.trim()) {
      this.onSubmit(this.defaultValue.trim());
      this.close();
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class QuickAddCardModal extends Modal {
  private onSubmit: (title: string) => void;
  private titleValue: string = '';

  constructor(app: App, onSubmit: (title: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kanban-quick-add-modal');
    
    contentEl.createEl('h2', { text: '✨ Quick Add Card' });
    
    const inputContainer = contentEl.createDiv({ cls: 'quick-add-container' });
    
    const input = inputContainer.createEl('input', {
      type: 'text',
      placeholder: 'Enter card title...',
      cls: 'quick-add-input'
    });
    
    input.focus();
    
    input.addEventListener('input', (e) => {
      this.titleValue = (e.target as HTMLInputElement).value;
    });
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.titleValue.trim()) {
        e.preventDefault();
        this.submit();
      } else if (e.key === 'Escape') {
        this.close();
      }
    });

    const hint = inputContainer.createDiv({ cls: 'hint-text' });
    hint.textContent = 'Press Enter to create, Esc to cancel';
  }

  private submit(): void {
    if (this.titleValue.trim()) {
      this.onSubmit(this.titleValue.trim());
      this.close();
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class NumberInputModal extends Modal {
  private title: string;
  private label: string;
  private defaultValue: number;
  private onSubmit: (value: number) => void;

  constructor(app: App, title: string, label: string, defaultValue: number, onSubmit: (value: number) => void) {
    super(app);
    this.title = title;
    this.label = label;
    this.defaultValue = defaultValue;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kanban-number-input-modal');
    
    contentEl.createEl('h2', { text: this.title });
    
    new Setting(contentEl)
      .setName(this.label)
      .addText(text => {
        text
          .setPlaceholder('0')
          .setValue(this.defaultValue.toString())
          .onChange(value => {
            const num = parseInt(value);
            if (!isNaN(num)) {
              this.defaultValue = num;
            }
          });
        
        text.inputEl.type = 'number';
        text.inputEl.min = '0';
        text.inputEl.addClass('modern-input');
        text.inputEl.focus();
        text.inputEl.select();
        
        text.inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.submit();
          }
        });
      });

    const buttonContainer = contentEl.createDiv({ cls: 'button-container' });
    
    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel', cls: 'cancel-btn' });
    cancelBtn.addEventListener('click', () => this.close());
    
    const submitBtn = buttonContainer.createEl('button', { text: 'Save', cls: 'submit-btn' });
    submitBtn.addEventListener('click', () => this.submit());
  }

  private submit(): void {
    this.onSubmit(this.defaultValue);
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class ColorPickerModal extends Modal {
  private currentColor: string;
  private onSubmit: (color: string) => void;
  private presetColors = [
    '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
    '#f97316', '#f59e0b', '#eab308', '#84cc16',
    '#22c55e', '#10b981', '#14b8a6', '#06b6d4',
    '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6',
    '#94a3b8', '#64748b', '#475569', '#1e293b'
  ];

  constructor(app: App, currentColor: string, onSubmit: (color: string) => void) {
    super(app);
    this.currentColor = currentColor;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kanban-color-picker-modal');
    
    contentEl.createEl('h2', { text: '🎨 Choose Color' });
    
    const previewContainer = contentEl.createDiv({ cls: 'color-preview-container' });
    const preview = previewContainer.createDiv({ cls: 'color-preview' });
    preview.style.backgroundColor = this.currentColor;
    
    const colorGrid = contentEl.createDiv({ cls: 'color-grid' });
    
    this.presetColors.forEach(color => {
      const colorBtn = colorGrid.createDiv({ cls: 'color-swatch' });
      colorBtn.style.backgroundColor = color;
      
      if (color === this.currentColor) {
        colorBtn.addClass('selected');
      }
      
      colorBtn.addEventListener('click', () => {
        this.currentColor = color;
        preview.style.backgroundColor = color;
        
        colorGrid.querySelectorAll('.color-swatch').forEach(el => {
          el.removeClass('selected');
        });
        colorBtn.addClass('selected');
      });
    });

    const buttonContainer = contentEl.createDiv({ cls: 'button-container' });
    
    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel', cls: 'cancel-btn' });
    cancelBtn.addEventListener('click', () => this.close());
    
    const submitBtn = buttonContainer.createEl('button', { text: 'Apply', cls: 'submit-btn' });
    submitBtn.addEventListener('click', () => {
      this.onSubmit(this.currentColor);
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class ConfirmModal extends Modal {
  private title: string;
  private message: string;
  private onConfirm: () => void;

  constructor(app: App, title: string, message: string, onConfirm: () => void) {
    super(app);
    this.title = title;
    this.message = message;
    this.onConfirm = onConfirm;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kanban-confirm-modal');
    
    contentEl.createEl('h2', { text: this.title });
    contentEl.createEl('p', { text: this.message, cls: 'confirm-message' });

    const buttonContainer = contentEl.createDiv({ cls: 'button-container' });
    
    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel', cls: 'cancel-btn' });
    cancelBtn.addEventListener('click', () => this.close());
    
    const confirmBtn = buttonContainer.createEl('button', { text: 'Confirm', cls: 'danger-btn' });
    confirmBtn.addEventListener('click', () => {
      this.onConfirm();
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class SuggesterModal extends Modal {
  private items: { display: string; value: string }[];
  private onSelect: (selected: { display: string; value: string } | null) => void;
  private title: string;
  private selectedIndex: number = 0;
  private filteredItems: { display: string; value: string }[] = [];

  constructor(
    app: App,
    items: { display: string; value: string }[],
    onSelect: (selected: { display: string; value: string } | null) => void,
    title: string = 'Select an item'
  ) {
    super(app);
    this.items = items;
    this.onSelect = onSelect;
    this.title = title;
    this.filteredItems = [...items];
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kanban-suggester-modal');
    
    contentEl.createEl('h2', { text: this.title });
    
    const searchContainer = contentEl.createDiv({ cls: 'search-container' });
    const searchInput = searchContainer.createEl('input', {
      type: 'text',
      placeholder: 'Type to search...',
      cls: 'suggester-search-input'
    });
    
    const resultsList = contentEl.createDiv({ cls: 'suggester-results' });
    
    const renderResults = () => {
      resultsList.empty();
      this.selectedIndex = 0;
      
      if (this.filteredItems.length === 0) {
        resultsList.createDiv({ cls: 'no-results', text: 'No results found' });
        return;
      }
      
      this.filteredItems.forEach((item, index) => {
        const itemEl = resultsList.createDiv({ 
          cls: `suggester-item ${index === this.selectedIndex ? 'selected' : ''}` 
        });
        itemEl.textContent = item.display;
        
        itemEl.addEventListener('click', () => {
          this.onSelect(item);
          this.close();
        });
        
        itemEl.addEventListener('mouseenter', () => {
          resultsList.querySelectorAll('.suggester-item').forEach(el => el.removeClass('selected'));
          itemEl.addClass('selected');
          this.selectedIndex = index;
        });
      });
    };
    
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.toLowerCase();
      this.filteredItems = this.items.filter(item => 
        item.display.toLowerCase().includes(query)
      );
      renderResults();
    });
    
    searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.filteredItems.length - 1);
        this.updateSelection(resultsList);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.updateSelection(resultsList);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (this.filteredItems.length > 0) {
          this.onSelect(this.filteredItems[this.selectedIndex]);
          this.close();
        }
      } else if (e.key === 'Escape') {
        this.close();
      }
    });
    
    renderResults();
    searchInput.focus();
  }
  
  private updateSelection(resultsList: HTMLElement): void {
    resultsList.querySelectorAll('.suggester-item').forEach((el, index) => {
      if (index === this.selectedIndex) {
        el.addClass('selected');
        el.scrollIntoView({ block: 'nearest' });
      } else {
        el.removeClass('selected');
      }
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class DatePickerModal extends Modal {
  private currentDate: string | null;
  private onSubmit: (date: string | null) => void;

  constructor(app: App, currentDate: string | null, onSubmit: (date: string | null) => void) {
    super(app);
    this.currentDate = currentDate;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kanban-date-picker-modal');
    
    contentEl.createEl('h2', { text: 'Set Due Date' });
    
    new Setting(contentEl)
      .setName('Due date')
      .addText(text => {
        text.inputEl.type = 'date';
        text.setValue(this.currentDate?.split('T')[0] || '');
        text.onChange(value => {
          this.currentDate = value ? new Date(value).toISOString() : null;
        });
        text.inputEl.focus();
      });

    const buttonContainer = contentEl.createDiv({ cls: 'button-container' });
    
    const clearBtn = buttonContainer.createEl('button', { text: 'Clear', cls: 'cancel-btn' });
    clearBtn.addEventListener('click', () => {
      this.onSubmit(null);
      this.close();
    });
    
    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel', cls: 'cancel-btn' });
    cancelBtn.addEventListener('click', () => this.close());
    
    const submitBtn = buttonContainer.createEl('button', { text: 'Set Date', cls: 'submit-btn' });
    submitBtn.addEventListener('click', () => {
      this.onSubmit(this.currentDate);
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class CardDetailModal extends Modal {
  private card: KanbanCard;
  private boardService: BoardService;
  private plugin: KanbanProPlugin;
  private onSave: () => void;
  private contentContainer: HTMLElement;

  constructor(
    app: App,
    plugin: KanbanProPlugin,
    card: KanbanCard,
    boardService: BoardService,
    onSave: () => void
  ) {
    super(app);
    this.card = card;
    this.boardService = boardService;
    this.plugin = plugin;
    this.onSave = onSave;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('kanban-card-detail-modal-premium');

    // Modal Header
    const header = contentEl.createDiv({ cls: 'modal-header-premium' });
    
    const headerTop = header.createDiv({ cls: 'header-top' });
    
    // Task Type Selector
    const taskTypeBtn = headerTop.createDiv({ cls: 'task-type-selector' });
    const taskTypeIcon = taskTypeBtn.createSpan({ cls: 'task-type-icon' });
    taskTypeIcon.textContent = TASK_TYPE_ICONS[this.card.taskType];
    const taskTypeName = taskTypeBtn.createSpan({ cls: 'task-type-name' });
    taskTypeName.textContent = this.card.taskType.charAt(0).toUpperCase() + this.card.taskType.slice(1);
    taskTypeBtn.addEventListener('click', () => this.showTaskTypeMenu(taskTypeBtn));

    // Close Button
    const closeBtn = headerTop.createEl('button', { cls: 'modal-close-btn' });
    setIcon(closeBtn, 'x');
    closeBtn.addEventListener('click', () => this.close());

    // Title Input
    const titleInput = header.createEl('input', {
      cls: 'card-title-input-premium',
      type: 'text',
      value: this.card.title,
      placeholder: 'Card title...'
    });
    titleInput.addEventListener('input', debounce(() => {
      this.card.title = titleInput.value;
      this.save();
    }, 500));

    // Properties Bar
    const propertiesBar = header.createDiv({ cls: 'properties-bar' });
    
    // Status Badge
    const column = this.boardService.getColumn(this.card.columnId);
    if (column) {
      const statusBadge = propertiesBar.createDiv({ cls: 'property-badge status-badge' });
      const statusDot = statusBadge.createSpan({ cls: 'status-dot' });
      statusDot.style.backgroundColor = column.color;
      statusBadge.createSpan({ text: column.name });
      statusBadge.addEventListener('click', () => this.showColumnSelector(statusBadge));
    }

    // Priority Badge
    const priorityBadge = propertiesBar.createDiv({ cls: `property-badge priority-badge priority-${this.card.priority}` });
    priorityBadge.style.backgroundColor = hexToRgba(PRIORITY_COLORS[this.card.priority], 0.15);
    priorityBadge.style.color = PRIORITY_COLORS[this.card.priority];
    priorityBadge.style.borderColor = hexToRgba(PRIORITY_COLORS[this.card.priority], 0.3);
    const priorityIcon = priorityBadge.createSpan({ cls: 'priority-icon' });
    setIcon(priorityIcon, 'flag');
    priorityBadge.createSpan({ text: this.card.priority === 'none' ? 'No Priority' : this.card.priority.charAt(0).toUpperCase() + this.card.priority.slice(1) });
    priorityBadge.addEventListener('click', () => this.showPriorityMenu(priorityBadge));

    // Due Date Badge
    const dueDateBadge = propertiesBar.createDiv({ 
      cls: `property-badge due-date-badge ${this.card.dueDate && isOverdue(this.card.dueDate) ? 'overdue' : ''}`
    });
    const dateIcon = dueDateBadge.createSpan({ cls: 'date-icon' });
    setIcon(dateIcon, 'calendar');
    const dateText = dueDateBadge.createSpan({ cls: 'date-text' });
    dateText.textContent = this.card.dueDate ? formatDisplayDate(this.card.dueDate) : 'No due date';
    dueDateBadge.addEventListener('click', () => this.showDatePicker(dueDateBadge));

    // Modal Body with Tabs
    const body = contentEl.createDiv({ cls: 'modal-body-premium' });
    
    // Sidebar
    const sidebar = body.createDiv({ cls: 'modal-sidebar' });
    
    const tabs = [
      { id: 'overview', icon: 'layout-dashboard', label: 'Overview' },
      { id: 'description', icon: 'file-text', label: 'Description' },
      { id: 'checklist', icon: 'check-square', label: 'Checklist' },
      { id: 'notes', icon: 'file-plus', label: 'Linked Notes' },
      { id: 'activity', icon: 'activity', label: 'Activity' }
    ];

    tabs.forEach(tab => {
      const tabBtn = sidebar.createDiv({ cls: `sidebar-tab ${tab.id === 'overview' ? 'active' : ''}` });
      tabBtn.dataset.tab = tab.id;
      const tabIcon = tabBtn.createSpan({ cls: 'tab-icon' });
      setIcon(tabIcon, tab.icon);
      tabBtn.createSpan({ cls: 'tab-label', text: tab.label });
      
      tabBtn.addEventListener('click', () => {
        sidebar.querySelectorAll('.sidebar-tab').forEach(t => t.removeClass('active'));
        tabBtn.addClass('active');
        this.renderContent(tab.id);
      });
    });

    // Content Area
    this.contentContainer = body.createDiv({ cls: 'modal-content-area' });
    this.renderContent('overview');
  }

  private renderContent(tabId: string): void {
    this.contentContainer.empty();

    switch (tabId) {
      case 'overview':
        this.renderOverviewTab();
        break;
      case 'description':
        this.renderDescriptionTab();
        break;
      case 'checklist':
        this.renderChecklistTab();
        break;
      case 'notes':
        this.renderNotesTab();
        break;
      case 'activity':
        this.renderActivityTab();
        break;
    }
  }

  private renderOverviewTab(): void {
    const overview = this.contentContainer.createDiv({ cls: 'overview-tab' });

    // Assignees Section
    const assigneeSection = overview.createDiv({ cls: 'property-section' });
    const assigneeHeader = assigneeSection.createDiv({ cls: 'section-header' });
    const assigneeIcon = assigneeHeader.createSpan({ cls: 'section-icon' });
    setIcon(assigneeIcon, 'users');
    assigneeHeader.createSpan({ cls: 'section-title', text: 'Assignees' });

    const assigneeContent = assigneeSection.createDiv({ cls: 'section-content' });
    const assigneeList = assigneeContent.createDiv({ cls: 'assignee-list' });

    if (this.card.assignee.length === 0) {
      const emptyState = assigneeList.createDiv({ cls: 'empty-state-small' });
      emptyState.textContent = 'No assignees';
    } else {
      this.card.assignee.forEach(assignee => {
        const assigneeItem = assigneeList.createDiv({ cls: 'assignee-item' });
        const avatar = assigneeItem.createDiv({ cls: 'assignee-avatar-large' });
        avatar.textContent = assignee.charAt(0).toUpperCase();
        assigneeItem.createSpan({ cls: 'assignee-name', text: assignee });
        
        const removeBtn = assigneeItem.createEl('button', { cls: 'remove-assignee-btn' });
        setIcon(removeBtn, 'x');
        removeBtn.addEventListener('click', () => {
          this.card.assignee = this.card.assignee.filter(a => a !== assignee);
          this.save();
          this.renderContent('overview');
        });
      });
    }

    const addAssigneeBtn = assigneeContent.createEl('button', { cls: 'add-button' });
    setIcon(addAssigneeBtn, 'plus');
    addAssigneeBtn.createSpan({ text: 'Add assignee' });
    addAssigneeBtn.addEventListener('click', () => this.showAddAssigneeModal());

    // Tags Section
    const tagsSection = overview.createDiv({ cls: 'property-section' });
    const tagsHeader = tagsSection.createDiv({ cls: 'section-header' });
    const tagsIcon = tagsHeader.createSpan({ cls: 'section-icon' });
    setIcon(tagsIcon, 'tag');
    tagsHeader.createSpan({ cls: 'section-title', text: 'Tags' });

    const tagsContent = tagsSection.createDiv({ cls: 'section-content' });
    const tagsList = tagsContent.createDiv({ cls: 'tags-list' });

    if (this.card.tags.length === 0) {
      const emptyState = tagsList.createDiv({ cls: 'empty-state-small' });
      emptyState.textContent = 'No tags';
    } else {
      this.card.tags.forEach(tag => {
        const tagItem = tagsList.createDiv({ cls: 'tag-item-large' });
        tagItem.createSpan({ text: tag });
        
        const removeBtn = tagItem.createEl('button', { cls: 'remove-tag-btn' });
        setIcon(removeBtn, 'x');
        removeBtn.addEventListener('click', () => {
          this.card.tags = this.card.tags.filter(t => t !== tag);
          this.save();
          this.renderContent('overview');
        });
      });
    }

    const addTagBtn = tagsContent.createEl('button', { cls: 'add-button' });
    setIcon(addTagBtn, 'plus');
    addTagBtn.createSpan({ text: 'Add tag' });
    addTagBtn.addEventListener('click', () => this.showAddTagModal());

    // Dates Section
    const datesSection = overview.createDiv({ cls: 'property-section' });
    const datesHeader = datesSection.createDiv({ cls: 'section-header' });
    const datesIcon = datesHeader.createSpan({ cls: 'section-icon' });
    setIcon(datesIcon, 'calendar-range');
    datesHeader.createSpan({ cls: 'section-title', text: 'Dates' });

    const datesContent = datesSection.createDiv({ cls: 'section-content dates-grid' });

    // Start Date
    const startDateField = datesContent.createDiv({ cls: 'date-field' });
    startDateField.createDiv({ cls: 'date-label', text: 'Start Date' });
    const startDateInput = startDateField.createEl('input', { type: 'date' });
    startDateInput.value = this.card.startDate?.split('T')[0] || '';
    startDateInput.addEventListener('change', () => {
      this.card.startDate = startDateInput.value ? new Date(startDateInput.value).toISOString() : null;
      this.save();
    });

    // Due Date
    const dueDateField = datesContent.createDiv({ cls: 'date-field' });
    dueDateField.createDiv({ cls: 'date-label', text: 'Due Date' });
    const dueDateInput = dueDateField.createEl('input', { type: 'date' });
    dueDateInput.value = this.card.dueDate?.split('T')[0] || '';
    dueDateInput.addEventListener('change', () => {
      this.card.dueDate = dueDateInput.value ? new Date(dueDateInput.value).toISOString() : null;
      this.save();
      this.renderContent('overview');
    });

    // Time Tracking Section
    const timeSection = overview.createDiv({ cls: 'property-section' });
    const timeHeader = timeSection.createDiv({ cls: 'section-header' });
    const timeIcon = timeHeader.createSpan({ cls: 'section-icon' });
    setIcon(timeIcon, 'clock');
    timeHeader.createSpan({ cls: 'section-title', text: 'Time Tracking' });

    const timeContent = timeSection.createDiv({ cls: 'section-content time-tracking' });
    
    const estimateField = timeContent.createDiv({ cls: 'time-field' });
    estimateField.createDiv({ cls: 'time-label', text: 'Estimated (hours)' });
    const estimateInput = estimateField.createEl('input', { type: 'number', placeholder: '0' });
    estimateInput.value = this.card.estimatedHours?.toString() || '';
    estimateInput.addEventListener('change', () => {
      this.card.estimatedHours = parseFloat(estimateInput.value) || undefined;
      this.save();
    });

    const trackedField = timeContent.createDiv({ cls: 'time-field' });
    trackedField.createDiv({ cls: 'time-label', text: 'Time Tracked (hours)' });
    const trackedDisplay = trackedField.createDiv({ cls: 'time-display' });
    trackedDisplay.textContent = (this.card.timeTracked || 0).toFixed(1) + ' hrs';
  }

  private renderDescriptionTab(): void {
    const descSection = this.contentContainer.createDiv({ cls: 'description-tab' });

    const toolbar = descSection.createDiv({ cls: 'description-toolbar' });
    const toolbarTitle = toolbar.createDiv({ cls: 'toolbar-title' });
    const descIcon = toolbarTitle.createSpan({ cls: 'section-icon' });
    setIcon(descIcon, 'file-text');
    toolbarTitle.createSpan({ text: 'Description' });

    const descTextarea = descSection.createEl('textarea', {
      cls: 'description-textarea-premium',
      placeholder: 'Add a detailed description...',
      value: this.card.description
    });
    descTextarea.rows = 12;

    descTextarea.addEventListener('input', debounce(() => {
      this.card.description = descTextarea.value;
      this.save();
    }, 500));
  }

  private renderChecklistTab(): void {
    const checklistSection = this.contentContainer.createDiv({ cls: 'checklist-tab' });

    const header = checklistSection.createDiv({ cls: 'checklist-header' });
    const headerLeft = header.createDiv({ cls: 'header-left' });
    const checkIcon = headerLeft.createSpan({ cls: 'section-icon' });
    setIcon(checkIcon, 'check-square');
    headerLeft.createSpan({ cls: 'section-title', text: 'Checklist' });

    if (this.card.checklist.length > 0) {
      const completed = this.card.checklist.filter(i => i.completed).length;
      const progress = headerLeft.createDiv({ cls: 'checklist-progress-mini' });
      progress.textContent = `${completed}/${this.card.checklist.length}`;
    }

    const addItemBtn = header.createEl('button', { cls: 'add-button-small' });
    setIcon(addItemBtn, 'plus');
    addItemBtn.createSpan({ text: 'Add item' });
    addItemBtn.addEventListener('click', () => this.showAddChecklistItemModal());

    const checklistContent = checklistSection.createDiv({ cls: 'checklist-content' });

    if (this.card.checklist.length === 0) {
      const emptyState = checklistContent.createDiv({ cls: 'empty-state-large' });
      const emptyIcon = emptyState.createDiv({ cls: 'empty-icon' });
      setIcon(emptyIcon, 'check-square');
      emptyState.createDiv({ cls: 'empty-title', text: 'No checklist items' });
      emptyState.createDiv({ cls: 'empty-desc', text: 'Break down your task into smaller steps' });
    } else {
      const itemsList = checklistContent.createDiv({ cls: 'checklist-items-list' });

      this.card.checklist.forEach(item => {
        const itemEl = itemsList.createDiv({ cls: `checklist-item-premium ${item.completed ? 'completed' : ''}` });

        const checkbox = itemEl.createEl('input', { type: 'checkbox' });
        checkbox.checked = item.completed;
        checkbox.addEventListener('change', () => {
          this.boardService.updateChecklistItem(this.card.id, item.id, { completed: checkbox.checked });
          this.save();
          this.renderContent('checklist');
        });

        const itemText = itemEl.createDiv({ cls: 'item-text', text: item.text });

        const itemActions = itemEl.createDiv({ cls: 'item-actions' });
        
        const editBtn = itemActions.createEl('button', { cls: 'item-action-btn' });
        setIcon(editBtn, 'pencil');
        editBtn.addEventListener('click', () => this.editChecklistItem(item));

        const deleteBtn = itemActions.createEl('button', { cls: 'item-action-btn danger' });
        setIcon(deleteBtn, 'trash');
        deleteBtn.addEventListener('click', () => {
          this.boardService.deleteChecklistItem(this.card.id, item.id);
          this.save();
          this.renderContent('checklist');
        });
      });
    }
  }

  private renderNotesTab(): void {
    const notesSection = this.contentContainer.createDiv({ cls: 'notes-tab' });

    const header = notesSection.createDiv({ cls: 'notes-header' });
    const headerLeft = header.createDiv({ cls: 'header-left' });
    const notesIcon = headerLeft.createSpan({ cls: 'section-icon' });
    setIcon(notesIcon, 'file-plus');
    headerLeft.createSpan({ cls: 'section-title', text: 'Linked Notes' });

    const linkNoteBtn = header.createEl('button', { cls: 'add-button-small' });
    setIcon(linkNoteBtn, 'plus');
    linkNoteBtn.createSpan({ text: 'Link note' });
    linkNoteBtn.addEventListener('click', () => this.showLinkNoteModal());

    const notesContent = notesSection.createDiv({ cls: 'notes-content' });

    // Supporto per array di note
    const linkedNotes = (this.card as any).linkedNotes || [];
    
    if (linkedNotes.length === 0) {
      const emptyState = notesContent.createDiv({ cls: 'empty-state-large' });
      const emptyIcon = emptyState.createDiv({ cls: 'empty-icon' });
      setIcon(emptyIcon, 'file-plus');
      emptyState.createDiv({ cls: 'empty-title', text: 'No linked notes' });
      emptyState.createDiv({ cls: 'empty-desc', text: 'Connect this task to your Obsidian notes' });
    } else {
      const notesList = notesContent.createDiv({ cls: 'linked-notes-list' });

      linkedNotes.forEach((notePath: string) => {
        const noteItem = notesList.createDiv({ cls: 'linked-note-item' });

        const noteIcon = noteItem.createSpan({ cls: 'note-icon' });
        setIcon(noteIcon, 'file-text');

        const noteInfo = noteItem.createDiv({ cls: 'note-info' });
        const noteName = notePath.split('/').pop()?.replace('.md', '') || notePath;
        noteInfo.createDiv({ cls: 'note-name', text: noteName });
        noteInfo.createDiv({ cls: 'note-path', text: notePath });

        const noteActions = noteItem.createDiv({ cls: 'note-actions' });

        const openBtn = noteActions.createEl('button', { cls: 'note-action-btn' });
        setIcon(openBtn, 'external-link');
        openBtn.addEventListener('click', () => this.openNote(notePath));

        const unlinkBtn = noteActions.createEl('button', { cls: 'note-action-btn danger' });
        setIcon(unlinkBtn, 'unlink');
        unlinkBtn.addEventListener('click', () => {
          (this.card as any).linkedNotes = linkedNotes.filter((n: string) => n !== notePath);
          this.save();
          this.renderContent('notes');
        });
      });
    }
  }

  private renderActivityTab(): void {
    const activitySection = this.contentContainer.createDiv({ cls: 'activity-tab' });

    const header = activitySection.createDiv({ cls: 'activity-header' });
    const actIcon = header.createSpan({ cls: 'section-icon' });
    setIcon(actIcon, 'activity');
    header.createSpan({ cls: 'section-title', text: 'Activity' });

    const timeline = activitySection.createDiv({ cls: 'activity-timeline' });

    // Created
    const createdItem = timeline.createDiv({ cls: 'activity-item' });
    const createdIcon = createdItem.createDiv({ cls: 'activity-icon created' });
    setIcon(createdIcon, 'plus-circle');
    const createdContent = createdItem.createDiv({ cls: 'activity-content' });
    createdContent.createDiv({ cls: 'activity-title', text: 'Card created' });
    createdContent.createDiv({ cls: 'activity-time', text: formatTimeAgo(this.card.createdAt) });

    // Updated
    if (this.card.updatedAt !== this.card.createdAt) {
      const updatedItem = timeline.createDiv({ cls: 'activity-item' });
      const updatedIcon = updatedItem.createDiv({ cls: 'activity-icon updated' });
      setIcon(updatedIcon, 'edit');
      const updatedContent = updatedItem.createDiv({ cls: 'activity-content' });
      updatedContent.createDiv({ cls: 'activity-title', text: 'Card updated' });
      updatedContent.createDiv({ cls: 'activity-time', text: formatTimeAgo(this.card.updatedAt) });
    }

    // Completed
    if (this.card.completedAt) {
      const completedItem = timeline.createDiv({ cls: 'activity-item' });
      const completedIcon = completedItem.createDiv({ cls: 'activity-icon completed' });
      setIcon(completedIcon, 'check-circle');
      const completedContent = completedItem.createDiv({ cls: 'activity-content' });
      completedContent.createDiv({ cls: 'activity-title', text: 'Card completed' });
      completedContent.createDiv({ cls: 'activity-time', text: formatTimeAgo(this.card.completedAt) });
    }
  }

  private showLinkNoteModal(): void {
    const files = this.app.vault.getMarkdownFiles();
    
    const modal = new SuggesterModal(
      this.app,
      files.map(f => ({ display: f.path, value: f.path })),
      (selected) => {
        if (!selected) return;
        
        // Inizializza array se non esiste
        if (!(this.card as any).linkedNotes) {
          (this.card as any).linkedNotes = [];
        }
        
        // Aggiungi nota se non già presente
        if (!(this.card as any).linkedNotes.includes(selected.value)) {
          (this.card as any).linkedNotes.push(selected.value);
          this.save();
          this.renderContent('notes');
          
          // Crea o aggiorna i metadati della nota per il graph view
          this.updateNoteMetadata(selected.value);
        } else {
          new Notice('⚠️ Note already linked', 2000);
        }
      },
      'Link a note'
    );
    modal.open();
  }

  private async updateNoteMetadata(notePath: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof TFile)) return;

    try {
      const content = await this.app.vault.read(file);
      const board = this.boardService.getBoard();
      
      // Aggiungi frontmatter se non esiste
      let newContent = content;
      const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
      const match = content.match(frontmatterRegex);
      
      const kanbanLink = `[[${board.name}#${this.card.title}]]`;
      
      if (match) {
        // Frontmatter esiste - aggiorna
        const frontmatter = match[1];
        if (!frontmatter.includes('kanban-card:')) {
          newContent = content.replace(
            frontmatterRegex,
            `---\n${frontmatter}\nkanban-card: "${this.card.id}"\nkanban-board: "[[${board.name}]]"\n---`
          );
        }
      } else {
        // Aggiungi nuovo frontmatter
        newContent = `---\nkanban-card: "${this.card.id}"\nkanban-board: "[[${board.name}]]"\n---\n\n${content}`;
      }
      
      await this.app.vault.modify(file, newContent);
    } catch (error) {
      console.error('Failed to update note metadata:', error);
    }
  }

  private async openNote(notePath: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (file instanceof TFile) {
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file);
    }
  }

  private showTaskTypeMenu(targetEl: HTMLElement): void {
    const menu = new Menu();
    
    const taskTypes: TaskType[] = ['task', 'feature', 'bug', 'improvement', 'story', 'epic'];
    
    taskTypes.forEach(type => {
      menu.addItem(item => {
        item
          .setTitle(`${TASK_TYPE_ICONS[type]} ${type.charAt(0).toUpperCase() + type.slice(1)}`)
          .setChecked(this.card.taskType === type)
          .onClick(() => {
            this.card.taskType = type;
            this.save();
            this.close();
            setTimeout(() => {
              new CardDetailModal(this.app, this.plugin, this.card, this.boardService, this.onSave).open();
            }, 100);
          });
      });
    });
    
    menu.showAtMouseEvent(new MouseEvent('click', { clientX: targetEl.getBoundingClientRect().left, clientY: targetEl.getBoundingClientRect().bottom }));
  }

  private showPriorityMenu(targetEl: HTMLElement): void {
    const menu = new Menu();
    
    const priorities: Priority[] = ['none', 'low', 'medium', 'high', 'critical'];
    
    priorities.forEach(priority => {
      menu.addItem(item => {
        item
          .setTitle(priority.charAt(0).toUpperCase() + priority.slice(1))
          .setChecked(this.card.priority === priority)
          .onClick(() => {
            this.card.priority = priority;
            this.save();
            this.close();
            setTimeout(() => {
              new CardDetailModal(this.app, this.plugin, this.card, this.boardService, this.onSave).open();
            }, 100);
          });
      });
    });
    
    menu.showAtMouseEvent(new MouseEvent('click', { clientX: targetEl.getBoundingClientRect().left, clientY: targetEl.getBoundingClientRect().bottom }));
  }

  private showColumnSelector(targetEl: HTMLElement): void {
    const menu = new Menu();
    const board = this.boardService.getBoard();
    
    board.columns.forEach(column => {
      menu.addItem(item => {
        item
          .setTitle(column.name)
          .setChecked(this.card.columnId === column.id)
          .onClick(() => {
            this.boardService.moveCard(this.card.id, column.id, 0);
            this.save();
            this.close();
            setTimeout(() => {
              new CardDetailModal(this.app, this.plugin, this.card, this.boardService, this.onSave).open();
            }, 100);
          });
      });
    });
    
    menu.showAtMouseEvent(new MouseEvent('click', { clientX: targetEl.getBoundingClientRect().left, clientY: targetEl.getBoundingClientRect().bottom }));
  }

  private showDatePicker(targetEl: HTMLElement): void {
    const modal = new DatePickerModal(this.app, this.card.dueDate, (date) => {
      this.card.dueDate = date;
      this.save();
      this.close();
      setTimeout(() => {
        new CardDetailModal(this.app, this.plugin, this.card, this.boardService, this.onSave).open();
      }, 100);
    });
    modal.open();
  }

  private showAddAssigneeModal(): void {
    const board = this.boardService.getBoard();
    const members = board.members.length > 0 ? board.members : ['User 1', 'User 2', 'User 3']; // Default members
    
    const modal = new TextInputModal(
      this.app,
      'Add Assignee',
      'Assignee name',
      '',
      (value) => {
        if (value.trim() && !this.card.assignee.includes(value.trim())) {
          this.card.assignee.push(value.trim());
          if (!board.members.includes(value.trim())) {
            board.members.push(value.trim());
          }
          this.save();
          this.renderContent('overview');
        }
      }
    );
    modal.open();
  }

  private showAddTagModal(): void {
    const modal = new TextInputModal(
      this.app,
      'Add Tag',
      'Tag name',
      '',
      (value) => {
        if (value.trim() && !this.card.tags.includes(value.trim())) {
          this.card.tags.push(value.trim());
          const board = this.boardService.getBoard();
          if (!board.tags.includes(value.trim())) {
            board.tags.push(value.trim());
          }
          this.save();
          this.renderContent('overview');
        }
      }
    );
    modal.open();
  }

  private showAddChecklistItemModal(): void {
    const modal = new TextInputModal(
      this.app,
      'Add Checklist Item',
      'Item description',
      '',
      (value) => {
        if (value.trim()) {
          this.boardService.addChecklistItem(this.card.id, value.trim());
          this.save();
          this.renderContent('checklist');
        }
      }
    );
    modal.open();
  }

  private editChecklistItem(item: ChecklistItem): void {
    const modal = new TextInputModal(
      this.app,
      'Edit Checklist Item',
      'Item description',
      item.text,
      (value) => {
        if (value.trim()) {
          this.boardService.updateChecklistItem(this.card.id, item.id, { text: value.trim() });
          this.save();
          this.renderContent('checklist');
        }
      }
    );
    modal.open();
  }

  private save(): void {
    this.card.updatedAt = new Date().toISOString();
    this.onSave();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// ============================================
// MILESTONE MODALS
// ============================================

class MilestoneEditModal extends Modal {
  private milestone: Milestone | null;
  private onSubmit: (data: { name: string; description: string; dueDate: string | null; color: string }) => void;
  private name: string = '';
  private description: string = '';
  private dueDate: string | null = null;
  private color: string = '#6366f1';

  constructor(app: App, milestone: Milestone | null, onSubmit: (data: any) => void) {
    super(app);
    this.milestone = milestone;
    this.onSubmit = onSubmit;
    
    if (milestone) {
      this.name = milestone.name;
      this.description = milestone.description;
      this.dueDate = milestone.dueDate;
      this.color = milestone.color;
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kanban-milestone-edit-modal');
    
    contentEl.createEl('h2', { text: this.milestone ? '✏️ Edit Milestone' : '✨ Create Milestone' });
    
    new Setting(contentEl)
      .setName('Milestone name')
      .addText(text => {
        text
          .setPlaceholder('Q1 Launch')
          .setValue(this.name)
          .onChange(value => this.name = value);
        text.inputEl.focus();
      });
    
    new Setting(contentEl)
      .setName('Description')
      .addTextArea(text => {
        text
          .setPlaceholder('Describe this milestone...')
          .setValue(this.description)
          .onChange(value => this.description = value);
        text.inputEl.rows = 3;
      });
    
    new Setting(contentEl)
      .setName('Due date')
      .addText(text => {
        text.inputEl.type = 'date';
        text.setValue(this.dueDate?.split('T')[0] || '');
        text.onChange(value => this.dueDate = value ? new Date(value).toISOString() : null);
      });
    
    new Setting(contentEl)
      .setName('Color')
      .addButton(button => {
        button
          .setButtonText('Choose Color')
          .onClick(() => {
            new ColorPickerModal(this.app, this.color, (color) => {
              this.color = color;
            }).open();
          });
      });

    const buttonContainer = contentEl.createDiv({ cls: 'button-container' });
    
    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel', cls: 'cancel-btn' });
    cancelBtn.addEventListener('click', () => this.close());
    
    const submitBtn = buttonContainer.createEl('button', { 
      text: this.milestone ? 'Save' : 'Create', 
      cls: 'submit-btn' 
    });
    submitBtn.addEventListener('click', () => this.submit());
  }

  private submit(): void {
    if (this.name.trim()) {
      this.onSubmit({
        name: this.name.trim(),
        description: this.description.trim(),
        dueDate: this.dueDate,
        color: this.color
      });
      this.close();
    } else {
      new Notice('⚠️ Please enter a milestone name', 2000);
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class AddCardsToMilestoneModal extends Modal {
  private boardService: BoardService;
  private milestone: Milestone;
  private onSave: () => void;
  private selectedCardIds: Set<string> = new Set();

  constructor(app: App, boardService: BoardService, milestone: Milestone, onSave: () => void) {
    super(app);
    this.boardService = boardService;
    this.milestone = milestone;
    this.onSave = onSave;
    this.selectedCardIds = new Set(milestone.cardIds);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kanban-add-cards-modal');
    
    contentEl.createEl('h2', { text: `Add Cards to "${this.milestone.name}"` });
    
    const board = this.boardService.getBoard();
    const availableCards = board.cards.filter(card => !this.milestone.cardIds.includes(card.id));
    
    if (availableCards.length === 0) {
      contentEl.createEl('p', { text: 'No cards available to add' });
      return;
    }
    
    const cardsList = contentEl.createDiv({ cls: 'cards-selection-list' });
    
    availableCards.forEach(card => {
      const column = this.boardService.getColumn(card.columnId);
      const cardItem = cardsList.createDiv({ cls: 'card-selection-item' });
      
      const checkbox = cardItem.createEl('input', { type: 'checkbox' });
      checkbox.checked = this.selectedCardIds.has(card.id);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          this.selectedCardIds.add(card.id);
        } else {
          this.selectedCardIds.delete(card.id);
        }
      });
      
      const cardInfo = cardItem.createDiv({ cls: 'card-info' });
      cardInfo.createSpan({ text: card.title, cls: 'card-title' });
      if (column) {
        const badge = cardInfo.createSpan({ cls: 'column-badge' });
        badge.textContent = column.name;
        badge.style.backgroundColor = column.color;
      }
    });

    const buttonContainer = contentEl.createDiv({ cls: 'button-container' });
    
    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel', cls: 'cancel-btn' });
    cancelBtn.addEventListener('click', () => this.close());
    
    const addBtn = buttonContainer.createEl('button', { text: 'Add Cards', cls: 'submit-btn' });
    addBtn.addEventListener('click', () => this.submit());
  }

  private submit(): void {
    this.milestone.cardIds = Array.from(this.selectedCardIds);
    this.onSave();
    this.close();
    new Notice(`✅ Cards added to milestone`, 2000);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}


class FilterModal extends Modal {
  private boardService: BoardService;
  private onApply: () => void;

  constructor(app: App, boardService: BoardService, onApply: () => void) {
    super(app);
    this.boardService = boardService;
    this.onApply = onApply;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kanban-filter-modal');
    
    const filters = this.boardService.getBoard().filters;

    contentEl.createEl('h3', { text: 'Filters' });

    new Setting(contentEl)
      .setName('Search')
      .addText(text => {
        text.setValue(filters.searchQuery);
        text.setPlaceholder('Search cards...');
        text.onChange(value => {
          this.boardService.setFilters({ searchQuery: value });
          this.onApply();
        });
      });

    new Setting(contentEl)
      .setName('Show Blocked Cards')
      .addToggle(toggle => {
        toggle.setValue(filters.showBlocked);
        toggle.onChange(value => {
          this.boardService.setFilters({ showBlocked: value });
          this.onApply();
        });
      });

    new Setting(contentEl)
      .addButton(btn => {
        btn.setButtonText('Clear All Filters');
        btn.onClick(() => {
          this.boardService.clearFilters();
          this.onApply();
          this.close();
        });
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class AnalyticsModal extends Modal {
  private boardService: BoardService;

  constructor(app: App, boardService: BoardService) {
    super(app);
    this.boardService = boardService;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kanban-analytics-modal');
    
    const board = this.boardService.getBoard();

    contentEl.createEl('h2', { text: 'Analytics Dashboard' });

    const summaryGrid = contentEl.createDiv({ cls: 'analytics-summary' });

    const totalCards = board.cards.length;
    const completedCards = board.cards.filter(c => c.completedAt).length;
    const blockedCards = board.cards.filter(c => c.blocked).length;
    const overdueCards = board.cards.filter(c => c.dueDate && isOverdue(c.dueDate) && !c.completedAt).length;

    [
      { t: 'Total Cards', v: totalCards, i: 'layers' },
      { t: 'Completed', v: completedCards, i: 'check-circle' },
      { t: 'Blocked', v: blockedCards, i: 'alert-circle' },
      { t: 'Overdue', v: overdueCards, i: 'clock' }
    ].forEach(({ t, v, i }) => {
      const card = summaryGrid.createDiv({ cls: 'summary-card' });
      const iconEl = card.createDiv({ cls: 'card-icon' });
      setIcon(iconEl, i);
      card.createEl('div', { text: v.toString(), cls: 'card-value' });
      card.createEl('div', { text: t, cls: 'card-title' });
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class AutomationsModal extends Modal {
  private boardService: BoardService;
  private onSave: () => void;

  constructor(app: App, boardService: BoardService, onSave: () => void) {
    super(app);
    this.boardService = boardService;
    this.onSave = onSave;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kanban-automations-modal');
    
    const board = this.boardService.getBoard();

    contentEl.createEl('h2', { text: 'Automations' });

    new Setting(contentEl)
      .setName('Enable Automations')
      .addToggle(toggle => {
        toggle.setValue(board.settings.enableAutomations);
        toggle.onChange(value => {
          this.boardService.updateBoard({ 
            settings: { ...board.settings, enableAutomations: value } 
          });
          this.onSave();
        });
      });

    contentEl.createEl('h3', { text: 'Quick Add Presets' });

    const presetsList = contentEl.createDiv({ cls: 'presets-list' });

    [
      { name: 'Auto-complete when moved to Done', desc: 'Marks card as complete' },
      { name: 'Notify when WIP exceeded', desc: 'Sends warning notification' }
    ].forEach(preset => {
      const item = presetsList.createDiv({ cls: 'preset-item' });
      item.createSpan({ text: preset.name, cls: 'preset-name' });
      item.createSpan({ text: preset.desc, cls: 'preset-description' });
      const addBtn = item.createEl('button', { text: 'Add', cls: 'preset-add-btn' });
      addBtn.addEventListener('click', () => {
        new Notice(`Added: ${preset.name}`);
      });
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class BoardSettingsModal extends Modal {
  private boardService: BoardService;
  private onSave: () => void;

  constructor(app: App, boardService: BoardService, onSave: () => void) {
    super(app);
    this.boardService = boardService;
    this.onSave = onSave;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kanban-settings-modal');
    
    const board = this.boardService.getBoard();
    const settings = board.settings;

    contentEl.createEl('h2', { text: 'Board Settings' });

    contentEl.createEl('h3', { text: 'General' });

    new Setting(contentEl)
      .setName('Board Name')
      .addText(text => {
        text.setValue(board.name);
        text.onChange(value => {
          this.boardService.updateBoard({ name: value });
          this.onSave();
        });
      });

    new Setting(contentEl)
      .setName('Default View')
      .addDropdown(dropdown => {
        dropdown
          .addOption('board', 'Board')
          .addOption('list', 'List')
          .addOption('timeline', 'Timeline')
          .addOption('gantt', 'Gantt')
          .addOption('roadmap', 'Roadmap')
          .setValue(settings.defaultView)
          .onChange(value => {
            this.boardService.updateBoard({ 
              settings: { ...settings, defaultView: value as ViewType } 
            });
            this.onSave();
          });
      });

    contentEl.createEl('h3', { text: 'Features' });

    new Setting(contentEl)
      .setName('Enable WIP Limits')
      .setDesc('Limit cards in each column')
      .addToggle(toggle => {
        toggle.setValue(settings.enableWipLimits);
        toggle.onChange(value => {
          this.boardService.updateBoard({ 
            settings: { ...settings, enableWipLimits: value } 
          });
          this.onSave();
        });
      });

    new Setting(contentEl)
      .setName('Enable Swim Lanes')
      .setDesc('Group cards horizontally')
      .addToggle(toggle => {
        toggle.setValue(settings.enableSwimLanes);
        toggle.onChange(value => {
          this.boardService.updateBoard({ 
            settings: { ...settings, enableSwimLanes: value } 
          });
          this.onSave();
        });
      });

    new Setting(contentEl)
      .setName('Enable Time Tracking')
      .setDesc('Track time on cards')
      .addToggle(toggle => {
        toggle.setValue(settings.enableTimeTracking);
        toggle.onChange(value => {
          this.boardService.updateBoard({ 
            settings: { ...settings, enableTimeTracking: value } 
          });
          this.onSave();
        });
      });

    contentEl.createEl('h3', { text: 'Card Display' });
    const displayOptions = settings.cardDisplayOptions;

    new Setting(contentEl)
      .setName('Show Assignee')
      .addToggle(toggle => {
        toggle.setValue(displayOptions.showAssignee);
        toggle.onChange(value => {
          this.boardService.updateBoard({ 
            settings: { 
              ...settings, 
              cardDisplayOptions: { ...displayOptions, showAssignee: value } 
            } 
          });
          this.onSave();
        });
      });

    new Setting(contentEl)
      .setName('Show Due Date')
      .addToggle(toggle => {
        toggle.setValue(displayOptions.showDueDate);
        toggle.onChange(value => {
          this.boardService.updateBoard({ 
            settings: { 
              ...settings, 
              cardDisplayOptions: { ...displayOptions, showDueDate: value } 
            } 
          });
          this.onSave();
        });
      });

    new Setting(contentEl)
      .setName('Show Tags')
      .addToggle(toggle => {
        toggle.setValue(displayOptions.showTags);
        toggle.onChange(value => {
          this.boardService.updateBoard({ 
            settings: { 
              ...settings, 
              cardDisplayOptions: { ...displayOptions, showTags: value } 
            } 
          });
          this.onSave();
        });
      });

    new Setting(contentEl)
      .setName('Show Priority')
      .addToggle(toggle => {
        toggle.setValue(displayOptions.showPriority);
        toggle.onChange(value => {
          this.boardService.updateBoard({ 
            settings: { 
              ...settings, 
              cardDisplayOptions: { ...displayOptions, showPriority: value } 
            } 
          });
          this.onSave();
        });
      });

    new Setting(contentEl)
      .setName('Show Checklist Progress')
      .addToggle(toggle => {
        toggle.setValue(displayOptions.showChecklist);
        toggle.onChange(value => {
          this.boardService.updateBoard({ 
            settings: { 
              ...settings, 
              cardDisplayOptions: { ...displayOptions, showChecklist: value } 
            } 
          });
          this.onSave();
        });
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
function formatTimeAgo(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) {
    return 'just now';
  } else if (diffMins < 60) {
    return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  } else {
    return formatDisplayDate(timestamp);
  }
}