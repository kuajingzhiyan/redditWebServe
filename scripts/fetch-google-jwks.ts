import { fetchAndSaveGoogleJwks } from "../src/utils/google.js";

await fetchAndSaveGoogleJwks();
console.log("Google JWKS cached to .cache/google-oauth-jwks.json");
