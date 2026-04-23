import { App, Modal, Setting } from 'obsidian';
import { BoardService } from '../services/BoardService';
import { PRIORITY_COLORS } from '../models/types';
import { setCssProps } from '../utils/helpers';

export class AnalyticsModal extends Modal {
  private boardService: BoardService;

  constructor(app: App, boardService: BoardService) {
    super(app);
    this.boardService = boardService;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kanban-analytics-modal');

    contentEl.createEl('h2', { text: '📊 Board Analytics' });

    const analytics = this.boardService.getAnalytics();

    // Summary Cards
    const summaryGrid = contentEl.createDiv({ cls: 'analytics-summary-grid' });

    this.createSummaryCard(summaryGrid, 'Total Cards', analytics.total.toString(), '#6366f1');
    this.createSummaryCard(summaryGrid, 'Completed', analytics.completed.toString(), '#10b981');
    this.createSummaryCard(summaryGrid, 'In Progress', analytics.inProgress.toString(), '#3b82f6');
    this.createSummaryCard(summaryGrid, 'Blocked', analytics.blocked.toString(), '#ef4444');
    this.createSummaryCard(summaryGrid, 'Overdue', analytics.overdue.toString(), '#f97316');
    this.createSummaryCard(
      summaryGrid,
      'Completion Rate',
      `${Math.round(analytics.completionRate)}%`,
      '#8b5cf6'
    );

    // Priority Distribution
    new Setting(contentEl).setHeading().setName('Priority distribution');
    const prioritySection = contentEl.createDiv({ cls: 'analytics-chart' });

    Object.entries(analytics.byPriority).forEach(([priority, count]) => {
      if (count > 0) {
        const bar = prioritySection.createDiv({ cls: 'priority-bar' });
        const label = bar.createSpan({ cls: 'bar-label' });
        label.textContent = `${priority.charAt(0).toUpperCase() + priority.slice(1)}: ${count}`;

        const barFill = bar.createDiv({ cls: 'bar-fill' });
        const percentage = (count / analytics.total) * 100;
        setCssProps(barFill, {
          '--kp-width': `${percentage}%`,
          '--kp-color': PRIORITY_COLORS[priority as keyof typeof PRIORITY_COLORS]
        });
      }
    });

    // Column Distribution
    new Setting(contentEl).setHeading().setName('Cards by status');
    const columnSection = contentEl.createDiv({ cls: 'analytics-chart' });

    analytics.byColumn.forEach(col => {
      if (col.count > 0) {
        const bar = columnSection.createDiv({ cls: 'column-bar' });
        const label = bar.createSpan({ cls: 'bar-label' });
        label.textContent = `${col.name}: ${col.count}`;

        const barFill = bar.createDiv({ cls: 'bar-fill' });
        const percentage = (col.count / analytics.total) * 100;
        setCssProps(barFill, { '--kp-width': `${percentage}%`, '--kp-color': '#3b82f6' });
      }
    });

    // Close Button
    const closeBtn = contentEl.createEl('button', { text: 'Close', cls: 'primary-btn full-width-btn' });
    closeBtn.addEventListener('click', () => this.close());
  }

  private createSummaryCard(container: HTMLElement, label: string, value: string, color: string): void {
    const card = container.createDiv({ cls: 'summary-card' });
    setCssProps(card, { '--kp-color': color });

    const valueEl = card.createDiv({ cls: 'summary-value' });
    valueEl.textContent = value;
    setCssProps(valueEl, { '--kp-color': color });

    const labelEl = card.createDiv({ cls: 'summary-label' });
    labelEl.textContent = label;
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
