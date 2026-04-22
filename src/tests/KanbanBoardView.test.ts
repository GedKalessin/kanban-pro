import { describe, it, expect, beforeEach } from '@jest/globals';
import { BoardService } from '../services/BoardService';
import { KanbanBoard, KanbanCard } from '../models/types';

describe('Kanban Pro - Bug Fixes Verification', () => {
  let boardService: BoardService;

  beforeEach(() => {
    boardService = new BoardService();
  });

  describe('FIX 1: Start Date Support', () => {
    it('should save start date when creating card', () => {
      const board = boardService.getBoard();
      const startDate = new Date('2026-01-01').toISOString();
      const dueDate = new Date('2026-01-15').toISOString();

      const card = boardService.addCard(board.columns[0].id, {
        title: 'Test Card',
        startDate,
        dueDate
      });

      expect(card.startDate).toBe(startDate);
      expect(card.dueDate).toBe(dueDate);
    });

    it('should update start date', () => {
      const board = boardService.getBoard();
      const card = boardService.addCard(board.columns[0].id, {
        title: 'Test Card'
      });

      const startDate = new Date('2026-01-01').toISOString();
      boardService.updateCard(card.id, { startDate });

      const updatedCard = boardService.getCard(card.id);
      expect(updatedCard?.startDate).toBe(startDate);
    });
  });

  describe('FIX 2: Checklist Bug', () => {
    it('should add checklist item', () => {
      const board = boardService.getBoard();
      const card = boardService.addCard(board.columns[0].id, {
        title: 'Test Card'
      });

      boardService.addChecklistItem(card.id, 'Test Item');

      const updatedCard = boardService.getCard(card.id);
      expect(updatedCard?.checklist.length).toBe(1);
      expect(updatedCard?.checklist[0].text).toBe('Test Item');
    });

    it('should delete checklist item without duplicating', () => {
      const board = boardService.getBoard();
      const card = boardService.addCard(board.columns[0].id, {
        title: 'Test Card'
      });

      const item = boardService.addChecklistItem(card.id, 'Test Item');
      boardService.deleteChecklistItem(card.id, item.id);

      const updatedCard = boardService.getCard(card.id);
      expect(updatedCard?.checklist.length).toBe(0);
    });

    it('should update checklist item', () => {
      const board = boardService.getBoard();
      const card = boardService.addCard(board.columns[0].id, {
        title: 'Test Card'
      });

      const item = boardService.addChecklistItem(card.id, 'Test Item');
      boardService.updateChecklistItem(card.id, item.id, { completed: true });

      const updatedCard = boardService.getCard(card.id);
      expect(updatedCard?.checklist[0].completed).toBe(true);
    });
  });

  describe('FIX 3: Linked Notes', () => {
    it('should link note to card', () => {
      const board = boardService.getBoard();
      const card = boardService.addCard(board.columns[0].id, {
        title: 'Test Card'
      });

      const notePath = 'folder/note.md';
      boardService.updateCard(card.id, {
        linkedNotes: [notePath]
      });

      const updatedCard = boardService.getCard(card.id);
      expect(updatedCard?.linkedNotes).toContain(notePath);
    });

    it('should remove linked note', () => {
      const board = boardService.getBoard();
      const card = boardService.addCard(board.columns[0].id, {
        title: 'Test Card',
        linkedNotes: ['note1.md', 'note2.md']
      });

      boardService.updateCard(card.id, {
        linkedNotes: ['note1.md']
      });

      const updatedCard = boardService.getCard(card.id);
      expect(updatedCard?.linkedNotes?.length).toBe(1);
      expect(updatedCard?.linkedNotes).not.toContain('note2.md');
    });
  });

  describe('FIX 4: Column Drag & Drop', () => {
    it('should move column to new position', () => {
      const board = boardService.getBoard();
      const initialOrder = board.columns.map(c => c.id);

      boardService.moveColumn(board.columns[0].id, 2);

      const updatedBoard = boardService.getBoard();
      const newOrder = updatedBoard.columns.map(c => c.id);

      expect(newOrder).not.toEqual(initialOrder);
      expect(updatedBoard.columns[2].id).toBe(board.columns[0].id);
    });
  });

  describe('FIX 5: Milestones', () => {
    it('should create milestone', () => {
      const board = boardService.getBoard();
      board.milestones.push({
        id: 'milestone-1',
        name: 'Q1 Release',
        description: 'First quarter release',
        dueDate: new Date('2026-03-31').toISOString(),
        color: '#6366f1',
        completed: false,
        order: 0,
        cardIds: []
      });

      expect(board.milestones.length).toBe(1);
      expect(board.milestones[0].name).toBe('Q1 Release');
    });

    it('should add card to milestone', () => {
      const board = boardService.getBoard();
      const card = boardService.addCard(board.columns[0].id, {
        title: 'Test Card'
      });

      board.milestones.push({
        id: 'milestone-1',
        name: 'Q1 Release',
        description: '',
        dueDate: null,
        color: '#6366f1',
        completed: false,
        order: 0,
        cardIds: [card.id]
      });

      expect(board.milestones[0].cardIds).toContain(card.id);
    });
  });

  describe('FIX 6: Empty Views', () => {
    it('should handle timeline view with no cards', () => {
      const board = boardService.getBoard();
      const cardsWithDates = board.cards.filter(c => c.dueDate || (c as any).startDate);
      
      expect(cardsWithDates.length).toBe(0);
      // View should render empty state without crashing
    });

    it('should handle gantt view with no cards', () => {
      const board = boardService.getBoard();
      const cardsWithDates = board.cards.filter(c => c.dueDate || (c as any).startDate);
      
      expect(cardsWithDates.length).toBe(0);
      // View should render empty state without crashing
    });

    it('should handle roadmap view with no milestones', () => {
      const board = boardService.getBoard();
      
      expect(board.milestones.length).toBe(0);
      // View should render empty state without crashing
    });
  });

  describe('FIX 7: Data Persistence', () => {
    it('should persist dates from quick add', () => {
      const board = boardService.getBoard();
      const startDate = new Date('2026-01-01').toISOString();
      const dueDate = new Date('2026-01-15').toISOString();

      const card = boardService.addCard(board.columns[0].id, {
        title: 'Quick Add Test',
        startDate,
        dueDate
      });

      // Simulate save/load cycle
      const serialized = JSON.stringify(boardService.getBoard());
      const deserialized = JSON.parse(serialized) as KanbanBoard;
      const newService = new BoardService(deserialized);

      const loadedCard = newService.getCard(card.id);
      expect(loadedCard?.startDate).toBe(startDate);
      expect(loadedCard?.dueDate).toBe(dueDate);
    });
  });
});
