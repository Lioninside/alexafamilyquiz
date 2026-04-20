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
  'Sehr gut, genau!',
  'Ja, richtig!',
  'Super, das stimmt!',
  'Perfekt, richtig!',
  'Toll, das ist korrekt!',
  'Ja, genau!',
  'Ausgezeichnet!',
];

const FALSCH_TEXTE = [
  'Leider falsch, versuch es nochmal.',
  'Das war nicht richtig, nochmal!',
  'Nicht ganz, nochmal!',
  'Falsch, noch ein Versuch.',
];

const AUFLOESUNG_TEXTE = [
  (antwort) => `Schade, die Antwort wäre ${antwort} gewesen.`,
  (antwort) => `Die richtige Antwort ist ${antwort}.`,
  (antwort) => `Leider falsch – es wäre ${antwort}.`,
  (antwort) => `Nicht ganz, es ist ${antwort}.`,
];

const WEITER_TEXTE = [
  'Weiter geht\'s!',
  'Nächste Frage!',
  'Weiter!',
  'Auf zur nächsten Frage!',
];

// Gibt Rundenbewertungstext zurück, wenn gerade 15 Fragen abgeschlossen wurden
function getRundenbewertung(attr) {
  if (attr.totalAsked > 0 && attr.totalAsked % FRAGEN_PRO_RUNDE === 0) {
    const punkte = attr.roundScore || 0;
    return `Das waren ${FRAGEN_PRO_RUNDE} Fragen. ${punkte} von ${FRAGEN_PRO_RUNDE} waren richtig. ` +
      'Wenn du keine Lust mehr hast, sage einfach Stopp. Ich mache nun mit der nächsten Frage weiter. ';
  }
  return '';
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
    return handlerInput.responseBuilder
      .speak(`${praefixText}Du hast alle Fragen beantwortet. Auf Wiedersehen!`)
      .withShouldEndSession(true)
      .getResponse();
  }

  const frage = attr.questions[attr.currentIndex].question;
  return handlerInput.responseBuilder
    .speak(`${praefixText}${frage}`)
    .reprompt(frage)
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
        .speak(`Willkommen beim FamilyQuiz! Ich stelle dir Fragen. Antworte mit einem Wort. Los geht's! ${ersteFrage}`)
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
  handle(handlerInput) {
    const attr = handlerInput.attributesManager.getSessionAttributes();
    const { questions, currentIndex } = attr;

    if (!questions || currentIndex >= questions.length) {
      return handlerInput.responseBuilder
        .speak('Kein aktives Quiz. Sage "Starte FamilyQuiz" um zu beginnen.')
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
  handle(handlerInput) {
    const attr = handlerInput.attributesManager.getSessionAttributes();
    const { questions, currentIndex } = attr;

    if (!questions || currentIndex >= questions.length) {
      return handlerInput.responseBuilder
        .speak('Kein aktives Quiz. Sage "Starte FamilyQuiz" um zu beginnen.')
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
  handle(handlerInput) {
    const attr = handlerInput.attributesManager.getSessionAttributes();
    const { questions, currentIndex } = attr;

    if (!questions || currentIndex >= questions.length) {
      return handlerInput.responseBuilder
        .speak('Kein aktives Quiz. Sage "Starte FamilyQuiz" um zu beginnen.')
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
      .speak(`Du hast ${richtig} von ${gestellt} Fragen richtig beantwortet. Tschüss!`)
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
