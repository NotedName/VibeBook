/**
 * Push notifications for VibeBook. Two triggers send a short push to every device the person turned push on for
 * (users/{uid}/pushTokens). Chats are end-to-end encrypted, so a message push never contains the message: it only says who wrote.
 * Needs the Firebase Blaze plan. See PUSH.md.
 */
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

const TITLES = {
  friend_request: "sent you a friend request", friend_accept: "accepted your friend request", follow: "followed you",
  group_invite: "invited you to a group", group_request: "asked to join your group", group_approved: "approved your request to join",
  group_deleted: "deleted a group you were in", like: "vibed your entry", comment: "commented on your entry", reply: "replied to your comment",
  comment_like: "liked your comment", repost: "reposted your entry",
};

async function push(uid, data) {
  const snap = await db.collection("users").doc(uid).collection("pushTokens").get();
  const tokens = snap.docs.map((d) => d.id);
  if (tokens.length === 0) return;
  const res = await admin.messaging().sendEachForMulticast({ tokens, data, webpush: { headers: { Urgency: "high" } } });
  // forget devices that no longer exist
  await Promise.all(res.responses.map((r, i) => (!r.success && /not-registered|invalid-registration/.test(r.error?.code ?? "") ? snap.docs[i].ref.delete() : null)));
}

const nameOf = async (uid) => (await db.collection("profiles").doc(uid).get()).data()?.displayName || "Someone";

exports.onMessage = onDocumentCreated("conversations/{pairId}/messages/{id}", async (event) => {
  const m = event.data?.data();
  if (!m?.from) return;
  const convo = (await db.collection("conversations").doc(event.params.pairId).get()).data();
  const to = (convo?.members ?? []).find((u) => u !== m.from);
  if (!to) return;
  await push(to, { title: await nameOf(m.from), body: "Sent you a message", url: `/#/m/${encodeURIComponent(m.from)}`, tag: `chat-${m.from}` });
});

exports.onNotification = onDocumentCreated("users/{uid}/notifications/{id}", async (event) => {
  const n = event.data?.data();
  if (!n?.type) return;
  const actor = n.actor || n.from;
  const who = actor ? await nameOf(actor) : "Someone";
  await push(event.params.uid, { title: "VibeBook", body: `${who} ${TITLES[n.type] ?? "sent you a notification"}`, url: "/#/notifications", tag: n.type });
});
