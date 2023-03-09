const { firestore, logger, projectId, firebaseStorage } = require("../admin");
const { Storage } = require("@google-cloud/storage");
const cheerio = require("cheerio");
const { lowerCase } = require("lodash");
const fs = require("fs");
const docx = require("docx");
const path = require("path");
const os = require("os");
const { Buffer } = require("buffer");
const axios = require("axios").default;
var request = require("request");
const { DOMParser } = require("xmldom");
const imageSize = require("image-size");
const publicUrlBase = "https://storage.googleapis.com";
const mysql = require("mysql");
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
	status,
}) => {
	// getDataFromSQLdb(config, status === "paid", schoolLogoURL);
	getDataFromSQLdbSplit(config, status === "paid", schoolLogoURL);
	let timeStamp = new Date().getTime();
	let generatorPDFURL = "";
	return {
		generatorPDFURL,
		timeStamp,
	};
};

exports.createDownloadableMockDocx = async ({ schoolLogoURL, config, questions }) => {
	try {
		logger.log("create downloadable ran", schoolLogoURL);
		// const storage = new Storage();
		const storage = firebaseStorage;

		const bucketName = `${projectId}.appspot.com`;
		// const bucket = storage.bucket(bucketName);
		const bucket = storage.bucket();

		const { configId } = config;

		const file_name = `generatorDownloads/${configId}.docx`;

		const templater = async ({ config, questions }) => {
			try {
				const { sectionBlock } = config;

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
							// console.log("no");
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
								nonRepet.length > questionTotal
									? nonRepet.splice(0, questionTotal)
									: nonRepet.concat(repet.splice(0, questionTotal - nonRepet.length));
							let questionsIds = [];
							questionsToLoopOver.forEach((element) => {
								questionsIds.push(element.qid);
							});
							await this.saveUserGeneratedQuestions(
								{
									configId: config.configId,
									questions: questionsIds,
								},
								config.userId
							);
						} else {
							// console.log("yes");
							questionsToLoopOver = newQuestions.splice(0, questionTotal);
							let questionsIds = [];
							questionsToLoopOver.forEach((element) => {
								questionsIds.push(element.qid);
							});
							await this.saveUserGeneratedQuestions(
								{
									configId: config.configId,
									questions: questionsIds,
								},
								config.userId
							);
						}
					} else {
						logger.log("user not signed in", config.userId);
						questionsToLoopOver = newQuestions.splice(0, questionTotal);
					}

					if (questionType === "essay") {
						let numbers = 0;

						const children = [];

						questionsToLoopOver.forEach((q) => {
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

						renderSections.push(
							{
								children: [
									new docx.Paragraph({
										text: `SECTION ${sectionTitles[sectionIndex]}`,
										alignment: docx.AlignmentType.CENTER,
										style: "beginTest",
									}),
								],
							},
							{
								properties: {
									type: docx.SectionType.CONTINUOUS,
									column: {
										space: 708,
										count: 2,
									},
								},
								children,
							},
							{
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
							}
						);
					} else {
						let numbers = 0;

						questionsToLoopOver.forEach((q) => {
							numbers += 1;
							const answers = q.answers.map((a, idx) => {
								return new docx.TextRun({
									text: `\t${answerTitles[idx]}. ${handleStripHTML(a.text)} `,
									break: 1,
								});
							});
							const correctAnswer = q.answers
								.map((a, idx) => {
									return {
										...a,
										answerTitle: answerTitles[idx],
									};
								})
								.find((a) => {
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
											tabStops: [
												{
													type: docx.TabStopType.LEFT,
													position: 200,
												},
											],
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
											tabStops: [
												{
													type: docx.TabStopType.LEFT,
													position: 200,
												},
											],
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
										tabStops: [
											{
												type: docx.TabStopType.LEFT,
												position: 200,
											},
										],
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

						allAnswerSheet.push(
							{
								properties: {
									type: allAnswerSheet.length > 0 ? docx.SectionType.CONTINUOUS : docx.SectionType.NEXT_PAGE,
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
												text: "Get more ",
											}),
											new docx.TextRun({
												text: "Questions ",
												bold: true,
											}),
											new docx.TextRun({
												text: "and ",
											}),
											new docx.TextRun({
												text: "Answers ",
												bold: true,
											}),
											new docx.TextRun({
												text: "from ",
											}),
											new docx.TextRun({
												text: "quizmine.africa ",
												bold: true,
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
							},
							{
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
							}
						);

						renderSections.push(
							{
								children: [
									new docx.Paragraph({
										text: `SECTION ${sectionTitles[sectionIndex]}`,
										alignment: docx.AlignmentType.CENTER,
										style: "beginTest",
									}),
								],
							},
							{
								properties: {
									type: docx.SectionType.CONTINUOUS,
									column: {
										space: 708,
										count: 2,
									},
								},
								children,
							},
							{
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
							}
						);
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
			const { configId, examInstructions, course, examDate, examTitle, schoolName, sectionBlock } = config;

			const sections = await templater({
				config,
				questions,
			});
			return new Promise((resolve) => {
				let durationInHrs = 0;
				let sectionTypes = [];
				let sectionType = "";
				let courseName = course.includes("eng")
					? "English"
					: course.includes("math")
					? "Mathematics"
					: course.includes("sci")
					? "Science"
					: course.includes("rme")
					? "RME"
					: "";
				sectionBlock.forEach((it) => {
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
			timeStamp,
		};
	} catch (error) {
		logger.error(error);
		return false;
	}
};

const download = (uri, filename, callback) => {
	request.head(uri, () => {
		request(uri).pipe(fs.createWriteStream(filename)).on("close", callback);
	});
};

const generatePDFfile = async (uri, data, callback, error) => {
	// logger.log("generating pdf file with filename", filename);
	try {
		const response = await axios.post(uri, data, {});
		logger.log("post response", response.data);
		await callback("done");
	} catch (err) {
		error(err);
	}
};
// exports.downloadPdfFile = downloadPdfFile;
exports.generatePDFfile = generatePDFfile;

exports.download = download;

const returnDocument = (resolve, file_name, configId, bucket, docChildren, sections, schoolLogoURL = null) => {
	const doc = new docx.Document({
		styles: {
			paragraphStyles: [
				{
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
		sections: [
			{
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
					color: "000000",
				},
				bottom: {
					style: docx.BorderStyle.THICK,
					size: 20,
					color: "000000",
				},
				left: {
					style: docx.BorderStyle.THICK,
					size: 20,
					color: "000000",
				},

				right: {
					style: docx.BorderStyle.NONE,
					size: 0,
					color: "FFFFFF",
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
					color: "000000",
				},
				bottom: {
					style: docx.BorderStyle.THICK,
					size: 20,
					color: "000000",
				},

				left: {
					style: docx.BorderStyle.NONE,
					size: 0,
					color: "FFFFFF",
				},
				right: {
					style: docx.BorderStyle.THICK,
					size: 20,
					color: "000000",
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
					color: "FFFFFF",
				},
				bottom: {
					style: docx.BorderStyle.NONE,
					size: 0,
					color: "FFFFFF",
				},

				right: {
					style: docx.BorderStyle.NONE,
					size: 0,
					color: "FFFFFF",
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
						color: "FFFFFF",
					},
					bottom: {
						style: docx.BorderStyle.NONE,
						size: 0,
						color: "FFFFFF",
					},
					left: {
						style: docx.BorderStyle.NONE,
						size: 0,
						color: "FFFFFF",
					},

					right: {
						style: docx.BorderStyle.NONE,
						size: 0,
						color: "FFFFFF",
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
					bold: true,
				}),
				new docx.TextRun({
					text: examTitle ? `\t\t${examTitle}\t`.toUpperCase() : "",
					bold: true,
				}),
				new docx.TextRun({
					text: `\t\t${durationInHrs.toFixed(1)} HOURS`,
					bold: true,
				}),
			],
			tabStops: [
				{
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
			children: [
				new docx.TextRun({
					text: "EXAMINATION INSTRUCTION",
					bold: true,
				}),
			],
		}),
		new docx.Paragraph({
			alignment: docx.AlignmentType.CENTER,
			children: [
				new docx.TextRun({
					text: `${examInstructions || ""}`,
					bold: true,
				}),
			],
		}),
	];
};
const saveUserGeneratedQuestions = async (data, userId) => {
	const docRef = firestore().collection("users").doc(userId).collection("generated").doc(data.configId);
	await docRef.set(
		{
			id: docRef.id,
			...data,
		},
		{
			merge: true,
		}
	);
	logger.log("saveUserGeneratedQuestions should ran");
};
exports.saveUserGeneratedQuestions = saveUserGeneratedQuestions;
const handleMath_TextStyle = (html, number_option, showOption, imgR) => {
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
					
					textRun.push(
						element[x].childNodes[y].nodeValue !== null
							? new docx.TextRun({
									text: String(element[x].childNodes[y].nodeValue),
									italics: element[x].tagName.toUpperCase() === "I" || element[x].tagName.toUpperCase() === "EM",
									bold: element[x].tagName.toUpperCase() === "STRONG" || element[x].tagName.toUpperCase() === "B",
							  })
							: element[x].tagName.toLowerCase() === "img"
							? new docx.ImageRun({
									data: image(element[x].getAttribute("class")),
									// data: img,
									transformation: {
										width: imgDim(image(element[x].getAttribute("class"))).width,
										height: imgDim(image(element[x].getAttribute("class"))).height,
									},
							  })
							: new docx.TextRun({
									text: element[x].childNodes[y].textContent,
									italics: element[x].tagName.toUpperCase() === "I" || element[x].tagName.toUpperCase() === "EM",
									bold: element[x].tagName.toUpperCase() === "STRONG" || element[x].tagName.toUpperCase() === "B",
							  })
					);
				}
			} else {
				// if (element[x].children.length === 0) {
				textRun.push(
					element[x].tagName.toLowerCase() === "img"
						? new docx.ImageRun({
								data: image(element[x].getAttribute("class")),
								// data: img,
								transformation: {
									width: imgDim(image(element[x].getAttribute("class"))).width,
									height: imgDim(image(element[x].getAttribute("class"))).height,
								},
						  })
						: new docx.TextRun({
								text: element[x].textContent,
								italics: element[x].tagName.toUpperCase() === "I" || element[x].tagName.toUpperCase() === "EM",
								bold: element[x].tagName.toUpperCase() === "STRONG" || element[x].tagName.toUpperCase() === "B",
						  })
				);
			}
		}

		return new docx.Paragraph({

			tabStops: [
				{
					type: docx.TabStopType.LEFT,
					position: 200,
				},
			],
			spacing: {
				after: 200,
			},
			children: [
				...textRun,
			],
		});
	} catch (error) {
		logger.log("error in handleMath text: ", error);
	}
};
exports.handleMath_TextStyle = handleMath_TextStyle;
const getDataFromSQLdb = (config, paid) => {
	const { configId, examInstructions, course, examDate, examTitle, schoolName, sectionBlock } = config;

	let duration = 0;
	let sectionTypes = [];
	let sectionType = "";
	let courseName = course.includes("eng")
		? "English"
		: course.includes("math")
		? "Mathematics"
		: course.includes("sci")
		? "Science"
		: course.includes("rme")
		? "RME"
		: "";
	for (let index = 0; index < sectionBlock.length; index++) {
		const sect = sectionBlock[index];
		duration += sect.sectionDuration / 60;
		sectionTypes.push(sect.questionType === "multiple" ? "Objectives" : sect.questionType === "essay" ? "Essay" : "fill in");
	}
	sectionTypes = [...new Set(sectionTypes)];
	sectionType = sectionTypes.join(" \\& ");

	const connection = mysql.createConnection({
		host: "35.193.48.99",
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
			nestTables: true,
		};

		let query = true
			? `SELECT questions.id,questions.text,questions.resource,questions.qtype,answers.text AS answer,answers.value,answers.solution,courses.id AS course_id,courses.courseID FROM questions,answers,courses WHERE questions.id=answers.question_id AND questions.course_id=courses.id AND courses.courseID='${config.course}' AND questions.public=1`
			: `SELECT questions.id,questions.text,questions.qtype,courses.courseID,courses.id AS course_id FROM questions,courses WHERE questions.course_id=courses.id AND courses.courseID='${config.course}' AND questions.text > ''`;

		logger.log("query:", query);
		connection.query(query, options, async function (err, result, fields) {
			if (err) throw err;
			logger.log("fields:", fields);
			logger.log(
				"section Block should come:",
				sectionBlock,
				result.length,
				typeof result[0],
				"row should have come:",
				result,
				result[0],
				result[0]
				// qids[0]
			);
			let sections = [];
			const sectionTitles = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
			let usedQuestions = [];
			let repet = [];
			let usedQues = [];
			if (config.userId !== undefined && config.userId !== null && config.userId.length > 0) {
				if (config.repetition !== undefined && config.repetition === "no") {
					const generated = await firestore().collection("users").doc(config.userId).collection("generated").get();
					if (!generated.empty) {
						generated.forEach((gen) => {
							usedQues = usedQues.concat(gen.data().questions);
							// logger.log(gen.data().questions)
						});
					}
					logger.log("used question: ", generated.size, usedQues.length, config.userId);
					usedQues = [...new Set(usedQues)];
				} else {
					logger.log("not to repeat");
				}
			}
			logger.log("repeated question:", repet, result.length, result[0]);
			if (config.status === "draft") {
				for (let secblockID = 0; secblockID < sectionBlock.length; secblockID++) {
					const sectBlock = sectionBlock[secblockID];
					let questionsID = [];
					let questionType = lowerCase(sectBlock.questionType);
					logger.log("question type", questionType);
					for (let index = 0; index < result.length; index++) {
						const relEl = result[index];
						if (lowerCase(relEl.qtype) === "essay" && questionType === "essay") {
							logger.log(
								" essay ran:",
								sectionTitles[secblockID],
								questionType === "essay",
								lowerCase(relEl.qtype) === "essay",
								lowerCase(relEl.qtype)
							);
						}

						if (questionType === "essay") {
							if (lowerCase(relEl.qtype) === "essay") {
								questionsID.push(relEl.id);
							}
						} else {
							questionsID.push(relEl.id);
						}
					}
					questionsID = [...new Set(questionsID)];
					logger.log("question ids of essay:", questionsID.length, questionsID);
					logger.log("question ids:", questionsID.length, questionsID);
					const availableQuestion = questionsID;

					questionsID = questionsID.filter((q) => !usedQues.includes(q));
					questionsID = questionsID.filter((item) => !usedQuestions.includes(item));
					let questionTotal = sectBlock.questionTotal;
					let questionToUse =
						questionsID.length > sectBlock.questionTotal
							? questionsID.slice(0, questionTotal)
							: questionsID.concat(availableQuestion.slice(0, questionTotal));
					// let questionToUse =  questionsID.slice(0, questionTotal)
					logger.log(
						"questions to use sliced:",
						questionToUse,
						questionToUse.length,
						questionsID.length,
						questionsID.length > sectBlock.questionTotal
					);
					usedQuestions = [...usedQuestions, ...questionToUse];

					sections.push({
						section: sectionTitles[secblockID],
						questionIDs: questionToUse,
						questionType: questionType,
					});
				}
				if (config.userId !== undefined && config.userId !== null && config.userId.length > 0) {
					logger.log("user generated question save:", sections, usedQuestions, config.configId, config.userId);
					await saveUserGeneratedQuestions(
						{
							configId: config.configId,
							questions: usedQuestions,
						},
						config.userId
					);
				}
				await firestore().collection("examConfiguration").doc(configId).set(
					{
						questions: sections,
					},
					{
						merge: true,
					}
				);
			} else {
				let examConfig = await firestore().collection("examConfiguration").doc(configId).get();
				sections = examConfig.data().questions;
			}
			logger.log("newSection to use:", sections);
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
						if (String(questionID) === String(element.id)) {
							question = {
								text: element.text ? String(element.text).trimStart() : null,
								qtype: element.qtype,
								resource: element.resource ? String(element.resource).trimStart() : null,
							};
							// if (true) {
							answers.push({
								id: element.id,
								solution: element.solution ? String(element.solution).trimStart() : null,
								text: element.answer ? String(element.answer).trimStart() : null,
								value: sectEl.questionType.toLowerCase() === "essay" ? 1 : element.value,
							});
							if (sectEl.questionType.toLowerCase() === "essay") {
								logger.log("solution check:", element, element.solution, typeof element.solution);
							}
						}
					}
					logger.log("question before error:", question);
					// var path = require("path");
					const root = nodeParse.parse(question.text === null ? "" : question.text);
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
			      wget ${String(srcs[0]).split('"')[1].replace("https", "http")}
			    }

			  \\includegraphics{${filename.trim()}}
			`);
						}
					}

					let structuredText = root.structuredText;
					structuredText = structuredText.replace(/\%/g, "\\%");
					structuredText = structuredText.replace(/\_/g, "\\_");
					let text = latexData(question.text);
					question = {
						text: text,
						qtype: question.qtype,
						resource: question.resource,
					};
					logger.log("text:", text, question);

					let optionsOut = [];
					let options = ["A.", "B.", "C.", "D.", "E.", "F.", "G", "H."];

					let correctAnswer;
					for (let index = 0; index < answers.length; index++) {
						let answer = answers[index];
						let essayOptionOut = `${latexData(answer.text)}\\newline `;
						let optionOut =
							sectEl.questionType !== "essay" ? `\\newline\\indent ${options[index]}${paid ? latexData(answer.text) : ""}` : essayOptionOut;
						optionsOut.push(optionOut);
						if (answer.value === 1) {
							correctAnswer = `\\textbf{${sectEl.questionType !== "essay" ? options[index] : ""} ${
								sectEl.questionType !== "essay" ? latexData(answer.text) : ""
							}} ${paid ? ` ${answer.solution !== null ? latexData(answer.solution.replace(/  +/g, " ")) : ""}\\newline` : ""}`;
						}
					}
					optionsOut = optionsOut.join("");
					let resource =
						i > 0
							? ` ${
									question.resource !== null &&
									questionsWithData[i - 1].resource !== undefined &&
									questionsWithData[i - 1].resource !== null &&
									questionsWithData[i - 1].resource !== question.resource
										? latexData(question.resource) + "\\newline "
										: ""
							  } `
							: "";

					questionsWithData.push({
						...question,
						qid: questionID,
						answers: answers,
					});
					latexForm.push(
						sectEl.questionType !== "essay"
							? i === 0
								? `${question.resource !== null ? latexData(question.resource) + "\\newline " : ""} ${i + 1}.${text.replace(
										/  +/g,
										" "
								  )}  ${sectEl.questionType === "essay" ? "" : optionsOut}`
								: ` ${resource}\\newline ${i + 1}.${text.replace(/  +/g, " ")}  ${
										sectEl.questionType === "essay" ? "" : optionsOut
								  }\\newline `
							: i === 0
							? `${i + 1}. ${text.replace(/  +/g, " ")}  ${sectEl.questionType !== "essay" ? "" : optionsOut} `
							: `${i + 1}. ${text.replace(/  +/g, " ")} ${text.length > 2 ? `\\newline ` : ""} ${
									sectEl.questionType === "essay" ? optionsOut : ""
							  }\\newline `
					);
					answerSheetLatex.push(i === 0 ? `${i + 1}.${paid ? correctAnswer : ""}` : `\\newline ${i + 1}.${paid ? correctAnswer : ""}`);
				}
				sectionslatexForm.push({
					section: "SECTION " + sectEl.section,
					latexForm: latexForm.join("").replace(/  +/g, " "),
					questionType: sectEl.questionType,
				});
				answersheetLatexForm.push({
					section: "SECTION " + sectEl.section,
					latexForm: answerSheetLatex.join("").replace(/  +/g, " "),
					questionType: sectEl.questionType,
				});
				sectionswithData.push(questionsWithData);
			}


			const tempFilePath = path.join(os.tmpdir(), `${configId}.tex`);
			const tempFilePathpdf = path.join(os.tmpdir(), `${configId}.pdf`);

			logger.log("before axios ran: ");

			const sectionsFinal = [];
			const answerSheetFinal = [];
			for (let join = 0; join < sectionslatexForm.length; join++) {
				const sectLatex = sectionslatexForm[join];
				sectionsFinal.push(
					sectLatex.questionType === "multiple"
						? `
									\\pagebreak  \\begin{center} \\textbf{\\large ${sectLatex.section} } \\end{center}    \\begin{multicols}{2} \\noindent ${sectLatex.latexForm}\\end{multicols}  
									`
						: `
									\\pagebreak  \\begin{center} \\textbf{\\large ${sectLatex.section} } \\end{center}     \\noindent ${sectLatex.latexForm}
									`
				);
			}
			for (let join = 0; join < answersheetLatexForm.length; join++) {
				const answerLatex = answersheetLatexForm[join];
				answerSheetFinal.push(
					answerLatex.questionType === "multiple"
						? `
									\\pagebreak \\begin{center}\\textbf{\\large ${answerLatex.section} ANSWER SHEET }  \\end{center} \\begin{center} Get more Questions and Answers from quizmine.africa | contact: info@quizmine.africa  \\end{center}    \\begin{multicols}{2} \\noindent ${answerLatex.latexForm} \\end{multicols}  

									`
						: `
									\\pagebreak \\begin{center}\\textbf{\\large ${
										answerLatex.section
									} ANSWER SHEET }  \\end{center} \\begin{center} Get more Questions and Answers from quizmine.africa | contact: info@quizmine.africa  \\end{center}     \\noindent ${answerLatex.latexForm.replace(
								/((\s+\n)\\newline)/g,
								" \\newline"
						  )} 
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
			${
				true
					? `\\begin{tabular}{  m{5em}  }


			    \\immediate\\write18{
			      wget https://storage.googleapis.com/quizmine-dev.appspot.com/logos/YPL11WYDWP.jpg
			    }

			  \\includegraphics[width=20mm,scale=1]{YPL11WYDWP.jpg}

			\\end{tabular}`
					: ``
			}
				\\begin{tabular}{ | m{5cm}  m{3cm}|  }

				\\hline
					
				\\parbox[m]{10cm}{\\vspace*{8pt} \\textbf{\\large ${examTitle}}\\newline ${examDate}\\newline ${courseName}\\newline ${sectionType}\\newline  ${duration.toFixed(
				1
			)} hours \\vspace*{4pt}} & \\hspace*{0.5cm} {\\textbf{\\huge 2 \\& 1}} \\\\
					
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
			${examDate} \\hfill ${examTitle} \\hfill ${duration.toFixed(1)}HOURS
			\\begin{center}
			${examInstructions}
			\\end{center}
			${getUtfFixed(sectionsFinal.join(""))} \\pagebreak 
						${getUtfFixed(answerSheetFinal.join(""))}
			  \\end{document}`;

			fs.writeFile(
				tempFilePath,
				texdata,
				function (err) {
					if (err) throw err;
					// console.log("Saved!");
				}
			);
			try {
				const file_name = `generatorPreviews/${configId}.tex`;
				const file_name_pdf = `generatorPreviews/${configId}.pdf`;
				const bucket = firebaseStorage.bucket();


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

						generatePDFfile(
							"https://quizmine-6wpyseomxa-uc.a.run.app/download",
							{
								url: `https://storage.googleapis.com/quizmine-dev.appspot.com/generatorPreviews/${configId}.tex`,
								filename: `${configId}.tex`,
								paid: paid,
							},
							tempFilePathpdf,
							async () => {
								logger.log("file downloaded:pdf version");
								var files = fs.readdirSync("/tmp");
								logger.log("files in temp:", files);
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
		connection.end();
	});
};
exports.getDataFromSQLdb = getDataFromSQLdb;


function setLatexFractions(text) {
    const regex1 = /\<sup\>([^\<\/sup\>]+)\<\/sup\>\/\<sub\>([^\<\/sub\>]+)\<\/sub\>/g;
    const regex2 = /\<sup\>([^\<\/sup\>]+)\<\/sup\>\<strong\>\/\<\/strong\>\<sub\>([^\<\/sub\>]+)\<\/sub\>/g;
    const regex3 = /([^\<\/sup\>]+)\/([^\<\/sub\>]+)/g;
    let copyText = text;
    return copyText.replace(regex1, "$\\frac{$1}{$2}$")
    .replace(regex2, "$\\frac{$1}{$2}$")
    .replace(regex3, "$\\frac{$1}{$2}$");
}
exports.setLatexFractions = setLatexFractions;

const latexData = (text, noNewline) => {
	// const root = nodeParse.parse(text);
	text = text === null || text === undefined ? "" : text;

	if (text.includes("<table>")) {
		text = text.replace(/<br>/g, "\\newline");
	}
	text = text.replace(/<\/p>/g, "</p>\\newline ");
	text = text.replace(/style="(.*?)"/gm, " ");
	text = text.replace(/<\/table>/g, "");
	text = text.replace(/<table>/g, "");
	let cellCount = Math.round((text.match(/<td>/g) || []).length / 2);
		
	let cells = [];
	for (let index = 0; index < cellCount; index++) {
		cells.push("|X");
	}

	text = text.replace(/<tbody>/g, `insertline insertline \\vspace{0.9cm}\\begin{tabularx}{\\linewidth}{${cells.join("")}|}`);
	text = text.replace(/<\/tbody>/g, " \\hline \\end{tabularx} insertline");
	text = text.replace(/<tr>/g, "\\hline ");
	text = text.replace(/<\/tr>/g, "\\\\");
	text = text.replace(/<td>/g, "");
	text = text.replace(/<\/td>/g, "&");
	// text = text.replace(/& \\/g, "\\")
	text = text.replace(/(&(\s+)\\)/g, "\\");

	// console.log(que);
	const root = nodeParse.parse(text);

	// let rawAttrs = root.childNodes[2].childNodes[0].rawAttrs;
	// console.log(root.childNodes[2]);
	let content = [];
	let fix_listKeys = Object.keys(fix_list);
	for (let index = 0; index < root.childNodes.length; index++) {
		const element = root.childNodes[index];
		if (element.childNodes.length > 0) {
			for (let i2 = 0; i2 < element.childNodes.length; i2++) {
				const element2 = element.childNodes[i2];
				if (element2.childNodes.length > 0) {
					for (let i3 = 0; i3 < element2.childNodes.length; i3++) {
						let element3 = element2.childNodes[i3];
						if (element3.rawTagName && element3.rawTagName === "img") {
							// console.log("element 3 image");
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
							element3.rawTagName && element3.rawTagName === "sub"
								? fix_listKeys.includes(rawText.trim()) || rawText === "\\newline "
									? rawText
									: `$_{${rawText}}$`
								: element3.rawTagName && element3.rawTagName === "sup"
								? fix_listKeys.includes(rawText.trim()) || rawText === "\\newline "
									? rawText
									: `$^{${rawText}}$`
								: element3.rawTagName && element3.rawTagName === "u"
								? `\\ul{${rawText}}`
								: element3.rawTagName && (element3.rawTagName === "b" || element3.rawTagName === "strong")
								? `\\textbf{${rawText}}`
								: element3.rawTagName && (element3.rawTagName === "i" || element3.rawTagName === "em")
								? `\\textit{${rawText}}`
								: element3.rawTagName && element3.rawTagName === "br" && content[content.length - 1] !== "\\newline "
								? "\\newline "
								: element3.rawTagName && element3.rawTagName === "img"
								? `
    \\immediate\\write18{
      wget ${String(srcs[0]).split('"')[1].replace(/  +/g, "").replace("https", "http")}
    }
  
  \\includegraphics[width=70mm,scale=1]{${filename.replace('"', "").replace(/  +/g, "").trim()}}
`
								: rawText;
						let parentTag3 = element3.parentNode;
						ele3 =
							parentTag3.rawTagName && parentTag3.rawTagName === "sub"
								? fix_listKeys.includes(rawText.trim()) || rawText === "\\newline "
									? ele3
									: ele3.length && ele3.length > 0
									? `$_{${ele3}}$`
									: ""
								: parentTag3.rawTagName && parentTag3.rawTagName === "sup"
								? fix_listKeys.includes(rawText.trim()) || rawText === "\\newline "
									? ele3
									: ele3.length && ele3.length > 0
									? `$^{${ele3}}$`
									: ""
								: parentTag3.rawTagName && parentTag3.rawTagName === "u"
								? `\\ul{${ele3}}`
								: parentTag3.rawTagName && (parentTag3.rawTagName === "b" || parentTag3.rawTagName === "strong")
								? `\\textbf{${ele3}}`
								: parentTag3.rawTagName && (parentTag3.rawTagName === "i" || parentTag3.rawTagName === "strong")
								? `\\textit{${rawText}}`
								: parentTag3.rawTagName && parentTag3.rawTagName === "br" && content[content.length - 1] !== "\\newline "
								? "\\newline "
								: ele3;
						content.push(ele3);
					}
				} else {
					if (element2.rawTagName && element2.rawTagName === "img") {
						// console.log("element 2 image");

						var img = element2;
						var src = element2.rawAttrs;
						let srcs = src.split(" ");
						srcs = srcs.reverse();
						src = srcs[0] ? srcs[0] : element2.rawAttrs;
						var filename = path.parse(String(img.rawAttrs).slice(0, img.rawAttrs.length - 1)).base;
						// console.log("src split", String(src).split('"')[1]);
					}
					let rawText = element2.rawText;
					rawText = rawText.replace(/\%/g, "\\%");
					rawText = rawText.replace(/\_/g, "\\_");
					content.push(
						element2.rawTagName && element2.rawTagName === "sub"
							? fix_listKeys.includes(rawText.trim()) || rawText === "\\newline "
								? rawText
								: rawText.length && rawText.length > 0
								? `$_{${rawText}}$`
								: ""
							: element2.rawTagName && element2.rawTagName === "sup"
							? fix_listKeys.includes(rawText.trim()) || rawText === "\\newline "
								? rawText
								: rawText.length && rawText.length > 0
								? `$^{${rawText}}$`
								: ""
							: element2.rawTagName && (element2.rawTagName === "b" || element2.rawTagName === "strong")
							? `\\ul{${rawText}}`
							: element2.rawTagName && (element2.rawTagName === "i" || element2.rawTagName === "strong")
							? `\\textit{${rawText}}`
							: element2.rawTagName && element2.rawTagName === "br" && content[content.length - 1] !== "\\newline "
							? "\\newline "
							: element2.rawTagName && element2.rawTagName === "img"
							? `
    \\immediate\\write18{
      wget  ${String(src).split('"')[1].replace(/  +/g, "").replace("https", "http")}
    }
  
  \\includegraphics[width=70mm,scale=1]{${filename.replace('"', "").replace(/  +/g, "").trim()}}
`
							: rawText
					);
				}
			}
		} else {
			if (element.rawTagName && element.rawTagName === "img") {
				// console.log("element 2 image");

				var img = element;
				var src = element.rawAttrs;
				let srcs = src.split(" ");
				srcs = srcs.reverse();
				src = srcs[0] ? srcs[0] : element.rawAttrs;
				var filename = path.parse(String(img.rawAttrs).slice(0, img.rawAttrs.length - 1)).base;
				// console.log("src split", String(src).split('"')[1]);
			}
			let rawText = element.rawText;
			rawText = rawText.replace(/\%/g, "\\%");
			rawText = rawText.replace(/\_/g, "\\_");
			content.push(
				element.rawTagName && element.rawTagName === "sub"
					? fix_listKeys.includes(rawText.trim()) || rawText === "\\newline "
						? rawText
						: rawText.length && rawText.length > 0
						? `$_{${rawText}}$`
						: ""
					: element.rawTagName && element.rawTagName === "sup"
					? fix_listKeys.includes(rawText.trim()) || rawText === "\\newline "
						? rawText
						: rawText.length && rawText.length > 0
						? `$^{${rawText}}$`
						: ""
					: element.rawTagName && (element.rawTagName === "b" || element.rawTagName === "strong")
					? `\\ul{${rawText}}`
					: element.rawTagName && (element.rawTagName === "i" || element.rawTagName === "strong")
					? `\\textit{${rawText}}`
					: element.rawTagName && element.rawTagName === "br" && content[content.length - 1] !== "\\newline "
					? "\\newline "
					: element.rawTagName && element.rawTagName === "img"
					? `
    \\immediate\\write18{
      wget ${String(src).split('"')[1].replace(/  +/g, "").replace("https", "http")}
    }
  
  \\includegraphics[width=70mm,scale=1]{${filename.replace('"', "").replace(/  +/g, "").trim()}}
`
					: rawText
			);
		}
	}

	// Remove newline for horizontal questions
	if (noNewline && content[content.length - 1] === "\\newline ") {
		content.pop();
		content.push("\\hspace{0.3cm} ");
	}

	return content
		.join("")
		.replace(/  +/g, " ")
		.replace(/\^\\newline/g, " ")
		.replace(/\_\\newline/g, " ");
};

exports.latexData = latexData;

let fix_list = {
	// 3 char errors first
	"â€š": ",",
	"â€ž": "„",
	"â€¦": "…",
	"â€¡": "‡",
	"â€°": "‰",
	"â€¹": "<",
	"â€˜": "'",
	"â€™": "'",
	"â€œ": "“",
	"â€¢": "•",
	"â€“": "-",
	"â€”": "-",
	"â„¢": "™",
	"â€º": ">",
	"â‚¬": "€",
	"â‰¤": "≤",
	"â‰¥": "≥",
	"â‰": "≠",
	"&nbsp;": "~",
	"&rarr;": "→",
	"&lt;": "<",
	"&amp;": "\\&",
	"&gt;": ">",
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
			// console.log(element, key);
			const regexp = new RegExp(`${key}`, "g");
			text = String(text).replace(regexp, element);
		}
	}

	return text;
};
exports.getUtfFixed = getUtfFixed;

const getDataFromSQLdbSplit = async (config, paid) => {
	const { configId, examInstructions, course, examDate, examTitle, schoolName, sectionBlock } = config;
	let duration = 0;
	let sectionTypes = [];
	let sectionType = "";
	let courseName = course.includes("eng")
		? "English"
		: course.includes("math")
		? "Mathematics"
		: course.includes("sci")
		? "Science"
		: course.includes("rme")
		? "RME"
		: "";
	for (let index = 0; index < sectionBlock.length; index++) {
		const sect = sectionBlock[index];
		duration += sect.sectionDuration / 60;
		sectionTypes.push(sect.questionType === "multiple" ? "Objectives" : sect.questionType === "essay" ? "Essay" : "fill in");
	}
	const sectionTitles = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

	const connection = mysql.createConnection({
		// host: "35.193.48.99",
		host: "ls-34b2d287391c710a200f00b7bad1d6280174084a.cdxrjrnw1pwd.eu-west-2.rds.amazonaws.com",
		user: "dbmasteruser",
		password: "O8,XU~W6$cNPZBW=Ua7AFx71ItZ%!s8g",
		database: "ecoach",
		port: 3306,
	});
	connection.connect(async function (err) {
		if (err) {
			console.error("error connecting: " + err.stack);
			// return err;
		}
		let usedQues = [];
		if (config.userId !== undefined && config.userId !== null && config.userId.length > 0) {
			if (config.repetition !== undefined && config.repetition === "no") {
				const generated = await firestore().collection("users").doc(config.userId).collection("generated").get();
				if (!generated.empty) {
					generated.forEach((gen) => {
						usedQues = usedQues.concat(gen.data().questions);
						// logger.log(gen.data().questions)
					});
				}
				logger.log("used question: ", generated.size, usedQues.length, config.userId);
				usedQues = [...new Set(usedQues)];
			} else {
				logger.log("not to repeat");
			}
		}
		let questionsID = [];
		const sectionswithData = [];
		const sectionslatexForm = [];
		const answersheetLatexForm = [];
		let sections = [];
		let finalPdfQuestions = [];
		if (paid) {
			let examConfig = await firestore().collection("examConfiguration").doc(configId).get();
			finalPdfQuestions = examConfig.data().questions;
		}
		for (let secblockID = 0; secblockID < sectionBlock.length; secblockID++) {
			const sectBlock = sectionBlock[secblockID];
			let questionType = lowerCase(sectBlock.questionType);
			const questionsWithData = [];
			const answerSheetLatex = [];

			let query = `SELECT questions.id,questions.text,questions.resource,questions.qtype ${
				paid || questionType === "essay" ? ",answers.text AS answer,answers.value,answers.solution," : ","
			} courses.id AS course_id,courses.courseID FROM questions${paid || questionType === "essay" ? ",answers" : ""},courses WHERE ${
				config.status === "draft" && usedQues.length > 0
					? `questions.id NOT IN (${usedQues.join(",")}) AND`
					: paid
					? `questions.id IN (${finalPdfQuestions[secblockID].questionIDs.join(",")}) AND`
					: ""
			} questions.qtype="${questionType === "multiple" ? "SINGLE" : "ESSAY"}" ${
				paid || questionType === "essay" ? "AND questions.id=answers.question_id" : ""
			} AND questions.course_id=courses.id AND courses.courseID='${config.course}' AND questions.public=1 ${
				config.status === "draft" ? "LIMIT " + sectBlock.questionTotal : ""
			}`;

			logger.log("query for split:", query);
			console.log('\nSplit query ids from utils:', finalPdfQuestions[secblockID].questionIDs.join(","))
			const result = await getDataWithQuery(query, connection);
			logger.log("Split data each:", result.length, result);

			const latexForm = [];

			let sectquestionsID = [];
			for (let qind = 0; qind < result.length; qind++) {
				const element = result[qind];
				questionsID.push(element.id);
				sectquestionsID.push(element.id);
			}
			sectquestionsID = [...new Set(sectquestionsID)];

			let resourceFinal = "";
			let foundResources = [];
			for (let i = 0; i < sectquestionsID.length; i++) {
				const questionID = sectquestionsID[i];
				let answers = [];
				let question;
				for (let index = 0; index < result.length; index++) {
					const element = result[index];
					if (String(questionID) === String(element.id)) {
						if (element.resource) {
							let resourceStrip = handleStripHTML(element.resource);
							question = {
								text: element.text ? String(element.text).trimStart() : null,
								qtype: element.qtype,
								resource: !foundResources.includes(resourceStrip) ? element.resource : "",

							};
							foundResources.push(handleStripHTML(element.resource));

						} else {
							question = {
								text: element.text ? String(element.text).trimStart() : null,
								qtype: element.qtype,
								resource: "",
							};
						}

						logger.log("foundResources", foundResources, element.resource);
						if (paid || questionType === "essay") {
							answers.push({
								id: element.id,
								solution: element.solution !== null ? String(element.solution).trimStart() : null,
								text: element.answer !== null ? String(element.answer).trimStart() : null,
								value: questionType.toLowerCase() === "essay" ? 1 : element.value,
							});
						} else {
							for (let ansID = 0; ansID < 4; ansID++) {
								answers.push({
									id: "",
									solution: "",
									text: "",
									value: "",
								});
							}
						}
					}
				}
				const root = nodeParse.parse(question.text === null ? "" : question.text);
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
			      wget  ${String(srcs[0]).split('"')[1].replace("https", "http")}
			    }

			  \\includegraphics{${filename.trim()}}
			`);
					}
				}
				let structuredText = root.structuredText;
				structuredText = structuredText.replace(/\%/g, "\\%");
				structuredText = structuredText.replace(/\_/g, "\\_");
				let text = latexData(question.text);
				question = {
					text: text,
					qtype: question.qtype,
					resource: question.resource,
				};
				logger.log("text:", text, question);

				let optionsOut = [];
				let options = ["A.", "B.", "C.", "D.", "E.", "F.", "G", "H."];

				let correctAnswer;
				for (let index = 0; index < answers.length; index++) {
					let answer = answers[index];
					let essayOptionOut = `${latexData(answer.text)}\\newline `;
					let optionOut =
						questionType !== "essay" ? `\\newline\\indent ${options[index]}${paid ? latexData(answer.text) : ""}` : essayOptionOut;
					optionsOut.push(optionOut);
					if (answer.value === 1) {
						correctAnswer = `\\textbf{${questionType !== "essay" ? options[index] : ""} ${
							questionType !== "essay" ? latexData(answer.text) : ""
						}} ${paid ? ` ${answer.solution !== null ? latexData(answer.solution.replace(/  +/g, " ")) : ""}\\newline ` : ""}`;
					}
				}
				let resource = "";
				optionsOut = optionsOut.join("");
				if (i > 0) {
					logger.log(
						"resource:",
						question.resource !== null,
						questionsWithData[questionsWithData.length - 1].resource !== null,
						questionsWithData[i - 1].resource !== question.resource
					);
					logger.log("type of:", typeof question.resource);
					logger.log("type of", typeof questionsWithData[i - 1].resource);
				}
				logger.log(
					"resource:",
					resource,
					"question resource:",
					question.resource,
					":previous:resource:",
					i > 0 ? questionsWithData[i - 1].resource : "previous resource",
					questionsWithData.length
				);
				questionsWithData.push({
					...question,
					// qtype: question.qtype,
					// text: text,
					qid: questionID,
					answers: answers,
				});
				resourceFinal = question.resource;
				latexForm.push(
					questionType !== "essay"
						? i === 0
							? `${question.resource ? latexData(question.resource) + "\\newline " : ""} ${i + 1}.${text.replace(/  +/g, " ")}  ${
									questionType === "essay" ? "" : optionsOut
							  }`
							: ` ${question.resource ? `${latexData(question.resource)}\\newline ` : ""} ${i + 1}.${text.replace(/  +/g, " ")}  ${
									questionType === "essay" ? "" : optionsOut
							  }\\newline `
						: i === 0
						? `${i + 1}. ${text.replace(/  +/g, " ")}  ${questionType !== "essay" ? "" : optionsOut} `
						: `${i + 1}. ${text.replace(/  +/g, " ")} ${text.length > 2 ? `\\newline ` : ""} ${
								questionType === "essay" ? optionsOut : ""
						  }\\newline `
				);
				answerSheetLatex.push(i === 0 ? `${i + 1}.${paid ? correctAnswer : ""}` : `\\newline ${i + 1}.${paid ? correctAnswer : ""}`);
			}
			sectionslatexForm.push({
				section: "SECTION " + sectionTitles[secblockID],
				latexForm: latexForm.join("").replace(/  +/g, " "),
				questionType: questionType,
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
			logger.log("for each section:", latexForm.length, answersheetLatexForm.length);
			// }
		}

		const tempFilePath = path.join(os.tmpdir(), `${configId}.tex`);
		const tempFilePathpdf = path.join(os.tmpdir(), `${configId}.pdf`);
		logger.log("check for sections", sectionslatexForm, answersheetLatexForm, sectionswithData.length, questionsID);
		const sectionsFinal = [];
		const answerSheetFinal = [];
		for (let join = 0; join < sectionslatexForm.length; join++) {
			const sectLatex = sectionslatexForm[join];
			sectionsFinal.push(
				sectLatex.questionType === "multiple"
					? `
									\\pagebreak  \\begin{center} \\textbf{\\large ${
										sectLatex.section
									} } \\end{center} \\begin{multicols}{2} \\noindent ${sectLatex.latexForm.replace(
							/((\s+\n)\\newline)/g,
							" \\newline"
					  )}\\end{multicols}  
									`
					: `
									\\pagebreak  \\begin{center} \\textbf{\\large ${sectLatex.section} } \\end{center} \\noindent ${sectLatex.latexForm.replace(
							/((\s+\n)\\newline)/g,
							" \\newline"
					  )}
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
									} ANSWER SHEET }  \\end{center} \\begin{center} Get more Questions and Answers from quizmine.africa | contact: info@quizmine.africa  \\end{center}    \\begin{multicols}{2} \\noindent ${answerLatex.latexForm.replace(
							/((\s+\n)\\newline)/g,
							" \\newline"
					  )} \\end{multicols}  

									`
					: `
									\\pagebreak \\begin{center}\\textbf{\\large ${
										answerLatex.section
									} ANSWER SHEET }  \\end{center} \\begin{center} Get more Questions and Answers from quizmine.africa | contact: info@quizmine.africa  \\end{center}     \\noindent ${answerLatex.latexForm.replace(
							/((\s+\n)\\newline)/g,
							" \\newline"
					  )} 
									`
			);
		}
		let texdata = `\\documentclass{article}
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
			\\usepackage{multicol}
			\\setlength{\\columnsep}{35pt}
			\\setlength{\\arrayrulewidth}{1mm} 
			\\setlength{\\tabcolsep}{6pt} 
			\\renewcommand{\\arraystretch}{2} 
			\\begin{document}
			${
				true
					? `\\begin{tabular}{  m{5em}  }


			    \\immediate\\write18{
			      wget https://storage.googleapis.com/quizmine-dev.appspot.com/logos/YPL11WYDWP.jpg
			    }

			  \\includegraphics[width=20mm,scale=1]{YPL11WYDWP.jpg}

			\\end{tabular}`
					: ``
			}
				\\begin{tabular}{ | m{5cm}  m{3cm}|  }

				\\hline
					
				\\parbox[m]{10cm}{\\vspace*{8pt} \\textbf{\\large ${examTitle}}\\newline ${examDate}\\newline ${courseName}\\newline ${sectionType}\\newline  ${duration.toFixed(
			1
		)} hours \\vspace*{4pt}} & \\hspace*{0.5cm} {\\textbf{\\huge 2 \\& 1}} \\\\
					
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
			${examDate} \\hfill ${examTitle} \\hfill ${duration.toFixed(1)}HOURS
			\\begin{center}
			${examInstructions}
			\\end{center}
			${getUtfFixed(sectionsFinal.join(""))} \\pagebreak 
						${getUtfFixed(answerSheetFinal.join(""))}
			  \\end{document}`;

		fs.writeFile(
			tempFilePath,
			texdata,
			function (err) {
				if (err) throw err;
				// console.log("Saved!");
			}
		);
		try {
			const file_name = `generatorPreviews/${configId}.tex`;
			const file_name_pdf = `generatorPreviews/${configId}.pdf`;
			// const bucket = storage.bucket(bucketName);
			// const bucket = storage.bucket();
			const bucket = firebaseStorage.bucket();


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

					generatePDFfile(
						"https://quizmine-6wpyseomxa-uc.a.run.app/download",
						{
							url: `https://storage.googleapis.com/quizmine-dev.appspot.com/generatorPreviews/${configId}.tex`,
							filename: `${configId}.tex`,
							paid: paid,
						},
						tempFilePathpdf,
						async () => {
							logger.log("file downloaded:pdf version");
							var files = fs.readdirSync("/tmp");
							logger.log("files in temp:", files);
							if (!paid) {
								logger.log("updating started");
								firestore()
									.collection("examConfiguration")
									.doc(configId)
									.set(
										{
											questions: sections,
										},
										{
											merge: true,
										}
									)
									.then(() => {
										logger.log("questions sent");
									});
								logger.log("updating ended");
							}
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
};

const getDataWithQuery = (query, connection) => {
	return new Promise((resolve, reject) => {
		// console.log("connected as id in new format " + connection.threadId);
		// resolve(connection.threadId)
		var options = {
			sql: "...",
			nestTables: true,
		};

		connection.query(query, options, function (err, result) {
			if (err) {
				console.log("sql err", err);
				reject({
					status: "error",
					message: err,
				});
			}

			resolve(result);
		});
	});
};

const getDataWithPool = (query, connectionPool) => {
	return new Promise((resolve, reject) => {
		connectionPool.query(query, (err, result) => {
			if (err) {
				console.log("err from ", query);
				console.log("sql err", err);
				reject({
					status: "error",
					message: err,
				});
			}

			resolve(result);
		});
	});
};

const getCoursesFromDB = async () => {
	let courses = [];
	try {
		const collectionRef = firestore().collection('qm_courses');
		const docs = await collectionRef.get();
		docs.forEach(doc => {
			courses.push(doc.data())
		});
		return courses;
	} catch(error) {
		throw error;
	}
}

exports.getDataWithPool = getDataWithPool;
exports.getDataWithQuery = getDataWithQuery;
exports.getCoursesFromDB = getCoursesFromDB;
