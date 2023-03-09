require("./admin"); // don't remove

const callables = require("./callables");
const { api } = require("./expressEndpoints");
const triggers = require("./triggers");

module.exports = {
	...triggers,
	...callables,
	api
};
