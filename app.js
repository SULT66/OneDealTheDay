// Bluehost cPanel / Phusion Passenger entry point.
// Register the SEO homepage before src/server adds express.static().
const express = require("express");
const renderHomepage = require("./src/homepage");
const createExpressApp = express;

function expressWithHomepage(...args) {
  const app = createExpressApp(...args);
  app.get("/", renderHomepage);
  return app;
}

Object.assign(expressWithHomepage, createExpressApp);
require.cache[require.resolve("express")].exports = expressWithHomepage;
require("./src/server");
