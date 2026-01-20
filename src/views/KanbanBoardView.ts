// ============================================
// src/views/KanbanBoardView.ts - REFACTORED
// ============================================

import { ItemView, WorkspaceLeaf, Notice, TFile } from 'obsidian';
import type KanbanProPlugin from '../main';
import { BoardService } from '../services/BoardService';
import { DragDropService } from '../services/DragDropService';
import { ToolbarBuilder } from './ToolbarBuilder';
import { KanbanBoard } from '../models/types';
import { createElement } from '../utils/helpers';

// View Renderers
import { IViewRenderer, ViewRendererContext } from './renderers/IViewRenderer';
import { BoardViewRenderer } from './renderers/BoardViewRenderer';
import { ListViewRenderer } from './renderers/ListViewRenderer';
import { TimelineViewRenderer } from './renderers/TimelineViewRenderer';
import { GanttViewRenderer } from './renderers/GanttViewRenderer';
import { RoadmapViewRenderer } from './renderers/RoadmapViewRenderer';

// Modals
import { CardDetailModal } from '../modals/CardDetailModal';

export const KANBAN_VIEW_TYPE = 'kanban-pro-view';

type ExtendedViewType = 'board' | 'list' | 'timeline' | 'gantt' | 'roadmap';

export class KanbanBoardView extends ItemView {
  private plugin: KanbanProPlugin;
  private boardService: BoardService;
  private dragDropService: DragDropService;
  private currentView: ExtendedViewType = 'board';
  private selectedCards: Set<string> = new Set();
  private filePath: string = '';
  
  // View Renderers
  private renderers: Map<ExtendedViewType, IViewRenderer>;

  constructor(leaf: WorkspaceLeaf, plugin: KanbanProPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.boardService = new BoardService();
    this.dragDropService = new DragDropService(
      this.boardService,
      () => this.render(),
      () => this.saveBoard()
    );

    // Initialize renderers
    this.renderers = new Map([
      ['board', new BoardViewRenderer()],
      ['list', new ListViewRenderer()],
      ['timeline', new TimelineViewRenderer()],
      ['gantt', new GanttViewRenderer()],
      ['roadmap', new RoadmapViewRenderer()]
    ]);
  }

  // ==================== OBSIDIAN VIEW INTERFACE ====================

  getViewType(): string {
    return KANBAN_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.boardService.getBoard().name || 'Kanban Pro';
  }

  getIcon(): string {
    return 'layout-grid';
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('kanban-pro-container');

    const state = this.leaf.getViewState();
    const fileState = state.state as { file?: string } | undefined;

    if (fileState?.file) {
      await this.loadFile(fileState.file);
    } else {
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile && activeFile.extension === 'kanban') {
        await this.loadFile(activeFile.path);
      } else {
        this.render();
      }
    }
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
    this.dragDropService.cleanup();
  }

  getState(): any {
    return { file: this.filePath };
  }

  async setState(state: any, result: any): Promise<void> {
    if (state?.file) {
      await this.loadFile(state.file);
    }
  }

  // ==================== FILE OPERATIONS ====================

  private async loadFile(filePath: string): Promise<void> {
    try {
      const abstractFile = this.app.vault.getAbstractFileByPath(filePath);
      if (abstractFile && abstractFile instanceof TFile) {
        const content = await this.app.vault.read(abstractFile);
        const board = JSON.parse(content) as KanbanBoard;
        this.boardService = new BoardService(board);
        this.filePath = filePath;
        this.render();
        this.plugin.setupAutoSave(filePath, this);
      } else {
        this.render();
      }
    } catch (error) {
      console.error('Kanban Pro: Error loading file:', error);
      new Notice('⚠️ Failed to load Kanban board', 3000);
      this.render();
    }
  }

  setBoard(board: KanbanBoard, filePath: string): void {
    this.boardService = new BoardService(board);
    this.filePath = filePath;
    this.render();
  }

  getBoard(): KanbanBoard {
    return this.boardService.getBoard();
  }

  async saveBoard(): Promise<void> {
    if (!this.filePath) return;

    try {
      const board = this.boardService.getBoard();
      board.updatedAt = new Date().toISOString();
      const content = JSON.stringify(board, null, 2);

      const file = this.app.vault.getAbstractFileByPath(this.filePath);
      if (file instanceof TFile) {
        await this.app.vault.modify(file, content);
      }
    } catch (error) {
      console.error('Kanban Pro: Error saving board:', error);
      new Notice('⚠️ Failed to save board', 3000);
    }
  }

  // ==================== RENDERING ====================

  render(): void {
    this.contentEl.empty();

    const wrapper = createElement('div', { className: 'kanban-pro-wrapper' });

    // Toolbar
    const toolbar = this.buildToolbar();
    wrapper.appendChild(toolbar);

    // Content
    const content = createElement('div', { className: 'kanban-pro-content' });
    this.renderView(content);
    wrapper.appendChild(content);

    this.contentEl.appendChild(wrapper);

    // Setup drag and drop
    this.dragDropService.setupDragAndDrop(this.contentEl);
  }

  private buildToolbar(): HTMLElement {
    const toolbarBuilder = new ToolbarBuilder(
      this.app,
      this.plugin,
      this.boardService,
      this.currentView,
      (view) => this.switchView(view),
      () => this.saveBoard(),
      () => this.render()
    );

    return toolbarBuilder.build();
  }

  private renderView(container: HTMLElement): void {
    const renderer = this.renderers.get(this.currentView);
    
    if (!renderer) {
      container.createEl('div', { 
        text: `View "${this.currentView}" not implemented yet`,
        cls: 'error-message'
      });
      return;
    }

    const context: ViewRendererContext = {
      app: this.app,
      plugin: this.plugin,
      boardService: this.boardService,
      onCardClick: (cardId) => this.openCardModal(cardId),
      onColumnUpdate: (columnId) => {
        this.render();
        this.saveBoard();
      },
      onCardUpdate: (cardId) => {
        this.render();
        this.saveBoard();
      },
      saveBoard: () => this.saveBoard(),
      render: () => this.render()
    };

    renderer.render(container, context);

    // Update selected cards for board view
    if (this.currentView === 'board' && renderer instanceof BoardViewRenderer) {
      renderer.setSelectedCards(this.selectedCards);
    }
  }

  // ==================== VIEW SWITCHING ====================

  private switchView(view: ExtendedViewType): void {
    this.currentView = view;
    this.render();
  }

  // ==================== CARD INTERACTIONS ====================

  private openCardModal(cardId: string): void {
    const card = this.boardService.getCard(cardId);
    if (!card) {
      new Notice('⚠️ Card not found', 2000);
      return;
    }

    new CardDetailModal(
      this.app,
      card,
      this.boardService,
      () => {
        this.render();
        this.saveBoard();
      }
    ).open();
  }

  // ==================== KEYBOARD SHORTCUTS ====================

  setupKeyboardShortcuts(): void {
    // Multi-select with Ctrl/Cmd + Click (handled in card click events)
    this.contentEl.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const card = target.closest('.kanban-card') as HTMLElement;
      
      if (!card) return;

      if (e.ctrlKey || e.metaKey) {
        const cardId = card.dataset.cardId;
        if (cardId) {
          if (this.selectedCards.has(cardId)) {
            this.selectedCards.delete(cardId);
          } else {
            this.selectedCards.add(cardId);
          }
          this.render();
        }
      }
    });

    // Escape to clear selection
    this.contentEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.selectedCards.clear();
        this.render();
      }
    });
  }

  // ==================== BULK OPERATIONS ====================

  private bulkMoveCards(toColumnId: string): void {
    if (this.selectedCards.size === 0) {
      new Notice('⚠️ No cards selected', 2000);
      return;
    }

    const cards = Array.from(this.selectedCards);
    cards.forEach((cardId, index) => {
      this.boardService.moveCard(cardId, toColumnId, index);
    });

    this.selectedCards.clear();
    this.render();
    this.saveBoard();
    new Notice(`✅ Moved ${cards.length} card(s)`, 2000);
  }

  private bulkDeleteCards(): void {
    if (this.selectedCards.size === 0) {
      new Notice('⚠️ No cards selected', 2000);
      return;
    }

    const { ConfirmModal } = require('../modals/UtilityModals');
    new ConfirmModal(
      this.app,
      'Delete Cards',
      `Delete ${this.selectedCards.size} selected card(s)?`,
      () => {
        const cards = Array.from(this.selectedCards);
        cards.forEach(cardId => {
          this.boardService.deleteCard(cardId);
        });

        this.selectedCards.clear();
        this.render();
        this.saveBoard();
        new Notice(`🗑️ Deleted ${cards.length} card(s)`, 2000);
      },
      'Delete',
      'Cancel',
      true
    ).open();
  }

  // ==================== SEARCH & FILTER ====================

  private filterCards(query: string): void {
    this.boardService.setFilters({ searchQuery: query });
    this.render();
  }

  // ==================== EXPORT ====================

  exportToMarkdown(): string {
    const board = this.boardService.getBoard();
    let markdown = `# ${board.name}\n\n`;

    if (board.description) {
      markdown += `${board.description}\n\n`;
    }

    markdown += `---\n\n`;

    board.columns.forEach(column => {
      markdown += `## ${column.name}\n\n`;
      const cards = board.cards.filter(c => c.columnId === column.id);
      
      if (cards.length === 0) {
        markdown += `*No cards*\n\n`;
      } else {
        cards.forEach(card => {
          markdown += `### ${card.title}\n`;
          if (card.description) {
            markdown += `${card.description}\n`;
          }
          if (card.tags.length > 0) {
            markdown += `Tags: ${card.tags.map(t => `#${t}`).join(' ')}\n`;
          }
          if (card.dueDate) {
            markdown += `Due: ${card.dueDate.split('T')[0]}\n`;
          }
          markdown += `\n`;
        });
      }
    });

    return markdown;
  }

  exportToJSON(): string {
    const board = this.boardService.getBoard();
    return JSON.stringify(board, null, 2);
  }

  // ==================== CLEANUP ====================

  destroy(): void {
    this.dragDropService.cleanup();
    this.selectedCards.clear();
    this.renderers.clear();
  }
}
