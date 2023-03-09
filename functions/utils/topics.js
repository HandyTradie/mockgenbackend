const { templates } = require("./frontpageTemplates");
const { firestore, logger, projectId, firebaseStorage } = require("../admin");
const { lowerCase, before, result } = require("lodash");
const fs = require("fs");
const path = require("path");
const os = require("os");
const client = require("https");
const axios = require("axios").default;
const fetch = require("node-fetch").default;
var request = require("request");
const { DOMParser } = require("xmldom");
const imageSize = require("image-size");
var HTML = require("html-parse-stringify");
const publicUrlBase = "https://storage.googleapis.com";
const mysql = require("mysql");
const latex = require("node-latex");
const nodeParse = require("node-html-parser");
const { getUtfFixed, handleStripHTML, latexData, generatePDFfile, getDataWithPool, setLatexFractions } = require("./index");
exports.publicUrlBase = publicUrlBase;

const toFirestoreDate = (dateVal) => firestore.Timestamp.fromDate(dateVal);
const fromFirestoreToDate = (firestoreDate) => new firestore.Timestamp(firestoreDate.seconds, firestoreDate.nanoseconds).toDate();

exports.toFirestoreDate = toFirestoreDate;
exports.fromFirestoreToDate = fromFirestoreToDate;

const serverTimeStamp = firestore.FieldValue.serverTimestamp;

const serverTS = serverTimeStamp;
exports.serverTS = serverTS;
exports.createNewMockWithTopics = async ({
	schoolLogoURL,
	config,
	// questions, base64css,
	course,
	status,
	userID,
}) => {
	// getDataFromSQLdb(config, status === "paid", schoolLogoURL);
	await getDataFromSQLdbSplitWithTopics(config, status === "paid", userID);
	let timeStamp = new Date().getTime();
	let generatorPDFURL = "";
	return {
		generatorPDFURL,
		timeStamp,
	};
};

const removeNewlines = (str, endWithNewline) => {
	// Removes all //newline characters at the end of the string
	let newStr = str.replaceAll("\\newline", "");
	if (endWithNewline) {
		newStr += "\\newline";
	}

	return newStr;
};

const getDataFromSQLdbSplitWithTopics = async (config, paid, userID) => {
	const { configId, examInstructions, course, courseName, examDate, examTitle, schoolName, sectionBlock, schoolLogoURL, frontpage } =
		config;
	let duration = 0;
	let sectionTypes = [];
	let sectionType = "";

	console.log('Exam configuration', config)

	for (let index = 0; index < sectionBlock.length; index++) {
		const sect = sectionBlock[index];
		duration += sect.sectionDuration / 60;
		sectionTypes.push(sect.questionType === "multiple" ? "Objectives" : sect.questionType === "essay" ? "Essay" : "fill in");
	}
	const sectionTitles = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

	let logoURL = schoolLogoURL || "https://storage.googleapis.com/quizmine-dev.appspot.com/logos/YPL11WYDWP.jpg";
	let logoFileName = "";

	// Get logo file extension from content-type header
	if (schoolLogoURL) {
		try {
			// TODO: This does download the whole file so is inefficient and should be updated
			const response = await axios.get(schoolLogoURL);
			const contentType = response.headers["content-type"];
			logoFileName = `logo.${contentType.split("/")[1]}`;
		} catch (error) {
			console.error("Error fetching headers from logo resource");
			logoFileName = "logo.jpeg";
			logoURL = "https://storage.googleapis.com/quizmine-dev.appspot.com/logos/YPL11WYDWP.jpg";
		}
	} else {
		// Logo not provided, using default file name for default image
		logoFileName = "logo.jpeg";
	}

	const connectionPool = mysql.createPool({
		connectionLimit: 10,
		connectTimeout: 60 * 60 * 1000,
		acquireTimeout: 60 * 60 * 1000,
		timeout: 60 * 60 * 1000,
		// host: "35.193.48.99",
		host: "ls-34b2d287391c710a200f00b7bad1d6280174084a.cdxrjrnw1pwd.eu-west-2.rds.amazonaws.com",
		user: "dbmasteruser",
		password: "O8,XU~W6$cNPZBW=Ua7AFx71ItZ%!s8g",
		database: "ecoach",
		port: 3306,
		multipleStatements: true,
	});
	connectionPool.on("acquire", function (connection) {
		console.log("Connection %d acquired", connection.threadId);
	});
	connectionPool.on("release", function (connection) {
		console.log("Connection %d released", connection.threadId);
	});
	let usedQues = [];
	if (config.userId !== undefined && config.userId !== null && config.userId.length > 0) {
		if (config.repetition !== undefined && config.repetition === "no") {
			const generated = await firestore().collection("users").doc(config.userId).collection("usedQuestions").doc(config.course).get("qids");

			if (generated.data()?.qids?.length > 0) {
				usedQues = generated.data()?.qids;
			}

			usedQues = [...new Set(usedQues)];
		}
	}
	let questionsID = [];
	const sectionswithData = [];
	const sectionslatexForm = [];
	const answersheetLatexForm = [];
	let sections = [];
	let finalPdfQuestions = [];
	let blocksCount = 0;
	if (paid) {
		let examConfig = await firestore().collection("examConfiguration").doc(configId).get();
		finalPdfQuestions = examConfig.data().questions;
		blocksCount = finalPdfQuestions.length;
		console.log('\nPaid and now fetching questions and answers\n:')
		console.log(finalPdfQuestions)
		console.log(`\nFinal pdf questions blocks length: ${finalPdfQuestions.length}\n`)
		console.log(`Normal section blocks length: ${sectionBlock.length}\n`)
	} else {
		blocksCount = sectionBlock.length;
	}

	for (let secblockID = 0; secblockID < blocksCount; secblockID++) {
		const sectBlock = sectionBlock[secblockID];
		const questionsWithData = [];
		const answerSheetLatex = [];
		let questionType = lowerCase(sectBlock.questionType);

		var query = `SELECT questions.id,questions.text,questions.resource,questions.qtype ${
			paid || questionType === "essay" ? ",answers.text AS answer,answers.id AS answer_id,answers.value,answers.solution," : ","
		} courses.id AS course_id,courses.courseID FROM questions${paid || questionType === "essay" ? ",answers" : ""},courses WHERE ${
			config.status === "draft" && usedQues.length > 0
				? `questions.id NOT IN (${usedQues.join(",")}) AND`
				: paid
				? `questions.id IN (${finalPdfQuestions[secblockID].questionIDs.join(",")}) AND`
				: ""
		} questions.qtype="${questionType === "multiple" ? "SINGLE" : "ESSAY"}" ${
			paid || questionType === "essay" ? "AND questions.id=answers.question_id" : ""
		} AND questions.course_id=courses.id AND courses.courseID='${
			config.course
		}' AND questions.public=1 AND questions.resource NOT REGEXP 'data:image' ${
			config.status === "draft" ? "LIMIT " + sectBlock.questionTotal : ""
		}`;

		let topicPercentages = sectionBlock[secblockID].topicPercentages;
		let topics = [];
		let questionTotal = sectionBlock[secblockID].questionTotal;
		for (let index = 0; index < topicPercentages.length; index++) {
			const element = topicPercentages[index];
			// let numberOfQuestions = questionTotal * Number((element.value/100).toFixed(2))
			let numberOfQuestions = element.value;
			if (element.selected) {
				topics.push({
					numberOfQuestions: numberOfQuestions,
					topicId: Number(element.topicId),
					topic: element.topic,
					instructions: element?.instructions,
					overrides: element?.questionOverrides,
				});
			}
		}
		let result = [];
		let essayQueryIdsLength = 0;

		if (paid || questionType === "essay") {
			let paidQuery = "";
			if (questionType === "essay") {
				let essayQuer = `select id
from (
select q.id id, c.name courseName,c.courseID courseID,q.text text,q.resource resource from questions q

inner join (
select distinct qzi.question_id from quiz_items qzi
inner join quizzes qz on qz.id = qzi.quiz_id and qz.public = 1  and qz.type = 'ESSAY'
) qzq on qzq.question_id = q.id
inner join courses c on c.id = q.course_id and c.courseID = '${config.course}'

) s`;
				const essayQIDRes = await getDataWithPool(essayQuer, connectionPool);
				essayQueryIdsLength = essayQIDRes.length;
				var qids = [];
				for (let index = 0; index < essayQIDRes.length; index++) {
					const element = essayQIDRes[index];
					qids.push(Number(element.id));
				}
				console.log('\nQuery length:', essayQueryIdsLength)
				console.log('\nQuestion ids before processing:', qids)

				if (essayQueryIdsLength > 0) {
					qids = [...new Set(qids)];
					var available = [];
	
					// Remove used questions
					if (usedQues.length > 0) {
						available = qids.filter((item) => !usedQues.includes(item));
					} else {
						// Just use the qids
						available = [...qids];
					}
	
					console.log('used questions:', usedQues, '\n')
					console.log('available questions:', available)
	
					// Add overrides
					if (sectBlock.questionOverrides.length > 0) {
						qids.splice(0, sectBlock.questionOverrides.length, ...sectBlock.questionOverrides.map((e) => e.id));
					}
	
					console.log('After overrides\n')
					console.log('Qids', qids, '\n')
	
					console.log('Checking condition:', available.length, questionTotal, available.length > questionTotal)
	
					qids =
						available.length > questionTotal
							? available.slice(0, questionTotal)
							: [...available, ...qids.slice(0, questionTotal - available.length)];
	
					console.log('\nAfter the checks\n')
					console.log('Qids', qids.join(","), '\n', 'Course:', config.course)
	
					query = `SELECT questions.id,questions.text,questions.resource,questions.qtype ,answers.text AS answer,answers.id AS answer_id,answers.value,answers.solution  FROM questions ,answers WHERE ${
						usedQues.length > 0 ? `questions.id NOT IN (${usedQues.join(",")}) AND` : ""
					}  questions.id IN (${qids.join(",")}) AND questions.id=answers.question_id AND questions.public=1
						`;
				} else {
					continue;
				}
			}
			if (paid) {
				paidQuery = `SELECT questions.id,questions.text,questions.resource,questions.qtype ,answers.text AS answer,answers.id AS answer_id,answers.value,answers.solution FROM questions,answers WHERE questions.id IN (${finalPdfQuestions[
					secblockID
				].questionIDs.join(",")}) AND  questions.id=answers.question_id `;
			}
			let quer = questionType === "essay" && essayQueryIdsLength > 0 ? query : paidQuery;
			console.log("query 3", quer);
			let results =  await getDataWithPool(quer, connectionPool);
			result = [...results];

			// Refetch without used questions clause if not enough results were returned
			if (usedQues.length > 0 && results.length < questionTotal && !paid) {
				query = `SELECT questions.id,questions.text,questions.resource,questions.qtype ,answers.text AS answer,answers.id AS answer_id,answers.value,answers.solution  FROM questions ,answers WHERE questions.id IN (${qids.join(
					","
				)}) AND questions.id=answers.question_id AND questions.public=1`;

				results = await getDataWithPool(quer, connectionPool);
				result = [...results];
			}
		} else {
			const requestPromises = [];

			for (let index = 0; index < topics.length; index++) {
				const reqPromise = async () => {
					const element = topics[index];

					// Don't fetch if no questions are selected for this topic
					if (element.numberOfQuestions === 0) {
						return;
					}

					let quer =
						questionType === "essay"
							? query
							: `
							SET @r := (SELECT FLOOR(RAND() * ((SELECT COUNT(*) FROM questions where questions.topic_id = '${
								element.topicId
							}' AND questions.public = 1 AND questions.resource NOT REGEXP 'data:image') ${
									// Subtract number of questions from offset
									parseInt(element.numberOfQuestions) > 0 ? `- ${parseInt(element.numberOfQuestions)}` : ""
							  })));
							SET @sql := CONCAT("SELECT questions.id,questions.text,questions.resource,questions.qtype ${
								paid || questionType === "essay" ? ",answers.text AS answer,answers.id AS answer_id,answers.value,answers.solution" : ""
							}  FROM questions${paid || questionType === "essay" ? ",answers" : ""} WHERE ${
									config.status === "draft" && usedQues.length > 0
										? `questions.id NOT IN (${usedQues.join(",")}) AND`
										: paid
										? `questions.id IN (${finalPdfQuestions[secblockID].questionIDs.join(",")}) AND`
										: ""
							  }  ${paid || questionType === "essay" ? " questions.id=answers.question_id AND" : ""}  ${
									paid || questionType === "essay" ? "" : `questions.topic_id=${element.topicId} AND`
							  }   questions.public=1 AND questions.resource NOT REGEXP 'data:image'
								${
									element?.overrides
										? `
								AND questions.id IN (${element.overrides.join(",")}) or questions.id = questions.id
								order by questions.id IN (${element.overrides.join(",")}) DESC
								`
										: ""
								}
								${config.status === "draft" ? "LIMIT " + element.numberOfQuestions : ""} OFFSET ", @r);
								PREPARE stmt1 FROM @sql;
								EXECUTE stmt1;
								`;
					let results = await getDataWithPool(quer, connectionPool);

					// FLatten results and filter out only valid row data (with id)
					results = results?.flat().filter((e) => e?.id);

					if (results.length < element.numberOfQuestions) {
						logger.log("not enough questions for topic", element);
						logger.log("query", quer);
					}

					// Refetch without used questions clause if not enough results were returned
					if (usedQues.length > 0 && results.length < element?.numberOfQuestions) {
						quer =
							questionType === "essay"
								? query
								: `
						SET @r := (SELECT FLOOR(RAND() * ((SELECT COUNT(*) FROM questions where questions.topic_id = '${
							element.topicId
						}' AND questions.public = 1 AND questions.resource NOT REGEXP 'data:image') ${
										// Subtract number of questions from offset
										parseInt(element.numberOfQuestions) > 0 ? `- ${parseInt(element.numberOfQuestions)}` : ""
								  })));
						SET @sql := CONCAT("SELECT questions.id,questions.text,questions.resource,questions.qtype ${
							paid || questionType === "essay" ? ",answers.text AS answer,answers.id AS answer_id,answers.value,answers.solution" : ""
						}  FROM questions${paid || questionType === "essay" ? ",answers" : ""} WHERE ${
										config.status === "draft" && usedQues.length > 0
											? `questions.id NOT IN (${usedQues.join(",")}) AND`
											: paid
											? `questions.id IN (${finalPdfQuestions[secblockID].questionIDs.join(",")}) AND`
											: ""
								  }  ${paid || questionType === "essay" ? " questions.id=answers.question_id AND" : ""}  ${
										paid || questionType === "essay" ? "" : `questions.topic_id=${element.topicId} AND`
								  }   questions.public=1 AND questions.resource NOT REGEXP 'data:image'
							${
								element?.overrides
									? `
							AND questions.id IN (${element.overrides.join(",")}) or questions.id = questions.id
							order by questions.id IN (${element.overrides.join(",")}) DESC
							`
									: ""
							}
							${config.status === "draft" ? "LIMIT " + element.numberOfQuestions : ""} OFFSET ", @r);
							PREPARE stmt1 FROM @sql;
							EXECUTE stmt1;
							`;
						results = await getDataWithPool(quer, connectionPool);
					}

					// If topic instruction exists, add it to the first result
					if (element?.instructions) {
						results[0]["instructions"] = element.instructions;
						results[0]["instructionsQuestionCount"] = results?.length;
					}

					return results;
					// result = [...result, ...results];
				};

				requestPromises.push(reqPromise);
			}

			// Wait for all requests to be resolved
			let results = await Promise.all(requestPromises.map((p) => p()));

			result = [...result, ...results.flat()];

			// Filter out only valid row data (with id)
			result = result.filter((e) => e?.id);

			console.log("end result", result.length);
		}

		const latexForm = [];

		let sectquestionsID = [];
		for (let qind = 0; qind < result.length; qind++) {
			const element = result[qind];
			questionsID.push(element.id);
			sectquestionsID.push(element.id);
		}

		sectquestionsID = [...new Set(sectquestionsID)];
		// sectquestionsID.sort((a, b) => Number(a) - Number(b));

		let resourceFinal = "";
		let foundResources = [];
		let lastPreambleIndex = null;

		for (let i = 0; i < sectquestionsID.length; i++) {
			const questionID = sectquestionsID[i];
			let answers = [];
			let question = {};
			let resourceList = [];
			for (let index = 0; index < result.length; index++) {
				const element = result[index];

				if (String(questionID) === String(element.id)) {
					if (!paid) {
						if (element.resource) {
							let resourceStrip = "";
							if (element.resource.includes("img")) {
								const root = nodeParse.parse(element.resource.replace(/style="(.*?)"/gm, " "));

								let images = [];
								let imagesTags = root.getElementsByTagName("img");
								if (imagesTags.length > 0) {
									for (let index = 0; index < imagesTags.length; index++) {
										try {
											const img = imagesTags[index];
											let src = img.rawAttrs.trim();
											var filename = path.parse(String(src).slice(0, src.length - 1)).base;
											let srcs = src.split(" ");
											resourceStrip = String(srcs[0]).split('"')[1].replace('"', "").replace("https", "http").replace("www.", "");
											resourceList.push(resourceStrip);
										} catch (e) {
											console.log("working with image error", imagesTags[index]);
											console.log(e);
										}
									}
								}
							} else {
								resourceStrip = handleStripHTML(element.resource);
							}
							// generate question
							// If resource has already been used, it is removed
							question = {
								...question,
								text: element.text ? String(element.text).trimStart() : null,
								qtype: element.qtype,
								resource: !foundResources.includes(resourceStrip) ? element.resource : "",
								answerID: element?.answer_id,
							};

							// If question has resource matching existing resource, add it to the preamble
							if (resourceStrip.length > 0 && foundResources.includes(resourceStrip) && lastPreambleIndex) {
								questionsWithData[lastPreambleIndex]?.preambleQuestions.push(i);
							}

							// If there's a resource and it hasn't been added already to the list add it
							// Since this is new, we set the lastPreambleIndex to the index
							if (resourceStrip.length > 0 && !foundResources.includes(resourceStrip)) {
								foundResources.push(resourceStrip);
								lastPreambleIndex = i;
								question["preambleQuestions"] = [i];
							}
						} else {
							question = {
								...question,
								text: element.text ? String(element.text).trimStart() : null,
								qtype: element.qtype,
								resource: "",
								answerID: element?.answer_id,
							};
						}
					} else {
						question = {
							...question,
							text: element.text ? String(element.text).trimStart() : null,
							qtype: element.qtype,
							resource: element.resource,
							answerID: element?.answer_id,
							preambleQuestions: [],
						};
					}

					if (paid || questionType === "essay") {
						answers.push({
							id: element.id,
							// solution: handleStripHTML(element.solution),
							// text: handleStripHTML(element.answer),
							solution: element.solution !== null ? String(element.solution).trimStart() : null,
							text:
								element.answer !== null
									? String(!element.answer.includes("<p>") ? "<p>" + element.answer + "</p>" : element.answer).trimStart()
									: null,
							value: questionType.toLowerCase() === "essay" ? 1 : element.value,
							answerID: element?.answer_id,
						});
					} else {
						for (let ansID = 0; ansID < 4; ansID++) {
							answers.push({
								id: "",
								solution: "",
								text: "\\newline ",
								value: "",
								answerID: null,
							});
						}
					}
					question = {
						...question,
						instruction: element.instructions,
						instructionQuestionCount: element.instructionsQuestionCount,
					};
				}
			}
			if (paid) {
				if (question.resource) {
					let resourceStrip = "";
					if (question.resource.includes("img")) {
						const root = nodeParse.parse(question.resource.replace(/style="(.*?)"/gm, " "));
						let images = [];
						let imagesTags = root.getElementsByTagName("img");
						if (imagesTags.length > 0) {
							for (let index = 0; index < imagesTags.length; index++) {
								const img = imagesTags[index];
								let src = img.rawAttrs.trim();
								var filename = path.parse(String(src).slice(0, src.length - 1)).base;
								let srcs = src.split(" ");
								resourceStrip = String(srcs[0]).split('"')[1].replace('"', "").replace("https", "http").replace("www.", "");
								resourceList.push(resourceStrip);
							}
						}
					} else {
						resourceStrip = handleStripHTML(question.resource);
					}
					question = {
						...question,
						text: question.text ? String(question.text).trimStart() : null,
						qtype: question.qtype,
						resource: !foundResources.includes(resourceStrip) ? question.resource : "",
					};

					if (resourceStrip.length > 0 && foundResources.includes(resourceStrip) && lastPreambleIndex) {
						questionsWithData[lastPreambleIndex]["preambleQuestions"].push(i);
					}

					if (resourceStrip.length > 0 && !foundResources.includes(resourceStrip)) {
						foundResources.push(resourceStrip);
						lastPreambleIndex = i;
						question["preambleQuestions"] = [i];
					}
				} else {
					question = {
						...question,
						text: question.text ? String(question.text).trimStart() : null,
						qtype: question.qtype,
						resource: "",
					};
				}
			}
			const root = nodeParse.parse(question.text === null ? "" : question.text);
			let images = [];
			let imagesTags = root.getElementsByTagName("img");
			if (imagesTags.length > 0) {
				for (let index = 0; index < imagesTags.length; index++) {
					const img = imagesTags[index];
					let src = img.rawAttrs.trim();
					var filename = path.parse(String(src).slice(0, src.length - 1)).base;
					let srcs = src.split(" ");
					srcs = srcs.reverse();
					images.push(`\\newline


			    \\immediate\\write18{
			      wget  ${String(srcs[0]).split('"')[1].replace("https", "http")}
			    }

			  \\includegraphics{${filename.trim()}}
			`);
				}
			}
			// --no - check - certificate
			let structuredText = root.structuredText;
			structuredText = structuredText.replace(/\%/g, "\\%");
			structuredText = structuredText.replace(/\_/g, "\\_");

			// Remove erroneous newlines and ensure uniform linebreak
			let text = question?.text ? latexData(question.text) : "Answer the following questions";
			text = String(text).replaceAll("\\newline", "");
			text = text.replaceAll('insertline', '\\newline').trimEnd() + " \n\\newline";

			// console.log(`\nQuestion ${i + 1}: ${text.replaceAll('insertline', '\\newline')}`);

			question = {
				...question,
				text: text,
				qtype: question.qtype,
				resource: question.resource,
				answers: answers,
				marks: sectBlock.questionOverrides.filter((e) => e.id === questionID)[0]?.marks || sectBlock?.marksPerQuestion || 0,
			};

			questionsWithData.push({
				...question,
				qid: questionID,
				answers: answers,
			});

			resourceFinal = question.resource;
		}

		// Iterate through questions with data and generate latex
		for (let i = 0; i < questionsWithData.length; i++) {
			let questionOut = questionsWithData[i];

			let optionsOut = [];
			let options = ["A.", "B.", "C.", "D.", "E.", "F.", "G", "H."];

			let correctAnswer;
			for (let index = 0; index < questionOut.answers.length; index++) {
				let answer = questionOut.answers[index];
				// console.log(`\nQ${i + 1}. ${options[index].toLowerCase()} ${answer.solution}\n`)
				// Get overrides matching questions id
				const overrideBlock = sectBlock.questionOverrides.filter((e) => e.id == questionOut.qid);
				// Get overrides matching answer id
				const answerMark = overrideBlock[0]?.answerMarks?.filter((e) => e?.answerId == answer?.answerID)[0]?.marks;

				let essayOptionOut = `${
					answerMark
						? `${String(latexData(answer.text || "Answer the following questions")).replaceAll(
								"\\newline",
								""
						  )} \\newline \\rightline{[${answerMark} marks]} \\newline \\newline`
						: `${String(latexData(answer.text))} \\newline`
				} \\newline `;
				let optionOut =
					questionType !== "essay"
						? `${sectBlock.possibleAnswerOrientation === "vertical" ? "\\vspace{0.2cm}" : ""}${options[index]} ${
								paid
									? removeNewlines(
											latexData(answer.text, sectBlock.possibleAnswerOrientation !== "vertical" ? true : false),
											sectBlock.possibleAnswerOrientation === "vertical" ? true : false
									  )
									: `${sectBlock.possibleAnswerOrientation !== "vertical" ? "\\hspace{0.3cm}" : "\\newline "}`
						  }`
						: essayOptionOut;
				optionsOut.push(optionOut);
				if (answer.value === 1) {
					let essayCorrectAnswer;
					const alpha = questionType === "essay" ? options[index].toLowerCase() + " " : "";
					if (questionType !== "essay") {
						correctAnswer = `\\textbf{${options[index]} ${latexData(answer.text)}} ${
							paid ? ` ${answer.solution !== null ? latexData(answer.solution.replace(/  +/g, " ")) : ""}\\newline ` : ""
						}`;
					} else {
						const optionAnswer = `
							\\begin{quote}
							${paid ? ` ${answer.solution !== null ? latexData(alpha + answer.solution.replace(/  +/g, " ")) : ""}` : ""}
							\\end{quote}
							`;
						correctAnswer = (correctAnswer ? correctAnswer : "") + optionAnswer;
					}
				}
			}

			optionsOut = optionsOut.map((opt, idx) => {
				if (questionType === "essay") {
					const alpha = options[idx].toLocaleLowerCase();
					return `
						\\vspace{-8mm}
						\\begin{quote}
						${opt.substring(0, 3).match(/[a-z]\.\s?/) ? "" : alpha} ${opt}
						\\end{quote}
						${opt.indexOf("\\begin{tabular}") >= 0 ? "" : "\\vspace{-8mm}"}
						`;
				} else {
					return opt;
				}
			});
			optionsOut = optionsOut.join("");

			let preambleQuestionsString = "";
			let topicInstructions = "";

			if (questionOut?.instruction) {
				topicInstructions = ` ${latexData(questionOut.instruction)} \\newline \\newline
					The instructions above apply to question${questionOut?.instructionQuestionCount > 1 ? "s" : ""}
					${questionOut?.instructionQuestionCount > 1 ? `${i + 1} - ${i + questionOut?.instructionQuestionCount}` : `${i + 1}`}
					\\newline \\newline
					`;
			}

			if (questionOut?.preambleQuestions && questionOut?.preambleQuestions.length > 0) {
				preambleQuestionsString = "Use the above to answer questions: " + questionOut?.preambleQuestions?.map((e) => e + 1).join(", ");
			}

			let paidLatex = `${topicInstructions}${
				questionOut.resource
					? "\\newline" + latexData(questionOut.resource) + "\\newline " + preambleQuestionsString + "\\newline \\newline "
					: ""
			}  ${i + 1}. ${questionOut.text.replace(/  +/g, " ")} ${
				Number(questionOut?.marks) ? `\\rightline{[${questionOut.marks} marks]} \\newline \\newline` : ""
			} ${sectBlock?.possibleAnswerOrientation !== "none" ? optionsOut : "\\newline"} \\newline  \\newline`;

			latexForm.push(paidLatex);
			answerSheetLatex.push(i === 0 ? `${i + 1}. ${paid ? correctAnswer : ""}` : `\\newline ${i + 1}. ${paid ? correctAnswer : ""}`);
		}

		sectionslatexForm.push({
			section: String("SECTION " + sectionTitles[secblockID]).concat(
				Boolean(parseInt(sectBlock?.totalMarks)) ? ` [${sectBlock?.totalMarks} marks]` : ""
			),
			latexForm: latexForm.join("").replace(/  +/g, " "),
			questionType: questionType,
			sectionInstructions: `\\newline ${sectBlock.sectionInstructions} \\newline `,
		});
		answersheetLatexForm.push({
			section: "SECTION " + sectionTitles[secblockID],
			latexForm: answerSheetLatex.join("").replace(/  +/g, " "),
			questionType: questionType,
		});
		sections.push({
			section: sectionTitles[secblockID],
			questionIDs: sectquestionsID,
			questionType: questionType,
		});
		sectionswithData.push(questionsWithData);
	}

	const tempFilePath = path.join(os.tmpdir(), `${configId}.tex`);
	const tempFilePathpdf = path.join(os.tmpdir(), `${configId}.pdf`);
	const tempAnswerFilePath = path.join(os.tmpdir(), `${configId}.answer.tex`);
	const tempAnswerFilePathpdf = path.join(os.tmpdir(), `${configId}.answer.pdf`);

	const sectionsFinal = [];
	const answerSheetFinal = [];
	for (let join = 0; join < sectionslatexForm.length; join++) {
		const sectLatex = sectionslatexForm[join];
		sectionsFinal.push(
			sectLatex.questionType === "multiple"
				? `
									${join > 0 ? "\\pagebreak" : ""}
									\\begin{center} \\textbf{\\large ${sectLatex.section} } \\end{center}
									\\begin{center} \\textbf {\\large ${sectLatex.sectionInstructions} }\\end{center}
									\\vspace{0.5cm}

									 \\begin{multicols}{2} \\noindent  ${sectLatex.latexForm.replace(/((\s+\n)\\newline)/g, " \\newline").replace(/\&/g, "&")}\\end{multicols}
									`
				: `
								${join > 0 ? "\\pagebreak" : ""}
									\\begin{center} \\textbf{\\large ${sectLatex.section} } \\end{center}
									\\newline
									\\begin{center}
									\\textbf {\\large ${sectLatex.sectionInstructions} }\\end{center}
									\\vspace{0.5cm}     \\noindent ${sectLatex.latexForm.replace(/((\s+\n)\\newline)/g, " \\newline").replace(/\&/g, "&")}
									`
		);
	}
	for (let join = 0; join < answersheetLatexForm.length; join++) {
		const answerLatex = answersheetLatexForm[join];
		answerSheetFinal.push(
			answerLatex.questionType === "multiple"
				? `
									\\pagebreak \\begin{center}\\textbf{\\large ${
										answerLatex.section
									} ANSWER SHEET }  \\end{center} \\begin{center} Get more Questions and Answers from quizmine.africa | contact: info@quizmine.africa  \\end{center}   \\noindent ${answerLatex.latexForm
						.replace(/((\s+\n)\\newline)/g, " \\newline")
						.replace(/\&/g, "&")}

									`
				: `
									\\pagebreak \\begin{center}\\textbf{\\large ${
										answerLatex.section
									} ANSWER SHEET }  \\end{center} \\begin{center} Get more Questions and Answers from quizmine.africa | contact: info@quizmine.africa  \\end{center}     \\noindent ${answerLatex.latexForm
						.replace(/((\s+\n)\\newline)/g, " \\newline")
						.replace(/\&/g, "&")}
									`
		);
	}

	// Generate a set for unique question types
	let questionTypes = new Set();

	// Add 1 to set for objectives, 2 for essay/fill-in
	sections.forEach((section) => {
		questionTypes.add(section.questionType === "multiple" ? 1 : 2);
	});

	// Convert set to array
	questionTypes = [...questionTypes];

	// Check for selected template else use defaulr
	const foundIndex = templates?.findIndex((e) => e?.id === frontpage?.id);
	const templateIndex = foundIndex > -1 ? foundIndex : 0;

	let texdata = `
			${templates[templateIndex].generator({
				logoFileName,
				logoURL,
				examTitle,
				examDate,
				courseName,
				sectionType,
				schoolName,
				examInstructions,
				duration,
				questionTypes,
			})}
			${getUtfFixed(sectionsFinal.join(""))}
			  \\end{document}`;

	// fs.writeFileSync("exam.tex", texdata, () => {
	// 	console.log("exam.tex written");
	// });

	// Generate answer tex
	let answerTex = `\\documentclass{article}
		\\usepackage{geometry}
		\\usepackage[utf8]{inputenc}
		\\usepackage[T1]{fontenc}
		\\usepackage{textcomp}
		\\usepackage{amsmath}
		\\usepackage{amssymb}
		\\usepackage{soul}
		\\usepackage{graphicx}
		 \\geometry{
		 a4paper,
		 total={170mm,257mm},
		 left=20mm,
		 top=20mm,
		 }
		\\usepackage{booktabs}
		\\usepackage{array}
		\\usepackage{tabularx}
		\\usepackage{tabulary}
		\\usepackage{multicol}
		\\setlength{\\columnsep}{35pt}
		\\setlength{\\arrayrulewidth}{1mm}
		\\setlength{\\tabcolsep}{6pt}
		\\renewcommand{\\arraystretch}{2}
		\\begin{document}
		${getUtfFixed(answerSheetFinal.join(""))}
		\\end{document}
		`;

	// fs.writeFileSync("answer.tex", answerTex, () => {
	// 	console.log("answer.tex written");
	// });

	// Create temp file for question document
	fs.writeFile(
		tempFilePath,
		texdata,
		// `\\documentclass{article}\\usepackage{graphicx}\\usepackage{multicol} \\graphicspath{ {./images/} } \\begin{document}  \\begin{multicols}{2}\\noindent1. The polynomial is with a function and update to see what happens \\(f(x)=2x^3-4x^2+x-7\\) is divided by (x-1). Find the \\textbf{remainder} \\newline 2. What property of addition is defined by: (a + b) + c = a + (b + c)? \\newline \\newline 3. Express \\( \\frac{2}{3-\\sqrt 7}\\) in the form \\( a +\\sqrt b\\), where \\( a \\) and \\( b \\) are integers. \\newline 4. If \\(y=x^3-2x^2+1\\). Find \\(\\frac{dy}{dx}\\)\\newline \\newline 5. Find the local maximum value of the curve \\(y=x^3-3x^2\\) \\newline \\end{multicols} \\end{document}`,
		function (err) {
			if (err) throw err;
		}
	);

	// Create temp file for answer document
	fs.writeFile(tempAnswerFilePath, answerTex, function (err) {
		if (err) throw err;
	});

	const file_name = `generatorPreviews/${configId}.tex`;
	const file_name_pdf = `generatorPreviews/${configId}.pdf`;
	const answer_file_name = `generatorAnswerPreviews/${configId}.tex`;
	const answer_file_name_pdf = `generatorAnswerPreviews/${configId}.pdf`;

	const bucketName = `${projectId}.appspot.com`;
	// const bucket = storage.bucket(bucketName);
	// const bucket = storage.bucket();
	const bucket = firebaseStorage.bucket();

	const questionUploadPromise = async () => {
		const uploadResponse = await bucket.upload(tempFilePath, {
			destination: file_name,
			metadata: {
				contentType: "application/tex",
			},
			public: true,
		});

		let texFileUrl = `https://storage.googleapis.com/quizmine-dev.appspot.com/${file_name}`;
		await generatePDFfile(
			"https://quizmine-6wpyseomxa-uc.a.run.app/download",
			{
				url: texFileUrl,
				filename: `${configId}.tex`,
				paid: paid,
			},
			tempFilePathpdf,
			async () => {
				if (!paid) {
					logger.log("updating started");
					firestore()
						.collection("examConfiguration")
						.doc(configId)
						.update({
							questions: sections,
						})
						.then(() => {
							logger.log("topic questions sent");
						});
					logger.log("topic updating ended");

					// Flatten section question ids into an array
					const sectionQuestionIds = sections.map((section) => section.questionIDs);
					const flattenedSectionQuestionIds = sectionQuestionIds.flat(3);

					// Add questions to used questions sub collection
					if (userID) {
						await firestore()
							.collection("users")
							.doc(userID)
							.collection("usedQuestions")
							.doc(config.course)
							.set(
								{
									qids: firestore.FieldValue.arrayUnion(...flattenedSectionQuestionIds),
								},
								{
									merge: true,
								}
							);
					}
				} else {
				}
			},
			(error) => {
				logger.log("generating final error:", error);
			}
		);
		logger.log("Uploaded tex successfully to bucket");
	};

	const answerUploadPromise = async () => {
		const uploadResponse = await bucket.upload(tempAnswerFilePath, {
			destination: answer_file_name,
			metadata: {
				contentType: "application/tex",
			},
			public: true,
		});
		let texFileUrl = `https://storage.googleapis.com/quizmine-dev.appspot.com/${answer_file_name}`;
		await generatePDFfile(
			"https://quizmine-6wpyseomxa-uc.a.run.app/download-answer",
			{
				url: texFileUrl,
				filename: `${configId}.tex`,
				paid: paid,
			},
			tempAnswerFilePathpdf,
			async () => {
				logger.log("Answer tex doc uploaded");
			},
			(error) => {
				logger.log("generating final error:", error);
			}
		);
		logger.log("Uploaded answer tex successfully to bucket");
	};

	try {
		await Promise.all([questionUploadPromise(), answerUploadPromise()]);
		logger.log("Uploaded tex and answer tex successfully to bucket");
	} catch (error) {
		logger.log("Error uploading tex and answer tex to bucket", error);
	}

	return true;
};

const checkForResources = (resource) => {
	resource = resource.replace(/style="(.*?)"/gm, " ");
	const root = nodeParse.parse(resource);
	// let rawAttrs = root.childNodes[2].childNodes[0].rawAttrs;
	let images = [];
	let imagesTags = root.getElementsByTagName("img");
	if (imagesTags.length > 0) {
		for (let index = 0; index < imagesTags.length; index++) {
			const img = imagesTags[index];
			let src = img.rawAttrs;
			var filename = path.parse(String(img.rawAttrs).slice(0, img.rawAttrs.length - 1)).base;
			let srcs = src.split(" ");
			srcs = srcs.reverse();
			images.push(String(String(srcs[0]).split('"')[1]).replace("https", "http"));
		}
	}
	return images.join("");
};
