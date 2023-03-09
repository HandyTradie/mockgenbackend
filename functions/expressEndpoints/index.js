const functions = require("firebase-functions");
const { firestore } = require('../admin');
const mysql = require("mysql");

const express = require("express");
const cors = require("cors");
const { getDataWithQuery, getCoursesFromDB, latexData, handleStripHTML, getUtfFixed } = require("../utils");

const app = express();

// Automatically allow cross-origin requests
app.use(
	cors({
		origin: "*",
	})
);

// build multiple CRUD interfaces:
app.get("/fetchTopics/:courseID", async (req, res) => {
	let courseID = req.params.courseID;
	if (courseID) {
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
			}

			console.log("connected as id " + connection.threadId);
			
			let queries = [
				{
					qtype: "ESSAY",
					query: `select courseName, courseID,
count(id) num_q, count(distinct id) num_q_d

from (
select q.id, c.name courseName,c.courseID courseID from questions q
inner join (
select distinct qzi.question_id from quiz_items qzi
inner join quizzes qz on qz.id = qzi.quiz_id and qz.public = 1  and qz.type = 'ESSAY' 
) qzq on qzq.question_id = q.id
inner join courses c on c.id = q.course_id and c.courseID = '${courseID}' and c.public = 1
) s
group by courseName 
order by num_q desc`,
				},
				{
					query: `select c.name course_name,c.courseID ,q.course_id, t.name topic, q.topic_id,  count(*) as num_q 
from questions q left join courses c on c.id = q.course_id
left join topics t on t.id = q.topic_id
where q.text > '' and not q.resource > '' and q.public = 1
and c.courseID = '${courseID}' and c.public = 1
and t.name is not NULL and t.public = 1
group by q.course_id, q.topic_id order by num_q desc `,
					qtype: "SINGLE",
				},
			];
			try {
				let results = [];
				for (let index = 0; index < queries.length; index++) {
					const element = queries[index];
					const result = await getDataWithQuery(element.query, connection);

					let data = result;
					results.push({
						data: data,
						qtype: element.qtype,
					});
				}

				res.send({
					connectionId: connection.threadId,
					status: "success",
					result: results,
				});
				connection.end();
			} catch (error) {
				console.log("error:", error, ":");
				res.sendStatus(400).send({
					message: error,
					status: "error",
				});
				connection.end();
			}
		});
	} else {
		res.sendStatus(400).send({
			message: "Provide course id",
		});
	}
});

app.get("/courses", async (req, res) => {
	// const connection = mysql.createConnection({
	// 	// host: "35.193.48.99",
	// 	host: "ls-34b2d287391c710a200f00b7bad1d6280174084a.cdxrjrnw1pwd.eu-west-2.rds.amazonaws.com",
	// 	user: "dbmasteruser",
	// 	password: "O8,XU~W6$cNPZBW=Ua7AFx71ItZ%!s8g",
	// 	database: "ecoach",
	// 	port: 3306,
	// });
	// connection.connect(async function (err) {
	// 	if (err) {
	// 		console.error("error connecting: " + err.stack);
	// 	}

	// 	console.log("connected as id " + connection.threadId);
	// 	let query = `SELECT DISTINCT courses.id,courses.name,courses.courseID,courses.description,courses.package_code FROM courses WHERE courses.public=1`;
	// 	console.log("query:", query);
	try {
		// const result = await getDataWithQuery(query, connection);
		const result = await getCoursesFromDB();
		let data = result;
		// console.log('results', data)
		res.send({
			// connectionId: connection.threadId,
			status: "success",
			result: data,
		});
		// connection.end();
	} catch (error) {
		res.sendStatus(400).send({
			message: error,
			status: "error",
		});
		// connection.end();
	}
	// });
});

app.get("/fetchTopicQuestions/:topicID", async (req, res) => {
	let topicID = req.params.topicID;
	const { limit = 10, qtype, courseID } = req.query;

	if (!topicID) return res.status(400).send("Missing topic id");

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
		}

		try {
			// Fetch course id from course name
			// const courseQuery = `SELECT id FROM courses WHERE courseID='${courseID}'`;

			let courseResult = await getCoursesFromDB();
			courseResult = courseResult.map(course => ({ id: course.id }));
			console.log('Course result', courseResult)
			
			const dbCourseID = courseResult[0].id;
			const query = `SELECT DISTINCT questions.id,questions.course_id,questions.topic_id,questions.text,questions.QTYPE FROM \`questions\` where topic_id='${topicID}' and questions.public=1 and questions.text > '' and questions.course_id=${dbCourseID}  and not questions.resource > '' ${
				qtype ? `AND QTYPE=${qtype}` : ""
			} LIMIT ${limit}`;

			const result = await getDataWithQuery(query, connection);

			// Clear up latex data
			const data = result.map((res) => ({
				...res,
				clean: getUtfFixed(handleStripHTML(res.text)),
				latex: latexData(res.text, false),
			}));

			res.send({
				connectionId: connection.threadId,
				status: "success",
				results: data,
			});
			connection.end();
		} catch (error) {
			console.log("fetch error", error);

			res.sendStatus(400).send({
				message: error,
				status: "error",
			});
			connection.end();
		}
	});
});

app.get("/fetchCourseQuestions/:courseID", async (req, res) => {
	let courseID = req.params.courseID;
	const { limit = 10, qtype = "ESSAY" } = req.query;

	if (!courseID) return res.status(400).send("Missing course id");

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
		}

		let questionsQuery = `select id, text as question_text, resource   
		from (
		select q.id id, c.name courseName,c.courseID courseID,q.text text,q.resource resource from questions q
		
		inner join (
		select distinct qzi.question_id from quiz_items qzi
		inner join quizzes qz on qz.id = qzi.quiz_id and qz.public = 1  and qz.type = 'ESSAY' 
		) qzq on qzq.question_id = q.id
		inner join courses c on c.id = q.course_id and c.courseID = '${courseID}'
		) s ORDER BY RAND() LIMIT ${limit}`;

		console.log("\nquestions query\n", questionsQuery);

		try {
			let questions = await getDataWithQuery(questionsQuery, connection);
			let ids = questions.map((res) => res.id);

			// Get answers for questions
			let answersQuery = `select id as answer_id,question_id,text,value,solution from answers where question_id in (${ids.join(",")})`;
			let answers = await getDataWithQuery(answersQuery, connection);

			// Replace latex and special characters
			questions = questions.map((res) => ({
				...res,
				question_text: String(getUtfFixed(handleStripHTML(res?.question_text))).trim(),
				resource: String(getUtfFixed(handleStripHTML(res?.resource))).trim(),
			}));

			answers = answers.map((res) => ({
				...res,
				text: String(getUtfFixed(handleStripHTML(res?.text))).trim(),
				solution: String(getUtfFixed(handleStripHTML(res?.solution))).trim(),
			}));

			// Map answers to questions
			let mappedAnswers = answers.reduce((acc, cur) => {
				let question = acc.find((q) => q.id === cur.question_id);
				if (question) {
					question.answers = question.answers || [];
					question.answers.push(cur);
				}
				return acc;
			}, questions);

			res.send({
				connectionId: connection.threadId,
				status: "success",
				results: mappedAnswers,
			});
			connection.end();
		} catch (error) {
			console.log("fetch error", error);

			res.sendStatus(400).send({
				message: error,
				status: "error",
			});
			connection.end();
		}
	});
});

// Expose Express API as a single Cloud Function:
exports.api = functions.https.onRequest(app);
