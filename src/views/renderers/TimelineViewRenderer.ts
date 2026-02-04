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
    try {
      container.addClass('kanban-timeline-view', 'horizontal');

      const toolbar = this.renderToolbar(context, container);
      container.appendChild(toolbar);

      const filteredCards = context.boardService.getFilteredCards()
        .filter(c => c.dueDate || (c as any).startDate);

      if (filteredCards.length === 0) {
        container.appendChild(this.renderEmptyState(context));
        return;
      }

      const { dates, startDate } = this.calculateTimelineDates(filteredCards);
      const timelineContainer = this.renderTimelineContainer(dates, filteredCards, startDate, context);
      container.appendChild(timelineContainer);
    } catch (error) {
      console.error('Timeline View Error:', error);
      this.renderError(container, 'Failed to render Timeline view', context);
    }
  }

  private renderToolbar(context: ViewRendererContext, container: HTMLElement): HTMLElement {
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
        const marker = container.querySelector('.timeline-container .today-marker');
        if (marker) marker.scrollIntoView({ behavior: 'smooth', inline: 'center' });
      }, 100);
    });
    toolbar.appendChild(todayBtn);

    return toolbar;
  }

  private renderEmptyState(context: ViewRendererContext): HTMLElement {
    const emptyState = createElement('div', { className: 'empty-state timeline-empty' });
    const emptyIcon = createElement('div', { className: 'empty-icon' });
    setIcon(emptyIcon, 'calendar-x');
    emptyState.appendChild(emptyIcon);
    emptyState.appendChild(createElement('h3', {}, ['No cards with dates']));
    emptyState.appendChild(createElement('p', {}, ['Add start or due dates to cards to see them in timeline view.']));

    // Button to create a card with dates
    const createBtn = createElement('button', { className: 'primary-btn' }, ['Create Card with Dates']);
    createBtn.addEventListener('click', () => {
      const board = context.boardService.getBoard();
      if (board.columns.length > 0) {
        const { QuickAddCardModal } = require('../../modals/UtilityModals');
        new QuickAddCardModal(context.app, (title: string, startDate: string | undefined, dueDate: string | undefined) => {
          context.boardService.addCard(board.columns[0].id, {
            title,
            startDate: startDate ?? new Date().toISOString(),
            dueDate: dueDate ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
          });
          context.render();
          context.saveBoard();
        }).open();
      }
    });
    emptyState.appendChild(createBtn);

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

    // Adjust padding based on view mode
    const padding = this.config.viewMode === 'day' ? 3 : this.config.viewMode === 'week' ? 7 : 14;
    minDate.setDate(minDate.getDate() - padding);
    maxDate.setDate(maxDate.getDate() + padding * 2);

    // Align to start of period based on view mode
    if (this.config.viewMode === 'week') {
      // Align to Monday
      const dayOfWeek = minDate.getDay();
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      minDate.setDate(minDate.getDate() + diff);
    } else if (this.config.viewMode === 'month') {
      // Align to first of month
      minDate.setDate(1);
    }

    const dates: Date[] = [];
    const current = new Date(minDate);

    while (current <= maxDate) {
      dates.push(new Date(current));

      if (this.config.viewMode === 'day') {
        current.setDate(current.getDate() + 1);
      } else if (this.config.viewMode === 'week') {
        current.setDate(current.getDate() + 7);
      } else {
        // month
        current.setMonth(current.getMonth() + 1);
      }
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

  private getCellWidth(): number {
    switch (this.config.viewMode) {
      case 'day': return 40;
      case 'week': return 100;
      case 'month': return 120;
      default: return 40;
    }
  }

  private renderTimelineHeader(dates: Date[]): HTMLElement {
    const header = createElement('div', { className: 'timeline-header' });
    header.appendChild(createElement('div', { className: 'timeline-sidebar-spacer' }));

    const dateCells = createElement('div', { className: 'timeline-date-cells' });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cellWidth = this.getCellWidth();

    dates.forEach(date => {
      const dayCell = createElement('div', { className: 'day-cell' });
      dayCell.style.width = `${cellWidth}px`;

      if (this.config.viewMode === 'day') {
        const isToday = date.getTime() === today.getTime();
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;

        if (isToday) dayCell.addClass('today');
        if (isWeekend) dayCell.addClass('weekend');

        dayCell.appendChild(createElement('span', { className: 'day-number' }, [date.getDate().toString()]));
        dayCell.appendChild(createElement('span', { className: 'day-name' }, [
          date.toLocaleString('default', { weekday: 'short' })
        ]));

        if (isToday) {
          dayCell.appendChild(createElement('div', { className: 'today-marker' }));
        }
      } else if (this.config.viewMode === 'week') {
        // Check if today falls within this week
        const weekEnd = new Date(date);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const isCurrentWeek = today >= date && today <= weekEnd;

        if (isCurrentWeek) dayCell.addClass('today');

        // Get week number
        const startOfYear = new Date(date.getFullYear(), 0, 1);
        const weekNum = Math.ceil((((date.getTime() - startOfYear.getTime()) / 86400000) + startOfYear.getDay() + 1) / 7);

        dayCell.appendChild(createElement('span', { className: 'day-number' }, [`W${weekNum}`]));
        dayCell.appendChild(createElement('span', { className: 'day-name' }, [
          `${date.getDate()} ${date.toLocaleString('default', { month: 'short' })}`
        ]));

        if (isCurrentWeek) {
          dayCell.appendChild(createElement('div', { className: 'today-marker' }));
        }
      } else {
        // month view
        const isCurrentMonth = today.getFullYear() === date.getFullYear() && today.getMonth() === date.getMonth();

        if (isCurrentMonth) dayCell.addClass('today');

        dayCell.appendChild(createElement('span', { className: 'day-number' }, [
          date.toLocaleString('default', { month: 'short' })
        ]));
        dayCell.appendChild(createElement('span', { className: 'day-name' }, [
          date.getFullYear().toString()
        ]));

        if (isCurrentMonth) {
          dayCell.appendChild(createElement('div', { className: 'today-marker' }));
        }
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

    // Show all assignees responsively
    if (card.assignee && card.assignee.length > 0) {
      // Parse all assignees (handle both array elements and comma-separated values)
      const allAssignees: string[] = [];
      card.assignee.forEach(a => {
        const parts = a.split(',').map(p => p.trim()).filter(p => p.length > 0);
        allAssignees.push(...parts);
      });

      if (allAssignees.length > 0) {
        const assigneesContainer = createElement('div', {
          className: `assignees-stack-mini assignees-count-${Math.min(allAssignees.length, 5)}`
        });
        assigneesContainer.setAttribute('title', allAssignees.join(', '));

        // Show all assignees (limit to 3 visible + overflow indicator for compact timeline)
        const maxVisible = 3;
        const visibleAssignees = allAssignees.slice(0, maxVisible);
        const remaining = allAssignees.length - maxVisible;

        visibleAssignees.forEach((assignee, index) => {
          const avatar = createElement('div', { className: 'assignee-avatar-mini' });
          avatar.textContent = assignee.charAt(0).toUpperCase();
          avatar.style.zIndex = `${visibleAssignees.length - index}`;
          assigneesContainer.appendChild(avatar);
        });

        if (remaining > 0) {
          const moreAvatar = createElement('div', { className: 'assignee-avatar-mini assignee-more' });
          moreAvatar.textContent = `+${remaining}`;
          moreAvatar.style.zIndex = '0';
          assigneesContainer.appendChild(moreAvatar);
        }

        sidebar.appendChild(assigneesContainer);
      }
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
    const cellWidth = this.getCellWidth();
    cellsContainer.style.width = `${dates.length * cellWidth}px`;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    dates.forEach(date => {
      let isCurrentPeriod = false;
      let isWeekend = false;

      if (this.config.viewMode === 'day') {
        isCurrentPeriod = date.getTime() === today.getTime();
        isWeekend = date.getDay() === 0 || date.getDay() === 6;
      } else if (this.config.viewMode === 'week') {
        const weekEnd = new Date(date);
        weekEnd.setDate(weekEnd.getDate() + 6);
        isCurrentPeriod = today >= date && today <= weekEnd;
      } else {
        isCurrentPeriod = today.getFullYear() === date.getFullYear() && today.getMonth() === date.getMonth();
      }

      const cell = createElement('div', {
        className: `timeline-cell ${isWeekend ? 'weekend' : ''} ${isCurrentPeriod ? 'today' : ''}`
      });
      cell.style.width = `${cellWidth}px`;
      cell.style.position = 'relative';
      cellsContainer.appendChild(cell);
    });

    const bar = this.renderTimelineBar(card, startDate, dates, context);
    if (bar) {
      bar.style.position = 'absolute';
      bar.style.top = '12px';
      cellsContainer.appendChild(bar);
    }

    return cellsContainer;
  }

  private renderTimelineBar(card: KanbanCard, startDate: Date, _dates: Date[], context: ViewRendererContext): HTMLElement | null {
    const cardStart = (card as any).startDate ? new Date((card as any).startDate) : (card.dueDate ? new Date(card.dueDate) : null);
    const cardEnd = card.dueDate ? new Date(card.dueDate) : cardStart;

    if (!cardStart || !cardEnd) return null;

    const column = context.boardService.getColumn(card.columnId);
    const barColor = card.color || column?.color || '#6366f1';
    const cellWidth = this.getCellWidth();

    let startOffset: number;
    let duration: number;

    if (this.config.viewMode === 'day') {
      startOffset = Math.floor((cardStart.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      duration = Math.max(1, Math.ceil((cardEnd.getTime() - cardStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    } else if (this.config.viewMode === 'week') {
      // Calculate position in weeks
      const msPerWeek = 7 * 24 * 60 * 60 * 1000;
      startOffset = (cardStart.getTime() - startDate.getTime()) / msPerWeek;
      const endOffset = (cardEnd.getTime() - startDate.getTime()) / msPerWeek;
      duration = Math.max(0.15, endOffset - startOffset + (1 / 7)); // At least ~1 day width
    } else {
      // Month view - calculate position in months
      const startMonthDiff = (cardStart.getFullYear() - startDate.getFullYear()) * 12 + (cardStart.getMonth() - startDate.getMonth());
      const dayInMonth = cardStart.getDate() / 30; // Approximate day position within month
      startOffset = startMonthDiff + dayInMonth;

      const endMonthDiff = (cardEnd.getFullYear() - startDate.getFullYear()) * 12 + (cardEnd.getMonth() - startDate.getMonth());
      const endDayInMonth = cardEnd.getDate() / 30;
      duration = Math.max(0.1, (endMonthDiff + endDayInMonth) - startOffset + 0.1);
    }

    const bar = createElement('div', {
      className: `timeline-bar ${card.blocked ? 'blocked' : ''} ${card.completedAt ? 'completed' : ''}`,
      'data-card-id': card.id
    });
    bar.style.left = `${startOffset * cellWidth}px`;
    bar.style.width = `${Math.max(20, duration * cellWidth - 8)}px`;
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

  private renderError(container: HTMLElement, message: string, context: ViewRendererContext): void {
    container.empty();
    const errorDiv = container.createDiv({ cls: 'view-error' });

    const errorIcon = errorDiv.createDiv({ cls: 'error-icon' });
    setIcon(errorIcon, 'alert-triangle');

    errorDiv.createEl('h3', { text: '⚠️ View Error' });
    errorDiv.createEl('p', { text: message });

    const backBtn = errorDiv.createEl('button', {
      text: 'Back to Board',
      cls: 'primary-btn'
    });
    backBtn.addEventListener('click', () => {
      // Trigger re-render by calling context render
      context.render();
    });
  }
}
