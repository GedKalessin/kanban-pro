import { Menu, setIcon } from 'obsidian';
import { KanbanColumn, KanbanCard } from '../../models/types';
import { createElement } from '../../utils/helpers';
import { ViewRendererContext } from './IViewRenderer';
import { CardRenderer } from './CardRenderer';
import { TextInputModal, QuickAddCardModal, ColorPickerModal, ConfirmModal } from '../../modals/UtilityModals';

export class ColumnRenderer {
  private context: ViewRendererContext;
  private cardRenderer: CardRenderer;

  constructor(context: ViewRendererContext) {
    this.context = context;
    this.cardRenderer = new CardRenderer(context);
  }

  render(column: KanbanColumn, cards: KanbanCard[], swimLaneId?: string, selectedCards: Set<string> = new Set()): HTMLElement {
    const board = this.context.boardService.getBoard();

    console.debug('🎨 ColumnRenderer.render() - Column:', column.name, 'ID:', column.id, 'Board ID:', board.id);

    const columnEl = createElement('div', {
      className: `kanban-column ${column.collapsed ? 'collapsed' : ''}`,
      'data-column-id': column.id,
      'data-board-id': board.id,
      'data-swim-lane-id': swimLaneId || ''
    });

    // Add status category
    const statusCategory = this.context.boardService.getColumnStatusCategory(column.id);
    if (statusCategory) {
      columnEl.dataset.statusCategory = statusCategory;
    }

    if (this.context.boardService.isWipLimitExceeded(column.id)) {
      columnEl.addClass('wip-exceeded');
    }

    // Header
    const header = this.renderHeader(column, cards.length);
    columnEl.appendChild(header);

    // Content
    if (!column.collapsed) {
      columnEl.appendChild(this.renderContent(column, cards, swimLaneId, selectedCards));
    }

    return columnEl;
  }

  private renderHeader(column: KanbanColumn, cardCount: number): HTMLElement {
    const board = this.context.boardService.getBoard();
    const header = createElement('div', { className: 'column-header' });
    header.style.borderTopColor = column.color;

    // Left section
    const headerLeft = createElement('div', { className: 'header-left' });

    const collapseBtn = createElement('button', { className: 'collapse-btn clickable-icon' });
    setIcon(collapseBtn, column.collapsed ? 'chevron-right' : 'chevron-down');
    collapseBtn.addEventListener('click', () => {
      this.context.boardService.updateColumn(column.id, { collapsed: !column.collapsed });
      this.context.render();
      this.context.saveBoard();
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
    count.textContent = column.wipLimit && board.settings.enableWipLimits
      ? `${cardCount}/${column.wipLimit}`
      : `${cardCount}`;
    if (this.context.boardService.isWipLimitExceeded(column.id)) {
      count.addClass('exceeded');
    }
    titleWrapper.appendChild(count);

    headerLeft.appendChild(titleWrapper);
    header.appendChild(headerLeft);

    // Right section
    const headerRight = createElement('div', { className: 'header-right' });

    const addCardBtn = createElement('button', { className: 'add-card-btn clickable-icon' });
    setIcon(addCardBtn, 'plus');
    addCardBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      console.debug('➕ Add card button clicked for column:', column.name);

      // Validate that we're still on the same board
      const currentBoard = this.context.boardService.getBoard();
      const columnElement = (e.target as HTMLElement).closest('.kanban-column') as HTMLElement;
      const elementBoardId = columnElement?.dataset.boardId;

      if (elementBoardId && elementBoardId !== currentBoard.id) {
        console.warn('⚠️ Ignoring click on stale column element. Element board:', elementBoardId, 'Current board:', currentBoard.id);
        return;
      }

      this.quickAddCard(column.id);
    });
    headerRight.appendChild(addCardBtn);

    const menuBtn = createElement('button', { className: 'column-menu-btn clickable-icon' });
    setIcon(menuBtn, 'more-horizontal');
    menuBtn.addEventListener('click', (e) => this.showColumnMenu(column, e));
    headerRight.appendChild(menuBtn);

    header.appendChild(headerRight);
    return header;
  }

  private renderContent(column: KanbanColumn, cards: KanbanCard[], swimLaneId?: string, selectedCards: Set<string> = new Set()): HTMLElement {
    const content = createElement('div', { className: 'column-content' });
    content.dataset.columnId = column.id;
    content.dataset.swimLaneId = swimLaneId || '';

    console.debug(`Rendering ${cards.length} cards for column ${column.name}`);

    [...cards].sort((a, b) => a.order - b.order).forEach(card => {
      console.debug('Rendering card:', card.title);
      content.appendChild(this.cardRenderer.render(card, selectedCards));
    });

    content.appendChild(createElement('div', { className: 'drop-zone' }));
    return content;
  }

  private editColumnName(column: KanbanColumn): void {
    new TextInputModal(
      this.context.app,
      'Rename Column',
      'Column name',
      column.name,
      (value: string) => {
        this.context.boardService.updateColumn(column.id, { name: value });
        this.context.render();
        this.context.saveBoard();
      }
    ).open();
  }

  private quickAddCard(columnId: string, swimLaneId?: string): void {
    console.debug('🎯 quickAddCard called for column:', columnId, 'swimLaneId:', swimLaneId);

    const board = this.context.boardService.getBoard();
    console.debug('📊 Current board ID:', board.id);
    console.debug('📊 Current board columns:', board.columns.map(c => ({ id: c.id, name: c.name })));

    const column = this.context.boardService.getColumn(columnId);
    if (!column) {
      console.error('❌ Column not found in current board:', columnId);
      console.error('❌ Available columns:', board.columns.map(c => c.id));
      return;
    }

    console.debug('📦 Opening QuickAddCardModal');

    new QuickAddCardModal(
      this.context.app,
      (title: string, startDate?: string, dueDate?: string): void => {
        console.debug('✨ Card creation callback triggered:', { title, startDate, dueDate, columnId, swimLaneId });
        console.debug('📊 Board cards BEFORE add:', this.context.boardService.getBoard().cards.length);

        const newCard = this.context.boardService.addCard(columnId, {
          title,
          swimLaneId,
          startDate: startDate ?? null,
          dueDate: dueDate ?? null
        });

        console.debug('✅ Card created:', newCard);
        console.debug('📊 Board cards AFTER add:', this.context.boardService.getBoard().cards.length);
        console.debug('📋 All cards:', this.context.boardService.getBoard().cards.map(c => ({ id: c.id, title: c.title, columnId: c.columnId })));

        this.context.render();
        console.debug('🔄 Render completed');

        this.context.saveBoard();
        console.debug('💾 Save completed');
      }
    ).open();
  }

  private showColumnMenu(column: KanbanColumn, event: MouseEvent): void {
    const menu = new Menu();

    menu.addItem((item) =>
      item.setTitle('Rename').setIcon('pencil').onClick(() => this.editColumnName(column))
    );

    menu.addItem((item) =>
      item.setTitle('Change Color').setIcon('palette').onClick(() => this.changeColumnColor(column))
    );

    menu.addItem((item) =>
      item.setTitle(column.wipLimit ? 'Edit WIP Limit' : 'Set WIP Limit')
        .setIcon('hash')
        .onClick(() => this.setWipLimit(column))
    );

    menu.addSeparator();

    menu.addItem((item) =>
      item.setTitle('Delete Column').setIcon('trash').onClick(() => this.deleteColumn(column))
    );

    menu.showAtMouseEvent(event);
  }

  private changeColumnColor(column: KanbanColumn): void {
    new ColorPickerModal(
      this.context.app,
      column.color,
      (color: string) => {
        this.context.boardService.updateColumn(column.id, { color });
        this.context.render();
        this.context.saveBoard();
      }
    ).open();
  }

  private setWipLimit(column: KanbanColumn): void {
    new TextInputModal(
      this.context.app,
      'Set WIP Limit',
      'Maximum cards in this column',
      column.wipLimit?.toString() || '',
      (value: string) => {
        const limit: number = parseInt(value);
        this.context.boardService.updateColumn(column.id, { wipLimit: isNaN(limit) ? null : limit });
        this.context.render();
        this.context.saveBoard();
      }
    ).open();
  }

  private deleteColumn(column: KanbanColumn): void {
    new ConfirmModal(
      this.context.app,
      'Delete Column',
      `Delete "${column.name}" and all its cards?`,
      () => {
        this.context.boardService.deleteColumn(column.id);
        this.context.render();
        this.context.saveBoard();
      },
      'Delete',
      'Cancel',
      true
    ).open();
  }
}
