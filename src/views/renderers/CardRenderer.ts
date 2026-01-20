import { setIcon } from 'obsidian';
import { KanbanCard, PRIORITY_COLORS, TASK_TYPE_ICONS } from '../../models/types';
import { 
  createElement, 
  formatDisplayDate, 
  isOverdue, 
  isDueSoon, 
  hexToRgba 
} from '../../utils/helpers';
import { ViewRendererContext } from './IViewRenderer';

export class CardRenderer {
  private context: ViewRendererContext;

  constructor(context: ViewRendererContext) {
    this.context = context;
  }

  render(card: KanbanCard, selectedCards: Set<string>): HTMLElement {
    const board = this.context.boardService.getBoard();
    const displayOptions = board.settings.cardDisplayOptions;

    const cardEl = createElement('div', {
      className: `kanban-card ${card.blocked ? 'blocked' : ''} ${selectedCards.has(card.id) ? 'selected' : ''}`,
      'data-card-id': card.id,
      draggable: 'true'
    });

    if (card.color) {
      cardEl.style.borderLeftColor = card.color;
      cardEl.style.borderLeftWidth = '4px';
    }

    // Header
    if (displayOptions.showPriority || card.taskType !== 'task') {
      cardEl.appendChild(this.renderHeader(card, displayOptions));
    }

    // Title
    const cardTitle = createElement('div', { className: 'card-title' }, [card.title]);
    cardTitle.addEventListener('click', () => this.context.onCardClick(card.id));
    cardEl.appendChild(cardTitle);

    // Tags
    if (displayOptions.showTags && card.tags.length > 0) {
      cardEl.appendChild(this.renderTags(card.tags));
    }

    // Footer
    const footerEl = this.renderFooter(card, displayOptions);
    if (footerEl) cardEl.appendChild(footerEl);

    return cardEl;
  }

  private renderHeader(card: KanbanCard, displayOptions: any): HTMLElement {
    const cardHeader = createElement('div', { className: 'card-header' });

    if (card.taskType !== 'task') {
      cardHeader.appendChild(
        createElement('span', { className: 'task-type-icon' }, [TASK_TYPE_ICONS[card.taskType]])
      );
    }

    if (displayOptions.showPriority && card.priority !== 'none') {
      const priorityBadge = createElement('span', {
        className: `priority-badge priority-${card.priority}`
      });
      priorityBadge.style.backgroundColor = hexToRgba(PRIORITY_COLORS[card.priority], 0.2);
      priorityBadge.style.color = PRIORITY_COLORS[card.priority];
      priorityBadge.textContent = card.priority.charAt(0).toUpperCase() + card.priority.slice(1);
      cardHeader.appendChild(priorityBadge);
    }

    if (card.blocked) {
      cardHeader.appendChild(createElement('span', { className: 'blocked-badge' }, ['Blocked']));
    }

    return cardHeader;
  }

  private renderTags(tags: string[]): HTMLElement {
    const tagsContainer = createElement('div', { className: 'card-tags' });
    tags.slice(0, 3).forEach(tag => {
      tagsContainer.appendChild(createElement('span', { className: 'tag' }, [tag]));
    });
    if (tags.length > 3) {
      tagsContainer.appendChild(
        createElement('span', { className: 'tag more' }, [`+${tags.length - 3}`])
      );
    }
    return tagsContainer;
  }

  private renderFooter(card: KanbanCard, displayOptions: any): HTMLElement | null {
    const cardFooter = createElement('div', { className: 'card-footer' });
    let hasFooterContent = false;

    // Due Date
    if (displayOptions.showDueDate && card.dueDate) {
      hasFooterContent = true;
      const dueDateEl = createElement('div', {
        className: `due-date ${isOverdue(card.dueDate) ? 'overdue' : ''} ${isDueSoon(card.dueDate) ? 'due-soon' : ''}`
      });
      const calIcon = createElement('span', { className: 'icon' });
      setIcon(calIcon, 'calendar');
      dueDateEl.appendChild(calIcon);
      dueDateEl.appendChild(createElement('span', {}, [formatDisplayDate(card.dueDate)]));
      cardFooter.appendChild(dueDateEl);
    }

    // Checklist Progress
    if (displayOptions.showChecklist && card.checklist.length > 0) {
      hasFooterContent = true;
      const completed = card.checklist.filter(i => i.completed).length;
      const checklistEl = createElement('div', {
        className: `checklist-progress ${completed === card.checklist.length ? 'complete' : ''}`
      });
      const checkIcon = createElement('span', { className: 'icon' });
      setIcon(checkIcon, 'check-square');
      checklistEl.appendChild(checkIcon);
      checklistEl.appendChild(createElement('span', {}, [`${completed}/${card.checklist.length}`]));
      cardFooter.appendChild(checklistEl);
    }

    if (hasFooterContent) {
      cardFooter.appendChild(createElement('div', { className: 'spacer' }));
    }

    // Assignees
    if (displayOptions.showAssignee && card.assignee.length > 0) {
      hasFooterContent = true;
      cardFooter.appendChild(this.renderAssignees(card.assignee));
    }

    return hasFooterContent ? cardFooter : null;
  }

  private renderAssignees(assignees: string[]): HTMLElement {
    const assigneesEl = createElement('div', { className: 'assignees' });
    assignees.slice(0, 3).forEach(assignee => {
      const avatar = createElement('div', { className: 'assignee-avatar' });
      avatar.textContent = assignee.charAt(0).toUpperCase();
      avatar.title = assignee;
      assigneesEl.appendChild(avatar);
    });
    if (assignees.length > 3) {
      const more = createElement('div', { className: 'assignee-avatar more' });
      more.textContent = `+${assignees.length - 3}`;
      assigneesEl.appendChild(more);
    }
    return assigneesEl;
  }
}
