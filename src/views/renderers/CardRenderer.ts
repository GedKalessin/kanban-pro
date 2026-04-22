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
      className: `kanban-card ${card.blocked ? 'blocked' : ''} ${card.completedAt ? 'completed' : ''} ${selectedCards.has(card.id) ? 'selected' : ''}`,
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

    // Subtask inline preview
    if (displayOptions.showChecklist && card.checklist.length > 0) {
      cardEl.appendChild(this.renderSubtaskSection(card));
    }

    // Tags
    if (displayOptions.showTags && card.tags.length > 0) {
      cardEl.appendChild(this.renderTags(card.tags));
    }

    // Footer
    const footerEl = this.renderFooter(card, displayOptions);
    if (footerEl) cardEl.appendChild(footerEl);

    return cardEl;
  }

  private renderSubtaskSection(card: KanbanCard): HTMLElement {
    const section = createElement('div', { className: 'subtask-section' });
    const items = card.checklist;

    const getCompleted = () => items.filter(i => i.completed).length;

    // Header row: icon + count + chevron
    const header = createElement('div', { className: 'subtask-header' });
    const headerLeft = createElement('div', { className: 'subtask-header-left' });
    const listIcon = createElement('span', { className: 'subtask-icon icon' });
    setIcon(listIcon, 'list-checks');
    const countEl = createElement('span', { className: 'subtask-count-text' });
    countEl.textContent = `${getCompleted()}/${items.length} subtasks`;
    headerLeft.appendChild(listIcon);
    headerLeft.appendChild(countEl);
    const chevronEl = createElement('span', { className: 'subtask-chevron icon' });
    setIcon(chevronEl, 'chevron-right');
    header.appendChild(headerLeft);
    header.appendChild(chevronEl);

    // Progress bar
    const progressTrack = createElement('div', { className: 'subtask-progress-track' });
    const progressFill = createElement('div', { className: 'subtask-progress-fill' });
    const updateProgress = () => {
      const completed = getCompleted();
      const pct = items.length > 0 ? (completed / items.length) * 100 : 0;
      progressFill.style.width = `${pct}%`;
      progressFill.className = `subtask-progress-fill${pct === 100 ? ' complete' : ''}`;
      countEl.textContent = `${completed}/${items.length} subtasks`;
    };
    updateProgress();
    progressTrack.appendChild(progressFill);

    // Subtask list (collapsed by default)
    const list = createElement('div', { className: 'subtask-list' });
    const previewItems = items.slice(0, 3);

    previewItems.forEach(item => {
      const row = createElement('div', { className: `subtask-row${item.completed ? ' completed' : ''}` });

      const cb = createElement('div', { className: `subtask-checkbox${item.completed ? ' checked' : ''}` });
      const cbIcon = createElement('span', { className: 'icon' });
      if (item.completed) setIcon(cbIcon, 'check');
      cb.appendChild(cbIcon);

      const text = createElement('span', { className: 'subtask-text' });
      text.textContent = item.text;

      row.appendChild(cb);
      row.appendChild(text);

      cb.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const newCompleted = !item.completed;
        item.completed = newCompleted;
        this.context.boardService.updateChecklistItem(card.id, item.id, { completed: newCompleted });
        this.context.saveBoard();
        cb.classList.toggle('checked', newCompleted);
        row.classList.toggle('completed', newCompleted);
        if (newCompleted) {
          setIcon(cbIcon, 'check');
        } else {
          cbIcon.innerHTML = '';
        }
        updateProgress();
      });

      text.addEventListener('click', (e) => {
        e.stopPropagation();
        this.context.onCardClick(card.id);
      });

      list.appendChild(row);
    });

    if (items.length > 3) {
      const moreEl = createElement('div', { className: 'subtask-more' });
      moreEl.textContent = `+${items.length - 3} more`;
      moreEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.context.onCardClick(card.id);
      });
      list.appendChild(moreEl);
    }

    // Toggle expand/collapse
    let expanded = false;
    const toggle = (e: MouseEvent) => {
      e.stopPropagation();
      expanded = !expanded;
      list.classList.toggle('visible', expanded);
      chevronEl.classList.toggle('expanded', expanded);
      section.classList.toggle('expanded', expanded);
    };
    header.addEventListener('click', toggle);
    progressTrack.addEventListener('click', toggle);

    section.appendChild(header);
    section.appendChild(progressTrack);
    section.appendChild(list);

    return section;
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

    if (hasFooterContent) {
      cardFooter.appendChild(createElement('div', { className: 'spacer' }));
    }

    // Assignees
    if (displayOptions.showAssignee && card.assignee.length > 0) {
      hasFooterContent = true;
      cardFooter.appendChild(this.renderAssignees(card.assignee));
    }

    // Completion status
    if (card.completedAt) {
      hasFooterContent = true;
      const completedEl = createElement('div', { className: 'completed-badge' });
      const checkIcon = createElement('span', { className: 'icon' });
      setIcon(checkIcon, 'check-circle-2');
      completedEl.appendChild(checkIcon);
      completedEl.appendChild(createElement('span', {}, ['Done']));
      cardFooter.appendChild(completedEl);
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
