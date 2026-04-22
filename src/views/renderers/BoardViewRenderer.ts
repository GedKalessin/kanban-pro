import { setIcon } from 'obsidian';
import { SwimLane, KanbanColumn, KanbanCard } from '../../models/types';
import { createElement } from '../../utils/helpers';
import { IViewRenderer, ViewRendererContext } from './IViewRenderer';
import { ColumnRenderer } from './ColumnRenderer';

export class BoardViewRenderer implements IViewRenderer {
  private columnRenderer!: ColumnRenderer;
  private selectedCards: Set<string> = new Set();

  render(container: HTMLElement, context: ViewRendererContext): void {
    this.columnRenderer = new ColumnRenderer(context);
    const board = context.boardService.getBoard();

    // ✅ DEBUG CRITICO - AGGIUNGI QUESTO
    console.log('🎨🎨🎨 BoardViewRenderer.render() START 🎨🎨🎨');
    console.log('📊 Board ID:', board.id);
    console.log('📊 Total cards in board.cards:', board.cards.length);
    console.log('📋 All board cards:', board.cards.map(c => ({
      id: c.id,
      title: c.title,
      columnId: c.columnId
    })));

    const filteredCards = context.boardService.getFilteredCards();

    console.log('🔍 Filtered cards count:', filteredCards.length);
    console.log('📋 Filtered cards:', filteredCards.map(c => ({
      id: c.id,
      title: c.title,
      columnId: c.columnId
    })));

    const columns = [...board.columns].sort((a, b) => a.order - b.order);

    container.addClass('kanban-board');

    if (board.settings.enableSwimLanes && board.swimLanes.length > 0) {
      console.log('🏊 Using SWIM LANES mode');
      this.renderWithSwimLanes(container, context, columns, filteredCards);
    } else {
      console.log('🎯 Using SIMPLE BOARD mode');
      this.renderSimpleBoard(container, context, columns, filteredCards);
    }

    console.log('🎨🎨🎨 BoardViewRenderer.render() END 🎨🎨🎨');
  }

  private renderWithSwimLanes(
    container: HTMLElement,
    context: ViewRendererContext,
    columns: KanbanColumn[],
    filteredCards: KanbanCard[]
  ): void {
    const board = context.boardService.getBoard();
    const swimLanes = [...board.swimLanes].sort((a, b) => a.order - b.order);

    // Unassigned lane
    const noLane: SwimLane = {
      id: '__no_lane__',
      name: 'Unassigned',
      color: '#94a3b8',
      order: -1,
      collapsed: false,
      assignee: null,
      tags: []
    };

    [noLane, ...swimLanes].forEach(lane => {
      container.appendChild(this.renderSwimLane(lane, columns, filteredCards, context));
    });
  }

  private renderSwimLane(
    lane: SwimLane,
    columns: KanbanColumn[],
    allCards: KanbanCard[],
    context: ViewRendererContext
  ): HTMLElement {
    const laneEl = createElement('div', {
      className: `swim-lane ${lane.collapsed ? 'collapsed' : ''}`,
      'data-lane-id': lane.id
    });

    const laneHeader = this.renderSwimLaneHeader(lane, allCards, context);
    laneEl.appendChild(laneHeader);

    if (!lane.collapsed) {
      const columnsContainer = createElement('div', { className: 'columns-container' });
      const laneCards = allCards.filter(c =>
        lane.id === '__no_lane__' ? !c.swimLaneId : c.swimLaneId === lane.id
      );

      columns.forEach(column => {
        const columnCards = laneCards.filter(c => c.columnId === column.id);
        columnsContainer.appendChild(
          this.columnRenderer.render(column, columnCards, lane.id, this.selectedCards)
        );
      });

      laneEl.appendChild(columnsContainer);
    }

    return laneEl;
  }

  private renderSwimLaneHeader(lane: SwimLane, allCards: KanbanCard[], context: ViewRendererContext): HTMLElement {
    const laneHeader = createElement('div', { className: 'swim-lane-header' });
    laneHeader.style.borderLeftColor = lane.color;

    const collapseBtn = createElement('button', { className: 'collapse-btn clickable-icon' });
    setIcon(collapseBtn, lane.collapsed ? 'chevron-right' : 'chevron-down');
    collapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (lane.id !== '__no_lane__') {
        context.boardService.updateSwimLane(lane.id, { collapsed: !lane.collapsed });
        context.render();
        context.saveBoard();
      }
    });
    laneHeader.appendChild(collapseBtn);

    laneHeader.appendChild(createElement('span', { className: 'lane-name' }, [lane.name]));

    const laneCards = allCards.filter(c =>
      lane.id === '__no_lane__' ? !c.swimLaneId : c.swimLaneId === lane.id
    );
    laneHeader.appendChild(createElement('span', { className: 'lane-card-count' }, [`${laneCards.length}`]));

    if (lane.id !== '__no_lane__') {
      const laneMenu = createElement('button', { className: 'lane-menu-btn clickable-icon' });
      setIcon(laneMenu, 'more-horizontal');
      laneMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showSwimLaneMenu(lane, e, context);
      });
      laneHeader.appendChild(laneMenu);
    }

    return laneHeader;
  }

  private renderSimpleBoard(
    container: HTMLElement,
    context: ViewRendererContext,
    columns: KanbanColumn[],
    filteredCards: KanbanCard[]
  ): void {
    const columnsContainer = createElement('div', { className: 'columns-container' });

    console.log('🏗️ renderSimpleBoard - START');
    console.log('📊 Total filteredCards:', filteredCards.length);
    console.log('📋 FilteredCards details:', filteredCards.map(c => ({ id: c.id, title: c.title, columnId: c.columnId })));

    columns.forEach(column => {
      const columnCards = filteredCards.filter(c => c.columnId === column.id);

      console.log(`📊 Column "${column.name}" (${column.id}): ${columnCards.length} cards`);
      console.log('🔍 Column cards:', columnCards.map(c => ({ id: c.id, title: c.title })));

      columnsContainer.appendChild(this.columnRenderer.render(column, columnCards, undefined, this.selectedCards));
    });

    const addColumnBtn = this.createAddColumnButton(context);
    columnsContainer.appendChild(addColumnBtn);

    container.appendChild(columnsContainer);
    console.log('🏗️ renderSimpleBoard - END');
  }

  private createAddColumnButton(context: ViewRendererContext): HTMLElement {
    const addColumnBtn = createElement('div', { className: 'add-column-btn' });
    const addIcon = createElement('span', { className: 'add-icon' });
    setIcon(addIcon, 'plus');
    addColumnBtn.appendChild(addIcon);
    addColumnBtn.appendChild(createElement('span', {}, ['Add Column']));
    addColumnBtn.addEventListener('click', () => this.addColumn(context));
    return addColumnBtn;
  }

  private addColumn(context: ViewRendererContext): void {
    const { TextInputModal: TextInputModalClass } = require('../../modals/UtilityModals');
    interface TextInputModalCallback {
        (value: string): void;
    }

    interface TextInputModalConstructor {
        new (
            app: any,
            title: string,
            placeholder: string,
            value: string,
            onSubmit: TextInputModalCallback
        ): {
            open(): void;
        };
    }

    const TextInputModal = TextInputModalClass as TextInputModalConstructor;

    new TextInputModal(
        context.app,
        'Add Column',
        'Column name',
        '',
        (value: string) => {
            context.boardService.addColumn(value);
            context.render();
            context.saveBoard();
        }
    ).open();
  }

  private showSwimLaneMenu(lane: SwimLane, event: MouseEvent, context: ViewRendererContext): void {
    const { Menu } = require('obsidian');
    const menu = new Menu();

    menu.addItem((item: any) =>
      item.setTitle('Rename').setIcon('pencil').onClick(() => this.renameLane(lane, context))
    );

    menu.addItem((item: any) =>
      item.setTitle('Change Color').setIcon('palette').onClick(() => this.changeLaneColor(lane, context))
    );

    menu.addSeparator();

    menu.addItem((item: any) =>
      item.setTitle('Delete').setIcon('trash').onClick(() => this.deleteLane(lane, context))
    );

    menu.showAtMouseEvent(event);
  }

  private renameLane(lane: SwimLane, context: ViewRendererContext): void {
    const { TextInputModal } = require('../../modals/UtilityModals');
    interface TextInputModalCallback {
        (value: string): void;
    }

    interface TextInputModalConstructor {
        new (
            app: any,
            title: string,
            placeholder: string,
            value: string,
            onSubmit: TextInputModalCallback
        ): {
            open(): void;
        };
    }


    new TextInputModal(
      context.app,
      'Rename Swim Lane',
      'Lane name',
      lane.name,
      (value: string) => {
        context.boardService.updateSwimLane(lane.id, { name: value });
        context.render();
        context.saveBoard();
      }
    ).open();
  }

  private changeLaneColor(lane: SwimLane, context: ViewRendererContext): void {
    const { ColorPickerModal } = require('../../modals/UtilityModals');
    interface ColorPickerCallback {
      (color: string): void;
    }

    interface ColorPickerModalConstructor {
      new (
        app: any,
        initialColor: string,
        onSubmit: ColorPickerCallback
      ): {
        open(): void;
      };
    }

    const ColorPickerModalClass = ColorPickerModal as ColorPickerModalConstructor;

    new ColorPickerModalClass(context.app, lane.color, (color: string) => {
      context.boardService.updateSwimLane(lane.id, { color });
      context.render();
      context.saveBoard();
    }).open();
  }

private deleteLane(lane: SwimLane, context: ViewRendererContext): void {
  const { ConfirmModal } = require('../../modals/UtilityModals');
  new ConfirmModal(
      context.app,
      'Delete Swim Lane',
      `Delete "${lane.name}"? Cards will be moved to Unassigned.`,
      () => {
        context.boardService.deleteSwimLane(lane.id);
        context.render();
        context.saveBoard();
      },
      'Delete',
      'Cancel',
      true
    ).open();
  }

  setSelectedCards(cards: Set<string>): void {
    this.selectedCards = cards;
  }
}
