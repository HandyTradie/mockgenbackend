const admin = require("firebase-admin");
const functions = require("firebase-functions");
var serviceAccount = require("./quizmine-dev-firebase-adminsdk-cx2s1-bab893d5a0.json");
admin.initializeApp({
	credential: admin.credential.cert(serviceAccount),
	storageBucket: "quizmine-dev.appspot.com",
});
// admin.firestore().settings({ ignoreUndefinedProperties: true });

exports.admin = admin;
exports.firestore = admin.firestore;
exports.firebaseStorage = admin.storage();
exports.rtdb = admin.database;
exports.projectId = admin.instanceId().app.options.projectId || "paykode-sandbox";
exports.firestoreTimestamp = admin.firestore.FieldValue.serverTimestamp;
exports.logger = functions.logger;
exports.rtdbTimestamp = admin.database.ServerValue.TIMESTAMP;
