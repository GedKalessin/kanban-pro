import { Notice } from 'obsidian';
import { BoardService } from './BoardService';

export class DragDropService {
  private boardService: BoardService;
  private draggedCard: HTMLElement | null = null;
  private draggedColumn: HTMLElement | null = null;
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private isDraggingColumn: boolean = false;
  private onUpdate: () => void;
  private onSave: () => void;

  constructor(boardService: BoardService, onUpdate: () => void, onSave: () => void) {
    this.boardService = boardService;
    this.onUpdate = onUpdate;
    this.onSave = onSave;
  }

  setupDragAndDrop(container: HTMLElement): void {
    this.setupCardDragAndDrop(container);
    this.setupColumnDragAndDrop(container);
  }

  private setupCardDragAndDrop(container: HTMLElement): void {
    // Card drag start
    container.addEventListener('dragstart', (e: DragEvent) => {
      const target = e.target as HTMLElement;
      if (!target.classList.contains('kanban-card')) return;

      this.draggedCard = target;
      target.classList.add('dragging');

      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', target.innerHTML);
      }
    });

    // Card drag end
    container.addEventListener('dragend', (e: DragEvent) => {
      const target = e.target as HTMLElement;
      if (!target.classList.contains('kanban-card')) return;

      target.classList.remove('dragging');
      this.draggedCard = null;

      // Clean up all drag-over classes
      container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });

    // Card drag over
    container.addEventListener('dragover', (e: DragEvent) => {
      e.preventDefault();
      if (!this.draggedCard) return;

      const target = e.target as HTMLElement;
      const columnContent = target.closest('.column-content') as HTMLElement;

      if (!columnContent) return;

      const afterElement = this.getDragAfterElement(columnContent, e.clientY);
      
      if (afterElement == null) {
        columnContent.appendChild(this.draggedCard);
      } else {
        columnContent.insertBefore(this.draggedCard, afterElement);
      }
    });

    // Card drop
    container.addEventListener('drop', (e: DragEvent) => {
      e.preventDefault();
      if (!this.draggedCard) return;

      const target = e.target as HTMLElement;
      const columnContent = target.closest('.column-content') as HTMLElement;

      if (!columnContent) return;

      const cardId = this.draggedCard.dataset.cardId;
      const toColumnId = columnContent.dataset.columnId;
      const swimLaneId = columnContent.dataset.swimLaneId || undefined;

      if (!cardId || !toColumnId) return;

      // Calculate new order
      const cards = Array.from(columnContent.querySelectorAll('.kanban-card'));
      const newOrder = cards.indexOf(this.draggedCard);

      // Update board
      this.boardService.moveCard(cardId, toColumnId, newOrder, swimLaneId);
      this.onUpdate();
      this.onSave();

      new Notice('✓ Card moved', 1000);
    });
  }

  private setupColumnDragAndDrop(container: HTMLElement): void {
    // Column drag start
    container.addEventListener('mousedown', (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const columnHeader = target.closest('.column-header');
      
      if (!columnHeader) return;
      if (target.closest('button')) return; // Ignore buttons

      const column = columnHeader.closest('.kanban-column') as HTMLElement;
      if (!column) return;

      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.isDraggingColumn = false;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = Math.abs(moveEvent.clientX - this.dragStartX);
        const deltaY = Math.abs(moveEvent.clientY - this.dragStartY);

        if (!this.isDraggingColumn && (deltaX > 5 || deltaY > 5)) {
          this.isDraggingColumn = true;
          this.draggedColumn = column;
          column.classList.add('dragging-column');
          document.body.style.cursor = 'grabbing';
        }

        if (this.isDraggingColumn && this.draggedColumn) {
          this.handleColumnDrag(moveEvent);
        }
      };

      const onMouseUp = () => {
        if (this.isDraggingColumn && this.draggedColumn) {
          this.handleColumnDrop();
        }

        this.isDraggingColumn = false;
        this.draggedColumn = null;
        document.body.style.cursor = '';
        
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  private handleColumnDrag(e: MouseEvent): void {
    if (!this.draggedColumn) return;

    const columnsContainer = this.draggedColumn.parentElement;
    if (!columnsContainer) return;

    const columns = Array.from(columnsContainer.querySelectorAll('.kanban-column'));
    const afterElement = this.getDragAfterColumn(columnsContainer, e.clientX);

    if (afterElement == null) {
      columnsContainer.appendChild(this.draggedColumn);
    } else {
      columnsContainer.insertBefore(this.draggedColumn, afterElement);
    }
  }

  private handleColumnDrop(): void {
    if (!this.draggedColumn) return;

    const columnId = this.draggedColumn.dataset.columnId;
    if (!columnId) return;

    const columnsContainer = this.draggedColumn.parentElement;
    if (!columnsContainer) return;

    const columns = Array.from(columnsContainer.querySelectorAll('.kanban-column'));
    const newOrder = columns.indexOf(this.draggedColumn);

    this.draggedColumn.classList.remove('dragging-column');

    // Update board
    this.boardService.moveColumn(columnId, newOrder);
    this.onUpdate();
    this.onSave();

    new Notice('✓ Column moved', 1000);
  }

  private getDragAfterElement(container: HTMLElement, y: number): HTMLElement | null {
    const draggableElements = Array.from(
      container.querySelectorAll('.kanban-card:not(.dragging)')
    ) as HTMLElement[];

    return draggableElements.reduce<HTMLElement | null>((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;

      if (offset < 0 && (closest === null || offset > (closest as any).offset)) {
        (child as any).offset = offset;
        return child;
      } else {
        return closest;
      }
    }, null);
  }

  private getDragAfterColumn(container: HTMLElement, x: number): HTMLElement | null {
    const draggableElements = Array.from(
      container.querySelectorAll('.kanban-column:not(.dragging-column)')
    ) as HTMLElement[];

    return draggableElements.reduce<HTMLElement | null>((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = x - box.left - box.width / 2;

      if (offset < 0 && (closest === null || offset > (closest as any).offset)) {
        (child as any).offset = offset;
        return child;
      } else {
        return closest;
      }
    }, null);
  }

  cleanup(): void {
    this.draggedCard = null;
    this.draggedColumn = null;
    this.isDraggingColumn = false;
  }
}
