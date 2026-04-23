import { Menu, Notice, setIcon } from 'obsidian';
import { Milestone, KanbanCard } from '../../models/types';
import { createElement, setCssProps } from '../../utils/helpers';
import { IViewRenderer, ViewRendererContext } from './IViewRenderer';
import { MilestoneModal } from '../../modals/MilestoneModal';
import { SuggesterModal, ConfirmModal } from '../../modals/UtilityModals';

export class RoadmapViewRenderer implements IViewRenderer {
  private draggedCard: HTMLElement | null = null;
  private currentContext: ViewRendererContext | null = null;
  private isRendering: boolean = false;

  render(container: HTMLElement, context: ViewRendererContext): void {
    // Prevent concurrent renders - exit if already rendering
    if (this.isRendering) {
      console.debug('⏭️ Skipping render - already in progress');
      return;
    }

    this.isRendering = true;
    console.debug('🚀 RoadmapViewRenderer.render() START');

    try {
      // STEP 1: Validate inputs
      if (!container) {
        throw new Error('Container is null or undefined');
      }
      if (!context) {
        throw new Error('Context is null or undefined');
      }
      if (!context.boardService) {
        throw new Error('BoardService is null or undefined');
      }

      // STEP 2: Clear container completamente
      container.empty();
      container.addClass('kanban-roadmap-view');
      this.currentContext = context;

      // STEP 3: Get board e verifica
      const board = context.boardService.getBoard();
      console.debug('📋 Board loaded:', board);

      // STEP 4: Assicurati che milestones array esista
      if (!board.milestones) {
        console.debug('⚠️ Initializing milestones array');
        board.milestones = [];
      }

      console.debug('📊 Milestones count:', board.milestones.length);

      // STEP 5: Render toolbar
      try {
        const toolbar = this.renderToolbar(context);
        container.appendChild(toolbar);
        console.debug('✅ Toolbar rendered');
      } catch (error) {
        console.error('❌ Error rendering toolbar:', error);
        container.createDiv({ text: 'Error loading toolbar', cls: 'error-message' });
      }

      // STEP 6: Check if empty
      if (board.milestones.length === 0) {
        console.debug('📭 No milestones, showing empty state');
        const emptyState = this.renderEmptyState(context);
        container.appendChild(emptyState);
        console.debug('🏁 RoadmapViewRenderer.render() END (empty state)');
        return; // EXIT EARLY
      }

      // STEP 7: Sort milestones safely
      let sortedMilestones: Milestone[] = [];
      try {
        sortedMilestones = [...board.milestones].sort((a, b) => {
          const orderA = typeof a.order === 'number' ? a.order : 0;
          const orderB = typeof b.order === 'number' ? b.order : 0;
          return orderA - orderB;
        });
        console.debug('✅ Milestones sorted:', sortedMilestones.length);
      } catch (error) {
        console.error('❌ Error sorting milestones:', error);
        sortedMilestones = [...board.milestones];
      }

      // STEP 8: Create roadmap content container
      const roadmapContent = createElement('div', { className: 'roadmap-content' });
      console.debug('✅ Roadmap content container created');

      // STEP 9: Render each milestone with error handling
      sortedMilestones.forEach((milestone, index) => {
        try {
          console.debug(`📌 Rendering milestone ${index}:`, milestone.name);
          const milestoneEl = this.renderMilestone(milestone, context);
          roadmapContent.appendChild(milestoneEl);
          console.debug(`✅ Milestone ${index} rendered successfully`);
        } catch (error) {
          console.error(`❌ Error rendering milestone ${index}:`, error);
          console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack');
          const errorEl = roadmapContent.createDiv({ cls: 'milestone-error' });
          errorEl.textContent = `⚠️ error loading milestone: ${milestone.name}`;
        }
      });

      // STEP 10: Append to container
      container.appendChild(roadmapContent);
      console.debug('✅ Roadmap content appended to container');

      // STEP 11: Render unassigned cards section
      try {
        const unassignedSection = this.renderUnassignedCards(context);
        container.appendChild(unassignedSection);
        console.debug('✅ Unassigned cards section rendered');
      } catch (error) {
        console.error('❌ Error rendering unassigned cards:', error);
      }

      // STEP 12: Setup drag and drop DOPO che tutto è nel DOM
      requestAnimationFrame(() => {
        try {
          this.setupMilestoneDragDrop(container, context);
          console.debug('✅ Drag and drop setup complete');
        } catch (error) {
          console.error('❌ Error setting up drag and drop:', error);
          console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack');
        }
      });

      console.debug('🏁 RoadmapViewRenderer.render() completed successfully');

    } catch (error) {
      console.error('CRITICAL ERROR in RoadmapViewRenderer.render():', error);
      container.empty();
      const errorDiv = container.createDiv({ cls: 'critical-error' });
      errorDiv.createEl('h3', { text: '⚠️ error loading roadmap' });
      errorDiv.createEl('p', { text: 'An error occurred while loading the roadmap view.' });
      errorDiv.createEl('p', { text: 'Check console for details.', cls: 'error-detail' });
      const backBtn = errorDiv.createEl('button', { text: 'Back to board', cls: 'primary-btn' });
      backBtn.addEventListener('click', () => context.render());
    } finally {
      // Always reset the rendering flag
      this.isRendering = false;
      console.debug('🔓 Render lock released');
    }
  }

  private renderToolbar(context: ViewRendererContext): HTMLElement {
    const toolbar = createElement('div', { className: 'roadmap-toolbar' });

    const addBtn = createElement('button', { className: 'add-milestone-btn' });
    setIcon(addBtn, 'plus');
    addBtn.appendChild(document.createTextNode(' New milestone'));
    addBtn.addEventListener('click', () => {
      try {
        this.createMilestone(context);
      } catch (error) {
        console.error('Error creating milestone:', error);
        new Notice('⚠️ error creating milestone', 2000);
      }
    });

    toolbar.appendChild(addBtn);
    return toolbar;
  }

  private renderMilestone(milestone: Milestone, context: ViewRendererContext): HTMLElement {
    console.debug('renderMilestone called for:', milestone.name);

    try {
      const board = context.boardService.getBoard();

      if (!milestone.id || !milestone.name) {
        throw new Error('Invalid milestone structure');
      }

      if (!Array.isArray(milestone.cardIds)) {
        console.warn('milestone.cardIds is not an array, initializing');
        milestone.cardIds = [];
      }

      const validCardIds = milestone.cardIds.filter(id => {
        const exists = board.cards.some(c => c.id === id);
        if (!exists) {
          console.warn(`Card ${id} not found in board`);
        }
        return exists;
      });

      if (validCardIds.length !== milestone.cardIds.length) {
        milestone.cardIds = validCardIds;
      }

      const milestoneCards = board.cards.filter(c => milestone.cardIds.includes(c.id));
      const completedCards = milestoneCards.filter(c => c.completedAt).length;
      const totalCards = milestoneCards.length;
      const progress = totalCards > 0 ? (completedCards / totalCards) * 100 : 0;

      const color = milestone.color || '#6366f1';

      const milestoneEl = createElement('div', {
        className: `roadmap-milestone ${milestone.completed ? 'completed' : ''}`,
        'data-milestone-id': milestone.id
      });

      setCssProps(milestoneEl, { '--kp-color': color });

      // Header
      const header = createElement('div', { className: 'milestone-header' });
      setCssProps(header, { '--kp-color-alpha': `${color}15` });

      const headerLeft = createElement('div', { className: 'header-left' });

      const iconWrapper = createElement('div', { className: 'milestone-icon-wrapper' });
      setCssProps(iconWrapper, { '--kp-color': color });
      const icon = createElement('span', { className: 'milestone-icon' });
      setIcon(icon, milestone.completed ? 'check-circle' : 'target');
      iconWrapper.appendChild(icon);
      headerLeft.appendChild(iconWrapper);

      const titleSection = createElement('div', { className: 'title-section' });
      titleSection.appendChild(createElement('h3', { className: 'milestone-title' }, [milestone.name]));

      if (milestone.dueDate) {
        const dueDate = createElement('span', { className: 'milestone-due-date' });
        const calIcon = createElement('span', { className: 'cal-icon' });
        setIcon(calIcon, 'calendar');
        dueDate.appendChild(calIcon);
        try {
          dueDate.appendChild(document.createTextNode(new Date(milestone.dueDate).toLocaleDateString()));
        } catch {
          dueDate.appendChild(document.createTextNode(milestone.dueDate));
        }
        titleSection.appendChild(dueDate);
      }

      headerLeft.appendChild(titleSection);
      header.appendChild(headerLeft);

      const headerRight = createElement('div', { className: 'header-right' });

      const progressBadge = createElement('span', { className: 'progress-badge' });
      progressBadge.textContent = `${completedCards}/${totalCards}`;
      setCssProps(progressBadge, { '--kp-color': color });
      headerRight.appendChild(progressBadge);

      const menuBtn = createElement('button', { className: 'milestone-menu-btn clickable-icon' });
      setIcon(menuBtn, 'more-horizontal');
      menuBtn.addEventListener('click', (e) => {
        try {
          this.showMilestoneMenu(milestone, e, context);
        } catch (error) {
          console.error('Error showing milestone menu:', error);
        }
      });
      headerRight.appendChild(menuBtn);

      header.appendChild(headerRight);
      milestoneEl.appendChild(header);

      // Description
      if (milestone.description) {
        milestoneEl.appendChild(createElement('p', { className: 'milestone-description' }, [milestone.description]));
      }

      // Progress bar
      const progressSection = createElement('div', { className: 'milestone-progress' });
      const progressBar = createElement('div', { className: 'progress-bar-container' });
      const progressFill = createElement('div', { className: 'progress-fill' });
      setCssProps(progressFill, {
        '--kp-width': `${Math.min(Math.max(progress, 0), 100)}%`,
        '--kp-color': color
      });
      progressBar.appendChild(progressFill);
      progressSection.appendChild(progressBar);
      progressSection.appendChild(createElement('span', { className: 'progress-text' },
        [`${Math.round(progress)}% complete`]
      ));
      milestoneEl.appendChild(progressSection);

      // Cards section
      const cardsSection = createElement('div', {
        className: 'milestone-cards',
        'data-milestone-id': milestone.id
      });

      milestoneCards.forEach(card => {
        try {
          const cardEl = this.renderMilestoneCard(card, milestone, context);
          cardsSection.appendChild(cardEl);
        } catch (error) {
          console.error('Error rendering card:', card.id, error);
        }
      });

      const addCardBtn = createElement('button', { className: 'add-card-to-milestone-btn' });
      setIcon(addCardBtn, 'plus');
      addCardBtn.appendChild(createElement('span', {}, ['Add card']));
      addCardBtn.addEventListener('click', () => {
        try {
          this.addCardToMilestone(milestone, context);
        } catch (error) {
          console.error('Error adding card to milestone:', error);
          new Notice('⚠️ error adding card to milestone', 2000);
        }
      });
      cardsSection.appendChild(addCardBtn);

      milestoneEl.appendChild(cardsSection);

      console.debug('Milestone element created successfully');
      return milestoneEl;

    } catch (error) {
      console.error('Error in renderMilestone:', error);
      const errorEl = createElement('div', { className: 'milestone-error' });
      errorEl.textContent = `⚠️ error rendering milestone: ${milestone.name || 'Unknown'}`;
      return errorEl;
    }
  }

  private renderMilestoneCard(card: KanbanCard, milestone: Milestone, context: ViewRendererContext): HTMLElement {
    const column = context.boardService.getColumn(card.columnId);

    const cardEl = createElement('div', {
      className: `milestone-card ${card.completedAt ? 'completed' : ''}`,
      'data-card-id': card.id,
      draggable: 'true'
    });

    const cardContent = createElement('div', { className: 'card-content' });

    const dragHandle = createElement('span', { className: 'drag-handle' });
    setIcon(dragHandle, 'grip-vertical');
    cardContent.appendChild(dragHandle);

    const checkIcon = createElement('span', { className: 'check-icon' });
    setIcon(checkIcon, card.completedAt ? 'check-circle-2' : 'circle');
    cardContent.appendChild(checkIcon);

    const title = createElement('span', { className: 'card-title' }, [card.title || 'Untitled']);
    title.addEventListener('click', () => context.onCardClick(card.id));
    cardContent.appendChild(title);

    if (column) {
      const status = createElement('span', { className: 'card-status' });
      status.textContent = column.name;
      setCssProps(status, { '--kp-color': column.color || '#94a3b8' });
      cardContent.appendChild(status);
    }

    const removeBtn = createElement('button', { className: 'remove-card-btn' });
    setIcon(removeBtn, 'x');
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      try {
        this.removeCardFromMilestone(card.id, milestone, context);
      } catch (error) {
        console.error('Error removing card:', error);
        new Notice('⚠️ error removing card', 2000);
      }
    });
    cardContent.appendChild(removeBtn);

    cardEl.appendChild(cardContent);
    return cardEl;
  }

  private renderUnassignedCards(context: ViewRendererContext): HTMLElement {
    const board = context.boardService.getBoard();

    const assignedCardIds = new Set<string>();
    if (board.milestones) {
      board.milestones.forEach(milestone => {
        if (Array.isArray(milestone.cardIds)) {
          milestone.cardIds.forEach(id => assignedCardIds.add(id));
        }
      });
    }

    const unassignedCards = board.cards.filter(card => !assignedCardIds.has(card.id));

    const section = createElement('div', { className: 'unassigned-cards-section' });

    const header = createElement('div', { className: 'unassigned-header' });
    const title = createElement('h3', { className: 'unassigned-title' });
    const icon = createElement('span', { className: 'unassigned-icon' });
    setIcon(icon, 'inbox');
    title.appendChild(icon);
    title.appendChild(document.createTextNode(' Unassigned cards'));
    header.appendChild(title);

    const count = createElement('span', { className: 'unassigned-count' });
    count.textContent = `${unassignedCards.length}`;
    header.appendChild(count);

    section.appendChild(header);

    const cardsContainer = createElement('div', {
      className: 'unassigned-cards-container',
      'data-milestone-id': 'unassigned'
    });

    if (unassignedCards.length === 0) {
      const emptyMsg = createElement('div', { className: 'unassigned-empty' });
      emptyMsg.textContent = 'All cards are assigned to milestones';
      cardsContainer.appendChild(emptyMsg);
    } else {
      unassignedCards.forEach(card => {
        try {
          const cardEl = this.renderUnassignedCard(card, context);
          cardsContainer.appendChild(cardEl);
        } catch (error) {
          console.error('Error rendering unassigned card:', card.id, error);
        }
      });
    }

    section.appendChild(cardsContainer);
    return section;
  }

  private renderUnassignedCard(card: KanbanCard, context: ViewRendererContext): HTMLElement {
    const column = context.boardService.getColumn(card.columnId);

    const cardEl = createElement('div', {
      className: `unassigned-card ${card.completedAt ? 'completed' : ''}`,
      'data-card-id': card.id,
      draggable: 'true'
    });

    const cardContent = createElement('div', { className: 'card-content' });

    const dragHandle = createElement('span', { className: 'drag-handle' });
    setIcon(dragHandle, 'grip-vertical');
    cardContent.appendChild(dragHandle);

    const checkIcon = createElement('span', { className: 'check-icon' });
    setIcon(checkIcon, card.completedAt ? 'check-circle-2' : 'circle');
    cardContent.appendChild(checkIcon);

    const title = createElement('span', { className: 'card-title' }, [card.title || 'Untitled']);
    title.addEventListener('click', () => context.onCardClick(card.id));
    cardContent.appendChild(title);

    if (column) {
      const status = createElement('span', { className: 'card-status' });
      status.textContent = column.name;
      setCssProps(status, { '--kp-color': column.color || '#94a3b8' });
      cardContent.appendChild(status);
    }

    cardEl.appendChild(cardContent);
    return cardEl;
  }

  private setupMilestoneDragDrop(container: HTMLElement, context: ViewRendererContext): void {
    console.debug('Setting up milestone drag and drop');

    let draggedCardId: string | null = null;

    container.addEventListener('dragstart', (e: DragEvent) => {
      const target = e.target as HTMLElement;
      if (!target.classList.contains('milestone-card') && !target.classList.contains('unassigned-card')) return;

      draggedCardId = target.dataset.cardId || null;
      target.classList.add('dragging');

      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedCardId || '');
      }
      console.debug('Drag started:', draggedCardId);
    });

    container.addEventListener('dragend', (e: DragEvent) => {
      const target = e.target as HTMLElement;
      if (!target.classList.contains('milestone-card') && !target.classList.contains('unassigned-card')) return;

      target.classList.remove('dragging');
      container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      draggedCardId = null;
      console.debug('Drag ended');
    });

    container.addEventListener('dragover', (e: DragEvent) => {
      e.preventDefault();
      if (!draggedCardId) return;

      const target = e.target as HTMLElement;
      const milestoneCards = target.closest('.milestone-cards') as HTMLElement;
      const unassignedContainer = target.closest('.unassigned-cards-container') as HTMLElement;

      if (milestoneCards) {
        milestoneCards.classList.add('drag-over');
      } else if (unassignedContainer) {
        unassignedContainer.classList.add('drag-over');
      }
    });

    container.addEventListener('dragleave', (e: DragEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('milestone-cards') || target.classList.contains('unassigned-cards-container')) {
        target.classList.remove('drag-over');
      }
    });

    container.addEventListener('drop', (e: DragEvent) => {
      e.preventDefault();
      if (!draggedCardId) return;

      const target = e.target as HTMLElement;
      const milestoneCards = target.closest('.milestone-cards') as HTMLElement;
      const unassignedContainer = target.closest('.unassigned-cards-container') as HTMLElement;

      try {
        const board = context.boardService.getBoard();

        if (milestoneCards) {
          const toMilestoneId = milestoneCards.dataset.milestoneId;
          if (!toMilestoneId) return;

          console.debug('Dropping card', draggedCardId, 'to milestone', toMilestoneId);

          board.milestones.forEach(m => {
            m.cardIds = m.cardIds.filter(id => id !== draggedCardId);
          });

          const targetMilestone = board.milestones.find(m => m.id === toMilestoneId);
          if (targetMilestone && !targetMilestone.cardIds.includes(draggedCardId)) {
            targetMilestone.cardIds.push(draggedCardId);
          }

          milestoneCards.classList.remove('drag-over');
          new Notice('✓ card moved to milestone', 1500);

        } else if (unassignedContainer) {
          console.debug('Dropping card', draggedCardId, 'to unassigned');

          board.milestones.forEach(m => {
            m.cardIds = m.cardIds.filter(id => id !== draggedCardId);
          });

          unassignedContainer.classList.remove('drag-over');
          new Notice('✓ card unassigned from milestone', 1500);
        }

        context.render();
        void context.saveBoard();
      } catch (error) {
        console.error('Error dropping card:', error);
        new Notice('⚠️ error moving card', 2000);
      }
    });
  }

  private createMilestone(context: ViewRendererContext): void {
    new MilestoneModal(context.app, null, (data) => {
      try {
        console.debug('🎯 createMilestone callback START');
        console.debug('📊 Received milestone data:', data);

        const board = context.boardService.getBoard();
        console.debug('📊 Current board:', board.id, 'Milestones count:', board.milestones?.length || 0);

        if (!board.milestones) {
          console.debug('⚠️ Initializing milestones array');
          board.milestones = [];
        }

        const milestone: Milestone = {
          id: `milestone-${Date.now()}`,
          name: data.name,
          description: data.description,
          dueDate: data.dueDate ?? null,
          color: data.color,
          completed: false,
          order: board.milestones.length,
          cardIds: []
        };

        console.debug('✅ Milestone object created:', milestone);

        board.milestones.push(milestone);
        console.debug('✅ Milestone pushed to board. New count:', board.milestones.length);

        try {
          console.debug('🔄 Calling context.render()...');
          context.render();
          console.debug('✅ context.render() completed');

          console.debug('💾 Calling context.saveBoard()...');
          void context.saveBoard();
          console.debug('✅ context.saveBoard() completed');

          new Notice('✓ milestone created', 1500);
          console.debug('🎯 createMilestone callback END');
        } catch (renderError) {
          console.error('❌ Error during render/save:', renderError);
          console.error('❌ Error stack:', renderError instanceof Error ? renderError.stack : 'No stack');
          new Notice('⚠️ milestone created but render failed. Try refreshing the view.', 3000);
        }
      } catch (error: unknown) {
        console.error('❌ Error in createMilestone callback:', error);
        console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack');
        new Notice('⚠️ error creating milestone', 2000);
      }
    }).open();
  }

  private addCardToMilestone(milestone: Milestone, context: ViewRendererContext): void {
    const board = context.boardService.getBoard();
    const availableCards = board.cards.filter(c => !milestone.cardIds.includes(c.id));

    if (availableCards.length === 0) {
      new Notice('No available cards', 2000);
      return;
    }

    const items = availableCards.map(c => ({ display: c.title, value: c.id }));

    new SuggesterModal(
      context.app,
      items,
      (item: { display: string; value: string }) => {
        milestone.cardIds.push(item.value);
        context.render();
        void context.saveBoard();
        new Notice('✓ card added', 1500);
      },
      'Select a card',
      'No cards found'
    ).open();
  }

  private removeCardFromMilestone(cardId: string, milestone: Milestone, context: ViewRendererContext): void {
    milestone.cardIds = milestone.cardIds.filter(id => id !== cardId);
    context.render();
    void context.saveBoard();
    new Notice('✓ card removed', 1500);
  }

  private showMilestoneMenu(milestone: Milestone, e: MouseEvent, context: ViewRendererContext): void {
    const menu = new Menu();

    menu.addItem(item => {
      item.setTitle('Edit').setIcon('pencil').onClick(() => {
        new MilestoneModal(context.app, milestone, (data) => {
          milestone.name = data.name;
          milestone.description = data.description;
          milestone.dueDate = data.dueDate ?? null;
          milestone.color = data.color;

          try {
            context.render();
            void context.saveBoard();
            new Notice('✓ milestone updated', 1500);
          } catch (error) {
            console.error('Error updating milestone:', error);
            console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
            new Notice('⚠️ milestone updated but render failed', 2000);
          }
        }).open();
      });
    });

    menu.addItem(item => {
      item.setTitle(milestone.completed ? 'Mark incomplete' : 'Mark complete')
        .setIcon(milestone.completed ? 'circle' : 'check-circle')
        .onClick(() => {
          milestone.completed = !milestone.completed;
          context.render();
          void context.saveBoard();
        });
    });

    menu.addSeparator();

    menu.addItem(item => {
      item.setTitle('Delete').setIcon('trash-2').onClick(() => {
        new ConfirmModal(
          context.app,
          'Delete milestone',
          `Delete milestone "${milestone.name}"?`,
          () => {
            const board = context.boardService.getBoard();
            board.milestones = board.milestones.filter(m => m.id !== milestone.id);
            context.render();
            void context.saveBoard();
            new Notice('✓ milestone deleted', 1500);
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
    const emptyState = createElement('div', { className: 'empty-state roadmap-empty' });
    const emptyIcon = createElement('div', { className: 'empty-icon' });
    setIcon(emptyIcon, 'flag');
    emptyState.appendChild(emptyIcon);
    emptyState.appendChild(createElement('h3', {}, ['No milestones']));
    emptyState.appendChild(createElement('p', {}, ['Create milestones to organize your roadmap and track progress.']));

    const createBtn = createElement('button', { className: 'primary-btn' }, ['Create milestone']);
    createBtn.addEventListener('click', () => this.createMilestone(context));
    emptyState.appendChild(createBtn);

    return emptyState;
  }

  cleanup(): void {
    this.draggedCard = null;
    this.currentContext = null;
    this.isRendering = false;
  }
}
