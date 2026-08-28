// Renders librechat.template.yaml -> librechat.yaml, substituting
// dollar-brace-name placeholders from the environment. LibreChat's own
// built-in placeholder resolution (librechat-data-provider's
// extractEnvVariable) is only wired up for a handful of fields in the
// currently published image and does NOT resolve mcpServers.*.url/oauth.* —
// confirmed by reading the shipped @librechat/api source
// (MCPServerInspector.inspect uses the raw config object directly, never
// routing it through the schema transform that would call
// extractEnvVariable). So we do the substitution ourselves, once, before
// LibreChat's own process starts.
const fs = require("fs");
const path = require("path");

const templatePath = path.join(__dirname, "librechat.template.yaml");
const outputPath = path.join(__dirname, "librechat.yaml");

const PLACEHOLDER = new RegExp("\\$\\{(\\w+)\\}", "g");

const template = fs.readFileSync(templatePath, "utf8");
const rendered = template.replace(PLACEHOLDER, (match, varName) => {
  const value = process.env[varName];
  if (value === undefined) {
    console.warn(`[librechat-render-config] ${varName} is not set — leaving "${match}" as a literal in librechat.yaml`);
    return match;
  }
  return value;
});

fs.writeFileSync(outputPath, rendered);
console.log(`[librechat-render-config] Wrote ${outputPath}`);
