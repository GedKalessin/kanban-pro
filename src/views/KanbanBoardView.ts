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
import { ConfirmModal } from '../modals/UtilityModals';

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
    console.debug('🏗️ KanbanBoardView constructor - Board ID:', this.boardService.getBoard().id);

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
        console.debug('🔄 onColumnUpdate callback for board:', this.boardService.getBoard().id);
        this.render();
        void this.saveBoard();
      },
      onCardUpdate: (cardId) => {
        console.debug('🔄 onCardUpdate callback for board:', this.boardService.getBoard().id);
        this.render();
        void this.saveBoard();
      },
      saveBoard: () => this.saveBoard(),
      render: () => {
        console.debug('🔄 render callback from context for board:', this.boardService.getBoard().id);
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

    // Access internal Obsidian view properties not exposed in public types
    const internalView = this.leaf.view as unknown as {
      titleEl?: { setText?: (text: string) => void; textContent?: string };
    };
    if (internalView?.titleEl) {
      if (typeof internalView.titleEl.setText === 'function') {
        internalView.titleEl.setText(title);
      } else {
        internalView.titleEl.textContent = title;
      }
    }

    const internalLeaf = this.leaf as unknown as {
      updateHeader?: () => void;
      tabHeaderInnerTitleEl?: { textContent?: string };
      tabHeaderEl?: { querySelector: (s: string) => { textContent?: string } | null };
    };

    if (typeof internalLeaf.updateHeader === 'function') {
      internalLeaf.updateHeader();
    }

    if (internalLeaf.tabHeaderInnerTitleEl) {
      internalLeaf.tabHeaderInnerTitleEl.textContent = title;
    } else if (internalLeaf.tabHeaderEl) {
      const tabTitleEl = internalLeaf.tabHeaderEl.querySelector('.view-tab-header-inner-title');
      if (tabTitleEl) tabTitleEl.textContent = title;
    }

    this.app.workspace.trigger('layout-change');
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('kanban-pro-container');

    // Handle external file renames (file renamed from Obsidian file explorer)
    this.registerEvent(
      this.app.vault.on('rename', async (file, oldPath) => {
        if (oldPath !== this.filePath || !(file instanceof TFile)) return;

        const newPath = file.path;
        const newBasename = file.basename;

        // Update tracked path first so setState guard skips if it fires after
        this.filePath = newPath;

        // Sync board name to new filename
        const board = this.boardService.getBoard();
        if (board.name !== newBasename) {
          this.boardService.updateBoard({ name: newBasename });
        }

        this.plugin.setupAutoSave(newPath, this);
        this.render();
        this.updateTitleSafe();
        await this.saveBoard();
      })
    );

    const state = this.leaf.getViewState();
    const fileState = state.state;

    if (fileState?.file && typeof fileState.file === 'string') {
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

  onClose(): Promise<void> {
    this.contentEl.empty();
    this.dragDropService.cleanup();
    return Promise.resolve();
  }

  getState(): { file: string } {
    return { file: this.filePath };
  }

  async setState(state: { file?: string } | null, _result: unknown): Promise<void> {
    if (!state?.file) return;
    // Guard: evita reload inutile se è lo stesso file
    if (this.filePath === state.file) return;
    await this.loadFile(state.file);
  }

  // ==================== FILE OPERATIONS ====================

  getFilePath(): string {
    return this.filePath;
  }

  private async loadFile(filePath: string): Promise<void> {
    this.filePath = filePath;

    // If another leaf already has this file open, close this one and reveal that one
    const existingLeaf = this.app.workspace.getLeavesOfType(KANBAN_VIEW_TYPE)
      .find(leaf => leaf !== this.leaf && (leaf.view as KanbanBoardView).getFilePath() === filePath);
    if (existingLeaf) {
      void this.app.workspace.revealLeaf(existingLeaf);
      activeWindow.setTimeout(() => this.leaf.detach(), 0);
      return;
    }

    try {
      console.debug('📂 loadFile: Loading file from', filePath);

      const abstractFile = this.app.vault.getAbstractFileByPath(filePath);
      if (abstractFile && abstractFile instanceof TFile) {
        const content = await this.app.vault.read(abstractFile);
        console.debug('📂 loadFile: Read', content.length, 'bytes from file');

        const board = JSON.parse(content) as KanbanBoard;
        console.debug('📂 loadFile: Parsed board', board.id, 'with', board.cards.length, 'cards');

        // Se il file è stato rinominato esternamente, sincronizza il nome interno
        const fileBasename = abstractFile.basename;
        const renamedExternally = board.name !== fileBasename;
        if (renamedExternally) {
          board.name = fileBasename;
        }

        this.boardService.setBoard(board);
        this.filePath = filePath;

        console.debug('✅ Loaded board into existing BoardService:', this.boardService.getBoard().id);

        this.render();
        this.updateTitleSafe();
        this.plugin.setupAutoSave(filePath, this);

        // Persisti il nome aggiornato nel JSON
        if (renamedExternally) {
          await this.saveBoard();
        }
      } else {
        console.warn('⚠️ loadFile: File not found at path:', filePath);
        this.render();
      }
    } catch (error) {
      console.error('Kanban Pro: Error loading file:', error);
      new Notice('Failed to load kanban board', 3000);
      this.render();
    }
  }

  setBoard(board: KanbanBoard, filePath: string): void {
    this.boardService.setBoard(board);
    this.filePath = filePath;

    console.debug('✅ Set board via setBoard():', this.boardService.getBoard().id);

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
      console.debug('💾 saveBoard: Saving board', board.id, 'with', board.cards.length, 'cards to', this.filePath);

      board.updatedAt = new Date().toISOString();
      const content = JSON.stringify(board, null, 2);

      console.debug('💾 saveBoard: JSON content length:', content.length, 'bytes');

      const file = this.app.vault.getAbstractFileByPath(this.filePath);
      if (file instanceof TFile) {
        await this.app.vault.modify(file, content);
        console.debug('✅ saveBoard: File successfully modified');

        // Niente updateTitle qui: evita re-init/loop durante save.
      } else {
        console.error('❌ saveBoard: File not found at path:', this.filePath);
      }
    } catch (error) {
      console.error('Kanban Pro: Error saving board:', error);
      new Notice('Failed to save kanban board', 3000);
    }
  }

  // ==================== RENDERING ====================

  render(): void {
    console.debug('🔄 KanbanBoardView.render() called for board:', this.boardService.getBoard().id);

    // Save scroll position BEFORE clearing the DOM
    let savedScrollTop = 0;
    const roadmapContent = this.contentEl.querySelector('.roadmap-content') as HTMLElement;
    if (roadmapContent) {
      savedScrollTop = roadmapContent.scrollTop;
      console.debug('📜 Saved roadmap scroll position:', savedScrollTop);
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
          console.debug('📜 Restored roadmap scroll position:', savedScrollTop);
        }
      });
    }

    // Niente updateTitle nel render loop.
  }

  private buildToolbar(): HTMLElement {
    console.debug('🔧 buildToolbar() for board:', this.boardService.getBoard().id);

    const toolbarBuilder = new ToolbarBuilder(
      this.app,
      this.boardService,
      this.currentView,
      (view) => this.switchView(view),
      async () => { await this.saveBoard(); },
      () => { this.render(); }
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
      errorDiv.createEl('h3', { text: 'Error rendering view' });
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
      new Notice('Card not found', 2000);
      return;
    }

    console.debug('🔍 opening card modal:', {
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
        void this.saveBoard();
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
      new Notice('No cards selected', 2000);
      return;
    }

    const cards = Array.from(this.selectedCards);
    cards.forEach((cardId, index) => {
      this.boardService.moveCard(cardId, toColumnId, index);
    });

    this.selectedCards.clear();
    this.render();
    void this.saveBoard();
    new Notice(`Moved ${cards.length} card(s)`, 2000);
  }

  private bulkDeleteCards(): void {
    if (this.selectedCards.size === 0) {
      new Notice('No cards selected', 2000);
      return;
    }

    new ConfirmModal(
      this.app,
      'Delete cards',
      `Delete ${this.selectedCards.size} selected card(s)?`,
      () => {
        const cards = Array.from(this.selectedCards);
        cards.forEach(cardId => {
          this.boardService.deleteCard(cardId);
        });

        this.selectedCards.clear();
        this.render();
        void this.saveBoard();
        new Notice(`Deleted ${cards.length} card(s)`, 2000);
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
