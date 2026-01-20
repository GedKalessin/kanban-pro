import { setIcon } from 'obsidian';
import { PRIORITY_COLORS } from '../../models/types';
import { createElement, formatDisplayDate, isOverdue } from '../../utils/helpers';
import { IViewRenderer, ViewRendererContext } from './IViewRenderer';

export class ListViewRenderer implements IViewRenderer {
  render(container: HTMLElement, context: ViewRendererContext): void {
    container.addClass('kanban-list-view');

    const board = context.boardService.getBoard();
    const filteredCards = context.boardService.getFilteredCards();
    const columns = [...board.columns].sort((a, b) => a.order - b.order);

    columns.forEach(column => {
      const columnCards = filteredCards
        .filter(c => c.columnId === column.id)
        .sort((a, b) => a.order - b.order);

      const sectionEl = createElement('div', { className: 'list-section' });

      // Section Header
      const sectionHeader = createElement('div', { className: 'list-section-header' });
      const colorDot = createElement('span', { className: 'color-dot' });
      colorDot.style.backgroundColor = column.color;
      sectionHeader.appendChild(colorDot);
      sectionHeader.appendChild(createElement('span', { className: 'section-title' }, [column.name]));
      sectionHeader.appendChild(createElement('span', { className: 'section-count' }, [`(${columnCards.length})`]));
      sectionEl.appendChild(sectionHeader);

      // List Items
      const listItems = createElement('div', { className: 'list-items' });
      columnCards.forEach(card => {
        const itemEl = createElement('div', { className: 'list-item', 'data-card-id': card.id });

        const priorityDot = createElement('span', { className: `priority-dot priority-${card.priority}` });
        priorityDot.style.backgroundColor = PRIORITY_COLORS[card.priority];
        itemEl.appendChild(priorityDot);

        const title = createElement('span', { className: 'item-title' }, [card.title]);
        title.addEventListener('click', () => context.onCardClick(card.id));
        itemEl.appendChild(title);

        // Tags
        if (card.tags.length > 0) {
          const tagsEl = createElement('span', { className: 'item-tags' });
          card.tags.slice(0, 2).forEach(tag => {
            const tagEl = createElement('span', { className: 'tag-mini' }, [tag]);
            tagsEl.appendChild(tagEl);
          });
          itemEl.appendChild(tagsEl);
        }

        // Due Date
        if (card.dueDate) {
          const dueDate = createElement('span', {
            className: `item-due-date ${isOverdue(card.dueDate) ? 'overdue' : ''}`
          }, [formatDisplayDate(card.dueDate)]);
          itemEl.appendChild(dueDate);
        }

        // Assignees
        if (card.assignee.length > 0) {
          const assigneeEl = createElement('span', { className: 'item-assignee' }, [card.assignee[0]]);
          itemEl.appendChild(assigneeEl);
        }

        listItems.appendChild(itemEl);
      });

      sectionEl.appendChild(listItems);
      container.appendChild(sectionEl);
    });
  }
}
