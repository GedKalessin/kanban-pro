import { setIcon } from 'obsidian';
import { KanbanCard, PRIORITY_COLORS } from '../../models/types';
import { createElement } from '../../utils/helpers';
import { IViewRenderer, ViewRendererContext } from './IViewRenderer';

interface TimelineConfig {
  viewMode: 'day' | 'week' | 'month';
  showWeekends: boolean;
  groupBy: 'none' | 'assignee' | 'priority' | 'column';
  cellWidth: number;
}

export class TimelineViewRenderer implements IViewRenderer {
  private config: TimelineConfig = {
    viewMode: 'week',
    showWeekends: true,
    groupBy: 'none',
    cellWidth: 40
  };

  render(container: HTMLElement, context: ViewRendererContext): void {
    container.addClass('kanban-timeline-view', 'horizontal');

    const toolbar = this.renderToolbar(context);
    container.appendChild(toolbar);

    const filteredCards = context.boardService.getFilteredCards()
      .filter(c => c.dueDate || (c as any).startDate);

    if (filteredCards.length === 0) {
      container.appendChild(this.renderEmptyState());
      return;
    }

    const { dates, startDate } = this.calculateTimelineDates(filteredCards);
    const timelineContainer = this.renderTimelineContainer(dates, filteredCards, startDate, context);
    container.appendChild(timelineContainer);
  }

  private renderToolbar(context: ViewRendererContext): HTMLElement {
    const toolbar = createElement('div', { className: 'timeline-toolbar' });

    // View Mode Selector
    const viewModeSelector = createElement('div', { className: 'view-mode-selector' });
    (['day', 'week', 'month'] as const).forEach(mode => {
      const btn = createElement('button', {
        className: `mode-btn ${this.config.viewMode === mode ? 'active' : ''}`
      }, [mode.charAt(0).toUpperCase() + mode.slice(1)]);
      btn.addEventListener('click', () => {
        this.config.viewMode = mode;
        context.render();
      });
      viewModeSelector.appendChild(btn);
    });
    toolbar.appendChild(viewModeSelector);

    // Group By Selector
    const groupBySelector = createElement('div', { className: 'group-by-selector' });
    groupBySelector.appendChild(createElement('span', { className: 'group-label' }, ['Group by:']));
    const groupDropdown = createElement('select', { className: 'group-dropdown' }) as HTMLSelectElement;
    [
      { v: 'none', l: 'None' },
      { v: 'assignee', l: 'Assignee' },
      { v: 'priority', l: 'Priority' },
      { v: 'column', l: 'Status' }
    ].forEach(opt => {
      const option = createElement('option', { value: opt.v }, [opt.l]) as HTMLOptionElement;
      if (this.config.groupBy === opt.v) option.selected = true;
      groupDropdown.appendChild(option);
    });
    groupDropdown.addEventListener('change', () => {
      this.config.groupBy = groupDropdown.value as any;
      context.render();
    });
    groupBySelector.appendChild(groupDropdown);
    toolbar.appendChild(groupBySelector);

    // Today Button
    const todayBtn = createElement('button', { className: 'today-btn' }, ['Today']);
    todayBtn.addEventListener('click', () => {
      setTimeout(() => {
        const marker = container.querySelector('.today-marker');
        if (marker) marker.scrollIntoView({ behavior: 'smooth', inline: 'center' });
      }, 100);
    });
    toolbar.appendChild(todayBtn);

    return toolbar;
  }

  private renderEmptyState(): HTMLElement {
    const emptyState = createElement('div', { className: 'empty-state' });
    const emptyIcon = createElement('div', { className: 'empty-icon' });
    setIcon(emptyIcon, 'calendar-x');
    emptyState.appendChild(emptyIcon);
    emptyState.appendChild(createElement('h3', {}, ['No cards with dates']));
    emptyState.appendChild(createElement('p', {}, ['Add start or due dates to see cards in timeline.']));
    return emptyState;
  }

  private calculateTimelineDates(cards: KanbanCard[]): { dates: Date[]; startDate: Date } {
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
    maxDate.setDate(maxDate.getDate() + 14);

    const dates: Date[] = [];
    const current = new Date(minDate);
    while (current <= maxDate) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    return { dates, startDate: minDate };
  }

  private renderTimelineContainer(dates: Date[], cards: KanbanCard[], startDate: Date, context: ViewRendererContext): HTMLElement {
    const timelineContainer = createElement('div', { className: 'timeline-container' });

    // Header
    const header = this.renderTimelineHeader(dates);
    timelineContainer.appendChild(header);

    // Body
    const body = createElement('div', { className: 'timeline-body' });
    const groups = this.groupTimelineCards(cards, context);

    groups.forEach((groupCards, groupName) => {
      const groupEl = createElement('div', { className: 'timeline-group' });

      const groupHeader = createElement('div', { className: 'timeline-group-header' });
      groupHeader.appendChild(createElement('span', { className: 'group-title' }, [groupName]));
      groupHeader.appendChild(createElement('span', { className: 'group-count' }, [`${groupCards.length}`]));
      groupEl.appendChild(groupHeader);

      const groupRows = createElement('div', { className: 'timeline-group-rows' });
      groupCards.forEach(card => {
        groupRows.appendChild(this.renderTimelineRow(card, dates, startDate, context));
      });
      groupEl.appendChild(groupRows);

      body.appendChild(groupEl);
    });

    timelineContainer.appendChild(body);
    return timelineContainer;
  }

  private renderTimelineHeader(dates: Date[]): HTMLElement {
    const header = createElement('div', { className: 'timeline-header' });
    header.appendChild(createElement('div', { className: 'timeline-sidebar-spacer' }));

    const dateCells = createElement('div', { className: 'timeline-date-cells' });
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    dates.forEach(date => {
      const isToday = date.getTime() === today.getTime();
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;

      const dayCell = createElement('div', {
        className: `day-cell ${isToday ? 'today' : ''} ${isWeekend ? 'weekend' : ''}`
      });
      dayCell.style.width = `${this.config.cellWidth}px`;

      dayCell.appendChild(createElement('span', { className: 'day-number' }, [date.getDate().toString()]));
      dayCell.appendChild(createElement('span', { className: 'day-name' }, [
        date.toLocaleString('default', { weekday: 'short' })
      ]));

      if (isToday) {
        dayCell.appendChild(createElement('div', { className: 'today-marker' }));
      }

      dateCells.appendChild(dayCell);
    });

    header.appendChild(dateCells);
    return header;
  }

  private renderTimelineRow(card: KanbanCard, dates: Date[], startDate: Date, context: ViewRendererContext): HTMLElement {
    const row = createElement('div', { className: 'timeline-row', 'data-card-id': card.id });

    // Sidebar
    const sidebar = createElement('div', { className: 'timeline-row-sidebar' });
    const cardInfo = createElement('div', { className: 'card-info' });

    const priorityDot = createElement('span', { className: `priority-dot priority-${card.priority}` });
    priorityDot.style.backgroundColor = PRIORITY_COLORS[card.priority];
    cardInfo.appendChild(priorityDot);

    const title = createElement('span', { className: 'card-title' }, [card.title]);
    title.addEventListener('click', () => context.onCardClick(card.id));
    cardInfo.appendChild(title);
    sidebar.appendChild(cardInfo);

    if (card.assignee.length > 0) {
      const avatar = createElement('div', { className: 'mini-avatar' });
      avatar.textContent = card.assignee[0].charAt(0).toUpperCase();
      sidebar.appendChild(avatar);
    }
    row.appendChild(sidebar);

    // Cells with bar
    const cellsContainer = this.renderTimelineCells(dates, card, startDate, context);
    row.appendChild(cellsContainer);

    return row;
  }

  private renderTimelineCells(dates: Date[], card: KanbanCard, startDate: Date, context: ViewRendererContext): HTMLElement {
    const cellsContainer = createElement('div', { className: 'timeline-cells' });
    cellsContainer.style.position = 'relative';
    cellsContainer.style.width = `${dates.length * this.config.cellWidth}px`;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    dates.forEach(date => {
      const isToday = date.getTime() === today.getTime();
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;

      const cell = createElement('div', {
        className: `timeline-cell ${isWeekend ? 'weekend' : ''} ${isToday ? 'today' : ''}`
      });
      cell.style.width = `${this.config.cellWidth}px`;
      cell.style.position = 'relative';
      cellsContainer.appendChild(cell);
    });

    const bar = this.renderTimelineBar(card, startDate, context);
    if (bar) {
      bar.style.position = 'absolute';
      bar.style.top = '12px';
      cellsContainer.appendChild(bar);
    }

    return cellsContainer;
  }

  private renderTimelineBar(card: KanbanCard, startDate: Date, context: ViewRendererContext): HTMLElement | null {
    const cardStart = (card as any).startDate ? new Date((card as any).startDate) : (card.dueDate ? new Date(card.dueDate) : null);
    const cardEnd = card.dueDate ? new Date(card.dueDate) : cardStart;

    if (!cardStart || !cardEnd) return null;

    const column = context.boardService.getColumn(card.columnId);
    const barColor = card.color || column?.color || '#6366f1';

    const startOffset = Math.floor((cardStart.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const duration = Math.max(1, Math.ceil((cardEnd.getTime() - cardStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    const bar = createElement('div', {
      className: `timeline-bar ${card.blocked ? 'blocked' : ''} ${card.completedAt ? 'completed' : ''}`,
      'data-card-id': card.id
    });
    bar.style.left = `${startOffset * this.config.cellWidth}px`;
    bar.style.width = `${duration * this.config.cellWidth - 8}px`;
    bar.style.backgroundColor = barColor;

    // Progress bar
    if (card.checklist.length > 0) {
      const completed = card.checklist.filter(i => i.completed).length;
      const progress = (completed / card.checklist.length) * 100;
      const progressEl = createElement('div', { className: 'bar-progress' });
      progressEl.style.width = `${progress}%`;
      bar.appendChild(progressEl);
    }

    bar.appendChild(createElement('div', { className: 'bar-content' }, [card.title]));
    bar.addEventListener('click', () => context.onCardClick(card.id));

    return bar;
  }

  private groupTimelineCards(cards: KanbanCard[], context: ViewRendererContext): Map<string, KanbanCard[]> {
    const groups = new Map<string, KanbanCard[]>();

    if (this.config.groupBy === 'none') {
      groups.set('All Cards', cards);
      return groups;
    }

    cards.forEach(card => {
      let key: string;
      switch (this.config.groupBy) {
        case 'assignee':
          key = card.assignee.length > 0 ? card.assignee[0] : 'Unassigned';
          break;
        case 'priority':
          key = card.priority.charAt(0).toUpperCase() + card.priority.slice(1);
          break;
        case 'column':
          const col = context.boardService.getColumn(card.columnId);
          key = col?.name || 'Unknown';
          break;
        default:
          key = 'All Cards';
      }

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(card);
    });

    return groups;
  }
}
