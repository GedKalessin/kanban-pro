import { setIcon } from 'obsidian';
import { KanbanCard, PRIORITY_COLORS, TASK_TYPE_ICONS } from '../../models/types';
import { createElement } from '../../utils/helpers';
import { IViewRenderer, ViewRendererContext } from './IViewRenderer';

interface GanttConfig {
  startDate: Date;
  endDate: Date;
  cellWidth: number;
  rowHeight: number;
  headerHeight: number;
  zoomLevel: 'day' | 'week' | 'month';
}

export class GanttViewRenderer implements IViewRenderer {
  private config: GanttConfig = {
    startDate: new Date(),
    endDate: new Date(),
    cellWidth: 40,
    rowHeight: 44,
    headerHeight: 60,
    zoomLevel: 'day'
  };

  render(container: HTMLElement, context: ViewRendererContext): void {
    container.addClass('kanban-gantt-view');

    const toolbar = this.renderToolbar(context);
    container.appendChild(toolbar);

    const filteredCards = context.boardService.getFilteredCards()
      .filter(c => c.dueDate || (c as any).startDate)
      .sort((a, b) => ((a as any).startDate || a.dueDate || '').localeCompare((b as any).startDate || b.dueDate || ''));

    if (filteredCards.length === 0) {
      container.appendChild(this.renderEmptyState());
      return;
    }

    this.calculateGanttDateRange(filteredCards);

    const ganttContainer = this.renderGanttContainer(filteredCards, context);
    container.appendChild(ganttContainer);
  }

  private renderToolbar(context: ViewRendererContext): HTMLElement {
    const toolbar = createElement('div', { className: 'gantt-toolbar' });

    // Zoom Controls
    const zoomControls = createElement('div', { className: 'zoom-controls' });
    zoomControls.appendChild(createElement('span', { className: 'zoom-label' }, ['Zoom:']));

    (['day', 'week', 'month'] as const).forEach(level => {
      const btn = createElement('button', {
        className: `zoom-btn ${this.config.zoomLevel === level ? 'active' : ''}`
      }, [level.charAt(0).toUpperCase() + level.slice(1)]);
      btn.addEventListener('click', () => {
        this.config.zoomLevel = level;
        this.updateGanttCellWidth();
        context.render();
      });
      zoomControls.appendChild(btn);
    });
    toolbar.appendChild(zoomControls);

    // Navigation Controls
    const navControls = createElement('div', { className: 'nav-controls' });

    const prevBtn = createElement('button', { className: 'nav-btn' });
    setIcon(prevBtn, 'chevron-left');
    prevBtn.addEventListener('click', () => this.navigateGantt('prev', context));
    navControls.appendChild(prevBtn);

    const todayBtn = createElement('button', { className: 'today-btn' }, ['Today']);
    todayBtn.addEventListener('click', () => this.navigateGantt('today', context));
    navControls.appendChild(todayBtn);

    const nextBtn = createElement('button', { className: 'nav-btn' });
    setIcon(nextBtn, 'chevron-right');
    nextBtn.addEventListener('click', () => this.navigateGantt('next', context));
    navControls.appendChild(nextBtn);

    toolbar.appendChild(navControls);

    // Add Task Button
    const addTaskBtn = createElement('button', { className: 'add-task-btn' });
    setIcon(addTaskBtn, 'plus');
    addTaskBtn.appendChild(createElement('span', {}, ['Add Task']));
    addTaskBtn.addEventListener('click', () => {
      const board = context.boardService.getBoard();
      if (board.columns[0]) {
        const { QuickAddCardModal } = require('../../modals/UtilityModals');
        new QuickAddCardModal(context.app, (title) => {
          context.boardService.addCard(board.columns[0].id, { title });
          context.render();
          context.saveBoard();
        }).open();
      }
    });
    toolbar.appendChild(addTaskBtn);

    return toolbar;
  }

  private renderEmptyState(): HTMLElement {
    const emptyState = createElement('div', { className: 'empty-state' });
    const emptyIcon = createElement('div', { className: 'empty-icon' });
    setIcon(emptyIcon, 'gantt-chart');
    emptyState.appendChild(emptyIcon);
    emptyState.appendChild(createElement('h3', {}, ['No tasks with dates']));
    emptyState.appendChild(createElement('p', {}, ['Add dates to cards to see them in the Gantt chart.']));
    return emptyState;
  }

  private calculateGanttDateRange(cards: KanbanCard[]): void {
    const now = new Date();
    let minDate = new Date(now);
    let maxDate = new Date(now);

    cards.forEach(card => {
      const start = (card as any).startDate ? new Date((card as any).startDate) : null;
      const due = card.dueDate ? new Date(card.dueDate) : null;

      if (start && start < minDate) minDate = new Date(start);
      if (due && due > maxDate) maxDate = new Date(due);
      if (due && !start && due < minDate) minDate = new Date(due);
    });

    minDate.setDate(minDate.getDate() - 7);
    maxDate.setDate(maxDate.getDate() + 21);

    this.config.startDate = minDate;
    this.config.endDate = maxDate;
  }

  private renderGanttContainer(cards: KanbanCard[], context: ViewRendererContext): HTMLElement {
    const ganttContainer = createElement('div', { className: 'gantt-container' });

    // Sidebar
    const sidebar = this.renderSidebar(cards, context);
    ganttContainer.appendChild(sidebar);

    // Chart Area
    const chartArea = this.renderChartArea(cards, context);
    ganttContainer.appendChild(chartArea);

    return ganttContainer;
  }

  private renderSidebar(cards: KanbanCard[], context: ViewRendererContext): HTMLElement {
    const sidebar = createElement('div', { className: 'gantt-sidebar' });

    const sidebarHeader = createElement('div', { className: 'gantt-sidebar-header' });
    sidebarHeader.style.height = `${this.config.headerHeight}px`;
    sidebarHeader.appendChild(createElement('span', {}, ['Task']));
    sidebar.appendChild(sidebarHeader);

    const taskList = createElement('div', { className: 'gantt-task-list' });

    cards.forEach(card => {
      const column = context.boardService.getColumn(card.columnId);
      const taskRow = createElement('div', { className: 'gantt-task-row', 'data-card-id': card.id });
      taskRow.style.height = `${this.config.rowHeight}px`;

      const taskInfo = createElement('div', { className: 'task-info' });

      const priorityDot = createElement('span', { className: `priority-dot priority-${card.priority}` });
      priorityDot.style.backgroundColor = PRIORITY_COLORS[card.priority];
      taskInfo.appendChild(priorityDot);

      if (card.taskType !== 'task') {
        taskInfo.appendChild(createElement('span', { className: 'task-type-icon' }, [TASK_TYPE_ICONS[card.taskType]]));
      }

      const title = createElement('span', { className: 'task-title' }, [card.title]);
      title.addEventListener('click', () => context.onCardClick(card.id));
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
    return sidebar;
  }

  private renderChartArea(cards: KanbanCard[], context: ViewRendererContext): HTMLElement {
    const chartArea = createElement('div', { className: 'gantt-chart-area' });

    const dates = this.generateDateRange();

    // Header
    const chartHeader = this.renderChartHeader(dates);
    chartArea.appendChild(chartHeader);

    // Grid and Bars
    const chartGrid = createElement('div', { className: 'gantt-chart-grid' });

    cards.forEach(card => {
      const row = createElement('div', { className: 'gantt-grid-row' });
      row.style.height = `${this.config.rowHeight}px`;

      // Grid cells
      dates.forEach(date => {
        const cell = createElement('div', { className: 'gantt-grid-cell' });
        cell.style.width = `${this.config.cellWidth}px`;
        row.appendChild(cell);
      });

      // Bar
      const bar = this.renderGanttBar(card, context);
      if (bar) {
        bar.style.position = 'absolute';
        bar.style.top = '8px';
        row.appendChild(bar);
      }

      row.style.position = 'relative';
      chartGrid.appendChild(row);
    });

    chartArea.appendChild(chartGrid);
    return chartArea;
  }

  private renderChartHeader(dates: Date[]): HTMLElement {
    const header = createElement('div', { className: 'gantt-chart-header' });
    header.style.height = `${this.config.headerHeight}px`;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    dates.forEach(date => {
      const isToday = date.getTime() === today.getTime();
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;

      const headerCell = createElement('div', {
        className: `gantt-header-cell ${isToday ? 'today' : ''} ${isWeekend ? 'weekend' : ''}`
      });
      headerCell.style.width = `${this.config.cellWidth}px`;

      const dayLabel = createElement('div', { className: 'day-label' });
      dayLabel.appendChild(createElement('div', { className: 'day-number' }, [date.getDate().toString()]));
      dayLabel.appendChild(createElement('div', { className: 'day-name' }, [
        date.toLocaleString('default', { weekday: 'short' })
      ]));

      headerCell.appendChild(dayLabel);
      header.appendChild(headerCell);
    });

    return header;
  }

  private renderGanttBar(card: KanbanCard, context: ViewRendererContext): HTMLElement | null {
    const cardStart = (card as any).startDate ? new Date((card as any).startDate) : (card.dueDate ? new Date(card.dueDate) : null);
    const cardEnd = card.dueDate ? new Date(card.dueDate) : cardStart;

    if (!cardStart || !cardEnd) return null;

    const column = context.boardService.getColumn(card.columnId);
    const barColor = card.color || column?.color || '#6366f1';

    const startOffset = Math.floor((cardStart.getTime() - this.config.startDate.getTime()) / (1000 * 60 * 60 * 24));
    const duration = Math.max(1, Math.ceil((cardEnd.getTime() - cardStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    const bar = createElement('div', {
      className: `gantt-bar ${card.blocked ? 'blocked' : ''} ${card.completedAt ? 'completed' : ''}`,
      'data-card-id': card.id
    });
    bar.style.left = `${startOffset * this.config.cellWidth}px`;
    bar.style.width = `${duration * this.config.cellWidth - 8}px`;
    bar.style.backgroundColor = barColor;
    bar.style.height = '28px';

    // Progress
    if (card.checklist.length > 0) {
      const completed = card.checklist.filter(i => i.completed).length;
      const progress = (completed / card.checklist.length) * 100;
      const progressEl = createElement('div', { className: 'bar-progress' });
      progressEl.style.width = `${progress}%`;
      bar.appendChild(progressEl);
    }

    const barContent = createElement('div', { className: 'bar-content' }, [card.title]);
    bar.appendChild(barContent);

    bar.addEventListener('click', () => context.onCardClick(card.id));

    return bar;
  }

  private generateDateRange(): Date[] {
    const dates: Date[] = [];
    const current = new Date(this.config.startDate);

    while (current <= this.config.endDate) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }

  private updateGanttCellWidth(): void {
    switch (this.config.zoomLevel) {
      case 'day':
        this.config.cellWidth = 40;
        break;
      case 'week':
        this.config.cellWidth = 20;
        break;
      case 'month':
        this.config.cellWidth = 10;
        break;
    }
  }

  private navigateGantt(direction: 'prev' | 'next' | 'today', context: ViewRendererContext): void {
    if (direction === 'today') {
      this.config.startDate = new Date();
      this.config.startDate.setDate(this.config.startDate.getDate() - 7);
      this.config.endDate = new Date();
      this.config.endDate.setDate(this.config.endDate.getDate() + 21);
    } else {
      const days = direction === 'prev' ? -7 : 7;
      this.config.startDate.setDate(this.config.startDate.getDate() + days);
      this.config.endDate.setDate(this.config.endDate.getDate() + days);
    }
    context.render();
  }
}
