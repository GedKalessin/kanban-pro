import { App } from 'obsidian';
import { BoardService } from '../../services/BoardService';
import type KanbanProPlugin from '../../main';

export interface ViewRendererContext {
  app: App;
  plugin: KanbanProPlugin;
  boardService: BoardService;
  onCardClick: (cardId: string) => void;
  onColumnUpdate: (columnId: string) => void;
  onCardUpdate: (cardId: string) => void;
  saveBoard: () => void;
  render: () => void;
}

export interface IViewRenderer {
  render(container: HTMLElement, context: ViewRendererContext): void;
  cleanup?(): void;
}
