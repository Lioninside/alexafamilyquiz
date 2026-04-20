'use strict';

// Lädt Fragen aus einem öffentlichen Google Sheet (CSV-Export, kein API-Key nötig)
const https = require('https');
const http = require('http');

// Normalisiert Text: lowercase, trimmen, Umlaute ersetzen
function normalizeAnswer(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

// Einfaches CSV-Parsing mit Unterstützung für Anführungszeichen
function parseCSVLine(line) {
  const felder = [];
  let aktuell = '';
  let inAnfuehrungszeichen = false;

  for (const zeichen of line) {
    if (zeichen === '"') {
      inAnfuehrungszeichen = !inAnfuehrungszeichen;
    } else if (zeichen === ',' && !inAnfuehrungszeichen) {
      felder.push(aktuell.trim());
      aktuell = '';
    } else {
      aktuell += zeichen;
    }
  }
  felder.push(aktuell.trim());
  return felder;
}

// CSV-Text in Fragenliste umwandeln (erste Zeile = Überschriften, wird übersprungen)
function parseCSV(text) {
  const zeilen = text.split('\n');
  const fragen = [];

  for (let i = 1; i < zeilen.length; i++) {
    const zeile = zeilen[i].trim();
    if (!zeile) continue;

    const felder = parseCSVLine(zeile);
    if (felder.length >= 2) {
      const frage = felder[0].trim();
      const antwort = felder[1].trim().toLowerCase();
      if (frage && antwort) {
        fragen.push({ question: frage, answer: antwort });
      }
    }
  }

  return fragen;
}

// HTTP/HTTPS-GET mit automatischer Weiterleitung auf beliebige Domains (max. 5 Redirects)
function httpsGet(url, verbleibende = 5) {
  return new Promise((resolve, reject) => {
    if (verbleibende <= 0) {
      reject(new Error('Zu viele Weiterleitungen'));
      return;
    }

    const client = url.startsWith('https://') ? https : http;

    client.get(url, (antwort) => {
      const { statusCode, headers } = antwort;

      const istRedirect = [301, 302, 303, 307, 308].includes(statusCode);
      if (istRedirect && headers.location) {
        antwort.resume();
        // Relative Redirect-URLs gegen die aktuelle URL auflösen
        const zielUrl = headers.location.startsWith('http')
          ? headers.location
          : new URL(headers.location, url).toString();
        resolve(httpsGet(zielUrl, verbleibende - 1));
        return;
      }

      // DEBUG: finale URL nach allen Redirects
      console.log('[DEBUG] Finale URL:', url);

      let daten = '';
      antwort.on('data', (chunk) => { daten += chunk; });
      antwort.on('end', () => resolve(daten));
    }).on('error', reject);
  });
}

// Fragen zufällig mischen (Fisher-Yates)
function mischen(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Fragen aus Google Sheets laden, mischen und zurückgeben
async function loadQuestions() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) {
    throw new Error('Umgebungsvariable GOOGLE_SHEET_ID nicht gesetzt');
  }

  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;
  const csvText = await httpsGet(url);

  // DEBUG: erste 500 Zeichen der Antwort
  console.log('[DEBUG] csvText (erste 500 Zeichen):', csvText.slice(0, 500));

  const fragen = parseCSV(csvText);

  // DEBUG: Anzahl geparster Fragen
  console.log('[DEBUG] questions.length:', fragen.length);

  // Max. 90 Fragen pro Session (6 Runden à 15) – hält sessionAttributes sicher unter dem 24 KB Alexa-Limit
  return mischen(fragen).slice(0, 90);
}

module.exports = { loadQuestions, normalizeAnswer };
