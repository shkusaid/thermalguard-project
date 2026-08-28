/**
 * Local development entry point. Starts a normal always-on server.
 * (For Vercel deployment, see api/index.js instead - Vercel runs the
 * Express app as a serverless function and does not use this file.)
 */
const app = require("./app");

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ThermoGuard backend running on http://localhost:${PORT}`);
});
