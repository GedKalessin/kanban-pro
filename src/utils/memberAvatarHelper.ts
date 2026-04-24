import { App } from 'obsidian';
import { BoardService } from '../services/BoardService';
import { MemberDetailModal } from '../modals/TeamModal';
import { setCssProps } from './helpers';

/**
 * Creates an avatar HTMLElement for a team member.
 * - Applies the member's custom color (if defined in the team).
 * - Clicking the avatar opens MemberDetailModal.
 */
export function createMemberAvatar(
  memberName: string,
  cssClass: string,
  boardService: BoardService,
  app: App,
  onUpdate: () => void
): HTMLElement {
  const members = boardService.getTeamMembers();
  const member = members.find(m => m.name === memberName);

  const avatar = activeDocument.createElement('div');
  avatar.className = cssClass;
  avatar.textContent = memberName.charAt(0).toUpperCase();
  avatar.title = memberName;

  if (member?.color) {
    setCssProps(avatar, { '--kp-color': member.color });
  }

  if (member) {
    avatar.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      new MemberDetailModal(app, member, boardService, onUpdate).open();
    });
  }

  return avatar;
}
