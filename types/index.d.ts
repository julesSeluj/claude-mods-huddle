export type Poste = {
  nom: string
  etat: string
  ticket: string | null
  action: string | null
  depuis: string | null
  enFile: number | null
  blocages: string[] | null
  dernieres: string[] | null
  alerte: string | null
}

export type QuestionOption = {
  cle: string
  texte: string
  recommandee?: boolean
}

export type Question = {
  ticket: string
  titre: string
  statut: string
  sujet: string
  question: string
  options: QuestionOption[] | null
}

export type HuddleData = {
  releve: string | null
  postes: Poste[]
  questions: Question[]
  aValider: number[] | string[]
  erreurFile: string | null
}

export type ExpandedMap = Record<string, boolean>

export type TodoItem = {
  id: string
  text: string
  turnId: string
  status: 'pending' | 'done'
  createdAt: number
  doneAt?: number
}

export type SessionAgent = {
  id: string
  name: string
  description: string
  type: string
  status: 'running' | 'done'
  startedAt: number
  doneAt?: number
  answer?: string
}

declare module 'claude-code' {
  interface PluginState {
    huddle: {
      data: Shaped<HuddleData | null>
      expanded: Shaped<ExpandedMap>
      loading: Shaped<boolean>
      lastFetch: Shaped<number>
      answering: Shaped<string | null>
      todos: Shaped<TodoItem[]>
      sessionAgents: Shaped<SessionAgent[]>
    }
  }
}
