// ============================================
// FIX COMPLETO: src/views/renderers/GanttViewRenderer.ts
// Frappe Gantt con tutte le view modes corrette
// ============================================

import { setIcon, Notice } from 'obsidian';
import { KanbanCard } from '../../models/types';
import { createElement } from '../../utils/helpers';
import { IViewRenderer, ViewRendererContext } from './IViewRenderer';

export class GanttViewRenderer implements IViewRenderer {
  private ganttInstance: any = null;
  private currentViewMode: string = 'Day';
  private containerElement: HTMLElement | null = null;

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
        console.log('Frappe Gantt loaded:', typeof FrappeGantt);
      } catch (e) {
        console.warn('Frappe Gantt not available:', e);
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

    // Prepara i task con date corrette
    const tasks = cards.map(card => {
      let start = (card as any).startDate 
        ? new Date((card as any).startDate) 
        : card.dueDate 
          ? new Date(card.dueDate) 
          : new Date();
      
      let end = card.dueDate ? new Date(card.dueDate) : new Date(start);
      
      // Normalizza le date a mezzanotte UTC
      start = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()));
      end = new Date(Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()));
      
      // Se end è uguale a start, aggiungi 1 giorno
      if (end.getTime() === start.getTime()) {
        end = new Date(start);
        end.setDate(end.getDate() + 1);
      }

      // Calcola progress
      const progress = card.checklist.length > 0 
        ? Math.round((card.checklist.filter(i => i.completed).length / card.checklist.length) * 100)
        : 0;

      return {
        id: card.id,
        name: card.title,
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
        progress: progress,
        dependencies: '', // Puoi aggiungere dipendenze se necessario
        custom_class: this.getCustomClass(card)
      };
    });

    console.log('Gantt tasks:', tasks);

    try {
      // Destroy previous instance
      if (this.ganttInstance) {
        this.ganttInstance = null;
      }

      // Create wrapper per il gantt
      const wrapper = ganttContainer.createDiv({ cls: 'gantt-wrapper' });

      // Inizializza Frappe Gantt con configurazione corretta
      this.ganttInstance = new FrappeGantt(wrapper, tasks, {
        header_height: 50,
        column_width: 30,
        step: 24,
        view_modes: ['Quarter Day', 'Half Day', 'Day', 'Week', 'Month', 'Year'],
        bar_height: 20,
        bar_corner_radius: 3,
        arrow_curve: 5,
        padding: 18,
        view_mode: this.currentViewMode,
        date_format: 'YYYY-MM-DD',
        popup_trigger: 'click',
        language: 'en',
        
        // Custom popup HTML
        custom_popup_html: (task: any) => {
          const card = context.boardService.getCard(task.id);
          if (!card) return '';

          const column = context.boardService.getColumn(card.columnId);
          const startDate = new Date(task._start);
          const endDate = new Date(task._end);
          const duration = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

          return `
            <div class="gantt-popup-wrapper">
              <div class="popup-title">${task.name}</div>
              <div class="popup-column">${column?.name || 'No column'}</div>
              <div class="popup-dates">
                <strong>Start:</strong> ${startDate.toLocaleDateString()}<br>
                <strong>End:</strong> ${endDate.toLocaleDateString()}<br>
                <strong>Duration:</strong> ${duration} day${duration !== 1 ? 's' : ''}
              </div>
              <div class="popup-progress">
                <strong>Progress:</strong> ${Math.round(task.progress)}%
              </div>
              ${card.assignee ? `<div class="popup-assignee"><strong>Assignee:</strong> ${card.assignee}</div>` : ''}
            </div>
          `;
        },

        on_click: (task: any) => {
          console.log('Task clicked:', task);
          context.onCardClick(task.id);
        },

        on_date_change: (task: any, start: Date, end: Date) => {
          console.log('Date changed:', task.id, start, end);
          
          // Normalizza le date
          const startISO = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())).toISOString();
          const endISO = new Date(Date.UTC(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59)).toISOString();
          
          context.boardService.updateCard(task.id, {
            startDate: startISO,
            dueDate: endISO
          });
          context.saveBoard();
          new Notice('✓ Dates updated', 1500);
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
            new Notice('✓ Progress updated', 1500);
          }
        },

        on_view_change: (mode: string) => {
          console.log('View mode changed:', mode);
          this.currentViewMode = mode;
        }
      });

      console.log('Gantt initialized successfully');

    } catch (error) {
      console.error('Frappe Gantt initialization error:', error);
      ganttContainer.empty();
      const errorMsg = ganttContainer.createDiv({ cls: 'gantt-error' });
      errorMsg.textContent = '⚠️ Error loading Gantt chart. Using fallback view.';
      setTimeout(() => this.renderFallback(container, cards, context), 100);
    }
  }

  private getCustomClass(card: KanbanCard): string {
    if (card.blocked) return 'bar-blocked';
    if (card.completedAt) return 'bar-completed';
    if (card.priority === 'critical') return 'bar-critical';
    if (card.priority === 'high') return 'bar-high';
    return '';
  }

  private renderToolbar(context: ViewRendererContext): HTMLElement {
    const toolbar = createElement('div', { className: 'gantt-toolbar' });
    
    const leftSection = toolbar.createDiv({ cls: 'toolbar-left' });
    leftSection.createEl('h3', { text: 'Gantt Chart' });

    const rightSection = toolbar.createDiv({ cls: 'toolbar-right' });

    // View mode buttons
    const viewModes = ['Quarter Day', 'Half Day', 'Day', 'Week', 'Month', 'Year'];
    const viewModeContainer = rightSection.createDiv({ cls: 'view-mode-buttons' });

    viewModes.forEach(mode => {
      const btn = viewModeContainer.createEl('button', {
        text: mode,
        cls: `view-mode-btn ${this.currentViewMode === mode ? 'active' : ''}`
      });
      
      btn.addEventListener('click', () => {
        if (this.ganttInstance) {
          this.ganttInstance.change_view_mode(mode);
          this.currentViewMode = mode;
          
          // Update button states
          viewModeContainer.querySelectorAll('.view-mode-btn').forEach(b => b.removeClass('active'));
          btn.addClass('active');
        }
      });
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
  }
}
