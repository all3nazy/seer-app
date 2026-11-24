/**
 * «سِير أدمن» › صندوق الوارد — the bridge that runs inside the Seer Gmail account (Google Apps Script).
 *
 * Setup (once, signed in as the Seer Gmail account):
 *   1. script.google.com → New project → paste this file.
 *   2. Project Settings → Script properties:
 *        SEER_INBOX_URL     https://<platform address>/api/inbox/ingest
 *        SEER_INBOX_SECRET  the same value as SEER_INBOX_SECRET on the platform's Vercel project
 *   3. Run `install` once and allow access. It adds a trigger that runs `sync` every 5 minutes.
 *
 * Every run sends the inbox messages of the last 3 days (the first run: 30 days). The platform keeps
 * each Gmail message once, so sending one again changes nothing. Only the plain text and the names
 * of attachments are sent; files stay in Gmail. Messages sent from this account are skipped.
 */
function sync(days) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('SEER_INBOX_URL'), secret = props.getProperty('SEER_INBOX_SECRET');
  if (!url || !secret) throw new Error('Set SEER_INBOX_URL and SEER_INBOX_SECRET in Script properties.');
  var me = Session.getActiveUser().getEmail().toLowerCase();
  // A time trigger passes an event object, not a number.
  var window = typeof days === 'number' ? days : (props.getProperty('FIRST_RUN_DONE') ? 3 : 30);
  var threads = GmailApp.search('in:inbox newer_than:' + window + 'd', 0, 100);
  var batch = [];
  for (var t = 0; t < threads.length; t++) {
    var messages = threads[t].getMessages();
    for (var m = 0; m < messages.length; m++) {
      var msg = messages[m];
      var sender = splitSender(msg.getFrom());
      if (!sender.email || sender.email === me) continue;
      batch.push({
        gmail_id: msg.getId(),
        thread_id: threads[t].getId(),
        from_name: sender.name,
        from_email: sender.email,
        to: msg.getTo(),
        subject: msg.getSubject(),
        body: (msg.getPlainBody() || '').slice(0, 50000),
        attachments: msg.getAttachments({ includeInlineImages: false }).slice(0, 20).map(function (file) { return { name: file.getName(), size: file.getSize() }; }),
        received_at: msg.getDate().toISOString()
      });
      if (batch.length === 50) { send(url, secret, batch); batch = []; }
    }
  }
  if (batch.length) send(url, secret, batch);
  props.setProperty('FIRST_RUN_DONE', '1');
}

function send(url, secret, batch) {
  var response = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + secret },
    payload: JSON.stringify({ messages: batch })
  });
  if (response.getResponseCode() !== 200) throw new Error('Seer inbox refused the batch: HTTP ' + response.getResponseCode());
}

function splitSender(from) {
  var match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from || '');
  return match ? { name: match[1].trim() || null, email: match[2].trim().toLowerCase() } : { name: null, email: String(from || '').trim().toLowerCase() };
}

/** Run once: removes old triggers of this project and runs `sync` every 5 minutes. */
function install() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) { ScriptApp.deleteTrigger(trigger); });
  ScriptApp.newTrigger('sync').timeBased().everyMinutes(5).create();
  sync();
}
