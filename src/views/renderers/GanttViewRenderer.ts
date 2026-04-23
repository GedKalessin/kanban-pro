import { setIcon, Notice } from 'obsidian';
import { KanbanCard } from '../../models/types';
import { createElement } from '../../utils/helpers';
import { IViewRenderer, ViewRendererContext } from './IViewRenderer';
import { QuickAddCardModal } from '../../modals/UtilityModals';
import * as frappeGanttModule from 'frappe-gantt';

// Import Frappe Gantt CSS
import 'frappe-gantt/dist/frappe-gantt.css';

interface GanttTask {
  id: string;
  name: string;
  start: string;
  end: string;
  progress: number;
  dependencies: string;
  custom_class: string;
  _start?: string;
  _end?: string;
}

interface GanttInstance {
  change_view_mode: (mode: string) => void;
}

type FrappeGanttConstructor = new (
  el: HTMLElement,
  tasks: GanttTask[],
  options: Record<string, unknown>
) => GanttInstance;

interface FrappeGanttModule {
  default?: FrappeGanttConstructor;
}

export class GanttViewRenderer implements IViewRenderer {
  private ganttInstance: GanttInstance | null = null;
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
        .filter(c => c.dueDate || c.startDate);

      if (filteredCards.length === 0) {
        container.appendChild(this.renderEmptyState(context));
        return;
      }

      // Try to load Frappe Gantt
      let FrappeGantt: FrappeGanttConstructor | null = null;
      try {
        const ganttMod = frappeGanttModule as unknown as FrappeGanttModule;
        FrappeGantt = ganttMod.default ?? (frappeGanttModule as unknown as FrappeGanttConstructor);
        console.debug('Frappe Gantt loaded successfully');
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
    FrappeGantt: FrappeGanttConstructor
  ): void {
    const ganttContainer = container.createDiv({ cls: 'gantt-container-frappe' });

    const tasks = cards.map(card => {
      let start: Date;
      let end: Date;

      if (card.startDate) {
        start = new Date(card.startDate);
      } else if (card.dueDate) {
        start = new Date();
      } else {
        start = new Date();
      }

      if (card.dueDate) {
        end = new Date(card.dueDate);
      } else {
        end = new Date(start);
        end.setDate(end.getDate() + 7);
      }

      start = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      end = new Date(end.getFullYear(), end.getMonth(), end.getDate());

      if (end < start) {
        console.warn(`Card "${card.title}": end date is before start date, swapping`);
        [start, end] = [end, start];
      }

      if (end.getTime() === start.getTime()) {
        console.debug(`Card "${card.title}": start and end are same, adding 1 day to end`);
        end = new Date(start);
        end.setDate(end.getDate() + 1);
      }

      const progress = card.checklist.length > 0
        ? Math.round((card.checklist.filter(i => i.completed).length / card.checklist.length) * 100)
        : 0;

      const dependencies = card.dependencies && card.dependencies.length > 0
        ? card.dependencies.join(', ')
        : '';

      const maxTitleLength = 25;
      const displayTitle = card.title.length > maxTitleLength
        ? card.title.substring(0, maxTitleLength) + '...'
        : card.title;

      const task = {
        id: card.id,
        name: displayTitle,
        start: this.formatDate(start),
        end: this.formatDate(end),
        progress: progress,
        dependencies: dependencies,
        custom_class: this.getCustomClass(card)
      };

      console.debug(`Task: ${task.name} | Start: ${task.start} | End: ${task.end} | Progress: ${task.progress}% | Dependencies: ${dependencies || 'none'}`);

      return task;
    });

    console.debug('Gantt tasks prepared:', tasks.length, 'tasks');

    try {
      if (this.ganttInstance) {
        this.ganttInstance = null;
      }

      this.ganttWrapper = ganttContainer.createDiv({ cls: 'gantt-wrapper' });

      this.ganttInstance = new FrappeGantt(this.ganttWrapper, tasks, {
        header_height: 50,
        column_width: 30,
        step: 24,
        bar_height: 32,
        bar_corner_radius: 6,
        arrow_curve: 14,
        padding: 20,

        view_modes: ['Quarter Day', 'Half Day', 'Day', 'Week', 'Month', 'Year'],
        view_mode: this.currentViewMode,

        date_format: 'YYYY-MM-DD',

        popup_trigger: 'click',
        language: 'en',

        custom_popup_html: (task: GanttTask) => {
          const card = context.boardService.getCard(task.id);
          if (!card) return '<div class="gantt-popup-wrapper">Task not found</div>';

          const column = context.boardService.getColumn(card.columnId);
          const startDate = new Date(task._start ?? task.start);
          const endDate = new Date(task._end ?? task.end);
          const duration = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

          const priorityBadge = card.priority !== 'none'
            ? `<span class="popup-priority priority-${card.priority}">${card.priority.toUpperCase()}</span>`
            : '';

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
                ${card.checklist.length > 0 ? ` (${card.checklist.filter(i => i.completed).length}/${card.checklist.length} items)` : ''}
              </div>
              ${card.assignee && card.assignee.length > 0 ? `<div class="popup-assignee"><strong>👤 Assignee:</strong> ${this.escapeTagsArray(card.assignee)}</div>` : ''}
              ${card.tags && card.tags.length > 0 ? `<div class="popup-tags"><strong>🏷️ Tags:</strong> ${this.escapeTagsArray(card.tags)}</div>` : ''}
              ${depsInfo}
            </div>
          `;
        },

        on_click: (task: GanttTask) => {
          console.debug('Task clicked:', task);
          context.onCardClick(task.id);
        },

        on_date_change: (task: GanttTask, start: Date, end: Date) => {
          console.debug('Date changed:', task.id, start, end);

          const startISO = new Date(start.getFullYear(), start.getMonth(), start.getDate()).toISOString();
          const endISO = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59).toISOString();

          context.boardService.updateCard(task.id, {
            startDate: startISO,
            dueDate: endISO
          });
          void context.saveBoard();
          new Notice('Dates updated successfully', 1500);
        },

        on_progress_change: (task: GanttTask, progress: number) => {
          console.debug('Progress changed:', task.id, progress);

          const card = context.boardService.getCard(task.id);
          if (card && card.checklist.length > 0) {
            const itemsToComplete = Math.round((progress / 100) * card.checklist.length);
            card.checklist.forEach((item, idx) => {
              context.boardService.updateChecklistItem(card.id, item.id, {
                completed: idx < itemsToComplete
              });
            });
            void context.saveBoard();
            new Notice('Progress updated successfully', 1500);
          }
        },

        on_view_change: (mode: string) => {
          console.debug('View mode changed:', mode);
          this.currentViewMode = mode;
        }
      });

      console.debug('Gantt initialized successfully with', tasks.length, 'tasks');

      this.setupPopupVisibility();

    } catch (error) {
      console.error('Frappe Gantt initialization error:', error);
      ganttContainer.empty();
      const errorMsg = ganttContainer.createDiv({ cls: 'gantt-error' });
      errorMsg.createEl('h3', { text: '⚠️ Error loading Gantt chart' });
      errorMsg.createEl('p', { text: 'Using fallback view...' });
      setTimeout(() => this.renderFallback(container, cards, context), 100);
    }
  }

  private getCustomClass(card: KanbanCard): string {
    if (card.blocked) return 'bar-blocked';
    if (card.completedAt) return 'bar-completed';

    if (card.priority === 'critical') return 'bar-critical';
    if (card.priority === 'high') return 'bar-high';
    if (card.priority === 'medium') return 'bar-medium';
    if (card.priority === 'low') return 'bar-low';

    if (card.assignee && card.assignee.length > 0) {
      const assigneeName = card.assignee[0].toLowerCase();
      const hash = Array.from(assigneeName).reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const colorIndex = hash % 6;
      return `bar-assignee-${colorIndex}`;
    }

    if (card.taskType === 'bug') return 'bar-bug';
    if (card.taskType === 'feature') return 'bar-feature';
    if (card.taskType === 'epic') return 'bar-epic';

    return 'bar-default';
  }

  private renderToolbar(context: ViewRendererContext): HTMLElement {
    const toolbar = createElement('div', { className: 'gantt-toolbar' });

    const leftSection = toolbar.createDiv({ cls: 'toolbar-left' });
    leftSection.createEl('h3', { text: 'Gantt chart', cls: 'gantt-title' });

    const rightSection = toolbar.createDiv({ cls: 'toolbar-right' });

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

            viewModeContainer.querySelectorAll('.view-mode-btn').forEach(b => b.removeClass('active'));
            btn.addClass('active');
          } catch (error) {
            console.error('Error changing view mode:', error);
            new Notice('Failed to change view mode', 2000);
          }
        }
      });
    });

    const todayBtn = rightSection.createEl('button', {
      text: 'Today',
      cls: 'gantt-today-btn'
    });

    todayBtn.addEventListener('click', () => {
      if (this.ganttInstance && this.ganttWrapper) {
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
    warning.createEl('strong', { text: '⚠️ frappe gantt not available' });
    warning.createEl('br');
    warning.appendText('Install it with: ');
    warning.createEl('code', { text: 'npm install frappe-gantt' });

    const list = fallbackContainer.createDiv({ cls: 'gantt-simple-list' });
    cards.forEach(card => {
      const item = list.createDiv({ cls: 'gantt-list-item' });

      const title = item.createDiv({ cls: 'item-title' });
      title.textContent = card.title;
      title.addEventListener('click', () => context.onCardClick(card.id));

      const dates = item.createDiv({ cls: 'item-dates' });
      const start = card.startDate || card.dueDate;
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
    emptyState.appendChild(createElement('p', {}, ['Add start and due dates to cards to see them in gantt view.']));

    const createBtn = createElement('button', { className: 'primary-btn' }, ['Create task']);
    createBtn.addEventListener('click', () => {
      const board = context.boardService.getBoard();
      if (board.columns.length > 0) {
        new QuickAddCardModal(
          context.app,
          (title: string, startDate?: string, dueDate?: string): void => {
            context.boardService.addCard(board.columns[0].id, {
              title,
              startDate: startDate ?? new Date().toISOString(),
              dueDate: dueDate ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            });
            context.render();
            void context.saveBoard();
          }
        ).open();
      }
    });
    emptyState.appendChild(createBtn);

    return emptyState;
  }

  private renderError(container: HTMLElement, message: string, context: ViewRendererContext): void {
    const errorDiv = container.createDiv({ cls: 'view-error' });
    setIcon(errorDiv.createDiv({ cls: 'error-icon' }), 'alert-triangle');
    errorDiv.createEl('h3', { text: '⚠️ gantt error' });
    errorDiv.createEl('p', { text: message });

    const backBtn = errorDiv.createEl('button', { text: 'Back to board', cls: 'primary-btn' });
    backBtn.addEventListener('click', () => context.render());
  }

  private setupPopupVisibility(): void {
    if (!this.ganttWrapper) return;

    const checkPopup = () => {
      const popupWrapper = this.ganttWrapper?.querySelector('.popup-wrapper') as HTMLElement;
      if (popupWrapper) {
        popupWrapper.classList.remove('is-visible');

        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
              const style = popupWrapper.getAttribute('style') || '';
              if (style.includes('opacity: 1') || style.includes('opacity:1')) {
                popupWrapper.classList.add('is-visible');
              } else if (style.includes('opacity: 0') || style.includes('opacity:0')) {
                popupWrapper.classList.remove('is-visible');
              }
            }
          }
        });

        observer.observe(popupWrapper, {
          attributes: true,
          attributeFilter: ['style']
        });

        document.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;
          const isClickOnBar = target.closest('.bar-wrapper') || target.closest('.bar');
          const isClickOnPopup = target.closest('.popup-wrapper');

          if (!isClickOnBar && !isClickOnPopup && popupWrapper.classList.contains('is-visible')) {
            popupWrapper.classList.remove('is-visible');
          }
        });
      } else {
        setTimeout(checkPopup, 100);
      }
    };

    setTimeout(checkPopup, 200);
  }

  cleanup(): void {
    if (this.ganttInstance) {
      this.ganttInstance = null;
    }
    this.containerElement = null;
    this.ganttWrapper = null;
  }

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
