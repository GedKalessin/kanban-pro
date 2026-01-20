import { setIcon } from 'obsidian';
import { KanbanCard } from '../../models/types';
import { IViewRenderer, ViewRendererContext } from './IViewRenderer';
import Gantt from 'frappe-gantt';

export class GanttViewRenderer implements IViewRenderer {
  private ganttInstance: any = null;

  render(container: HTMLElement, context: ViewRendererContext): void {
    try {
      container.addClass('kanban-gantt-view');

      const filteredCards = context.boardService.getFilteredCards()
        .filter(c => c.dueDate || (c as any).startDate);

      if (filteredCards.length === 0) {
        this.renderEmptyState(container);
        return;
      }

      // Prepara i task per Frappe Gantt
      const tasks = filteredCards.map(card => {
        const start = (card as any).startDate
          ? new Date((card as any).startDate)
          : card.dueDate
            ? new Date(card.dueDate)
            : new Date();

        const end = card.dueDate ? new Date(card.dueDate) : new Date(start.getTime() + 86400000);

        return {
          id: card.id,
          name: card.title,
          start: start.toISOString().split('T')[0],
          end: end.toISOString().split('T')[0],
          progress: card.checklist.length > 0
            ? (card.checklist.filter(i => i.completed).length / card.checklist.length) * 100
            : 0,
          custom_class: card.blocked ? 'bar-blocked' : ''
        };
      });

      // Container per il gantt
      const ganttContainer = container.createDiv({ cls: 'gantt-container' });
      const svg = ganttContainer.createDiv({ cls: 'gantt-chart' });

      // Inizializza Frappe Gantt
      this.ganttInstance = new Gantt(svg, tasks, {
        view_mode: 'Week',
        on_click: (task: any) => {
          context.onCardClick(task.id);
        },
        on_date_change: (task: any, start: Date, end: Date) => {
          context.boardService.updateCard(task.id, {
            startDate: start.toISOString(),
            dueDate: end.toISOString()
          });
          context.saveBoard();
        }
      });
    } catch (error) {
      console.error('Gantt View Error:', error);
      this.renderError(container, 'Failed to render Gantt view');
    }
  }

  private renderEmptyState(container: HTMLElement): void {
    const emptyState = container.createDiv({ cls: 'empty-state' });
    emptyState.createEl('h3', { text: 'No tasks with dates' });
    emptyState.createEl('p', { text: 'Add dates to cards to see them in Gantt view.' });
  }

  private renderError(container: HTMLElement, message: string): void {
    container.empty();
    const errorDiv = container.createDiv({ cls: 'view-error' });

    const errorIcon = errorDiv.createDiv({ cls: 'error-icon' });
    setIcon(errorIcon, 'alert-triangle');

    errorDiv.createEl('h3', { text: '⚠️ View Error' });
    errorDiv.createEl('p', { text: message });

    const retryBtn = errorDiv.createEl('button', {
      text: 'Try Again',
      cls: 'retry-btn'
    });
    retryBtn.addEventListener('click', () => {
      container.empty();
      // Re-render will be triggered by parent
    });
  }

  cleanup(): void {
    if (this.ganttInstance) {
      this.ganttInstance = null;
    }
  }
}