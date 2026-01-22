// ============================================
// GanttViewRenderer - Frappe Gantt Implementation
// Utilizzo ottimizzato della libreria Frappe Gantt
// ============================================

import { setIcon, Notice } from 'obsidian';
import { KanbanCard } from '../../models/types';
import { createElement } from '../../utils/helpers';
import { IViewRenderer, ViewRendererContext } from './IViewRenderer';

// Import Frappe Gantt CSS
import 'frappe-gantt/dist/frappe-gantt.css';

export class GanttViewRenderer implements IViewRenderer {
  private ganttInstance: any = null;
  private currentViewMode: string = 'Day';
  private containerElement: HTMLElement | null = null;
  private ganttWrapper: HTMLElement | null = null;

  render(container: HTMLElement, context: ViewRendererContext): void {
    try {
      container.empty();
      container.addClass('kanban-gantt-view');
      this.containerElement = container;

      const toolbar = this.renderToolbar(context);
      container.appendChild(toolbar);

      const filteredCards = context.boardService.getFilteredCards()
        .filter(c => c.dueDate || (c as any).startDate);

      if (filteredCards.length === 0) {
        container.appendChild(this.renderEmptyState(context));
        return;
      }

      // Try to load Frappe Gantt
      let FrappeGantt: any = null;
      try {
        const ganttModule = require('frappe-gantt');
        // Handle both CommonJS and ES module exports
        FrappeGantt = ganttModule.default || ganttModule;
        console.log('Frappe Gantt loaded successfully');
      } catch (e) {
        console.warn('Frappe Gantt not available, using fallback:', e);
        this.renderFallback(container, filteredCards, context);
        return;
      }

      if (FrappeGantt && typeof FrappeGantt === 'function') {
        this.renderWithFrappeGantt(container, filteredCards, context, FrappeGantt);
      } else {
        console.warn('Frappe Gantt is not a constructor, using fallback');
        this.renderFallback(container, filteredCards, context);
      }
    } catch (error) {
      console.error('Gantt View Error:', error);
      this.renderError(container, 'Failed to render Gantt view', context);
    }
  }

  private renderWithFrappeGantt(
    container: HTMLElement,
    cards: KanbanCard[],
    context: ViewRendererContext,
    FrappeGantt: any
  ): void {
    const ganttContainer = container.createDiv({ cls: 'gantt-container-frappe' });

    // Prepara i task con date corrette e dipendenze
    const tasks = cards.map(card => {
      // Determina le date di inizio e fine
      let start: Date;
      let end: Date;

      // Se esiste startDate, usalo, altrimenti usa dueDate come start
      if ((card as any).startDate) {
        start = new Date((card as any).startDate);
      } else if (card.dueDate) {
        // Se c'è solo dueDate, usa oggi come start
        start = new Date();
      } else {
        // Default: oggi
        start = new Date();
      }

      // Se esiste dueDate, usalo come end, altrimenti calcola +7 giorni
      if (card.dueDate) {
        end = new Date(card.dueDate);
      } else {
        end = new Date(start);
        end.setDate(end.getDate() + 7); // Default: 7 giorni dopo start
      }

      // Normalizza le date a mezzanotte locale (rimuovi ore/minuti/secondi)
      start = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      end = new Date(end.getFullYear(), end.getMonth(), end.getDate());

      // Assicurati che end sia dopo start
      if (end < start) {
        console.warn(`Card "${card.title}": end date is before start date, swapping`);
        [start, end] = [end, start];
      }

      // Se end è uguale a start, aggiungi 1 giorno (Frappe Gantt richiede almeno 1 giorno di durata)
      if (end.getTime() === start.getTime()) {
        console.log(`Card "${card.title}": start and end are same, adding 1 day to end`);
        end = new Date(start);
        end.setDate(end.getDate() + 1);
      }

      // Calcola progress dalla checklist
      const progress = card.checklist.length > 0
        ? Math.round((card.checklist.filter(i => i.completed).length / card.checklist.length) * 100)
        : 0;

      // Gestisci le dipendenze - converti array di ID in stringa separata da virgole
      const dependencies = card.dependencies && card.dependencies.length > 0
        ? card.dependencies.join(', ')
        : '';

      const task = {
        id: card.id,
        name: card.title,
        start: this.formatDate(start),
        end: this.formatDate(end),
        progress: progress,
        dependencies: dependencies,
        custom_class: this.getCustomClass(card)
      };

      console.log(`Task: ${task.name} | Start: ${task.start} | End: ${task.end} | Progress: ${task.progress}% | Dependencies: ${dependencies || 'none'}`);

      return task;
    });

    console.log('Gantt tasks prepared:', tasks.length, 'tasks');

    try {
      // Destroy previous instance
      if (this.ganttInstance) {
        this.ganttInstance = null;
      }

      // Create wrapper per il gantt con SVG container
      this.ganttWrapper = ganttContainer.createDiv({ cls: 'gantt-wrapper' });

      // Inizializza Frappe Gantt con configurazione ottimizzata (ClickUp style)
      this.ganttInstance = new FrappeGantt(this.ganttWrapper, tasks, {
        // Layout settings - ClickUp style
        header_height: 50,
        column_width: 30,
        step: 24,
        bar_height: 32,
        bar_corner_radius: 6,
        arrow_curve: 14, // Curved arrows like Vue example
        padding: 20,

        // View configuration
        view_modes: ['Quarter Day', 'Half Day', 'Day', 'Week', 'Month', 'Year'],
        view_mode: this.currentViewMode,

        // Date formatting
        date_format: 'YYYY-MM-DD',

        // Popup configuration - usa 'click' per popolare il popup solo al click
        popup_trigger: 'click',
        language: 'en',

        // Custom popup HTML - ClickUp style
        custom_popup_html: (task: any) => {
          const card = context.boardService.getCard(task.id);
          if (!card) return '<div class="gantt-popup-wrapper">Task not found</div>';

          const column = context.boardService.getColumn(card.columnId);
          const startDate = new Date(task._start);
          const endDate = new Date(task._end);
          const duration = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

          // Priority badge
          const priorityBadge = card.priority !== 'none'
            ? `<span class="popup-priority priority-${card.priority}">${card.priority.toUpperCase()}</span>`
            : '';

          // Dependencies info
          const depsInfo = card.dependencies && card.dependencies.length > 0
            ? `<div class="popup-dependencies"><strong>Dependencies:</strong> ${card.dependencies.length} task${card.dependencies.length > 1 ? 's' : ''}</div>`
            : '';

          return `
            <div class="gantt-popup-wrapper">
              <div class="popup-header">
                <div class="popup-title">${this.escapeHtml(task.name)}</div>
                ${priorityBadge}
              </div>
              <div class="popup-column" style="background-color: ${column?.color || '#94a3b8'}20; color: ${column?.color || '#94a3b8'};">
                ${this.escapeHtml(column?.name || 'No column')}
              </div>
              ${card.description ? `<div class="popup-description">${this.escapeHtml(card.description)}</div>` : ''}
              <div class="popup-dates">
                <strong>Start:</strong> ${startDate.toLocaleDateString()}<br>
                <strong>End:</strong> ${endDate.toLocaleDateString()}<br>
                <strong>Duration:</strong> ${duration} day${duration !== 1 ? 's' : ''}
              </div>
              <div class="popup-progress">
                <strong>Progress:</strong> ${Math.round(task.progress)}%
                ${card.checklist.length > 0 ? ` (${card.checklist.filter((i: any) => i.completed).length}/${card.checklist.length} items)` : ''}
              </div>
              ${card.assignee && card.assignee.length > 0 ? `<div class="popup-assignee"><strong>👤 Assignee:</strong> ${this.escapeTagsArray(card.assignee)}</div>` : ''}
              ${card.tags && card.tags.length > 0 ? `<div class="popup-tags"><strong>🏷️ Tags:</strong> ${this.escapeTagsArray(card.tags)}</div>` : ''}
              ${depsInfo}
            </div>
          `;
        },

        // Event handlers
        on_click: (task: any) => {
          console.log('Task clicked:', task);
          context.onCardClick(task.id);
        },

        on_date_change: (task: any, start: Date, end: Date) => {
          console.log('Date changed:', task.id, start, end);

          // Normalizza le date
          const startISO = new Date(start.getFullYear(), start.getMonth(), start.getDate()).toISOString();
          const endISO = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59).toISOString();

          context.boardService.updateCard(task.id, {
            startDate: startISO,
            dueDate: endISO
          });
          context.saveBoard();
          new Notice('Dates updated successfully', 1500);
        },

        on_progress_change: (task: any, progress: number) => {
          console.log('Progress changed:', task.id, progress);

          const card = context.boardService.getCard(task.id);
          if (card && card.checklist.length > 0) {
            const itemsToComplete = Math.round((progress / 100) * card.checklist.length);
            card.checklist.forEach((item, idx) => {
              context.boardService.updateChecklistItem(card.id, item.id, {
                completed: idx < itemsToComplete
              });
            });
            context.saveBoard();
            new Notice('Progress updated successfully', 1500);
          }
        },

        on_view_change: (mode: string) => {
          console.log('View mode changed:', mode);
          this.currentViewMode = mode;
        }
      });

      console.log('Gantt initialized successfully with', tasks.length, 'tasks');

    } catch (error) {
      console.error('Frappe Gantt initialization error:', error);
      ganttContainer.empty();
      const errorMsg = ganttContainer.createDiv({ cls: 'gantt-error' });
      errorMsg.innerHTML = `
        <h3>⚠️ Error loading Gantt chart</h3>
        <p>Using fallback view...</p>
      `;
      setTimeout(() => this.renderFallback(container, cards, context), 100);
    }
  }

  private getCustomClass(card: KanbanCard): string {
    // Priority based classes (highest priority)
    if (card.blocked) return 'bar-blocked';
    if (card.completedAt) return 'bar-completed';

    // Priority classes
    if (card.priority === 'critical') return 'bar-critical';
    if (card.priority === 'high') return 'bar-high';
    if (card.priority === 'medium') return 'bar-medium';
    if (card.priority === 'low') return 'bar-low';

    // Assignee based classes (for color variety like Vue example)
    if (card.assignee && card.assignee.length > 0) {
      // Create a deterministic hash from assignee name to assign consistent colors
      const assigneeName = card.assignee[0].toLowerCase();
      const hash = Array.from(assigneeName).reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const colorIndex = hash % 6; // 6 different assignee colors
      return `bar-assignee-${colorIndex}`;
    }

    // Task type based classes
    if (card.taskType === 'bug') return 'bar-bug';
    if (card.taskType === 'feature') return 'bar-feature';
    if (card.taskType === 'epic') return 'bar-epic';

    // Default
    return 'bar-default';
  }

  private renderToolbar(context: ViewRendererContext): HTMLElement {
    const toolbar = createElement('div', { className: 'gantt-toolbar' });

    const leftSection = toolbar.createDiv({ cls: 'toolbar-left' });
    leftSection.createEl('h3', { text: 'Gantt Chart', cls: 'gantt-title' });

    const rightSection = toolbar.createDiv({ cls: 'toolbar-right' });

    // View mode buttons con icone e layout migliorato
    const viewModes = [
      { mode: 'Quarter Day', label: 'Quarter', icon: 'clock' },
      { mode: 'Half Day', label: 'Half Day', icon: 'sunrise' },
      { mode: 'Day', label: 'Day', icon: 'calendar-days' },
      { mode: 'Week', label: 'Week', icon: 'calendar-range' },
      { mode: 'Month', label: 'Month', icon: 'calendar' },
      { mode: 'Year', label: 'Year', icon: 'calendar-clock' }
    ];

    const viewModeContainer = rightSection.createDiv({ cls: 'view-mode-buttons' });

    viewModes.forEach(({ mode, label }) => {
      const btn = viewModeContainer.createEl('button', {
        text: label,
        cls: `view-mode-btn ${this.currentViewMode === mode ? 'active' : ''}`
      });

      btn.setAttribute('data-mode', mode);

      btn.addEventListener('click', () => {
        if (this.ganttInstance) {
          try {
            this.ganttInstance.change_view_mode(mode);
            this.currentViewMode = mode;

            // Update button states
            viewModeContainer.querySelectorAll('.view-mode-btn').forEach(b => b.removeClass('active'));
            btn.addClass('active');
          } catch (error) {
            console.error('Error changing view mode:', error);
            new Notice('Failed to change view mode', 2000);
          }
        }
      });
    });

    // Aggiungi pulsante Today per tornare alla data corrente
    const todayBtn = rightSection.createEl('button', {
      text: 'Today',
      cls: 'gantt-today-btn'
    });

    todayBtn.addEventListener('click', () => {
      if (this.ganttInstance && this.ganttWrapper) {
        // Scroll to today
        const todayHighlight = this.ganttWrapper.querySelector('.today-highlight');
        if (todayHighlight) {
          todayHighlight.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        }
      }
    });

    return toolbar;
  }

  private renderFallback(container: HTMLElement, cards: KanbanCard[], context: ViewRendererContext): void {
    const fallbackContainer = container.createDiv({ cls: 'gantt-fallback' });
    
    const warning = fallbackContainer.createDiv({ cls: 'gantt-warning' });
    warning.innerHTML = `
      <strong>⚠️ Frappe Gantt not available</strong><br>
      Install it with: <code>npm install frappe-gantt</code>
    `;

    // Simple list view
    const list = fallbackContainer.createDiv({ cls: 'gantt-simple-list' });
    cards.forEach(card => {
      const item = list.createDiv({ cls: 'gantt-list-item' });
      
      const title = item.createDiv({ cls: 'item-title' });
      title.textContent = card.title;
      title.addEventListener('click', () => context.onCardClick(card.id));

      const dates = item.createDiv({ cls: 'item-dates' });
      const start = (card as any).startDate || card.dueDate;
      const end = card.dueDate;
      if (start && end) {
        const startDate = new Date(start);
        const endDate = new Date(end);
        const duration = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        dates.textContent = `${startDate.toLocaleDateString()} → ${endDate.toLocaleDateString()} (${duration} days)`;
      }
    });
  }

  private renderEmptyState(context: ViewRendererContext): HTMLElement {
    const emptyState = createElement('div', { className: 'empty-state gantt-empty' });
    const emptyIcon = createElement('div', { className: 'empty-icon' });
    setIcon(emptyIcon, 'gantt-chart');
    emptyState.appendChild(emptyIcon);
    emptyState.appendChild(createElement('h3', {}, ['No tasks with dates']));
    emptyState.appendChild(createElement('p', {}, ['Add start and due dates to cards to see them in Gantt view.']));
    
    const createBtn = createElement('button', { className: 'primary-btn' }, ['Create Task']);
    createBtn.addEventListener('click', () => {
      const board = context.boardService.getBoard();
      if (board.columns.length > 0) {
        const { QuickAddCardModal } = require('../../modals/UtilityModals');
        interface QuickAddCardData {
          title: string;
          startDate?: string;
          dueDate?: string;
        }

        interface QuickAddCardCallback {
          (title: string, startDate?: string, dueDate?: string): void;
        }

        new QuickAddCardModal(
          context.app, 
          ((title: string, startDate?: string, dueDate?: string): void => {
            context.boardService.addCard(board.columns[0].id, {
              title,
              startDate: startDate ?? new Date().toISOString(),
              dueDate: dueDate ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            });
            context.render();
            context.saveBoard();
          }) as QuickAddCardCallback
        ).open();
      }
    });
    emptyState.appendChild(createBtn);
    
    return emptyState;
  }

  private renderError(container: HTMLElement, message: string, context: ViewRendererContext): void {
    const errorDiv = container.createDiv({ cls: 'view-error' });
    setIcon(errorDiv.createDiv({ cls: 'error-icon' }), 'alert-triangle');
    errorDiv.createEl('h3', { text: '⚠️ Gantt Error' });
    errorDiv.createEl('p', { text: message });
    
    const backBtn = errorDiv.createEl('button', { text: 'Back to Board', cls: 'primary-btn' });
    backBtn.addEventListener('click', () => context.render());
  }

  cleanup(): void {
    if (this.ganttInstance) {
      this.ganttInstance = null;
    }
    this.containerElement = null;
    this.ganttWrapper = null;
  }

  // Helper methods
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private escapeTagsArray(tags: string[]): string {
    return tags.map(tag => this.escapeHtml(tag)).join(', ');
  }
}
