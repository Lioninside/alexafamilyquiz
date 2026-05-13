'use strict';

const Alexa = require('ask-sdk-core');
const { loadQuestions, normalizeAnswer } = require('./questions');

const FRAGEN_PRO_RUNDE = 15;

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

function getRundenbewertung(attr) {
  if (attr.totalAsked > 0 && attr.totalAsked % FRAGEN_PRO_RUNDE === 0) {
    return zufall(RUNDEN_TEXTE)(attr.roundScore || 0);
  }
  return '';
}

async function getAttr(handlerInput) {
  const attr = handlerInput.attributesManager.getSessionAttributes();
  if (!attr.questions || attr.questions.length === 0) {
    console.log('[WARN] questions fehlen in sessionAttributes – sollte nicht passieren, lade neu');
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
  return attr;
}

function keinAktivesQuiz(handlerInput) {
  return handlerInput.responseBuilder
    .speak('Kein aktives Quiz. Sage "Starte Simple Quiz" um zu beginnen.')
    .withShouldEndSession(true)
    .getResponse();
}

function advanceQuestion(handlerInput, attr) {
  attr.currentIndex++;
  attr.totalAsked++;
  const rundenText = getRundenbewertung(attr);
  if (rundenText) attr.roundScore = 0;
  attr.attempts = 0;
  attr.repeatCount = 0;
  handlerInput.attributesManager.setSessionAttributes(attr);
  return rundenText;
}

function stelleNaechsteFrage(handlerInput, attr, praefixText) {
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

function zeigeAufloesung(handlerInput, attr, aktFrage) {
  const rundenText = advanceQuestion(handlerInput, attr);
  const aufloesungsText = `${zufall(AUFLOESUNG_TEXTE)(aktFrage.answer)} ${zufall(WEITER_TEXTE)} ${rundenText}`;
  return stelleNaechsteFrage(handlerInput, attr, aufloesungsText);
}

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

      const attr = {
        questions,
        currentIndex: 0,
        score: 0,
        roundScore: 0,
        totalAsked: 0,
        attempts: 0,
        repeatCount: 0,
      };
      handlerInput.attributesManager.setSessionAttributes(attr);

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
      return keinAktivesQuiz(handlerInput);
    }

    const aktFrage = questions[currentIndex];
    const antwortSlot = Alexa.getSlotValue(handlerInput.requestEnvelope, 'answer');
    const gegebenAntwort = normalizeAnswer(antwortSlot || '');
    const richtigeAntwort = normalizeAnswer(aktFrage.answer);

    if (gegebenAntwort === richtigeAntwort) {
      attr.score++;
      attr.roundScore = (attr.roundScore || 0) + 1;
      const rundenText = advanceQuestion(handlerInput, attr);
      return stelleNaechsteFrage(handlerInput, attr, `${zufall(RICHTIG_TEXTE)} ${rundenText}`);
    }

    if (attr.attempts === 0) {
      attr.attempts = 1;
      handlerInput.attributesManager.setSessionAttributes(attr);
      return handlerInput.responseBuilder
        .speak(`${zufall(FALSCH_TEXTE)} ${aktFrage.question}`)
        .reprompt(aktFrage.question)
        .withShouldEndSession(false)
        .getResponse();
    }

    return zeigeAufloesung(handlerInput, attr, aktFrage);
  },
};

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
      return keinAktivesQuiz(handlerInput);
    }

    return zeigeAufloesung(handlerInput, attr, questions[currentIndex]);
  },
};

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
      return keinAktivesQuiz(handlerInput);
    }

    const aktFrage = questions[currentIndex];

    if (attr.repeatCount === 0) {
      attr.repeatCount = 1;
      handlerInput.attributesManager.setSessionAttributes(attr);
      return handlerInput.responseBuilder
        .speak(aktFrage.question)
        .reprompt(aktFrage.question)
        .withShouldEndSession(false)
        .getResponse();
    }

    const rundenText = advanceQuestion(handlerInput, attr);
    return stelleNaechsteFrage(handlerInput, attr, rundenText);
  },
};

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

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    console.log('Session beendet:', JSON.stringify(handlerInput.requestEnvelope.request));
    return handlerInput.responseBuilder.getResponse();
  },
};

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
  .withCustomUserAgent('SimpleQuiz/1.0')
  .lambda();
