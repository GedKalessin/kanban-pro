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

  // Persistent context - created once and reused
  private viewContext: ViewRendererContext;

  constructor(leaf: WorkspaceLeaf, plugin: KanbanProPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.boardService = new BoardService();
    console.log('🏗️ KanbanBoardView constructor - Board ID:', this.boardService.getBoard().id);  // ✅ Debug

    this.dragDropService = new DragDropService(
      this.boardService,
      () => this.render(),
      () => this.saveBoard()
    );

    // Initialize renderers
    this.renderers = new Map<ExtendedViewType, IViewRenderer>([
      ['board', new BoardViewRenderer()],
      ['list', new ListViewRenderer()],
      ['timeline', new TimelineViewRenderer()],
      ['gantt', new GanttViewRenderer()],
      ['roadmap', new RoadmapViewRenderer()]
    ]);

    // Create persistent context - bound to THIS view instance
    this.viewContext = {
      app: this.app,
      plugin: this.plugin,
      boardService: this.boardService,
      onCardClick: (cardId) => this.openCardModal(cardId),
      onColumnUpdate: (columnId) => {
        console.log('🔄 onColumnUpdate callback for board:', this.boardService.getBoard().id);  // ✅ Debug
        this.render();
        this.saveBoard();
      },
      onCardUpdate: (cardId) => {
        console.log('🔄 onCardUpdate callback for board:', this.boardService.getBoard().id);  // ✅ Debug
        this.render();
        this.saveBoard();
      },
      saveBoard: () => this.saveBoard(),
      render: () => {
        console.log('🔄 render callback from context for board:', this.boardService.getBoard().id);  // ✅ Debug
        this.render();
      }
    };
  }

  // ==================== OBSIDIAN VIEW INTERFACE ====================

  getViewType(): string {
    return KANBAN_VIEW_TYPE;
  }

  getDisplayText(): string {
    const board = this.boardService.getBoard();
    return board.name || 'Kanban Board';
  }

  getIcon(): string {
    return 'layout-grid';
  }

  // Update the view title when board name changes (safe version without setState loop)
  private updateTitleSafe(): void {
    const title = this.boardService.getBoard().name || 'Kanban Board';

    // Aggiorna titolo nella view header (a destra)
    const viewAny = this.leaf.view as any;
    if (viewAny?.titleEl) {
      // alcuni usano titleEl.setText, altri textContent
      if (typeof viewAny.titleEl.setText === 'function') {
        viewAny.titleEl.setText(title);
      } else {
        viewAny.titleEl.textContent = title;
      }
    }

    // Aggiorna tab title (a sinistra) — API interna
    const leafAny = this.leaf as any;
    if (typeof leafAny.updateHeader === 'function') {
      leafAny.updateHeader(); // undocumented
    }
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
    if (!state?.file) return;
    // Guard: evita reload inutile se è lo stesso file
    if (this.filePath === state.file) return;
    await this.loadFile(state.file);
  }

  // ==================== FILE OPERATIONS ====================

  private async loadFile(filePath: string): Promise<void> {
    try {
      console.log('📂 loadFile: Loading file from', filePath);

      const abstractFile = this.app.vault.getAbstractFileByPath(filePath);
      if (abstractFile && abstractFile instanceof TFile) {
        const content = await this.app.vault.read(abstractFile);
        console.log('📂 loadFile: Read', content.length, 'bytes from file');

        const board = JSON.parse(content) as KanbanBoard;
        console.log('📂 loadFile: Parsed board', board.id, 'with', board.cards.length, 'cards');

        // ✅ CRITICAL FIX: Instead of creating a new BoardService,
        // replace the board inside the existing BoardService
        // This keeps all references (ToolbarBuilder, DragDropService, viewContext) valid!
        this.boardService.setBoard(board);
        this.filePath = filePath;

        console.log('✅ Loaded board into existing BoardService:', this.boardService.getBoard().id);

        this.render();
        this.updateTitleSafe(); // Aggiorna il titolo dopo il load
        this.plugin.setupAutoSave(filePath, this);
      } else {
        console.warn('⚠️ loadFile: File not found at path:', filePath);
        this.render();
      }
    } catch (error) {
      console.error('Kanban Pro: Error loading file:', error);
      new Notice('⚠️ Failed to load Kanban board', 3000);
      this.render();
    }
  }

  setBoard(board: KanbanBoard, filePath: string): void {
    // ✅ CRITICAL FIX: Use setBoard() instead of creating new BoardService
    this.boardService.setBoard(board);
    this.filePath = filePath;

    console.log('✅ Set board via setBoard():', this.boardService.getBoard().id);

    this.render();
  }

  getBoard(): KanbanBoard {
    return this.boardService.getBoard();
  }

  async saveBoard(): Promise<void> {
    if (!this.filePath) {
      console.warn('⚠️ saveBoard called but no filePath set');
      return;
    }

    try {
      const board = this.boardService.getBoard();
      console.log('💾 saveBoard: Saving board', board.id, 'with', board.cards.length, 'cards to', this.filePath);

      board.updatedAt = new Date().toISOString();
      const content = JSON.stringify(board, null, 2);

      console.log('💾 saveBoard: JSON content length:', content.length, 'bytes');

      const file = this.app.vault.getAbstractFileByPath(this.filePath);
      if (file instanceof TFile) {
        await this.app.vault.modify(file, content);
        console.log('✅ saveBoard: File successfully modified');

        // Niente updateTitle qui: evita re-init/loop durante save.
      } else {
        console.error('❌ saveBoard: File not found at path:', this.filePath);
      }
    } catch (error) {
      console.error('Kanban Pro: Error saving board:', error);
      new Notice('⚠️ Failed to save board', 3000);
    }
  }

  async renameFile(newName: string): Promise<void> {
    if (!this.filePath) {
      console.warn('⚠️ renameFile called but no filePath set');
      return;
    }

    // Sanitize filename: remove invalid characters
    const sanitizedName = newName
      .replace(/[\\/:*?"<>|]/g, '') // Remove invalid file chars
      .trim();

    if (!sanitizedName) {
      new Notice('⚠️ Invalid board name', 2000);
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(this.filePath);
    if (!(file instanceof TFile)) {
      console.error('❌ renameFile: File not found at path:', this.filePath);
      return;
    }

    // Build new path: same folder, new name
    const folder = file.parent?.path || '';
    const newPath = folder ? `${folder}/${sanitizedName}.kanban` : `${sanitizedName}.kanban`;

    // Skip if path is the same
    if (newPath === this.filePath) {
      return;
    }

    // Check if a file with the new name already exists
    const existingFile = this.app.vault.getAbstractFileByPath(newPath);
    if (existingFile) {
      new Notice('⚠️ A board with this name already exists', 2000);
      return;
    }

    try {
      await this.app.vault.rename(file, newPath);
      this.filePath = newPath;
      console.log('✅ renameFile: File renamed to', newPath);
    } catch (error) {
      console.error('Kanban Pro: Error renaming file:', error);
      new Notice('⚠️ Failed to rename board file', 3000);
    }
  }

  // ==================== RENDERING ====================

  render(): void {
    console.log('🔄 KanbanBoardView.render() called for board:', this.boardService.getBoard().id);  // ✅ Debug

    // Save scroll position BEFORE clearing the DOM
    let savedScrollTop = 0;
    const roadmapContent = this.contentEl.querySelector('.roadmap-content') as HTMLElement;
    if (roadmapContent) {
      savedScrollTop = roadmapContent.scrollTop;
      console.log('📜 Saved roadmap scroll position:', savedScrollTop);
    }

    // ✅ CRITICAL: Completely clear the DOM and cleanup drag-drop before rendering
    this.dragDropService.cleanup();
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

    // Restore scroll position after render
    if (savedScrollTop > 0) {
      requestAnimationFrame(() => {
        const newRoadmapContent = this.contentEl.querySelector('.roadmap-content') as HTMLElement;
        if (newRoadmapContent) {
          newRoadmapContent.scrollTop = savedScrollTop;
          console.log('📜 Restored roadmap scroll position:', savedScrollTop);
        }
      });
    }

    // Niente updateTitle nel render loop.
  }

  private buildToolbar(): HTMLElement {
    console.log('🔧 buildToolbar() for board:', this.boardService.getBoard().id);  // ✅ Debug

    // Capture the current view instance to ensure callbacks are bound correctly
    const self = this;

    // ✅ CRITICAL FIX: Pass callbacks that always use the current boardService,
    // not a captured reference that might become stale
    const toolbarBuilder = new ToolbarBuilder(
      this.app,
      this.plugin,
      this.boardService,  // This reference gets stale! ToolbarBuilder stores it
      this.currentView,
      (view) => self.switchView(view),
      async () => {
        console.log('💾 saveBoard callback - board:', self.boardService.getBoard().id);  // ✅ Debug
        await self.saveBoard();
      },
      () => {
        console.log('🔄 render callback - board:', self.boardService.getBoard().id);  // ✅ Debug
        self.render();
      },
      () => {
        console.log('📝 updateTitle callback - board:', self.boardService.getBoard().id);  // ✅ Debug
        self.updateTitleSafe();
      },
      async (newName: string) => {
        console.log('📝 renameFile callback - newName:', newName);  // ✅ Debug
        await self.renameFile(newName);
      }
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

    try {
      // Use the persistent context that's bound to THIS view instance
      renderer.render(container, this.viewContext);

      // Update selected cards for board view
      if (this.currentView === 'board' && renderer instanceof BoardViewRenderer) {
        renderer.setSelectedCards(this.selectedCards);
      }
    } catch (error) {
      console.error('Kanban Pro: Error rendering view:', error);
      container.empty();
      const errorDiv = container.createDiv({ cls: 'view-error' });
      errorDiv.createEl('h3', { text: '⚠️ Error rendering view' });
      errorDiv.createEl('p', { text: 'Switch to another view or check the console for details.' });

      // Non bloccare la navigazione - l'utente può ancora cambiare view
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

    console.log('🔍 Opening card modal:', {
      cardId: card.id,
      title: card.title,
      description: card.description,
      descriptionLength: card.description?.length || 0
    });

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
