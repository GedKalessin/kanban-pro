import {
  KanbanBoard,
  KanbanCard,
  KanbanColumn,
  SwimLane,
  ChecklistItem,
  BoardFilters,
  Priority,
  TaskType,
  CardDisplayOptions,
  BoardSettings,
  Milestone,
  BoardUpdate,
  ColumnUpdate,
  CardUpdate,
  SwimLaneUpdate,
  BOARD_TEMPLATES,
  StatusGroup,
  StatusCategory,
  BoardTemplate
} from '../models/types';
import { generateId } from '../utils/helpers';

// ============================================
// BOARD SERVICE - Modern State Management
// ============================================

export class BoardService {
  private board: KanbanBoard;
  private history: KanbanBoard[] = [];
  private historyIndex: number = -1;
  private maxHistorySize: number = 50;

  constructor(board?: KanbanBoard) {
    this.board = board || this.createDefaultBoard();
    this.saveToHistory();
  }

  // ==================== BOARD OPERATIONS ====================

  getBoard(): KanbanBoard {
    return this.board;
  }

  updateBoard(updates: BoardUpdate): void {
    Object.assign(this.board, updates);
    this.board.updatedAt = new Date().toISOString();
    this.saveToHistory();
  }

  createDefaultBoard(): KanbanBoard {
    const now = new Date().toISOString();
    return {
      id: generateId(),
      name: 'New Board',
      description: '',
      createdAt: now,
      updatedAt: now,
      columns: [
        {
          id: generateId(),
          name: 'To Do',
          color: '#94a3b8',
          order: 0,
          collapsed: false,
          wipLimit: null
        },
        {
          id: generateId(),
          name: 'In Progress',
          color: '#3b82f6',
          order: 1,
          collapsed: false,
          wipLimit: null
        },
        {
          id: generateId(),
          name: 'Done',
          color: '#10b981',
          order: 2,
          collapsed: false,
          wipLimit: null
        }
      ],
      cards: [],
      swimLanes: [],
      filters: {
        searchQuery: '',
        assignees: [],
        priorities: [],
        tags: [],
        showCompleted: true,
        showBlocked: true
      },
      settings: this.getDefaultSettings(),
      milestones: [],
      automations: [],
      tags: [],
      members: []
    };
  }

  createBoardFromTemplate(templateId: string, name: string): KanbanBoard {
    const template = BOARD_TEMPLATES.find(t => t.id === templateId);
    if (!template) return this.createDefaultBoard();

    const now = new Date().toISOString();
    const board: KanbanBoard = {
      id: generateId(),
      name,
      description: template.description,
      createdAt: now,
      updatedAt: now,
      columns: template.columns.map((col, index) => ({
        ...col,
        id: generateId(),
        order: index
      })),
      cards: [],
      swimLanes: [],
      filters: {
        searchQuery: '',
        assignees: [],
        priorities: [],
        tags: [],
        showCompleted: true,
        showBlocked: true
      },
      settings: { ...this.getDefaultSettings(), ...template.settings },
      milestones: [],
      automations: [],
      tags: [],
      members: []
    };

    return board;
  }

  private getDefaultSettings(): BoardSettings {
    return {
      defaultView: 'board',
      enableWipLimits: false,
      enableSwimLanes: false,
      enableTimeTracking: false,
      enableAutomations: false,
      cardDisplayOptions: {
        showAssignee: true,
        showDueDate: true,
        showTags: true,
        showPriority: true,
        showChecklist: true,
        showDescription: false,
        showEstimate: false,
        compactMode: false
      },
      autoArchiveCompleted: false,
      autoArchiveDays: 30,
      showCardNumbers: false,
      enableSubtasks: false
    };
  }

  // ==================== COLUMN OPERATIONS ====================

  getColumn(columnId: string): KanbanColumn | undefined {
    return this.board.columns.find(c => c.id === columnId);
  }

  getColumnCards(columnId: string): KanbanCard[] {
    return this.board.cards.filter(c => c.columnId === columnId);
  }

  addColumn(name: string): KanbanColumn {
    const newColumn: KanbanColumn = {
      id: generateId(),
      name,
      color: this.generateColumnColor(),
      order: this.board.columns.length,
      collapsed: false,
      wipLimit: null
    };
    this.board.columns.push(newColumn);
    this.board.updatedAt = new Date().toISOString();
    this.saveToHistory();
    return newColumn;
  }

  updateColumn(columnId: string, updates: ColumnUpdate): void {
    const index = this.board.columns.findIndex(c => c.id === columnId);
    if (index !== -1) {
      this.board.columns[index] = { ...this.board.columns[index], ...updates };
      this.board.updatedAt = new Date().toISOString();
      this.saveToHistory();
    }
  }

  deleteColumn(columnId: string): void {
    this.board.columns = this.board.columns.filter(c => c.id !== columnId);
    this.board.cards = this.board.cards.filter(c => c.columnId !== columnId);
    this.reorderColumns();
    this.board.updatedAt = new Date().toISOString();
    this.saveToHistory();
  }

  moveColumn(columnId: string, newOrder: number): void {
    const column = this.board.columns.find(c => c.id === columnId);
    if (!column) return;

    const oldOrder = column.order;
    if (oldOrder === newOrder) return;

    this.board.columns.forEach(col => {
      if (col.id === columnId) {
        col.order = newOrder;
      } else if (oldOrder < newOrder) {
        if (col.order > oldOrder && col.order <= newOrder) {
          col.order--;
        }
      } else {
        if (col.order >= newOrder && col.order < oldOrder) {
          col.order++;
        }
      }
    });

    this.board.updatedAt = new Date().toISOString();
    this.saveToHistory();
  }

  private reorderColumns(): void {
    this.board.columns.sort((a, b) => a.order - b.order);
    this.board.columns.forEach((col, index) => {
      col.order = index;
    });
  }

  isWipLimitExceeded(columnId: string): boolean {
    const column = this.getColumn(columnId);
    if (!column || !column.wipLimit || !this.board.settings.enableWipLimits) {
      return false;
    }
    const cardCount = this.getColumnCards(columnId).length;
    return cardCount > column.wipLimit;
  }

  private generateColumnColor(): string {
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'];
    return colors[this.board.columns.length % colors.length];
  }

  // ==================== CARD OPERATIONS ====================

  getCard(cardId: string): KanbanCard | undefined {
    return this.board.cards.find(c => c.id === cardId);
  }

  addCard(columnId: string, cardData: Partial<KanbanCard>): KanbanCard {
    const column = this.getColumn(columnId);
    if (!column) throw new Error('Column not found');

    const now = new Date().toISOString();
    const columnCards = this.getColumnCards(columnId);
    
    const newCard: KanbanCard = {
      id: generateId(),
      title: cardData.title || 'New Card',
      description: cardData.description || '',
      columnId,
      swimLaneId: cardData.swimLaneId,
      order: columnCards.length,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      dueDate: cardData.dueDate || null,
      startDate: cardData.startDate || null,
      assignee: cardData.assignee || [],
      tags: cardData.tags || [],
      priority: cardData.priority || 'none',
      taskType: cardData.taskType || 'task',
      color: cardData.color || null,
      blocked: cardData.blocked || false,
      checklist: cardData.checklist || [],
      linkedNote: cardData.linkedNote,
      estimatedHours: cardData.estimatedHours,
      timeTracked: cardData.timeTracked || 0,
      customFields: cardData.customFields || {}
    };

    this.board.cards.push(newCard);
    this.board.updatedAt = new Date().toISOString();
    this.saveToHistory();
    return newCard;
  }

  updateCard(cardId: string, updates: CardUpdate): void {
    const index = this.board.cards.findIndex(c => c.id === cardId);
    if (index !== -1) {
      const { assignee, tags, checklist, ...restUpdates } = updates;
      const sanitizedUpdates: Partial<KanbanCard> = {
        ...restUpdates,
        ...(assignee && { assignee: assignee.filter((a): a is string => a !== undefined) }),
        ...(tags && { tags: tags.filter((t): t is string => t !== undefined) }),
        ...(checklist && { checklist: checklist.filter((item): item is ChecklistItem => item !== undefined) })
      };
      this.board.cards[index] = { 
        ...this.board.cards[index], 
        ...sanitizedUpdates,
        updatedAt: new Date().toISOString()
      };
      this.board.updatedAt = new Date().toISOString();
      this.saveToHistory();
    }
  }

  deleteCard(cardId: string): void {
    const card = this.getCard(cardId);
    if (!card) return;

    this.board.cards = this.board.cards.filter(c => c.id !== cardId);
    this.reorderCardsInColumn(card.columnId);
    this.board.updatedAt = new Date().toISOString();
    this.saveToHistory();
  }

  duplicateCard(cardId: string): KanbanCard | null {
    const card = this.getCard(cardId);
    if (!card) return null;

    const newCard = this.addCard(card.columnId, {
      ...card,
      title: `${card.title} (Copy)`,
      createdAt: undefined,
      updatedAt: undefined,
      completedAt: null
    });

    return newCard;
  }

  moveCard(cardId: string, toColumnId: string, newOrder: number, swimLaneId?: string): void {
    const card = this.getCard(cardId);
    if (!card) return;

    const fromColumnId = card.columnId;
    const fromSwimLaneId = card.swimLaneId;

    card.columnId = toColumnId;
    card.order = newOrder;
    card.swimLaneId = swimLaneId;
    card.updatedAt = new Date().toISOString();

    if (fromColumnId !== toColumnId) {
      this.reorderCardsInColumn(fromColumnId);
    }
    if (fromSwimLaneId !== swimLaneId) {
      this.reorderCardsInColumn(toColumnId);
    }

    this.board.updatedAt = new Date().toISOString();
    this.saveToHistory();
  }

  private reorderCardsInColumn(columnId: string): void {
    const columnCards = this.getColumnCards(columnId).sort((a, b) => a.order - b.order);
    columnCards.forEach((card, index) => {
      card.order = index;
    });
  }

  // ==================== CHECKLIST OPERATIONS ====================

  addChecklistItem(cardId: string, text: string): ChecklistItem {
    const card = this.getCard(cardId);
    if (!card) throw new Error('Card not found');

    const item: ChecklistItem = {
      id: generateId(),
      text,
      completed: false,
      createdAt: new Date().toISOString()
    };

    card.checklist.push(item);
    card.updatedAt = new Date().toISOString();
    this.board.updatedAt = new Date().toISOString();
    this.saveToHistory();
    return item;
  }

  updateChecklistItem(cardId: string, itemId: string, updates: Partial<ChecklistItem>): void {
    const card = this.getCard(cardId);
    if (!card) return;

    const item = card.checklist.find(i => i.id === itemId);
    if (item) {
      Object.assign(item, updates);
      card.updatedAt = new Date().toISOString();
      this.board.updatedAt = new Date().toISOString();
      this.saveToHistory();
    }
  }

  deleteChecklistItem(cardId: string, itemId: string): void {
    const card = this.getCard(cardId);
    if (!card) return;

    card.checklist = card.checklist.filter(i => i.id !== itemId);
    card.updatedAt = new Date().toISOString();
    this.board.updatedAt = new Date().toISOString();
    this.saveToHistory();
  }

  // ==================== SWIM LANE OPERATIONS ====================

  addSwimLane(name: string): SwimLane {
    const newLane: SwimLane = {
      id: generateId(),
      name,
      color: this.generateColumnColor(),
      order: this.board.swimLanes.length,
      collapsed: false,
      assignee: null,
      tags: []
    };
    this.board.swimLanes.push(newLane);
    this.board.updatedAt = new Date().toISOString();
    this.saveToHistory();
    return newLane;
  }

  updateSwimLane(laneId: string, updates: SwimLaneUpdate): void {
    const index = this.board.swimLanes.findIndex(l => l.id === laneId);
    if (index !== -1) {
      const { tags, ...restUpdates } = updates;
      const sanitizedUpdates: Partial<SwimLane> = {
        ...restUpdates,
        ...(tags && { tags: tags.filter((t): t is string => t !== undefined) })
      };
      this.board.swimLanes[index] = { ...this.board.swimLanes[index], ...sanitizedUpdates };
      this.board.updatedAt = new Date().toISOString();
      this.saveToHistory();
    }
  }

  deleteSwimLane(laneId: string): void {
    this.board.swimLanes = this.board.swimLanes.filter(l => l.id !== laneId);
    this.board.cards.forEach(card => {
      if (card.swimLaneId === laneId) {
        card.swimLaneId = undefined;
      }
    });
    this.board.updatedAt = new Date().toISOString();
    this.saveToHistory();
  }

  // ==================== FILTER OPERATIONS ====================

  setFilters(filters: Partial<BoardFilters>): void {
    this.board.filters = { ...this.board.filters, ...filters };
  }

  clearFilters(): void {
    this.board.filters = {
      searchQuery: '',
      assignees: [],
      priorities: [],
      tags: [],
      showCompleted: true,
      showBlocked: true
    };
  }

  getFilteredCards(): KanbanCard[] {
    let filtered = [...this.board.cards];
    const filters = this.board.filters;

    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      filtered = filtered.filter(card =>
        card.title.toLowerCase().includes(query) ||
        card.description.toLowerCase().includes(query) ||
        card.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    if (filters.assignees.length > 0) {
      filtered = filtered.filter(card =>
        card.assignee.some(a => filters.assignees.includes(a))
      );
    }

    if (filters.priorities.length > 0) {
      filtered = filtered.filter(card => filters.priorities.includes(card.priority));
    }

    if (filters.tags.length > 0) {
      filtered = filtered.filter(card =>
        card.tags.some(tag => filters.tags.includes(tag))
      );
    }

    if (!filters.showCompleted) {
      filtered = filtered.filter(card => !card.completedAt);
    }

    if (!filters.showBlocked) {
      filtered = filtered.filter(card => !card.blocked);
    }

    return filtered;
  }

  // ==================== HISTORY (UNDO/REDO) ====================

  private saveToHistory(): void {
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    this.history.push(JSON.parse(JSON.stringify(this.board)));

    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    } else {
      this.historyIndex++;
    }
  }

  canUndo(): boolean {
    return this.historyIndex > 0;
  }

  canRedo(): boolean {
    return this.historyIndex < this.history.length - 1;
  }

  undo(): boolean {
    if (!this.canUndo()) return false;
    this.historyIndex--;
    this.board = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
    return true;
  }

  redo(): boolean {
    if (!this.canRedo()) return false;
    this.historyIndex++;
    this.board = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
    return true;
  }

  // ==================== ANALYTICS ====================

  getAnalytics() {
    const cards = this.board.cards;
    const completed = cards.filter(c => c.completedAt).length;
    const blocked = cards.filter(c => c.blocked).length;
    const overdue = cards.filter(c => c.dueDate && new Date(c.dueDate) < new Date() && !c.completedAt).length;

    const byPriority = {
      none: cards.filter(c => c.priority === 'none').length,
      low: cards.filter(c => c.priority === 'low').length,
      medium: cards.filter(c => c.priority === 'medium').length,
      high: cards.filter(c => c.priority === 'high').length,
      critical: cards.filter(c => c.priority === 'critical').length
    };

    const byColumn = this.board.columns.map(col => ({
      name: col.name,
      count: this.getColumnCards(col.id).length
    }));

    return {
      total: cards.length,
      completed,
      blocked,
      overdue,
      inProgress: cards.length - completed,
      byPriority,
      byColumn,
      completionRate: cards.length > 0 ? (completed / cards.length) * 100 : 0
    };
  }

  // ==================== STATUS GROUPS OPERATIONS ====================

  getStatusGroups(): StatusGroup[] {
    if (!this.board.statusGroups) {
      this.board.statusGroups = this.getDefaultStatusGroups();
    }
    return this.board.statusGroups;
  }

  private getDefaultStatusGroups(): StatusGroup[] {
    const groups: StatusGroup[] = [
      {
        category: 'not-started',
        name: 'Not Started',
        description: 'Tasks that haven\'t been started yet',
        columnIds: [],
        color: '#94a3b8'
      },
      {
        category: 'active',
        name: 'Active',
        description: 'Tasks currently in progress',
        columnIds: [],
        color: '#3b82f6'
      },
      {
        category: 'closed',
        name: 'Closed',
        description: 'Completed or cancelled tasks',
        columnIds: [],
        color: '#10b981'
      }
    ];

    // Auto-assign columns based on name
    this.board.columns.forEach(column => {
      const nameLower = column.name.toLowerCase();
      if (nameLower.includes('todo') || nameLower.includes('to do') || nameLower.includes('backlog')) {
        groups[0].columnIds.push(column.id);
      } else if (nameLower.includes('done') || nameLower.includes('complete') || nameLower.includes('closed')) {
        groups[2].columnIds.push(column.id);
      } else {
        groups[1].columnIds.push(column.id);
      }
    });

    return groups;
  }

  updateStatusGroups(groups: StatusGroup[]): void {
    this.board.statusGroups = groups;
    this.board.updatedAt = new Date().toISOString();
    this.saveToHistory();
  }

  getColumnStatusCategory(columnId: string): StatusCategory | null {
    if (!this.board.statusGroups) return null;

    for (const group of this.board.statusGroups) {
      if (group.columnIds.includes(columnId)) {
        return group.category;
      }
    }
    return null;
  }

  // ==================== TEMPLATE OPERATIONS ====================

  saveAsTemplate(templateData: { name: string; description: string; icon: string }): BoardTemplate {
    if (!this.board.savedTemplates) {
      this.board.savedTemplates = [];
    }

    const template: BoardTemplate = {
      id: generateId(),
      name: templateData.name,
      description: templateData.description,
      icon: templateData.icon,
      columns: this.board.columns.map(col => ({
        name: col.name,
        color: col.color,
        order: col.order,
        collapsed: false,
        wipLimit: col.wipLimit,
        definition: col.definition
      })),
      statusGroups: this.board.statusGroups ? JSON.parse(JSON.stringify(this.board.statusGroups)) : [],
      settings: this.board.settings
    };

    this.board.savedTemplates.push(template);
    this.board.updatedAt = new Date().toISOString();
    this.saveToHistory();

    return template;
  }

  deleteTemplate(templateId: string): void {
    if (!this.board.savedTemplates) return;

    this.board.savedTemplates = this.board.savedTemplates.filter(t => t.id !== templateId);
    this.board.updatedAt = new Date().toISOString();
    this.saveToHistory();
  }

  applyTemplate(templateId: string): void {
    if (!this.board.savedTemplates) return;

    const template = this.board.savedTemplates.find(t => t.id === templateId);
    if (!template) return;

    // Clear existing columns and create new ones from template
    this.board.columns = template.columns.map((col, index) => ({
      ...col,
      id: generateId(),
      order: index
    }));

    // Apply status groups with updated column IDs
    if (template.statusGroups) {
      const oldToNewIdMap = new Map<string, string>();
      template.columns.forEach((col, index) => {
        oldToNewIdMap.set(`col_${index}`, this.board.columns[index].id);
      });

      this.board.statusGroups = template.statusGroups.map(group => ({
        ...group,
        columnIds: group.columnIds.map((_oldId, idx) => this.board.columns[idx]?.id || _oldId)
      }));
    }

    // Move all cards to first column
    if (this.board.columns.length > 0) {
      this.board.cards.forEach(card => {
        card.columnId = this.board.columns[0].id;
      });
    }

    this.board.updatedAt = new Date().toISOString();
    this.saveToHistory();
  }
}
