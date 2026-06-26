# 📦 Leitner Russe

Application web (PWA) de **flashcards russes** utilisant le **système Leitner**
(répétition espacée). Installable sur iPhone, fonctionne hors-ligne, sauvegarde
automatique dans le navigateur. Interface entièrement en français.

> Construite avec **Vite + React**, sans aucune autre dépendance.
> Déploiement automatique sur **GitHub Pages** à chaque push sur `main`.

---

## 🌐 URL de l’application

Une fois GitHub Pages activé (voir plus bas), l’application est disponible à :

```
https://<votre-utilisateur>.github.io/leitner-russe/
```

Pour ce dépôt (`workservice38-design/leitner-russe`) :

```
https://workservice38-design.github.io/leitner-russe/
```

---

## ✨ Fonctionnalités

- **Système Leitner à 5 boîtes** : une bonne réponse fait monter la carte d’une
  boîte (max. 5), une mauvaise la renvoie en boîte 1.
  - Boîte 1 : chaque jour · Boîte 2 : tous les 3 jours · Boîte 3 : chaque
    semaine · Boîte 4 : tous les 15 jours · Boîte 5 : chaque mois.
- **Paquets russes préchargés**, importables individuellement :
  alphabet cyrillique (33 lettres), formules de politesse (20), jours de la
  semaine (7), mois (12), chiffres 0-20 (21), dizaines 30-100 (8),
  couleurs (12), orientation / points cardinaux (8).
- **Cartes personnalisées** (question / réponse / phonétique).
- **Deux modes de révision** :
  - **Flip** : carte à retourner, puis « ✗ Raté » / « ✓ Su ».
  - **Écriture** : on tape la réponse (clavier russe). En cas d’erreur, la bonne
    réponse s’affiche et on retape la même carte (« 🔄 Réessayer ») jusqu’à la
    réussir — ou on la « Passe » (retour en boîte 1).
- **Audio russe** via la Web Speech API (voix `ru-RU`, débit ralenti, priorité
  aux voix de qualité type *Milena* / *Premium* / *Enhanced* sur iOS).
- **Écran d’accueil** : compteur de cartes à réviser, grille des boîtes,
  barre de progression (% maîtrisé = boîtes 4-5), prochaines échéances.
- **Sauvegarde / restauration** par code base64 (pour changer d’appareil), en
  plus de la sauvegarde automatique `localStorage`.
- **PWA hors-ligne** : `manifest.json` + service worker.

---

## 📱 Ajouter l’app à l’écran d’accueil de l’iPhone

1. Ouvrir l’URL de l’application dans **Safari** (et non Chrome).
2. Toucher le bouton **Partager** (le carré avec une flèche vers le haut).
3. Choisir **« Sur l’écran d’accueil »**.
4. Valider avec **« Ajouter »**.

L’icône 📦 apparaît alors sur l’écran d’accueil. L’app s’ouvre en plein écran et
fonctionne hors-ligne après le premier chargement.

---

## ⚙️ Activer GitHub Pages

Le déploiement est automatisé par le workflow `.github/workflows/deploy.yml`.
Il faut activer Pages **une seule fois** :

1. Aller dans **Settings** (Réglages) du dépôt.
2. Menu de gauche → **Pages**.
3. Section **Build and deployment** → **Source** → choisir **GitHub Actions**.
4. Faire un push sur `main` (ou relancer le workflow depuis l’onglet
   **Actions**). Le site sera publié à l’URL ci-dessus en quelques minutes.

> ℹ️ Le `base` est configuré sur `/leitner-russe/` dans `vite.config.js`. Si vous
> renommez le dépôt, mettez à jour cette valeur en conséquence.

---

## 🛠 Développement local

```bash
npm install      # installer les dépendances
npm run dev      # serveur de développement (http://localhost:5173)
npm run build    # build de production dans dist/
npm run preview  # prévisualiser le build
```

> Le service worker n’est actif qu’en build de production (`build` + `preview`),
> pas en mode `dev`.

### Régénérer les icônes

Les icônes (`public/icon-512.png`, `public/icon-192.png`) sont générées par un
petit script sans dépendance :

```bash
python3 scripts/gen_icons.py
```

---

## 📂 Structure

```
.
├── .github/workflows/deploy.yml   # déploiement GitHub Pages
├── public/
│   ├── manifest.json              # manifeste PWA
│   ├── sw.js                      # service worker (offline)
│   ├── icon-512.png / icon-192.png
├── scripts/gen_icons.py           # générateur d’icônes
├── src/
│   ├── App.jsx                    # toute l’application (vues conditionnelles)
│   ├── data.js                    # paquets russes + config des boîtes
│   ├── styles.css                 # thème sombre, mobile-first
│   └── main.jsx                   # point d’entrée + enregistrement du SW
├── index.html
└── vite.config.js                 # base = /leitner-russe/
```
