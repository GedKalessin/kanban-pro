import { App, Modal, Setting, Notice, setIcon } from 'obsidian';
import { TeamMember } from '../models/types';
import { BoardService } from '../services/BoardService';
import { ConfirmModal } from './UtilityModals';
import { setCssProps } from '../utils/helpers';

// ============================================
// TEAM MODAL - Manage board team members
// ============================================

export class TeamModal extends Modal {
  private boardService: BoardService;
  private onUpdate: () => void;
  private listContainer: HTMLElement | null = null;

  constructor(app: App, boardService: BoardService, onUpdate: () => void) {
    super(app);
    this.boardService = boardService;
    this.onUpdate = onUpdate;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kanban-team-modal');

    // Header
    const header = contentEl.createDiv({ cls: 'team-modal-header' });
    header.createEl('h2', { text: 'Team members' });
    header.createEl('p', {
      text: 'Manage your board team. Only listed members can be assigned to tasks.',
      cls: 'team-modal-desc'
    });

    // Member list
    this.listContainer = contentEl.createDiv({ cls: 'team-member-list' });
    this.renderList();

    // Add member button
    const addBtn = contentEl.createEl('button', { cls: 'team-add-btn', text: '+ add member' });
    addBtn.addEventListener('click', () => this.openAddMemberForm());
  }

  private renderList(): void {
    if (!this.listContainer) return;
    this.listContainer.empty();

    const members = this.boardService.getTeamMembers();

    if (members.length === 0) {
      const empty = this.listContainer.createDiv({ cls: 'team-empty-state' });
      setIcon(empty.createSpan({ cls: 'team-empty-icon' }), 'users');
      empty.createEl('p', { text: 'No team members yet. Add your first member!' });
      return;
    }

    members.forEach(member => this.renderMemberRow(member));
  }

  private renderMemberRow(member: TeamMember): void {
    if (!this.listContainer) return;

    const row = this.listContainer.createDiv({ cls: 'team-member-row' });

    // Avatar
    const avatar = row.createDiv({ cls: 'team-avatar' });
    avatar.textContent = member.name.charAt(0).toUpperCase();
    if (member.color) setCssProps(avatar, { '--kp-color': member.color });

    // Info
    const info = row.createDiv({ cls: 'team-member-info' });
    info.createEl('span', { text: member.name, cls: 'team-member-name' });
    if (member.role || member.email) {
      const sub = info.createDiv({ cls: 'team-member-sub' });
      if (member.role) sub.createEl('span', { text: member.role, cls: 'team-member-role' });
      if (member.role && member.email) sub.createEl('span', { text: ' · ', cls: 'team-separator' });
      if (member.email) sub.createEl('span', { text: member.email, cls: 'team-member-email' });
    }

    // Actions
    const actions = row.createDiv({ cls: 'team-member-actions' });

    const editBtn = actions.createEl('button', { cls: 'icon-btn-small', attr: { 'aria-label': 'Edit' } });
    setIcon(editBtn, 'pencil');
    editBtn.addEventListener('click', () => this.openEditMemberForm(member));

    const deleteBtn = actions.createEl('button', { cls: 'icon-btn-small danger', attr: { 'aria-label': 'Remove' } });
    setIcon(deleteBtn, 'trash-2');
    deleteBtn.addEventListener('click', () => this.confirmRemove(member));
  }

  private openAddMemberForm(): void {
    new MemberFormModal(this.app, null, (data) => {
      this.boardService.addTeamMember(data);
      this.onUpdate();
      this.renderList();
      new Notice(`${data.name} added to the team`, 2000);
    }).open();
  }

  private openEditMemberForm(member: TeamMember): void {
    new MemberFormModal(this.app, member, (data) => {
      this.boardService.updateTeamMember(member.id, data);
      this.onUpdate();
      this.renderList();
      new Notice(`✅ ${data.name} updated`, 2000);
    }).open();
  }

  private confirmRemove(member: TeamMember): void {
    new ConfirmModal(
      this.app,
      'Remove team member',
      `Remove "${member.name}" from the team? They will also be unassigned from all cards.`,
      () => {
        this.boardService.removeTeamMember(member.id);
        this.onUpdate();
        this.renderList();
        new Notice(`${member.name} removed`, 2000);
      },
      'Remove',
      'Cancel',
      true
    ).open();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// ============================================
// MEMBER FORM MODAL - Add / Edit a member
// ============================================

class MemberFormModal extends Modal {
  private member: TeamMember | null;
  private onSubmit: (data: Omit<TeamMember, 'id'>) => void;

  private nameVal = '';
  private roleVal = '';
  private emailVal = '';
  private colorVal = '#6366f1';

  private readonly colorPalette = [
    '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
    '#f97316', '#f59e0b', '#22c55e', '#10b981',
    '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6'
  ];

  constructor(app: App, member: TeamMember | null, onSubmit: (data: Omit<TeamMember, 'id'>) => void) {
    super(app);
    this.member = member;
    this.onSubmit = onSubmit;
    if (member) {
      this.nameVal = member.name;
      this.roleVal = member.role || '';
      this.emailVal = member.email || '';
      this.colorVal = member.color || '#6366f1';
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kanban-member-form-modal');

    contentEl.createEl('h2', { text: this.member ? 'Edit member' : 'Add member' });

    // Preview avatar
    const previewRow = contentEl.createDiv({ cls: 'member-form-preview' });
    const avatarPreview = previewRow.createDiv({ cls: 'team-avatar-preview' });
    avatarPreview.textContent = this.nameVal.charAt(0).toUpperCase() || '?';
    setCssProps(avatarPreview, { '--kp-color': this.colorVal });

    const updatePreview = () => {
      avatarPreview.textContent = this.nameVal.charAt(0).toUpperCase() || '?';
      setCssProps(avatarPreview, { '--kp-color': this.colorVal });
    };

    // Name
    new Setting(contentEl)
      .setName('Name *')
      .setDesc('Full name of the team member')
      .addText(text => {
        text.setValue(this.nameVal).setPlaceholder('E.g. Alice johnson');
        text.inputEl.focus();
        text.onChange(v => { this.nameVal = v; updatePreview(); });
        text.inputEl.addEventListener('keydown', e => {
          if (e.key === 'Enter') { e.preventDefault(); this.submit(); }
        });
      });

    // Role
    new Setting(contentEl)
      .setName('Role')
      .setDesc('Job title or role in the project')
      .addText(text => {
        text.setValue(this.roleVal).setPlaceholder('E.g. Frontend developer');
        text.onChange(v => { this.roleVal = v; });
      });

    // Email
    new Setting(contentEl)
      .setName('Email')
      .setDesc('Contact email address')
      .addText(text => {
        text.setValue(this.emailVal).setPlaceholder('e.g. alice@example.com');
        text.onChange(v => { this.emailVal = v; });
      });

    // Color picker
    const colorSetting = new Setting(contentEl)
      .setName('Avatar color')
      .setDesc('Color used for the avatar');

    const colorContainer = colorSetting.controlEl.createDiv({ cls: 'member-color-picker' });
    this.colorPalette.forEach(color => {
      const swatch = colorContainer.createDiv({ cls: 'member-color-swatch' });
      setCssProps(swatch, { '--kp-color': color });
      if (color === this.colorVal) swatch.addClass('selected');
      swatch.addEventListener('click', () => {
        colorContainer.querySelectorAll('.member-color-swatch').forEach(s => s.removeClass('selected'));
        swatch.addClass('selected');
        this.colorVal = color;
        updatePreview();
      });
    });

    // Buttons
    const btnRow = contentEl.createDiv({ cls: 'button-container' });
    const cancelBtn = btnRow.createEl('button', { text: 'Cancel', cls: 'cancel-btn' });
    cancelBtn.addEventListener('click', () => this.close());

    const submitBtn = btnRow.createEl('button', {
      text: this.member ? 'Save changes' : 'Add member',
      cls: 'submit-btn'
    });
    submitBtn.addEventListener('click', () => this.submit());
  }

  private submit(): void {
    const name = this.nameVal.trim();
    if (!name) {
      new Notice('Name is required', 2000);
      return;
    }
    this.onSubmit({
      name,
      role: this.roleVal.trim() || undefined,
      email: this.emailVal.trim() || undefined,
      color: this.colorVal
    });
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// ============================================
// MEMBER DETAIL MODAL - View & edit a member
// ============================================

export class MemberDetailModal extends Modal {
  private member: TeamMember;
  private boardService: BoardService;
  private onUpdate: () => void;

  constructor(app: App, member: TeamMember, boardService: BoardService, onUpdate: () => void) {
    super(app);
    this.member = member;
    this.boardService = boardService;
    this.onUpdate = onUpdate;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kanban-member-detail-modal');
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();

    // Header with avatar
    const header = contentEl.createDiv({ cls: 'member-detail-header' });
    const avatar = header.createDiv({ cls: 'member-detail-avatar' });
    avatar.textContent = this.member.name.charAt(0).toUpperCase();
    if (this.member.color) setCssProps(avatar, { '--kp-color': this.member.color });

    const headerInfo = header.createDiv({ cls: 'member-detail-header-info' });
    headerInfo.createEl('h2', { text: this.member.name, cls: 'member-detail-name' });
    if (this.member.role) {
      headerInfo.createEl('p', { text: this.member.role, cls: 'member-detail-role' });
    }

    // Info rows
    const infoSection = contentEl.createDiv({ cls: 'member-detail-info' });

    if (this.member.email) {
      const emailRow = infoSection.createDiv({ cls: 'member-detail-row' });
      const emailIcon = emailRow.createSpan({ cls: 'member-detail-row-icon' });
      setIcon(emailIcon, 'mail');
      emailRow.createEl('a', {
        text: this.member.email,
        cls: 'member-detail-email',
        href: `mailto:${this.member.email}`
      });
    }

    if (this.member.role) {
      const roleRow = infoSection.createDiv({ cls: 'member-detail-row' });
      const roleIcon = roleRow.createSpan({ cls: 'member-detail-row-icon' });
      setIcon(roleIcon, 'briefcase');
      roleRow.createEl('span', { text: this.member.role, cls: 'member-detail-text' });
    }

    // Cards assigned to this member
    const board = this.boardService.getBoard();
    const assignedCards = board.cards.filter(c => c.assignee.includes(this.member.name));
    if (assignedCards.length > 0) {
      const cardsSection = contentEl.createDiv({ cls: 'member-detail-cards' });
      cardsSection.createEl('h3', { text: `Assigned tasks (${assignedCards.length})` });
      const cardsList = cardsSection.createDiv({ cls: 'member-detail-cards-list' });
      assignedCards.slice(0, 5).forEach(card => {
        const cardRow = cardsList.createDiv({ cls: 'member-detail-card-row' });
        const col = board.columns.find(c => c.id === card.columnId);
        const dot = cardRow.createSpan({ cls: 'member-detail-card-dot' });
        if (col) setCssProps(dot, { '--kp-color': col.color });
        cardRow.createEl('span', { text: card.title, cls: 'member-detail-card-title' });
      });
      if (assignedCards.length > 5) {
        cardsSection.createEl('p', {
          text: `+${assignedCards.length - 5} more tasks`,
          cls: 'member-detail-more'
        });
      }
    }

    // Action buttons
    const btnRow = contentEl.createDiv({ cls: 'member-detail-actions' });

    const closeBtn = btnRow.createEl('button', { text: 'Close', cls: 'cancel-btn' });
    closeBtn.addEventListener('click', () => this.close());

    const editBtn = btnRow.createEl('button', { text: '✏️ edit', cls: 'submit-btn' });
    editBtn.addEventListener('click', () => {
      new MemberFormModal(this.app, this.member, (data) => {
        this.boardService.updateTeamMember(this.member.id, data);
        this.onUpdate();
        const updated = this.boardService.getTeamMembers().find(m => m.id === this.member.id);
        if (updated) {
          this.member = updated;
          this.render();
        }
        new Notice(`${data.name} updated`, 2000);
      }).open();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
