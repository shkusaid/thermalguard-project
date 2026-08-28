/**
 * Vercel serverless entry point. Vercel automatically treats any file in
 * /api as a serverless function; exporting the Express app here lets the
 * whole app run as one function, with vercel.json routing all paths to it.
 */
module.exports = require("../app");
