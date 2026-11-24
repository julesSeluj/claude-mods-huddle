import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import type { HuddleData, ExpandedMap, TodoItem } from '../types'

const PANE = 'huddle'
const SCRIPT = 'C:/Users/ldoma/Repogit/Truckly-wt-methode/scripts/postes/etat-postes.mjs'
const ANSWER_SCRIPT = 'C:/Users/ldoma/Repogit/Truckly-wt-methode/scripts/repondre-question.mjs'
const POLL_FULL_MS = 3 * 60 * 1000
const POLL_LIGHT_MS = 30 * 1000

const data = atom({ plugin: 'huddle', key: 'data' } as const, null as HuddleData | null, { shape: 'data-1' })
const expanded = atom({ plugin: 'huddle', key: 'expanded' } as const, {} as ExpandedMap, { shape: 'expanded-1' })
const loading = atom({ plugin: 'huddle', key: 'loading' } as const, false, { shape: 'loading-1' })
const lastFetch = atom({ plugin: 'huddle', key: 'lastFetch' } as const, 0, { shape: 'lastFetch-1' })
const answering = atom({ plugin: 'huddle', key: 'answering' } as const, null as string | null, { shape: 'answering-1' })
const todos = atom({ plugin: 'huddle', key: 'todos' } as const, [] as TodoItem[], { shape: 'todos-1' })

let todoCounter = 0
function nextTodoId(): string {
  return `todo-${Date.now()}-${++todoCounter}`
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1) + '…'
}

async function fetchFull($: any) {
  await update($, loading, () => true)
  try {
    const result = await $.process.run(
      ['node', SCRIPT, '--json'],
      { timeoutMs: 60_000 }
    )
    if (result.exitCode === 0 && result.stdout) {
      try {
        const parsed: HuddleData = JSON.parse(result.stdout)
        await update($, data, () => parsed)
        await update($, lastFetch, () => Date.now())
      } catch {}
    }
  } catch {}
  await update($, loading, () => false)
}

async function fetchLight($: any) {
  try {
    const result = await $.process.run(
      ['node', SCRIPT, '--sans-file', '--json'],
      { timeoutMs: 15_000 }
    )
    if (result.exitCode === 0 && result.stdout) {
      try {
        const parsed: HuddleData = JSON.parse(result.stdout)
        await update($, data, (prev) => {
          if (!prev) return parsed
          return {
            ...parsed,
            questions: prev.questions,
            aValider: prev.aValider,
            erreurFile: prev.erreurFile,
          }
        })
      } catch {}
    }
  } catch {}
}

async function answerQuestion($: any, ticket: string, cle: string) {
  await update($, answering, () => `${ticket}:${cle}`)
  try {
    const result = await $.process.run(
      ['node', ANSWER_SCRIPT, ticket, cle],
      { timeoutMs: 30_000 }
    )
    if (result.exitCode === 0) {
      $.ui.toast(`Réponse envoyée pour ${ticket}`)
      await fetchFull($)
    } else {
      $.ui.toast(`Erreur réponse ${ticket}: code ${result.exitCode}`)
    }
  } catch (err: any) {
    $.ui.toast(`Erreur réponse ${ticket}`)
  }
  await update($, answering, () => null)
}

type EtatStyle = { icon: string; color: string; dot: string }
function etatStyle(etat: string): EtatStyle {
  switch (etat) {
    case 'au travail': return { icon: '●', color: 'blue', dot: '🔵' }
    case 'en attente': return { icon: '●', color: 'yellow', dot: '🟡' }
    case 'lot terminé': return { icon: '●', color: 'green', dot: '🟢' }
    case 'fermé': return { icon: '●', color: 'gray', dot: '⚫' }
    default: return { icon: '●', color: 'magenta', dot: '🟣' }
  }
}

function agentIcon(nom: string, action: string | null): string {
  const lo = nom.toLowerCase()
  if (lo === 'spec' || lo.includes('spec')) return '📋'
  const a = (action ?? '').toLowerCase()
  if (/test|spec|assert|expect/.test(a)) return '🧪'
  if (/fix|bug|corrig|debug|erreur/.test(a)) return '🔧'
  if (/refact|clean|simplif|réusin/.test(a)) return '♻️'
  if (/doc|readme|comment/.test(a)) return '📝'
  if (/deploy|release|publish|livr/.test(a)) return '🚀'
  if (/review|relect|véri/.test(a)) return '👁️'
  if (/match|algo|calcul|route|corridor/.test(a)) return '🧮'
  if (/api|endpoint|serveur|http/.test(a)) return '🌐'
  if (/ui|front|page|compos|écran|style/.test(a)) return '🎨'
  if (/data|base|migr|schema|sql/.test(a)) return '🗄️'
  if (/map|carte|géo|gps|coord|osm/.test(a)) return '🗺️'
  if (/import|export|csv|fichier|parse/.test(a)) return '📥'
  if (/scrip|autom|batch/.test(a)) return '⚙️'
  if (/lectur|read|analys/.test(a)) return '🔍'
  return '🤖'
}

function progressBar(enFile: number | null, width: number): string {
  if (!enFile || enFile <= 0) return ''
  const filled = Math.min(enFile, width)
  const bar = '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled))
  return bar
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'huddle',
      description: 'Ouvrir le panneau Huddle (agents Truckly)',
    })
    await $.command.register({
      name: 'huddle-refresh',
      description: 'Rafraîchir les données Huddle (appel complet)',
    })
    await $.command.register({
      name: 'huddle-answer',
      description: 'Répondre à une question : /huddle-answer <ticket> <clé>',
      argumentHint: '<ticket> <clé>',
    })

    void $.ui.open({ id: PANE, title: 'Huddle' })

    fetchFull($)

    $.clock.every(POLL_FULL_MS, () => fetchFull($))
    $.clock.every(POLL_LIGHT_MS, () => fetchLight($))

    return next(e)
  })

  on('command.run', { command: 'huddle' }, async ($) => {
    await $.ui.open({ id: PANE, title: 'Huddle' })
    return { text: 'Panneau Huddle ouvert.' }
  })

  on('command.run', { command: 'huddle-refresh' }, async ($) => {
    await fetchFull($)
    return { text: 'Huddle rafraîchi.' }
  })

  on('command.run', { command: 'huddle-answer' }, async ($, e) => {
    const args = ((e as any).args ?? '').trim().split(/\s+/)
    if (args.length < 2) {
      return { text: 'Usage : /huddle-answer <ticket> <clé>' }
    }
    const [ticket, cle] = args
    await answerQuestion($, ticket, cle)
    return { text: `Réponse ${cle} envoyée pour ${ticket}.` }
  })

  on('prompt.submit', async ($, e, next) => {
    const text = e.text ?? ''
    const skip = e.command || e.isMeta || text.length <= 5
      || /^<(task-notification|system-reminder|tool|function)/.test(text.trim())
      || /^<[a-z_-]+>/.test(text.trim()) && text.includes('</')
    if (!skip) {
      const clean = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
      const item: TodoItem = {
        id: nextTodoId(),
        text: truncate(clean, 60),
        turnId: e.turnId ?? '',
        status: 'pending',
        createdAt: Date.now(),
      }
      await update($, todos, list => [...list.slice(-19), item])
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const turnId = e.turnId ?? ''
    if (turnId) {
      await update($, todos, list =>
        list.map(t =>
          t.turnId === turnId && t.status === 'pending'
            ? { ...t, status: 'done' as const, doneAt: Date.now() }
            : t
        )
      )
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const d = await read($, data)
    const exp = await read($, expanded)
    const isLoading = await read($, loading)
    const ans = await read($, answering)
    const todoList = await read($, todos)
    const cols = e.props?.bodyColumns ?? 40

    const postes = d?.postes ?? []
    const questions = d?.questions ?? []
    const aValider = d?.aValider ?? []

    const qByTicket: Record<string, typeof questions> = {}
    const orphanQs: typeof questions = []
    for (const q of questions) {
      const match = postes.find(p => p.ticket === q.ticket)
      if (match) {
        ;(qByTicket[match.nom] ??= []).push(q)
      } else {
        orphanQs.push(q)
      }
    }

    const now = Date.now()
    const visibleTodos = todoList.filter(
      t => t.status === 'pending' || (t.doneAt && now - t.doneAt < 5 * 60 * 1000)
    )
    const pendingTodos = visibleTodos.filter(t => t.status === 'pending')
    const doneTodos = visibleTodos.filter(t => t.status === 'done')

    return (
      <Box flexDirection="column">

        {/* ── HEADER ── */}
        <Box>
          <Text color="green">●</Text>
          <Text bold> Agent Huddle</Text>
          <Text dimColor> {postes.length}</Text>
          {isLoading && <Text dimColor>  ⟳</Text>}
        </Box>

        {!d && (
          <Box marginTop={1}>
            <Text dimColor>{isLoading ? 'Chargement…' : 'Aucune donnée.'}</Text>
          </Box>
        )}

        {/* ── AGENT CARDS ── */}
        {postes.map(p => {
          const style = etatStyle(p.etat)
          const agentQs = qByTicket[p.nom] ?? []
          const hasQ = agentQs.length > 0
          const idle = p.etat === 'lot terminé' || p.etat === 'fermé'
          const borderCol = hasQ ? 'yellow' : style.color
          const isExp = exp[p.nom] === true

          return (
            <Box
              key={p.nom}
              flexDirection="column"
              marginTop={1}
              borderStyle="round"
              borderColor={borderCol as any}
              borderDimColor={idle && !hasQ}
              paddingLeft={1}
              paddingRight={1}
            >
              {/* Row 1: icon + name · action */}
              <Button
                key={`toggle-${p.nom}`}
                plain
                onPress={() => update($, expanded, prev => ({
                  ...prev,
                  [p.nom]: !prev[p.nom],
                }))}
              >
                {agentIcon(p.nom, p.action)} {idle
                  ? <Text dimColor>{p.nom}</Text>
                  : <Text bold>{p.nom}</Text>
                }
                {p.action && (idle
                  ? <Text dimColor> · dernier : {truncate(p.action, 22)}</Text>
                  : <Text dimColor> · {truncate(p.action, 28)}</Text>
                )}
              </Button>

              {/* Row 2: subtitle */}
              {hasQ ? (
                <Text color="yellow">asks a question</Text>
              ) : idle ? (
                <Text dimColor>{p.etat === 'lot terminé' ? '✓ lot terminé' : '⏹ fermé'}{p.depuis ? ` · ${p.depuis}` : ''}</Text>
              ) : (
                <Box>
                  {p.ticket && <Text dimColor>#{p.ticket}</Text>}
                  {p.depuis && <Text dimColor> {p.depuis}</Text>}
                </Box>
              )}

              {/* Row 3: progress bar (active only) */}
              {!idle && p.enFile != null && p.enFile > 0 && (
                <Box>
                  <Text color={style.color as any} bold>{progressBar(p.enFile, 8)}</Text>
                  <Text dimColor> file:{p.enFile}</Text>
                </Box>
              )}

              {/* Alert */}
              {p.alerte && (
                <Text color="red">⚠ {p.alerte}</Text>
              )}

              {/* Expanded: logs */}
              {isExp && p.dernieres && p.dernieres.length > 0 && (
                <Box flexDirection="column" marginTop={1}>
                  {p.dernieres.slice(-6).map((line, i) => (
                    <Text key={`log-${p.nom}-${i}`} dimColor maxLines={2}>
                      {line}
                    </Text>
                  ))}
                </Box>
              )}

              {/* Expanded: blocages */}
              {isExp && p.blocages && p.blocages.length > 0 && (
                <Box flexDirection="column">
                  {p.blocages.map((b, i) => (
                    <Text key={`blk-${p.nom}-${i}`} color="yellow">
                      ⛔ {b}
                    </Text>
                  ))}
                </Box>
              )}

              {/* Questions inside this agent's card */}
              {agentQs.map(q => (
                <Box key={`q-${q.ticket}`} flexDirection="column" marginTop={1} borderStyle="round" borderColor="yellow" paddingLeft={1} paddingRight={1}>
                  <Text bold color="yellow">{q.sujet?.toUpperCase() ?? 'QUESTION'}</Text>
                  <Text>{q.question}</Text>
                  {q.options && q.options.length > 0 ? (
                    <Box flexDirection="column" marginTop={1}>
                      {q.options.map(opt => {
                        const isAnswering = ans === `${q.ticket}:${opt.cle}`
                        return (
                          <Button
                            key={`opt-${q.ticket}-${opt.cle}`}
                            onPress={() => answerQuestion($, q.ticket, opt.cle)}
                          >
                            {isAnswering ? '⟳' : '○'} {opt.texte}{opt.recommandee ? ' ★' : ''}
                          </Button>
                        )
                      })}
                    </Box>
                  ) : (
                    <Text dimColor>(à reformuler en QCM)</Text>
                  )}
                </Box>
              ))}

              {/* Expand chevron */}
              <Text dimColor>{isExp ? '▾' : '▸'}</Text>
            </Box>
          )
        })}

        {/* Orphan questions (not tied to any agent) */}
        {orphanQs.length > 0 && (
          <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="yellow" paddingLeft={1} paddingRight={1}>
            <Text bold color="yellow">Questions en attente</Text>
            {orphanQs.map(q => (
              <Box key={`oq-${q.ticket}`} flexDirection="column" marginTop={1}>
                <Text bold>#{q.ticket}</Text>
                <Text>{q.question}</Text>
                {q.options && q.options.length > 0 ? (
                  <Box flexDirection="column">
                    {q.options.map(opt => {
                      const isAnswering = ans === `${q.ticket}:${opt.cle}`
                      return (
                        <Button
                          key={`opt-${q.ticket}-${opt.cle}`}
                          onPress={() => answerQuestion($, q.ticket, opt.cle)}
                        >
                          {isAnswering ? '⟳' : '○'} {opt.texte}{opt.recommandee ? ' ★' : ''}
                        </Button>
                      )
                    })}
                  </Box>
                ) : (
                  <Text dimColor>(à reformuler en QCM)</Text>
                )}
              </Box>
            ))}
          </Box>
        )}

        {/* À valider */}
        {aValider.length > 0 && (
          <Box marginTop={1}>
            <Text dimColor>À valider : {aValider.length} ticket{aValider.length > 1 ? 's' : ''}</Text>
          </Box>
        )}

        {/* Erreur file */}
        {d?.erreurFile && (
          <Box marginTop={1}>
            <Text color="red">⚠ File : {d.erreurFile}</Text>
          </Box>
        )}

        {/* ── SÉPARATEUR ── */}
        <Box marginTop={1}>
          <Text dimColor>{'─'.repeat(Math.min(cols, 30))}</Text>
        </Box>

        {/* ── SECTION BASSE : À faire ── */}
        <Box flexDirection="column" marginTop={1}>
          <Text bold>À faire{pendingTodos.length > 0 ? ` (${pendingTodos.length})` : ''}</Text>
          {visibleTodos.length === 0 && (
            <Text dimColor>Rien en cours.</Text>
          )}
          {pendingTodos.map(t => (
            <Box key={t.id} paddingLeft={1}>
              <Button
                key={`done-${t.id}`}
                plain
                onPress={() => update($, todos, list =>
                  list.map(x => x.id === t.id ? { ...x, status: 'done' as const, doneAt: Date.now() } : x)
                )}
              >
                ○ {t.text}
              </Button>
            </Box>
          ))}
          {doneTodos.map(t => (
            <Box key={t.id} paddingLeft={1}>
              <Button
                key={`rm-${t.id}`}
                plain
                onPress={() => update($, todos, list => list.filter(x => x.id !== t.id))}
              >
                <Text dimColor strikethrough>● {t.text}</Text>
              </Button>
            </Box>
          ))}
        </Box>

        {/* Bouton rafraîchir */}
        <Box marginTop={1}>
          <Button key="refresh" onPress={() => fetchFull($)}>
            Rafraîchir
          </Button>
        </Box>
      </Box>
    )
  })
}
