// ============================================
// KANBAN PRO - TYPE DEFINITIONS
// ============================================

export type Priority = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type TaskType = 'task' | 'feature' | 'bug' | 'improvement' | 'story' | 'epic';
export type ViewType = 'board' | 'list' | 'timeline' | 'roadmap';

export const PRIORITY_COLORS: Record<Priority, string> = {
  none: '#94a3b8',
  low: '#3b82f6',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444'
};

export const TASK_TYPE_ICONS: Record<TaskType, string> = {
  task: '✓',
  feature: '✨',
  bug: '🐛',
  improvement: '⚡',
  story: '📖',
  epic: '🎯'
};

// ============================================
// CHECKLIST
// ============================================

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
}

// ============================================
// CARD
// ============================================

export interface KanbanCard {
  id: string;
  title: string;
  description: string;
  columnId: string;
  swimLaneId?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  dueDate: string | null;
  startDate?: string | null;
  assignee: string[];
  tags: string[];
  priority: Priority;
  taskType: TaskType;
  color: string | null;
  blocked: boolean;
  checklist: ChecklistItem[];
  linkedNote?: string; // Deprecato - mantieni per backward compatibility
  linkedNotes?: string[]; 
  estimatedHours?: number;
  timeTracked?: number;
  customFields?: Record<string, any>;
}


// ============================================
// COLUMN
// ============================================

export interface KanbanColumn {
  id: string;
  name: string;
  color: string;
  order: number;
  collapsed: boolean;
  wipLimit: number | null;
  definition?: string;
}


// ============================================
// SWIM LANE
// ============================================

export interface SwimLane {
  id: string;
  name: string;
  color: string;
  order: number;
  collapsed: boolean;
  assignee: string | null;
  tags: string[];
}

// ============================================
// FILTERS
// ============================================

export interface BoardFilters {
  searchQuery: string;
  assignees: string[];
  priorities: Priority[];
  tags: string[];
  showCompleted: boolean;
  showBlocked: boolean;
  dateRange?: {
    start: string | null;
    end: string | null;
  };
}

// ============================================
// CARD DISPLAY OPTIONS
// ============================================

export interface CardDisplayOptions {
  showAssignee: boolean;
  showDueDate: boolean;
  showTags: boolean;
  showPriority: boolean;
  showChecklist: boolean;
  showDescription: boolean;
  showEstimate: boolean;
  compactMode: boolean;
}

// ============================================
// BOARD SETTINGS
// ============================================

export interface BoardSettings {
  defaultView: ViewType;
  enableWipLimits: boolean;
  enableSwimLanes: boolean;
  enableTimeTracking: boolean;
  enableAutomations: boolean;
  cardDisplayOptions: CardDisplayOptions;
  autoArchiveCompleted: boolean;
  autoArchiveDays: number;
  showCardNumbers: boolean;
  enableSubtasks: boolean;
}

// ============================================
// AUTOMATION RULE
// ============================================

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: {
    type: 'card_moved' | 'card_created' | 'date_reached' | 'checklist_completed';
    conditions: Record<string, any>;
  };
  actions: {
    type: 'set_field' | 'notify' | 'create_card' | 'move_card';
    params: Record<string, any>;
  }[];
}

// ============================================
// MILESTONE (for Roadmap)
// ============================================

export interface Milestone {
  id: string;
  name: string;
  description: string;
  dueDate: string | null;
  color: string;
  completed: boolean;
  order: number;
  cardIds: string[];
}

// ============================================
// STATUS CATEGORIES
// ============================================

export type StatusCategory = 'not-started' | 'active' | 'closed';

export interface StatusGroup {
  category: StatusCategory;
  name: string;
  description: string;
  columnIds: string[];
  color: string;
}

// ============================================
// BOARD
// ============================================

export interface KanbanBoard {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  columns: KanbanColumn[];
  cards: KanbanCard[];
  swimLanes: SwimLane[];
  filters: BoardFilters;
  settings: BoardSettings;
  milestones: Milestone[];
  automations: AutomationRule[];
  tags: string[];
  members: string[];
  statusGroups?: StatusGroup[]; // New field
  savedTemplates?: BoardTemplate[]; // New field
}

// ============================================
// BOARD TEMPLATE
// ============================================

export interface BoardTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  columns: Omit<KanbanColumn, 'id'>[];
  statusGroups?: StatusGroup[];
  sampleCards?: Partial<KanbanCard>[];
  settings: Partial<BoardSettings>;
}

// ============================================
// PREDEFINED TEMPLATES
// ============================================

export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    id: 'basic',
    name: 'Basic Kanban',
    description: 'Simple three-column board',
    icon: '📋',
    columns: [
      { name: 'To Do', color: '#94a3b8', order: 0, collapsed: false, wipLimit: null },
      { name: 'In Progress', color: '#3b82f6', order: 1, collapsed: false, wipLimit: null },
      { name: 'Done', color: '#10b981', order: 2, collapsed: false, wipLimit: null }
    ],
    settings: {
      defaultView: 'board',
      enableWipLimits: false,
      enableSwimLanes: false
    }
  },
  {
    id: 'agile',
    name: 'Agile Sprint',
    description: 'Scrum-style sprint board',
    icon: '🏃',
    columns: [
      { name: 'Backlog', color: '#64748b', order: 0, collapsed: false, wipLimit: null },
      { name: 'To Do', color: '#94a3b8', order: 1, collapsed: false, wipLimit: 5 },
      { name: 'In Progress', color: '#3b82f6', order: 2, collapsed: false, wipLimit: 3 },
      { name: 'Review', color: '#f59e0b', order: 3, collapsed: false, wipLimit: 3 },
      { name: 'Done', color: '#10b981', order: 4, collapsed: false, wipLimit: null }
    ],
    settings: {
      defaultView: 'board',
      enableWipLimits: true,
      enableSwimLanes: true,
      enableTimeTracking: true
    }
  },
  {
    id: 'software',
    name: 'Software Development',
    description: 'Complete dev workflow',
    icon: '💻',
    columns: [
      { name: 'Backlog', color: '#64748b', order: 0, collapsed: false, wipLimit: null },
      { name: 'Design', color: '#8b5cf6', order: 1, collapsed: false, wipLimit: 3 },
      { name: 'Development', color: '#3b82f6', order: 2, collapsed: false, wipLimit: 5 },
      { name: 'Testing', color: '#f59e0b', order: 3, collapsed: false, wipLimit: 3 },
      { name: 'Deployment', color: '#ec4899', order: 4, collapsed: false, wipLimit: 2 },
      { name: 'Done', color: '#10b981', order: 5, collapsed: false, wipLimit: null }
    ],
    settings: {
      defaultView: 'board',
      enableWipLimits: true,
      enableSwimLanes: true,
      enableTimeTracking: true,
      showCardNumbers: true
    }
  },
  {
    id: 'personal',
    name: 'Personal Tasks',
    description: 'Manage your daily tasks',
    icon: '✅',
    columns: [
      { name: 'Inbox', color: '#94a3b8', order: 0, collapsed: false, wipLimit: null },
      { name: 'Today', color: '#ef4444', order: 1, collapsed: false, wipLimit: 5 },
      { name: 'This Week', color: '#f59e0b', order: 2, collapsed: false, wipLimit: null },
      { name: 'Completed', color: '#10b981', order: 3, collapsed: false, wipLimit: null }
    ],
    settings: {
      defaultView: 'list',
      enableWipLimits: false,
      enableSwimLanes: false,
      autoArchiveCompleted: true,
      autoArchiveDays: 7
    }
  },
  {
    id: 'project',
    name: 'Project Management',
    description: 'Track project phases',
    icon: '🎯',
    columns: [
      { name: 'Planning', color: '#8b5cf6', order: 0, collapsed: false, wipLimit: null },
      { name: 'In Progress', color: '#3b82f6', order: 1, collapsed: false, wipLimit: 5 },
      { name: 'On Hold', color: '#f59e0b', order: 2, collapsed: false, wipLimit: null },
      { name: 'Review', color: '#ec4899', order: 3, collapsed: false, wipLimit: 3 },
      { name: 'Completed', color: '#10b981', order: 4, collapsed: false, wipLimit: null }
    ],
    settings: {
      defaultView: 'roadmap',
      enableWipLimits: true,
      enableSwimLanes: true,
      enableTimeTracking: true
    }
  },
  {
    id: 'content',
    name: 'Content Pipeline',
    description: 'Manage content creation',
    icon: '📝',
    columns: [
      { name: 'Ideas', color: '#64748b', order: 0, collapsed: false, wipLimit: null },
      { name: 'Research', color: '#8b5cf6', order: 1, collapsed: false, wipLimit: 5 },
      { name: 'Writing', color: '#3b82f6', order: 2, collapsed: false, wipLimit: 3 },
      { name: 'Editing', color: '#f59e0b', order: 3, collapsed: false, wipLimit: 3 },
      { name: 'Published', color: '#10b981', order: 4, collapsed: false, wipLimit: null }
    ],
    settings: {
      defaultView: 'board',
      enableWipLimits: true,
      enableSwimLanes: false,
      autoArchiveCompleted: true
    }
  }
];

// ============================================
// UTILITY TYPES
// ============================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export interface BoardUpdate extends DeepPartial<KanbanBoard> {}
export interface ColumnUpdate extends DeepPartial<KanbanColumn> {}
export interface CardUpdate extends DeepPartial<KanbanCard> {}
export interface SwimLaneUpdate extends DeepPartial<SwimLane> {}
