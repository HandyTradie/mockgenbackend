const functions = require("firebase-functions");
const { admin, firestore, logger, projectId } = require("../admin");
const { createNewMockDocx, saveUserGeneratedQuestions, download } = require("../utils");
const fetch = require("node-fetch");
const cors = require("cors")({
	origin: "*",
});
const path = require("path");
const os = require("os");
const { DOMParser } = require("xmldom");
const { createNewMockWithTopics } = require("../utils/topics");
exports.uploadQuestions = functions.https.onRequest(async (request, response) => {
	// browsers like chrome need these headers to be present in response if the api is called from other than its base domain
	response.set("Access-Control-Allow-Origin", "*"); // you can also whitelist a specific domain like "http://127.0.0.1:4000"
	response.set("Access-Control-Allow-Headers", "Content-Type"); // response.set("Access-Control-Allow-Origin", "*");
	// response.append("Access-Control-Allow-Origin", "http://localhost:3000");

	return cors(request, response, async () => {
		try {
			if (request.method !== "POST") {
				return response.status(200).json({
					success: false,
					message: "Invalid request",
				});
			}
			const { courseID, downloadURL } = JSON.parse(request.body);
			logger.log({
				courseID,
				downloadURL,
			});

			const tempFilePath = path.join(os.tmpdir(), "temp.json");

			return download(downloadURL, tempFilePath, async () => {
				const jsonFile = require(tempFilePath);
				logger.log(jsonFile);
				await onSaveCourses(jsonFile, courseID);
				await onSaveQuestions(jsonFile, courseID);
				// await onSavePreambles();
				// await onSavePreamblesToQuestion();
				return response.status(200).json({
					success: true,
					message: "Success",
				});
			});
		} catch (error) {
			logger.error(error);
			return response.status(200).json({
				success: false,
				message: "Invalid request",
			});
		}
	});
});

exports.handlePayment = functions.https.onCall(async (data, context) => {
	try {
		let { transactionData, user, paymentDetails, amount, config } = data;

		const paystackResponse = await initiatePaystackPayment({
			user,
			amount,
			paymentDetails,
			config,
			transactionData,
		});
		return paystackResponse;
	} catch (error) {
		console.log(error);
		return false;
	}
});

exports.handleMultiPayment = functions.https.onCall(async (data, context) => {
	try {
		let { transactionData, user, paymentDetails, amount, configs } = data;

		const paystackResponse = await initiateMultiPaystackPayment({
			user,
			amount,
			paymentDetails,
			configs,
			transactionData,
		});
		return paystackResponse;
	} catch (error) {
		console.log(error);
		return false;
	}
});

exports.handleCreateNewMockWithTopics_next = functions
	.runWith({
		timeoutSeconds: 530,
		memory: "512MB",
	})
	.https.onCall(async (data, context) => {
		try {
			return await createNewMockWithTopics({
				...data,
				userID: context?.auth?.uid,
			});
		} catch (error) {
			console.log(error);
			return false;
		}
	});
exports.handleCreateNewMockDocx_next = functions.https.onCall(async (data, context) => {
	try {
		return await createNewMockDocx({
			...data,
		});
	} catch (error) {
		console.log(error);
		return false;
	}
});
exports.addToDB = functions.https.onCall(async (data, context) => {
	try {
		// console.log({ config, questions });
		let { courseContent } = data;
		const allPromises = courseContent.map((item, idx) => {
			return admin.firestore().collection("courseContent").doc(item.courseID).set(
				{
					category: item.category,
					name: item.name,
					author: item.author,
					courseID: item.courseID,
					topics: item.topics,
					// base64css: item.base64css,
					updated_at: item.updated_at,
					package_code: item.package_code,
					topicbanks: item.topicbanks,
					questions: item.questions,
					course_id: item.course_id,
					nquestions: item.nquestions,
					quizzes: item.quizzes,
					description: item.description,
				},
				{
					merge: true,
				}
			);
		});

		return await Promise.all(allPromises);
	} catch (error) {
		console.log(error.message);
		return error.message;
	}
});

exports.onSavePreambles = functions.https.onCall(async (data, context) => {
	try {
		const preambles = {};
		const instructions = {};

		const querySnapshot = await admin.firestore().collection("courseContent").get();

		const questions = [];

		querySnapshot.forEach((doc) => {
			const data = doc.data();

			let docQuestions = [];
			if (data.questions) {
				docQuestions = Object.values(data.questions);
			}

			docQuestions.forEach((q) => {
				questions.push(q);
			});
		});

		for (let question of questions) {
			if (question.resource) {
				if (preambles[question.resource]) {
					preambles[question.resource].push({
						pqIndex: preambles[question.resource].length,
						qID: question.qid,
					});
				} else {
					preambles[question.resource] = [
						{
							pqIndex: 0,
							qID: question.qid,
						},
					];
				}
			}
		}

		console.log(questions);
		console.log(preambles);
		console.log(instructions);
	} catch (error) {
		console.log(error.message);
	}
});

async function initiatePaystackPayment({ user, amount, paymentDetails, config, transactionData }) {
	try {
		const payload = JSON.stringify({
			email: user.email,
			amount: amount,
			currency: "GHS",
			reference: transactionData.transactionId,
			metadata: {
				configID: config.configId,
				custom_fields: [
					{
						value: config.configId,
						display_name: "Payment For Mock Generator",
						variable_name: "payment_for",
					},
				],
			},
			mobile_money: {
				phone: paymentDetails.number,
				provider: paymentDetails.network,
			},
		});

		logger.log(payload);

		const res = await fetch("https://api.paystack.co/charge", {
			method: "post",
			body: payload,
			headers: {
				Authorization: "Bearer sk_live_7c77e956258b54fe8a5aea88715463324f18b4d6",
				// Authorization: "Bearer sk_test_571156b3160fb84bde8f965374f504cdb5af2fa8",
				"Content-Type": "application/json",
				Accept: "application/json",
			},
		});

		const data = await res.json();
		logger.log({
			payloadResponse: data,
		});

		return data;
	} catch (error) {
		console.log(error);
	}
}

async function initiateMultiPaystackPayment({ user, amount, paymentDetails, configs, transactionData }) {
	try {
		const payload = JSON.stringify({
			email: user.email,
			amount: amount,
			currency: "GHS",
			reference: transactionData.map((doc) => doc.transactionId).join("-"),
			metadata: {
				configID: configs.map((doc) => doc.configId).join(","),
				custom_fields: [
					{
						value: configs.map((doc) => doc.configId).join(","),
						display_name: "Payment For Mock Generator",
						variable_name: "payment_for",
					},
				],
			},
			mobile_money: {
				phone: paymentDetails.number,
				provider: paymentDetails.network,
			},
		});

		logger.log(payload);

		const res = await fetch("https://api.paystack.co/charge", {
			method: "post",
			body: payload,
			headers: {
				Authorization: "Bearer sk_live_7c77e956258b54fe8a5aea88715463324f18b4d6",
				"Content-Type": "application/json",
			},
		});

		const data = await res.json();
		logger.log({
			payloadResponse: data,
		});

		return data;
	} catch (error) {
		console.log(error);
	}
}

exports.verifyOTP = functions.https.onCall(async (data, context) => {
	const { otp, reference } = data;
	try {
		const payload = JSON.stringify({
			otp,
			reference,
		});

		const res = await fetch("https://api.paystack.co/charge/submit_otp", {
			method: "post",
			body: payload,
			headers: {
				Authorization: "Bearer sk_live_7c77e956258b54fe8a5aea88715463324f18b4d6",
				// Authorization: "Bearer sk_test_571156b3160fb84bde8f965374f504cdb5af2fa8",
				"Content-Type": "application/json",
			},
		});

		const data = await res.json();
		logger.log({
			verifyOTPResponse: data,
		});

		return data;
	} catch (error) {
		console.log(error);
	}
});

const onSaveCourses = async (item, courseID) => {
	try {
		return firestore().collection("courseContent").doc(courseID).set({
			category: item.category,
			name: item.name,
			author: item.author,
			courseID: item.courseID,
			topics: item.topics,
			// base64css: item.base64css,
			updated_at: item.updated_at,
			package_code: item.package_code,
			topicbanks: item.topicbanks,
			// questions: item.questions,
			course_id: item.course_id,
			nquestions: item.nquestions,
			quizzes: item.quizzes,
			description: item.description,
		});

		// console.log(data);
	} catch (error) {
		logger.error(error);
	}
};

const onSaveQuestions = async (c, courseID) => {
	try {
		const values = Object.values(c.questions);
		logger.log({
			values,
		});
		logger.log("base64 images: ", c.base64css);
		const allPromises = values.map((p, idx) => {
			return firestore()
				.collection("mockCourseQuestions")
				.doc(p.qid)
				.set({
					...p,
					courseID,
					images: getQuestionImagesList(c.base64css, p.text, p.resource, p.answers),
				});
		});

		await Promise.all(allPromises);
	} catch (error) {
		logger.error(error);
	}
};

const onSavePreambles = async () => {
	try {
		const preambles = {};
		const instructions = {};

		const querySnapshot = await firestore().collection("mockCourseQuestions").get();

		querySnapshot.forEach((doc) => {
			const question = doc.data();

			if (question.resource) {
				if (preambles[question.resource]) {
					preambles[question.resource].push({
						pqIndex: preambles[question.resource].length,
						qID: question.qid,
					});
				} else {
					preambles[question.resource] = [
						{
							pqIndex: 0,
							qID: question.qid,
						},
					];
				}
			}

			if (question.instructions) {
				if (instructions[question.instructions]) {
					instructions[question.instructions].push({
						iqIndex: instructions[question.instructions].length,
						qID: question.qid,
					});
				} else {
					instructions[question.instructions] = [
						{
							iqIndex: 0,
							qID: question.qid,
						},
					];
				}
			}
		});

		// console.log(preambles);
		// console.log(instructions);

		const arrayPreambles = Object.entries(preambles);
		const arrayInstructions = Object.entries(instructions);

		const allPromises = arrayPreambles.map(([key, value], idx) => {
			return firestore().collection("preambles").add({
				text: key,
				questionIDs: value,
			});
		});

		const allPromises2 = arrayInstructions.map(([key, value], idx) => {
			return firestore().collection("instructions").add({
				text: key,
				questionIDs: value,
			});
		});

		await Promise.all([allPromises, allPromises2]);
	} catch (error) {
		logger.error(error);
	}
};

const onSavePreamblesToQuestion = async () => {
	try {
		const querySnapshot = await firestore().collection("preambles").get();

		const allPromises = [];

		querySnapshot.forEach((docu) => {
			const docID = docu.id;
			const preamble = docu.data();

			const questionIDs = preamble.questionIDs;

			questionIDs.forEach((q) => {
				allPromises.push(
					firestore().collection("mockCourseQuestions").doc(q.qID).update({
						preambleID: docID,
					})
				);
			});
		});

		await Promise.all(allPromises);
	} catch (error) {
		console.log(error);
	}
};
const getQuestionImagesList = (base64css, question, resource, answers) => {
	try {
		// let que =
		// 	"<p>In the diagram below, |<i>AB</i>| is parallel to |<i>CD</i>|. angles <i>a</i> and <i>b</i> are<img class='8f1f43ba129018b1de0f6853a5dda7b8ef6636b949d71c6da466a28f8d13daf9'></p>";
		let parser = new DOMParser();
		let textRun = [];
		const textList = [];
		const imagesList = [];
		if (question !== undefined && question.length > 0) {
			let docf = parser.parseFromString(question, "text/html");
			let element = docf.getElementsByTagName("*");

			// console.log("Elements: ", element.length, element[0].childNodes[0].nodeValue, element[0].tagName);

			if (element.length > 1) {
				for (let x = 0; x < element.length; x++) {
					// console.log(element[x].textContent, element[x].tagName);
					if (element[x].tagName.toLowerCase() === "img") {
						imagesList.push({
							key: element[x].getAttribute("class"),
							image: base64css[element[x].getAttribute("class")],
						});
					}
				}
			}
		}
		if (resource !== undefined && resource.length > 0) {
			let docf = parser.parseFromString(resource, "text/html");
			let element = docf.getElementsByTagName("*");

			if (element.length > 1) {
				for (let x = 0; x < element.length; x++) {
					// console.log(element[x].textContent, element[x].tagName);
					if (element[x].tagName.toLowerCase() === "img") {
						imagesList.push({
							key: element[x].getAttribute("class"),
							image: base64css[element[x].getAttribute("class")],
						});
					}
				}
			}
		}
		if (answers !== undefined && answers.length > 0) {
			for (let index = 0; index < answers.length; index++) {
				const ans = answers[index];
				if (ans.text) {
					let docf = parser.parseFromString(ans.text, "text/html");

					let element = docf.getElementsByTagName("*");

					if (element.length > 1) {
						for (let x = 0; x < element.length; x++) {
							// console.log(element[x].textContent, element[x].tagName);
							if (element[x].tagName.toLowerCase() === "img") {
								imagesList.push({
									key: element[x].getAttribute("class"),
									image: base64css[element[x].getAttribute("class")],
								});
							}
						}
					}
				}
				if (ans.solution) {
					let docf = parser.parseFromString(ans.solution, "text/html");

					let element = docf.getElementsByTagName("*");

					if (element.length > 1) {
						for (let x = 0; x < element.length; x++) {
							// console.log(element[x].textContent, element[x].tagName);
							if (element[x].tagName.toLowerCase() === "img") {
								imagesList.push({
									key: element[x].getAttribute("class"),
									image: base64css[element[x].getAttribute("class")],
								});
							}
						}
					}
				}
			}
		}
		return imagesList;
	} catch (error) {
		logger.log("error in getQuestionImageList text: ", error);
	}
};
