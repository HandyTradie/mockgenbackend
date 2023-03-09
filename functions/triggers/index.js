const { admin, firestore, logger } = require("../admin");
const functions = require("firebase-functions");
const fetch = require("node-fetch");
var crypto = require("crypto");
const { createDownloadableMockDocx, createNewMockDocx } = require("../utils");

exports.paymentTrigger = functions.firestore.document("transactions/{configId}").onUpdate(async (change, context) => {
	try {
		const newData = change.after.exists ? change.after.data() : null;
		let previousData = change.before.data();

		if (!newData) return null;

		if (context.params["configId"] !== newData.configId) return null;

		if (!previousData) {
			previousData = {
				status: "DRAFT",
			};
		}

		// the transaction document is new
		if (newData.status === previousData.status) {
		}

		return true;
	} catch (error) {
		console.error(error);
		return null;
	}
});

exports.generatorPaymentCallback = functions.https.onRequest(async (req, res) => {
	try {
		logger.log("COLLECTION WEBHOOK CALLED");

		var hash = crypto
			.createHmac("sha512", "sk_live_7c77e956258b54fe8a5aea88715463324f18b4d6")
			// .createHmac("sha512", "sk_test_571156b3160fb84bde8f965374f504cdb5af2fa8")
			.update(JSON.stringify(req.body))
			.digest("hex");
		if (hash == req.headers["x-paystack-signature"]) {
			// Retrieve the request's body
			var body = req.body;
			// Do something with event

			const event = body["event"];
			const eventData = body["data"];

			logger.log(eventData);
			if (event === "charge.success") {
				const { metadata } = eventData;
				const configs = metadata.configID.split(",");

				for (const configId of configs) {
					const transactionRes = await firestore().collection("transactions").doc(configId).get();
					const transactionResData = transactionRes.data();

					const { transactionData } = transactionResData;
					logger.log(transactionData);
					const { sectionBlock, course } = transactionData;

					const courseQuestionsRef = await firestore().collection("mockCourseQuestions").where("courseID", "==", course).get();
					const courseQuestions = [];

					courseQuestionsRef.forEach((doc) => {
						courseQuestions.push(doc.data());
					});

					// logger.log(generatorPDFURL);
					// // If we are here it means the transaction has been completed
					await firestore().collection("examConfiguration").doc(configId).update({
						status: "paid",
						// generatorPDFBase64: generatorPDFURL,
						updatedAt: new Date().toISOString(),
					});

					await firestore().collection("transactions").doc(configId).update({
						transactionProviderData: eventData,
						transactionRef: eventData.reference,
						status: "PAID",
					});
				}

				return res.status(200).send("Collection Successful");
			}

			// const here = {
			// 	order: null,
			// 	event: "charge.success",
			// 	business_name: "adeo",
			// 	data: {
			// 		message: "madePayment",
			// 		currency: "GHS",
			// 		created_at: "2022-02-02T15:43:49.000Z",
			// 		source: { event_type: "api", source: "merchant_api", identifier: null },
			// 		id: 1599471880,
			// 		channel: "mobile_money",
			// 		order_id: null,
			// 		metadata: {
			// 			configID: "VT9ZL4IABN",
			// 			custom_fields: [{ variable_name: "payment_for", value: "VT9ZL4IABN", display_name: "Payment For Mock Generator" }],
			// 		},
			// 		fees_split: null,
			// 		pos_transaction_data: null,
			// 		amount: 1,
			// 		ip_address: "52.49.173.169",
			// 		gateway_response: "Approved",
			// 		reference: "e1ihdtmtpau7bk9",
			// 		plan: {},
			// 		fees: 1,
			// 		split: {},
			// 		subaccount: {},
			// 		authorization: {
			// 			receiver_bank: null,
			// 			exp_year: "9999",
			// 			country_code: "GH",
			// 			reusable: false,
			// 			last4: "X267",
			// 			exp_month: "12",
			// 			channel: "mobile_money",
			// 			receiver_bank_account_number: null,
			// 			card_type: "",
			// 			bank: "MTN",
			// 			account_name: null,
			// 			bin: "024XXX",
			// 			authorization_code: "AUTH_pthg8vvqli",
			// 			signature: null,
			// 			brand: "Mtn",
			// 		},
			// 		customer: {
			// 			last_name: null,
			// 			first_name: null,
			// 			customer_code: "CUS_oo8jaqpj515zdou",
			// 			email: "kofi@kofi.com",
			// 			international_format_phone: null,
			// 			phone: null,
			// 			id: 68977162,
			// 			risk_action: "default",
			// 			metadata: null,
			// 		},
			// 		paidAt: "2022-02-02T15:44:55.000Z",
			// 		log: null,
			// 		fees_breakdown: null,
			// 		domain: "live",
			// 		requested_amount: 1,
			// 		paid_at: "2022-02-02T15:44:55.000Z",
			// 		status: "success",
			// 	},
			// };

			return res.status(200).send("Collection Successful");
		}

		return res.status(500).send("Collection Unsuccessful");
	} catch (error) {
		console.log(error);
		return res.status(500).send("Collection Unsuccessful");
	}
});
