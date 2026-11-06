/**
 * Server actions com os services falsos (S33): o que mora na action e não no service — o zod da entrada, o login
 * exigido pelo `authActionClient`, o usuário da sessão (`ctx.user`) passado adiante, o `revalidatePath` só quando deu
 * certo, o `redirectTo` montado dos headers e a tradução de erro em `serverError`. Os services têm testes próprios.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  requireUser: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  changePassword: vi.fn(),
  requestPasswordReset: vi.fn(),
  revalidatePath: vi.fn(),
  headers: vi.fn(),
  projects: {
    createProject: vi.fn(),
    saveProject: vi.fn(),
    renameProject: vi.fn(),
    duplicateProject: vi.fn(),
    deleteProject: vi.fn(),
    trashProject: vi.fn(),
    restoreProject: vi.fn(),
    listRevisions: vi.fn(),
    restoreRevision: vi.fn(),
  },
  team: {
    inviteMember: vi.fn(),
    setMemberRole: vi.fn(),
    removeMember: vi.fn(),
    setMemberName: vi.fn(),
    setMyName: vi.fn(),
    memberResetLink: vi.fn(),
    setMemberDisabled: vi.fn(),
    deleteMemberAccount: vi.fn(),
    renewInvite: vi.fn(),
    revokeInvite: vi.fn(),
    acceptInvite: vi.fn(),
  },
  admin: vi.fn(),
  panels: { generate: vi.fn(), check: vi.fn(), listExamples: vi.fn() },
  sheetsPdf: vi.fn(),
  jobs: { cancelJob: vi.fn(), jobProgress: vi.fn(), takeResult: vi.fn() },
  extract: { fromFiles: vi.fn(), preview: vi.fn(), reconvert: vi.fn(), replayRecorded: vi.fn() },
  downloadDrawings: vi.fn(),
  devToolsEnabled: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: m.revalidatePath }));
vi.mock('next/headers', () => ({ headers: m.headers, cookies: vi.fn() }));
vi.mock('@/services/auth.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/auth.service')>()),
  requireUser: m.requireUser,
  signIn: m.signIn,
  signOut: m.signOut,
  changePassword: m.changePassword,
  requestPasswordReset: m.requestPasswordReset,
}));
vi.mock('@/services/projects.service', () => m.projects);
vi.mock('@/services/team.service', () => ({ ...m.team, defaultDeps: { table: async () => undefined } }));
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: m.admin }));
vi.mock('@/services/panels.service', () => m.panels);
vi.mock('@/services/pdf.service', () => ({
  sheetsPdf: m.sheetsPdf,
  toBase64: (b: Uint8Array) => Buffer.from(b).toString('base64'),
}));
vi.mock('@/services/extract-jobs', () => m.jobs);
vi.mock('@/services/extract.service', () => m.extract);
vi.mock('@/services/drawings.service', () => ({ downloadDrawings: m.downloadDrawings }));
vi.mock('@/lib/dev-tools', () => ({ devToolsEnabled: m.devToolsEnabled }));

const { SignedOutError } = await import('@/services/auth.service');
const { ProjectsTableError } = await import('@/lib/supabase/projects-table');
const { PROJECTS_HREF } = await import('@/lib/projects');
const { ACCOUNT_HREF } = await import('@/lib/site-nav');
const { applyProjectData } = await import('./app/_actions/apply-project-data');
const { cancelExtraction } = await import('./app/_actions/cancel-extraction');
const { checkProject } = await import('./app/_actions/check-project');
const { createProjectAction } = await import('./app/_actions/create-project');
const { deleteProjectAction } = await import('./app/_actions/delete-project');
const { downloadPdf } = await import('./app/_actions/download-pdf');
const { duplicateProjectAction } = await import('./app/_actions/duplicate-project');
const { extractWalls } = await import('./app/_actions/extract-walls');
const { extractionProgress } = await import('./app/_actions/extraction-progress');
const { extractionResult } = await import('./app/_actions/extraction-result');
const { finishResponse } = await import('./app/_actions/finish-response');
const { generatePanels } = await import('./app/_actions/generate-panels');
const { previewExtraction } = await import('./app/_actions/preview-extraction');
const { projectHistoryAction, restoreRevisionAction } = await import('./app/_actions/project-history');
const { renameProjectAction } = await import('./app/_actions/rename-project');
const { saveProjectAction } = await import('./app/_actions/save-project');
const { restoreProjectAction, trashProjectAction } = await import('./app/_actions/trash-project');
const { changePasswordAction } = await import('./app/account/_actions/change-password');
const { inviteMemberAction } = await import('./app/account/_actions/invite-member');
const { deleteMemberAccountAction, memberResetLinkAction, removeMemberAction, setMemberDisabledAction, setMemberNameAction, setMemberRoleAction } =
  await import('./app/account/_actions/team-members');
const { renewInviteAction, revokeInviteAction } = await import('./app/account/_actions/invites');
const { setMyNameAction } = await import('./app/account/_actions/profile');
const { acceptInviteAction } = await import('./invite/[token]/_actions/accept-invite');
const { requestPasswordResetAction } = await import('./login/_actions/request-password-reset');
const { signInAction } = await import('./login/_actions/sign-in');
const { signOutAction } = await import('./login/_actions/sign-out');

const USER = { id: '11111111-1111-4111-8111-111111111111', email: 'pat@example.com' };
const ID = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const TOKEN = 'A'.repeat(43);
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>';
const ok = { ok: true as const };
const fail = { ok: false as const, reason: 'not_found' as const, message: 'gone' };

/** Os campos de "Project details" vazios (o form manda todos). */
const EMPTY_PROJECT_DATA = {
  wallHeight: '',
  headerHeight: '',
  sillHeight: '',
  floors: '',
  floorSpan: '',
  snow: '',
  width: '',
  wind: '',
  exposure: '',
} as const;

function headersOf(values: Record<string, string>) {
  return { get: (k: string) => values[k.toLowerCase()] ?? null };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.requireUser.mockResolvedValue(USER);
  m.headers.mockResolvedValue(headersOf({ host: 'localhost:3000' }));
  m.devToolsEnabled.mockReturnValue(false);
  m.panels.listExamples.mockReturnValue([]);
});

/** Cada action que exige login, com uma entrada válida e o service que ela chamaria. */
const AUTH_ACTIONS: [string, (input: never) => Promise<unknown>, unknown, ReturnType<typeof vi.fn>][] = [
  ['generatePanels', generatePanels as never, { projectText: '{"walls":[]}' }, m.panels.generate],
  ['checkProject', checkProject as never, { projectText: '{"walls":[]}' }, m.panels.check],
  ['createProject', createProjectAction as never, { name: 'A', text: '{"walls":[]}' }, m.projects.createProject],
  ['saveProject', saveProjectAction as never, { id: ID, revision: 1, text: '{"walls":[]}' }, m.projects.saveProject],
  ['renameProject', renameProjectAction as never, { id: ID, name: 'B' }, m.projects.renameProject],
  ['duplicateProject', duplicateProjectAction as never, { id: ID }, m.projects.duplicateProject],
  ['deleteProject', deleteProjectAction as never, { id: ID }, m.projects.deleteProject],
  ['trashProject', trashProjectAction as never, { id: ID }, m.projects.trashProject],
  ['restoreProject', restoreProjectAction as never, { id: ID }, m.projects.restoreProject],
  ['projectHistory', projectHistoryAction as never, { id: ID }, m.projects.listRevisions],
  ['restoreRevision', restoreRevisionAction as never, { id: ID, revision: 3 }, m.projects.restoreRevision],
  ['downloadPdf', downloadPdf as never, { projectName: 'P', pages: [{ label: 'W1-P1', svg: SVG }] }, m.sheetsPdf],
  ['cancelExtraction', cancelExtraction as never, { jobId: 'job-12345678' }, m.jobs.cancelJob],
  ['extractionProgress', extractionProgress as never, { jobId: 'job-12345678' }, m.jobs.jobProgress],
  ['extractionResult', extractionResult as never, { jobId: 'job-12345678' }, m.jobs.takeResult],
  ['finishResponse', finishResponse as never, { sampleId: 'ringgold' }, m.extract.replayRecorded],
  [
    'changePassword',
    changePasswordAction as never,
    { password: 'long-enough', confirm: 'long-enough' },
    m.changePassword,
  ],
  ['inviteMember', inviteMemberAction as never, { email: 'new@example.com', role: 'editor' }, m.team.inviteMember],
  ['setMemberRole', setMemberRoleAction as never, { userId: OTHER, role: 'admin' }, m.team.setMemberRole],
  ['removeMember', removeMemberAction as never, { userId: OTHER }, m.team.removeMember],
  ['setMemberName', setMemberNameAction as never, { userId: OTHER, name: 'Ed' }, m.team.setMemberName],
  ['setMyName', setMyNameAction as never, { name: 'Pat' }, m.team.setMyName],
  ['memberResetLink', memberResetLinkAction as never, { userId: OTHER }, m.team.memberResetLink],
  ['setMemberDisabled', setMemberDisabledAction as never, { userId: OTHER, disabled: true }, m.team.setMemberDisabled],
  ['deleteMemberAccount', deleteMemberAccountAction as never, { userId: OTHER }, m.team.deleteMemberAccount],
  ['renewInvite', renewInviteAction as never, { id: ID }, m.team.renewInvite],
  ['revokeInvite', revokeInviteAction as never, { id: ID }, m.team.revokeInvite],
  [
    'applyProjectData',
    applyProjectData as never,
    { output: {}, meta: { model: 'm', pagesSent: [] }, data: EMPTY_PROJECT_DATA },
    m.extract.reconvert,
  ],
];

describe('authActionClient: login exigido', () => {
  it.each(AUTH_ACTIONS)(
    '%s sem sessão: "Sign in to continue." e o service não roda',
    async (_name, action, input, service) => {
      m.requireUser.mockRejectedValue(new SignedOutError());
      const r = (await action(input as never)) as { serverError?: string; data?: unknown };
      expect(r.serverError).toBe('Sign in to continue.');
      expect(r.data).toBeUndefined();
      expect(service).not.toHaveBeenCalled();
      expect(m.revalidatePath).not.toHaveBeenCalled();
    },
  );

  it('as de FormData também', async () => {
    m.requireUser.mockRejectedValue(new SignedOutError());
    expect((await extractWalls(new FormData())).serverError).toBe('Sign in to continue.');
    expect((await previewExtraction(new FormData())).serverError).toBe('Sign in to continue.');
    expect(m.extract.fromFiles).not.toHaveBeenCalled();
    expect(m.extract.preview).not.toHaveBeenCalled();
  });

  it('login, "esqueci a senha" e sair não exigem sessão', async () => {
    m.requireUser.mockRejectedValue(new SignedOutError());
    m.signIn.mockResolvedValue({ ok: true, user: USER });
    m.requestPasswordReset.mockResolvedValue({ ok: true });
    expect((await signInAction({ email: ' pat@example.com ', password: 'x' })).data).toEqual({ ok: true, user: USER });
    expect(m.signIn).toHaveBeenCalledWith('pat@example.com', 'x');
    expect((await requestPasswordResetAction({ email: 'pat@example.com' })).data).toEqual({ ok: true });
    expect((await signOutAction()).data).toEqual({ ok: true });
    expect(m.signOut).toHaveBeenCalledOnce();
    expect(m.requireUser).not.toHaveBeenCalled();
  });

  it('sem Supabase (requireUser devolve undefined) passa, com usuário vazio', async () => {
    m.requireUser.mockResolvedValue(undefined);
    m.projects.createProject.mockResolvedValue({ ok: false, reason: 'unconfigured', message: 'x' });
    await createProjectAction({ text: '{"walls":[]}' });
    expect(m.projects.createProject).toHaveBeenCalledWith({ name: undefined, text: '{"walls":[]}' }, undefined);
    m.jobs.cancelJob.mockResolvedValue(true);
    expect((await cancelExtraction({ jobId: 'job-12345678' })).data).toEqual({ cancelled: true });
    expect(m.jobs.cancelJob).toHaveBeenCalledWith('job-12345678', undefined);
  });
});

describe('entrada inválida volta em validationErrors, sem chamar o service', () => {
  it.each([
    [
      'saveProject: id não-uuid',
      () => saveProjectAction({ id: 'abc', revision: 1, text: '{}' }),
      m.projects.saveProject,
    ],
    ['saveProject: revisão 0', () => saveProjectAction({ id: ID, revision: 0, text: '{}' }), m.projects.saveProject],
    ['renameProject: nome vazio', () => renameProjectAction({ id: ID, name: '   ' }), m.projects.renameProject],
    ['generatePanels: texto vazio', () => generatePanels({ projectText: ' ' }), m.panels.generate],
    ['downloadPdf: sem páginas', () => downloadPdf({ projectName: 'P', pages: [] }), m.sheetsPdf],
    [
      'finishResponse: sample e JSON juntos',
      () => finishResponse({ sampleId: 'x', responseJson: '{}' }),
      m.extract.replayRecorded,
    ],
    ['changePassword: curtas', () => changePasswordAction({ password: 'short', confirm: 'short' }), m.changePassword],
    [
      'changePassword: diferentes',
      () => changePasswordAction({ password: 'long-enough', confirm: 'long-enougH' }),
      m.changePassword,
    ],
    ['inviteMember: e-mail', () => inviteMemberAction({ email: 'not-an-email', role: 'editor' }), m.team.inviteMember],
    [
      'setMemberRole: papel',
      () => setMemberRoleAction({ userId: OTHER, role: 'owner' as 'admin' }),
      m.team.setMemberRole,
    ],
    ['signIn: sem senha', () => signInAction({ email: 'pat@example.com', password: '' }), m.signIn],
    ['setMemberName: nome longo', () => setMemberNameAction({ userId: OTHER, name: 'x'.repeat(81) }), m.team.setMemberName],
    [
      'setMemberDisabled: sem booleano',
      () => setMemberDisabledAction({ userId: OTHER, disabled: 'yes' as unknown as boolean }),
      m.team.setMemberDisabled,
    ],
    ['revokeInvite: id', () => revokeInviteAction({ id: 'nope' }), m.team.revokeInvite],
    [
      'acceptInvite: senhas diferentes',
      () => acceptInviteAction({ token: TOKEN, password: 'long-enough', confirm: 'long-enougH' }),
      m.team.acceptInvite,
    ],
    [
      'acceptInvite: token',
      () => acceptInviteAction({ token: 'short', password: 'long-enough', confirm: 'long-enough' }),
      m.team.acceptInvite,
    ],
  ] as const)('%s', async (_name, call, service) => {
    const r = await call();
    expect(r.validationErrors).toBeDefined();
    expect(r.data).toBeUndefined();
    expect(service).not.toHaveBeenCalled();
  });
});

describe('o usuário da sessão segue para o service', () => {
  it('criar, duplicar e restaurar retrato levam o autor', async () => {
    m.projects.createProject.mockResolvedValue({ ok: true, id: ID, revision: 1, savedAt: 'now' });
    m.projects.duplicateProject.mockResolvedValue({ ok: true, id: OTHER, name: 'Copy of A' });
    m.projects.restoreRevision.mockResolvedValue({ ok: true, id: OTHER, name: 'A (revision 3)' });
    expect((await createProjectAction({ name: ' A ', text: '{"walls":[]}' })).data).toEqual({
      ok: true,
      id: ID,
      revision: 1,
      savedAt: 'now',
    });
    expect(m.projects.createProject).toHaveBeenCalledWith({ name: 'A', text: '{"walls":[]}' }, USER);
    await duplicateProjectAction({ id: ID });
    expect(m.projects.duplicateProject).toHaveBeenCalledWith(ID, USER);
    await restoreRevisionAction({ id: ID, revision: 3 });
    expect(m.projects.restoreRevision).toHaveBeenCalledWith({ id: ID, revision: 3 }, USER);
  });

  it('jobs de leitura: o dono é o id da sessão; resultado ausente vira null', async () => {
    m.jobs.jobProgress.mockResolvedValue({ status: 'unknown' });
    m.jobs.takeResult.mockResolvedValue(undefined);
    await extractionProgress({ jobId: 'job-12345678' });
    expect(m.jobs.jobProgress).toHaveBeenCalledWith('job-12345678', USER.id);
    expect((await extractionResult({ jobId: 'job-12345678' })).data).toBeNull();
    expect(m.jobs.takeResult).toHaveBeenCalledWith('job-12345678', USER.id);
  });

  it('papéis do time levam quem pede', async () => {
    m.team.setMemberRole.mockResolvedValue(ok);
    m.team.removeMember.mockResolvedValue(ok);
    await setMemberRoleAction({ userId: OTHER, role: 'admin' });
    expect(m.team.setMemberRole).toHaveBeenCalledWith({ userId: OTHER, role: 'admin' }, USER);
    await removeMemberAction({ userId: OTHER });
    expect(m.team.removeMember).toHaveBeenCalledWith({ userId: OTHER }, USER);
  });
});

describe('revalidatePath só quando deu certo', () => {
  it.each([
    ['renameProject', () => renameProjectAction({ id: ID, name: 'B' }), m.projects.renameProject, PROJECTS_HREF],
    ['duplicateProject', () => duplicateProjectAction({ id: ID }), m.projects.duplicateProject, PROJECTS_HREF],
    ['deleteProject', () => deleteProjectAction({ id: ID }), m.projects.deleteProject, PROJECTS_HREF],
    ['trashProject', () => trashProjectAction({ id: ID }), m.projects.trashProject, PROJECTS_HREF],
    ['restoreProject', () => restoreProjectAction({ id: ID }), m.projects.restoreProject, PROJECTS_HREF],
    [
      'restoreRevision',
      () => restoreRevisionAction({ id: ID, revision: 2 }),
      m.projects.restoreRevision,
      PROJECTS_HREF,
    ],
    ['setMemberRole', () => setMemberRoleAction({ userId: OTHER, role: 'editor' }), m.team.setMemberRole, ACCOUNT_HREF],
    ['removeMember', () => removeMemberAction({ userId: OTHER }), m.team.removeMember, ACCOUNT_HREF],
    ['setMemberName', () => setMemberNameAction({ userId: OTHER, name: 'Ed' }), m.team.setMemberName, ACCOUNT_HREF],
    ['setMyName', () => setMyNameAction({ name: 'Pat' }), m.team.setMyName, ACCOUNT_HREF],
    [
      'setMemberDisabled',
      () => setMemberDisabledAction({ userId: OTHER, disabled: false }),
      m.team.setMemberDisabled,
      ACCOUNT_HREF,
    ],
    [
      'deleteMemberAccount',
      () => deleteMemberAccountAction({ userId: OTHER }),
      m.team.deleteMemberAccount,
      ACCOUNT_HREF,
    ],
    ['revokeInvite', () => revokeInviteAction({ id: ID }), m.team.revokeInvite, ACCOUNT_HREF],
    [
      'inviteMember',
      () => inviteMemberAction({ email: 'new@example.com', role: 'editor' }),
      m.team.inviteMember,
      ACCOUNT_HREF,
    ],
  ] as const)('%s', async (_name, call, service, href) => {
    service.mockResolvedValueOnce(fail);
    expect((await call()).data).toEqual(fail);
    expect(m.revalidatePath).not.toHaveBeenCalled();
    service.mockResolvedValueOnce(ok);
    expect((await call()).data).toEqual(ok);
    expect(m.revalidatePath).toHaveBeenCalledExactlyOnceWith(href);
  });

  it('salvar (auto-save) não revalida a lista', async () => {
    m.projects.saveProject.mockResolvedValue({ ok: true, revision: 2, savedAt: 'now' });
    await saveProjectAction({ id: ID, revision: 1, name: 'A', text: '{"walls":[]}' });
    expect(m.projects.saveProject).toHaveBeenCalledWith({ id: ID, revision: 1, name: 'A', text: '{"walls":[]}' });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('links de e-mail montados dos headers da requisição', () => {
  it('convite e link de senha: origem do proxy (Cloud Run) e a chave secret só aqui', async () => {
    m.headers.mockResolvedValue(
      headersOf({ host: 'internal:8080', 'x-forwarded-host': 'panelizer.run.app', 'x-forwarded-proto': 'https' }),
    );
    m.admin.mockReturnValue({ admin: 'secret-client' });
    m.team.inviteMember.mockResolvedValue({ ok: true, status: 'invite_link' });
    await inviteMemberAction({ email: ' new@example.com ', name: 'Nova', role: 'admin' });
    const [input, user, deps] = m.team.inviteMember.mock.calls[0]!;
    expect(input).toEqual({ email: 'new@example.com', name: 'Nova', role: 'admin', origin: 'https://panelizer.run.app' });
    expect(user).toBe(USER);
    expect(deps.admin).toEqual({ admin: 'secret-client' });
    m.team.memberResetLink.mockResolvedValue({ ok: true, email: 'e', url: 'u' });
    await memberResetLinkAction({ userId: OTHER });
    expect(m.team.memberResetLink.mock.calls[0]!.slice(0, 2)).toEqual([
      { userId: OTHER, origin: 'https://panelizer.run.app' },
      USER,
    ]);
    m.team.renewInvite.mockResolvedValue({ ok: false, reason: 'not_found', message: 'x' });
    await renewInviteAction({ id: ID });
    expect(m.team.renewInvite.mock.calls[0]![0]).toEqual({ id: ID, origin: 'https://panelizer.run.app' });
  });

  it('aceitar convite: sem sessão; cria a conta e entra com a senha escolhida', async () => {
    m.requireUser.mockRejectedValue(new SignedOutError());
    m.admin.mockReturnValue({ admin: 'secret-client' });
    m.team.acceptInvite.mockResolvedValue({ ok: true, email: 'fresh@x.com' });
    m.signIn.mockResolvedValue({ ok: true, user: USER });
    const r = await acceptInviteAction({ token: TOKEN, name: 'Fresh', password: 'long-enough', confirm: 'long-enough' });
    expect(r.data).toEqual({ ok: true, email: 'fresh@x.com', signedIn: true });
    expect(m.team.acceptInvite).toHaveBeenCalledWith(
      TOKEN,
      { name: 'Fresh', password: 'long-enough' },
      { admin: { admin: 'secret-client' } },
    );
    expect(m.signIn).toHaveBeenCalledWith('fresh@x.com', 'long-enough');
    m.team.acceptInvite.mockResolvedValue({ ok: false, reason: 'used', message: 'already used' });
    m.signIn.mockClear();
    const again = await acceptInviteAction({ token: TOKEN, password: 'long-enough', confirm: 'long-enough' });
    expect(again.data).toEqual({ ok: false, reason: 'used', message: 'already used' });
    expect(m.signIn).not.toHaveBeenCalled();
  });

  it('"esqueci a senha": localhost fica em http', async () => {
    m.requestPasswordReset.mockResolvedValue({ ok: true });
    await requestPasswordResetAction({ email: 'pat@example.com' });
    expect(m.requestPasswordReset).toHaveBeenCalledWith(
      'pat@example.com',
      expect.stringMatching(/^http:\/\/localhost:3000\/auth\/confirm\?next=/),
    );
  });
});

describe('PDF, leitura e revisão', () => {
  it('downloadPdf devolve base64, páginas e bytes', async () => {
    m.sheetsPdf.mockResolvedValue(new TextEncoder().encode('%PDF-1.7'));
    const r = await downloadPdf({
      projectName: 'Casa',
      pages: [
        { label: 'Panel plan', svg: SVG },
        { label: 'W1-P1', svg: SVG },
      ],
    });
    expect(r.data).toEqual({ base64: Buffer.from('%PDF-1.7').toString('base64'), pages: 2, bytes: 8 });
    expect(m.sheetsPdf).toHaveBeenCalledWith(
      [
        { label: 'Panel plan', svg: SVG },
        { label: 'W1-P1', svg: SVG },
      ],
      { projectName: 'Casa' },
    );
  });

  it('extractWalls: arquivos do corpo, campos e dono do job', async () => {
    m.extract.fromFiles.mockResolvedValue({ ok: true });
    const form = new FormData();
    form.set('level', '2');
    form.set('projectName', 'Casa');
    form.set('notes', 'leia a A-101');
    form.set('pages', '3, 15');
    form.set('jobId', 'job-12345678');
    form.append('files', new File([new Uint8Array([37, 80, 68, 70])], 'A-100.pdf', { type: 'application/pdf' }));
    form.append('files', new File([], 'empty.pdf'));
    await extractWalls(form);
    const [files, opts] = m.extract.fromFiles.mock.calls[0]!;
    expect(files).toEqual([{ name: 'A-100.pdf', type: 'application/pdf', bytes: new Uint8Array([37, 80, 68, 70]) }]);
    expect(opts).toMatchObject({
      pages: [3, 15],
      owner: USER.id,
      drawings: [],
      jobId: 'job-12345678',
      hints: { level: 2, projectName: 'Casa', extra: 'leia a A-101' },
    });
    expect(m.downloadDrawings).not.toHaveBeenCalled();
  });

  it('extractWalls: jobId fora do formato é ignorado', async () => {
    m.extract.fromFiles.mockResolvedValue({ ok: true });
    const form = new FormData();
    form.set('jobId', '../../etc');
    await extractWalls(form);
    expect(m.extract.fromFiles.mock.calls[0]![1]).not.toHaveProperty('jobId');
  });

  it('extractWalls: desenhos no bucket que não baixam voltam como erro de entrada, sem ler', async () => {
    m.downloadDrawings.mockResolvedValue({ ok: false, message: 'Could not read the drawings.' });
    const form = new FormData();
    form.set(
      'drawings',
      JSON.stringify([{ name: 'A-100.pdf', path: 'abcd1234/A-100.pdf', size: 10, type: 'application/pdf' }]),
    );
    const r = await extractWalls(form);
    expect(r.data).toEqual({ ok: false, reason: 'input', message: 'Could not read the drawings.' });
    expect(m.extract.fromFiles).not.toHaveBeenCalled();
    expect((await previewExtraction(form)).data).toEqual({ ok: false, message: 'Could not read the drawings.' });
  });

  it('applyProjectData sem resposta gravada não reconverte', async () => {
    const r = await applyProjectData({
      output: undefined,
      meta: { model: 'm', pagesSent: [] },
      data: EMPTY_PROJECT_DATA,
    });
    expect(r.data).toMatchObject({ ok: false, reason: 'input' });
    expect(m.extract.reconvert).not.toHaveBeenCalled();
  });

  it('finishResponse passa o interruptor de dev tools e acha o sample de leitura pelo id', async () => {
    m.devToolsEnabled.mockReturnValue(true);
    m.panels.listExamples.mockReturnValue([
      { kind: 'project', id: 'ringgold', text: 'project' },
      { kind: 'reading', id: 'ringgold', text: 'reading' },
    ]);
    m.extract.replayRecorded.mockResolvedValue({ ok: true });
    await finishResponse({ sampleId: 'ringgold' });
    const [input, deps] = m.extract.replayRecorded.mock.calls[0]!;
    expect(input).toEqual({ sampleId: 'ringgold' });
    expect(deps.devTools).toBe(true);
    expect(deps.sample('ringgold')).toBe('reading');
    expect(deps.sample('nope')).toBeUndefined();
  });
});

describe('erros do service viram serverError legível', () => {
  it('erro de adaptador: frase do código e o detalhe com o nome da classe intacto', async () => {
    m.projects.createProject.mockRejectedValue(
      new ProjectsTableError('permission denied for table projects', 'DB_ERROR'),
    );
    const r = await createProjectAction({ text: '{"walls":[]}' });
    expect(r.serverError).toMatch(/\(ProjectsTableError: permission denied for table projects\)$/);
  });

  it('erro inesperado: "Something went wrong" com o detalhe, e o stack no log', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    m.panels.generate.mockImplementation(() => {
      throw new TypeError('x is not a function');
    });
    const r = await generatePanels({ projectText: '{"walls":[]}' });
    expect(r.serverError).toBe('Something went wrong on the server (TypeError: x is not a function).');
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});
