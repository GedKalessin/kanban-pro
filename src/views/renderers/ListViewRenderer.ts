// ============================================
// FIX COMPLETO: src/views/renderers/ListViewRenderer.ts
// List View Moderna e Funzionale
// ============================================

import { setIcon, Notice, Menu } from 'obsidian';
import { KanbanCard, Priority, PRIORITY_COLORS } from '../../models/types';
import { createElement, formatDisplayDate } from '../../utils/helpers';
import { IViewRenderer, ViewRendererContext } from './IViewRenderer';

export class ListViewRenderer implements IViewRenderer {
  private sortBy: 'dueDate' | 'priority' | 'column' | 'created' = 'column';
  private sortOrder: 'asc' | 'desc' = 'asc';
  private groupBy: 'none' | 'column' | 'assignee' | 'priority' | 'status' = 'column';

  render(container: HTMLElement, context: ViewRendererContext): void {
    this.currentContext = context;

    container.empty();
    container.addClass('kanban-list-view');

    const toolbar = this.renderToolbar(context);
    container.appendChild(toolbar);

    const filteredCards = context.boardService.getFilteredCards();

    if (filteredCards.length === 0) {
      container.appendChild(this.renderEmptyState(context));
      return;
    }

    const listContainer = container.createDiv({ cls: 'list-container' });

    if (this.groupBy === 'none') {
      this.renderFlatList(listContainer, filteredCards, context);
    } else {
      this.renderGroupedList(listContainer, filteredCards, context);
    }
  }

  private renderToolbar(context: ViewRendererContext): HTMLElement {
    const toolbar = createElement('div', { className: 'list-toolbar' });

    // Sort controls
    const sortSection = toolbar.createDiv({ cls: 'sort-section' });
    sortSection.createEl('span', { text: 'Sort by:', cls: 'sort-label' });

    const sortSelect = sortSection.createEl('select', { cls: 'sort-select' });
    const sortOptions = [
      { value: 'column', label: 'Column' },
      { value: 'dueDate', label: 'Due Date' },
      { value: 'priority', label: 'Priority' },
      { value: 'created', label: 'Created' }
    ];

    sortOptions.forEach(opt => {
      const option = sortSelect.createEl('option', { value: opt.value, text: opt.label });
      if (opt.value === this.sortBy) option.selected = true;
    });

    sortSelect.addEventListener('change', () => {
      this.sortBy = sortSelect.value as any;
      context.render();
    });

    // Sort direction
    const sortOrderBtn = sortSection.createEl('button', { cls: 'sort-order-btn' });
    setIcon(sortOrderBtn, this.sortOrder === 'asc' ? 'arrow-up' : 'arrow-down');
    sortOrderBtn.addEventListener('click', () => {
      this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
      context.render();
    });

    // Group controls
    const groupSection = toolbar.createDiv({ cls: 'group-section' });
    groupSection.createEl('span', { text: 'Group by:', cls: 'group-label' });

    const groupSelect = groupSection.createEl('select', { cls: 'group-select' });
    const groupOptions = [
      { value: 'none', label: 'None' },
      { value: 'column', label: 'Column' },
      { value: 'priority', label: 'Priority' },
      { value: 'assignee', label: 'Assignee' },
      { value: 'status', label: 'Status' }
    ];

    groupOptions.forEach(opt => {
      const option = groupSelect.createEl('option', { value: opt.value, text: opt.label });
      if (opt.value === this.groupBy) option.selected = true;
    });

    groupSelect.addEventListener('change', () => {
      this.groupBy = groupSelect.value as any;
      context.render();
    });

    return toolbar;
  }

  private renderFlatList(container: HTMLElement, cards: KanbanCard[], context: ViewRendererContext): void {
    const sortedCards = this.sortCards(cards);

    const listTable = container.createDiv({ cls: 'list-table' });

    // Header
    const header = listTable.createDiv({ cls: 'list-header' });
    this.renderHeader(header);

    // Cards
    const tbody = listTable.createDiv({ cls: 'list-body' });
    sortedCards.forEach(card => {
      const row = this.renderCardRow(card, context);
      tbody.appendChild(row);
    });
  }

  private renderGroupedList(container: HTMLElement, cards: KanbanCard[], context: ViewRendererContext): void {
    const groups = this.groupCards(cards);

    groups.forEach(group => {
      const groupSection = container.createDiv({ cls: 'list-group' });

      // Group header
      const groupHeader = groupSection.createDiv({ cls: 'list-group-header' });
      
      const headerLeft = groupHeader.createDiv({ cls: 'group-header-left' });
      const icon = headerLeft.createDiv({ cls: 'group-icon' });
      setIcon(icon, this.getGroupIcon(group.key));
      
      const groupTitle = headerLeft.createDiv({ cls: 'group-title' });
      groupTitle.textContent = group.name;
      
      const count = headerLeft.createDiv({ cls: 'group-count' });
      count.textContent = `${group.cards.length}`;

      // Group table
      const listTable = groupSection.createDiv({ cls: 'list-table' });
      
      const header = listTable.createDiv({ cls: 'list-header' });
      this.renderHeader(header);

      const tbody = listTable.createDiv({ cls: 'list-body' });
      const sortedCards = this.sortCards(group.cards);
      sortedCards.forEach(card => {
        const row = this.renderCardRow(card, context);
        tbody.appendChild(row);
      });
    });
  }

  private renderHeader(container: HTMLElement): void {
    const columns = [
      { key: 'title', label: 'Title', width: '30%' },
      { key: 'column', label: 'Column', width: '15%' },
      { key: 'priority', label: 'Priority', width: '10%' },
      { key: 'assignee', label: 'Assignee', width: '15%' },
      { key: 'dueDate', label: 'Due Date', width: '15%' },
      { key: 'progress', label: 'Progress', width: '10%' },
      { key: 'actions', label: '', width: '5%' }
    ];

    columns.forEach(col => {
      const cell = container.createDiv({ cls: 'list-header-cell' });
      cell.textContent = col.label;
      cell.style.width = col.width;
    });
  }

  private renderCardRow(card: KanbanCard, context: ViewRendererContext): HTMLElement {
    const row = createElement('div', {
      className: `list-row ${card.completedAt ? 'completed' : ''} ${card.blocked ? 'blocked' : ''}`,
      'data-card-id': card.id
    });

    // Title
    const titleCell = row.createDiv({ cls: 'list-cell cell-title' });
    const checkbox = titleCell.createEl('input', { type: 'checkbox' });
    checkbox.checked = !!card.completedAt;
    checkbox.addEventListener('change', () => {
      context.boardService.updateCard(card.id, {
        completedAt: checkbox.checked ? new Date().toISOString() : null
      });
      context.render();
      context.saveBoard();
    });

    const titleLink = titleCell.createDiv({ cls: 'card-title-link' });
    titleLink.textContent = card.title;
    titleLink.addEventListener('click', () => context.onCardClick(card.id));

    if (card.tags.length > 0) {
      const tagsWrapper = titleCell.createDiv({ cls: 'card-tags-inline' });
      card.tags.slice(0, 3).forEach(tag => {
        const tagEl = tagsWrapper.createDiv({ cls: 'tag-inline' });
        tagEl.textContent = tag;
      });
      if (card.tags.length > 3) {
        tagsWrapper.createDiv({ cls: 'tag-more', text: `+${card.tags.length - 3}` });
      }
    }

    // Column
    const columnCell = row.createDiv({ cls: 'list-cell cell-column' });
    const column = context.boardService.getColumn(card.columnId);
    if (column) {
      const columnBadge = columnCell.createDiv({ cls: 'column-badge' });
      columnBadge.textContent = column.name;
      columnBadge.style.backgroundColor = column.color;
    }

    // Priority
    const priorityCell = row.createDiv({ cls: 'list-cell cell-priority' });
    if (card.priority) {
      const priorityBadge = priorityCell.createDiv({ cls: 'priority-badge' });
      priorityBadge.textContent = card.priority;
      priorityBadge.style.backgroundColor = PRIORITY_COLORS[card.priority];
    }

    // Assignee
    const assigneeCell = row.createDiv({ cls: 'list-cell cell-assignee' });
    if (card.assignee && card.assignee.length > 0) {
      const assigneeAvatar = assigneeCell.createDiv({ cls: 'assignee-avatar' });
      assigneeAvatar.textContent = card.assignee[0].charAt(0).toUpperCase();
      assigneeAvatar.setAttribute('title', card.assignee.join(', '));
    }

    // Due Date
    const dueDateCell = row.createDiv({ cls: 'list-cell cell-due-date' });
    if (card.dueDate) {
      const dueDate = new Date(card.dueDate);
      const now = new Date();
      const isOverdue = dueDate < now && !card.completedAt;
      
      const dueDateEl = dueDateCell.createDiv({
        cls: `due-date-badge ${isOverdue ? 'overdue' : ''}`
      });
      const dateIcon = dueDateEl.createSpan({ cls: 'date-icon' });
      setIcon(dateIcon, 'calendar');
      dueDateEl.appendChild(document.createTextNode(formatDisplayDate(card.dueDate)));
    }

    // Progress
    const progressCell = row.createDiv({ cls: 'list-cell cell-progress' });
    if (card.checklist.length > 0) {
      const completed = card.checklist.filter(i => i.completed).length;
      const total = card.checklist.length;
      const percent = (completed / total) * 100;

      const progressBar = progressCell.createDiv({ cls: 'progress-bar-mini' });
      const progressFill = progressBar.createDiv({ cls: 'progress-fill-mini' });
      progressFill.style.width = `${percent}%`;

      const progressText = progressCell.createDiv({ cls: 'progress-text-mini' });
      progressText.textContent = `${completed}/${total}`;
    }

    // Actions
    const actionsCell = row.createDiv({ cls: 'list-cell cell-actions' });
    const menuBtn = actionsCell.createDiv({ cls: 'row-menu-btn' });
    setIcon(menuBtn, 'more-vertical');
    menuBtn.addEventListener('click', (e) => this.showCardMenu(card, e, context));

    return row;
  }

  private sortCards(cards: KanbanCard[]): KanbanCard[] {
    const sorted = [...cards];

    sorted.sort((a, b) => {
      let comparison = 0;

      switch (this.sortBy) {
        case 'dueDate':
          const dateA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
          const dateB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
          comparison = dateA - dateB;
          break;
        case 'priority':
          const priorityOrder: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };
          const prioA = a.priority ? priorityOrder[a.priority] : 4;
          const prioB = b.priority ? priorityOrder[b.priority] : 4;
          comparison = prioA - prioB;
          break;
        case 'created':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'column':
        default:
          comparison = a.columnId.localeCompare(b.columnId);
      }

      return this.sortOrder === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }

  private groupCards(cards: KanbanCard[]): Array<{ key: string; name: string; cards: KanbanCard[] }> {
    const groups = new Map<string, { name: string; cards: KanbanCard[] }>();

    cards.forEach(card => {
      let key = '';
      let name = '';

      switch (this.groupBy) {
        case 'column':
          key = card.columnId;
          const column = this.currentContext?.boardService.getColumn(card.columnId);
          name = column?.name || 'Unknown';
          break;
        case 'priority':
          key = card.priority || 'none';
          name = card.priority ? card.priority.charAt(0).toUpperCase() + card.priority.slice(1) : 'No Priority';
          break;
        case 'assignee':
          key = card.assignee && card.assignee.length > 0 ? card.assignee[0] : 'unassigned';
          name = card.assignee && card.assignee.length > 0 ? card.assignee.join(', ') : 'Unassigned';
          break;
        case 'status':
          key = card.completedAt ? 'completed' : card.blocked ? 'blocked' : 'active';
          name = card.completedAt ? 'Completed' : card.blocked ? 'Blocked' : 'Active';
          break;
      }

      if (!groups.has(key)) {
        groups.set(key, { name, cards: [] });
      }
      groups.get(key)!.cards.push(card);
    });

    return Array.from(groups.entries()).map(([key, group]) => ({
      key,
      name: group.name,
      cards: group.cards
    }));
  }

  private getGroupIcon(key: string): string {
    switch (this.groupBy) {
      case 'column': return 'columns';
      case 'priority': return 'alert-circle';
      case 'assignee': return 'user';
      case 'status': return 'activity';
      default: return 'folder';
    }
  }

  private showCardMenu(card: KanbanCard, e: MouseEvent, context: ViewRendererContext): void {
    const menu = new Menu();

    menu.addItem(item => {
      item.setTitle('Open').setIcon('eye').onClick(() => {
        context.onCardClick(card.id);
      });
    });

    menu.addItem(item => {
      item.setTitle(card.completedAt ? 'Mark Incomplete' : 'Mark Complete')
        .setIcon(card.completedAt ? 'circle' : 'check-circle')
        .onClick(() => {
          context.boardService.updateCard(card.id, {
            completedAt: card.completedAt ? null : new Date().toISOString()
          });
          context.render();
          context.saveBoard();
        });
    });

    menu.addSeparator();

    menu.addItem(item => {
      item.setTitle('Delete').setIcon('trash-2').onClick(() => {
        const { ConfirmModal } = require('../../modals/UtilityModals');
        new ConfirmModal(
          context.app,
          'Delete Card',
          `Delete "${card.title}"?`,
          () => {
            context.boardService.deleteCard(card.id);
            context.render();
            context.saveBoard();
          },
          'Delete',
          'Cancel',
          true
        ).open();
      });
    });

    menu.showAtMouseEvent(e);
  }

  private renderEmptyState(context: ViewRendererContext): HTMLElement {
    const emptyState = createElement('div', { className: 'empty-state list-empty' });
    const emptyIcon = createElement('div', { className: 'empty-icon' });
    setIcon(emptyIcon, 'list');
    emptyState.appendChild(emptyIcon);
    emptyState.appendChild(createElement('h3', {}, ['No cards to display']));
    emptyState.appendChild(createElement('p', {}, ['Create cards to see them in list view.']));
    return emptyState;
  }

  private currentContext: ViewRendererContext | null = null;

  cleanup(): void {
    this.currentContext = null;
  }
}
