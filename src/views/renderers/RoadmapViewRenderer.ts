import { Menu, Notice, setIcon } from 'obsidian';
import { Milestone, KanbanCard } from '../../models/types';
import { createElement, formatDisplayDate } from '../../utils/helpers';
import { IViewRenderer, ViewRendererContext } from './IViewRenderer';

export class RoadmapViewRenderer implements IViewRenderer {
  private draggedCard: HTMLElement | null = null;
  private currentContext: ViewRendererContext | null = null;

  render(container: HTMLElement, context: ViewRendererContext): void {
    container.addClass('kanban-roadmap-view');
    this.currentContext = context;

    const toolbar = this.renderToolbar(context);
    container.appendChild(toolbar);

    const board = context.boardService.getBoard();
    const milestones = [...board.milestones].sort((a, b) => a.order - b.order);

    if (milestones.length === 0) {
      container.appendChild(this.renderEmptyState(context));
      return;
    }

    const roadmapContent = this.renderRoadmapContent(milestones, context);
    container.appendChild(roadmapContent);

    // Setup drag and drop per le milestone
    this.setupMilestoneDragDrop(container, context);
  }

  private renderToolbar(context: ViewRendererContext): HTMLElement {
    const toolbar = createElement('div', { className: 'roadmap-toolbar' });

    const addMilestoneBtn = createElement('button', { className: 'add-milestone-btn' });
    setIcon(addMilestoneBtn, 'plus');
    addMilestoneBtn.appendChild(createElement('span', {}, ['Add Milestone']));
    addMilestoneBtn.addEventListener('click', () => this.addMilestone(context));
    toolbar.appendChild(addMilestoneBtn);

    return toolbar;
  }

  private renderEmptyState(context: ViewRendererContext): HTMLElement {
    const emptyState = createElement('div', { className: 'empty-state' });
    const emptyIcon = createElement('div', { className: 'empty-icon' });
    setIcon(emptyIcon, 'milestone');
    emptyState.appendChild(emptyIcon);
    emptyState.appendChild(createElement('h3', {}, ['No milestones yet']));
    emptyState.appendChild(createElement('p', {}, ['Create milestones to organize your roadmap.']));

    const createBtn = createElement('button', { className: 'primary-btn' }, ['Create First Milestone']);
    createBtn.addEventListener('click', () => this.addMilestone(context));
    emptyState.appendChild(createBtn);

    return emptyState;
  }

  private renderRoadmapContent(milestones: Milestone[], context: ViewRendererContext): HTMLElement {
    const content = createElement('div', { className: 'roadmap-content' });

    milestones.forEach(milestone => {
      const milestoneEl = this.renderMilestone(milestone, context);
      content.appendChild(milestoneEl);
    });

    return content;
  }

  private renderMilestone(milestone: Milestone, context: ViewRendererContext): HTMLElement {
    const board = context.boardService.getBoard();
    const milestoneCards = board.cards.filter(c => milestone.cardIds.includes(c.id));
    const completedCards = milestoneCards.filter(c => c.completedAt).length;
    const progress = milestoneCards.length > 0
      ? (completedCards / milestoneCards.length) * 100
      : 0;

    const milestoneEl = createElement('div', {
      className: `roadmap-milestone ${milestone.completed ? 'completed' : ''}`,
      'data-milestone-id': milestone.id
    });

    // FIX: Applicare il colore correttamente
    milestoneEl.style.setProperty('--milestone-color', milestone.color);
    milestoneEl.style.borderLeftColor = milestone.color;
    milestoneEl.style.borderLeftWidth = '4px';
    milestoneEl.style.borderLeftStyle = 'solid';

    // Header con design migliorato
    const header = createElement('div', { className: 'milestone-header' });
    header.style.backgroundColor = `${milestone.color}15`; // 15 = 8% opacity

    const headerLeft = createElement('div', { className: 'header-left' });

    const iconWrapper = createElement('div', { className: 'milestone-icon-wrapper' });
    iconWrapper.style.backgroundColor = milestone.color;
    const icon = createElement('span', { className: 'milestone-icon' });
    setIcon(icon, milestone.completed ? 'check-circle' : 'target');
    iconWrapper.appendChild(icon);
    headerLeft.appendChild(iconWrapper);

    const titleSection = createElement('div', { className: 'title-section' });
    const title = createElement('h3', { className: 'milestone-title' }, [milestone.name]);
    titleSection.appendChild(title);

    if (milestone.dueDate) {
      const dueDate = createElement('span', { className: 'milestone-due-date' });
      const calIcon = createElement('span', { className: 'cal-icon' });
      setIcon(calIcon, 'calendar');
      dueDate.appendChild(calIcon);
      dueDate.appendChild(document.createTextNode(formatDisplayDate(milestone.dueDate)));
      titleSection.appendChild(dueDate);
    }

    headerLeft.appendChild(titleSection);
    header.appendChild(headerLeft);

    const headerRight = createElement('div', { className: 'header-right' });

    // Progress badge
    const progressBadge = createElement('span', { className: 'progress-badge' });
    progressBadge.textContent = `${completedCards}/${milestoneCards.length}`;
    progressBadge.style.backgroundColor = milestone.color;
    progressBadge.style.color = 'white';
    headerRight.appendChild(progressBadge);

    const menuBtn = createElement('button', { className: 'milestone-menu-btn clickable-icon' });
    setIcon(menuBtn, 'more-horizontal');
    menuBtn.addEventListener('click', (e) => this.showMilestoneMenu(milestone, e, context));
    headerRight.appendChild(menuBtn);

    header.appendChild(headerRight);
    milestoneEl.appendChild(header);

    // Description
    if (milestone.description) {
      const description = createElement('p', { className: 'milestone-description' }, [milestone.description]);
      milestoneEl.appendChild(description);
    }

    // Progress bar
    const progressSection = createElement('div', { className: 'milestone-progress' });
    const progressBar = createElement('div', { className: 'progress-bar-container' });
    const progressFill = createElement('div', { className: 'progress-fill' });
    progressFill.style.width = `${progress}%`;
    progressFill.style.backgroundColor = milestone.color;
    progressBar.appendChild(progressFill);
    progressSection.appendChild(progressBar);

    const progressText = createElement('span', { className: 'progress-text' }, [
      `${Math.round(progress)}% complete`
    ]);
    progressSection.appendChild(progressText);
    milestoneEl.appendChild(progressSection);

    // Cards drop zone
    const cardsSection = createElement('div', {
      className: 'milestone-cards',
      'data-milestone-id': milestone.id
    });

    milestoneCards.forEach(card => {
      const cardEl = this.renderMilestoneCard(card, context);
      cardsSection.appendChild(cardEl);
    });

    // Add card button
    const addCardBtn = createElement('button', { className: 'add-card-to-milestone-btn' });
    setIcon(addCardBtn, 'plus');
    addCardBtn.appendChild(createElement('span', {}, ['Add Card']));
    addCardBtn.addEventListener('click', () => this.addCardToMilestone(milestone, context));
    cardsSection.appendChild(addCardBtn);

    milestoneEl.appendChild(cardsSection);

    return milestoneEl;
  }

  private renderMilestoneCard(card: KanbanCard, context: ViewRendererContext): HTMLElement {
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

    const title = createElement('span', { className: 'card-title' }, [card.title]);
    title.addEventListener('click', () => context.onCardClick(card.id));
    cardContent.appendChild(title);

    const status = createElement('span', { className: 'card-status' });
    status.textContent = column?.name || '';
    status.style.backgroundColor = column?.color || '#94a3b8';
    cardContent.appendChild(status);

    const removeBtn = createElement('button', { className: 'remove-card-btn' });
    setIcon(removeBtn, 'x');
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Trova la milestone e rimuovi la card
      const board = context.boardService.getBoard();
      board.milestones.forEach(m => {
        m.cardIds = m.cardIds.filter(id => id !== card.id);
      });
      context.render();
      context.saveBoard();
      new Notice('Card removed from milestone', 2000);
    });
    cardContent.appendChild(removeBtn);

    cardEl.appendChild(cardContent);

    return cardEl;
  }

  private addMilestone(context: ViewRendererContext): void {
    const { MilestoneModal } = require('../../modals/MilestoneModal');
    interface MilestoneFormData {
      name: string;
      description: string;
      dueDate: string;
      color: string;
    }

    new MilestoneModal(context.app, null, (milestoneData: MilestoneFormData) => {
      const board = context.boardService.getBoard();
      const newMilestone: Milestone = {
        id: require('../../utils/helpers').generateId(),
        name: milestoneData.name,
        description: milestoneData.description,
        dueDate: milestoneData.dueDate,
        color: milestoneData.color || '#6366f1',
        completed: false,
        order: board.milestones.length,
        cardIds: []
      };
      board.milestones.push(newMilestone);
      context.render();
      context.saveBoard();
      new Notice('✅ Milestone created', 2000);
    }).open();
  }

  private showMilestoneMenu(milestone: Milestone, event: MouseEvent, context: ViewRendererContext): void {
    const menu = new Menu();

    menu.addItem((item) =>
      item.setTitle('Edit').setIcon('pencil').onClick(() => this.editMilestone(milestone, context))
    );

    menu.addItem((item) =>
      item
        .setTitle(milestone.completed ? 'Mark as Incomplete' : 'Mark as Complete')
        .setIcon(milestone.completed ? 'circle' : 'check-circle')
        .onClick(() => this.toggleMilestoneComplete(milestone, context))
    );

    menu.addSeparator();

    menu.addItem((item) =>
      item.setTitle('Delete').setIcon('trash').onClick(() => this.deleteMilestone(milestone, context))
    );

    menu.showAtMouseEvent(event);
  }

  private editMilestone(milestone: Milestone, context: ViewRendererContext): void {
    const { MilestoneModal } = require('../../modals/MilestoneModal');
    interface MilestoneFormData {
        name: string;
        description: string;
        dueDate: string;
        color: string;
    }

    new MilestoneModal(context.app, milestone, (milestoneData: MilestoneFormData) => {
        milestone.name = milestoneData.name;
        milestone.description = milestoneData.description;
        milestone.dueDate = milestoneData.dueDate;
        milestone.color = milestoneData.color || milestone.color;
        context.render();
        context.saveBoard();
        new Notice('✅ Milestone updated', 2000);
    }).open();
  }

  private toggleMilestoneComplete(milestone: Milestone, context: ViewRendererContext): void {
    milestone.completed = !milestone.completed;
    context.render();
    context.saveBoard();
    new Notice(milestone.completed ? '✅ Milestone completed' : '↩️ Milestone reopened', 2000);
  }

  private deleteMilestone(milestone: Milestone, context: ViewRendererContext): void {
    const { ConfirmModal } = require('../../modals/UtilityModals');
    new ConfirmModal(
      context.app,
      'Delete Milestone',
      `Delete "${milestone.name}"? Cards will not be deleted.`,
      () => {
        const board = context.boardService.getBoard();
        board.milestones = board.milestones.filter(m => m.id !== milestone.id);
        context.render();
        context.saveBoard();
        new Notice('🗑️ Milestone deleted', 2000);
      },
      'Delete',
      'Cancel',
      true
    ).open();
  }

  private addCardToMilestone(milestone: Milestone, context: ViewRendererContext): void {
    const board = context.boardService.getBoard();
    const availableCards = board.cards.filter(c => !milestone.cardIds.includes(c.id));

    if (availableCards.length === 0) {
      new Notice('⚠️ No available cards', 2000);
      return;
    }

    const { SuggesterModal } = require('../../modals/UtilityModals');
    const items = availableCards.map(card => ({
      display: card.title,
      value: card.id
    }));

    interface SuggesterItem {
      display: string;
      value: string;
    }

    new SuggesterModal(
      context.app,
      items,
      (item: SuggesterItem) => {
        milestone.cardIds.push(item.value);
        context.render();
        context.saveBoard();
        new Notice('✅ Card added to milestone', 2000);
      },
      'Select a card',
      'No cards available'
    ).open();
  }

  private setupMilestoneDragDrop(container: HTMLElement, context: ViewRendererContext): void {
    // Drag start
    container.addEventListener('dragstart', (e: DragEvent) => {
      const target = e.target as HTMLElement;
      if (!target.classList.contains('milestone-card')) return;

      this.draggedCard = target;
      target.classList.add('dragging');

      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', target.dataset.cardId || '');
      }
    });

    // Drag end
    container.addEventListener('dragend', (e: DragEvent) => {
      const target = e.target as HTMLElement;
      if (!target.classList.contains('milestone-card')) return;

      target.classList.remove('dragging');
      this.draggedCard = null;

      // Remove drag-over classes
      container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });

    // Drag over
    container.addEventListener('dragover', (e: DragEvent) => {
      e.preventDefault();
      if (!this.draggedCard) return;

      const target = e.target as HTMLElement;
      const milestoneCards = target.closest('.milestone-cards') as HTMLElement;

      if (!milestoneCards) return;

      milestoneCards.classList.add('drag-over');
    });

    // Drag leave
    container.addEventListener('dragleave', (e: DragEvent) => {
      const target = e.target as HTMLElement;
      const milestoneCards = target.closest('.milestone-cards') as HTMLElement;

      if (milestoneCards) {
        milestoneCards.classList.remove('drag-over');
      }
    });

    // Drop
    container.addEventListener('drop', (e: DragEvent) => {
      e.preventDefault();
      if (!this.draggedCard) return;

      const target = e.target as HTMLElement;
      const milestoneCards = target.closest('.milestone-cards') as HTMLElement;

      if (!milestoneCards) return;

      const cardId = this.draggedCard.dataset.cardId;
      const toMilestoneId = milestoneCards.dataset.milestoneId;

      if (!cardId || !toMilestoneId) return;

      // Remove card from all milestones
      const board = context.boardService.getBoard();
      board.milestones.forEach(m => {
        m.cardIds = m.cardIds.filter(id => id !== cardId);
      });

      // Add to target milestone
      const targetMilestone = board.milestones.find(m => m.id === toMilestoneId);
      if (targetMilestone && !targetMilestone.cardIds.includes(cardId)) {
        targetMilestone.cardIds.push(cardId);
      }

      milestoneCards.classList.remove('drag-over');
      context.render();
      context.saveBoard();
      new Notice('✓ Card moved to milestone', 1500);
    });
  }
}
