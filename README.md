# Simple Quiz – Alexa Skill

Ein Quiz-Skill für Alexa. Fragen werden aus einem Google Sheet geladen.
Bei jedem `git push` auf `main` wird die Lambda-Funktion automatisch aktualisiert.

---

## Einmaliges Setup

### 1. AWS Lambda erstellen

1. [AWS Lambda Console](https://console.aws.amazon.com/lambda) öffnen
2. **Funktion erstellen** → „Neu erstellen"
   - Name: `alexa-quiz` (wird als `LAMBDA_FUNCTION_NAME` Secret verwendet)
   - Laufzeit: **Node.js 18.x**
   - Architektur: x86_64
3. Unter **Konfiguration → Umgebungsvariablen** hinzufügen:
   - `GOOGLE_SHEET_ID` → die ID aus der Sheet-URL (siehe Abschnitt 3)
4. Den **Funktions-ARN** aus der Übersicht kopieren (Format: `arn:aws:lambda:eu-central-1:…`)

### 2. Alexa Skill mit Lambda verbinden

1. [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask) öffnen
2. Skill mit ID `amzn1.ask.skill.68d9aced-e70a-4209-95f2-9621cb4be2b3` öffnen
3. Unter **Endpoint** → **AWS Lambda ARN** auswählen
4. Den Lambda-ARN aus Schritt 1 eintragen
5. Speichern

Damit Alexa auf die Lambda-Funktion zugreifen darf:

```bash
aws lambda add-permission \
  --function-name alexa-quiz \
  --statement-id alexa-trigger \
  --action lambda:InvokeFunction \
  --principal alexa-appkit.amazon.com \
  --event-source-token amzn1.ask.skill.68d9aced-e70a-4209-95f2-9621cb4be2b3
```

---

### 3. Google Sheets vorbereiten

1. Neues Google Sheet erstellen
2. Spalte A: **Frage**, Spalte B: **Antwort** (ein Wort, kleingeschrieben)
3. Zeile 1 enthält Überschriften (werden automatisch übersprungen)

Beispiel:

| Frage | Antwort |
|---|---|
| Was ist die Hauptstadt von Frankreich? | paris |
| Wie viele Beine hat eine Spinne? | acht |

4. Sheet öffentlich stellen: **Teilen → Jeder mit dem Link → Betrachter**
5. Die **Sheet-ID** aus der URL kopieren:
   `https://docs.google.com/spreadsheets/d/**HIER_IST_DIE_ID**/edit`
6. In AWS Lambda unter **Konfiguration → Umgebungsvariablen**: `GOOGLE_SHEET_ID` = die kopierte ID

> **Hinweis:** Die Sheet-ID ist eine zentrale Einstellung des Skill-Betreibers.
> Alle Nutzer spielen mit denselben Fragen. Eine individuelle Konfiguration
> per Sprache ist nicht möglich, da Sheet-IDs nicht diktierbar sind.

---

### 4. GitHub Secrets konfigurieren

Im GitHub-Repository unter **Settings → Secrets and variables → Actions**:

| Secret | Beschreibung |
|---|---|
| `AWS_ACCESS_KEY_ID` | AWS IAM Access Key (braucht `lambda:UpdateFunctionCode`) |
| `AWS_SECRET_ACCESS_KEY` | Zugehöriger Secret Key |
| `AWS_REGION` | AWS-Region der Lambda-Funktion (z. B. `eu-central-1`) |
| `LAMBDA_FUNCTION_NAME` | Name der Lambda-Funktion: `alexa-quiz` |

IAM-Policy für den Deploy-User (Mindestberechtigung):

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "lambda:UpdateFunctionCode",
    "Resource": "arn:aws:lambda:REGION:ACCOUNT_ID:function:alexa-quiz"
  }]
}
```

---

### 5. Beta-Test: Tester einladen

1. In der Alexa Developer Console unter **Distribution → Beta Test**
2. Tester einladen (z. B. `huber.rosemary@gmail.com`)
3. Der Tester erhält eine E-Mail und kann den Skill in der Alexa-App aktivieren

---

## Skill veröffentlichen (Checkliste)

Folgende Schritte sind vor der Zertifizierung durch Amazon erforderlich:

### Icons (zwingend)

Zwei PNG-Icons hochladen unter **Build → Skill Icon**:
- `108 × 108 px` (kleines Icon)
- `512 × 512 px` (großes Icon)

Empfehlungen: transparenter Hintergrund, kein Text, einfaches Motiv (z. B. Fragezeichen).

### Privacy Policy (zwingend)

Eine öffentlich erreichbare Privacy Policy URL ist für die Zertifizierung Pflicht.
Minimaler Inhalt: welche Daten verarbeitet werden (keine personenbezogenen Daten, keine Speicherung).

In `skill-package/skill.json` eintragen:
```json
"privacyPolicyUrl": "https://DEINE_URL/privacy"
```

### Lambda ARN eintragen

In `skill-package/skill.json`:
```json
"uri": "arn:aws:lambda:REGION:ACCOUNT_ID:function:alexa-quiz"
```

### Skill-Manifest hochladen

Inhalt von `skill-package/skill.json` in der Alexa Console unter
**Distribution → Skill Preview** eintragen.

### Interaction Model neu bauen

Nach dem letzten Änderungen: **Build Model** in der Alexa Console.

### Einreichen

**Distribution → Submission** → Zertifizierung beantragen.
Amazon prüft üblicherweise innerhalb von 3–5 Werktagen.

---

## Fragen hinzufügen

Einfach im Google Sheet neue Zeilen hinzufügen:
- Spalte A: Frage
- Spalte B: Antwort (ein Wort, kleingeschrieben)

Keine weiteren Schritte nötig – beim nächsten Skill-Start werden die Fragen automatisch geladen.
Pro Session werden zufällig 90 von allen verfügbaren Fragen ausgewählt.

---

## Deployment

### Lambda (automatisch)

```bash
git add .
git commit -m "Neue Fragen oder Änderungen"
git push origin main
```

GitHub Actions deployt automatisch auf AWS Lambda.

### Interaction Model (manuell, nur bei Änderungen an `de-DE.json`)

1. [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask) öffnen
2. Skill öffnen → **Interaction Model** → JSON-Editor
3. Inhalt von `de-DE.json` einfügen und speichern
4. **Build Model** klicken und auf „Build Successful" warten

---

## Quiz-Ablauf

- **Starten:** „Alexa, starte Simple Quiz"
- **Antworten:** Antwort mit einem Wort nennen
- **Nicht wissen:** „Weiß nicht" oder „Keine Ahnung" → Antwort wird aufgelöst
- **Beenden:** „Stopp" oder „Abbrechen"

Pro Runde werden 15 zufällige Fragen gestellt. Nach jeder Runde wird der Punktestand angesagt.
Antwortvergleich ist tolerant gegenüber Groß-/Kleinschreibung und Umlauten (ä→ae, ö→oe, ü→ue, ß→ss).
