import { useEffect, useMemo, useRef, useState } from 'react'
import { DECKS, BOXES, boxConfig } from './data.js'

/* ---------- Constantes & utilitaires ---------- */

const STORAGE_KEY = 'leitner-russe:cards:v1'
const DAY = 86400000

const uid = () =>
  (crypto.randomUUID && crypto.randomUUID()) ||
  `${Date.now()}-${Math.random().toString(36).slice(2)}`

const isDue = (card, now) => !card.nextReview || card.nextReview <= now

const shuffle = (arr) => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Texte russe à prononcer pour une carte.
const speakable = (card) => card.audio || card.a

const normalize = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/[.,!?;:…«»"'()]/g, '')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim()

// Réponse correcte si l'entrée correspond à la réponse complète
// ou à l'une des variantes séparées par « / ».
const matchesAnswer = (input, answer) => {
  const n = normalize(input)
  if (!n) return false
  if (n === normalize(answer)) return true
  return answer.split('/').some((v) => normalize(v) === n)
}

const daysUntil = (ts, now) => Math.max(1, Math.ceil((ts - now) / DAY))

// Comparaison d'un caractère (insensible à la casse, ё = е).
const charEq = (a, b) =>
  a.toLowerCase().replace('ё', 'е') === b.toLowerCase().replace('ё', 'е')

// Statut de chaque caractère tapé ('ok' | 'bad') pour la coloration en direct.
// On choisit la variante de réponse (séparée par « / ») la mieux amorcée.
const charStatuses = (input, answer) => {
  const variants = answer.split('/').map((v) => v.trim()).filter(Boolean)
  let best = variants[0] || ''
  let bestScore = -1
  for (const v of variants) {
    let score = 0
    for (let i = 0; i < input.length && i < v.length; i++) {
      if (charEq(input[i], v[i])) score++
      else break
    }
    if (score > bestScore) {
      bestScore = score
      best = v
    }
  }
  return [...input].map((ch, i) =>
    i < best.length && charEq(ch, best[i]) ? 'ok' : 'bad'
  )
}

/* ---------- Audio (Web Speech API) ---------- */

let VOICES = []
const refreshVoices = () => {
  if ('speechSynthesis' in window) VOICES = window.speechSynthesis.getVoices() || []
}
if ('speechSynthesis' in window) {
  refreshVoices()
  window.speechSynthesis.onvoiceschanged = refreshVoices
}

const pickRussianVoice = () => {
  const ru = VOICES.filter((v) => v.lang && v.lang.toLowerCase().startsWith('ru'))
  if (!ru.length) return null
  const byName = (kw) => ru.find((v) => v.name.toLowerCase().includes(kw))
  return (
    byName('milena') ||
    byName('premium') ||
    byName('enhanced') ||
    ru.find((v) => v.localService) ||
    ru[0]
  )
}

const speak = (text) => {
  if (!('speechSynthesis' in window) || !text) return
  try {
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'ru-RU'
    u.rate = 0.8
    const v = pickRussianVoice()
    if (v) u.voice = v
    window.speechSynthesis.speak(u)
  } catch {
    /* ignore */
  }
}

/* ---------- Encodage export / import ---------- */

const encodeState = (cards) =>
  btoa(unescape(encodeURIComponent(JSON.stringify(cards))))
const decodeState = (code) =>
  JSON.parse(decodeURIComponent(escape(atob(code.trim()))))

/* ---------- Persistance ---------- */

const loadCards = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/* ---------- Composant principal ---------- */

export default function App() {
  const [cards, setCards] = useState(loadCards)
  const [view, setView] = useState('home') // home | review | decks | all | add
  const [session, setSession] = useState(null) // { mode, ids, pos }
  const [toast, setToast] = useState(null) // { msg, actionLabel, action }
  const toastTimer = useRef(null)

  // Sauvegarde automatique à chaque changement.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cards))
    } catch {
      /* quota / mode privé */
    }
  }, [cards])

  const now = Date.now()
  const dueCards = useMemo(() => cards.filter((c) => isDue(c, now)), [cards, now])

  const showToast = (msg, actionLabel, action) => {
    clearTimeout(toastTimer.current)
    setToast({ msg, actionLabel, action })
    toastTimer.current = setTimeout(() => setToast(null), 5000)
  }

  /* ----- Mutations sur les cartes ----- */

  const gradeCard = (id, correct) => {
    const t = Date.now()
    setCards((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c
        const newBox = correct ? Math.min(c.box + 1, 5) : 1
        return {
          ...c,
          box: newBox,
          lastReview: t,
          nextReview: t + boxConfig(newBox).intervalDays * DAY,
        }
      })
    )
  }

  const importDeck = (deck) => {
    setCards((prev) => {
      const existing = new Set(
        prev.filter((c) => c.deckId === deck.id).map((c) => c.q)
      )
      const toAdd = deck.cards
        .filter((c) => !existing.has(c.q))
        .map((c) => ({
          id: uid(),
          deckId: deck.id,
          deckName: deck.name,
          q: c.q,
          a: c.a,
          p: c.p || '',
          audio: c.audio || '',
          box: 1,
          lastReview: null,
          nextReview: null,
        }))
      if (!toAdd.length) {
        showToast('Paquet déjà importé')
        return prev
      }
      showToast(`${toAdd.length} carte(s) ajoutée(s) — ${deck.name}`)
      return [...prev, ...toAdd]
    })
  }

  const addCustomCard = (q, a, p) => {
    setCards((prev) => [
      ...prev,
      {
        id: uid(),
        deckId: 'perso',
        deckName: 'Cartes personnalisées',
        q,
        a,
        p,
        audio: '',
        box: 1,
        lastReview: null,
        nextReview: null,
      },
    ])
    showToast('Carte ajoutée')
  }

  const deleteCard = (id) => {
    const card = cards.find((c) => c.id === id)
    if (!card) return
    setCards((prev) => prev.filter((c) => c.id !== id))
    showToast('Carte supprimée', 'Annuler', () => {
      setCards((prev) => [...prev, card])
      setToast(null)
    })
  }

  /* ----- Session de révision ----- */

  // pool = cartes à réviser ; par défaut les cartes dues du jour.
  const startSession = (mode, pool = dueCards) => {
    const ids = shuffle(pool.map((c) => c.id))
    if (!ids.length) {
      showToast('Aucune carte à réviser pour le moment')
      return
    }
    setSession({ mode, ids, pos: 0 })
    setView('review')
  }

  // Révision ciblée d'un seul paquet (toutes ses cartes).
  const startDeckSession = (deckId, mode) =>
    startSession(mode, cards.filter((c) => c.deckId === deckId))

  const endSession = () => {
    setSession(null)
    setView('home')
  }

  /* ----- Rendu ----- */

  return (
    <div className="app">
      <Brand />

      {view === 'home' && (
        <Home
          cards={cards}
          dueCards={dueCards}
          now={now}
          onReview={() => startSession('flip')}
          onWrite={() => startSession('write')}
          onSpeak={speak}
          go={setView}
        />
      )}

      {view === 'review' && session && (
        <Review
          session={session}
          setSession={setSession}
          cards={cards}
          gradeCard={gradeCard}
          onEnd={endSession}
        />
      )}

      {view === 'decks' && (
        <Decks
          cards={cards}
          onImport={importDeck}
          onStudy={startDeckSession}
          back={() => setView('home')}
        />
      )}

      {view === 'all' && (
        <AllCards
          cards={cards}
          onDelete={deleteCard}
          back={() => setView('home')}
          onExport={() => {
            const code = encodeState(cards)
            navigator.clipboard?.writeText(code).then(
              () => showToast('Code copié dans le presse-papier'),
              () => showToast('Copie impossible — sélectionnez le texte')
            )
            return code
          }}
          onImportCode={(code) => {
            try {
              const data = decodeState(code)
              if (!Array.isArray(data)) throw new Error('format')
              setCards(data)
              showToast(`${data.length} carte(s) restaurée(s)`)
              return true
            } catch {
              showToast('Code invalide')
              return false
            }
          }}
        />
      )}

      {view === 'add' && (
        <AddCard onAdd={addCustomCard} back={() => setView('home')} />
      )}

      {toast && (
        <div className="toast" onClick={() => !toast.action && setToast(null)}>
          {toast.msg}
          {toast.action && (
            <button
              className="btn-sm btn-primary"
              style={{ marginLeft: 12 }}
              onClick={toast.action}
            >
              {toast.actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/* ---------- En-tête ---------- */

function Brand() {
  return (
    <div className="brand">
      <div className="logo">📦</div>
      <div>
        <h1 className="gradient-text">Leitner Russe</h1>
        <small>Mémorise le russe par répétition espacée</small>
      </div>
    </div>
  )
}

/* ---------- Accueil ---------- */

function Home({ cards, dueCards, now, onReview, onWrite, onSpeak, go }) {
  const total = cards.length
  const mastered = cards.filter((c) => c.box >= 4).length
  const pct = total ? Math.round((mastered / total) * 100) : 0

  // Compteur de cartes dues par boîte.
  const dueByBox = [0, 0, 0, 0, 0]
  const countByBox = [0, 0, 0, 0, 0]
  cards.forEach((c) => {
    countByBox[c.box - 1]++
    if (isDue(c, now)) dueByBox[c.box - 1]++
  })

  // Prochaines échéances par boîte (cartes non dues).
  const upcoming = BOXES.map((b) => {
    const inBox = cards.filter((c) => c.box === b.box && !isDue(c, now))
    if (!inBox.length) return null
    const soonest = Math.min(...inBox.map((c) => c.nextReview))
    return { box: b.box, color: b.color, count: inBox.length, days: daysUntil(soonest, now) }
  }).filter(Boolean)

  return (
    <>
      {total === 0 ? (
        <div className="banner">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Bienvenue 👋</div>
          <div className="muted" style={{ marginBottom: 12 }}>
            Aucune carte pour l’instant. Commence par importer un paquet russe.
          </div>
          <button className="btn-primary btn-block" onClick={() => go('decks')}>
            📚 Choisir des paquets
          </button>
        </div>
      ) : dueCards.length > 0 ? (
        <div className="banner">
          <div className="count gradient-text">{dueCards.length}</div>
          <div style={{ marginBottom: 14 }}>
            carte{dueCards.length > 1 ? 's' : ''} à réviser aujourd’hui
          </div>
          <div className="row">
            <button className="btn-primary" onClick={onReview}>
              👁 Réviser
            </button>
            <button className="btn-ghost" onClick={onWrite}>
              ✏️ Écrire
            </button>
          </div>
        </div>
      ) : (
        <div className="banner allgood">
          <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 8 }}>
            ✅ Tout est à jour
          </div>
          {upcoming.length > 0 ? (
            <div className="muted">
              {upcoming.map((u) => (
                <div key={u.box} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 4, background: u.color, display: 'inline-block' }} />
                  Boîte {u.box} — {u.count} carte{u.count > 1 ? 's' : ''} dans {u.days}j
                </div>
              ))}
            </div>
          ) : (
            <div className="muted">Importe d’autres paquets pour continuer.</div>
          )}
        </div>
      )}

      {total > 0 && (
        <>
          <div className="progress">
            <div className="label">
              <span>Maîtrisé (boîtes 4-5)</span>
              <span>{pct}%</span>
            </div>
            <div className="bar">
              <div className="fill" style={{ width: `${pct}%` }} />
            </div>
          </div>

          <div className="boxes">
            {BOXES.map((b, i) => (
              <div key={b.box} className="box-cell" style={{ background: b.color }}>
                {dueByBox[i] > 0 && <span className="due">{dueByBox[i]}</span>}
                <div className="n">Boîte {b.box}</div>
                <div className="c">{countByBox[i]}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="row wrap" style={{ marginTop: 16 }}>
        <button className="btn-ghost" onClick={() => go('decks')}>
          📚 Paquets
        </button>
        <button className="btn-ghost" onClick={() => go('all')}>
          🗂 Toutes les cartes
        </button>
      </div>
      <div className="spacer" />
      <button className="btn-ghost btn-block" onClick={() => go('add')}>
        ＋ Ajouter une carte
      </button>
    </>
  )
}

/* ---------- Révision (flip + écriture) ---------- */

function Review({ session, setSession, cards, gradeCard, onEnd }) {
  const { mode, ids, pos } = session
  const [flipped, setFlipped] = useState(false)
  const [input, setInput] = useState('')
  const [status, setStatus] = useState('idle') // idle | correct | wrong
  const inputRef = useRef(null)
  const advancedRef = useRef(false) // évite la double notation en mode flip

  const card = cards.find((c) => c.id === ids[pos])
  const finished = pos >= ids.length

  // Réinitialise l'état à chaque nouvelle carte.
  useEffect(() => {
    setFlipped(false)
    setInput('')
    setStatus('idle')
    advancedRef.current = false
    if (mode === 'write' && inputRef.current) inputRef.current.focus()
  }, [pos, mode])

  if (finished) {
    return (
      <div className="done-screen">
        <div className="emoji">🎉</div>
        <h2 className="gradient-text">Session terminée !</h2>
        <p className="muted">
          {ids.length} carte{ids.length > 1 ? 's' : ''} révisée{ids.length > 1 ? 's' : ''}.
        </p>
        <div className="spacer" />
        <button className="btn-primary btn-block" onClick={onEnd}>
          ← Retour au menu
        </button>
      </div>
    )
  }

  // Carte supprimée entre-temps : on saute.
  if (!card) {
    return (
      <div className="done-screen">
        <button className="btn-primary" onClick={onEnd}>← Menu</button>
      </div>
    )
  }

  const advance = () => setSession((s) => ({ ...s, pos: s.pos + 1 }))

  /* --- Mode FLIP --- */
  const onFlipGrade = (correct) => {
    if (advancedRef.current) return
    advancedRef.current = true
    gradeCard(card.id, correct)
    advance()
  }

  /* --- Mode ÉCRITURE --- */
  const validate = () => {
    if (matchesAnswer(input, card.a)) {
      gradeCard(card.id, true)
      setStatus('correct')
      speak(speakable(card))
    } else {
      setStatus('wrong')
      speak(speakable(card))
    }
  }
  const dontKnow = () => {
    setStatus('wrong')
    speak(speakable(card))
  }
  const retry = () => {
    setStatus('idle')
    setInput('')
    if (inputRef.current) inputRef.current.focus()
  }
  const skip = () => {
    // renvoie la carte en boîte 1 et passe à la suivante
    gradeCard(card.id, false)
    advance()
  }

  return (
    <>
      <div className="topbar">
        <button className="btn-sm btn-ghost" onClick={onEnd}>
          ← Menu
        </button>
        <div className="counter">
          {pos + 1} / {ids.length}
        </div>
        <div style={{ width: 60 }} />
      </div>

      {mode === 'flip' ? (
        <>
          <div className="flash" onClick={() => setFlipped((f) => !f)}>
            <div className={`flash-inner${flipped ? ' flipped' : ''}`}>
              <div className="flash-face front">
                <div className="big">{card.q}</div>
                <div className="hint">Touchez la carte pour la retourner</div>
              </div>
              <div className="flash-face back">
                <div className="ru">{card.a}</div>
                {card.p && <div className="phon">{card.p}</div>}
                <button
                  className="btn-icon"
                  style={{ marginTop: 14 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    speak(speakable(card))
                  }}
                >
                  🔊
                </button>
              </div>
            </div>
          </div>

          {flipped ? (
            <div className="row">
              <button className="btn-ko" onClick={() => onFlipGrade(false)}>
                ✗ Raté
              </button>
              <button className="btn-ok" onClick={() => onFlipGrade(true)}>
                ✓ Su
              </button>
            </div>
          ) : (
            <button className="btn-primary btn-block" onClick={() => setFlipped(true)}>
              Voir la réponse
            </button>
          )}
        </>
      ) : (
        <>
          <div className="write-prompt">
            <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
              Écris en russe :
            </div>
            <div className="big">{card.q}</div>
          </div>

          {status === 'idle' && (
            <>
              <div className="write-field">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  lang="ru"
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Tape ta réponse…"
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && input.trim() && validate()}
                />
                {/* Calque coloré : vert = lettre correcte, rouge = erreur. */}
                <div className="write-overlay" aria-hidden="true">
                  {charStatuses(input, card.a).map((st, i) => (
                    <span key={i} className={st}>
                      {input[i]}
                    </span>
                  ))}
                </div>
              </div>
              <div className="spacer" />
              <button
                className="btn-primary btn-block"
                disabled={!input.trim()}
                onClick={validate}
              >
                Valider
              </button>
              <div className="spacer" />
              <button className="btn-ghost btn-block" onClick={dontKnow}>
                Je ne sais pas
              </button>
            </>
          )}

          {status === 'correct' && (
            <>
              <div className="feedback ok">
                <div style={{ fontWeight: 700, marginBottom: 6 }}>✅ Correct !</div>
                <div className="ru">{card.a}</div>
                {card.p && <div className="phon">{card.p}</div>}
                <button
                  className="btn-icon"
                  style={{ marginTop: 10 }}
                  onClick={() => speak(speakable(card))}
                >
                  🔊
                </button>
              </div>
              <button className="btn-primary btn-block" onClick={advance}>
                Suivante →
              </button>
            </>
          )}

          {status === 'wrong' && (
            <>
              <div className="feedback ko">
                <div style={{ fontWeight: 700, marginBottom: 6 }}>La bonne réponse :</div>
                <div className="ru">{card.a}</div>
                {card.p && <div className="phon">{card.p}</div>}
                <button
                  className="btn-icon"
                  style={{ marginTop: 10 }}
                  onClick={() => speak(speakable(card))}
                >
                  🔊
                </button>
              </div>
              <button className="btn-primary btn-block" onClick={retry}>
                🔄 Réessayer
              </button>
              <div className="spacer" />
              <button className="btn-ghost btn-block" onClick={skip}>
                Passer (→ boîte 1)
              </button>
            </>
          )}
        </>
      )}
    </>
  )
}

/* ---------- Paquets ---------- */

function Decks({ cards, onImport, onStudy, back }) {
  return (
    <>
      <div className="topbar">
        <button className="btn-sm btn-ghost" onClick={back}>
          ← Menu
        </button>
        <h2>Paquets</h2>
        <div style={{ width: 60 }} />
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Importe les paquets que tu veux apprendre, puis révise-les un par un.
        Les cartes déjà présentes ne sont pas dupliquées.
      </p>

      {DECKS.map((deck) => {
        const imported = cards.filter((c) => c.deckId === deck.id).length
        const allIn = imported >= deck.cards.length
        return (
          <div key={deck.id} className="deck-item">
            <div className="head">
              <div>
                <div className="name">{deck.name}</div>
                <div className="meta">
                  {deck.cards.length} cartes
                  {imported > 0 && ` · ${imported} importée(s)`}
                </div>
              </div>
              <button
                className={allIn ? 'btn-ghost btn-sm' : 'btn-primary btn-sm'}
                onClick={() => onImport(deck)}
                disabled={allIn}
              >
                {allIn ? '✓ Importé' : 'Importer'}
              </button>
            </div>

            {/* Révision ciblée de ce paquet (visible dès qu'il est importé). */}
            {imported > 0 && (
              <div className="row" style={{ marginTop: 12 }}>
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => onStudy(deck.id, 'flip')}
                >
                  👁 Réviser ce paquet
                </button>
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => onStudy(deck.id, 'write')}
                >
                  ✏️ Écrire
                </button>
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

/* ---------- Toutes les cartes + export/import ---------- */

function AllCards({ cards, onDelete, back, onExport, onImportCode }) {
  const [tool, setTool] = useState(null) // 'export' | 'import'
  const [exportCode, setExportCode] = useState('')
  const [importCode, setImportCode] = useState('')

  const groups = useMemo(() => {
    const m = new Map()
    cards.forEach((c) => {
      if (!m.has(c.deckName)) m.set(c.deckName, [])
      m.get(c.deckName).push(c)
    })
    return [...m.entries()]
  }, [cards])

  return (
    <>
      <div className="topbar">
        <button className="btn-sm btn-ghost" onClick={back}>
          ← Menu
        </button>
        <h2>Toutes les cartes</h2>
        <div style={{ width: 60 }} />
      </div>

      <div className="row">
        <button
          className="btn-ghost btn-sm"
          onClick={() => {
            setTool(tool === 'export' ? null : 'export')
            setExportCode(onExport())
          }}
        >
          💾 Sauvegarde
        </button>
        <button
          className="btn-ghost btn-sm"
          onClick={() => setTool(tool === 'import' ? null : 'import')}
        >
          ♻️ Restaurer
        </button>
      </div>

      {tool === 'export' && (
        <div style={{ margin: '12px 0' }}>
          <p className="muted" style={{ fontSize: 13 }}>
            Code de sauvegarde (copié automatiquement). Colle-le sur un autre
            appareil pour transférer tes cartes.
          </p>
          <textarea readOnly value={exportCode} onFocus={(e) => e.target.select()} />
        </div>
      )}

      {tool === 'import' && (
        <div style={{ margin: '12px 0' }}>
          <p className="muted" style={{ fontSize: 13 }}>
            Colle ici un code de sauvegarde. ⚠️ Cela remplacera toutes tes cartes
            actuelles.
          </p>
          <textarea
            value={importCode}
            onChange={(e) => setImportCode(e.target.value)}
            placeholder="Colle le code ici…"
          />
          <div className="spacer" />
          <button
            className="btn-primary btn-block"
            disabled={!importCode.trim()}
            onClick={() => {
              if (onImportCode(importCode)) {
                setImportCode('')
                setTool(null)
              }
            }}
          >
            Restaurer
          </button>
        </div>
      )}

      {cards.length === 0 && (
        <p className="muted center" style={{ marginTop: 30 }}>
          Aucune carte. Importe un paquet depuis « Paquets ».
        </p>
      )}

      {groups.map(([name, list]) => (
        <div key={name}>
          <div className="section-title">
            {name} ({list.length})
          </div>
          {list.map((c) => {
            const color = boxConfig(c.box).color
            return (
              <div
                key={c.id}
                className="card-list-item"
                style={{ borderLeftColor: color }}
              >
                <div className="body">
                  <div className="q">{c.q}</div>
                  <div className="a">{c.a}</div>
                  {c.p && <div className="p">{c.p}</div>}
                </div>
                <button className="btn-icon" onClick={() => speak(speakable(c))}>
                  🔊
                </button>
                <button className="btn-icon" onClick={() => onDelete(c.id)}>
                  🗑
                </button>
              </div>
            )
          })}
        </div>
      ))}
    </>
  )
}

/* ---------- Ajout d'une carte ---------- */

function AddCard({ onAdd, back }) {
  const [q, setQ] = useState('')
  const [a, setA] = useState('')
  const [p, setP] = useState('')

  const submit = () => {
    if (!q.trim() || !a.trim()) return
    onAdd(q.trim(), a.trim(), p.trim())
    setQ('')
    setA('')
    setP('')
  }

  return (
    <>
      <div className="topbar">
        <button className="btn-sm btn-ghost" onClick={back}>
          ← Menu
        </button>
        <h2>Nouvelle carte</h2>
        <div style={{ width: 60 }} />
      </div>

      <div className="field">
        <label>Question (français)</label>
        <input className="small" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex : Maison" />
      </div>
      <div className="field">
        <label>Réponse (russe)</label>
        <input className="small" type="text" lang="ru" value={a} onChange={(e) => setA(e.target.value)} placeholder="Ex : Дом" />
      </div>
      <div className="field">
        <label>Phonétique (optionnel)</label>
        <input className="small" type="text" value={p} onChange={(e) => setP(e.target.value)} placeholder="Ex : dom" />
      </div>

      <div className="spacer" />
      <button className="btn-primary btn-block" disabled={!q.trim() || !a.trim()} onClick={submit}>
        Ajouter la carte
      </button>
    </>
  )
}
