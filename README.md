# Apéro Time 🍻

**Apéro Time** affiche le compte à rebours avant l'apéro dans ton fuseau horaire, et montre sur une carte du monde où l'apéro a déjà commencé — avec l'alcool local de chaque ville.

![Apéro Time Screenshot](img/image.png)

---

## 🌟 Fonctionnalités (v2.0.0)

- **Style cyberpunk** : enseigne néon, pluie, lignes CRT, grésillement, glitch au changement d'étape.
- **Personnalisation avancée** (tiroir « Réglages », sauvegardée dans le navigateur) :
  - 5 thèmes (Nuit d'Akihabara, Synthwave, Terminal, Arasaka, Néo-Kyoto) + couleurs libres ;
  - police de l'enseigne, intensité du néon, effets activables un par un ;
  - heure de l'apéro, fuseau de référence (navigateur ou n'importe quelle ville), horloge 12/24 h ;
  - GIF personnalisé par étape, quantité de confettis, bip des 10 dernières secondes ;
  - export / import des réglages en JSON, réinitialisation.
- **Carte interactive** (Leaflet) : 113 villes dans 46 pays, chacune avec son propre fuseau. Néon magenta = apéro en cours, cyan = pas encore. Zone de nuit en temps réel. Clic sur une ville → heure locale, alcool, et « Suivre ce fuseau ».
- **GIF contextualisé** selon le temps restant (7 étapes : plus de 6 h, 3–6 h, 1–3 h, 15 min–1 h, moins de 15 min, apéro en cours, dernière heure). Via GIPHY si une clé est configurée, sinon emoji animé.
- **Explosion de confettis** quand le compte à rebours atteint 00:00:00 (avec l'emoji de l'alcool local, et un accord sonore si activé).
- **Alcool local** par ville (pastis à Marseille, Kölsch à Cologne, Fernet con Coca à Córdoba…), avec repli sur l'alcool emblématique du pays.
- Sécurité : CSP stricte (aucun script tiers, Leaflet est embarqué), clé GIPHY côté serveur uniquement, conteneur non-root en lecture seule.

---

## 🛠 Technologies

- **Backend** : Python 3.12, Flask 3, Gunicorn, `zoneinfo` (stdlib) + `tzdata`
- **Frontend** : HTML, CSS, JavaScript (modules ES, sans build), Leaflet 1.9.4 + Leaflet.Terminator (embarqués dans `static/vendor/`)
- **Fonds de carte** : CARTO `dark_nolabels` (© OpenStreetMap, © CARTO)
- **Conteneurisation** : Docker, Docker Compose, Traefik

---

## 💻 Installation locale

```bash
git clone https://github.com/PatateVolante/Apero_Time.git
cd Apero_Time
pip install -r requirements-dev.txt
python app.py                  # http://localhost:5001
pytest                         # tests
```

---

## ⚙ Configuration (variables d'environnement)

| Variable | Défaut | Rôle |
|---|---|---|
| `APERO_HOUR` | `18` | Heure de début de l'apéro (0–23). Modifiable aussi par chaque visiteur dans les réglages. |
| `APERO_END_HOUR` | `24` | Fin de l'apéro (`24` = minuit). Sert à « Dernière tournée ». |
| `GIPHY_API_KEY` | *(vide)* | Clé API GIPHY pour les GIF contextualisés. Sans clé : emoji animé. |
| `GIPHY_RATING` | `pg` | Filtre de contenu GIPHY (`g`, `pg`, `pg-13`, `r`). |
| `CORS_ORIGINS` | `https://apero.mars.patatevolante.fr` | Origines autorisées sur `/api/*` (séparées par des virgules). |

Clé GIPHY : créer une app sur [developers.giphy.com](https://developers.giphy.com/), puis la mettre dans un fichier `.env` à côté du `docker-compose.yml` (voir `.env.example`). Les résultats sont mis en cache 1 h par étape pour ménager le quota.

---

## 🐳 Docker

```bash
docker compose build
docker compose up -d
```

> Changement par rapport à la v1 : le code n'est plus monté en volume (`.:/app`), le conteneur tourne en lecture seule. Après un `git pull`, refaire `docker compose up -d --build`.

---

## 🔌 API

| Route | Description |
|---|---|
| `GET /api/apero-time?timezone=Europe/Paris&hour=18` | Statut dans le fuseau demandé (`me`), ville mise en avant (`apero_now_city`, stable sur l'heure), statut des 113 villes (`cities`). Les champs v1 `is_apero_time` et `apero_now_city` sont conservés. |
| `GET /api/gif?stage=live` | GIF pour une étape (`far`, `waiting`, `soon`, `close`, `final`, `live`, `lastcall`). |
| `GET /healthz` | Sonde de santé. |

---

## 🎨 Personnalisation du code

- **Ajouter une ville** : une ligne dans `_RAW` de `cities.py` (ville, pays, code ISO, fuseau IANA, lat, lon, alcool ou `None` pour l'alcool du pays). Le test `test_all_city_timezones_exist` vérifie le fuseau.
- **Alcool d'un pays** : `COUNTRY_DRINKS` dans `cities.py`.
- **Thèmes** : `THEMES` dans `static/js/settings.js`.
- **Textes des étapes** et emojis de repli : `STAGES` dans `static/js/app.js` ; requêtes GIPHY : `GIF_STAGES` dans `app.py`.

---

À consommer avec modération. © 2026 PatateVolante.
