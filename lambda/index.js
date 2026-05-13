'use strict';

const Alexa = require('ask-sdk-core');
const { loadQuestions, normalizeAnswer } = require('./questions');

const FRAGEN_PRO_RUNDE = 15;

// Zufälliges Element aus einem Array
function zufall(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const RICHTIG_TEXTE = [
  'Bravo, das ist richtig!',
  'Sehr gut!',
  'Ja, genau richtig!',
  'Super, das stimmt!',
  'Perfekt, richtig!',
  'Toll gemacht!',
  'Ja, genau!',
  'Ausgezeichnet!',
  'Wunderbar, richtig!',
  'Klasse!',
];

const FALSCH_TEXTE = [
  'Hmm, leider falsch – versuch es nochmal.',
  'Das war nicht ganz richtig, nochmal!',
  'Nicht ganz – nochmal!',
  'Falsch, noch ein Versuch.',
  'Knapp daneben – nochmal!',
];

const AUFLOESUNG_TEXTE = [
  (antwort) => `Schade, die Antwort wäre ${antwort} gewesen.`,
  (antwort) => `Die richtige Antwort ist ${antwort}.`,
  (antwort) => `Leider falsch – es wäre ${antwort}.`,
  (antwort) => `Nicht ganz, es ist ${antwort}.`,
  (antwort) => `Oje, die Antwort ist ${antwort}.`,
];

const WEITER_TEXTE = [
  'Weiter geht\'s!',
  'Nächste Frage!',
  'Weiter!',
  'Auf zur nächsten Frage!',
  'Und weiter!',
];

const START_TEXTE = [
  'Hallo! Bist du bereit für eine Quizrunde? Los geht\'s!',
  'Hey! Schön dass du da bist. Ich bin gespannt wie gut du heute bist!',
  'Willkommen beim Simple Quiz! Zeig mir was du weißt.',
  'Na, bereit für ein bisschen Kopftraining? Los!',
  'Hi! Das Quiz wartet auf dich. Viel Erfolg!',
];

const RUNDEN_TEXTE = [
  (punkte) => `Gut gemacht! Du hattest ${punkte} von ${FRAGEN_PRO_RUNDE} richtig. Weiter geht's – sage Stopp wenn du aufhören möchtest. `,
  (punkte) => `${FRAGEN_PRO_RUNDE} Fragen geschafft! ${punkte} von ${FRAGEN_PRO_RUNDE} waren richtig. ${punkte >= 10 ? 'Stark!' : 'Weiter üben!'} Nächste Runde – oder sage Stopp. `,
  (punkte) => `Runde beendet! ${punkte} von ${FRAGEN_PRO_RUNDE} Punkten. ${punkte === FRAGEN_PRO_RUNDE ? 'Perfekte Runde!' : 'Weiter so!'} Sage Stopp zum Beenden. `,
];

const ENDE_TEXTE = [
  (r, g) => `Gut gemacht! Du hast ${r} von ${g} Fragen richtig beantwortet. Bis zum nächsten Mal!`,
  (r, g) => `Das war's! Ergebnis: ${r} von ${g} richtig. ${r === g ? 'Perfekt!' : 'Beim nächsten Mal schaffst du noch mehr!'} Tschüss!`,
  (r, g) => `Alle Fragen beantwortet! ${r} von ${g} richtig. Tolle Leistung! Auf Wiedersehen!`,
];

const STOPP_TEXTE = [
  (r, g) => `Okay, wir hören auf. Du hattest ${r} von ${g} richtig. Bis bald!`,
  (r, g) => `Schade! ${r} von ${g} – das war schon gut. Tschüss!`,
  (r, g) => `Alright! Ergebnis: ${r} von ${g} richtig. Komm bald wieder!`,
];

// Gibt Rundenbewertungstext zurück, wenn gerade 15 Fragen abgeschlossen wurden
function getRundenbewertung(attr) {
  if (attr.totalAsked > 0 && attr.totalAsked % FRAGEN_PRO_RUNDE === 0) {
    const punkte = attr.roundScore || 0;
    return zufall(RUNDEN_TEXTE)(punkte);
  }
  return '';
}

// Session Attributes holen – bei fehlendem questions-Array neu von Google Sheets laden
async function getAttr(handlerInput) {
  const attr = handlerInput.attributesManager.getSessionAttributes();
  if (!attr.questions || attr.questions.length === 0) {
    console.log('[WARN] questions fehlen in sessionAttributes – lade neu');
    const questions = await loadQuestions();
    const vollAttr = {
      questions,
      currentIndex: attr.currentIndex || 0,
      score: attr.score || 0,
      roundScore: attr.roundScore || 0,
      totalAsked: attr.totalAsked || 0,
      attempts: attr.attempts || 0,
      repeatCount: attr.repeatCount || 0,
    };
    handlerInput.attributesManager.setSessionAttributes(vollAttr);
    return vollAttr;
  }
  console.log('[DEBUG] sessionAttr – index:', attr.currentIndex, 'questions:', attr.questions.length);
  return attr;
}

// Stellt die nächste Frage oder beendet die Session, wenn alle Fragen aufgebraucht sind
function stelleNaechsteFrage(handlerInput, praefixText) {
  const attr = handlerInput.attributesManager.getSessionAttributes();

  // Rundenpunkte zurücksetzen, wenn eine neue Runde beginnt
  if (attr.totalAsked > 0 && attr.totalAsked % FRAGEN_PRO_RUNDE === 0) {
    attr.roundScore = 0;
  }

  attr.attempts = 0;
  attr.repeatCount = 0;
  handlerInput.attributesManager.setSessionAttributes(attr);

  if (attr.currentIndex >= attr.questions.length) {
    const endeText = zufall(ENDE_TEXTE)(attr.score || 0, attr.totalAsked || 0);
    return handlerInput.responseBuilder
      .speak(`${praefixText}${endeText}`)
      .withShouldEndSession(true)
      .getResponse();
  }

  const frage = attr.questions[attr.currentIndex].question;
  return handlerInput.responseBuilder
    .speak(`${praefixText}${frage}`)
    .reprompt(frage)
    .withShouldEndSession(false)
    .getResponse();
}

// ── Handler ──────────────────────────────────────────────────────────────────

// LaunchRequest: Quiz starten und Fragen aus Google Sheets laden
const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  async handle(handlerInput) {
    try {
      const questions = await loadQuestions();

      if (questions.length === 0) {
        return handlerInput.responseBuilder
          .speak('Im Google Sheet wurden keine Fragen gefunden. Bitte füge Fragen ein und starte erneut.')
          .withShouldEndSession(true)
          .getResponse();
      }

      handlerInput.attributesManager.setSessionAttributes({
        questions,
        currentIndex: 0,
        score: 0,
        roundScore: 0,
        totalAsked: 0,
        attempts: 0,
        repeatCount: 0,
      });

      const ersteFrage = questions[0].question;
      return handlerInput.responseBuilder
        .speak(`${zufall(START_TEXTE)} ${ersteFrage}`)
        .reprompt(ersteFrage)
        .getResponse();
    } catch (fehler) {
      console.error('Fehler beim Laden der Fragen:', fehler);
      return handlerInput.responseBuilder
        .speak('Die Fragen konnten nicht geladen werden. Bitte versuche es später erneut.')
        .withShouldEndSession(true)
        .getResponse();
    }
  },
};

// AnswerIntent: Antwort auswerten und entsprechend reagieren
const AnswerIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AnswerIntent'
    );
  },
  async handle(handlerInput) {
    const attr = await getAttr(handlerInput);
    const { questions, currentIndex } = attr;

    if (currentIndex >= questions.length) {
      return handlerInput.responseBuilder
        .speak('Kein aktives Quiz. Sage "Starte Simple Quiz" um zu beginnen.')
        .withShouldEndSession(true)
        .getResponse();
    }

    const aktFrage = questions[currentIndex];
    const antwortSlot = Alexa.getSlotValue(handlerInput.requestEnvelope, 'answer');
    const gegebenAntwort = normalizeAnswer(antwortSlot || '');
    const richtigeAntwort = normalizeAnswer(aktFrage.answer);

    // DEBUG: empfangene Antwort und Vergleich loggen
    console.log('[DEBUG] AnswerIntent – Slot roh:', antwortSlot);
    console.log('[DEBUG] AnswerIntent – normalisiert:', gegebenAntwort, '| erwartet:', richtigeAntwort);

    if (gegebenAntwort === richtigeAntwort) {
      // Richtig!
      attr.score++;
      attr.roundScore = (attr.roundScore || 0) + 1;
      attr.currentIndex++;
      attr.totalAsked++;
      const rundenText = getRundenbewertung(attr);
      handlerInput.attributesManager.setSessionAttributes(attr);
      return stelleNaechsteFrage(handlerInput, `${zufall(RICHTIG_TEXTE)} ${rundenText}`);
    }

    if (attr.attempts === 0) {
      // Erster falscher Versuch: nochmal probieren
      attr.attempts = 1;
      handlerInput.attributesManager.setSessionAttributes(attr);
      return handlerInput.responseBuilder
        .speak(`${zufall(FALSCH_TEXTE)} ${aktFrage.question}`)
        .reprompt(aktFrage.question)
        .withShouldEndSession(false)
        .getResponse();
    }

    // Zweiter falscher Versuch: Antwort auflösen und weiter
    attr.currentIndex++;
    attr.totalAsked++;
    const rundenText = getRundenbewertung(attr);
    handlerInput.attributesManager.setSessionAttributes(attr);
    const aufloesungsText = `${zufall(AUFLOESUNG_TEXTE)(aktFrage.answer)} ${zufall(WEITER_TEXTE)} ${rundenText}`;
    return stelleNaechsteFrage(handlerInput, aufloesungsText);
  },
};

// WeissNichtIntent: Nutzer gibt auf – Antwort sofort auflösen und weiter
const WeissNichtIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'WeissNichtIntent'
    );
  },
  async handle(handlerInput) {
    const attr = await getAttr(handlerInput);
    const { questions, currentIndex } = attr;

    if (currentIndex >= questions.length) {
      return handlerInput.responseBuilder
        .speak('Kein aktives Quiz. Sage "Starte Simple Quiz" um zu beginnen.')
        .withShouldEndSession(true)
        .getResponse();
    }

    const aktFrage = questions[currentIndex];
    attr.currentIndex++;
    attr.totalAsked++;
    const rundenText = getRundenbewertung(attr);
    handlerInput.attributesManager.setSessionAttributes(attr);
    const aufloesungsText = `${zufall(AUFLOESUNG_TEXTE)(aktFrage.answer)} ${zufall(WEITER_TEXTE)} ${rundenText}`;
    return stelleNaechsteFrage(handlerInput, aufloesungsText);
  },
};

// FallbackIntent: Unverständliche Eingabe – Frage einmal wiederholen, dann weiter
const FallbackIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent'
    );
  },
  async handle(handlerInput) {
    const attr = await getAttr(handlerInput);
    const { questions, currentIndex } = attr;

    if (currentIndex >= questions.length) {
      return handlerInput.responseBuilder
        .speak('Kein aktives Quiz. Sage "Starte Simple Quiz" um zu beginnen.')
        .withShouldEndSession(true)
        .getResponse();
    }

    const aktFrage = questions[currentIndex];

    // DEBUG: FallbackIntent statt AnswerIntent – deutet auf NLU-Routing-Problem hin
    console.log('[DEBUG] FallbackIntent ausgelöst – repeatCount:', attr.repeatCount, '| aktuelle Frage:', aktFrage.question);

    if (attr.repeatCount === 0) {
      // Frage einmal wiederholen
      attr.repeatCount = 1;
      handlerInput.attributesManager.setSessionAttributes(attr);
      return handlerInput.responseBuilder
        .speak(aktFrage.question)
        .reprompt(aktFrage.question)
        .withShouldEndSession(false)
        .getResponse();
    }

    // Kein Fortschritt – zur nächsten Frage
    attr.currentIndex++;
    attr.totalAsked++;
    const rundenText = getRundenbewertung(attr);
    handlerInput.attributesManager.setSessionAttributes(attr);
    return stelleNaechsteFrage(handlerInput, rundenText);
  },
};

// StopIntent / CancelIntent: Quiz beenden und Ergebnis ansagen
const StopIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent' ||
        Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent')
    );
  },
  handle(handlerInput) {
    const attr = handlerInput.attributesManager.getSessionAttributes();
    const richtig = attr.score || 0;
    const gestellt = attr.totalAsked || 0;
    return handlerInput.responseBuilder
      .speak(zufall(STOPP_TEXTE)(richtig, gestellt))
      .withShouldEndSession(true)
      .getResponse();
  },
};

// SessionEndedRequest: Wird von Alexa gesendet, wenn die Session endet
const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    console.log('Session beendet:', JSON.stringify(handlerInput.requestEnvelope.request));
    return handlerInput.responseBuilder.getResponse();
  },
};

// Globale Fehlerbehandlung
const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, fehler) {
    console.error('Unbehandelter Fehler:', fehler);
    return handlerInput.responseBuilder
      .speak('Ein Fehler ist aufgetreten. Bitte starte das Quiz neu.')
      .reprompt('Ein Fehler ist aufgetreten. Bitte starte das Quiz neu.')
      .getResponse();
  },
};

// ── Skill zusammenbauen ───────────────────────────────────────────────────────

exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    AnswerIntentHandler,
    WeissNichtIntentHandler,
    FallbackIntentHandler,
    StopIntentHandler,
    SessionEndedRequestHandler,
  )
  .addErrorHandlers(ErrorHandler)
  .withCustomUserAgent('FamilyQuiz/1.0')
  .lambda();
