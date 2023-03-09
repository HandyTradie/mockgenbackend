const functions = require("firebase-functions");
const {
	firestore,
	logger,
	projectId,
	firebaseStorage
} = require("../admin");
const PdfPrinter = require("pdfmake/src/printer");
const {
	Storage
} = require("@google-cloud/storage");
const pdf2base64 = require("pdf-to-base64");
const cheerio = require("cheerio");
const {
	lowerCase,
	before
} = require("lodash");
const fs = require("fs");
const docx = require("docx");
const path = require("path");
const os = require("os");
const {
	Blob,
	Buffer
} = require("buffer");
const client = require("https");
const axios = require("axios").default;
const fetch = require("node-fetch").default;
var request = require("request");
const {
	DOMParser
} = require("xmldom");
const imageSize = require("image-size");
var HTML = require("html-parse-stringify");
const publicUrlBase = "https://storage.googleapis.com";
const mysql = require("mysql");
const latex = require("node-latex");
const nodeParse = require("node-html-parser");

exports.publicUrlBase = publicUrlBase;

const toFirestoreDate = (dateVal) => firestore.Timestamp.fromDate(dateVal);
const fromFirestoreToDate = (firestoreDate) => new firestore.Timestamp(firestoreDate.seconds, firestoreDate.nanoseconds).toDate();

exports.toFirestoreDate = toFirestoreDate;
exports.fromFirestoreToDate = fromFirestoreToDate;

const serverTimeStamp = firestore.FieldValue.serverTimestamp;

const serverTS = serverTimeStamp;
exports.serverTS = serverTS;

const requestStatus = {
	created: "CREATED",
	pending: "PENDING",
	paid: "PAID",
	completed: "COMPLETED",
};
exports.requestStatus = requestStatus;

const handleStripHTML = (html) => {
	const $ = cheerio.load(html);
	return $("p").text();
};

exports.handleStripHTML = handleStripHTML;

exports.sleep = (ms) => {
	return new Promise((resolve) => setTimeout(resolve, ms));
};

exports.createNewMockDocx = async ({
	schoolLogoURL,
	config,
	// questions, base64css,
	course,
	status,
}) => {
	try {
		// const storage = new Storage();
		const storage = firebaseStorage;
		const bucketName = `${projectId}.appspot.com`;
		// const bucket = storage.bucket(bucketName);
		const bucket = storage.bucket();

		const {
			configId
		} = config;

		const file_name = `generatorPreviews/${configId}.docx`;
		const courseQuestionsRef = await firestore().collection("mockCourseQuestions").where("courseID", "==", config.course).get();
		const questions = [];
		logger.log("Course selected: ", courseQuestionsRef.size, config);
		logger.log("Before sql connection ran:");
		courseQuestionsRef.forEach((doc) => {
			questions.push(doc.data());
			// questionsID.push(doc.data().qid);
		});

		// let jsonFile = await fetch(
		// 	"https://firebasestorage.googleapis.com/v0/b/projects-mvp.appspot.com/o/database%2FcourseContent.json?alt=media&token=0c26a52d-9815-4fe0-9cb3-0415ed768d4f"
		// );
		// jsonFile = await jsonFile.json();
		// logger.log("jsonFile: ");
		// const filtered = jsonFile.find((item) => {
		// 	return item.course_id === config.course;
		// });
		// base64css = filtered["base64css"];
		const base64css = undefined;
		const templater = async ({
			config,
			questions
		}) => {
			try {
				const {
					sectionBlock
				} = config;

				const sectionTitles = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
				const renderSections = [];

				const answerTitles = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
				const resources = [];
				const allAnswerSheet = [];
				let sections = [];
				let newQuestions = [];
				let newQuestionsIDs = [];
				let questionsToLoopOver = [];
				let usedQuestions = [];

				for (let sectionIndex = 0; sectionIndex < sectionBlock.length; sectionIndex++) {
					const questionsID = [];
					const b = sectionBlock[sectionIndex];

					const questionTotal = b.questionTotal || 10;

					const answerSheet = [];
					const questionType = lowerCase(b.questionType);
					logger.log("before questions selected:", newQuestions.length);
					newQuestions = newQuestions.filter((item) => !questionsToLoopOver.includes(item));

					if (questionType === "essay") {
						newQuestions = questions.filter((q) => lowerCase(q.qtype) === "essay");
						newQuestionsIDs = questions.filter((q) => lowerCase(q.qtype) === "essay");
					} else {
						newQuestions = questions.filter((q) => lowerCase(q.qtype) !== "essay");
						newQuestionsIDs = questions.filter((q) => lowerCase(q.qtype) !== "essay");
					}
					if (config.userId !== undefined && config.userId !== null && config.userId.length > 0) {
						if (config.repetition !== undefined && config.repetition === "no") {
							console.log("no");
							let nonRepet = [];
							let repet = [];
							let usedQues = [];
							const generated = await firestore().collection("users").doc(config.userId).collection("generated").get();
							if (!generated.empty) {
								generated.forEach((gen) => {
									usedQues = usedQues.concat(gen.data().questions);
									// logger.log(gen.data().questions)
								});
							}
							logger.log("used question: ", generated.size, usedQues.length, config.userId);
							usedQues = [...new Set(usedQues)];
							for (let newID = 0; newID < newQuestions.length; newID++) {
								const ques = newQuestions[newID];
								if (usedQues.includes(ques.qid)) {
									repet.push(ques);
									// console.log('repeated found');
								} else {
									nonRepet.push(ques);
								}
							}

							newQuestions = newQuestions.filter((item) => !usedQuestions.includes(item));

							questionsToLoopOver =
								nonRepet.length > questionTotal ?
								nonRepet.splice(0, questionTotal) :
								nonRepet.concat(repet.splice(0, questionTotal - nonRepet.length));
							// newQuestions = newQuestions.filter((item) => !nonRepet.includes(item));
							usedQuestions = [...usedQuestions, ...questionsToLoopOver];
							// questionsToLoopOver.forEach((element) => {
							// 	questionsIds.push(element.qid);
							// });
							let questionsIdsTodb = [];
							questionsToLoopOver.forEach((element) => {
								questionsIdsTodb.push(element.qid);
							});
							// await this.saveUserGeneratedQuestions({ configId: config.configId, questions: questionsIdsTodb }, config.userId);
						} else {
							console.log("yes");
							newQuestions = newQuestions.filter((item) => !usedQuestions.includes(item));

							questionsToLoopOver = newQuestions.splice(0, questionTotal);
							usedQuestions = [...usedQuestions, ...questionsToLoopOver];

							let questionsIdsTodb = [];
							questionsToLoopOver.forEach((element) => {
								questionsIdsTodb.push(element.qid);
							});

							// await this.saveUserGeneratedQuestions({ configId: config.configId, questions: questionsIdsTodb }, config.userId);
						}
					} else {
						logger.log("user not signed in", config.userId);
						newQuestions = newQuestions.filter((item) => !usedQuestions.includes(item));

						questionsToLoopOver = newQuestions.splice(0, questionTotal);
						usedQuestions = [...usedQuestions, ...questionsToLoopOver];
					}
					logger.log("questions to be used", questionsToLoopOver.length, sectionTitles[sectionIndex]);
					for (let index = 0; index < questionsToLoopOver.length; index++) {
						const element = questionsToLoopOver[index];
						questionsID.push(element.qid);
					}
					// logger.log(
					// 	"before push to section:",
					// 	sections,
					// 	sections.questionIDs ? sections.questionIDs : "supposed to be with questionIDs",
					// 	questionsToLoopOver.length,
					// 	sectionTitles[sectionIndex]
					// );

					sections.push({
						section: sectionTitles[sectionIndex],
						questionIDs: questionsID,
						questionType: questionType,
					});
				}
				logger.log("before getDataFrom:", sections, sections);
				if (schoolLogoURL) {
					const tempImgFilePath = path.join(os.tmpdir(), `${configId}.jpg`);

					logger.log("schoolLogoURL", schoolLogoURL, "image part rans");
					download(schoolLogoURL, tempImgFilePath, async () => {
						await bucket
							.upload(tempImgFilePath, {
								destination: `logos/${configId}.jpg`,
								metadata: {
									contentType: "image/jpeg",
								},
								public: true,
							})
							.then((resp) => {
								logger.log("school logo downloaded successfully", status);
								//-
								// If the callback is omitted, we'll return a Promise.
								//-
								getDataFromSQLdb(
									sections,
									config,
									status === "paid",
									`https://storage.googleapis.com/projects-mvp.appspot.com/logos/${configId}.jpg`
								);

								// const configUrl = {
								// 	action: "read",
								// 	expires: "03-17-2025",
								// };
								// bucket
								// 	.file(file_name_pdf)
								// 	// .file(`${configId}.pdf`,)
								// 	.getSignedUrl(configUrl)
								// 	.then(function (data) {
								// 		const url = data[0];
								// 		// logger.log("signed url:", url);
								// 		// firestore().collection("examConfiguration").doc(configId).set(
								// 		// 	{
								// 		// 		generatorPDFURL: url,
								// 		// 		pdfUrl: url,
								// 		// 	},
								// 		// 	{ merge: true }
								// 		// );
								// 	});
								logger.log("Uploaded pdf version successfully:", tempFilePathpdf, file_name_pdf);
								// try {
								// 	fs.accessSync(tempFilePathpdf);
								// 	fs.unlinkSync(tempFilePathpdf);
								// 	logger.log("pdf deleted afterwards");
								// } catch (error) {
								// 	logger.log("pdf deleted afterwards error:", error);
								// }
							})
							.catch((error) => {
								logger.log("image download error:", error);
							});
					});
				} else {
					getDataFromSQLdb(sections, config, status === "paid", schoolLogoURL);
				}

				const genDocPromises = sectionBlock.map(async (b, sectionIndex) => {
					const questionTotal = b.questionTotal || 10;
					const questionType = lowerCase(b.questionType);
					let newQuestions = [];
					const answerSheet = [];

					let questionsToLoopOver = [];

					if (questionType === "essay") {
						newQuestions = questions.filter((q) => lowerCase(q.qtype) === "essay");
					} else {
						newQuestions = questions.filter((q) => lowerCase(q.qtype) !== "essay");
					}

					if (config.userId !== undefined && config.userId !== null && config.userId.length > 0) {
						if (config.repetition !== undefined && config.repetition === "no") {
							console.log("no");
							let nonRepet = [];
							let repet = [];
							let usedQues = [];
							const generated = await firestore().collection("users").doc(config.userId).collection("generated").get();
							if (!generated.empty) {
								generated.forEach((gen) => {
									usedQues = usedQues.concat(gen.data().questions);
									// logger.log(gen.data().questions)
								});
							}
							logger.log("used question: ", generated.size, usedQues.length, config.userId);
							usedQues = [...new Set(usedQues)];
							newQuestions.forEach((ques) => {
								if (usedQues.includes(ques.qid)) {
									repet.push(ques);
									// console.log('repeated found');
								} else {
									nonRepet.push(ques);
								}
							});
							questionsToLoopOver =
								nonRepet.length > questionTotal ?
								nonRepet.splice(0, questionTotal) :
								nonRepet.concat(repet.splice(0, questionTotal - nonRepet.length));
							// questionsToLoopOver.forEach((element) => {
							// 	questionsIds.push(element.qid);
							// });
							let questionsIdsTodb = [];
							questionsToLoopOver.forEach((element) => {
								questionsIdsTodb.push(element.qid);
							});
							await this.saveUserGeneratedQuestions({
								configId: config.configId,
								questions: questionsIdsTodb
							}, config.userId);
						} else {
							console.log("yes");
							questionsToLoopOver = newQuestions.splice(0, questionTotal);
							let questionsIdsTodb = [];
							questionsToLoopOver.forEach((element) => {
								questionsIdsTodb.push(element.qid);
							});
							await this.saveUserGeneratedQuestions({
								configId: config.configId,
								questions: questionsIdsTodb
							}, config.userId);
						}
					} else {
						logger.log("user not signed in", config.userId);
						questionsToLoopOver = newQuestions.splice(0, questionTotal);
					}
					logger.log("questions to be used", questionsToLoopOver.length);
					const questionsID = [];
					for (let index = 0; index < questionsToLoopOver.length; index++) {
						const element = questionsToLoopOver[index];
						questionsID.push(element.qid);
					}
					// sections.push({
					// 	section: sectionTitles[sectionIndex],
					// 	questionIDs: questionsID,
					// 	questionType: questionType,
					// });
					// newQuestions.forEach((que) => {
					// 	questionsID.push(que.qid);
					// });
					// if (true) {
					// 	const tempImgFilePath = path.join(os.tmpdir(), "temp.jpg");

					// 	logger.log("schoolLogoURL", schoolLogoURL, "image part rans");
					// 	download(
					// 		"https://firebasestorage.googleapis.com/v0/b/projects-mvp.appspot.com/o/logos%2F7B0XXAYEG4.jpg?alt=media&token=52fe5895-2b9b-4d55-8cb6-00796a24937a",
					// 		tempImgFilePath,
					// 		() => {
					// 			logger.log("Processing image at:logo saved locally", tempImgFilePath);
					// 		}
					// 	);
					// } else {
					// 	getDataFromSQLdb(questionsID, configId, false, config);
					// }
					if (questionType === "essay") {
						let numbers = 0;

						const children = [];

						questionsToLoopOver.forEach((q, i) => {
							numbers += 1;

							if (handleStripHTML(q.text)) {
								children.push(
									new docx.Paragraph({
										text: `${numbers}. ${handleStripHTML(q.text)}`,
									})
								);
								q.answers.forEach((a, idx) => {
									children.push(
										new docx.Paragraph({
											text: `${answerTitles[idx]}. ${handleStripHTML(a.text)} `,
											spacing: {
												after: 100,
											},
										})
									);
								});
							} else {
								children.push(
									new docx.Paragraph({
										text: `${numbers}. ${handleStripHTML(q.answers[0].text)}`,
										spacing: {
											after: 100,
										},
									})
								);
							}
						});

						// console.log({ children });

						renderSections.push({
							children: [
								new docx.Paragraph({
									text: `SECTION ${sectionTitles[sectionIndex]}`,
									alignment: docx.AlignmentType.CENTER,
									style: "beginTest",
								}),
							],
						}, {
							properties: {
								type: docx.SectionType.CONTINUOUS,
								column: {
									space: 708,
									count: 2,
								},
							},
							children,
						}, {
							properties: {
								type: docx.SectionType.CONTINUOUS,
							},
							children: [
								new docx.Paragraph({
									text: `END OF SECTION ${sectionTitles[sectionIndex]}`,
									alignment: docx.AlignmentType.CENTER,
									style: "endoftest",
								}),
							],
						});
					} else {
						let numbers = 0;

						const children = [];
						questionsToLoopOver.forEach((q, i) => {
							numbers += 1;
							logger.log(
								"images list to see: ",
								q.images,
								String(course).toLowerCase(),
								String(course).toLowerCase() === "mathematics",
								"resource follows:",
								q.resource,
								String(course).toLowerCase() === "mathematics",
								String(course).toLocaleLowerCase() === "science"
							);

							const answers = q.answers.map((a, idx) => {
								return new docx.TextRun({
									text: `\t${answerTitles[idx]}. `,
									break: 1
								});
								// return new docx.TextRun({ text: `\t${answerTitles[idx]}. ` });

								// return handleMath_TextStyle(
								// 	null,
								// 	answerTitles[idx],
								// 	true,
								// 	q.images !== undefined && q.images.length > 0 ? q.images : undefined,
								// 	String(course).toLowerCase() === "mathematics" || String(course).toLocaleLowerCase() === "science"
								// );
							});

							if (q.resource) {
								if (!resources.includes(q.resource)) {
									resources.push(q.resource);
									logger.log(
										"resources: ",
										q.resource,
										"mathematics: ",
										String(course).toLowerCase() === "mathematics" || String(course).toLocaleLowerCase() === "science"
									);

									if (String(q.resource).length > 0) {
										children.push(
											handleMath_TextStyle(
												q.resource,
												undefined,
												false,
												q.images !== undefined && q.images.length > 0 ? q.images : undefined,
												String(course).toLowerCase() === "mathematics" || String(course).toLocaleLowerCase() === "science"
											)
											// new docx.Paragraph({
											// 	text: `${handleStripHTML(q.resource)}`,
											// 	spacing: {
											// 		after: 200,
											// 	},
											// })
										);
									}

									children.push(
										handleMath_TextStyle(
											q.text,
											numbers,
											true,
											q.images !== undefined && q.images.length > 0 ? q.images : undefined,

											String(course).toLowerCase() === "mathematics" || String(course).toLocaleLowerCase() === "science"
										),
										// ...answers
										new docx.Paragraph({
											spacing: {
												// before: 100,
												after: 100,
											},
											tabStops: [{
												type: docx.TabStopType.LEFT,
												position: 200,
											}, ],
											children: [
												// new docx.TextRun({
												// 	text: `${numbers}. ${handleStripHTML(q.text)}`,
												// }),
												...answers,
											],
										})
									);
								} else {
									children.push(
										handleMath_TextStyle(
											q.text,
											numbers,
											true,
											q.images !== undefined && q.images.length > 0 ? q.images : undefined,
											String(course).toLowerCase() === "mathematics" || String(course).toLocaleLowerCase() === "science"
										),
										// ...answers
										new docx.Paragraph({
											spacing: {
												before: 300,
												after: 100,
											},
											tabStops: [{
												type: docx.TabStopType.LEFT,
												position: 200,
											}, ],
											children: [
												// new docx.TextRun({
												// 	text: `${numbers}. ${handleStripHTML(q.text)}`,
												// }),
												...answers,
											],
										})
									);
								}
							} else {
								children.push(
									handleMath_TextStyle(
										q.text,
										numbers,
										true,
										q.images !== undefined && q.images.length > 0 ? q.images : undefined,
										String(course).toLowerCase() === "mathematics" || String(course).toLocaleLowerCase() === "science"
									),
									// ...answers
									new docx.Paragraph({
										spacing: {
											// before: 100,
											after: 100,
										},
										tabStops: [{
											type: docx.TabStopType.LEFT,
											position: 200,
										}, ],
										children: [
											// new docx.TextRun({
											// 	text: `${numbers}. ${handleStripHTML(q.text)}`,
											// }),
											...answers,
										],
									})
								);
							}
						});

						renderSections.push({
							children: [
								new docx.Paragraph({
									text: `SECTION ${sectionTitles[sectionIndex]}`,
									alignment: docx.AlignmentType.CENTER,
									style: "beginTest",
								}),
							],
						}, {
							properties: {
								type: docx.SectionType.CONTINUOUS,
								column: {
									space: 708,
									count: 2,
								},
							},
							children,
						}, {
							properties: {
								type: docx.SectionType.CONTINUOUS,
							},
							children: [
								new docx.Paragraph({
									text: `END OF SECTION ${sectionTitles[sectionIndex]}`,
									alignment: docx.AlignmentType.CENTER,
									style: "endoftest",
								}),
							],
						});
					}
				});

				// console.log(renderSections);

				await Promise.all(genDocPromises);

				return renderSections;
			} catch (error) {
				logger.error(error);
			}
		};

		const docxGenerator = async (schoolLogoURL, config, questions) => {
			// the fonts live in the functions/fonts/ subdirectory
			const {
				configId,
				examInstructions,
				course,
				examDate,
				examTitle,
				schoolName,
				sectionBlock,
				schoolLogo
			} = config;

			const sections = await templater({
				config,
				questions
			});
			return new Promise((resolve, reject) => {
				let durationInHrs = 0;
				let sectionTypes = [];
				let sectionType = "";
				let courseName = course.includes("eng") ?
					"English" :
					course.includes("math") ?
					"Mathematics" :
					course.includes("sci") ?
					"Science" :
					course.includes("rme") ?
					"RME" :
					"";
				sectionBlock.forEach((it, ind) => {
					durationInHrs += it.sectionDuration / 60;
					sectionTypes.push(it.questionType === "multiple" ? "Objectives" : it.questionType === "essay" ? "Essay" : "fill");
				});
				sectionTypes = [...new Set(sectionTypes)];
				sectionType = sectionTypes.join(" & ");
				const tempImgFilePath = path.join(os.tmpdir(), "temp.jpg");

				if (schoolLogoURL) {
					logger.log("schoolLogoURL before download", schoolLogoURL);
					// download(schoolLogoURL, tempImgFilePath, () => {
					// 	logger.log("Processing image at ", tempImgFilePath);
					// 	// docChildren.unshift(
					// 	const imageRun = new docx.Paragraph({
					// 		children: [
					// 			new docx.ImageRun({
					// 				data: fs.readFileSync(tempImgFilePath),
					// 				transformation: {
					// 					width: 75,
					// 					height: 75,
					// 				},
					// 			}),
					// 		],
					// 		style: "aside2",
					// 	});
					// 	// );
					const docChildren = header1(
						examTitle,
						examDate,
						courseName,
						schoolName,
						sectionType,
						durationInHrs,
						examInstructions
						// imageRun
					);

					// 	logger.log("docChildren 1 in create new mock docx:", docChildren);
					// 	logger.log("sections 1 in create new mock docx:", sections);
					return returnDocument(resolve, file_name, configId, bucket, docChildren, sections);
					// });
				} else {
					const docChildren = header1(examTitle, examDate, courseName, schoolName, sectionType, durationInHrs, examInstructions);

					logger.log("docChildren 2 in create new mock docx:", docChildren);
					logger.log("sections 2 in create new mock docx:", sections);
					return returnDocument(resolve, file_name, configId, bucket, docChildren, sections);
				}
			});
		};

		const filename = await docxGenerator(schoolLogoURL, config, questions); // create file
		const generatorPDFURL = `${publicUrlBase}/${bucketName}/${filename}`;
		logger.log(`DOCX stored at ${bucketName}/${filename}`);
		logger.log(`DOCX accessible at ${generatorPDFURL}`);
		let timeStamp = new Date().getTime();

		return {
			generatorPDFURL,
			timeStamp
		};
	} catch (error) {
		logger.error(error);
		return false;
	}
};

exports.createDownloadableMockDocx = async ({
	schoolLogoURL,
	config,
	questions
}) => {
	try {
		logger.log("create downloadable ran", schoolLogoURL);
		// const storage = new Storage();
		const storage = firebaseStorage;

		const bucketName = `${projectId}.appspot.com`;
		// const bucket = storage.bucket(bucketName);
		const bucket = storage.bucket();

		const {
			configId
		} = config;

		const file_name = `generatorDownloads/${configId}.docx`;

		const templater = async ({
			config,
			questions
		}) => {
			try {
				const {
					sectionBlock
				} = config;

				const sectionTitles = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
				const renderSections = [];

				const answerTitles = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
				const resources = [];
				const allAnswerSheet = [];
				let newQuestions = [];

				const genDocPromises = sectionBlock.map(async (b, sectionIndex) => {
					const questionTotal = b.questionTotal || 10;
					const questionType = lowerCase(b.questionType);
					const answerSheet = [];
					const explanation = [];
					const children = [];

					let questionsToLoopOver = [];

					if (questionType === "essay") {
						newQuestions = questions.filter((q) => lowerCase(q.qtype) === "essay");
					} else {
						newQuestions = questions.filter((q) => lowerCase(q.qtype) !== "essay");
					}

					if (config.userId !== undefined && config.userId !== null && config.userId.length > 0) {
						if (config.repetition !== undefined && config.repetition === "no") {
							console.log("no");
							let nonRepet = [];
							let repet = [];
							let usedQues = [];
							const generated = await firestore().collection("users").doc(config.userId).collection("generated").get();
							if (!generated.empty) {
								generated.forEach((gen) => {
									usedQues = usedQues.concat(gen.data().questions);
									// logger.log(gen.data().questions)
								});
							}
							logger.log("used question: ", generated.size, usedQues.length, config.userId);
							usedQues = [...new Set(usedQues)];
							newQuestions.forEach((ques) => {
								if (usedQues.includes(ques.qid)) {
									repet.push(ques);
									// console.log('repeated found');
								} else {
									nonRepet.push(ques);
								}
							});
							questionsToLoopOver =
								nonRepet.length > questionTotal ?
								nonRepet.splice(0, questionTotal) :
								nonRepet.concat(repet.splice(0, questionTotal - nonRepet.length));
							let questionsIds = [];
							questionsToLoopOver.forEach((element) => {
								questionsIds.push(element.qid);
							});
							await this.saveUserGeneratedQuestions({
								configId: config.configId,
								questions: questionsIds
							}, config.userId);
						} else {
							console.log("yes");
							questionsToLoopOver = newQuestions.splice(0, questionTotal);
							let questionsIds = [];
							questionsToLoopOver.forEach((element) => {
								questionsIds.push(element.qid);
							});
							await this.saveUserGeneratedQuestions({
								configId: config.configId,
								questions: questionsIds
							}, config.userId);
						}
					} else {
						logger.log("user not signed in", config.userId);
						questionsToLoopOver = newQuestions.splice(0, questionTotal);
					}

					if (questionType === "essay") {
						let numbers = 0;

						const children = [];

						questionsToLoopOver.forEach((q, i) => {
							numbers += 1;

							if (handleStripHTML(q.text)) {
								children.push(
									new docx.Paragraph({
										text: `${numbers}. ${handleStripHTML(q.text)}`,
									})
								);
								q.answers.forEach((a, idx) => {
									children.push(
										new docx.Paragraph({
											text: `${answerTitles[idx]}. ${handleStripHTML(a.text)} `,
											spacing: {
												after: 100,
											},
										})
									);
								});
							} else {
								children.push(
									new docx.Paragraph({
										text: `${numbers}. ${handleStripHTML(q.answers[0].text)}`,
										spacing: {
											after: 100,
										},
									})
								);
							}
						});

						// console.log({ children });

						renderSections.push({
							children: [
								new docx.Paragraph({
									text: `SECTION ${sectionTitles[sectionIndex]}`,
									alignment: docx.AlignmentType.CENTER,
									style: "beginTest",
								}),
							],
						}, {
							properties: {
								type: docx.SectionType.CONTINUOUS,
								column: {
									space: 708,
									count: 2,
								},
							},
							children,
						}, {
							properties: {
								type: docx.SectionType.CONTINUOUS,
							},
							children: [
								new docx.Paragraph({
									text: `END OF SECTION ${sectionTitles[sectionIndex]}`,
									alignment: docx.AlignmentType.CENTER,
									style: "endoftest",
								}),
							],
						});
					} else {
						let numbers = 0;

						questionsToLoopOver.forEach((q, i) => {
							numbers += 1;
							const answers = q.answers.map((a, idx) => {
								return new docx.TextRun({
									text: `\t${answerTitles[idx]}. ${handleStripHTML(a.text)} `,
									break: 1
								});
							});
							const correctAnswer = q.answers
								.map((a, idx) => {
									return {
										...a,
										answerTitle: answerTitles[idx],
									};
								})
								.find((a, idx) => {
									return a.value === "1";
								});

							if (correctAnswer) {
								answerSheet.push(new docx.TextRun(`${numbers}. ${correctAnswer.answerTitle}  `));
								explanation.push(new docx.TextRun(`${numbers}. ${correctAnswer.solution}   `));
							}

							if (q.resource) {
								if (!resources.includes(q.resource)) {
									resources.push(q.resource);
									children.push(
										new docx.Paragraph({
											text: `${handleStripHTML(q.resource)}`,
											spacing: {
												after: 200,
											},
										})
									);

									children.push(
										new docx.Paragraph({
											spacing: {
												before: 100,
												after: 100,
											},
											tabStops: [{
												type: docx.TabStopType.LEFT,
												position: 200,
											}, ],
											children: [
												new docx.TextRun({
													text: `${numbers}. ${handleStripHTML(q.text)}`,
												}),
												...answers,
											],
										})
									);
								} else {
									children.push(
										new docx.Paragraph({
											spacing: {
												before: 300,
												after: 100,
											},
											tabStops: [{
												type: docx.TabStopType.LEFT,
												position: 200,
											}, ],
											children: [
												new docx.TextRun({
													text: `${numbers}. ${handleStripHTML(q.text)}`,
												}),
												...answers,
											],
										})
									);
								}
							} else {
								children.push(
									new docx.Paragraph({
										spacing: {
											before: 100,
											after: 100,
										},
										tabStops: [{
											type: docx.TabStopType.LEFT,
											position: 200,
										}, ],
										children: [
											new docx.TextRun({
												text: `${numbers}. ${handleStripHTML(q.text)}`,
											}),
											...answers,
										],
									})
								);
							}
						});

						allAnswerSheet.push({
							properties: {
								type: allAnswerSheet.length > 0 ? docx.SectionType.CONTINUOUS : docx.SectionType.NEXT_PAGE
							},
							children: [
								new docx.Paragraph({
									alignment: docx.AlignmentType.CENTER,
									children: [
										new docx.TextRun({
											text: `SECTION ${sectionTitles[sectionIndex]} ANSWER SHEET`,
											size: 40,
											bold: true,
										}),
									],
								}),

								new docx.Paragraph({
									spacing: {
										before: 200,
										after: 200,
									},
									alignment: docx.AlignmentType.CENTER,
									children: [
										new docx.TextRun({
											text: "Get more "
										}),
										new docx.TextRun({
											text: "Questions ",
											bold: true
										}),
										new docx.TextRun({
											text: "and "
										}),
										new docx.TextRun({
											text: "Answers ",
											bold: true
										}),
										new docx.TextRun({
											text: "from "
										}),
										new docx.TextRun({
											text: "quizmine.africa ",
											bold: true
										}),
										new docx.TextRun({
											text: "| contact: info@quizmine.africa",
										}),
									],
								}),

								new docx.Paragraph({
									children: answerSheet,
								}),
								new docx.Paragraph({
									alignment: docx.AlignmentType.CENTER,
									spacing: {
										before: 200,
										after: 200,
									},
									children: [
										new docx.TextRun({
											text: "EXPLANATION",
											size: 30,
											bold: true,
										}),
									],
								}),
							],
						}, {
							properties: {
								type: docx.SectionType.CONTINUOUS,
								column: {
									space: 700,
									count: 2,
								},
							},
							children: [
								new docx.Paragraph({
									children: [...explanation],
								}),
							],
						});

						renderSections.push({
							children: [
								new docx.Paragraph({
									text: `SECTION ${sectionTitles[sectionIndex]}`,
									alignment: docx.AlignmentType.CENTER,
									style: "beginTest",
								}),
							],
						}, {
							properties: {
								type: docx.SectionType.CONTINUOUS,
								column: {
									space: 708,
									count: 2,
								},
							},
							children,
						}, {
							properties: {
								type: docx.SectionType.CONTINUOUS,
							},
							children: [
								new docx.Paragraph({
									text: `END OF SECTION ${sectionTitles[sectionIndex]}`,
									alignment: docx.AlignmentType.CENTER,
									style: "endoftest",
								}),
							],
						});
					}
				});

				// console.log(renderSections);

				await Promise.all(genDocPromises);

				const sectionsPlusAnswerSheet = [...renderSections, ...allAnswerSheet];

				return sectionsPlusAnswerSheet;
			} catch (error) {
				logger.error(error);
			}
		};

		const docxGenerator = async (schoolLogoURL, config, questions) => {
			// the fonts live in the functions/fonts/ subdirectory
			const {
				configId,
				examInstructions,
				course,
				examDate,
				examTitle,
				schoolName,
				sectionBlock,
				schoolLogo
			} = config;

			const sections = await templater({
				config,
				questions
			});
			return new Promise((resolve, reject) => {
				let durationInHrs = 0;
				let sectionTypes = [];
				let sectionType = "";
				let courseName = course.includes("eng") ?
					"English" :
					course.includes("math") ?
					"Mathematics" :
					course.includes("sci") ?
					"Science" :
					course.includes("rme") ?
					"RME" :
					"";
				sectionBlock.forEach((it, ind) => {
					durationInHrs += it.sectionDuration / 60;
					sectionTypes.push(it.questionType === "multiple" ? "Objectives" : it.questionType === "essay" ? "Essay" : "fill in");
				});
				sectionTypes = [...new Set(sectionTypes)];
				sectionType = sectionTypes.join(" & ");
				const tempImgFilePath = path.join(os.tmpdir(), "temp.jpg");

				if (schoolLogoURL) {
					logger.log("schoolLogoURL", schoolLogoURL);
					download(schoolLogoURL, tempImgFilePath, () => {
						logger.log("Processing image at ", tempImgFilePath);
						// docChildren.unshift(
						const imageRun = new docx.Paragraph({
							children: [
								new docx.ImageRun({
									data: fs.readFileSync(tempImgFilePath),
									transformation: {
										width: 75,
										height: 75,
									},
								}),
							],
							style: "aside2",
						});
						// );
						const docChildren = header1(
							examTitle,
							examDate,
							courseName,
							schoolName,
							sectionType,
							durationInHrs,
							examInstructions,
							imageRun
						);

						logger.log("docChildren 1 in create new mock docx:", docChildren);
						logger.log("sections 1 in create new mock docx:", sections);
						return returnDocument(resolve, file_name, configId, bucket, docChildren, sections, schoolLogoURL);
					});
				} else {
					const docChildren = header1(examTitle, examDate, courseName, schoolName, sectionType, durationInHrs, examInstructions);

					logger.log("docChildren 2 in create new mock docx:", docChildren);
					logger.log("sections 2 in create new mock docx:", sections);
					return returnDocument(resolve, file_name, configId, bucket, docChildren, sections);
				}
			});
		};

		const filename = await docxGenerator(schoolLogoURL, config, questions); // create file
		const generatorPDFURL = `${publicUrlBase}/${bucketName}/${filename}`;
		logger.log(`DOCX stored at ${bucketName}/${filename}`);
		logger.log(`DOCX accessible at ${generatorPDFURL}`);
		let timeStamp = new Date().getTime();

		return {
			generatorPDFURL,
			timeStamp
		};
	} catch (error) {
		logger.error(error);
		return false;
	}
};

const download = (uri, filename, callback) => {
	request.head(uri, (err, res, body) => {
		request(uri).pipe(fs.createWriteStream(filename)).on("close", callback);
	});
};
// const downloadPdfFile = (uri, data, filename, callback, error) => {
// 	axios
// 		.post(uri, data, {
// 			responseType: "stream",
// 		})
// 		.then((response) => {
// 			console.log("data", response.data);
// 			response.data.pipe(fs.createWriteStream(filename));
// 			callback("done");
// 		})
// 		.catch((err) => error(err));
// };
const generatePDFfile = (uri, data, callback, error) => {
	axios
		.post(uri, data, {})
		.then((response) => {
			console.log("data", response.data);
			response.data.pipe(fs.createWriteStream(filename));
			callback("done");
		})
		.catch((err) => error(err));
};
// exports.downloadPdfFile = downloadPdfFile;
exports.generatePDFfile = generatePDFfile;
// const downloadPdfFile =(uri,data,filename,callback)=>{
// axios.post(uri,)
// }
exports.download = download;

const returnDocument = (resolve, file_name, configId, bucket, docChildren, sections, schoolLogoURL = null) => {
	const doc = new docx.Document({
		styles: {
			paragraphStyles: [{
					id: "beginTest",
					name: "beginTest",
					basedOn: "Normal",
					next: "Normal",
					run: {
						color: "000000",
						size: 40,
						bold: true,
					},
					paragraph: {
						spacing: {
							after: 100,
						},
					},
				},
				{
					id: "endoftest",
					name: "endoftest",
					basedOn: "Normal",
					next: "Normal",
					run: {
						color: "000000",
						size: 40,
						bold: true,
					},
				},
				{
					id: "answerKey",
					name: "answerKey",
					basedOn: "Normal",
					next: "Normal",
					run: {
						color: "000000",
						size: 30,
						bold: true,
					},
					paragraph: {
						spacing: {
							after: 100,
						},
					},
				},
				{
					id: "aside1",
					name: "Aside 1",
					basedOn: "Normal",
					next: "Normal",
					run: {
						color: "000000",
						size: 100,
						bold: true,
					},
					paragraph: {
						spacing: {
							// before: 5500,
							before: schoolLogoURL ? 0 : 5500,
						},
					},
				},
				{
					id: "aside2",
					name: "Aside 2",
					basedOn: "Normal",
					next: "Normal",
					run: {
						color: "000000",
						size: 100,
						bold: true,
					},
					paragraph: {
						spacing: {
							before: 5500,
						},
					},
				},
				{
					id: "other",
					name: "Other",
					basedOn: "Normal",
					next: "Normal",
					run: {
						color: "000000",
						size: 70,
					},
				},
			],
		},
		sections: [{
				properties: {},
				children: docChildren,
			},
			...sections,
		],
	});

	const tempFilePath = path.join(os.tmpdir(), `${configId}.docx`);

	docx.Packer.toBase64String(doc).then((documentBuffer) => {
		let buf1 = Buffer.from(documentBuffer, "base64");

		fs.writeFile(tempFilePath, buf1, async () => {
			await bucket.upload(tempFilePath, {
				destination: file_name,
				metadata: {
					contentType: "application/docx",
				},
				public: true,
			});
			return resolve(file_name);
		});
	});
};

const header1 = (examTitle, examDate, course, schoolName, sectionType, durationInHrs, examInstructions, imageRun) => {
	const h = [
		new docx.TableCell({
			borders: {
				top: {
					style: docx.BorderStyle.THICK,
					size: 20,
					color: "000000"
				},
				bottom: {
					style: docx.BorderStyle.THICK,
					size: 20,
					color: "000000"
				},
				left: {
					style: docx.BorderStyle.THICK,
					size: 20,
					color: "000000"
				},

				right: {
					style: docx.BorderStyle.NONE,
					size: 0,
					color: "FFFFFF"
				},
			},
			rowSpan: 2,
			margins: {
				top: docx.convertInchesToTwip(0.1),
				bottom: docx.convertInchesToTwip(0.1),
				left: docx.convertInchesToTwip(0.1),
				right: docx.convertInchesToTwip(0.1),
			},

			children: [
				new docx.Paragraph({
					children: [
						new docx.TextRun({
							text: examTitle ? `${examTitle}\n`.toUpperCase() : "",
							bold: true,
						}),
					],
				}),
				new docx.Paragraph({
					children: [
						new docx.TextRun({
							text: examDate ? `${examDate}\n`.toUpperCase() : "",
						}),
					],
				}),
				new docx.Paragraph({
					children: [
						new docx.TextRun({
							text: `${course.toUpperCase()}`,
							bold: true,
						}),
					],
				}),
				new docx.Paragraph({
					children: [
						new docx.TextRun({
							text: `${sectionType}`,
							bold: true,
						}),
					],
				}),
				new docx.Paragraph({
					children: [
						new docx.TextRun({
							text: `${durationInHrs.toFixed(1)} HOURS`,
							bold: true,
						}),
					],
				}),
			],
		}),
		new docx.TableCell({
			borders: {
				top: {
					style: docx.BorderStyle.THICK,
					size: 20,
					color: "000000"
				},
				bottom: {
					style: docx.BorderStyle.THICK,
					size: 20,
					color: "000000"
				},

				left: {
					style: docx.BorderStyle.NONE,
					size: 0,
					color: "FFFFFF"
				},
				right: {
					style: docx.BorderStyle.THICK,
					size: 20,
					color: "000000"
				},
			},
			margins: {
				top: docx.convertInchesToTwip(0.1),
				bottom: docx.convertInchesToTwip(0.1),
				left: docx.convertInchesToTwip(0.1),
				right: docx.convertInchesToTwip(0.1),
			},
			verticalAlign: docx.VerticalAlign.CENTER,

			children: [
				new docx.Paragraph({
					children: [
						new docx.TextRun({
							text: "2 & 1",
							bold: true,
							size: 45,
						}),
					],
				}),
			],
		}),
		new docx.TableCell({
			margins: {
				top: docx.convertInchesToTwip(0.1),
				bottom: docx.convertInchesToTwip(0.1),
				left: docx.convertInchesToTwip(0.3),
				right: docx.convertInchesToTwip(0.1),
			},
			borders: {
				top: {
					style: docx.BorderStyle.NONE,
					size: 0,
					color: "FFFFFF"
				},
				bottom: {
					style: docx.BorderStyle.NONE,
					size: 0,
					color: "FFFFFF"
				},

				right: {
					style: docx.BorderStyle.NONE,
					size: 0,
					color: "FFFFFF"
				},
			},
			children: [
				new docx.Paragraph({
					children: [
						new docx.TextRun({
							text: "Name:.............................................",
							bold: true,
						}),
					],
				}),
				new docx.Paragraph({
					children: [
						new docx.TextRun({
							text: "Index Number:...................................",
							bold: true,
						}),
					],
					spacing: {
						before: 200,
						after: 200,
					},
				}),
			],
		}),
	];
	if (imageRun) {
		h.unshift(
			new docx.TableCell({
				margins: {
					top: docx.convertInchesToTwip(0.1),
					bottom: docx.convertInchesToTwip(0.1),
					left: docx.convertInchesToTwip(0.1),
					right: docx.convertInchesToTwip(0.1),
				},
				borders: {
					top: {
						style: docx.BorderStyle.NONE,
						size: 0,
						color: "FFFFFF"
					},
					bottom: {
						style: docx.BorderStyle.NONE,
						size: 0,
						color: "FFFFFF"
					},
					left: {
						style: docx.BorderStyle.NONE,
						size: 0,
						color: "FFFFFF"
					},

					right: {
						style: docx.BorderStyle.NONE,
						size: 0,
						color: "FFFFFF"
					},
				},
				verticalAlign: docx.VerticalAlign.CENTER,

				children: [imageRun],
			})
		);
	}
	return [
		new docx.Table({
			borders: {},
			columnWidths: [3000, 1000, 3000],

			rows: [
				new docx.TableRow({
					children: h,
				}),
			],
		}),
		new docx.Paragraph({
			children: [
				new docx.TextRun({
					text: examTitle ? `${examTitle}`.toUpperCase() : "",
					bold: true,
					size: 30,
				}),
			],
			alignment: docx.AlignmentType.CENTER,
			spacing: {
				before: 200,
				after: 200,
			},
		}),
		new docx.Paragraph({
			children: [
				new docx.TextRun({
					text: `${schoolName}`,
					bold: true,
				}),
			],
			alignment: docx.AlignmentType.CENTER,
			spacing: {
				before: 200,
				after: 200,
			},
		}),
		new docx.Paragraph({
			spacing: {
				before: 200,
				after: 200,
			},
			alignment: docx.AlignmentType.CENTER,
			children: [
				new docx.TextRun({
					text: examDate ? `${examDate.toUpperCase()}\n\t` : "",
					bold: true
				}),
				new docx.TextRun({
					text: examTitle ? `\t\t${examTitle}\t`.toUpperCase() : "",
					bold: true
				}),
				new docx.TextRun({
					text: `\t\t${durationInHrs.toFixed(1)} HOURS`,
					bold: true
				}),
			],
			tabStops: [{
					type: docx.TabStopType.LEFT,
					position: 2268,
				},
				{
					type: docx.TabStopType.CENTER,
					position: 2268,
				},
				{
					type: docx.TabStopType.RIGHT,
					position: 2268,
				},
			],
		}),
		new docx.Paragraph({
			alignment: docx.AlignmentType.CENTER,
			children: [new docx.TextRun({
				text: "EXAMINATION INSTRUCTION",
				bold: true
			})],
		}),
		new docx.Paragraph({
			alignment: docx.AlignmentType.CENTER,
			children: [new docx.TextRun({
				text: `${examInstructions || ""}`,
				bold: true
			})],
		}),
	];
};
exports.saveUserGeneratedQuestions = async (data, userId) => {
	const docRef = firestore().collection("users").doc(userId).collection("generated").doc(data.configId);
	await docRef.set({
		id: docRef.id,
		...data,
	});
};
const handleMath_TextStyle = (html, number_option, showOption, imgR, useFormulas) => {
	try {
		const image = (imageKey) => {
			if (imgR && imgR.length > 0) {
				let imageData = null;
				for (let index = 0; index < imgR.length; index++) {
					const element = imgR[index];
					if (element.key === imageKey) {
						imageData = element.image.replace(/^data:image\/[a-z]+;base64,/, "");
						break;
					}
				}
				return imageData;
			}
		};
		const imgDim = (base64URI) => {
			const imgbuf = Buffer.from(base64URI, "base64");
			const dim = imageSize(imgbuf);

			return {
				width: dim.width,
				height: dim.height,
			};
		};
		// let que =
		// 	"<p>In the diagram below, |<i>AB</i>| is parallel to |<i>CD</i>|. angles <i>a</i> and <i>b</i> are<img class='8f1f43ba129018b1de0f6853a5dda7b8ef6636b949d71c6da466a28f8d13daf9'></p>";
		let parser = new DOMParser();
		let textRun = [];
		textRun.push(
			new docx.TextRun({
				text: `${number_option}.`,
			})
		);
		// if (html) {
		let docf = parser.parseFromString(html, "text/html");
		let element = docf.getElementsByTagName("*");

		logger.log("Elements details: ", element.length, element[0].childNodes[0].nodeName, element[0].tagName);
		const textList = [];
		const innerTagsList = [];

		// for (let x = 0; x < element.length; x++) {
		// 	console.log(element[x].innerText, "each identified tag:", element[x].tagName, element[x].getAttribute("class"));
		// 	if (element[x].childNodes.length > 1) {
		// 		for (let y = 0; y < element[x].childNodes.length; y++) {
		// 			textList.push({
		// 				tag: element[x].tagName,
		// 				text: element[x].childNodes[y].nodeValue,
		// 			});
		// 		}
		// 	} else {
		// 		if (element[x].children.length === 0) {
		// 			innerTagsList.push({
		// 				tag: element[x].tagName,
		// 				text: element[x].textContent,
		// 			});
		// 		}
		// 	}
		// }
		// logger.log("text list:", textList, "inner tag:", innerTagsList);
		// for (let z = 0; z < textList.length; z++) {
		// 	if (textList[z].text === null) {
		// 		let spliced = innerTagsList.splice(0, 1);
		// 		console.log("spliced: ", spliced);
		// 		textList[z].tag = spliced[0].tag;
		// 		textList[z].text = spliced[0].text;
		// 	}
		// }
		// logger.log("text list:", textList, "inner tag:", innerTagsList);

		// for (let x = 0; x < element.length; x++) {
		// 	console.log(element[x].innerText, "each identified tag:", element[x].tagName, element[x].getAttribute("class"));
		// 	if (element[x].childNodes.length > 1) {
		// 		for (let y = 0; y < element[x].childNodes.length; y++) {
		// 			textList.push({
		// 				tag: element[x].tagName,
		// 				text: element[x].childNodes[y].nodeValue,
		// 			});
		// 		}
		// 	} else {
		// 		textList.push({
		// 			tag: element[x].tagName,
		// 			text: element[x].textContent,
		// 		});
		// 	}
		// }
		// logger.log(
		// 	"innerTagList:",
		// 	innerTagsList.length,
		// 	"content: ",
		// 	innerTagsList,
		// 	"textList: ",
		// 	textList.length,
		// 	"textList content:",
		// 	textList
		// );
		//other tags
		let others = [];
		for (let x = 0; x < element.length; x++) {
			if (element[x].childNodes.length === 0) {
				others.push({
					tag: element[x].tagName,
					text: element[x].tagName.toLowerCase() === "img" ? element[x].getAttribute("class") : element[x].textContent,
				});
			}
		}
		const getText = (tag) => {
			let value = null;
			for (let index = 0; index < others.length; index++) {
				const l = others[index];
				if (l.tag === tag) {
					value = l.text;
					break;
				}
			}
			return value;
		};
		// if (element[0].childNodes.length >= 0) {
		// 	for (let y = 0; y < element[0].childNodes.length; y++) {
		// 		logger.log(
		// 			"node value: ",
		// 			element[0].childNodes[y].nodeValue,
		// 			"child node of p: ",
		// 			element[0].childNodes.length,
		// 			"node name:",
		// 			element[0].childNodes[y].nodeName,
		// 			"others:",
		// 			others,
		// 			others.length
		// 		);
		// 		// textList.push({
		// 		// 	tag: element[x].tagName,
		// 		// 	text: element[x].childNodes[y].nodeValue,
		// 		// });
		// 		textRun.push(
		// 			element[0].childNodes[y].nodeName.toLowerCase() !== "img"
		// 				? new docx.TextRun({
		// 						text: "Not image",
		// 						italics:
		// 							element[0].childNodes[y].nodeName.toUpperCase() === "I" || element[0].childNodes[y].nodeName.toUpperCase() === "EM",
		// 						bold:
		// 							element[0].childNodes[y].nodeName.toUpperCase() === "STRONG" || element[0].childNodes[y].nodeName.toUpperCase() === "B",
		// 				  })
		// 				: element[0].childNodes[y].nodeName.toLowerCase() === "img"
		// 				? new docx.TextRun({
		// 						text: "Image to show",
		// 				  })
		// 				: new docx.TextRun({
		// 						text: "Not image again",
		// 						italics:
		// 							element[0].childNodes[y].nodeName.toUpperCase() === "I" || element[0].childNodes[y].nodeName.toUpperCase() === "EM",
		// 						bold:
		// 							element[0].childNodes[y].nodeName.toUpperCase() === "STRONG" || element[0].childNodes[y].nodeName.toUpperCase() === "B",
		// 				  })
		// 			// element[0].childNodes[y].nodeName.toLowerCase() !== "img"
		// 			// 	? new docx.TextRun({
		// 			// 			text: element[0].childNodes[y].nodeValue,
		// 			// 			italics:
		// 			// 				element[0].childNodes[y].nodeName.toUpperCase() === "I" || element[0].childNodes[y].nodeName.toUpperCase() === "EM",
		// 			// 			bold:
		// 			// 				element[0].childNodes[y].nodeName.toUpperCase() === "STRONG" || element[0].childNodes[y].nodeName.toUpperCase() === "B",
		// 			// 	  })
		// 			// 	: element[0].childNodes[y].nodeName.toLowerCase() === "img"
		// 			// 	? new docx.ImageRun({
		// 			// 			data: image(getText(element[0].childNodes[y].nodeName)),
		// 			// 			// data: img,
		// 			// 			transformation: {
		// 			// 				width: imgDim(image(getText(element[0].childNodes[y].nodeName))).width,
		// 			// 				height: imgDim(image(getText(element[0].childNodes[y].nodeName))).height,
		// 			// 			},
		// 			// 	  })
		// 			// 	: new docx.TextRun({
		// 			// 			text: element[0].childNodes[y].nodeValue,
		// 			// 			italics:
		// 			// 				element[0].childNodes[y].nodeName.toUpperCase() === "I" || element[0].childNodes[y].nodeName.toUpperCase() === "EM",
		// 			// 			bold:
		// 			// 				element[0].childNodes[y].nodeName.toUpperCase() === "STRONG" || element[0].childNodes[y].nodeName.toUpperCase() === "B",
		// 			// 	  })
		// 		);
		// 	}
		// } else {
		// 	// if (element[x].children.length === 0) {
		// 	textRun.push(
		// 		element[0].tagName.toLowerCase() === "img"
		// 			? new docx.ImageRun({
		// 					data: image(element[0].getAttribute("class")),
		// 					// data: img,
		// 					transformation: {
		// 						width: imgDim(image(element[0].getAttribute("class"))).width,
		// 						height: imgDim(image(element[0].getAttribute("class"))).height,
		// 					},
		// 			  })
		// 			: new docx.TextRun({
		// 					text: element[0].textContent + "text content in else " + element[0].tagName + " should show tag",
		// 					// italics: v.tag.toUpperCase() === "I" || v.tag.toUpperCase() === "EM",
		// 					// bold: v.tag.toUpperCase() === "STRONG" || v.tag.toUpperCase() === "B",
		// 			  })
		// 	);
		// 	// }
		// 	// innerTagsList.push({
		// 	// 	tag: element[x].tagName,
		// 	// 	text: element[x].tagName.toLowerCase() === "img" ? element[x].getAttribute("class") : element[x].textContent,
		// 	// });
		// }
		// }
		for (let x = 0; x < element.length; x++) {
			if (element[x].childNodes.length > 0) {
				for (let y = 0; y < element[x].childNodes.length; y++) {
					logger.log(
						"node value: ",
						element[x].childNodes[y].nodeValue,
						"child node of p: ",
						element[x].childNodes.length,
						"node name:",
						element[x].childNodes[y].nodeName
					);
					// textList.push({
					// 	tag: element[x].tagName,
					// 	text: element[x].childNodes[y].nodeValue,
					// });
					textRun.push(
						element[x].childNodes[y].nodeValue !== null ?
						new docx.TextRun({
							text: String(element[x].childNodes[y].nodeValue),
							italics: element[x].tagName.toUpperCase() === "I" || element[x].tagName.toUpperCase() === "EM",
							bold: element[x].tagName.toUpperCase() === "STRONG" || element[x].tagName.toUpperCase() === "B",
						}) :
						element[x].tagName.toLowerCase() === "img" ?
						new docx.ImageRun({
							data: image(element[x].getAttribute("class")),
							// data: img,
							transformation: {
								width: imgDim(image(element[x].getAttribute("class"))).width,
								height: imgDim(image(element[x].getAttribute("class"))).height,
							},
						}) :
						new docx.TextRun({
							text: element[x].childNodes[y].textContent,
							italics: element[x].tagName.toUpperCase() === "I" || element[x].tagName.toUpperCase() === "EM",
							bold: element[x].tagName.toUpperCase() === "STRONG" || element[x].tagName.toUpperCase() === "B",
						})
					);
				}
			} else {
				// if (element[x].children.length === 0) {
				textRun.push(
					element[x].tagName.toLowerCase() === "img" ?
					new docx.ImageRun({
						data: image(element[x].getAttribute("class")),
						// data: img,
						transformation: {
							width: imgDim(image(element[x].getAttribute("class"))).width,
							height: imgDim(image(element[x].getAttribute("class"))).height,
						},
					}) :
					new docx.TextRun({
						text: element[x].textContent,
						italics: element[x].tagName.toUpperCase() === "I" || element[x].tagName.toUpperCase() === "EM",
						bold: element[x].tagName.toUpperCase() === "STRONG" || element[x].tagName.toUpperCase() === "B",
					})
				);
				// }
				// innerTagsList.push({
				// 	tag: element[x].tagName,
				// 	text: element[x].tagName.toLowerCase() === "img" ? element[x].getAttribute("class") : element[x].textContent,
				// });
			}
		}
		// logger.log("Text List before splicing:", textList, textList.length, innerTagsList, innerTagsList.length, element.length);
		// for (let z = 0; z < textList.length; z++) {
		// 	if (textList[z].text === null) {
		// 		let spliced = innerTagsList.splice(0, 1);
		// 		console.log("spliced: ", spliced);
		// 		textList[z].tag = spliced[0].tag;
		// 		textList[z].text = spliced[0].text;
		// 	}
		// }
		// if (element.length > 0) {
		// 	for (let x = 0; x < element.length; x++) {
		// 		if (element[x].childNodes.length > 1) {
		// 			for (let y = 0; y < element[x].childNodes.length; y++) {
		// 				logger.log("tag name should be p :", element[x].tagName);
		// 				// if (element[x].childNodes[y].nodeValue !== null && element[x].childNodes[y].nodeValue.length > 0) {
		// 				textList.push({
		// 					tag: element[x].tagName,
		// 					text: element[x].childNodes[y].nodeValue,
		// 				});
		// 				// }
		// 			}
		// 		} else {
		// 			logger.log(
		// 				"inner tags lists for images:",
		// 				element[x].tagName,
		// 				element[x].tagName.toLowerCase() === "img" ? element[x].getAttribute("class") : element[x].textContent,
		// 				String(element[x].children !== undefined ? element[x].children.length : "undefined"),
		// 				"child nodes:",
		// 				element[x].childNodes.length
		// 			);
		// 			if (element[x].childNodes.length >= 0) {
		// 				innerTagsList.push({
		// 					tag: element[x].tagName,
		// 					text: element[x].tagName.toLowerCase() === "img" ? element[x].getAttribute("class") : element[x].textContent,
		// 				});
		// 			}
		// 		}
		// 	}
		// 	/*  console.log(textList,innerTagsList) */
		// 	logger.log("innerTagsList length before:", innerTagsList, textList);
		// 	if (textList.length > 0) {
		// 		if (innerTagsList.length > 0) {
		// 			for (let z = 0; z < textList.length; z++) {
		// 				if (textList[z].text === null) {
		// 					logger.log("");
		// 					let spliced = innerTagsList.splice(0, 1);
		// 					// console.log("spliced: ", spliced);
		// 					textList[z].tag = spliced[0].tag;
		// 					textList[z].text = spliced[0].text;
		// 				}
		// 			}
		// 		}
		// 	} else {
		// 		textList = innerTagsList;
		// 	}
		// } else {
		// 	textList.push({
		// 		tag: element[0].tagName,
		// 		text: element[0].childNodes[0].nodeValue,
		// 	});
		// }

		// // console.log("textList: ", textList, textList.length, innerTagsList, innerTagsList.length);
		// let img =
		// 	"iVBORw0KGgoAAAANSUhEUgAAAR4AAADLCAIAAAA3L2upAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAVtSURBVHhe7d3dVRphGIXRlGAJluA1V1ZDPVRDMxZjhpkPBBUcGM/iw3fvK35d4WSezMSsFf+9AwHSgghpQYS0IEJaECEtiJAWREgLIrpK622z+ndkvW2PM8fpervx3jbrzVt7lst+f71u0tquh0+0Ovos02c9foSzxvVOxvr6COdk1usjrS9dTaa6nLx+cG6m3ePG+0lsvR7SulDQmeb4MK33/UbbtbQuC67XQVqXPt2l59ix0BLJ9TpIa7quPfMHxMUnMdAys9cbXnhtgNJ6cAZaYt56t53bXBA+OAstMXu94YUPmNalzzf+qeK4uWRaz2nrNnPXe9C0zp6XHTWznL+q8W/GP5u33sOmta/o+BPOuwxmp6138pu/e8z5fo456w33HzWt0VTTnuPiKu0AOTDfNX5a79HTgk5JC37f4ZR2VV3SgghpQYS0IEJaECEtiLh/Wi8vL9O3X6Arw5HZjtGb3D+t4TO0W1zDbmkLF5bWo7JbmrSKsluatIqyW5q0irJbmrSKsluatIqyW5q0irJbmrSKsluatIqyW5q0irJbmrSKsluatIqyW5q0irJbmrSKsluatIqyW5q0irJbmrSKsluatIqyW5q0irJbmrSKsluatIqyW5q0irJbmrSKsluatIqyW5q0irJbmrSKsluatIqyW5q0irJbmrSKsluatIqyW5q0irJbmrSKsluatIqyW5q0irJbmrSKsluatIqyW5q0irJbmrSKsluatIqyW5q0irJbmrSKsluatIqyW5q0irJbmrSKsluatIqyW5q0irJbmrSKsluatIqyW5q0irJbmrSKsluatIqyW5q0irJbmrSKsluatIqyW5q0irJbmrSKsluatIqyW5q0irJbmrSKsluatIqyW5q0irJbmrSKsluatIqyW5q0irJbmrSKsluatIp6fn5ut8iQFkRICyL+Qlrc4PX1tS1IxjByu3UTZy34nrQgQloQIS2IkBZESAsipAUR0oIIaUGEtCBCWhAhLYiQFkRICyKkBRHSgghpQYS0IEJaECEtiJAWREgLIqQFEdKCiN7S2q5Xm7d2exZp0afO0tquh1/QetvuzSEt+tRVWm+b1fDrua4tadGnntIaTlnr7XjeuuKiUFr0qZ+0hlPWWNTY1vwTl7ToUzdpDUW1c9V0WTi3LWnRp17SGi8G2+2prZkXhdKiT32ktf/+xalZJ67hde0W9GThkfk7h/XHxeDe/BOXtOhTB2ntMvpygprdlrTo0/3T+nrKmkzfKfwxLmnRp/umdfR3rJOGpqz2LuY1PN9uQU8WHpn3P6ylRZ+kBRHSgghpQYS0IEJaECEtiJAWREgLIqQFEdKCCGlBhLQgQloQIS2IkBZESAsipAUR0oIIaUGEtCBCWhAhLYiQFkRICyKkBRGBtMb/VXr2T3VcSlr06XfT+vg/3KVFcQuPzO/ePPYlLYqTFkTcLa3vf/7P4e9phx8DNH6hCxeaw2PtFvRk4ZF5Y1q7cFpQUzW7lx/6Wa3aj4kcH1mt16v22qO3HQyvb7egJwuPzJvS2r3go5Cpn3b35M73dz99ZWnRp3uktTv5nHn+03sv3x1Jiz7dK63P13WNtPgr7pHW+IKTtt42m+n10uKvuEda++//7evarg+djU98vPfT3a9NSoteLTwyP795aqY5c9E3OXpla2cMpxne+unuyZc+Cne4125BTxYemfc/rKVFn6QFEdKCCGlBhLQgQloQIS2IkBZESAsipAUR0oKIh0/r6elp+AzQm+HIbMfoTZwxIEJaECEtiJAWREgLIqQFEdKCCGlBhLQgQloQIS2IkBZESAsipAUR0oIIaUGEtCBCWhAhLQh4f/8P/FoELaDJUqcAAAAASUVORK5CYII=";
		// // if (true) {

		// // }
		// // logger.log("before textlist ran to add maths or images :", textList, textList.length);
		// // let mathParts = [];
		// textList.forEach((v) => {
		// 	logger.log("user formular ran: ", v.text, v.tag, "use formulas: ", useFormulas);

		// 	if (v.tag.toUpperCase() !== "IMG") {
		// 		// if (useFormulas) {
		// 		// 	mathParts.push(
		// 		// 		// new docx.Math({
		// 		// 		// 	children: [
		// 		// 		new docx.MathRun(v.text)
		// 		// 		// new MathFraction({
		// 		// 		// 	numerator: [new MathRun("hi")],
		// 		// 		// 	denominator: [new MathRun("2")],
		// 		// 		// 		// }),
		// 		// 		// 	],
		// 		// 		// })
		// 		// 	);
		// 		// 	textRun.push("math");
		// 		// } else {
		// 		textRun.push(
		// 			new docx.TextRun({
		// 				text: v.text,
		// 				italics: v.tag.toUpperCase() === "I" || v.tag.toUpperCase() === "EM",
		// 				bold: v.tag.toUpperCase() === "STRONG" || v.tag.toUpperCase() === "B",
		// 			})
		// 		);
		// 		// }
		// 	} else {
		// 		logger.log("image data: ", typeof imgR, imgR[v.text], v.text, v.tag);
		// 		logger.log("base64css inside handleMath_textstyle: ", imgR, "should retrieve image: ", image(v.text));
		// 		textRun.push(
		// 			new docx.ImageRun({
		// 				data: image(v.text),
		// 				// data: img,
		// 				transformation: {
		// 					width: imgDim(image(v.text)).width,
		// 					height: imgDim(image(v.text)).height,
		// 				},
		// 			})
		// 		);
		// 	}
		// });
		// } else {
		// 	logger.log("only options ran:", html);
		// 	textRun.push(
		// 		new docx.TextRun({
		// 			text: `${number_option}. `,
		// 			// italics: v.tag === "I" || v.tag === "EM",
		// 			// bold: v.tag === "STRONG" || v.tag === "B",
		// 		})
		// 	);
		// }
		// if (useFormulas && mathParts.length > 0) {
		// 	for (let z = 0; z < textRun.length; z++) {
		// 		if (textList[z] === "math") {
		// 			let spliced = mathParts.splice(0, 1);
		// 			console.log("spliced: ", spliced);
		// 			textRun[z] = new docx.Math({
		// 				children: [spliced],
		// 			});
		// 			// textRun[z].text = spliced[0].text;
		// 		}
		// 	}
		// }

		return new docx.Paragraph({
			// alignment: docx.AlignmentType.CENTER,

			tabStops: [{
				type: docx.TabStopType.LEFT,
				position: 200,
			}, ],
			spacing: {
				// before: 200,
				after: 200,
			},
			children: [
				// new docx.ImageRun({
				// 	// data: image(v.text),
				// 	data: img,
				// 	transformation: {
				// 		width: 100,
				// 		height: 50,
				// 	},
				// }),
				...textRun,
			],
		});
	} catch (error) {
		logger.log("error in handleMath text: ", error);
	}
};
exports.handleMath_TextStyle = handleMath_TextStyle;
const getDataFromSQLdb = (sections, config, paid, schoolLogo) => {
	const {
		configId,
		examInstructions,
		course,
		examDate,
		examTitle,
		schoolName,
		sectionBlock
	} = config;
	logger.log(
		"school logo:",
		"paid:",
		paid,
		schoolLogo,
		`${
			schoolLogo
				? `\\begin{tabular}{  m{5em}  }

  
    \\immediate\\write18{
      wget ${schoolLogo}
    }
  
  \\includegraphics[width=20mm,scale=0.5]{${configId}.jpg}

\\end{tabular}`
				: `logo is not supposed to show: ${schoolLogo}`
		}`
	);
	let duration = 0;
	let sectionTypes = [];
	let sectionType = "";
	let courseName = course.includes("eng") ?
		"English" :
		course.includes("math") ?
		"Mathematics" :
		course.includes("sci") ?
		"Science" :
		course.includes("rme") ?
		"RME" :
		"";
	for (let index = 0; index < sectionBlock.length; index++) {
		const sect = sectionBlock[index];
		duration += sect.sectionDuration / 60;
		sectionTypes.push(sect.questionType === "multiple" ? "Objectives" : sect.questionType === "essay" ? "Essay" : "fill in");
	}
	duration = duration.toFixed(1);
	// sectionBlock.forEach((it, ind) => {

	// });
	sectionTypes = [...new Set(sectionTypes)];
	sectionType = sectionTypes.join(" \& ");
	const outputTmp = path.join(os.tmpdir(), "output.docx");
	const outputTmp3 = path.join(os.tmpdir(), "output.pdf");
	logger.log("sections:", sections);
	// const output = fs.createWriteStream(outputTmp);
	// const output3 = fs.createWriteStream(outputTmp3);
	const qids = [];
	for (let index = 0; index < sections.length; index++) {
		const qidsInit = sections[index];
		qids.push(...qidsInit.questionIDs);
	}
	// const storage = new Storage();
	const storage = firebaseStorage;

	const tempFilePath = path.join(os.tmpdir(), `${configId}.pdf`);
	logger.log("before axios ran: ", qids);

	const connection = mysql.createConnection({
		host: "ls-34b2d287391c710a200f00b7bad1d6280174084a.cdxrjrnw1pwd.eu-west-2.rds.amazonaws.com",
		user: "dbmasteruser",
		password: "O8,XU~W6$cNPZBW=Ua7AFx71ItZ%!s8g",
		database: "ecoach",
		port: 3306,
	});

	connection.connect(async function (err) {
		if (err) {
			logger.error("error connecting: " + err.stack);
			return;
		}
		var options = {
			sql: "...",
			nestTables: true
		};
		let join = qids.join(",");
		logger.log("joined:", join);
		let query = paid ?
			"SELECT questions.id,questions.text,questions.qtype,answers.text AS answer,answers.solution,answers.value FROM questions,answers WHERE questions.id = answers.question_id AND questions.id IN (" +
			join +
			")" :
			"SELECT * FROM questions WHERE id IN (" + join + ")";
		connection.query(query, options, async function (err, result, fields) {
			if (err) throw err;
			logger.log("fields:", fields);
			logger.log(
				sections.length,
				sections,
				typeof sections[0],
				result.length,
				typeof result[0].id,
				"row should have come:",
				result,
				result[0].text,
				result[0].id,
				qids[0]
			);

			// for (let index = 0; index < result.length; index++) {
			// 	const element = result[index];
			// 	logger.log("i ran:", questionIDs.length, questionIDs.includes(element.id));
			// 	if (questionIDs.includes(String(element.id))) {
			// 		logger.log("included");
			// 	}
			// }
			// questionIDs.forEach((questionID) => {
			// });
			const sectionslatexForm = [];
			const answersheetLatexForm = [];
			for (let secId = 0; secId < sections.length; secId++) {
				const questionsWithData = [];
				const sectionswithData = [];
				const latexForm = [];
				const answerSheetLatex = [];

				const sectEl = sections[secId];
				logger.log("in sections:", sectEl, sectEl.questionIDs.length, sectEl.questionIDs[0]);
				for (let i = 0; i < sectEl.questionIDs.length; i++) {
					const questionID = sectEl.questionIDs[i];
					logger.log("questionID:", questionID, sectEl.questionIDs, sectEl.questionIDs[0]);
					let answers = [];
					let question;
					for (let index = 0; index < result.length; index++) {
						const element = result[index];
						// logger.log("element content:", questionID, element.id);
						if (questionID === String(element.id)) {
							logger.log("match:", questionID, element.id, element);

							question = {
								text: element.text.trimStart(),
								qtype: element.qtype
							};
							if (paid) {
								answers.push({
									id: element.id,
									// solution: handleStripHTML(element.solution),
									// text: handleStripHTML(element.answer),
									solution: element.solution.trimStart(),
									text: element.answer.trimStart(),
									value: element.value,
								});
							} else {
								for (let anid = 0; anid < 4; anid++) {
									answers.push({
										id: "",
										// solution: handleStripHTML(element.solution),
										// text: handleStripHTML(element.answer),
										solution: "",
										text: "",
										value: "",
									});
								}
							}
						}
					}
					// var path = require("path");
					const root = nodeParse.parse(question.text);
					// let rawAttrs = root.childNodes[2].childNodes[0].rawAttrs;
					let images = [];
					let imagesTags = root.getElementsByTagName("img");
					if (imagesTags.length > 0) {
						for (let index = 0; index < imagesTags.length; index++) {
							const img = imagesTags[index];
							let src = img.rawAttrs;
							var filename = path.parse(String(img.rawAttrs).slice(0, img.rawAttrs.length - 1)).base;
							// console.log(filename);
							let srcs = src.split(" ");
							srcs = srcs.reverse();
							images.push(`\\newline
  
  
    \\immediate\\write18{
      wget  ${String(srcs[0]).split('"')[1]}
    }
  
  \\includegraphics{${filename}}
`);
						}
					}

					let structuredText = root.structuredText;
					structuredText = structuredText.replace(/\%/g, "\\%");
					structuredText = structuredText.replace(/\_/g, "\\_");
					// let text = images.length > 0 ? structuredText + images.join(" ") : structuredText;
					let text = latexData(question.text);
					question = {
						text: text,
						qtype: question.qtype,
					};
					logger.log("text:", text, question);

					let optionsOut = [];
					let options = ["A.", "B.", "C.", "D.", "E.", "F.", "G", "H."];
					let correctAnswer;
					for (let index = 0; index < answers.length; index++) {
						let answer = answers[index];
						// let answerText = answer.text
						// let answerSolution = answer.solution
						// const answerroot = nodeParse.parse(question.text);
						let optionOut = `\\newline\\indent ${options[index]}${paid ? latexData(answer.text) : ""}`;
						// optionOut = optionOut.replace(/\%/g, "\\%");
						// optionOut = optionOut.replace(/\_/g, "\\_");
						optionsOut.push(optionOut);
						if (answer.value === 1) {
							correctAnswer = `${options[index]} ${latexData(answer.text)} ${paid ? `\\newline ${latexData(answer.solution)}` : ""}`;
							// correctAnswer = correctAnswer.replace(/\%/g, "\\%");
							// correctAnswer = correctAnswer.replace(/\_/g, "\\_");
						}
					}
					optionsOut = optionsOut.join("");
					questionsWithData.push({
						...question,
						// qtype: question.qtype,
						// text: text,
						qid: questionID,
						answers: answers,
					});

					latexForm.push(i === 0 ? `${i + 1}.${text.replace(/  +/g, ' ')}  ${sectEl.questionType==="essay"? "":optionsOut}` : `\\newline${i + 1}.${text.replace(/  +/g, ' ')} ${sectEl.questionType==="essay"? "":optionsOut}\\newline`);
					answerSheetLatex.push(i === 0 ? `${i + 1}.${paid ? correctAnswer : ""}` : `\\newline ${i + 1}.${paid ? correctAnswer : ""} `);
					// if (index + 1 === result.length) {
					// 	latexForm.push(`\\newline \\centering SECTION${sectEl.section} \\pagebreak`);
					// }
				}
				sectionslatexForm.push({
					section: "SECTION " + sectEl.section,
					latexForm: latexForm.join("").replace(/  +/g, ' '),
					questionType: sectEl.questionType
				});
				answersheetLatexForm.push({
					section: "SECTION " + sectEl.section,
					latexForm: answerSheetLatex.join("").replace(/  +/g, ' '),
					questionType: sectEl.questionType

				});
				sectionswithData.push(questionsWithData);
			}
			// logger.log("questions with Data:", latexForm, questionsWithData.length, questionsWithData[0]);
			// const storage = new Storage(bucket);
			const storage = firebaseStorage;

			const tempFilePath = path.join(os.tmpdir(), `${configId}.tex`);
			const tempFilePathpdf = path.join(os.tmpdir(), `${configId}.pdf`);

			logger.log("before axios ran: ");
			// const urlEncoded = encodeURI(
			// 	"\\documentclass{article}\\usepackage{graphicx}\\usepackage{multicol} \\graphicspath{ {./images/} } \\begin{document}  \\begin{multicols}{2}\\noindent1. The polynomial is with a function and update to see what happens \\(f(x)=2x^3-4x^2+x-7\\) is divided by (x-1). Find the \\textbf{remainder} \\newline 2. What property of addition is defined by: (a + b) + c = a + (b + c)? \\newline \\newline 3. Express \\( \\frac{2}{3-\\sqrt 7}\\) in the form \\( a +\\sqrt b\\), where \\( a \\) and \\( b \\) are integers. \\newline 4. If \\(y=x^3-2x^2+1\\). Find \\(\\frac{dy}{dx}\\)\\newline \\newline 5. Find the local maximum value of the curve \\(y=x^3-3x^2\\) \\newline \\end{multicols} \\end{document}"
			// );
			// let joined = latexForm.join("");
			// const urlEncodednew = encodeURI(
			// 	`\\documentclass{article}\\usepackage{multicol} \\begin{document}  \\begin{multicols}{2} \\noindent${joined} \\end{multicols} \\end{document}`
			// );
			const sectionsFinal = [];
			const answerSheetFinal = [];
			for (let join = 0; join < sectionslatexForm.length; join++) {
				const sectLatex = sectionslatexForm[join];
				sectionsFinal.push(
					sectLatex.questionType === "multiple" ? `
						\\pagebreak  \\begin{center} \\textbf{\\large ${sectLatex.section} } \\end{center}    \\begin{multicols}{2} \\noindent${sectLatex.latexForm}\\end{multicols}  
						` : `
						\\pagebreak  \\begin{center} \\textbf{\\large ${sectLatex.section} } \\end{center}     \\noindent${sectLatex.latexForm}
						`
				);
			}
			for (let join = 0; join < answersheetLatexForm.length; join++) {
				const answerLatex = answersheetLatexForm[join];
				answerSheetFinal.push(
					answerLatex.questionType === "multiple" ? `
						\\pagebreak \\begin{center}\\textbf{\\large ${answerLatex.section} ANSWER SHEET }  \\end{center} \\begin{center} Get more Questions and Answers from quizmine.africa | contact: info@quizmine.africa  \\end{center}    \\begin{multicols}{2} \\noindent${answerLatex.latexForm} \\end{multicols}  
						
						` : `
						\\pagebreak \\begin{center}\\textbf{\\large ${answerLatex.section} ANSWER SHEET }  \\end{center} \\begin{center} Get more Questions and Answers from quizmine.africa | contact: info@quizmine.africa  \\end{center}     \\noindent${answerLatex.latexForm} 
						
						`
				);
			}
			logger.log("section final:", sectionsFinal, answerSheetFinal);
			let texdata = `\\documentclass{article}
\\usepackage{geometry}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{textcomp}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{graphicx}
 \\geometry{
 a4paper,
 total={170mm,257mm},
 left=20mm,
 top=20mm,
 }
\\usepackage{booktabs}
\\usepackage{array}
\\usepackage{multicol}
\\setlength{\\columnsep}{35pt}
\\setlength{\\arrayrulewidth}{1mm} 
\\setlength{\\tabcolsep}{6pt} 
\\renewcommand{\\arraystretch}{2} 
\\begin{document}
${
	schoolLogo
		? `\\begin{tabular}{  m{5em}  }

  
    \\immediate\\write18{
      wget ${schoolLogo}
    }
  
  \\includegraphics[width=20mm,scale=0.5]{${configId}.jpg}

\\end{tabular}`
		: ``
}
	\\begin{tabular}{ | m{5cm}  m{3cm}|  }

	\\hline
		\\parbox[m]{10cm}{\\vspace*{8pt} \\textbf{\\large ${examTitle}}\\newline ${examDate}\\newline ${courseName}\\newline ${sectionType}\\newline  ${duration}hours \\vspace*{4pt}}& \\hspace*{0.5cm} {\\textbf{\\huge 2 \\& 1}} \\\\
		\\hline
	\\end{tabular}
		\\begin{tabular}{  m{5em}  }
	
		\\parbox[m]{15cm}{\\hspace*{0.5cm}Name:.......................... 
		  \\vspace*{1pt}} \\
		  	\\parbox[m]{15cm}{\\hspace*{0.5cm}Index Number:.......................... 
		  \\vspace*{1pt}}
	
	\\end{tabular}
\\begin{center}
${examTitle}
\\end{center}
\\begin{center}
${schoolName}
\\end{center}
${examDate} \\hfill ${examTitle} \\hfill ${duration}HOURS
\\begin{center}
${examInstructions}
\\end{center}
${getUtfFixed(sectionsFinal.join(""))} \\pagebreak 
			${getUtfFixed(answerSheetFinal.join(""))}
  \\end{document}`;

			// try {
			// 	fs.accessSync(tempFilePath);
			// 	fs.unlinkSync(tempFilePath);
			// } catch (error) {}

			fs.writeFile(
				tempFilePath,
				texdata,
				// `\\documentclass{article}\\usepackage{graphicx}\\usepackage{multicol} \\graphicspath{ {./images/} } \\begin{document}  \\begin{multicols}{2}\\noindent1. The polynomial is with a function and update to see what happens \\(f(x)=2x^3-4x^2+x-7\\) is divided by (x-1). Find the \\textbf{remainder} \\newline 2. What property of addition is defined by: (a + b) + c = a + (b + c)? \\newline \\newline 3. Express \\( \\frac{2}{3-\\sqrt 7}\\) in the form \\( a +\\sqrt b\\), where \\( a \\) and \\( b \\) are integers. \\newline 4. If \\(y=x^3-2x^2+1\\). Find \\(\\frac{dy}{dx}\\)\\newline \\newline 5. Find the local maximum value of the curve \\(y=x^3-3x^2\\) \\newline \\end{multicols} \\end{document}`,
				function (err) {
					if (err) throw err;
					console.log("Saved!");
				}
			);
			try {
				const file_name = `generatorPreviews/${configId}.tex`;
				const file_name_pdf = `generatorPreviews/${configId}.pdf`;
				const bucketName = `${projectId}.appspot.com`;
				// const bucket = storage.bucket(bucketName);
				// const bucket = storage.bucket();
				const bucket = firebaseStorage.bucket();

				const tempImgFilePath = path.join(os.tmpdir(), "temp.jpg");

				await bucket
					.upload(tempFilePath, {
						destination: file_name,
						metadata: {
							contentType: "application/tex",
						},
						public: true,
					})
					.then(async (resp) => {
						logger.log("before file is deleted");
						let exists = await bucket.file(file_name_pdf).exists();
						logger.log("after file deleted", exists);
						// if (exists.includes(true)) {
						// 	const op = await bucket.file(file_name_pdf).delete();
						// 	logger.log("file delete:", op);
						// }

						let texFileUrl = `https://storage.googleapis.com/projects-mvp.appspot.com/${file_name}`;
						generatePDFfile(
							"https://quizmine-352ibptuwq-uc.a.run.app/download", {
								url: `https://storage.googleapis.com/projects-mvp.appspot.com/generatorPreviews/${configId}.tex`,
								filename: `${configId}.tex`,
								paid: paid,
							},
							tempFilePathpdf,
							async () => {
									logger.log("file downloaded:pdf version");
									var files = fs.readdirSync("/tmp");
									logger.log("files in temp:", files);
									// await bucket
									// 	.upload(tempFilePathpdf, {
									// 		destination: file_name_pdf,
									// 		metadata: {
									// 			contentType: "application/pdf",
									// 		},
									// 		public: true,
									// 	})
									// 	.then((resp) => {
									// 		//-
									// 		// If the callback is omitted, we'll return a Promise.
									// 		//-
									// 		const configUrl = {
									// 			action: "read",
									// 			expires: "03-17-2025",
									// 		};
									// 		bucket
									// 			.file(file_name_pdf)
									// 			// .file(`${configId}.pdf`,)
									// 			.getSignedUrl(configUrl)
									// 			.then(function (data) {
									// 				const url = data[0];
									// 				logger.log("signed url:", url);
									// 				firestore().collection("examConfiguration").doc(configId).set(
									// 					{
									// 						generatorPDFURL: url,
									// 						pdfUrl: url,
									// 					},
									// 					{ merge: true }
									// 				);
									// 			});
									// 		logger.log("Uploaded pdf version successfully:", tempFilePathpdf, file_name_pdf);
									// 		// try {
									// 		// 	fs.accessSync(tempFilePathpdf);
									// 		// 	fs.unlinkSync(tempFilePathpdf);
									// 		// 	logger.log("pdf deleted afterwards");
									// 		// } catch (error) {
									// 		// 	logger.log("pdf deleted afterwards error:", error);
									// 		// }
									// 	});
								},
								(error) => {
									logger.log("generating final error:", error);
								}
						);
						logger.log("Uploaded tex successfully to bucket:", resp);
					});
			} catch (error) {
				logger.log("axios error:", error);
			}
			connection.end();
		});
		logger.log("connected as id " + connection.threadId);
	});
};
exports.getDataFromSQLdb = getDataFromSQLdb;
const latexData = (text) => {
	// const root = nodeParse.parse(text);

	// text = text.replace(/<\/p>/g, "</p>\\newline ");
	// console.log(que);
	const root = nodeParse.parse(text);

	// let rawAttrs = root.childNodes[2].childNodes[0].rawAttrs;
	// console.log(root.childNodes[2]);
	let content = [];
	let fix_listKeys = Object.keys(fix_list)
	for (let index = 0; index < root.childNodes.length; index++) {
		const element = root.childNodes[index];
		//   content.push(element.rawText);
		if (element.childNodes.length > 0) {
			for (let i2 = 0; i2 < element.childNodes.length; i2++) {
				const element2 = element.childNodes[i2];
				if (element2.childNodes.length > 0) {
					for (let i3 = 0; i3 < element2.childNodes.length; i3++) {
						let element3 = element2.childNodes[i3];
						if (element3.rawTagName && element3.rawTagName === "img") {
							console.log("element 3 image");
							var img = element3;
							var src = element3.rawAttrs;
							var srcs = src.split(" ");
							srcs = srcs.reverse();
							var filename = path.parse(String(img.rawAttrs).slice(0, img.rawAttrs.length - 1)).base;
						}
						let rawText = element3.rawText;
						rawText = rawText.replace(/\%/g, "\\%");
						rawText = rawText.replace(/\_/g, "\\_");
						let ele3 =
							element3.rawTagName && element3.rawTagName === "sub" ?
							fix_listKeys.includes(rawText.trim()) ? rawText : `$_${rawText}$` :
							element3.rawTagName && element3.rawTagName === "sup" ?
							fix_listKeys.includes(rawText.trim()) ? rawText : `$^${rawText}$` :
							element3.rawTagName && element3.rawTagName === "u" ?
							`\\underline{${rawText}}` :
							element3.rawTagName && element3.rawTagName === "b" ?
							`\\textbf{${rawText}}` :
							element3.rawTagName && element3.rawTagName === "i" ?
							`\\textit{${rawText}}` :
							element3.rawTagName && element3.rawTagName === "br" && content[content.length - 1] !== "\\newline\\indent " ?
							"\\newline\\indent " :
							element3.rawTagName && element3.rawTagName === "img" ?
							`
  \\IfFileExists{${filename}}{
  }{
    \\immediate\\write18{
      wget  ${String(srcs[0]).split('"')[1]}
    }
  }
  \\includegraphics{${filename}}
` :
							rawText;
						let parentTag3 = element3.parentNode;
						ele3 =
							parentTag3.rawTagName && parentTag3.rawTagName === "sub" ?
							fix_listKeys.includes(rawText.trim()) ? ele3 : `$_${ele3}$` :
							parentTag3.rawTagName && parentTag3.rawTagName === "sup" ?
							fix_listKeys.includes(rawText.trim()) ? ele3 : `$^${ele3}$` :
							parentTag3.rawTagName && parentTag3.rawTagName === "u" ?
							`\\underline{${ele3}}` :
							parentTag3.rawTagName && parentTag3.rawTagName === "b" ?
							`\\textbf{${ele3}}` :
							parentTag3.rawTagName && parentTag3.rawTagName === "i" ?
							`\\textit{${rawText}}` :
							parentTag3.rawTagName && parentTag3.rawTagName === "br" && content[content.length - 1] !== "\\newline\\indent " ?
							"\\newline\\indent " :
							ele3;
						content.push(ele3);
					}
				} else {
					if (element2.rawTagName && element2.rawTagName === "img") {
						console.log("element 2 image");

						var img = element2;
						var src = element2.rawAttrs;
						let srcs = src.split(" ");
						srcs = srcs.reverse();
						src = srcs[0] ? srcs[0] : element2.rawAttrs;
						var filename = path.parse(String(img.rawAttrs).slice(0, img.rawAttrs.length - 1)).base;
						console.log("src split", String(src).split('"')[1]);
					}
					let rawText = element2.rawText;
					rawText = rawText.replace(/\%/g, "\\%");
					rawText = rawText.replace(/\_/g, "\\_");
					content.push(
						element2.rawTagName && element2.rawTagName === "sub" ?
						fix_listKeys.includes(rawText.trim()) ? rawText : `$_${rawText}$` :
						element2.rawTagName && element2.rawTagName === "sup" ?
						fix_listKeys.includes(rawText.trim()) ? rawText : `$^${rawText}$` :
						element2.rawTagName && element2.rawTagName === "b" ?
						`\\underline{${rawText}}` :
						element2.rawTagName && element2.rawTagName === "i" ?
						`\\textit{${rawText}}` :
						element2.rawTagName && element2.rawTagName === "br" && content[content.length - 1] !== "\\newline\\indent " ?
						"\\newline\\indent " :
						element2.rawTagName && element2.rawTagName === "img" ?
						`
  \\IfFileExists{${filename}}{
  }{
    \\immediate\\write18{
      wget  ${String(src).split('"')[1]}
    }
  }
  \\includegraphics{${filename}}
` :
						rawText
					);
				}
			}
		} else {
			if (element.rawTagName && element.rawTagName === "img") {
				console.log("element 2 image");

				var img = element;
				var src = element.rawAttrs;
				let srcs = src.split(" ");
				srcs = srcs.reverse();
				src = srcs[0] ? srcs[0] : element.rawAttrs;
				var filename = path.parse(String(img.rawAttrs).slice(0, img.rawAttrs.length - 1)).base;
				console.log("src split", String(src).split('"')[1]);
			}
			let rawText = element.rawText;
			rawText = rawText.replace(/\%/g, "\\%");
			rawText = rawText.replace(/\_/g, "\\_");
			content.push(
				element.rawTagName && element.rawTagName === "sub" ?
				fix_listKeys.includes(rawText.trim()) ? rawText : `$_${rawText}$` :
				element.rawTagName && element.rawTagName === "sup" ?
				fix_listKeys.includes(rawText.trim()) ? rawText : `$^${rawText}$` :
				element.rawTagName && element.rawTagName === "b" ?
				`\\underline{${rawText}}` :
				element.rawTagName && element.rawTagName === "i" ?
				`\\textit{${rawText}}` :
				element.rawTagName && element.rawTagName === "br" && content[content.length - 1] !== "\\newline\\indent " ?
				"\\newline\\indent " :
				element.rawTagName && element.rawTagName === "img" ?
				`
  \\IfFileExists{${filename}}{
  }{
    \\immediate\\write18{
      wget  ${String(src).split('"')[1]}
    }
  }
  \\includegraphics{${filename}}
` :
				rawText
			);
		}
	}
	return content.join("").replace(/  +/g, ' ');
};
let fix_list = {
	// 3 char errors first
	"â€š": "‚",
	"â€ž": "„",
	"â€¦": "…",
	"â€¡": "‡",
	"â€°": "‰",
	"â€¹": "‹",
	"â€˜": "‘",
	"â€™": "’",
	"â€œ": "“",
	"â€¢": "•",
	"â€“": "–",
	"â€”": "—",
	"â„¢": "™",
	"â€º": "›",
	"â‚¬": "€",
	"â‰¤": "≤",
	"â‰¥": "≥",
	"â‰": "≠",
	// 2 char errors
	"Ã‚": "Â",
	"Æ’": "ƒ",
	Ãƒ: "Ã",
	"Ã„": "Ä",
	"Ã…": "Å",
	"â€": "†",
	"Ã†": "Æ",
	"Ã‡": "Ç",
	"Ë†": "ˆ",
	Ãˆ: "È",
	"Ã‰": "É",
	ÃŠ: "Ê",
	"Ã‹": "Ë",
	"Å’": "Œ",
	ÃŒ: "Ì",
	"Å½": "Ž",
	ÃŽ: "Î",
	"Ã‘": "Ñ",
	"Ã’": "Ò",
	"Ã“": "Ó",
	"â€": "”",
	"Ã”": "Ô",
	"Ã•": "Õ",
	"Ã–": "Ö",
	"Ã—": "×",
	Ëœ: "˜",
	"Ã˜": "Ø",
	"Ã™": "Ù",
	"Å¡": "š",
	Ãš: "Ú",
	"Ã›": "Û",
	"Å“": "œ",
	Ãœ: "Ü",
	"Å¾": "ž",
	Ãž: "Þ",
	"Å¸": "Ÿ",
	ÃŸ: "ß",
	"Â¡": "¡",
	"Ã¡": "á",
	"Â¢": "¢",
	"Ã¢": "â",
	"Â£": "£",
	"Ã£": "ã",
	"Â¤": "¤",
	"Ã¤": "ä",
	"Â¥": "¥",
	"Ã¥": "å",
	"Â¦": "¦",
	"Ã¦": "æ",
	"Â§": "§",
	"Ã§": "ç",
	"Â¨": "¨",
	"Ã¨": "è",
	"Â©": "©",
	"Ã©": "é",
	Âª: "ª",
	Ãª: "ê",
	"Â«": "«",
	"Ã«": "ë",
	"Â¬": "¬",
	"Ã¬": "ì",
	"Â®": "®",
	"Ã®": "î",
	"Â¯": "¯",
	"Ã¯": "ï",
	"Â°": "°",
	"Ã°": "ð",
	"Â±": "±",
	"Ã±": "ñ",
	"Â²": "²",
	"Ã²": "ò",
	"Â³": "³",
	"Ã³": "ó",
	"Â´": "´",
	"Ã´": "ô",
	Âµ: "µ",
	Ãµ: "õ",
	"Â¶": "¶",
	"Ã¶": "ö",
	"Â·": "·",
	"Ã·": "÷",
	"Â¸": "¸",
	"Ã¸": "ø",
	"Â¹": "¹",
	"Ã¹": "ù",
	Âº: "º",
	Ãº: "ú",
	"Â»": "»",
	"Ã»": "û",
	"Â¼": "¼",
	"Ã¼": "ü",
	"Â½": "½",
	"Ã½": "ý",
	"Â¾": "¾",
	"Ã¾": "þ",
	"Â¿": "¿",
	"Ã¿": "ÿ",
	"Ã€": "À",
	// 1 char errors last
	Ã: "Á",
	Å: "Š",
	Ã: "Í",
	Ã: "Ï",
	Ã: "Ð",
	Ã: "Ý",
	Ã: "à",
	"Ã­": "í",
};
const getUtfFixed = (text) => {
	if (text === undefined) return "";
	for (const key in fix_list) {
		if (Object.hasOwnProperty.call(fix_list, key)) {
			const element = fix_list[key];
			console.log(element, key);
			const regexp = new RegExp(`${key}`, "g");
			text = String(text).replace(regexp, element);
		}
	}
	//   fix_list.forEach((key, value) => {
	//     text = text.replace(key, value);
	//   });

	return text;
};
const questionsTouse = async (config) => {
	let usedQuestions = []
	if (config.userId !== undefined && config.userId !== null && config.userId.length > 0) {

		if (config.repetition !== undefined && config.repetition === "no") {


			let nonRepet = [];
			let repet = [];
			let usedQues = [];
			const generated = await firestore().collection("users").doc(config.userId).collection("generated").get();
			if (!generated.empty) {
				generated.forEach((gen) => {
					usedQues = usedQues.concat(gen.data().questions);
					// logger.log(gen.data().questions)
				});
			}
			logger.log("used question: ", generated.size, usedQues.length, config.userId);
			usedQues = [...new Set(usedQues)];
			for (let newID = 0; newID < newQuestions.length; newID++) {
				const ques = newQuestions[newID];
				if (usedQues.includes(ques.qid)) {
					repet.push(ques);
					// console.log('repeated found');
				} else {
					nonRepet.push(ques);
				}
			}
		}
	}
	return usedQuestions;
}
