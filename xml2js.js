const fs = require("fs");
const xml2js = require("xml2js");

// read your XML file
const xml = fs.readFileSync("icons.xml", "utf8");

// configure parser
const parser = new xml2js.Parser({
  explicitArray: false, // don’t wrap every element in an array
  mergeAttrs: true, // bring attributes up into the object
});

parser.parseString(xml, (err, result) => {
  if (err) throw err;

  fs.writeFileSync(
    "./js/static/icons.js",
    `export default ${JSON.stringify(result.rules.rule, null, 2)};`
  );
});
