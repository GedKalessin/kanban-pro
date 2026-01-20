import { Menu, Notice, setIcon } from 'obsidian';
import { Milestone, KanbanCard } from '../../models/types';
import { createElement, formatDisplayDate, calculatePercentage } from '../../utils/helpers';
import { IViewRenderer, ViewRendererContext } from './IViewRenderer';

export class RoadmapViewRenderer implements IViewRenderer {
  render(container: HTMLElement, context: ViewRendererContext): void {
    container.addClass('kanban-roadmap-view');

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
    const progress = calculatePercentage(completedCards, milestoneCards.length);

    const milestoneEl = createElement('div', {
      className: `roadmap-milestone ${milestone.completed ? 'completed' : ''}`,
      'data-milestone-id': milestone.id
    });
    milestoneEl.style.borderLeftColor = milestone.color;

    // Header
    const header = createElement('div', { className: 'milestone-header' });

    const headerLeft = createElement('div', { className: 'header-left' });
    const icon = createElement('span', { className: 'milestone-icon' });
    setIcon(icon, milestone.completed ? 'check-circle' : 'circle');
    headerLeft.appendChild(icon);

    const title = createElement('h3', { className: 'milestone-title' }, [milestone.name]);
    headerLeft.appendChild(title);

    if (milestone.dueDate) {
      const dueDate = createElement('span', { className: 'milestone-due-date' }, [
        formatDisplayDate(milestone.dueDate)
      ]);
      headerLeft.appendChild(dueDate);
    }

    header.appendChild(headerLeft);

    const headerRight = createElement('div', { className: 'header-right' });
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

    // Progress
    const progressSection = createElement('div', { className: 'milestone-progress' });
    const progressBar = createElement('div', { className: 'progress-bar' });
    const progressFill = createElement('div', { className: 'progress-fill' });
    progressFill.style.width = `${progress}%`;
    progressFill.style.backgroundColor = milestone.color;
    progressBar.appendChild(progressFill);
    progressSection.appendChild(progressBar);

    const progressText = createElement('span', { className: 'progress-text' }, [
      `${completedCards}/${milestoneCards.length} cards completed (${Math.round(progress)}%)`
    ]);
    progressSection.appendChild(progressText);
    milestoneEl.appendChild(progressSection);

    // Cards
    const cardsSection = createElement('div', { className: 'milestone-cards' });
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
      'data-card-id': card.id
    });

    const cardContent = createElement('div', { className: 'card-content' });

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

    cardEl.appendChild(cardContent);

    return cardEl;
  }

  private addMilestone(context: ViewRendererContext): void {
    const { MilestoneModal } = require('../../modals/MilestoneModal');
    new MilestoneModal(context.app, null, (milestoneData) => {
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
    new MilestoneModal(context.app, milestone, (milestoneData) => {
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

    new SuggesterModal(
      context.app,
      items,
      (item) => {
        milestone.cardIds.push(item.value);
        context.render();
        context.saveBoard();
        new Notice('✅ Card added to milestone', 2000);
      },
      'Select a card',
      'No cards available'
    ).open();
  }
}
