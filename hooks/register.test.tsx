import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'huddle',
  component: 'Pane',
  requestId: 'huddle',
  props: {
    title: 'Huddle',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const SAMPLE_DATA = JSON.stringify({
  releve: '14:30',
  postes: [
    {
      nom: 'agent-1',
      etat: 'au travail',
      ticket: '42',
      action: 'Implémente le matching',
      depuis: '5m',
      enFile: 2,
      blocages: null,
      dernieres: ['Lecture des fichiers', 'Ajout du test'],
      alerte: null,
    },
    {
      nom: 'agent-2',
      etat: 'en attente',
      ticket: '43',
      action: null,
      depuis: '12m',
      enFile: 0,
      blocages: ['Dépendance sur #42'],
      dernieres: null,
      alerte: 'Bloqué',
    },
  ],
  questions: [
    {
      ticket: '42',
      titre: 'Matching algo',
      statut: 'open',
      sujet: 'Algorithme',
      question: 'Quel algorithme utiliser ?',
      options: [
        { cle: 'a', texte: 'Dijkstra', recommandee: true },
        { cle: 'b', texte: 'A*' },
      ],
    },
  ],
  aValider: [44, 45],
  erreurFile: null,
})

test('pane shows loading state when no data', async ($, on) => {
  on('command.register', () => ({ value: { command: 'huddle' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const row = await ui.find({ type: 'Text', text: /donnée|Script/ })
    expect(row).toBeTruthy()
    await ui.unmount()
  }
})

test('todo items appear on prompt and clear on turn complete', async ($, on) => {
  on('command.register', () => ({ value: { command: 'huddle' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.every', () => ({ value: undefined }))
  on('prompt.submit', () => ({ text: '', model: '' }))
  on('turn.complete', () => ({ text: '' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => ({
    value: {
      exitCode: 0,
      stdout: JSON.stringify({
        releve: '14:00', postes: [], questions: [], aValider: [], erreurFile: null,
      }),
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  await $.prompt.submit({ text: 'Corrige le bug dans le matching algo', turnId: 'turn-1' })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const pending = await ui.find({ type: 'Button', text: /Corrige le bug/ })
  expect(pending).toBeTruthy()
  await ui.unmount()

  await $.turn.complete({
    answer: 'done',
    durationMs: 1000,
    isAborted: false,
    turnId: 'turn-1',
    reason: 'answer',
  })

  const ui2 = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const doneBtn = await ui2.find({ type: 'Button', text: /Corrige le bug/ })
  expect(doneBtn).toBeTruthy()
  expect(doneBtn?.text).toMatch(/●/)
  await ui2.unmount()
})

test('slash commands are not added to todos', async ($, on) => {
  on('command.register', () => ({ value: { command: 'huddle' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.every', () => ({ value: undefined }))
  on('prompt.submit', () => ({ text: '', model: '' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => ({
    value: {
      exitCode: 0,
      stdout: JSON.stringify({
        releve: '14:00', postes: [], questions: [], aValider: [], erreurFile: null,
      }),
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  await $.prompt.submit({
    text: '/huddle',
    command: { name: 'huddle', args: '' },
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const item = await ui.find({ type: 'Button', text: /huddle/ })
  expect(item).toBeFalsy()
  await ui.unmount()
})

test('pane shows agents when data is present', async ($, on) => {
  on('command.register', () => ({ value: { command: 'huddle' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => ({
    value: {
      exitCode: 0,
      stdout: SAMPLE_DATA,
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const agent1 = await ui.find({ type: 'Button', text: /agent-1/ })
    expect(agent1).toBeTruthy()
    const agent2 = await ui.find({ type: 'Button', text: /agent-2/ })
    expect(agent2).toBeTruthy()
    const question = await ui.find({ type: 'Text', text: /algorithme/i })
    expect(question).toBeTruthy()
    const valider = await ui.find({ type: 'Text', text: /valider.*2/ })
    expect(valider).toBeTruthy()
    await ui.unmount()
  }
})
