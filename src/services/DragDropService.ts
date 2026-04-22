import { Notice } from 'obsidian';
import { BoardService } from './BoardService';

export class DragDropService {
  private boardService: BoardService;
  private onUpdate: () => void;
  private onSave: () => Promise<void>;

  private abort?: AbortController;

  private draggedCardId: string | null = null;
  private draggedCardEl: HTMLElement | null = null;
  private placeholder: HTMLElement | null = null;

  private draggedColumn: HTMLElement | null = null;
  private startX = 0;
  private currentX = 0;
  private isDraggingColumn = false;

  // Performance optimization: throttle dragover with rAF
  private rafId: number | null = null;
  private pendingDragEvent: DragEvent | null = null;

  constructor(boardService: BoardService, onUpdate: () => void, onSave: () => Promise<void>) {
    this.boardService = boardService;
    this.onUpdate = onUpdate;
    this.onSave = onSave;
  }

  setupDragAndDrop(container: HTMLElement): void {
    this.cleanup();

    this.abort = new AbortController();
    const signal = this.abort.signal;

    // Card DnD (delegato)
    container.addEventListener('dragstart', this.onDragStart, { signal });
    container.addEventListener('dragend', this.onDragEnd, { signal });
    container.addEventListener('dragover', this.onDragOver, { signal });
    container.addEventListener('dragleave', this.onDragLeave, { signal });
    container.addEventListener('drop', this.onDrop, { signal });

    // Column DnD (mouse)
    container.addEventListener('mousedown', this.onMouseDown, { signal });
  }

  cleanup(): void {
    this.abort?.abort();
    this.abort = undefined;

    // Cancel any pending animation frame
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.pendingDragEvent = null;

    this.removePlaceholder();
    this.draggedCardId = null;
    this.draggedCardEl = null;
    this.draggedColumn = null;
    this.isDraggingColumn = false;
  }

  private createPlaceholder(height: number): HTMLElement {
    const placeholder = document.createElement('div');
    placeholder.className = 'kanban-card-placeholder';
    placeholder.style.height = `${height}px`;
    return placeholder;
  }

  private removePlaceholder(): void {
    if (this.placeholder) {
      this.placeholder.remove();
      this.placeholder = null;
    }
  }

  // ======================
  // CARD DRAG & DROP
  // ======================

  private onDragStart = (e: DragEvent) => {
    const target = e.target as HTMLElement;
    if (!target?.classList.contains('kanban-card')) return;

    this.draggedCardId = target.dataset.cardId ?? null;
    if (!this.draggedCardId) return;

    this.draggedCardEl = target;

    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', this.draggedCardId);
    }

    // Create placeholder with same height as the dragged card
    const cardRect = target.getBoundingClientRect();
    this.placeholder = this.createPlaceholder(cardRect.height);

    // Delay adding dragging class for smoother visual
    requestAnimationFrame(() => {
      target.classList.add('dragging');
    });
  };

  private onDragEnd = (e: DragEvent) => {
    const target = e.target as HTMLElement;
    if (!target?.classList.contains('kanban-card')) return;

    // Cancel any pending animation frame
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.pendingDragEvent = null;

    target.classList.remove('dragging');
    this.removePlaceholder();
    this.draggedCardId = null;
    this.draggedCardEl = null;

    const container = target.closest('.kanban-pro-container') ?? document.body;
    container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  };

  private onDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (!this.draggedCardId || !this.placeholder) return;

    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

    // Store the event and schedule processing via rAF for smooth 60fps
    this.pendingDragEvent = e;

    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(this.processDragOver);
    }
  };

  private processDragOver = () => {
    this.rafId = null;

    const e = this.pendingDragEvent;
    if (!e || !this.draggedCardId || !this.placeholder) return;

    const target = e.target as HTMLElement;
    const cardsContainer = target.closest('.column-content') as HTMLElement;
    if (!cardsContainer) return;

    cardsContainer.classList.add('drag-over');

    // Get all cards in this container (excluding the dragged one and placeholder)
    const cards = cardsContainer.querySelectorAll('.kanban-card:not(.dragging)');

    // Find the insertion point based on mouse Y position using binary search for large lists
    let insertBefore: HTMLElement | null = null;
    const clientY = e.clientY;

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i] as HTMLElement;
      const rect = card.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      if (clientY < midpoint) {
        insertBefore = card;
        break;
      }
    }

    // Only move placeholder if position actually changed (avoid layout thrashing)
    const currentNext = this.placeholder.nextElementSibling;
    const currentParent = this.placeholder.parentElement;

    if (insertBefore !== currentNext || currentParent !== cardsContainer) {
      if (insertBefore) {
        cardsContainer.insertBefore(this.placeholder, insertBefore);
      } else {
        // Insert before the drop-zone if it exists, otherwise append
        const dropZone = cardsContainer.querySelector('.drop-zone');
        if (dropZone) {
          cardsContainer.insertBefore(this.placeholder, dropZone);
        } else {
          cardsContainer.appendChild(this.placeholder);
        }
      }
    }
  };

  private onDragLeave = (e: DragEvent) => {
    const target = e.target as HTMLElement;
    if (target?.classList.contains('column-content')) target.classList.remove('drag-over');
  };

  private onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!this.draggedCardId) return;

    const target = e.target as HTMLElement;
    const column = target.closest('.kanban-column') as HTMLElement;
    if (!column) return;

    const toColumnId = column.dataset.columnId;
    if (!toColumnId) return;

    const cardsContainer = column.querySelector('.column-content') as HTMLElement;
    if (!cardsContainer) return;

    // Calculate insert index based on placeholder position
    let insertIndex = 0;
    if (this.placeholder && this.placeholder.parentElement === cardsContainer) {
      const allElements = Array.from(cardsContainer.children);
      const placeholderIndex = allElements.indexOf(this.placeholder);
      // Count only actual cards before the placeholder
      insertIndex = allElements
        .slice(0, placeholderIndex)
        .filter(el => el.classList.contains('kanban-card') && !el.classList.contains('dragging'))
        .length;
    } else {
      // Fallback to mouse position calculation
      const cards = Array.from(cardsContainer.querySelectorAll('.kanban-card:not(.dragging)'));
      insertIndex = cards.length;
      for (let i = 0; i < cards.length; i++) {
        const cardEl = cards[i] as HTMLElement;
        const rect = cardEl.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        if (e.clientY < midpoint) {
          insertIndex = i;
          break;
        }
      }
    }

    // Clean up before updating
    this.removePlaceholder();
    if (this.draggedCardEl) {
      this.draggedCardEl.classList.remove('dragging');
    }

    this.boardService.moveCard(this.draggedCardId, toColumnId, insertIndex);
    cardsContainer.classList.remove('drag-over');

    this.onUpdate();
    void this.onSave();
    new Notice('Card moved', 1000);

    this.draggedCardId = null;
    this.draggedCardEl = null;
  };

  // ======================
  // COLUMN DRAG (mouse)
  // ======================

  private onMouseDown = (e: MouseEvent) => {
    const target = e.target as HTMLElement;

    const columnHeader = target.closest('.column-header') as HTMLElement;
    if (!columnHeader) return;

    if (target.closest('button') || target.closest('input') || target.closest('.column-menu-btn')) return;

    const column = columnHeader.closest('.kanban-column') as HTMLElement;
    if (!column || column.closest('.swim-lane')) return;

    this.startX = e.clientX;
    this.currentX = e.clientX;
    this.draggedColumn = column;
    this.isDraggingColumn = false;

    const onMouseMove = (ev: MouseEvent) => {
      if (!this.draggedColumn) return;

      this.currentX = ev.clientX;
      const deltaX = Math.abs(this.currentX - this.startX);

      if (!this.isDraggingColumn && deltaX > 10) {
        this.isDraggingColumn = true;
        this.draggedColumn.classList.add('dragging-column');
        this.draggedColumn.style.opacity = '0.5';
        document.body.style.cursor = 'grabbing';
      }

      if (!this.isDraggingColumn) return;

      const columnsContainer = this.draggedColumn.parentElement;
      if (!columnsContainer) return;

      const columns = Array.from(columnsContainer.querySelectorAll('.kanban-column:not(.dragging-column)')) as HTMLElement[];
      for (const col of columns) {
        const rect = col.getBoundingClientRect();
        const midpoint = rect.left + rect.width / 2;
        if (this.currentX < midpoint) {
          columnsContainer.insertBefore(this.draggedColumn, col);
          return;
        }
      }
      columnsContainer.appendChild(this.draggedColumn);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      if (this.isDraggingColumn && this.draggedColumn) {
        const columnId = this.draggedColumn.dataset.columnId;
        const columnsContainer = this.draggedColumn.parentElement;

        if (columnId && columnsContainer) {
          const columns = Array.from(columnsContainer.querySelectorAll('.kanban-column')) as HTMLElement[];
          const newIndex = columns.indexOf(this.draggedColumn);
          if (newIndex >= 0) {
            this.boardService.moveColumn(columnId, newIndex);
            this.onUpdate();
            void this.onSave();
            new Notice('Column moved', 1000);
          }
        }

        this.draggedColumn.classList.remove('dragging-column');
        this.draggedColumn.style.opacity = '';
      }

      document.body.style.cursor = '';
      this.isDraggingColumn = false;
      this.draggedColumn = null;
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    e.preventDefault();
  };
}
